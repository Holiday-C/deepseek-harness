import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentCancelCause, AgentStatus, InboxTarget } from '@deepseek-ai/dsh-agent'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import JobsLocal from '@deepseek-ai/dsh-jobs-local'
import type { JobOutcome } from '@deepseek-ai/dsh-jobs'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { createScope } from '@deepseek-ai/dsh-scope'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as AppRestart from '../src/index.ts'

const signal = new AbortController().signal
const contexts: Context[] = []

interface StubAgent {
  readonly agent: Agent
  setStatus(status: AgentStatus): void
  settleIdle(): void
  rejectIdle(error: Error): void
}

/** Create one scope-correct registry agent with controllable quiescence. */
function stubAgent(scopeOwner: Context, rawId: string): StubAgent {
  const session = Session.create(SessionId(rawId))
  let status: AgentStatus = 'running'
  let idle = Promise.withResolvers<undefined>()
  const mutable = {
    id: session.id,
    options: {},
    session,
    inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
    get status() { return status },
    ctx: undefined as unknown as Context,
    send(_message: UserMessage, _target: InboxTarget, _wakeup: boolean) {},
    followup(_message: UserMessage) {},
    steer(_message: UserMessage) {},
    inject(_message: UserMessage) {},
    cancel(_cause: AgentCancelCause) {},
    runMaintenance: task => task(signal),
    whenIdle: () => idle.promise,
  } satisfies Agent
  const agent: Agent = mutable
  const scope = createScope(scopeOwner, agent)
  mutable.ctx = scope.ctx.extend({ agent })
  return {
    agent,
    setStatus(value) {
      status = value
      if (value === 'running') idle = Promise.withResolvers<undefined>()
    },
    settleIdle() {
      status = 'idle'
      idle.resolve(undefined)
    },
    rejectIdle(error) {
      status = 'idle'
      idle.reject(error)
    },
  }
}

async function harness(config: AppRestart.Config = { requireApproval: false }) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(JobsLocal)
  let scopeOwner: Context | undefined
  await ctx.plugin({
    inject: ['tools'],
    apply(pluginCtx) { scopeOwner = pluginCtx },
  })
  if (scopeOwner === undefined) throw new Error('test scope owner did not mount')
  const restart = vi.fn()
  provideCmdline(ctx, { args: [], exit: () => {}, restart })
  const root = stubAgent(scopeOwner, `restart-root-${Math.random()}`)
  ctx.agents.register(root.agent)
  const fiber = await ctx.plugin(AppRestart, config)
  return { ctx, root, restart, fiber }
}

async function execute(ctx: Context, agent: Agent): Promise<ToolExecutionResult> {
  return ctx.agents.withInitiator(agent, () => ctx.tools.execute({
    signal,
    callId: ToolCallId(`restart-call-${Math.random()}`),
    name: 'restart_dsh',
    arguments: {},
    agent,
  }))
}

afterEach(async () => {
  await Promise.allSettled(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

describe('restart_dsh', () => {
  it('commits only after the successful result concludes its agent turn', async () => {
    const test = await harness()
    test.ctx.emit('agent/created', { agent: test.root.agent })
    expect(test.ctx.tools.get('restart_dsh', test.root.agent)?.presentCall?.({}))
      .toEqual({ card: 'generic', title: 'Restart DSH', kind: 'other' })
    const result = await execute(test.ctx, test.root.agent)

    expect(result).toMatchObject({
      isError: false,
      value: { status: 'restart-pending' },
      concludesTurn: true,
    })
    expect(test.restart).not.toHaveBeenCalled()

    test.root.settleIdle()
    await Promise.resolve()
    await Promise.resolve()
    expect(test.restart).toHaveBeenCalledOnce()
  })

  it('asks for approval by default and reserves nothing when none is available', async () => {
    const test = await harness({})
    const result = await execute(test.ctx, test.root.agent)

    expect(result.isError).toBe(true)
    expect(result.content).toEqual([{
      type: 'text',
      text: 'Error: Restart DSH and briefly disconnect Web clients.',
    }])
    test.root.settleIdle()
    await Promise.resolve()
    expect(test.restart).not.toHaveBeenCalled()
  })

  it('installs only on roots and refuses a concurrent agent', async () => {
    const test = await harness()
    const child = stubAgent(test.root.agent.ctx, 'restart-child')
    const detachChild = test.ctx.agents.enter(child.agent, test.root.agent)
    test.ctx.agents.announce(child.agent)
    expect(test.ctx.tools.get('restart_dsh', child.agent)).toBeUndefined()
    detachChild()

    const other = stubAgent(test.root.agent.ctx, 'restart-other')
    test.ctx.agents.register(other.agent)
    expect(test.ctx.tools.get('restart_dsh', other.agent)).toBeDefined()
    const result = await execute(test.ctx, test.root.agent)
    expect(result.error?.info?.code).toBe('APP_RESTART_BUSY')

    other.settleIdle()
    child.settleIdle()
    test.root.settleIdle()
  })

  it('refuses a live background job', async () => {
    const test = await harness()
    const done = Promise.withResolvers<JobOutcome>()
    test.ctx.jobs.attachController('app-restart-test')
    test.ctx.jobs.start({
      kind: 'bash',
      label: 'build',
      owner: test.root.agent,
      run: () => ({ cancel: () => { done.resolve({ status: 'killed' }) }, done: done.promise }),
    })

    const result = await execute(test.ctx, test.root.agent)
    expect(result.error?.info?.code).toBe('APP_RESTART_BUSY')

    done.resolve({ status: 'completed' })
    await done.promise
    await Promise.resolve()
    expect((await execute(test.ctx, test.root.agent)).isError).toBe(false)
    test.root.settleIdle()
  })

  it('refuses a background job that is stopping', async () => {
    const test = await harness()
    const done = Promise.withResolvers<JobOutcome>()
    test.ctx.jobs.attachController('app-restart-stopping-test')
    const id = test.ctx.jobs.start({
      kind: 'bash',
      label: 'build',
      owner: test.root.agent,
      run: () => ({ cancel: () => {}, done: done.promise }),
    })
    expect(test.ctx.jobs.kill(id, test.root.agent)).toBe('requested')

    const result = await execute(test.ctx, test.root.agent)
    expect(result.error?.info?.code).toBe('APP_RESTART_BUSY')

    done.resolve({ status: 'killed' })
    test.root.settleIdle()
  })

  it('cancels the reservation when new work starts before quiescence', async () => {
    const test = await harness()
    const other = stubAgent(test.root.agent.ctx, 'restart-race')
    other.settleIdle()
    test.ctx.agents.register(other.agent)

    expect((await execute(test.ctx, test.root.agent)).isError).toBe(false)
    other.setStatus('running')
    test.root.settleIdle()
    await Promise.resolve()
    await Promise.resolve()
    expect(test.restart).not.toHaveBeenCalled()

    other.settleIdle()
    test.root.setStatus('running')
    expect((await execute(test.ctx, test.root.agent)).isError).toBe(false)
  })

  it('cancels an unsettled reservation when its agent scope is disposed', async () => {
    const test = await harness()
    expect((await execute(test.ctx, test.root.agent)).isError).toBe(false)
    await test.fiber.dispose()

    test.root.settleIdle()
    await Promise.resolve()
    expect(test.restart).not.toHaveBeenCalled()
  })

  it('contains quiescence rejection after plugin disposal cancelled the request', async () => {
    const test = await harness()
    expect((await execute(test.ctx, test.root.agent)).isError).toBe(false)
    await test.fiber.dispose()

    test.root.rejectIdle(new Error('disposed idle failed'))
    await Promise.resolve()
    expect(test.restart).not.toHaveBeenCalled()
  })

  it('cancels when final result policy rejects the successful body', async () => {
    const test = await harness()
    test.root.agent.ctx.on('tools/post-execute', async (exec, _result, next) => {
      if (exec.name !== 'restart_dsh') return next()
      return { kind: 'block', feedback: [{ type: 'text', text: 'restart blocked after execution' }] }
    })

    const result = await execute(test.ctx, test.root.agent)
    expect(result.isError).toBe(true)
    test.root.settleIdle()
    await Promise.resolve()
    expect(test.restart).not.toHaveBeenCalled()
  })

  it('cancels when agent quiescence rejects', async () => {
    const test = await harness()
    expect((await execute(test.ctx, test.root.agent)).isError).toBe(false)
    test.root.rejectIdle(new Error('idle failed'))
    await Promise.resolve()
    await Promise.resolve()
    expect(test.restart).not.toHaveBeenCalled()
  })

  it('contains a launcher commit failure and releases its reservation', async () => {
    const test = await harness()
    test.restart.mockImplementationOnce(() => { throw new Error('launcher unavailable') })
    expect((await execute(test.ctx, test.root.agent)).isError).toBe(false)
    test.root.settleIdle()
    await Promise.resolve()
    await Promise.resolve()

    test.root.setStatus('running')
    expect((await execute(test.ctx, test.root.agent)).isError).toBe(false)
  })

  it('fails loud when mounted without a restart-capable launcher', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(JobsLocal)

    expect(() => { AppRestart.apply(ctx, {}) })
      .toThrow('the launcher must provide ctx.appRestart')
  })

  it('defaults direct application to approval required', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(JobsLocal)
    let scopeOwner: Context | undefined
    await ctx.plugin({
      inject: ['tools'],
      apply(pluginCtx) { scopeOwner = pluginCtx },
    })
    if (scopeOwner === undefined) throw new Error('test scope owner did not mount')
    provideCmdline(ctx, { args: [], exit: () => {}, restart: () => {} })
    const root = stubAgent(scopeOwner, 'restart-direct-default')
    ctx.agents.register(root.agent)
    AppRestart.apply(ctx, {})

    expect((await execute(ctx, root.agent)).isError).toBe(true)
    root.settleIdle()
  })
})

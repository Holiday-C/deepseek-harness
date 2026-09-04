/** Model-facing restart handoff for supervisor-launched DSH applications. */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { AppRestart, AppRestartRequest } from '@deepseek-ai/dsh-cmdline'
import type {} from '@deepseek-ai/dsh-jobs'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import z from '@deepseek-ai/schemastery'
import { defineTool, type PreToolDecision, type ToolExecution } from '@deepseek-ai/dsh-tools'

/** Cordis function-plugin name. */
export const name = 'app-restart'
/** Host services required before restart tools can be installed. */
export const inject = ['agents', 'appRestart', 'jobs', 'tools']

/** User-confirmation policy for the restart tool. */
export interface Config {
  /** Ask for one user approval before scheduling a restart. */
  requireApproval?: boolean
}

/** Schemastery configuration for restart policy. */
export const Config: z<Config> = z.object({
  requireApproval: z.boolean().default(true),
})

interface PendingRestart {
  readonly agent: Agent
  readonly request: AppRestartRequest
}

const TOOL_NAME = 'restart_dsh'
const RESTART_DESCRIPTION = 'Restart the supervised DSH Web application after an update or rebuild has completed successfully. '
  + 'Use this only after required checks pass. The current Web connection disconnects briefly and reconnects to the new process.'

/** Whether any other execution resource makes process replacement unsafe. */
function busyReason(ctx: Context, requestingAgent: Agent, includeRequestingAgent: boolean): string | undefined {
  const runningAgent = ctx.agents.list().find(agent =>
    agent.status === 'running' && (includeRequestingAgent || agent !== requestingAgent))
  if (runningAgent !== undefined) return `agent ${JSON.stringify(runningAgent.id)} is still running`

  for (const caller of [undefined, ...ctx.agents.list()] as const) {
    for (const job of ctx.jobs.list(caller)) {
      if (job.status === 'running' || job.status === 'stopping') {
        return `background job ${JSON.stringify(job.id)} is still ${job.status}`
      }
    }
  }
  return undefined
}

/** Install one root agent's scoped tool and approval policy. */
function installForAgent(
  ctx: Context,
  agent: Agent,
  restart: AppRestart,
  requireApproval: boolean,
  pendingByExecution: WeakMap<ToolExecution, PendingRestart>,
  pending: Set<PendingRestart>,
): () => void | Promise<void> {
  return agent.ctx.effect(() => {
    const disposeTool = agent.ctx.tools.register(defineTool({
      name: TOOL_NAME,
      description: RESTART_DESCRIPTION,
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            status: { type: 'string', required: true, enum: ['restart-pending'] },
          },
        },
        render: (_args, _value) => [{
          type: 'text',
          text: 'DSH restart requested. It will proceed after this turn if the application remains idle.',
        }],
      },
      presentCall: () => ({ card: 'generic', title: 'Restart DSH', kind: 'other' }),
      async execute(_args, exec) {
        const reason = busyReason(ctx, agent, false)
        if (reason !== undefined) {
          throw new HarnessError(`DSH cannot restart while ${reason}`, 'APP_RESTART_BUSY')
        }
        const state = { agent, request: restart.prepare() }
        pendingByExecution.set(exec, state)
        pending.add(state)
        exec.concludeTurn()
        return Promise.resolve({ status: 'restart-pending' as const })
      },
    }))
    const disposeApproval = agent.ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
      const downstream = await next()
      if (!requireApproval || exec.name !== TOOL_NAME || downstream.kind !== 'allow') return downstream
      return { kind: 'ask', reason: 'Restart DSH and briefly disconnect Web clients.' }
    })
    return () => {
      for (const state of pending) {
        if (state.agent !== agent) continue
        state.request.cancel()
        pending.delete(state)
      }
      disposeApproval()
      disposeTool()
    }
  }, 'app-restart.agent()')
}

/**
 * Install restart tools on every current and future top-level agent.
 * @param ctx - host context carrying the launcher and application registries.
 * @param config - approval policy for every installed restart tool.
 */
export function apply(ctx: Context, config: Config): void {
  const restart = ctx.get('appRestart')
  if (restart === undefined) {
    throw new Error('app-restart: the launcher must provide ctx.appRestart before the tree mounts')
  }
  const requireApproval = config.requireApproval ?? true
  const installed = new Map<Agent, () => void | Promise<void>>()
  const pendingByExecution = new WeakMap<ToolExecution, PendingRestart>()
  const pending = new Set<PendingRestart>()
  const install = (agent: Agent): void => {
    if (installed.has(agent) || !ctx.agents.roots().includes(agent)) return
    installed.set(agent, installForAgent(ctx, agent, restart, requireApproval, pendingByExecution, pending))
  }

  for (const agent of ctx.agents.roots()) install(agent)
  ctx.on('agent/created', ({ agent }) => { install(agent) })
  ctx.on('agent/disposed', ({ agent }) => {
    const cleanup = installed.get(agent)
    if (cleanup === undefined) return
    installed.delete(agent)
    void cleanup()
  })
  ctx.on('tools/result', (exec, result) => {
    const state = pendingByExecution.get(exec)
    if (state === undefined) return
    pendingByExecution.delete(exec)
    if (result.isError) {
      state.request.cancel()
      pending.delete(state)
      return
    }
    void state.agent.whenIdle().then(() => {
      if (!pending.delete(state)) return
      const reason = busyReason(ctx, state.agent, true)
      if (reason !== undefined) {
        state.request.cancel()
        ctx.logger.warn(`app-restart: cancelled restart because ${reason}`)
        return
      }
      try {
        state.request.commit()
      } catch (error: unknown) {
        ctx.logger.warn(`app-restart: launcher rejected restart commit: ${String(error)}`)
      }
    }, (error: unknown) => {
      if (!pending.delete(state)) return
      state.request.cancel()
      ctx.logger.warn(`app-restart: cancelled restart because agent quiescence failed: ${String(error)}`)
    })
  })
  ctx.effect(() => async () => {
    for (const state of pending) state.request.cancel()
    pending.clear()
    const cleanups = [...installed.values()]
    installed.clear()
    await Promise.allSettled(cleanups.map(cleanup => Promise.resolve(cleanup())))
  }, 'app-restart.pending()')
}

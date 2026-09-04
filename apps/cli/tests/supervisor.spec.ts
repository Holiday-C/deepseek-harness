import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import {
  APP_RESTART_EXIT_CODE,
  superviseWeb,
  SUPERVISED_WORKER_ARG,
  type SupervisorHost,
} from '../src/supervisor.ts'

interface FakeChild extends EventEmitter {
  pid: number
  exitCode: number | null
  signalCode: NodeJS.Signals | null
  kill: ReturnType<typeof vi.fn>
}

function fakeChild(pid: number): FakeChild {
  return Object.assign(new EventEmitter(), {
    pid,
    exitCode: null,
    signalCode: null,
    kill: vi.fn(),
  })
}

function fixture(children: FakeChild[]): {
  host: SupervisorHost
  spawned: { command: string; args: readonly string[]; detached: boolean }[]
  signal(signal: NodeJS.Signals): void
  killedGroups: { pid: number; signal: NodeJS.Signals }[]
} {
  const listeners = new Map<NodeJS.Signals, Set<() => void>>()
  const spawned: { command: string; args: readonly string[]; detached: boolean }[] = []
  const killedGroups: { pid: number; signal: NodeJS.Signals }[] = []
  return {
    spawned,
    killedGroups,
    signal(signal) {
      for (const listener of listeners.get(signal) ?? []) listener()
    },
    host: {
      spawn(command, args, detached) {
        spawned.push({ command, args, detached })
        const child = children.shift()
        if (child === undefined) throw new Error('unexpected spawn')
        return child as unknown as ChildProcess
      },
      on(signal, listener) {
        const current = listeners.get(signal) ?? new Set()
        current.add(listener)
        listeners.set(signal, current)
      },
      off(signal, listener) { listeners.get(signal)?.delete(listener) },
      killGroup(pid, signal) { killedGroups.push({ pid, signal }) },
    },
  }
}

describe('web supervisor', () => {
  it('restarts only for the reserved exit code and preserves the invocation', async () => {
    const first = fakeChild(101)
    const second = fakeChild(102)
    const test = fixture([first, second])
    const completion = superviseWeb(['web', '--port', '4321'], test.host)

    first.emit('exit', APP_RESTART_EXIT_CODE, null)
    await Promise.resolve()
    second.emit('exit', 7, null)

    await expect(completion).resolves.toBe(7)
    expect(test.spawned).toHaveLength(2)
    for (const spawned of test.spawned) {
      expect(spawned.command).toBe(process.execPath)
      expect(spawned.args).toEqual([
        ...process.execArgv,
        process.argv[1],
        SUPERVISED_WORKER_ARG,
        'web',
        '--port',
        '4321',
      ])
      expect(spawned.detached).toBe(process.platform !== 'win32')
    }
  })

  it('forwards termination and suppresses a requested restart', async () => {
    const child = fakeChild(201)
    const test = fixture([child])
    const completion = superviseWeb(['web'], test.host)

    test.signal('SIGTERM')
    child.emit('exit', APP_RESTART_EXIT_CODE, null)

    await expect(completion).resolves.toBe(APP_RESTART_EXIT_CODE)
    if (process.platform === 'win32') expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    else expect(test.killedGroups).toEqual([{ pid: 201, signal: 'SIGTERM' }])
    expect(test.spawned).toHaveLength(1)
  })

  it('reports a worker signal with its conventional exit status', async () => {
    const child = fakeChild(301)
    const test = fixture([child])
    const completion = superviseWeb(['--profile', 'web'], test.host)

    child.emit('exit', null, 'SIGINT')

    await expect(completion).resolves.toBe(130)
  })
})

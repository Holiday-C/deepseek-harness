/** Process supervisor for restartable long-lived DSH applications. */

import { spawn, type ChildProcess } from 'node:child_process'
import { constants } from 'node:os'

/** Exit code by which a supervised worker requests replacement. */
export const APP_RESTART_EXIT_CODE = 75

/** Private first argument that distinguishes a supervised worker from its parent. */
export const SUPERVISED_WORKER_ARG = '--dsh-internal-supervised-worker'

/** Process facilities replaced by unit tests. */
export interface SupervisorHost {
  /** Spawn one worker process. */
  spawn(command: string, args: readonly string[], detached: boolean): ChildProcess
  /** Subscribe to a process signal. */
  on(signal: NodeJS.Signals, listener: () => void): void
  /** Remove a process signal subscription. */
  off(signal: NodeJS.Signals, listener: () => void): void
  /** Forward a signal to a detached process group. */
  killGroup(pid: number, signal: NodeJS.Signals): void
}

const processHost: SupervisorHost = {
  spawn(command, args, detached) {
    return spawn(command, [...args], { detached, stdio: 'inherit' })
  },
  on(signal, listener) { process.on(signal, listener) },
  off(signal, listener) { process.off(signal, listener) },
  killGroup(pid, signal) { process.kill(-pid, signal) },
}

/** Convert a child exit signal to the conventional shell status. */
function signalExitCode(signal: NodeJS.Signals): number {
  return 128 + constants.signals[signal]
}

/**
 * Run a restartable worker from the current Node entry point.
 * @param argv - the original arguments after the CLI entry path.
 * @param host - process operations, replaceable by tests.
 * @returns the final worker exit status.
 */
export async function superviseWeb(
  argv: readonly string[],
  host: SupervisorHost = processHost,
): Promise<number> {
  const entry = process.argv[1]
  if (entry === undefined) throw new Error('dsh: missing CLI entry path')
  const detached = process.platform !== 'win32'
  const state = { stopping: false }
  for (;;) {
    const workerArgs = [
      ...process.execArgv,
      entry,
      SUPERVISED_WORKER_ARG,
      ...argv,
    ]
    const child = host.spawn(process.execPath, workerArgs, detached)
    const forward = (signal: NodeJS.Signals): void => {
      state.stopping = true
      if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return
      try {
        if (detached) host.killGroup(child.pid, signal)
        else child.kill(signal)
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code !== 'ESRCH') throw error
      }
    }
    const onTerm = (): void => { forward('SIGTERM') }
    const onInt = (): void => { forward('SIGINT') }
    host.on('SIGTERM', onTerm)
    host.on('SIGINT', onInt)
    try {
      const outcome = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
        child.once('error', reject)
        child.once('exit', (code, signal) => { resolve({ code, signal }) })
      })
      if (!state.stopping && outcome.code === APP_RESTART_EXIT_CODE) continue
      if (outcome.code !== null) return outcome.code
      return outcome.signal === null ? 1 : signalExitCode(outcome.signal)
    } finally {
      host.off('SIGTERM', onTerm)
      host.off('SIGINT', onInt)
    }
  }
}

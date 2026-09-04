#!/usr/bin/env node
/**
 * Command-line entry for dsh.
 * @module @deepseek-ai/dsh/bin
 */

/* v8 ignore file -- built-bin acceptance exercises this self-executing dispatch. */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseDshArgs } from './args.ts'
import { APP_RESTART_EXIT_CODE, superviseWeb, SUPERVISED_WORKER_ARG } from './supervisor.ts'

// Both the source tree (apps/cli/src) and the bundled bin (apps/cli/lib) sit
// one directory under apps/cli, so the checked-in manifest resolves with the
// same relative hop from either artifact.
function readVersion(): string {
  const manifest = JSON.parse(
    readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
  ) as { version?: unknown }
  return typeof manifest.version === 'string' ? manifest.version : '0.0.0'
}

const rawArgs = process.argv.slice(2)
const supervisedWorker = rawArgs[0] === SUPERVISED_WORKER_ARG
const launcherArgs = supervisedWorker ? rawArgs.slice(1) : rawArgs
const invocation = parseDshArgs(launcherArgs, readVersion())

switch (invocation.mode) {
  case 'profile': {
    if (invocation.profile === 'web' && !supervisedWorker) {
      process.exitCode = await superviseWeb(launcherArgs)
      break
    }
    const { loadLayeredEnv } = await import('@deepseek-ai/dsh-app-boot')
    const { runProfile } = await import('./profile-boot.ts')
    await runProfile({
      environment: loadLayeredEnv('dsh'),
      profile: invocation.profile,
      patchFiles: invocation.patches,
      args: invocation.args,
      ...supervisedWorker && invocation.profile === 'web'
        ? { restartExitCode: APP_RESTART_EXIT_CODE }
        : {},
    })
    break
  }
  case 'plugin': {
    const { runPlugin } = await import('./plugin.ts')
    process.exit(runPlugin(invocation.profile, invocation.args))
    break
  }
  case 'dump-config': {
    const { runDumpConfig } = await import('./dump-config.ts')
    runDumpConfig(invocation.profile, invocation.defaultOnly, invocation.patches)
    break
  }
  default:
    invocation satisfies never
    throw new Error(`dsh: unhandled invocation mode ${JSON.stringify(invocation)}`)
}

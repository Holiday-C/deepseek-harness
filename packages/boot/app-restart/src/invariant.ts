/** Package-owned invariant companion for `@deepseek-ai/dsh-app-restart`. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-app-restart'

/** Cordis companion plugin name. */
export const name = 'app-restart-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the launcher owns restart reservations, while the
 * Agent, Tools, Jobs, and Session packages own the lifecycle facts consulted
 * before this adapter commits one.
 */
const install: InvariantInstaller = () => {}

/**
 * Register the package-owned invariant companion.
 * @param ctx - Cordis context carrying the invariant registry.
 * @returns exact registration disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))

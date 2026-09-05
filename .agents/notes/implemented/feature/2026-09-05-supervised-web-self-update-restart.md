# Agent Note: Supervised Web restart after self-update

Status: implemented

English | [中文](2026-09-05-supervised-web-self-update-restart.zh.md)

## Problem

A DSH Web agent can inspect and modify its own source, run dependency installation, and rebuild the application, but the running process cannot replace its own loaded launcher and Cordis tree. Stopping that process also removes the actor that would start the updated application. A build can therefore finish successfully while the user is left with the old process or no usable DSH process.

Whole-application HMR does not close this gap. The launcher, Node dependency graph, profile resolver, Host services, browser authentication authority, and Client artifacts can all change together. Reloading selected plugins cannot prove that the new application boots, and replacing files beneath a live process does not make already loaded modules current.

The update procedure itself is deployment-specific. A source checkout may merge an upstream branch, an installed package may change versions, and a managed deployment may stage an image. DSH needs a safe process handoff after those operations succeed without embedding Git, package-manager, or release policy into the runtime.

## Decision

### Supervised Web process

`dsh web` runs a thin launcher supervisor which starts the existing profile application as a worker process with the same executable entry, arguments, working directory, environment, and inherited standard streams. The supervisor loads no Cordis application packages and remains alive while the worker serves the Web application and performs an update or rebuild.

The worker exits with one launcher-owned restart code only after a restart request commits. The supervisor treats that code as a one-shot request to start a fresh worker from the same entry path. Every other exit preserves the existing CLI outcome, and a signal received by the supervisor cancels restart and is forwarded to the worker. Other shipped profiles keep their current direct lifecycle because headless, SDK, and ACP callers do not have the browser reconnection semantics required by this feature.

The mechanism supports Node source and built `dsh web` entries whose entry path remains valid after the update. Packaged Python runtimes and deployments that replace the launcher path require their own stable outer supervisor and do not advertise restart through this mechanism.

### Launcher-provided restart capability

`@deepseek-ai/dsh-cmdline` declares an optional `ctx.appRestart` launcher value beside `cmdlineArgs`, `appExit`, and `appReady`. `appRestart.prepare()` reserves the process-wide restart slot and returns an idempotent request with `commit()` and `cancel()`. A second reservation fails. Cancellation releases the slot; commit invokes the launcher's bounded shutdown with the restart code and keeps the slot reserved through exit. An unsupervised application does not receive the value, so a consumer that requires it fails at composition instead of claiming restart support.

The supervisor is substrate rather than update policy. It does not fetch source, mutate branches, install dependencies, build artifacts, run tests, choose a rollback target, or infer that a dirty tree is safe. Existing tools and deployment documentation own those operations.

### Model-facing restart consumer

A Web-only `@deepseek-ai/dsh-app-restart` plugin registers `restart_dsh` after injecting `tools`, `agents`, `jobs`, and `appRestart`. Its schema has no arguments. The tool description says to call it only after update and build verification. The shipped configuration requires the `tools/pre-execute` approval path; a deployment may explicitly disable that extra prompt when another authority owns restart permission.

Execution refuses an agentless call. It also refuses while another Agent is running or any visible background job is `running` or `stopping`, so a known concurrent operation is never silently interrupted. The tool reserves restart, marks its successful result as turn-concluding, and returns a canonical pending status. A failure or policy replacement cancels the reservation.

The plugin observes the exact final `tools/result`. A successful turn-concluding result starts `Agent.whenIdle()`; the Agent loop appends the corresponding session `tool/result` and balanced `turn/end` before reaching that quiescent state. The plugin then performs its final concurrency check and commits restart. Bounded whole-tree shutdown lets session persistence flush the balanced turn before the worker exits. Browser Connection reconnects and re-baselines sessions after transport loss; the persistent browser credential remains valid across the new worker, while the process launch token rotates normally.

The final idle check repeats the concurrency precondition. If new Agent or job work began after tool execution, the plugin cancels the reservation and keeps the current worker alive. The user or model can retry after that work settles. This is a fail-safe race outcome, not an attempt to create a process-wide admission lock.

### Documentation and composition

The Web bundle mounts the restart consumer; other profiles do not. The static browser-worker preview disables that row during its runtime boot patches because no launcher process remains outside its plugin tree to fulfill `appRestart`. The application-launch architecture, CLI README, boot group map, `dsh-cmdline` README, generated catalogs, and personal fork update manual describe the supervisor, the brief reconnect window, the explicit approval, and the separation between update preparation and restart commit.

The existing dynamic Cordis package proposal remains independent: it changes temporary plugins inside one process, while this feature replaces the complete Web application process after repository or installation changes.

## Existing decisions and supersession

The [single dsh application launcher](../architecture/2026-08-22-single-dsh-application-launcher.md) remains authoritative and records this supervised Web worker as an extension of the same CLI/profile entry. The [Web GUI feedback loop](../bug-fix/2026-07-28-web-gui-feedback-loop.md) remains authoritative for ordinary Client artifact edits, which need only browser reload; this decision adds an explicit handoff after a verified whole-application update and does not restart after every edit. The [dynamic Cordis package runtime](../../proposed/architecture/2026-08-08-cordis-web-dynamic-packages.md) remains active for temporary process-local extension. No active note is fully superseded or eligible for archival.

## Alternatives considered

**Reload the complete Cordis tree in place.** Rejected because Node modules, the launcher, dependency versions, static Client artifacts, and process-owned authentication state can change outside Cordis plugin HMR. A successful partial reload cannot establish that a fresh application boots.

**Spawn an unowned detached updater from a tool.** Rejected because the subprocess service deliberately owns and terminates its children, while bypassing it creates an orphan with unclear terminal, signal, credential, and failure-reporting ownership. A launcher supervisor is the stable owner already responsible for process lifetime.

**Run old and new Web workers concurrently and transfer the listening socket.** Rejected for the first version because zero-downtime socket handoff would add shared-port arbitration, authentication-secret transfer, live-session ownership, and cross-worker admission rules. The browser already has reconnect and durable-session recovery, so a bounded restart is sufficient.

**Automate Git, pnpm, and branch merging inside the restart plugin.** Rejected because those choices belong to each deployment and may require conflict resolution or different release systems. The restart capability begins only after the caller has produced and verified the replacement.

**Expose only a human `/restart` command.** Rejected because it leaves the self-modifying Agent unable to complete the final handoff it prepared. Default tool approval preserves explicit human authority without requiring a second manual command.

## Verification

- Focused launcher tests cover respawn, signal forwarding, restart suppression during shutdown, and ordinary exit propagation.
- A real source CLI test starts two Web worker generations under one supervisor, preserving the port while rotating the launch token.
- App-restart and cmdline tests cover default approval, root-only scope, Agent/job concurrency refusal, exclusive reservation, turn conclusion, quiescent commit, cancellation, teardown, and contained launcher failure.
- Keyless Web snapshots pin `restart_dsh` in standard and minimal native schemas and in the generated PTC SDK prompt; preview boot verifies that the browser-worker tree omits the unsupported restart consumer.
- The complete build, focused Web replay, generated-catalog freshness, package constraints, invariant wiring, documentation checks, and lint run over the shipped composition.

## Consequences

The extra process makes the CLI responsible for Web signal and exit propagation. Restart has brief downtime and can fail if an update deletes the stable entry path or produces a worker that cannot boot; that failure becomes the CLI outcome and is not retried as another restart. The concurrency check observes current state rather than locking future submissions, so the commit-time recheck can cancel a requested restart. Background work outside the Agent/job registries remains visible only to normal application teardown. A source build can temporarily replace static files beneath the old worker; the loaded application and supervisor remain available, but a new browser page is not guaranteed to load during every build phase.

---
description: "Supervised Web restart handoff: the root-agent restart_dsh tool, approval policy, and quiescence checks used after an update or rebuild."
kind: "package-reference"
---

# @deepseek-ai/dsh-app-restart

English | [中文](README.zh.md)

## Summary

`dsh-app-restart` lets a root agent finish an update or rebuild and then replace the running DSH Web process without losing the launcher that can start it again. It contributes the `restart_dsh` tool only when `dsh web` supplied a supervisor-owned restart reservation. The tool asks for approval by default, ends its own turn, waits for that agent to become idle, and restarts only while every live agent and background job is idle. It does not fetch source, choose branches, install dependencies, build artifacts, or bypass the repository's update manual.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The shipped Web bundle mounts this package automatically. Ask the agent to follow the repository update manual; after it has completed the selected update, build, and checks, it can call `restart_dsh`. Approve the request when the current work is ready to hand over. The page disconnects briefly, then the existing Web reconnect logic attaches it to the new worker process.

The successful tool result is `{"status":"restart-pending"}`. It means restart is reserved for the end of the current turn, not that the new process is already ready. If another agent or background job is live before execution, the tool fails without reserving a restart. If new work starts while the requesting turn is draining, the reservation is cancelled and the old process stays available.

Set `requireApproval: false` only in a trusted deployment that explicitly wants model-initiated restarts without a separate user confirmation:

```yaml
- id: app-restart
  name: '@deepseek-ai/dsh-app-restart'
  config:
    requireApproval: false
```

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Ownership and lifecycle

The CLI supervisor owns process replacement and exposes one exclusive `ctx.appRestart` reservation to its Web worker. This package installs `restart_dsh` through each current or future root agent's scoped `ctx.tools`; runtime children never receive it. The tool reserves restart inside its accepted execution, marks the successful result as turn-ending, then a `tools/result` observer waits for agent quiescence and rechecks all agents and jobs before committing the reservation.

Tool failure, result replacement, agent disposal, plugin unload, or a newly busy application cancels the reservation. The supervisor interprets only its reserved worker exit code as restart; every other code or signal remains the process outcome.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Root-agent tool installation, approval, busy checks, reservation commit and cancellation |
| [`src/invariant.ts`](src/invariant.ts) | Empty invariant companion; the owning lifecycle registries carry the checked relationships |
| [`tests/app-restart.spec.ts`](tests/app-restart.spec.ts) | Scope, approval, concurrency, quiescence, and teardown coverage |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [dsh-cmdline](../cmdline/README.md) — launcher-owned exit, readiness, and restart values.
- [dsh CLI](../../../apps/cli/README.md) — the Web supervisor and direct-launch profiles.
- [Web bundle](../../bundle/web-app/README.md) — browser reconnect behavior and the shipped composition.
- [Self-update restart decision](../../../.agents/notes/implemented/feature/2026-09-05-supervised-web-self-update-restart.md) — rationale and rejected alternatives.

-----

<a id="model-experience"></a>
## Model Experience

### Tool schema

#### What the model sees

Root Web agents receive the generated [`restart_dsh` schema](../../../docs/tool-catalog.md#deepseek-aidsh-app-restart). Its description limits use to a completed update or rebuild whose required checks passed.

#### Token effect

One fixed no-argument tool schema is present on every root Web request.

#### KV Cache effect

Prefix-stable while the tool definition and root-agent visibility remain unchanged.

### Tool-call history and result

#### What the model sees

The assistant history records an empty-argument call. A successful call records `DSH restart requested. It will proceed after this turn if the application remains idle.` and ends the current turn; a later request after reconnect can replay that result from the session. Approval UI state and process supervision are not model context.

#### Token effect

The call and compact result add a fixed amount of retained history only when the tool is used.

#### KV Cache effect

Append-only; the call and result follow the reusable request prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Only `dsh web` is supervised; headless, SDK, ACP, plugin-management, and config-dump invocations keep their existing direct process lifecycle.
- Restart briefly interrupts HTTP and WebSocket connections; this is reconnect-based continuity, not zero-downtime socket handoff.
- The package does not resume an unfinished update after a crash. Source control and build recovery remain the update manual's responsibility.

<a id="dev-note"></a>
### Dev Note

None.

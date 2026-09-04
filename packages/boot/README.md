---
description: "The boot package group: how dsh app bins start — environment loading, profile and patch layers, clear startup failures, and app-owned command lines."
kind: "package-group"
---

# boot/ — shared app-bin boot glue

English | [中文](README.zh.md)

## Summary

The boot group provides what a dsh app needs to start and replace itself: `app-boot` turns a `cordis.yml` plus environment and patch layers into a running app, `cmdline` hands launcher-owned arguments and lifecycle values to that app, and `app-restart` exposes a supervised restart to root Web agents. With these packages you can run `dsh` or write an application that boots the same way. This page maps the group; each package README owns its per-package contract.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

<a id="packages"></a>
## Packages

| Package | Role | ctx key |
|---|---|---|
| [`app-boot`](app-boot/README.md) | Boots a dsh app from a `cordis.yml`: loads `.env`, applies profile and patch layers, and reports startup failures clearly | (library for the bins) |
| [`app-restart`](app-restart/README.md) | Gives root Web agents an approved, quiescence-checked restart handoff after updates or rebuilds | (model-facing Consumer of `appRestart`) |
| [`cmdline`](cmdline/README.md) | Lets the app own its flags and lifecycle requests; passes everything after the launcher's flags through verbatim | `cmdlineArgs`, `appExit`, `appReady`, `appRestart?` |

<a id="related-documentation"></a>
## Related documentation

- [dsh app](../../apps/cli/README.md) — the `dsh` bin that consumes these helpers for its boot sequence.
- [Profile bundles](../bundle/README.md) — installable patch layers that `dsh --profile` compositions mount.
- [dsh-home-paths](../util/home-paths/README.md) — the harness-home resolver both packages build on.
- [App-owned command-line decision](../../.agents/notes/implemented/architecture/2026-08-06-app-owned-command-line.md) — why an app owns its flag family instead of the launcher.

<a id="dev-note"></a>
## Dev Note

None.

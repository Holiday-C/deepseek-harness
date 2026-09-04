# Agent Note: Fork-owned keyless CI

Status: implemented

English | [中文](2026-09-05-fork-owned-keyless-ci.zh.md)

## Problem

A GitHub fork receives workflow files from its source repository but does not inherit organization runner pools, GitHub App installations, deployment credentials, or repository Secrets. Pull requests to the personal integration branch can therefore remain queued on unavailable runner labels or fail in automation that cannot exist in the fork. Those results do not describe the checked-out change.

The personal integration branch needs merge evidence that is produced entirely by infrastructure available to the fork. Source-repository automation must remain usable in the source repository because upstream synchronization retains the same files.

## Decision

[`Fork CI`](../../../../.github/workflows/fork-ci.yml) runs on pull requests targeting `custom/main` and on pushes to `custom/main`. Every job checks out the triggering commit and uses a standard GitHub-hosted `ubuntu-24.04` or `windows-2025` runner. The workflow has no repository Secrets, Variables, Environments, Actions caches, cross-workflow artifact downloads, custom runner labels, or self-hosted runner selectors.

The fork aggregate requires the repository's static, coverage, consumer, Node compatibility, Python SDK, Wine Windows, native Windows build, and native Windows test commands. Its reduced worker counts fit standard hosted capacity. The workflow fixes `TZ=Asia/Shanghai` because recorded browser requests retain the client time zone. The native Windows job gives each selected spec a separate Vitest process so an exited worker cannot discard another spec's completed result. Real-provider tests, deployment previews, source-repository runner benchmarks, and release-shaped Python runtime matrices remain outside this keyless aggregate.

Pull requests targeting `custom/main` do not trigger source-repository CI, Cloudflare preview deployment, Issue App automation, or automatic real-API E2E workflows. Source-repository CI, `master` runner exercises, deployment, Issue App, and automatic real-API jobs also test `github.event.repository.fork == false` at job allocation. Any other fork event skips those jobs before GitHub selects a runner or exposes job credentials. The workflow definitions keep their source-repository behavior when the same files run in a non-fork repository.

## Alternatives considered

**Provision copies of the source repository's infrastructure.** This would reproduce organization-owned runners, GitHub Apps, deployment accounts, and secret rotation in a personal repository. The fork does not need those services to validate its integration branch, and their continued availability would become an external merge dependency.

**Replace the source workflows with fork-only definitions.** This would remove unused configuration but make every upstream workflow change a larger synchronization conflict. Separate fork CI plus allocation-time guards preserves the upstream definitions without executing them in the fork.

**Treat queued and credential failures as optional checks.** This leaves misleading failures and permanently running jobs on each pull request. A dedicated aggregate reports only evidence the fork can actually produce.

**Restore caches from `master`.** Repository-scoped caches cannot cross from the source repository, but the fork's `master` tracks upstream code and is not the personal integration branch. Cache-free jobs avoid treating a different branch's artifacts as validation inputs.

## Consequences

The personal integration branch has a stable `fork checks passed` result whose required jobs can all start with the fork's own GitHub Actions entitlement. Dependency installation and browser or Wine provisioning repeat on clean runners, so this workflow trades latency for independence and unambiguous provenance.

The aggregate does not claim real-provider, Cloudflare deployment, enterprise-runner, or complete packaged-runtime evidence. A change that requires one of those systems needs an explicit developer-run check or a separately configured fork-owned workflow. Upstream synchronization must retain the fork guards and the separate `Fork CI` definition.

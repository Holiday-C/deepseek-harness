---
name: dsh-update
description: Update, upgrade, sync, or redeploy this personal DeepSeek Harness (DSH) fork. Use for requests such as 更新 DSH、升级一下、同步官方新版、更新你自己 or update DSH when context identifies DSH as the target, without requiring exact wording. Do not use for version or release-note questions alone, unrelated project updates, or profile-plugin-only updates.
---

# Update this DSH fork

## Recognize the request

Interpret the user's intent and conversation context, not a fixed command phrase. When DSH is clearly the target, an update request includes preparing and verifying the new version and handing off the running application. Respect narrower requests such as checking for updates, syncing source only, or not restarting. Ask what to update only when the target is genuinely ambiguous.

This skill applies to the personal fork containing this file. Confirm the checkout before changing anything; do not apply its branch or deployment policy to another repository.

## Follow the manual

Read the [personal fork update and redeployment manual](../../../FORK_UPDATE_AND_DEPLOY_GUIDE.md) in full before operating. It owns the branch policy, workspace protection, backup requirements, installation, build, checks, deployment acceptance, and rollback. Do not duplicate or replace its commands with a separate update procedure. Use [dsh-pre-push-checks](../dsh-pre-push-checks/SKILL.md) before publishing changes.

Preserve personal modifications and fork-owned CI. If source and deployment are already current, report that instead of rebuilding or restarting without a reason. Stop for unresolved conflicts, failed checks, or required offline backup; do not bypass them to reach restart.

## Complete the handoff

In a supervised DSH Web root-agent session, keep the current worker and supervisor running during preparation. After the manual's build and relevant checks succeed, explain the brief Web disconnection and call the available `restart_dsh` tool through its approval flow. Do not kill the process, launch a competing instance, or substitute a shell command named `restart_dsh`.

The tool concludes the turn. Its successful result means restart is pending, not that the new worker is healthy. After reconnection, verify deployment using the manual when execution resumes; otherwise report acceptance as pending. If another agent or background job blocks restart, leave the application running and retry only after that work has settled.

If `restart_dsh` is unavailable, do not claim automatic handoff or stop the process hosting this conversation. Explain that a manual stop/start through the manual is required and distinguish completed preparation from the remaining restart and acceptance.

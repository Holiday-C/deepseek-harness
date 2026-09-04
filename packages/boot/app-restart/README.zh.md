---
description: "受监督的 Web 重启交接：更新或重建后使用的根 agent restart_dsh 工具、审批策略与静止检查。"
kind: "package-reference"
---

# @deepseek-ai/dsh-app-restart

[English](README.md) | 中文

## 概述

`dsh-app-restart` 让根 agent 完成更新或重建后替换正在运行的 DSH Web 进程，同时保留能够再次启动它的 launcher。只有当 `dsh web` 提供 supervisor 持有的重启预约时，本包才贡献 `restart_dsh` 工具。工具默认请求审批，结束自己的回合，等待该 agent 进入 idle，并且只在所有 live agent 与后台 job 都 idle 时重启。它不拉取源码、不选择分支、不安装依赖、不构建产物，也不绕过仓库更新手册。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

随附的 Web 组合包会自动挂载本包。让 agent 遵循仓库更新手册；完成选定的更新、构建和检查后，它可以调用 `restart_dsh`。当当前工作已经可以交接时批准请求。页面会短暂断开，随后由现有 Web 重连逻辑连接到新的 worker 进程。

成功的工具结果是 `{"status":"restart-pending"}`。它表示已经为当前回合结束预约重启，并不表示新进程已经就绪。如果执行前另一个 agent 或后台 job 仍 live，工具会失败且不预约重启。如果请求回合收尾期间有新工作开始，预约会被取消，旧进程继续可用。

只有明确希望模型无需单独用户确认即可发起重启的可信部署，才应设置 `requireApproval: false`：

```yaml
- id: app-restart
  name: '@deepseek-ai/dsh-app-restart'
  config:
    requireApproval: false
```

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

### 所有权与生命周期

CLI supervisor 持有进程替换，并向其 Web worker 暴露一个排他的 `ctx.appRestart` 预约。本包通过每个当前或未来根 agent 自己的 `ctx.tools` 范围安装 `restart_dsh`；运行时子 agent 永远不会获得它。工具在已接受的执行中预约重启，把成功结果标记为结束回合，之后由 `tools/result` 观察者等待 agent 静止，并在提交预约前再次检查所有 agent 与 job。

工具失败、结果替换、agent 销毁、插件卸载或应用重新变忙都会取消预约。supervisor 只把保留的 worker 退出码解释为重启；其他退出码与信号仍是进程结果。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 根 agent 工具安装、审批、繁忙检查、预约提交与取消 |
| [`src/invariant.ts`](src/invariant.ts) | 空的不变式伴生插件；生命周期注册表的所属包负责检查相关关系 |
| [`tests/app-restart.spec.ts`](tests/app-restart.spec.ts) | 范围、审批、并发、静止与拆卸覆盖 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [dsh-cmdline](../cmdline/README.zh.md)——launcher 持有的退出、就绪与重启值。
- [dsh CLI](../../../apps/cli/README.zh.md)——Web supervisor 与直接启动的 profile。
- [Web 组合包](../../bundle/web-app/README.zh.md)——浏览器重连行为与随附组合。
- [自更新重启决策](../../../.agents/notes/implemented/feature/2026-09-05-supervised-web-self-update-restart.zh.md)——理由与被否决的替代方案。

-----

<a id="model-experience"></a>
## 模型体验

### 工具 schema

#### 模型看到的内容

根 Web agent 会收到生成的 [`restart_dsh` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-app-restart)。其描述把用途限制为已完成且所需检查通过的更新或重建。

#### Token 影响

每个根 Web 请求都包含一个固定的无参数工具 schema。

#### KV Cache 影响

只要工具定义与根 agent 可见性不变，前缀就保持稳定。

### 工具调用历史与结果

#### 模型看到的内容

assistant 历史会记录一次空参数调用。成功调用会记录 `DSH restart requested. It will proceed after this turn if the application remains idle.` 并结束当前回合；重连后的后续请求可以从 session 回放该结果。审批 UI 状态与进程 supervisor 不属于模型上下文。

#### Token 影响

只有使用工具时，调用与紧凑结果才会增加固定数量的保留历史。

#### KV Cache 影响

仅追加；调用与结果位于可复用请求前缀之后。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 只有 `dsh web` 受 supervisor 管理；headless、SDK、ACP、插件管理与配置 dump 调用保持现有的直接进程生命周期。
- 重启会短暂中断 HTTP 与 WebSocket 连接；这是基于重连的连续性，不是零停机 socket 交接。
- 本包不会在崩溃后恢复未完成的更新。源码控制和构建恢复仍由更新手册负责。

<a id="dev-note"></a>
### 开发备注

无。

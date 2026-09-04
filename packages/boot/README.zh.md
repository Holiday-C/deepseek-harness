---
description: "boot 包组：dsh app bin 如何启动——环境加载、profile 与 patch 层、清晰的启动失败信息，以及由应用持有的命令行。"
kind: "package-group"
---

# boot/：共享的 app bin 启动粘合层

[English](README.md) | 中文

## 概述

boot 组提供 dsh 应用启动和替换自身所需的能力：`app-boot` 把 `cordis.yml` 连同环境与 patch 层变成运行中的应用，`cmdline` 把 launcher 持有的参数与生命周期值交给应用，`app-restart` 则向根 Web agent 暴露受监督的重启。借助这些包，你可以运行 `dsh`，也可以编写以同样方式启动的应用。本页是组的映射；各包 README 负责各自的包级约定。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

<a id="packages"></a>
## 包

| 包 | 职责 | ctx 键 |
|---|---|---|
| [`app-boot`](app-boot/README.zh.md) | 从 `cordis.yml` 启动 dsh 应用：加载 `.env`、应用 profile 与 patch 层，并清晰报告启动失败 | （供各 bin 使用的库） |
| [`app-restart`](app-restart/README.zh.md) | 在更新或重建后，为根 Web agent 提供经过审批和静止检查的重启交接 | （`appRestart` 的面向模型 Consumer） |
| [`cmdline`](cmdline/README.zh.md) | 让应用持有自己的 flag 与生命周期请求；启动器自身 flag 之后的一切原样传入 | `cmdlineArgs`、`appExit`、`appReady`、`appRestart?` |

<a id="related-documentation"></a>
## 相关文档

- [dsh 应用](../../apps/cli/README.zh.md)——在其启动序列中使用这些 helper 的 `dsh` bin。
- [Profile 组合包](../bundle/README.zh.md)——可由 `dsh --profile` 组合挂载的可安装 patch 层。
- [dsh-home-paths](../util/home-paths/README.zh.md)——两个包都依赖的 harness home 解析器。
- [应用持有命令行决策](../../.agents/notes/implemented/architecture/2026-08-06-app-owned-command-line.zh.md)——为什么 flag 家族由应用持有而非启动器。

<a id="dev-note"></a>
## 开发备注

无。

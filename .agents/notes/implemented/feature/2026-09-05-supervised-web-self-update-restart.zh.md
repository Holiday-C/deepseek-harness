# Agent Note: 自更新后的受监督 Web 重启

Status: implemented

[English](2026-09-05-supervised-web-self-update-restart.md) | 中文

## 问题

DSH Web agent 可以检查和修改自身源码、安装依赖并重新构建应用，但运行中的进程无法替换自己已经加载的启动器与 Cordis 树。停止该进程也会移除本应启动更新后应用的执行者。因此，即使构建成功，用户仍可能只剩旧进程，或没有可用的 DSH 进程。

整个应用的 HMR 无法弥补这个缺口。启动器、Node 依赖图、profile 解析器、Host 服务、浏览器认证 authority 与 Client 产物都可能一起变化。只重载部分插件无法证明新应用能够启动，而替换活跃进程下方的文件也不会让已加载模块自动变成最新版本。

更新过程本身由部署决定。源码检出可能合并上游分支，安装版本可能切换软件包版本，受管理部署也可能预备新镜像。DSH 需要在这些操作成功后完成安全的进程交接，但不能把 Git、包管理器或发布策略嵌入运行时。

## 决策

### 受监督的 Web 进程

`dsh web` 运行一个轻量启动监督进程，由它使用相同的可执行入口、参数、工作目录、环境和继承的标准流启动现有 profile 应用 worker。监督进程不加载任何 Cordis 应用包；worker 提供 Web 服务并执行更新或构建时，它始终保持运行。

只有重启请求提交后，worker 才以一个由启动器持有的重启退出码结束。监督进程把该退出码视为一次性请求，并从同一入口路径启动全新 worker。其他退出保持现有 CLI 结果；监督进程收到信号时会取消重启并把信号转发给 worker。其他随附 profile 保持当前直接生命周期，因为 headless、SDK 和 ACP 调用方不具备此功能所需的浏览器重连语义。

该机制支持 Node 源码入口和构建入口，前提是更新后 `dsh web` 的入口路径仍然有效。打包后的 Python runtime 以及会替换启动器路径的部署需要各自稳定的外层监督器，不通过此机制公布重启能力。

### 启动器提供的重启能力

`@deepseek-ai/dsh-cmdline` 在 `cmdlineArgs`、`appExit` 与 `appReady` 旁声明可选的启动器值 `ctx.appRestart`。`appRestart.prepare()` 预约进程级唯一重启槽位，并返回带幂等 `commit()` 与 `cancel()` 的请求。第二次预约会失败。取消会释放槽位；提交则用重启退出码调用启动器的有界 shutdown，并在进程退出前持续占用槽位。未受监督的应用不会收到该值，因此要求它的 consumer 会在组合阶段失败，而不是声称支持重启。

监督进程只提供底层机制，不持有更新策略。它不获取源码、不修改分支、不安装依赖、不构建产物、不运行测试、不选择回退目标，也不推断 dirty tree 是否安全。这些操作仍由现有工具与部署文档持有。

### 面向模型的重启 consumer

仅用于 Web 的 `@deepseek-ai/dsh-app-restart` 插件在注入 `tools`、`agents`、`jobs` 与 `appRestart` 后注册 `restart_dsh`。其 schema 不接收参数。工具描述要求只在更新与构建验证完成后调用。随附配置要求经过 `tools/pre-execute` 审批；当其他 authority 已持有重启权限时，部署可以显式关闭这层额外提示。

执行会拒绝没有 agent 的调用。当另一个 Agent 仍在运行，或任何可见后台 job 处于 `running` 或 `stopping` 时，执行同样会拒绝，因此不会静默中断已知并发操作。工具预约重启，把成功结果标记为结束本轮，并返回规范的 pending 状态。失败或策略替换会取消预约。

插件观察确切的最终 `tools/result`。成功且结束回合的结果会启动 `Agent.whenIdle()`；Agent loop 会在到达该静止状态前追加对应的 session `tool/result` 与平衡的 `turn/end`。随后插件执行最终并发检查并提交重启。有界的整树 shutdown 让 session persistence 在 worker 退出前刷入平衡的 turn。浏览器 Connection 会在传输断开后重连并重新获取 session 基线；持久浏览器凭据在新 worker 中继续有效，而进程启动 token 照常轮换。

最终 idle 检查会再次验证并发前置条件。如果工具执行后又开始了新的 Agent 或 job 工作，插件会取消预约并保留当前 worker。用户或模型可以在这些工作结束后重试。这是 fail-safe 的竞态结果，不会引入进程级接纳锁。

### 文档与组合

Web bundle 挂载重启 consumer，其他 profile 不挂载。静态浏览器 worker 预览会在运行时 boot patch 中禁用该行，因为它的插件树外没有能够兑现 `appRestart` 的 launcher 进程。应用启动架构、CLI README、boot 分组映射、`dsh-cmdline` README、生成目录和个人 Fork 更新手册会说明监督器、短暂重连窗口、显式审批，以及更新准备与重启提交之间的分工。

现有动态 Cordis 包提案保持独立：它在一个进程内更改临时插件，而本功能会在仓库或安装内容变化后替换完整 Web 应用进程。

## 现有决策与取代关系

[单一 dsh 应用启动器](../architecture/2026-08-22-single-dsh-application-launcher.zh.md)继续保持权威，并把受监督的 Web worker 记录为同一 CLI/profile 入口的扩展。[Web GUI 反馈循环](../bug-fix/2026-07-28-web-gui-feedback-loop.zh.md)继续负责普通 Client 产物编辑，这些编辑只需浏览器重载；本决策增加经过验证的整应用更新后的显式交接，不会在每次编辑后重启。[动态 Cordis 包运行时](../../proposed/architecture/2026-08-08-cordis-web-dynamic-packages.zh.md)继续负责临时的进程本地扩展。没有任何 active note 被完全取代或符合归档条件。

## 考虑过的替代方案

**原地重载完整 Cordis 树。**不采用，因为 Node 模块、启动器、依赖版本、静态 Client 产物与进程持有的认证状态可能在 Cordis 插件 HMR 之外变化。部分重载成功无法证明全新应用能够启动。

**从工具启动无人持有的 detached updater。**不采用，因为 subprocess 服务有意持有并终止自己的 child，而绕过它会产生 terminal、信号、凭据与失败报告归属不清的孤儿进程。启动监督器才是负责进程生命周期的稳定 owner。

**让新旧 Web worker 并行运行并交接监听 socket。**首个版本不采用，因为零停机 socket 交接会引入共享端口仲裁、认证 secret 转移、活跃 session 所有权和跨 worker 接纳规则。浏览器已经支持重连与持久 session 恢复，因此有界重启已经足够。

**在重启插件内自动执行 Git、pnpm 和分支合并。**不采用，因为这些选择属于各个部署，可能需要解决冲突或使用不同发布系统。只有调用方已经生成并验证替换版本后，重启能力才开始工作。

**只公开人工 `/restart` 命令。**不采用，因为这会让完成更新准备的自修改 Agent 仍然无法完成最后交接。默认工具审批保留显式人工 authority，同时不要求第二次手动输入命令。

## 验证

- 聚焦 launcher 测试覆盖重新拉起、信号转发、shutdown 期间抑制重启与普通退出传播。
- 真实源码 CLI 测试在同一个 supervisor 下启动两代 Web worker，在保持端口的同时轮换启动 token。
- App-restart 与 cmdline 测试覆盖默认审批、仅根范围、Agent/job 并发拒绝、排他预约、回合结束、静止提交、取消、拆卸与被包含的 launcher 失败。
- 无密钥 Web 快照在 standard 与 minimal native schema 以及生成的 PTC SDK 提示词中固定 `restart_dsh`；预览启动会验证浏览器 worker 树不会挂载不受支持的重启 consumer。
- 完整构建、聚焦 Web 回放、生成目录新鲜度、包约束、不变式接线、文档检查与 lint 覆盖随附组合。

## 后果

新增进程使 CLI 负责 Web 信号与退出传播。重启存在短暂停机；如果更新删除稳定入口路径，或生成无法启动的 worker，重启仍可能失败，该失败会成为 CLI 结果，不会再次作为重启重试。并发检查观察当前状态，不会锁住未来提交，因此提交时复查可能取消已请求的重启。Agent/job registry 之外持有的后台工作只能由普通应用 teardown 发现。源码构建可能临时替换旧 worker 下方的静态文件；已加载应用与 supervisor 会保持可用，但不保证每个构建阶段都能加载新的浏览器页面。

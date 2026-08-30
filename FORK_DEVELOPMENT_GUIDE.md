# DeepSeek Harness 个人 Fork 开发手册

本手册是 `Holiday-C/deepseek-harness` 的日常开发入口。每次开始改造前先按本手册确认范围、文档、分支和验证计划；具体技术约定仍以链接的仓库文档和目标包源码为准。

更新官方源码、重新构建、启动、备份和回退使用 [个人 Fork 更新与重新部署手册](FORK_UPDATE_AND_DEPLOY_GUIDE.md)。

## 当前开发边界

- 本地仓库：`/Users/holidz/opensource/dsh/deepseek-harness`
- 个人远程 `origin`：`https://github.com/Holiday-C/deepseek-harness.git`
- 官方远程 `upstream`：`https://github.com/deepseek-ai/deepseek-harness.git`
- 官方镜像分支：`master`，只同步 `upstream/master`
- 个人集成分支：`custom/main`
- 功能分支：从 `custom/main` 创建 `feature/*`、`fix/*` 或 `docs/*`

不要在 `master` 上开发，不要向 `upstream` 推送，不要把 API Key、凭据文件、`.env`、构建产物或 `~/.dsh` 数据提交到 Git。

## 每次开发前的五分钟检查

进入仓库并确认当前状态：

```bash
cd /Users/holidz/opensource/dsh/deepseek-harness
git status --short --branch
git remote -v
```

如果本次工作不包含同步官方更新，直接从最新个人集成分支创建功能分支：

```bash
git switch custom/main
git pull --ff-only origin custom/main
git switch -c feature/简短功能名
```

创建分支后依次完成以下判断：

1. 明确用户可观察的成功条件，以及明确不做什么。
2. 找到目标目录中全部适用的 `AGENTS.md`；根 [AGENTS.md](AGENTS.md) 永远适用，越靠近目标文件的规则越具体。
3. 改动 `packages/` 前阅读[架构文档](docs/architecture.zh.md)、[包规则](packages/AGENTS.md)、目标分组 README 和目标包 README。
4. 搜索现有实现、测试、活跃 Agent Note 和事故复盘，不从冻结的 `.agents/notes/archived/` 推导当前行为。
5. 在写代码前确定扩展点、持久化影响、模型/UI 可见影响、安全边界、文档归属和验证命令。

推荐的初始搜索：

```bash
rg "相关服务名|事件名|工具名" packages docs .agents/notes
rg --files 目标目录
```

## 先选择最小改造层级

按以下顺序选择能够完成目标的最小层级：

1. 只需要复用操作经验时，创建 Skill，不增加运行权限。
2. 只需要改变组合或配置时，使用 profile、bundle patch 或 `--patch` overlay，不修改核心代码。
3. 需要新增模型动作时，优先创建独立 Tool 插件。
4. 需要可替换的底层能力时，设计 Service Definition、Service Provider 和 Consumer 完整能力 seam。
5. 只有现有扩展点无法表达目标时才修改核心包；修改 `agent-loop` 必须同步更新[架构文档](docs/architecture.zh.md)。

官方仓库当前不接受外部 PR，并鼓励社区插件独立发展；详见[贡献说明](CONTRIBUTING.zh.md)。个人改造若能作为树外插件交付，优先放在独立插件仓库，减少以后合并官方更新时的冲突。

## 架构判断

### 一切都是 Cordis 插件

模型适配器、工具注册表、会话日志和 agent loop 都通过 Cordis 组合。新行为应挂到已记录的服务或事件扩展点，而不是直接依赖具体实现或给循环打补丁；完整映射见[架构文档](docs/architecture.zh.md)和[扩展插件形态](docs/cookbook/extension-cookbook.zh.md)。

所有注册都属于 effect：使用 `ctx.effect()`、`ctx.on()` 或返回 disposer 的注册方法，使插件卸载时能够撤销自己的贡献。涉及生命周期、异步清理、并发或子进程前必须阅读[防御性模式](docs/defensive-patterns.zh.md)。

### 选择正确的事件域

- 需要跨重启保留的事实使用会话事件，并扩展 `SessionEventMap`。
- 观察或拦截活跃 agent 工作使用 `agent/*` 事件。
- 文件、工具、遥测等能力策略使用所属能力事件。

任何抵达模型请求的内容都必须能从会话日志重建。新增模型可见输入时，必须同时设计持久事件、投影、回放和快照覆盖。

`waterfall` 监听器只有在有意短路时才不调用 `next()`；普通观察、标注或包装监听器必须委托。事件流细节见 [Cordis 入门](docs/cordis-primer.zh.md)、[Agent 生命周期](docs/agent-lifecycle.zh.md)和[工具执行流水线](docs/tool-execution-pipeline.zh.md)。

### 设计完整能力 seam

可替换能力包含三种角色：Service Definition 声明 `ctx.<key>` 和共享类型，Service Provider 实现能力，Consumer 使用能力并可能向模型注册工具。角色需要独立演进时拆包；扩展插件依赖 Service Definition，不依赖具体 Provider。

包分组、稳定性和职责以[包目录](packages/README.zh.md)为准。确定目标包后直接阅读该包 README、源码和测试，并通过源码 import、`inject` 与 `ctx.<key>` 搜索真实依赖，不为个人开发另建或重建插件索引。

## 按改动类型阅读

| 改动类型 | 开工前必读 | 主要验证 |
|---|---|---|
| 第一个本地插件 | [第一个插件](docs/user/develop/basic/index.zh.md)、[插件配置](docs/user/develop/basic/config.zh.md) | 真实 Loader 组合、插件卸载清理 |
| 新 workspace 包 | [添加 workspace 包](docs/cookbook/adding-a-package.zh.md)、目标分组和包 README | `constraints`、类型检查、包测试、构建和 hygiene |
| 新工具或工具行为 | [工具编写参考](docs/cookbook/adding-a-tool.zh.md)、[`dsh-tools` README](packages/core/tools/README.zh.md) | 参数/结果/错误/取消测试、真实组合、模型与 UI 快照 |
| 新模型提供方 | [添加 LLM 适配器](docs/cookbook/adding-an-llm-adapter.zh.md)、[`dsh-llm` README](packages/llm/llm/README.zh.md) | 流协议测试、取消/错误测试、真实 API e2e |
| Skill | [Skill 子系统](docs/subsystems/skills.zh.md)、[本地 Skill 提供方](packages/skill/skill-filesystem/README.zh.md) | 发现、策略、加载和目录刷新测试 |
| Web UI | [Client 规则](packages/client/AGENTS.md)、[Web 样式](docs/web-styling.zh.md) | `test:gui`，可见输出变化再跑 Web 快照 |
| 会话或持久化 | [Session 子系统](docs/subsystems/session.zh.md)、[持久化子系统](docs/subsystems/persistence.zh.md)、目标包 README | 回放、恢复、损坏输入、两套 SDK 快照 |
| 配置、profile 或 bundle | [CLI 参考](apps/cli/reference/README.zh.md)、[`app-boot` README](packages/boot/app-boot/README.zh.md) | `--dump-config`、Loader 真实组合、启动失败路径 |
| 生命周期、并发、子进程 | [防御性模式](docs/defensive-patterns.zh.md)、目标能力 README | 取消、资源释放、竞态、进程树和错误路径 |
| Native Landlock | [Native 入口](native/README.zh.md)、[Landlock 规则](native/landlock-run/AGENTS.md) | 对应平台构建、探测、CLI 约定和真实内核测试 |
| Python SDK | [Python SDK](python/README.zh.md)、[Python 开发流程](python/development.zh.md) | Python 测试、运行时冒烟和两套快照 |
| 第三方依赖 | [Third-Party Notices](THIRD_PARTY_NOTICES.md)、[vendored 清单](vendor/README.md) | 许可证检查、notices 生成与完整依赖闭包审查 |
| 个人手册或单个插件 README | [文档规则](docs/AGENTS.md)、[双语规则](docs/i18n/README.zh.md) | 链接、换行、双语配对（若适用）、lint 和 `git diff --check` |

目标包的 README 是该包配置、语义、失败、限制、扩展点和模型体验的日常权威来源。个人开发不维护额外的插件索引；只有改动官方生成物的拥有源时，才按其原有说明运行对应校验。

## 编码约定

### 插件与包

- 函数插件使用具名导出 `name`、`inject`、`Config` 和 `apply`，不混入默认导出。
- Service 包默认导出 Service 类。
- 每个包名使用 `@deepseek-ai/dsh-<name>`，并只加入 Host 或 Client 一个 TypeScript aggregate；`api/remotes` 是唯一既有特例。
- 跨包使用包名导入，包内相对导入使用显式 `.ts` 后缀；仓库全部使用 ESM。
- 每个包拥有 `./invariant`，运行时不变式验证包真正拥有的关系，而不是只检查服务或方法存在。

完整包结构、manifest、README 和注册要求见[添加 workspace 包](docs/cookbook/adding-a-package.zh.md)与[开发指南](docs/development.zh.md)。

### 配置和错误

- 不把部署可调值写成硬编码常量；通过经过 Schemastery 校验的 `Config` 暴露，并从 `cordis.yml` 配置。
- 自身完备的错误配置在加载时失败；依赖其他资源的错误在最早可判断的位置失败，不静默跳过。
- 包边界先显式解析默认值，再执行操作；不要在执行深处用隐式 `?? default` 隐藏配置决定。
- 凭据只保存引用或放在受管理来源中，绝不提交真实密钥。

### 类型和公开接口

- 保持 TypeScript `strict` 和 `noImplicitAny`；剩余 `any` 必须说明为什么无法收窄。
- 封闭联合使用判别字段并以 `assertNever` 收尾；可扩展联合保留记录清楚的默认分支。
- 跨持久化、文件、进程、worker、网络、模型和工具 JSON 边界做运行时校验；同进程类型化调用不重复防御。
- 跨边界的不透明 ID 使用 branded type，不使用裸 `string`。
- 公开 Service 方法和导出写完整 JSDoc，包括参数、返回、错误、取消、时序、所有权和持久性。

### 安全和外部副作用

- 权限、审批、沙箱和工具可见性是独立机制；不要把提示词当成强制安全措施。
- 携带凭据的 HTTP 请求禁止自动跟随重定向；`packages/web/AGENTS.md` 是该规则的权威来源。
- 不可信命令环境移除可能携带密钥的变量；临时与 spill 文件使用私有随机路径和最小权限。
- 删除可能为符号链接或 junction 的路径时先 `lstat`，只 unlink 链接本身。
- 插件卸载必须等待资源完全停稳；只发取消信号后立即返回不算清理完成。

## 文档与设计记录

代码改动必须同步更新所属 README 和 JSDoc。模型、UI、CLI、诊断文本都是行为，修改后需要相应快照或真实入口验证。

非平凡行为、架构、跨包约定、流程、测试策略、磁盘或 wire 格式决策需要新增或更新活跃 Agent Note；先搜索已有 Note，避免重复。Agent Note 的位置、状态、结构和 alternatives 要求见 [.agents/notes/README](.agents/notes/README.zh.md)。冻结归档不得修改，也不是当前行为来源。

文档事实各有唯一归属：架构总览放 `docs/architecture*`，类型和语义放 `docs/subsystems/`，操作步骤放 `docs/cookbook/`，包约定放包 README，设计理由放 Agent Note，事故原因放 `docs/postmortem/`。

双语范围内的文档必须同时更新英文、中文和 `.i18n.yaml`，并用精确 pair 参数重新记录。生成的英文目录不得手工修改。`THIRD_PARTY_NOTICES.md` 由脚本生成，新增或删除依赖后运行：

```bash
corepack pnpm run gen-third-party-notices
corepack pnpm run verify-third-party-notices
```

## 测试计划

测试策略以 [docs/testing.zh.md](docs/testing.zh.md) 为准。写代码前先列出本次变化会影响哪些层，选择能在回归时真实失败的最小证据。

| 变化表面 | 至少需要的本地证据 |
|---|---|
| 单包实现 | 目标 Vitest 文件或测试名；必要时对受影响源码做聚焦覆盖率 |
| 注册表贡献 | dispose 所属 fiber 后验证贡献消失的 HMR 安全测试 |
| 产品可见插件 | 通过 Loader 和真实 app/process 启动的非单元组合测试 |
| 模型、协议、CLI 或终端输出 | 所属可运行示例的 keyless 快照 |
| Web 组件或浏览器可见输出 | `corepack pnpm run test:gui`；组装输出变化再跑 `DSH_SNAPSHOT=replay corepack pnpm run test:web` |
| LLM 或外部提供方 | 无密钥协议测试；凭据可用时跑对应真实 API e2e |
| package manifest、export、构建或 bin/worker | `build`、相关 hygiene 和已构建入口冒烟测试 |
| 个人手册或单个插件 README | Markdown 链接、换行、双语配对（若适用）、lint 和 `git diff --check`；不为此重建插件索引 |
| 生命周期、并发、取消或子进程 | 错误、取消、竞态、完全释放和真实入口路径测试 |

不要默认运行全仓测试或重复已经通过的检查。CI 负责完整覆盖率和平台矩阵；本地完整演练只在变更确实跨全仓、排查 CI，或用户明确要求时运行。

真实 e2e 必须验证文件、进程、协议或其他外部状态，不用模型自己的文字声明代替结果。只 mock LLM、网络、时钟等昂贵或非确定性边界，其余尽量使用真实实现。

## 提交前检查

先查看完整差异，不提交无关文件：

```bash
git status --short --branch
git diff
git diff --check
```

获取个人集成分支并检查本分支相对它的完整范围：

```bash
git fetch origin
corepack pnpm --silent run change-scope --base origin/custom/main
```

根据上面的测试矩阵运行一次相关检查。个人手册或单个插件 README 变更至少运行不生成目录的定向检查：

```bash
corepack pnpm run verify-md-links
corepack pnpm run verify-md-wrap
corepack pnpm run verify-translation-pairing
corepack pnpm run lint
git diff --check
```

如果改动的是官方生成文档的拥有源、文档站配置或跨文档结构，再按对应文档说明运行更完整的校验；不要仅因修改一个插件 README 就创建或重建个人插件索引。

检查通过后，只添加属于本次工作的文件：

```bash
git add 具体文件路径
git diff --cached
git diff --cached --check
git commit -m "类型: 简要说明"
```

推送到个人 Fork：

```bash
git push -u origin 当前分支名
```

pre-push hook 会运行增量类型检查。不要仅为了推送再次手动重复已经通过的 typecheck；如果 hook 或相关检查失败，修复后再推送，不跳过钩子。

推送后验证远程提交与本地一致：

```bash
git rev-parse HEAD
git rev-parse origin/当前分支名
```

## 代码评审与合并

在个人 Fork 中把功能分支的 Pull Request 目标设为 `custom/main`，不要误选 DeepSeek 官方 `master`。评审时优先检查行为、失败、时序、所有权、安全、持久化和测试证据，再检查实现风格。

需要改写已推送历史时，先获取远程精确提交，再使用带精确 lease 的 `--force-with-lease`；永远不用裸 `--force`。不熟悉历史改写时，使用普通修复提交最安全。

合并后切回个人集成分支：

```bash
git switch custom/main
git pull --ff-only origin custom/main
```

需要重新构建和部署时继续执行[更新与重新部署手册](FORK_UPDATE_AND_DEPLOY_GUIDE.md)。

## 文档导航

- 项目定位与运行：[README 中文版](README.zh.md)
- 全仓规则：[AGENTS.md](AGENTS.md)
- 架构和扩展点：[架构文档](docs/architecture.zh.md)
- 贡献者环境与构建：[开发指南](docs/development.zh.md)
- 测试层级与快照要求：[测试策略](docs/testing.zh.md)
- 包分组：[packages/README](packages/README.zh.md)
- 包实现规则：[packages/AGENTS.md](packages/AGENTS.md)
- 扩展方式说明：[扩展插件形态](docs/cookbook/extension-cookbook.zh.md)
- 术语：[术语表](docs/glossary.zh.md)
- 决策理由：[活跃 Agent Notes](.agents/notes/README.zh.md)
- 已发生缺陷与防复发规则：[事故复盘](docs/postmortem/README.zh.md)、[防御性模式](docs/defensive-patterns.zh.md)
- CLI、profile 与部署：[CLI 行为参考](apps/cli/reference/README.zh.md)
- 许可证与依赖声明：[Third-Party Notices](THIRD_PARTY_NOTICES.md)

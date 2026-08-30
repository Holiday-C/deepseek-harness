# DeepSeek Harness 个人 Fork 更新与重新部署手册

本手册用于首次安装、同步 DeepSeek 官方源码、把更新合入个人改造、重新构建、启动验证和失败回退。日常功能开发使用 [个人 Fork 开发手册](FORK_DEVELOPMENT_GUIDE.md)。

## 当前环境

- 本地源码：`/Users/holidz/opensource/dsh/deepseek-harness`
- 个人仓库（`origin`）：`https://github.com/Holiday-C/deepseek-harness.git`
- 官方仓库（`upstream`）：`https://github.com/deepseek-ai/deepseek-harness.git`
- 官方同步分支：`master`
- 个人改造分支：`custom/main`
- 默认推送目标：`origin`
- 用户设置与会话：通常位于 `~/.dsh`

`master` 只跟踪官方代码，`custom/main` 承载个人改造。更新流程始终先更新 `master`，再把它作为一个明确的合并提交合入 `custom/main`。

## 第一次安装与启动

当前仓库要求 Node.js 22.19+ 或 24+，并在根 `package.json` 固定 pnpm 版本。当前机器使用 Corepack 调用 pnpm：

```bash
cd /Users/holidz/opensource/dsh/deepseek-harness
node --version
corepack enable pnpm
corepack pnpm --version
corepack pnpm install
corepack pnpm run typecheck
corepack pnpm run build
```

`corepack enable pnpm` 是一次性环境设置：它把项目脚本的嵌套 `pnpm` 调用也需要的 shim 放进 PATH。只运行 `corepack pnpm ...` 而没有启用 shim 时，顶层命令可以启动，但 `build:web` 等子脚本可能以 `pnpm: command not found` 失败。

安装会配置仓库的 Lefthook Git hooks 和双语文档合并驱动。安装或移动检出目录后，如果 hooks 缺失，重新运行：

```bash
node scripts/install-lefthook.mjs
```

启动 Web UI：

```bash
git switch custom/main
corepack pnpm dsh web
```

默认地址为 `http://127.0.0.1:3080`。不自动打开浏览器时使用：

```bash
corepack pnpm dsh web --no-open
```

终端按 `Ctrl+C` 触发优雅停止；等待进程退出后再更新源码或备份数据。

## 平时启动

源码、依赖和构建产物没有变化时无需重复安装和构建：

```bash
cd /Users/holidz/opensource/dsh/deepseek-harness
git switch custom/main
corepack pnpm dsh web
```

源码启动脚本不会自动构建。拉取代码、切换到代码不同的分支或修改源码后，应重新执行 `install` 和 `build`；否则旧的 `lib/` 或前端 bundle 可能继续运行。

## 更新官方源码前

### 1. 停止服务

在运行 DSH 的终端按 `Ctrl+C`，确认进程已经退出。

### 2. 检查工作区

```bash
cd /Users/holidz/opensource/dsh/deepseek-harness
git status --short --branch
```

如果存在未提交改动，先回到所属功能分支提交并推送。不要带着不清楚的修改合并官方更新，也不要使用 `git reset --hard` 清场。

### 3. 记录当前版本

```bash
git switch custom/main
git rev-parse HEAD
git log -1 --oneline
```

记录这个提交，便于判断更新前后的差异。

### 4. 备份用户数据

DeepSeek Harness 仍处于开发者预览阶段，旧会话和设置格式不保证兼容。重要更新前，在 DSH 停止时执行：

```bash
cp -R ~/.dsh ~/.dsh-backup-YYYYMMDD
```

将 `YYYYMMDD` 换成当天日期，并确保目标目录不存在。备份含有个人设置和会话，不要提交到 Git 或公开分享。

## 同步官方仓库

### 1. 更新本地官方镜像

```bash
git switch master
git fetch upstream
git merge --ff-only upstream/master
```

`--ff-only` 保证本地 `master` 不产生个人提交。如果命令失败，先检查：

```bash
git status
git log --oneline --decorate -15
```

不要强制重置或覆盖官方历史。

### 2. 同步个人 Fork 的 master

```bash
git push origin master
```

### 3. 把官方更新合入个人改造

```bash
git switch custom/main
git merge --no-ff master -m "chore: merge upstream master"
```

`--no-ff` 为这批官方更新保留一个明确的合并提交，方便整体审查和撤销。

### 4. 处理合并冲突

查看冲突：

```bash
git status
```

逐个打开冲突文件，依据当前官方实现和个人改造决定最终内容。双语文档记录冲突可在依赖可用时运行：

```bash
corepack pnpm run resolve-translation-pairing-conflicts
```

解决后：

```bash
git add 已解决的文件路径
git diff --cached
git diff --cached --check
git commit
```

如果不准备继续合并，安全退出：

```bash
git merge --abort
```

不要使用 `git reset --hard` 代替冲突处理。

## 更新后的构建与验证

### 1. 同步依赖

```bash
corepack pnpm install
```

这一步会按当前 `pnpm-lock.yaml` 安装精确依赖，并修复仓库 hooks 和文档合并驱动。

### 2. 构建

```bash
corepack pnpm run build
```

构建生成 Host、Client、Typert 和 Web UI 所需产物。源码启动器不会替你执行这一步。

### 3. 选择验证范围

先查看这次官方合并影响了什么：

```bash
corepack pnpm --silent run change-scope --base origin/custom/main
```

官方更新可能跨越多个子系统。至少确认构建成功；个人改造触及的包运行专项测试，单个插件 README 使用开发手册中的定向 Markdown 检查，包发布面或构建配置变化时运行相关 hygiene 和 built smoke。个人工作流不创建或重建插件索引；完整测试选择见[测试文档](docs/testing.zh.md)与[开发手册](FORK_DEVELOPMENT_GUIDE.md#测试计划)。

### 4. 启动

```bash
corepack pnpm dsh web
```

启动目录会成为默认 workspace 根目录。启动前可只查看组合配置而不运行服务：

```bash
corepack pnpm dsh web --dump-config
```

## 重新部署验收

启动后依次确认：

1. `http://127.0.0.1:3080` 可以打开。
2. 设置页中的模型和权限配置仍然可用。
3. 能够选择预期 workspace。
4. 新建会话可以发送简单消息并收到模型响应。
5. 文件读取、命令执行和审批仍符合当前权限预设。
6. 个人改造涉及的 Skill、Tool、Plugin、UI 或协议功能通过专项场景。
7. 终端没有新的启动错误、配置拒绝或插件等待诊断。

验收成功后停止测试实例，再推送个人集成分支：

```bash
git push origin custom/main
```

推送后确认远程与本地一致：

```bash
git rev-parse HEAD
git rev-parse origin/custom/main
```

## 官方更新失败时回退

### 合并尚未完成

```bash
git merge --abort
```

这会回到开始合并前的 `custom/main`。

### 合并已经提交但尚未推送

先找到本次官方合并提交：

```bash
git log --oneline --decorate -15
```

使用反向提交撤销整个合并，不改写已有历史：

```bash
git revert -m 1 合并提交哈希
```

### 合并已经推送

仍然使用 `git revert -m 1`，然后正常推送反向提交：

```bash
git push origin custom/main
```

不要用裸 `git push --force`。如果以后确实需要重写个人分支历史，先读取[个人开发手册](FORK_DEVELOPMENT_GUIDE.md#代码评审与合并)中的 lease 规则。

### 恢复构建和用户数据

代码回退后重新同步依赖、构建并启动：

```bash
corepack pnpm install
corepack pnpm run build
corepack pnpm dsh web
```

只有确认新版数据格式导致问题并且 DSH 已停止时，才从对应 `~/.dsh-backup-YYYYMMDD` 恢复用户数据。先保留当前目录作为故障证据，不要直接覆盖唯一副本。

## 更新个人功能分支

官方更新已经进入 `custom/main` 后，仍在开发的功能分支需要单独合并个人集成分支：

```bash
git switch feature/功能名称
git merge custom/main
```

解决冲突并运行该功能需要的专项测试，再推送功能分支。不要直接从 `upstream/master` 合入功能分支，否则会绕过个人集成分支的统一验证点。

## 检查 Git 配置

```bash
git remote -v
git branch -vv
git config --get remote.pushDefault
```

正确状态应为：

```text
origin    https://github.com/Holiday-C/deepseek-harness.git
upstream  https://github.com/deepseek-ai/deepseek-harness.git
master    跟踪 upstream/master
custom/main 跟踪 origin/custom/main
默认推送目标为 origin
```

## Profile 和树外插件更新

源码仓库更新与 profile 插件更新是两套独立操作。`git pull` 不会自动更新 `$DSH_HOME/profiles/<name>` 中由 pnpm 管理的树外插件。

查看或更新 profile 插件使用：

```bash
corepack pnpm dsh plugin --profile web list
corepack pnpm dsh plugin --profile web update
```

添加、删除或更新 bundle 后必须重启 profile；普通 profile 或 home `cordis.patch.yml` 内容变化可以热重载。插件安装和 profile 层顺序以 [CLI 行为参考](apps/cli/reference/README.zh.md#plugin-management)为准。

从 GitHub 安装的插件可能执行不受 Agent 沙箱保护的 `prepare` 构建脚本。只允许可信源码，固定 commit，并审查 pnpm 的 `allowBuilds` 请求。

## 常见问题

### `dsh: command not found`

源码模式使用项目脚本：

```bash
corepack pnpm dsh web
```

### `pnpm: command not found`

```bash
corepack pnpm --version
```

如果 Corepack 尚未启用：

```bash
corepack enable
```

### 启动报告缺少 Typert、`lib/` 或前端产物

```bash
corepack pnpm run build
```

### 启动后仍显示旧界面

源码启动器不检查已有构建产物是否最新。停止服务，重新运行完整 build，再启动。

### 端口 3080 被占用

确认是否已有 DSH 实例运行。需要其他端口时：

```bash
corepack pnpm dsh web --port 3081
```

### Profile 配置是否正确

```bash
corepack pnpm dsh web --dump-default-config
corepack pnpm dsh web --dump-config
```

`--dump-default-config` 只显示 bundle 层；`--dump-config` 还包含 profile、home 和命令行 patch 层。

## 权威参考

- 源码运行与 CLI：[apps/cli/reference/README.zh.md](apps/cli/reference/README.zh.md)
- 构建与 Git hooks：[docs/development.zh.md](docs/development.zh.md)
- 测试选择：[docs/testing.zh.md](docs/testing.zh.md)
- Profile 与 bundle：[docs/user/develop/basic/publish.zh.md](docs/user/develop/basic/publish.zh.md)
- 用户配置与模型：[docs/user/guide/index.zh.md](docs/user/guide/index.zh.md)
- 开发者预览兼容性：[AGENTS.md](AGENTS.md#pre-release-stance-foundation-over-blast-radius)

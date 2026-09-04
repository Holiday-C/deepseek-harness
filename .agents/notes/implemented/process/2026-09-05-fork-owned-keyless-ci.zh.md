# Agent Note: Fork 自有的无凭据 CI

Status: implemented

[English](2026-09-05-fork-owned-keyless-ci.md) | 中文

## 问题

GitHub Fork 会获得源仓库的 workflow 文件，但不会继承组织运行器池、GitHub App 安装、部署凭据或仓库 Secrets。因此，目标为个人集成分支的 Pull Request 可能在不可用的运行器标签上持续排队，或在 Fork 中无法成立的自动化流程里失败。这些结果不能说明检出变更的状态。

个人集成分支需要完全由 Fork 可用基础设施产生的合并证据。源仓库自动化仍须在源仓库中可用，因为同步上游时会保留相同文件。

## 决策

[`Fork CI`](../../../../.github/workflows/fork-ci.yml) 对目标为 `custom/main` 的 Pull Request 和 `custom/main` 推送运行。每个 job 都检出触发提交，并使用 GitHub 标准托管的 `ubuntu-24.04` 或 `windows-2025` 运行器。该 workflow 不使用仓库 Secrets、Variables、Environments、Actions 缓存、跨 workflow artifact 下载、自定义运行器标签或自托管运行器选择器。

Fork 聚合流程要求仓库的静态检查、覆盖率、消费者检查、Node 兼容性、Python SDK、Wine Windows、原生 Windows 构建和原生 Windows 测试命令全部成功。降低后的工作线程数量适配标准托管容量。真实 provider 测试、部署预览、源仓库运行器基准测试和发布形态的 Python 运行时矩阵不属于这个无凭据聚合流程。

目标为 `custom/main` 的 Pull Request 不会触发源仓库 CI、Cloudflare 预览部署、Issue App 自动化或自动真实 API E2E workflow。源仓库 CI、`master` 运行器检查、部署、Issue App 和自动真实 API job 还会在分配 job 时检查 `github.event.repository.fork == false`。其他 Fork 事件会在 GitHub 选择运行器或向 job 提供凭据前跳过这些 job。同一批文件在非 Fork 仓库运行时，workflow 定义会保留源仓库行为。

## 曾考虑的替代方案

**复制源仓库的基础设施。** 此方案需要在个人仓库中重新配置组织自有运行器、GitHub App、部署账户和 Secret 轮换。Fork 验证集成分支不需要这些服务，而且持续可用性会成为外部合并依赖。

**用 Fork 专用定义替换源 workflow。** 此方案会删除不用的配置，但每次上游 workflow 变更都会造成更大的同步冲突。独立 Fork CI 配合分配时条件可以保留上游定义，同时不在 Fork 中执行。

**将排队和凭据失败视为可选检查。** 此方案会让每个 Pull Request 保留误导性失败和永久运行的 job。专用聚合流程只报告 Fork 能够实际产生的证据。

**从 `master` 恢复缓存。** 仓库作用域的缓存不能从源仓库跨入 Fork，但 Fork 的 `master` 跟踪上游代码，并非个人集成分支。无缓存 job 不会把其他分支的 artifact 当作验证输入。

## 后果

个人集成分支会获得稳定的 `fork checks passed` 结果，其所有必需 job 都能使用 Fork 自己的 GitHub Actions 配额启动。依赖安装以及浏览器或 Wine 准备会在干净运行器上重复执行，因此该 workflow 以耗时换取独立性和明确的数据来源。

聚合结果不代表真实 provider、Cloudflare 部署、企业级运行器或完整打包运行时验证已经通过。需要这些系统的变更必须由开发者显式运行检查，或使用单独配置且归 Fork 所有的 workflow。同步上游时必须保留 Fork 条件和独立的 `Fork CI` 定义。

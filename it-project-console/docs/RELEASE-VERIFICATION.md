# 统一发布工具验证 · 2026-09-09

范围：Phase 10 中的离线打包和统一发布脚本。未部署 `192.168.1.245`，未改动旧应用、公开域名代理或企业数据。本记录不表示整个 Phase 10 完成。

## 实现与母版映射

| 目标 | 复用来源 | 新实现 |
|---|---|---|
| 本机构建 Linux 镜像并离线导出 | 旧项目 `scripts/deploy/publish-to-host.ps1` | `scripts/deploy/package.ps1`，API/Web 分开构建，五镜像按版本归档 |
| SCP 上传、SSH 执行 | 同上 | `scripts/deploy/upload.ps1`、`publish.ps1`，增加 SHA 校验和原子解包 |
| 服务器导入镜像与 Compose 更新 | 旧项目 `scripts/server/deploy-bundle.sh` | 新 `scripts/server/deploy-bundle.sh`，增加独立数据卷、备份、迁移、健康、版本与失败处理 |
| 沿用企业配置 | 旧运行容器的环境变量 | `export-legacy-env.mjs`，只在服务器内输出到私有配置文件 |

旧项目原文根目录为 `D:/Work_Project/itpd-main`。本轮不替换前端母版页面、组件或业务交互。

## 自动检查

| 检查 | 结果 |
|---|---|
| 前后端类型 | 通过 |
| 前后端单元测试 | 183 通过（Web 128，API 55） |
| API 隔离集成测试 | 69 通过 |
| 发布专项测试 | 4 通过：Compose 特殊字符配置、失败不输出半份凭据、产物隐私拒绝、pending 重试失败保护 |
| PowerShell / Bash 语法 | 通过 |
| 真实 Docker 构建 | API 与 Web 的 Linux/amd64 镜像构建成功 |
| 镜像内自有产物审计 | 前端静态资源、API dist、Prisma 通过，共 161 个文本文件 |
| 依赖审计 | 0 critical、5 high、3 moderate；有 high 的包只供隔离验证，生产 Deploy 在改变容器前拒绝 |

高危告警来自既有 Vite/xlsx，详见包内 `dependency-audit.json`。这不是全仓无漏洞声明；依赖整改和基础镜像安全审计仍需在正式上线前完成。[SheetJS 公告](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6)说明了文件读取相关风险，[Vite 公告](https://github.com/advisories/GHSA-v2wj-q39q-566r)说明了开发服务器相关风险；本次未通过改动母版依赖来扩大脚本任务范围。

## 从发布包安装的本地验证

使用 Docker Desktop 中独立 `itpc-test-release-*` 项目和 `/tmp/itpc-release-test-*` 目录，运行真实 Bash 发布脚本；全程只使用假凭据，通知关闭。不是运行开发服务器代替生产镜像。

- 首次空库安装：6 个 migration 执行成功，API/Web 健康，`/health/ready` 返回 200。
- 生产权限：开发登录返回 404，初始 users 数为 0，没有执行演示 seed。
- 特殊字符：实际 PostgreSQL、API、MinIO 容器环境中的 `$`、单引号、`#`、反斜杠凭据逐项相等；API 数据库 URL 解码后的密码相等。
- 第一轮安装、更新和同 schema 回滚通过；不同 schema 的镜像回滚被拒绝。

- 不同镜像升级与回滚：B 的 API/Web 均新增独立镜像标签与可观察 LABEL，镜像 ID 与 A 不同；升级后检查容器实际镜像 ID/tag 等于 B，回滚后精确恢复 A。
- 数据库恢复增强：插入可辨识的 department 业务记录，使用部署生成的 SQL 备份恢复到独立数据库，逐项核验名称和标识，不以仅恢复空表计为通过。
- 备份失败恢复：把测试备份目录替换为普通文件制造失败；脚本报错、未执行迁移，自动恢复 A 健康，current 不变且无 pending。
- 生产准入失败：在本地 runner 的生产路径设置 high=5，部署在创建容器前被拒绝，隔离 auditgate 项目没有任何容器。

失败重试保护：进入部署时已有 pending，说明前次可能已经迁移。此时再次备份失败保持 API/Web 停止并保留 pending，不自动恢复 current。`scripts/deploy/pending-retry.test.sh` 使用真实服务端脚本配合受控 CLI 故障注入验证，作为 `pnpm test:release` 的持久回归项；断网容器运行通过，临时副本恢复旧条件后同一断言确实捕获非法重启，验证测试能发现原缺陷。

上述安装使用首份构建镜像和刷新到最终版本的服务端脚本，逐包重算校验；升级增强镜像仅用于本地试验。测试使用 Docker Desktop Engine 29.4.3，不能替代目标 CentOS 7 / 3.10 内核验收。测试容器、卷、网络和增强镜像已清理，原开发环境和旧系统保持不变。

最终验证包在 pending 重试保护回归通过后重新生成，编号 `20260909-release-tools-v1`。包记录构建时未提交状态，仅供验证，且因 5 项 high 被禁止正式 Deploy。审计整改完成并提交后须重新构建上线包。较早的 `20260909-153525-cb91d601`、`20260909-154828-cb91d601` 为中间验证包，不用于部署。

原始日志：`output/release-package-final.log`、`output/release-smoke/run.log`、`output/release-smoke/upgrade-distinct.log`、`output/release-smoke/failure-gates.log`；汇总与假配置脚本位于 `output/release-smoke/RESULT.md`。本机测试输出不入 Git，结论固化在本记录中。

## 上线前仍需完成

1. 处理已有前端依赖 high 告警并重新打包，完成基础镜像安全审计。
2. 在目标服务器首次初始化并安装新系统，指定首位管理员；仅复用配置不等于已迁移旧业务数据。
3. 验证 MinIO 完整备份与恢复，明确日常备份、保留周期及旧数据迁移范围。
4. 完成旧代理的域名切换、真实钉钉登录/权限/组织同步/通知与核心业务验收。

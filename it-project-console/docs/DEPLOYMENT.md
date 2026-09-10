# 统一打包与服务器发布

入口为 `scripts/deploy/publish.ps1`，在 `it-project-console` 目录运行 `pnpm release`。沿用旧项目的“本机构建 Docker 镜像 → 离线镜像包 → SCP 上传 → 服务器 Compose 更新”流程。

默认目标：`root@192.168.1.245:22`，新系统目录 `/opt/it-project-console`。本机已配置专用 SSH 密钥，直接使用 `ssh hengxin-prod`；发布脚本的 IP 目标同样自动匹配该配置。连接和排障见 [PRODUCTION-ACCESS.md](PRODUCTION-ACCESS.md)。其他机器可通过 `-IdentityFile` 指定其已授权私钥；脚本、Git 和发布包均不保存 SSH 密码。

**当前发布状态（2026-09-10）**：版本20260910-go-live-v2已部署，正式地址为`https://pmg.qhhengxin.top:8443`。Chrome真实钉钉登录及工程师页面、18项目/2需求、公开附件链路、完整回归和备份恢复均通过。正式通知仍关闭。应用依赖high/critical为零，不代表基础镜像无漏洞；保留限制的收尾决策和证据见GO-LIVE-CHECK。

## 环境与边界

- 本机：PowerShell 7 (`pwsh`)、Git、OpenSSH、tar、Node 24.18.1、pnpm 11.24.0、Docker Desktop Linux 容器模式。打包包含源码检查、隔离集成测试，须先运行本地开发基础设施。
- 服务器：Docker 与 Compose v2、Bash、curl、flock、sha256sum、tar。已只读确认目标服务器具备这些基础条件；其 CentOS 7 / 3.10 内核使用旧项目现有的 PostgreSQL 单服务 `seccomp:unconfined` 兼容处理。
- 新系统采用独立 PostgreSQL / MinIO 数据卷、数据库和桶。初始化沿用旧系统必要的数据库密码、S3 凭据、钉钉应用配置和公开地址，**不会复制旧业务数据、会话或本地演示数据**。
- 新 Web 默认只监听服务器 `127.0.0.1:18080`。脚本不会修改旧系统的 80/443、TLS 证书、代理配置或外部 8443 映射。因此执行 Deploy 后，公开域名仍由现有代理决定；正式切换代理是后续上线步骤。
- 初始通知关闭，生产演示登录关闭。正式使用前需要指定首位管理员，并完成真实钉钉登录、组织同步、业务操作和附件验收，再受控开启通知。

## 1. 本机打包（默认动作）

```powershell
cd D:\Work_Project\hengxin-devhub\it-project-console
pnpm release
```

默认版本号为时间戳与 Git 短哈希，也可传 `-Release 20260909-v1`。同版本目录存在时拒绝覆盖。

产物位于 `output/releases/<版本>/`：

- `itpc-<版本>.tar.gz` 和外部 `.sha256`：上传用离线包及校验值。
- 包内 `images.tar`：API、Web、PostgreSQL、MinIO、mc 的 Linux/amd64 镜像；服务器无需拉取或编译应用。
- `compose.production.yaml`、服务端脚本、`release.env`、`manifest.json`、`SHA256SUMS`：运行配置、版本和完整性记录。
- `dependency-audit.json` 同时留在包内和包外，`payload-audit/` 仅在包外：构建审计结果。存在 critical 依赖漏洞、测试失败或自有产物隐私检查失败时停止打包；有 high 时只生成验证包，正式 Deploy 拒绝运行。

包内没有 `server.env`、旧项目凭据或本机 `.env`。Git 未提交改动会记为 `manifest.dirty=true`；正式上线包应在提交完成后重新构建，以便追溯。

## 2. 首次配置与安装

用打包输出的实际路径替换示例中的 `<版本>`：

```powershell
$bundle = 'D:\Work_Project\hengxin-devhub\it-project-console\output\releases\<版本>\itpc-<版本>.tar.gz'
pnpm release -Action Initialize -BundlePath $bundle -BootstrapAdminDingUserId '实际钉钉用户ID'
pnpm release -Action Deploy -BundlePath $bundle
pnpm release -Action Status
```

Initialize 上传并校验包，然后在服务器内部读取 `itpd-prod-app-1` 的运行配置，生成权限 `0600` 的 `/opt/it-project-console/server.env`。已有配置时拒绝覆盖；配置缺项时不生成半份文件。若暂未指定管理员，部署可以启动，但正式登录验收前必须在服务器配置真实 `BOOTSTRAP_ADMIN_DING_USER_ID` 并重新启动 API。

Deploy 校验包 → 导入镜像 → 启动新系统基础设施 → 停止新 API/Web 写入 → 备份新数据库 → 执行迁移 → 启动 API/Web → 健康检查 → 更新 `current`。首次安装得到空业务库，绝不执行开发 seed。

要先只上传、不生成配置和不启动服务：

```powershell
pnpm release -Action Upload -BundlePath $bundle
```

远程验收前可使用 SSH 隧道把服务器内部端口带到本机；钉钉 OAuth 验收仍需正确的公开域名和回调代理链路。不要通过本地演示登录代替钉钉验收。

本服务器的独立 HTTPS 联调可使用 `deploy/compose.preview.yaml` 和 `preview.nginx.conf`：只读复用 `itpd-prod_tls_certs_prod`，连接 `itpc-prod_default`，仅绑定服务器 `127.0.0.1:18443`。将这两个文件上传新系统 `preview/` 后，以当前 `release.env` 启动独立 `itpc-preview` 项目。此操作不修改旧代理。通过 SSH 转发本机 8443 到服务器 18443，再用专用浏览器进程的 `--host-resolver-rules=MAP pmg.qhhengxin.top 127.0.0.1` 访问 **`https://pmg.qhhengxin.top:8443`**（必须保留 8443 端口，旧 NEXTAUTH_URL/S3_PUBLIC_ENDPOINT 也含该端口）；仅该浏览器看到新系统，系统 hosts 和普通浏览器不变。

## 3. 以后统一更新

```powershell
pnpm release -Action Deploy
```

这一条会先构建新版本包，再上传和更新。已有 `server.env` 持续沿用。也可先 `pnpm release` 检查产物，再以 `-Action Deploy -BundlePath $bundle` 发布同一份包。

更新期间有短暂停机，健康检查通过才把版本标记为成功。默认不删除旧镜像、旧包或备份；需按磁盘容量制定保留周期，不能使用全局 Docker prune 代替本项目清理。

## 4. 状态、回滚与失败处理

```powershell
pnpm release -Action Status
pnpm release -Action Rollback
```

- `current`：最近成功版本；`previous`：前一个成功版本；`pending`：尚未成功的发布。
- 正常 Rollback 回到 previous；发布失败且存在 pending 时回到 current。首次安装失败没有历史成功版本，不能凭空回滚。
- 仅迁移指纹相同且基础镜像引用相同，才允许镜像回滚；数据库结构变化时拒绝自动回退，保留备份并要求先制定数据库恢复方案。不能把镜像回滚当成数据恢复。
- 数据库备份位于 `backups/*.sql`，权限 `0600`。迁移失败时新 API/Web 保持停止，避免继续写入不确定的数据库；查看错误后重试同一版本，或按备份恢复方案处理。
- 若本版本首次尝试在迁移前备份失败，脚本会恢复 current 的 API/Web 并检查健康；存在 pending 的失败重试可能已改变数据库，保持停止并保留 pending，须先检查迁移与备份状态。无法恢复或首次安装无 current 时，修复备份条件后重试请求的版本。
- PostgreSQL / MinIO / mc 版本变化会在更新前被拒绝，需专门安排兼容性验证和数据迁移。
- Deploy自动生成迁移前PostgreSQL备份；完整数据库+MinIO备份另由`backup-full.sh`和每日03:30任务执行，已完成隔离恢复演练。CSV20导入及正式代理切换已完成，记录见GO-LIVE-CHECK与MIGRATION-ASSESSMENT。

服务器 `server.env` 应保持 `0600` 或 `0400`，不可把它加入 Git 或作为发布附件回传。`deploy/server.env.example` 仅供无旧应用可读取时人工初始化参考。

## 验证入口

```powershell
pnpm test:release
```

覆盖配置导出完整性、特殊字符的 Compose 解析、产物隐私拒绝和失败发布重试保护。测试需 Docker；故障回归在断网容器中使用受控 CLI，不接触业务容器。实际镜像安装、升级、回滚与故障场景结果见 `RELEASE-VERIFICATION.md`。

## 2026-09-09 正式上线收尾最新状态

完整数据库+MinIO备份及隔离恢复通过（21表、2对象摘要一致），每日03:30备份/14批保留及失败状态已启用。新旧HTTPS候选代理及回退登录页检查通过，正式入口未切换：实际运行镜像扫描存在CRITICAL，image-gate明确阻断，旧代理路由未改。新系统仍健康，通知关闭。详见GO-LIVE-CHECK.md；前文“上线前仍需完成”各项以该文件最新证据为准。

## 2026-09-10 正式入口与日后维护

上述9月9日状态已由本次正式切换取代。正常更新继续在产品目录运行`pnpm release -Action Deploy`，无需重新Initialize、导入CSV或执行首次切换；统一脚本保留server.env及基础设施，失败按Status/同迁移指纹Rollback处理。

公开入口目前复用`itpd-prod-proxy-1`，TLS与旧配置备份保留于`operations/go-live-20260909`，新路由动态解析`itpc-prod-web-1`。代理同时接入旧默认网络和`itpc-prod_default`，服务重启会保留连接；若另外重建旧代理容器，必须恢复其新网络连接，之后验证公开/health/ready，不能只验证18080。常规新系统Deploy不重建该代理。

首次切换脚本`cutover-public.sh switch`只用于本次首切，不重复执行。需要恢复旧系统路由时用服务器`bash /opt/it-project-console/operations/go-live-20260909/cutover-public.sh rollback`，新库数据保留；这与新系统版本Rollback不同。旧系统库不会自动接收切换后新系统的数据。

发布包新增 `scripts/server/restore-fingerprint.sql` 和 `deploy/public.nginx.conf`。`cutover-public.sh` 当前仍读取 `/opt/it-project-console/operations/go-live-20260909/` 中的运维副本；入包不等于自动更新该副本。使用前须将审核后的配置/脚本显式同步至该目录，重新执行 `check` 并绑定对应候选 SHA256，不能沿用旧的检查结论。默认 Deploy 不自动切换旧系统公开代理。

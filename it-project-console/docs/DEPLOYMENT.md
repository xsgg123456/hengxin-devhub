# 统一打包与服务器发布

入口为 `scripts/deploy/publish.ps1`，在 `it-project-console` 目录运行 `pnpm release`。沿用旧项目的“本机构建 Docker 镜像 → 离线镜像包 → SCP 上传 → 服务器 Compose 更新”流程。

默认目标：`root@192.168.1.245:22`，新系统目录 `/opt/it-project-console`。SSH 使用交互密码或 `-IdentityFile` 指定的私钥；脚本、Git 和发布包均不保存 SSH 密码。

**当前准入状态（2026-09-09）**：本地验证包已能构建；既有 Vite/xlsx 依赖审计仍有 5 项 high，正式 Deploy 会在改动运行容器之前拒绝该包。下面是整改完成后的统一操作流程，不代表当前已满足上线条件。

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
- 目前脚本仅自动备份 PostgreSQL。对象存储完整备份、定期备份保留、灾难恢复、旧业务数据迁移、正式域名代理切换属于上线前剩余工作。

服务器 `server.env` 应保持 `0600` 或 `0400`，不可把它加入 Git 或作为发布附件回传。`deploy/server.env.example` 仅供无旧应用可读取时人工初始化参考。

## 验证入口

```powershell
pnpm test:release
```

覆盖配置导出完整性、特殊字符的 Compose 解析、产物隐私拒绝和失败发布重试保护。测试需 Docker；故障回归在断网容器中使用受控 CLI，不接触业务容器。实际镜像安装、升级、回滚与故障场景结果见 `RELEASE-VERIFICATION.md`。

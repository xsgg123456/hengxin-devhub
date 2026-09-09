# 服务器联调记录 · 2026-09-09

目标：`192.168.1.245`，新系统 `/opt/it-project-console`。本轮用户授权独立部署、复用旧配置与四位现有管理员，企业验收通过前保留旧公开入口。

## 依赖与构建准备

- Vite 7.1.5 → 7.3.6；SheetJS 0.18.5 → 官方 0.20.3 tarball，锁文件固定 SHA-512。原 Art Excel 组件未改。
- 类型检查、185 个单元测试（Web 130/API 55）、生产构建、锁文件重装通过。
- `pnpm audit --prod --json`：所有等级均为 0。原始记录在 `output/dependency-remediation-*`。
- 发布专项 5 项通过，包括真实 Nginx 成功、OAuth/S3 502、健康失败、静态资源 404 日志不泄露查询串或 Referer；访问日志使用 server 层安全格式，覆盖基础镜像默认 combined 日志，server 层统一关闭未经脱敏的错误日志。
- [SheetJS 官方发行方式](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/)，[Vite 安全修复](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff)。依赖审计不替代基础镜像与运行环境安全验收。

## 服务器初始状态

只读确认：CentOS 7 / kernel 3.10.0-1160.el7，Docker 24.0.9、Compose 2.27.1，磁盘可用约 133 GiB。旧应用/代理/数据库/MinIO 均正常；新目录尚不存在，18080 未占用。

## 执行与验收

| 项目 | 状态 |
|---|---|
| 安全依赖修复 | 通过 |
| 新版发布包与校验 | 待执行 |
| 服务器独立安装和健康 | 待执行 |
| 配置沿用与钉钉组织同步 | 待执行 |
| 四位管理员配置 | 待执行 |
| HTTPS 预览、附件及权限检查 | 待执行 |
| 用户真实钉钉授权登录 | 待用户参与 |
| 公开入口切换 | 企业验收前不执行 |

预览采用只读旧 TLS 卷与独立回环代理，配合 SSH 隧道和专用浏览器域名解析；不改变旧代理配置、系统 hosts 或其他浏览器的访问结果。不使用演示登录或伪造 OAuth 成功作为企业验收。

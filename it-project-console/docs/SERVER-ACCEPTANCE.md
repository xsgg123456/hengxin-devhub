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
| 新版发布包与校验 | 通过：20260909-f9ec611-uat，源版本 f9ec611，dirty=false；上传校验及五个镜像加载成功 |
| 服务器独立安装和健康 | 通过：六个数据库迁移完成，API/Web/PostgreSQL/MinIO/独立 HTTPS 代理均 healthy；旧服务继续运行 |
| 配置沿用与钉钉组织同步 | 通过：181 名有效成员、54 个部门；server.env 权限 0600，演示登录与消息发送关闭 |
| 四位管理员配置 | 通过：姚泽攀为首位管理员，周熹、蒋燕、Albert 均已授权；Albert 的当前钉钉姓名为林炳辰，Union ID 已与旧库核对一致 |
| HTTPS 预览、附件及权限检查 | 部分通过：证书验证、签名上传/下载、对象复制、篡改签名与匿名读取拒绝；未登录接口 401、演示登录 404、无效 OAuth 回调拒绝。登录后的业务权限与附件表单待验收 |
| 用户真实钉钉授权登录 | 通过：张帅实际扫码登录，/api/me 和 /api/workspace 为 200；发现 IT部 被误分 BUSINESS，角色修复待发布 |
| 公开入口切换 | 企业验收前不执行 |

预览采用只读旧 TLS 卷与独立回环代理，配合 SSH 隧道和专用浏览器域名解析；不改变旧代理配置、系统 hosts 或其他浏览器的访问结果。不使用演示登录或伪造 OAuth 成功作为企业验收。

实际安装路径为 `/opt/it-project-console/releases/20260909-f9ec611-uat`，`current` 已指向该版本。首次迁移前数据库备份已生成；通讯录及管理员初始化后另生成 `/opt/it-project-console/backups/20260909-post-directory.sql`（90,246 字节，权限 0600），恢复验证仍待执行。初始化首位管理员 ID 曾多录一位，已按旧生产库核实修正并重建新 API 容器，通讯录同步后完成四人授权和审计。

独立浏览器已打开钉钉官方二维码页面，回调使用 `https://pmg.qhhengxin.top:8443/api/auth/callback/dingtalk`。需要用户实际扫码授权后验证会话、角色和业务操作；公开入口仍指向旧系统。新库项目与需求均为 0，未迁移旧业务数据。基础镜像安全验收、MinIO 备份恢复、真实消息验收及切换前最终检查仍待完成。

用户已使用自己的公司钉钉账号完成联调登录，后端返回张帅、IT部、BUSINESS。管理员候选接口 403，公开只读管理名单为 200，符合全员只读规则；IT部 应映射工程师，已修正源代码并通过 Web 136 项及 API 72 项隔离集成测试，等待审查和重新部署。四位领导的管理员专属操作另行验收。

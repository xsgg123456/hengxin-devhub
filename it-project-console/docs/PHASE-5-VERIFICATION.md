# Phase 5 后端基础验收

日期：2026-09-08。启动依据：用户明确确认前端评审版并要求开始后端。本期完成基础服务与附件链路；真实需求/立项 API 和前端接入属于 Phase 6，钉钉身份属于 Phase 9。

## 交付映射

| 交付 | 实现与验证 |
|---|---|
| Fastify/配置/统一响应 | `api/src/app.ts`、`config/env.ts`、`routes.ts`；Zod严格输入、统一400/401/403/404/500、Helmet/CORS/限流、日志脱敏 |
| OpenAPI/健康检查 | 开发环境 `/docs`；`/health/live` 存活，`/health/ready` 同时检查真实PostgreSQL和MinIO |
| 独立基础设施 | `compose.yaml` 独立project、PostgreSQL16数据库、MinIO私有Bucket、专属volumes；端口只监听127.0.0.1 |
| Prisma/迁移/种子 | 11个基础模型；snake_case、唯一键、外键；migration部署两次；seed仅开发/测试允许，重复不覆盖编辑 |
| 会话/RBAC | 数据库仅存随机token的SHA-256，HttpOnly/SameSite Cookie，生产Secure；每请求重读角色/停用状态，退出撤销 |
| 开发入口隔离 | 仅非production且DEV_LOGIN=true注册四账号登录；生产拒绝开启开发登录及非HTTPS Origin |
| 项目关系/事务基础 | Project唯一非空primaryOwnerId，ProjectMember仅协作且唯一；outbox幂等键与业务写入同一事务，冲突回滚 |
| 附件安全 | 申请/PUT/确认/下载；类型MIME、单20MB/总50MB、需求所有者和状态限制；行锁防并发配额穿透 |
| 重放与确认竞态 | staging临时对象经ETag条件Copy到客户端不可写的final，再Head核验，防旧签名重放覆盖已确认文件 |
| 下载/清理 | 登录后5分钟预签名，强制attachment/octet-stream；过期清临时对象，READY保留final；清理失败脱敏日志并重试 |
| 测试隔离 | `api/scripts/integration.ts` 随机schema/Bucket，文件入口也验证隔离前缀，成功失败均回收，不操作开发业务记录 |
| 操作说明/门禁 | `BACKEND-DEVELOPMENT.md`，根workspace统一脚本，提交检查新增真实后端隔离集成 |

## 复用与修正

S3适配从只读旧项目 `itpd-main/lib/s3.ts` 收窄移植，保留双endpoint、SDK预签名、Head/Get/Put/Delete，新增条件Copy。没有带入旧Next.js、AI、工时模型；未使用旧数据库或Bucket。前端业务源码本轮未改，仍沿用Art底座及独立原型数据。

集成过程修复管理权限preHandler同步函数导致成功请求等待的问题；改成async并由真实管理员200/普通账号403用例覆盖。PrismaPg显式设置schema与原生SQL search_path，测试确认ORM和raw SQL同在隔离schema。审查要求补充定时清理failed返回日志，已实现并增加调用层测试。

## 验证证据

- `pnpm check`：前后端typecheck通过；Web 13文件91单测，API 5文件20单测通过；API生成/TypeScript构建通过；Web生产构建1434 modules、5.51s。
- `pnpm --filter @it-project-console/api test:integration`：3文件20测试通过，4.27s；迁移连续部署两次，第二次无待执行项；测试schema/Bucket已回收。
- `pnpm exec playwright test --workers=2`（web目录）：34 passed（1.7m），原前端完整回归通过。
- `python -X utf8 -m unittest discover -s tests -v`：19 tests，OK（20.486s）。
- 实际API 4322端口：`/health/live` 返回 `{data:{status:ok}}`，`/health/ready` 返回 `{data:{status:ready}}`，`/docs` HTTP200；PostgreSQL和MinIO容器healthy。
- `pnpm audit:api`：API完整依赖路径0条公告（含开发依赖），exit0。不是全workspace零告警声明。
- 独立code-review：Stage 1 PASS、Stage 2 PASS，无遗留HIGH/MEDIUM；初审的清理日志、工具链审计和Compose文档问题均已关闭。

原始日志在 `output/phase5-check.log`、`phase5-integration.log`、`phase5-web-e2e.log`、`phase5-harness.log`、`phase5-api-audit.log`。本地服务日志不入库。源码单文件不超过300行（生成文件不入库），无新增显式any。

## 依赖审计范围

保留锁定Prisma7.10稳定版本，未跟随npm最新的8.0 RC。对Prisma间接deepmerge-ts/mysql2固定8.0.0/3.23.1；对Vitest间接Vite固定7.3.6，完整重跑生成、迁移和前后端测试。

公告依据：[DeepmergeTS循环对象耗尽](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)、[Vite Windows路径绕过](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff)。API审计脚本检查审计报告中所有真实 `api>` 路径，不依赖不能隔离workspace的 `--filter` 参数。

现有前端直接Vite7.1.5及xlsx保留8条公告（5 high、3 moderate），已列入Phase10发布前整改；当前前端仅本机预览，未据此宣称可以发布。

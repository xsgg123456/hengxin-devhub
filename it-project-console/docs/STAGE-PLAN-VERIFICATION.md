# 2026-09-11 本地验收记录

范围：`STAGE-PLAN-ITERATION.md` 的 12 项确认需求；原位改造既有前端及 API，无生产写入。

| 检查 | 命令（在对应目录执行） | 结果 |
| --- | --- | --- |
| Web 单元测试 | web: `node node_modules/vitest/vitest.mjs run` | 27 文件、153 条通过 |
| API 单元测试 | api: `node node_modules/vitest/vitest.mjs run --exclude '**/*.integration.test.ts'` | 16 文件、65 条通过 |
| 前后端类型 | web: `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit`；api: `node node_modules/typescript/bin/tsc --noEmit` | 均退出 0 |
| 正式构建 | 产品根: `pnpm build` | API 与生产模式 Web 构建成功 |
| 原型浏览器全套 | web: `node node_modules/@playwright/test/cli.js test --workers=2 --timeout=60000` | 42 条通过，无跳过 |
| 隔离数据库集成 | 产品根: `pnpm --filter @it-project-console/api test:integration` | 13 文件、96 条通过，schema/Bucket 已回收 |
| 真实 API 浏览器 | 产品根: `pnpm --filter @it-project-console/api test:browser` | 7 条通过，schema/Bucket 已回收 |
| 发布配置回归 | 产品根: `pnpm test:release` | 6 条通过；仅本地 Docker 测试 |
| 仓库门禁 | 根: `python -X utf8 -m unittest discover -s tests -v` | 20 条通过 |
| 独立代码审查 | code-reviewer 两阶段 | 无未解决 HIGH/MEDIUM |

Windows 沙箱不能访问 Docker，且 Git 子进程在沙箱内不能加载 Python；相应测试改在获得自动审批的本地执行环境运行。没有关闭门禁或跳过用例。

关键证据：

- `web/e2e/stage-plan.spec.ts`：无日期创建、排期前禁止执行、五环节排期、改期必填原因、首排与改期留痕、无百分比/日期执行、自动完成不归档及刷新持久。
- `web/e2e/demand-filters.spec.ts`：部门/提交日期/完成筛选同源更新指标、图表、清单，空态和重置。
- `web/e2e-live/phase7-workflow.spec.ts`：真实角色切换、首次排期/调整计划日志、协作不重置整体更新时间、验收自动完成、管理重开。
- `api/src/modules/progress/progress.integration.test.ts`：权限/版本/幂等、通知故障事务回滚、旧完成证据迁移、只有完成时间的阶段历史可读且可管理回退。
- `api/src/modules/dashboard/dashboard.integration.test.ts`：上海日期边界、正常/延期/未知、最新工程师计划及全部统计同源。
- 实际前端截图：`output/playwright/stage-plan-implemented/`（产品目录下）；真实 API 截图：`output/phase7-live-*.png`。均由浏览器截图产生。

以上为部署前本地验收。旧前端提交人工百分比/日期的进度请求不再支持，前后端必须一起发布。迁移不捏造旧计划；旧项目首次执行前补齐当前及后续计划。已完成项目无实际证据时保持未知。

## 生产部署验收（2026-09-11 11:42 后）

- 用户明确授权后发布 `20260911-ee53742`，源码提交 `ee53742c3819e2a3c68d3d5c0ef16e20d48727d4`；包 manifest 的 dirty=false。
- 发布包 485855512 字节，SHA256 `18415fdfdea43e8b9bfde74a6095766303e560a0221cc52c1cc10239c4653f94`；上传归档及服务器逐文件摘要校验通过。应用依赖审计 high=0、critical=0，实际镜像产物隐私检查 168 文件通过。沿用既有数据库和 MinIO 镜像，未扩大底层整改范围。
- 实际 API 发布镜像在独立临时数据库两次运行迁移成功，8 条迁移无待执行项；临时容器、卷及网络已清理。
- 完整备份：`/opt/it-project-console/backups/full/20260911T034033Z-50795`，BACKUP_OK；部署前 SQL 备份：`/opt/it-project-console/backups/20260911T034158Z-52227.sql`。
- 生产执行 `202609110001_stage_plans` 成功，脚本输出 `Deployment healthy: 20260911-ee53742`。current 指向该版本；API/Web/PostgreSQL/MinIO 均 healthy，readiness=ready。
- 部署前后项目 19、需求 4；项目旧字段、需求、39 条进度、133 条阶段历史、2 条附件的逐表摘要全部一致。19 个旧项目均未伪造阶段计划。部署前无“验收已完成但项目仍进行中”数据，本次没有额外自动完结旧项目。
- 正式 HTTPS 首页/脚本/健康成功，未登录 me=401、开发登录=404、钉钉回调地址及安全 Cookie 校验通过。正式附件预签名上传下载摘要一致，匿名/危险编码请求=403；仅测试对象已清理，无新增业务附件。原两名管理人员及通知关闭状态保持。
- Chrome 沿用张帅已有正式登录：本人 3 项目，新卡片无人工百分比，旧上线部署项目仅出现上线部署/验收交付两行待排期；打开后取消，没有保存真实排期。需求池全部 4 条，筛选 IT 部后指标/两分布/清单同为 1 条，重置恢复全部需求。
- 本轮未修改真实项目进度用于测试；完整写入路径由隔离浏览器 7 条及 API 集成 96 条证明。此次复用既有登录，不宣称重新完成真人扫码。

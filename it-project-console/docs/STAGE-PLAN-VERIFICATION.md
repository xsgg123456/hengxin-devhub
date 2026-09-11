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

本轮尚未部署。上线时需要一并发布前后端并执行 `202609110001_stage_plans` 迁移；旧前端提交人工百分比/日期的进度请求不再支持。迁移不捏造旧计划；旧项目首次执行前补齐当前及后续计划。已完成项目无实际证据时保持未知。

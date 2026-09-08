# Phase 7 项目进度与风险验收

日期：2026-09-08。用户确认Phase 6后要求继续开发。本期真实进度、历史、风险与项目生命周期；不包括Phase 8全量看板验收或Phase 9钉钉投递。

## 交付映射

| 需求 | 实现 | 验证 |
|---|---|---|
| 主责/管理整体进度，协作个人进展 | API progress-service + 原progress-update-drawer/use-progress-form | RBAC、个人字段裁剪和服务端拒绝、个人不重置整体时间、版本幂等、小数百分比 |
| 七阶段、日期与纠正历史 | progress-state、ProjectAdminService、ProgressUpdate/ScheduleChange/LifecycleEvent | 顺序推进、下一阶段日期、旧值新值原因操作者、纠正中断episode、验收再次开始保留旧完成时间 |
| 完成、取消、归档、重开、删除 | 原LifecycleActions接真实action API | 100不关闭、主责验收完成显式归档、管理重开、进度存在禁删、误建删除恢复需求 |
| 事务通知 | lifecycleEvent及risk-scan-job | 完成通知仅真实需求提交人；故障回滚；风险版本与outbox同事务 |
| 风险与工作日 | calendar/workday、risk-engine、risk-scheduler | 上海日期、下工作日临期、按交付延期、原计划差异、日期调整、3工作日停更、阻塞 |
| 同源页面 | workspace readmodel、project.riskVersion、原卡片/详情/待办/甘特 | 真实模式读服务端风险，原型继续旧风险纯函数；更新后刷新关联数据 |

## 复用与数据

原Art卡片、760px右侧进度/详情抽屉、Element表单、危险动作确认保留。把原进度脚本抽到use-progress-form，模板字段和交互仍在原组件；没有平行壳。真实截图 `output/phase7-live-progress-risk.png`、`phase7-live-completed.png`、`phase7-live-reopened.png` 与Phase 6邻居截图对照，无新增溢出。

模型采用Prisma多文件，仍同一客户端和迁移链。整体进度从Int改Float，兼容既有前端允许的小数。StageHistory去除project+stage唯一限制，支持纠正/重开多段历史。新增ProgressUpdate、ScheduleChange、LifecycleEvent、RiskSnapshot及Project风险字段；管理操作历史在物理删除项目后仍保留。

工作日从旧 `itpd-main/lib/workday.ts` 原文件移植日历日递进语义，收窄为上海日期纯逻辑，不复制旧数据库或节假日缓存。服务端SystemSetting提供工作日/停更阈值配置，默认周一至周五和3日。node-cron4.6.0每分钟扫描，noOverlap和schema内advisory锁防重入；扫描失败保留旧事务结果并下周期重试。

## 修复与边界

独立审查定位“验收已完成但未归档→恢复进行中→再次完成”缺少新episode，已补实现和真实集成。浏览器测试下拉选项重复定位改为当前combobox的aria-controls，没有弱化业务断言。风险集成中的日期历史使用真实不同旧新值并同步项目日期，避免虚假测试前提。

风险集合变化生成新快照版本；工程师只主责四类告警，同一工程师风险子集未改变时不会因单纯计划历史变化重复提醒。空风险不通知，解除和再次发生保留版本历史。实际钉钉发送仍未实现，outbox投递属于Phase 9。

## 验证记录

- `pnpm check`：前端111项、API37项单测；前后端类型检查和生产构建，最终日志 `output/phase7-check.log`。
- `pnpm --filter @it-project-console/api test:integration`：6文件43项；真实PostgreSQL/MinIO隔离schema/Bucket最终回收。`output/phase7-integration.log`。
- `pnpm --filter @it-project-console/api test:browser`：2条真实闭环通过（包含Phase 6），41.3s。`output/phase7-live-e2e.log`。
- 隔离数据库连续部署迁移两次，再Prisma diff：`No difference detected`。`output/phase7-schema-drift.log`。
- 原型/生产静态边界34条最终回归通过（1.7m）：`output/phase7-prototype-e2e.log`。
- Harness19项与API完整路径审计：日志 `output/phase7-harness.log`、`phase7-api-audit.log`；API审计0公告，不等于全workspace零公告。
- 独立审查：功能缺陷已关闭，全量回归通过；Stage 1 / Stage 2 PASS，无未关闭 HIGH / MEDIUM；基线 LOW 单独列于下方。

本地API4322及真实前端4318继续可用，原型4317保留。默认本地数据库增量迁移已执行；全部自动化写入使用独立测试schema/Bucket。没有push、发布或外部消息发送。下一阶段为管理看板与全量联调。

已知低优先基线问题：详情材料区域尾部存在多余“>”文本，上一阶段已存在；不影响本期功能，留待Phase 8全量页面联调修正。

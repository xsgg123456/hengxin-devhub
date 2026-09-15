# 管理待办与项目类型整改验收

日期：2026-09-15。范围：TASK-TYPE-ITERATION.md 已确认的九条要求。

## 实现
- 既有 today-tasks 原位分类：审批在前，按本轮进入时间排序；跟进默认折叠且不计待处理。保留其他角色职责。
- 卡片、详情、需求池、审批、接单、计划、进度、验收及甘特沿用原组件，统一正式项目/项目优化、所属原项目与单节点文案。
- XM/YH 独立年度计数；迁移旧优化号至 YH，保留 legacyCode 搜索，不改业务 ID、父关联及审计记录。
- 统计分类并保留优化人员负载；系统通知同步类型，开发中未发送实际通知。
- 历史用户原文保留，系统字段按类型转译；异常长说明支持展开。

## 验证证据
- `pnpm typecheck`：前后端通过。
- 前端 Vitest：51 文件、308 项；后端 Vitest：23 文件、112 项。
- `pnpm test:integration`：22 文件146项 + 4文件20项，全部通过，独立 schema 与 Bucket 已回收。
- Playwright 原型全量：58 项通过；最终历史兼容与紧凑空态修改后 task-type 定向通过。
- 本地发布审计：9 项通过；Harness：20 项通过。
- API 与 Web 独立两阶段 review 均通过；关闭风险汇总类型遗漏、历史自由文本误转换和测试定位失配。
- 实际渲染截图：`../output/playwright/task-type-today.png`、`../output/playwright/task-type-gantt.png`。沿用现有侧栏、卡片、表格与抽屉，检查内容及按钮无页面级溢出。
- 真实接口 Playwright：9 套共15项通过。前三套见 `output/task-type-live-final.log` 的通过记录，后六套见 `output/task-type-live-complete.log`；每套独立 schema/Bucket 均已回收。涵盖优化闭环、正式流程、看板、登录、完整编辑、接单与跨会话同步（含冲突保留及 SSE 断开兜底）。
- `pnpm build`：前后端生产构建通过。`git diff --check`：通过。完整日志位于根目录 `output/task-type-*.log`。

## 发布边界
本轮只完成本地整改。生产部署尚未执行；上线需要同时发布 API/Web 并应用 `20260915110000_optimization_codes` 迁移。旧编号作为历史搜索别名继续保留。

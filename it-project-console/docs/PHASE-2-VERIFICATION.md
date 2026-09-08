# Phase 2 交付与验收记录

日期：2026-09-08。范围以根 DEV-PLAN.md Phase 2 为准。

## 交付范围与复用

| 需求 | 现有实现与扩展 | 保留能力 |
|---|---|---|
| 应用框架 | views/index/index.vue、ArtSidebarMenu、ArtHeaderBar、ArtPageContent | 母版布局、侧栏折叠、主题变量、用户菜单、路由内容容器；仅扩展身份切换未保存保护 |
| 需求池 | views/my-demands/index.vue 原位扩展 | Art 卡片、Element Plus 表格与筛选；共享需求列表 |
| 提交与评估 | components/demand/demand-editor.vue、demand-review.vue | Element Plus Form/Drawer/Upload；以业务组件组合现成输入与抽屉能力 |
| 项目页 | views/project-overview/index.vue 原位扩展；my-projects/index.vue 复用同页 | 既有页面入口、Art 卡片与筛选框架；按 V2 扩展业务项目卡片 |
| 详情与更新 | components/project/project-detail-drawer.vue、progress-update-drawer.vue | Element Plus Drawer/Form；同一详情组件支持卡片与 projectId 深链 |
| 数据与权限 | domain/prototype.ts、PrototypeRepository、services/* | 同一事务存储、原存储键、固定身份与重置；v1 数据原位迁移为 v2 |

新增项目卡片、七阶段与领域表单承载母版原有通用组件未提供的业务语义；未新增平行应用壳、构建入口或框架。

## 行为验收

- 草稿允许材料不完整，正式提交必须有 PRD 和 HTML；HTTPS 链接或明确标识的模拟文件。
- 需求原单补充重提，管理人员评估立项/退回补充/不予立项，后两项原因必填。
- 立项唯一项目、唯一主责且与协作互斥；直接创建来源明确且 demandId 为空。
- 主责/管理更新整体进度；协作仅个人进展，不重置整体更新时间；100% 不自动关闭项目。
- 七阶段顺序推进，上线/交付日期分别保存，调整原因与原值保留，风险重算。
- 全员可读，默认范围按角色变化；刷新保留，失败不落盘，未保存表单有离开保护。

## 验证证据

- `pnpm check`：类型检查通过；5 文件、23 单元测试通过；生产构建 1434 modules、3.56s，exit 0。
- 原始日志：`../output/phase2-check.log`。
- `pnpm exec vite build --mode prototype --outDir ../output/prototype-preview`：3311 modules、17.29s，exit 0。
- Harness：`python -X utf8 -m unittest discover -s tests -v`，19 tests，OK。
- `pnpm test:e2e`：10 passed（17.9s），日志 `../output/phase2-e2e.log`。覆盖完整流转、退回拒绝、保存失败、只读、持久化、归档指标和 Auckland 日界。
- 最终独立 code-reviewer：Stage 1 PASS、Stage 2 PASS，无未关闭 HIGH/MEDIUM。复核母版复用、设计数值、测试前提、权限、类型与安全。
- 1024/1280/1440px 截图已检查，位于 `../output/playwright/phase2-1024.png`、`phase2-1280.png`、`phase2-1440.png`；无页面横向溢出。
- Phase 2 技术验收通过，等待用户预览确认；未进行远程推送或发布。

## 本阶段边界

当前是共享本地演示数据的核心闭环。完整图表、负载、职责待办、甘特、撤回删除与项目生命周期按 Phase 3 继续交付；四主模块随对应页面交付启用。完整 V2 前端评审版与真实后端尚未验收。

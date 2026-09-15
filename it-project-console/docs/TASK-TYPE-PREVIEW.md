# 管理待办与项目类型：前端评审预览

状态：本预览已于 2026-09-15 获用户确认，正式实现与验收以 TASK-TYPE-ITERATION.md、TASK-TYPE-VERIFICATION.md 为准。以下保留预览阶段范围；生产发布另行授权。

## 目标与验收
1. 复用当前 Vue 前端，保留导航、样式、卡片、760px 抽屉、筛选及业务交互。
2. 今日待办按待审批、其他待处理、项目异常分组；跟进默认收起；类型清晰，可筛选。
3. 卡片、详情、甘特图、审批展示正式项目/项目优化，优化显示所属原项目及单节点“优化完成验收”。
4. 仅本地 prototype 示例记录使用 YH 编号；不执行真实编号迁移、后端修改、通知或生产写入。
5. 可点击查看、切换分类、打开审批、返回原项目。原型内保存只写当前浏览器示例数据。
6. 实际渲染并验证上述交互，提供访问地址和截图，等待用户确认。

## 母版映射
- 待办：web/src/views/today-tasks/index.vue，保留 act、权限、保留选中项及抽屉。
- 卡片：web/src/components/project/project-card.vue，保留人员、风险、计划与操作。
- 详情：web/src/components/project/project-detail-drawer.vue，保留验收、历史、日期记录。
- 甘特：web/src/views/monthly-gantt/index.vue 与 components/project/monthly-gantt.vue，保留双排时间轴及交互。
- 审批：web/src/components/demand/demand-review.vue，保留现有校验与原型流程。
- 原型数据：现有 seed/repository，在独立本地预览端口启动，明确显示示例数据标志。

## 顺序
先修改母版展示与预览数据，再编译、浏览器交互验证与独立审查；确认后另行实施生产业务规则。

## 本地验证记录
- 原型地址：http://127.0.0.1:4325/?taskTypePreview=1#/today-tasks。
- vue-tsc --noEmit：通过。
- vitest task-service、gantt-service、project-code：3 文件、16 测试通过。
- vite build --mode prototype：通过，日志 output/task-type-preview-build.log。
- 浏览器：待审批筛选、优化审批抽屉、甘特类型筛选（正式0/优化1）、YH 优化详情、返回原项目均验证。
- 独立审查无已确认 HIGH/MEDIUM 预览阻塞项。正式发布门槛尚未执行；不要直接发布这些待确认的展示改动。
- 示例数据不是生产快照，编号规则迁移、通知、生产统计及完整跨角色流程留待确认后实施。

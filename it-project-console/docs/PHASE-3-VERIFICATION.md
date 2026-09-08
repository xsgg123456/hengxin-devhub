# Phase 3 交付与验收记录

日期：2026-09-08。范围：根 DEV-PLAN.md Phase 3 管理决策与生命周期补齐。

## 交付与母版复用

| 需求 | 原位修改或复用路径（相对 web/src） | 保留逻辑与扩展 |
|---|---|---|
| 四模块导航 | router/access.ts、router/routes/asyncRoutes.ts；原 Art Sidebar/Header/PageContent | 角色首页、侧栏、折叠与页面切换动画；按职责增待办和甘特入口，名单为二级管理入口 |
| 总览指标与筛选 | views/project-overview/index.vue、原 project-card.vue | 原卡片、七阶段、详情/更新入口；补搜索、部门、阶段与账号隔离的最近筛选；指标遵循 Spec 五项，已完成由状态筛选与分布图查看 |
| 项目分布与人员负载 | views/project-overview/modules/*、hooks/core/useChart.ts | ArtBarChart 的原图表 hook、主题、resize、懒加载和 tooltip；扩展主责/协作、同期、阶段、风险及真实项目明细 |
| 需求分布与趋势 | views/my-demands/index.vue、modules/demand-charts.vue | 原 Art 卡片与需求表格；复用 ArtRingChart/ArtBarChart 同源 hook，增加可点击的安全 DOM 明细；全部图表消费同一筛选结果 |
| 职责待办 | views/today-tasks/index.vue | 原 Art 卡片和按钮；复用 DemandReview、DemandEditor、ProjectDetailDrawer 与 ProgressUpdateDrawer，不复制表单或写接口 |
| 只读月度甘特 | views/monthly-gantt/index.vue、components/project/monthly-gantt.vue | 原 ElForm、Tooltip、详情与更新抽屉；Brief 10.3 明确母版无甘特，新增 DOM/CSS Grid 时间轴，左侧 230px 冻结 |
| 生命周期及纠正 | project-detail-drawer.vue、progress-update-drawer.vue、lifecycle-actions.vue | 继续原抽屉、日期表单、未保存保护和确认交互；扩展完成、取消、归档、重开、误建删除、纠正及历史 |
| 管理名单 | views/manager-grants/index.vue、原 ArtUserMenu.vue | 复用表格、组织成员 Select 和确认弹窗；动态角色、最后管理员保护、撤权回部门默认角色 |
| 数据持久化 | repositories/prototype-migration.ts、services/*、store/modules/prototype.ts | 同一 Mock 事务库、原存储键及 schema2；回填生命周期审计数组，保留更新后的权限，未新建数据库或前端入口 |

原母版 `D:/Work_Project/art-design-pro` 未修改。应用框架仍在同一个产品目录，未另建平行壳或重新实现路由、主题、图表生命周期。

## 行为与审查闭环

- 三角色均能查看全局图表和项目，待办仅显示有职责的动作。异常按延期、阻塞、停更、临期排列，同级按天数；健康主责项目不产生强制日报。
- 主责与协作分别计数，多人项目只计一名主责；显式含归档范围保留相交历史月份的负载。同期按计划区间重叠计算，不提供排名或分数。
- 甘特使用立项至预计交付的灰色计划条和唯一整体百分比累计进度，保留原交付标记、今日线、跨月裁剪、风险天数及共享详情。
- 主负责人在验收交付阶段完成后显式完成项目并自动归档；100% 本身不触发完成。管理员可取消、归档、重开；已有任何进度或纠正记录不可删除。
- 本人可撤回待评估/退回需求，原单编辑重提；只有草稿、待评估、退回需求可删除。误建项目删除后关联需求恢复待评估。
- 管理纠正保留日期旧新值、原因、作者和时间。离开未完成阶段写入 interruptedAt 并显示“纠正离开，未完成”，不伪造完成时间，也不补造旧快照未知时间。
- 项目/需求编号生成纳入审计保留的历史编号，删除再新建不会串入旧实体审计。
- 管理授权来自现有组织用户，刷新后保留；自撤权立即更新导航，服务层拒绝删除最后管理员。
- 新页面加载/无权限状态复用业务状态组件，单元素根兼容 Art 原页面切换动画。保存失败保留数据与输入；危险操作需确认。

初审发现的阶段历史、编号复用、待立项定位缺陷均修复并补回归；复审补齐需求池结束状态、历史月负载和环形图工具类冲突。

## 验证证据

- `pnpm check`：类型检查 exit 0；11 文件、64 单元测试通过；生产构建 1434 modules、3.88s，exit 0。
- `pnpm exec playwright test --workers=2`：22 passed（1.0m），包含 Phase 1/2 全部回归及本期生命周期、授权、跨页状态、图表、甘特、职责和失败路径。
- `pnpm exec vite build --mode prototype --outDir ../output/prototype-preview`：3355 modules，exit 0，39.68s，验证真实原型的模板编译与打包。
- `python -X utf8 -m unittest discover -s tests -v`：19 tests，OK（12.781s）。
- 独立 code-reviewer：Stage 1 PASS、Stage 2 PASS，无遗留 HIGH/MEDIUM；独立 typecheck、64 单测、production build 和实际浏览器视觉复核通过。
- `git diff --check`：exit 0。修改源码行数检查均不超过 300；新增核心源文件 ESLint 检查通过。

原始日志保存在 `output/phase3-check.log`、`output/phase3-e2e.log`、`output/phase3-prototype-build.log`。

截图位于 `output/playwright/phase3-overview-{1024,1280,1440}.png`、`phase3-gantt-{1024,1280,1440}.png`、`phase3-demands-1440.png`、`phase3-demands-trend-1440.png`。Art 页面内部滚动，截图分别记录可视区域；图表截图等待懒加载及动画结束。

## 下一阶段

Phase 4 做领导评审版的完整演示场景入口、全状态与评审路线。当前仍是本地共享演示库，真实后端及钉钉、文件存储在领导确认后进入后续 Phase。

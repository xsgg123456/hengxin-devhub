# Phase 4 技术交付记录

日期：2026-09-08。范围：前端领导评审版场景、恢复、连续流程与生产隔离。实际领导结论单列于 LEADERSHIP-REVIEW.md，尚未确认，Phase 5 保持锁定。

## 本轮修改与母版证据

| 需求 | 原位修改或复用路径（相对 web/src） | 保留行为 |
|---|---|---|
| 场景控制 | components/core/layouts/art-header-bar/widget/ArtUserMenu.vue | 原菜单、身份、popover、未保存提醒；只在菜单内加入场景选择 |
| 页面状态 | components/system/business-page-state.vue | 原业务状态入口和 Art 单根页面切换；补六场景横幅、恢复按钮 |
| 保存失败恢复 | 原 demand-editor、demand-review、project-create-drawer、progress-update-drawer | 原表单、校验、dirty、提交动作；错误区域接同一个 prototype-save-recovery，不重建抽屉 |
| 数据损坏恢复 | components/system/prototype-data-error.vue | 原异常页；补重新读取、重置确认、失败反馈 |
| 原型事务 | store/modules/prototype.ts、repositories/prototype-repository.ts | 原持久化键与 schema2；空数据只投影，提交互斥，成功重置清筛选并重建原 RouterView |
| 生产边界 | components/system/production-auth-boundary.vue | 原生产独立入口；用实际未开放提示替换无对应请求的持续加载 |

新增场景选择和恢复按钮消费既有 Store，没有母版等价的演示控制实现；因此从原用户菜单、状态页和抽屉扩展小组件。新 prototype-validation.ts 从原 Repository 拆出嵌套校验，避免单文件超过 300 行。原 Art Shell、侧栏、图表 hook、主题、表格与路由仍在原文件中，未修改外部母版或新建平行前端。

字体检查与 V2 最终 CSS 一致，保持其字体回退；截图等待图表懒加载和动画结束。Art 使用内部滚动，截图记录当前可视区域，不将被固定头部遮挡的区域当作完整长页截图。

## SCREEN / CMP 覆盖对应

本表核对当前前端可演示范围；真正登录、组织同步、通知和文件传输仍按计划在后端阶段实现。

| SCREEN | 实现（web/src 相对路径） | 验证入口 |
|---|---|---|
| 001 登录/身份 | 原 ArtUserMenu、production-auth-boundary | phase-one 身份切换；prototype-boundary 生产隔离，实际钉钉未接入 |
| 002 总览 | views/project-overview | phase-three-charts、leadership-review |
| 003 我的项目 | views/my-projects 复用总览 | phase-one、phase-two、leadership-review |
| 004 需求池 | views/my-demands | phase-two、phase-three-charts |
| 005 提交/编辑 | components/demand/demand-editor | phase-two、leadership-review |
| 006 审批 | components/demand/demand-review | phase-two、leadership-review |
| 007 项目详情 | components/project/project-detail-drawer | phase-three、leadership-review |
| 008 负载 | views/project-overview/modules | phase-three-charts、leadership-review |
| 009 甘特 | views/monthly-gantt、components/project/monthly-gantt | phase-three、leadership-review |
| 010 管理名单 | views/manager-grants | phase-three 授权/撤权/最后管理员保护 |
| 011 设备提示 | components/system/unsupported-device | phase-one 窄屏首次读取前拦截 |
| 012 今日待办 | views/today-tasks | phase-three 职责与异常待办 |

| CMP | 对应实现与核对 |
|---|---|
| 001 应用框架 | 原 Art Sidebar/Header/PageContent，沿用折叠、路由、角色首页 |
| 002 指标 | 总览指标与同源筛选、待立项定位需求页 |
| 003 风险 | risk-tag、risk-service，进度与日期变更反映到风险 |
| 004 项目展示 | V2 优先采用 project-card，覆盖 Brief 早期表格布局 |
| 005 筛选 | use-project-overview-filters，账号/页面偏好隔离、成功重置清理 |
| 006 七阶段 | stage-progress、stage-history，当前环节与纠正离开历史 |
| 007 更新抽屉 | progress-update-drawer，主责整体/协作个人分权、失败保留输入 |
| 008 评估抽屉 | demand-review，唯一主责、协作、计划与立项确认 |
| 009 材料 | material-field、material-summary，文件元数据或HTTPS链接，非真实上传 |
| 010 负载 | 原 Art chart hook + workload 统计/明细，主责协作分别计数 |
| 011 甘特 | 只读月度网格、计划与实际百分比、风险、共享详情 |
| 012 反馈 | business-page-state、表单错误与saving、空投影、读取恢复 |
| 013 确认 | 原 ElMessageBox，危险重置/删除/撤权与未保存保护 |
| 014 身份 | 原 ArtUserMenu 四账号，共享业务数据，切换不重置 |
| 015 场景 | 原菜单内 prototype-scenario-menu，非正常横幅及原位恢复 |

## 本轮错误修复

- 保存失败后的抽屉遮挡顶部场景入口：四类编辑抽屉增加“恢复正常并保留输入”。浏览器实际点击恢复后重试，唯一新增进度记录。
- 校验不足可能让损坏嵌套数据进入页面：迁移后校验必需字段、数组、关联、日期和数值；不覆盖无法读取的原值。
- 存储不可用：读取、初始写入与 localStorage 属性访问转成恢复页可识别的错误。
- 重置成功后可选 sessionStorage 清理失败：隔离偏好存储异常，避免业务已重置却显示重置失败；主业务写入失败仍保留旧值。
- 危险确认正文缺少对象名称：补齐项目完成/取消/归档/重开/删除和需求撤回/删除的名称，已有浏览器用例增加弹窗正文断言。

## 验证结果

- `pnpm check`：typecheck 零错误；13 文件、91 单元测试通过；生产构建 1434 modules、5.21s，exit 0。
- `pnpm exec playwright test --workers=2`：34 passed（1.6m），包含历史全部回归和本期 12 条领导/异常/生产边界测试。
- `pnpm exec vite build --mode prototype --outDir ../output/prototype-preview`：3363 modules，32.47s，exit 0。
- `python -X utf8 -m unittest discover -s tests -v`：19 tests，OK（11.873s）。
- 独立 code-reviewer：Stage 1 PASS、Stage 2 PASS，无未关闭 HIGH/MEDIUM。初审发现的 sessionStorage 重置错误边界和确认正文缺少对象名称均已修复并补回归。
- `git diff --check`、新增核心文件 Prettier 检查通过；本轮修改源码均不超过 300 行。

原始日志：`output/phase4-check.log`、`output/phase4-e2e.log`、`output/phase4-prototype-build.log`、`output/phase4-harness.log`。截图：`output/playwright/phase4-{manager,business,engineer}-{1024,1280,1440}.png`，业务趋势另有 `phase4-business-trend-*.png`。

测试使用 Playwright 隔离浏览器上下文，生产边界用临时 loopback 静态服务器并关闭回收；没有操作用户浏览器数据或真实后端。


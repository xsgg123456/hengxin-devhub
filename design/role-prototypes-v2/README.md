# 三角色完整 HTML 原型 V2

已于 2026-09-08 定版，作为三角色前端开发的页面参照。Product Spec v1.5、Design Brief v1.2 与 DEV-PLAN 已同步业务规则；产品代码仍需在现有 Art Design Pro 母版中实现。

工程师预览：http://127.0.0.1:4320/engineer.html；其他角色使用同目录 manager.html、business.html。

从本目录执行 `python -m http.server 4320 --bind 127.0.0.1` 启动预览。保留 CSS、角色脚本、build.py、verify.cjs 和截图用于追溯。build.py 依赖 Downloads 中原始参考 HTML，预览不需要运行它；不要重新生成并覆盖定版页面。

打开 manager.html、engineer.html 或 business.html。三个文件各自包含 CSS、脚本、Logo 与示例附件，不依赖其他文件或远程 CDN。角色链接需要三文件处于同一目录。

## 参考内容对照

| 用户参考 HTML 的内容 | 本次保留位置 | 实际逻辑来源 |
|---|---|---|
| 状态、人员、计划日期筛选 | 项目总览 | filterProjects / renderOverviewFilter |
| 五个项目指标 | 项目总览 | computeStats / renderStats |
| 项目指标柱形分布与悬停明细 | 项目总览 | overviewChartHtml / statTip |
| 月度每人手头项目数与悬停详情 | 项目总览 | renderLoadChart / rankTip |
| 完整项目卡片、时间字段与七阶段 | 项目总览 | projectCard |
| 逐日甘特、双条、今日线、跨月、悬停与详情 | 甘特图 | renderGantt / ganttRows / ganttTipHtml |
| 提出人环形图、条形数量与明细 | 需求池 | demandStatsHtml |
| 部门环形图、条形数量与明细 | 需求池 | demandDeptHtml |
| 按自然月、部门堆叠的需求趋势 | 需求池 | trendChartHtml |
| 需求全字段表格、附件阅读 | 需求池 | renderDemands / openAtt |
| 日常待办与分类筛选 | 今日待办 | renderToday / computeToday |

## 角色视角

- 管理人员陈立峰：项目总览默认全量；完整图表、全部待办、项目维护和需求处理。
- IT工程师冯涛：默认本人主责/参与项目；同一套图表按本人范围计算，可切换全部只读。主责更新整体，协作只填个人进展。
- 业务人员杜鹃：默认本人需求，展示需求分布、趋势与完整需求表；可查看关联项目，也可切换全部只读。
- 三角色来源于同一份示例数据。工程师、业务人员的范围切换同时影响图表和明细。

## Art Design Pro 对齐依据

- 本机运行的现有母版：230px侧栏、#5D87FF主色、16px卡片圆角、1px rgba(0,0,0,.08)边框、20px内容间距。
- Logo 原文件：it-project-console/web/src/assets/images/common/logo.webp，直接嵌入，不重画。
- 页面母版：views/project-overview/index.vue；布局：art-sidebar-menu、art-header-bar；字体与颜色来自实际浏览器 computed style。
- 图表保留参考 HTML 原渲染逻辑；Art 风格应用于布局、卡片、字体、控件、表格和弹窗。此处是独立 HTML 设计映射，不宣称运行了完整 Vue/Element Plus 应用。

## 边界

原型固定使用独立命名空间 art-role-reference-v2.* 保存演示数据；平台 SDK 强制禁用，不连接 WorkBuddy、钉钉或正式数据库。在同一浏览器且相同存储源下角色可共享；不同浏览器或 file URL 的存储策略可能隔离。需稳定跨角色演示时使用本地 HTTP 打开。

保留参考的图表口径和展示字段用于评审，不把其自然日停更、百分比或需求处理状态自动写入正式需求。最终业务规则仍以单独确认的 Product Spec 为准。

## 定版页面与正式逻辑的对照

页面布局、Art 风格、完整图表和甘特效果已定版。HTML 本身仍是参考演示，以下逻辑在正式 Vue 开发时按需求文档替换，不能直接复制：

| 项目 | 正式实现口径 |
|---|---|
| 进度 | 单一整体百分比，仅主负责人/管理人员可改；100% 不自动完成 |
| 人员 | 一名主负责人、多名协作人员，不设置副负责人角色 |
| 日期 | 上线与交付分开；项目延期及甘特终点按预计交付 |
| 停更 | 3 个工作日无整体更新；协作个人记录不重置计时 |
| 需求 | 草稿、待评估、退回补充、不予立项、已立项、已撤回；补充与否决均必填原因 |
| 材料 | PRD 与 HTML 各提供文件或 HTTPS 链接；缺材料可存草稿、不可正式提交 |
| 直接建项目 | 管理人员可创建，来源明确，demandId 为空 |
| 关联与权限 | 使用稳定用户/项目 ID 和服务端鉴权，不照搬演示中的姓名匹配或浏览器权限判断 |

现有 HTML 不作为以上规则已经实现或通过测试的证据。开发验收同时对照页面和 Product Spec 的 AC，保留完整视觉内容并落实已确认的规则。

> 2026-09-11 本轮已确认并开始实施：[先排期后执行与需求池统一筛选](it-project-console/docs/STAGE-PLAN-ITERATION.md)。该文逐条为当前验收标准，覆盖旧人工百分比、滚动填日期、验收后二次完成与自动归档规则。保留旧章节作历史参照，实施以本轮为准；正式部署另需明确授权。
# Development Plan — IT 项目管理台

2026-09-10发布授权：用户已要求提交 Git、打包并部署生产。按已审查变更提交、完整备份、构建审计、迁移升级、同步100/500 MB限制及公网代理、线上核验依次执行。提交门禁发现Python检查误扫Git忽略的第三方审计下载目录；改为检查Git已跟踪及未忽略的新文件，并以隔离仓库验证忽略边界，再执行全部门禁。

2026-09-10工程师页及甘特布局：1 同步确认的真实页面预览要求；2 原位修改project-overview/index.vue图表显示条件与monthly-gantt.vue网格/滚动布局；3 验证角色/范围隔离、日期网格与标记对齐、内部滚动和sticky、月份切换/详情；4 前端类型/单测/浏览器回归/构建及独立两阶段审查。保留已有工作区其他改动，生产部署不在本次范围。

2026-09-10用户授权删除与附件迭代：管理人员任意需求/项目、业务本人需求及关联项目全状态删除，清理关联记录和附件，保留独立审计；统一多文件上传任意格式，正式提交至少一个完成文件，100 MB/文件、500 MB/需求。计划：1 更新源规则及原抽屉预览；2 并行实施删除权限与附件后端，前端沿用demand-editor/material-field/material-summary原位改造；3 覆盖旧附件迁移、全状态权限/并发/清理、多文件上传失败重试及材料持久化；4 完整类型/单测/隔离集成/浏览器/构建及两阶段审查，交付预览与可发布改动。生产部署另需明确授权。

2026-09-10登录重试修复：已确认真实回调成功创建姚泽攀会话，但前端将带 dingError 的登录页保存为 returnTo，成功后仍显示旧失败提示。步骤：1 同步登录回跳约束；2 原位修正扫码目标，保留业务深链；3 回归错误页重试、普通登录页及业务深链，完成构建和独立审查。上线需用户明确部署授权。

> 本文件记录已确认的前后端技术方案、分阶段交付和验证标准。开发必须按依赖顺序执行。

---

## 0. 当前状态

| 项目 | 状态 |
|---|---|
| Product Spec | 已完成，v1.5，12 项需求、37 条验收标准 |
| Design Brief | 已同步 v1.2，定版 V2 为页面基线，现有 Art Design Pro 为实现基线 |
| 设计交付方式 | 已定版：design/role-prototypes-v2 三角色 HTML；工程师以 engineer.html 为准，开发在现有 Vue 母版原位实现 |
| 前端技术 | 已确认：复用 Art Design Pro 现有代码和技术栈 |
| 后端技术架构 | 已确认：Node.js + TypeScript + Fastify + Prisma + PostgreSQL 16 + MinIO |
| 产品代码 | Phase 1–4 前端评审通过；Phase 5–8 后端闭环与管理看板已实现并通过技术验证 |
| 当前可执行阶段 | 新系统已独立部署；真实钉钉登录与核心业务闭环通过，临时权限已撤销，剩余消息、恢复和上线验收 |
| 后端开工门禁 | Phase 4 通过且领导明确确认流程、信息结构和核心交互后，才允许进入 Phase 5 |

产品采用 pnpm workspace：前端放在 `it-project-console/web/`，后端放在 `it-project-console/api/`。前端参考母版是 `D:/Work_Project/art-design-pro`，基准提交为 `f3aaf58eec1a0e988f162352c33862327a484f95`。复制时不带入 `.git`、`node_modules`、`.playwright-cli`、构建缓存和母版工作区未提交内容；保留上游 MIT License。原母版只读，产品子目录不得再次 `git init`。

### 0.1 功能依赖图

```text
Phase 1 真实原型底座与演示身份
   └─> Phase 2 跨角色最小业务闭环
          └─> Phase 3 管理决策与生命周期补齐
                 └─> Phase 4 领导评审版打磨与确认
                                │
                                ▼（领导明确通过）
Phase 5 Fastify/PostgreSQL/MinIO 基础 ─> Phase 6 需求立项闭环
                                                │
                                                ▼
Phase 7 项目进度、历史与风险引擎 ─> Phase 8 管理看板联调
                                                │
                                                ▼
Phase 9 钉钉身份与风险通知 ─> Phase 10 部署准备与最终验收
```

---

## Phase 1: 真实原型底座与演示身份

> 以下保留 2026-09-04 的历史交付与验收记录，其中“待用户视觉确认”是当时状态。2026-09-08 已确认 V2 HTML 设计基线；新页面及规则在 Phase 2 起落实，不将 HTML 定版视为新版 Vue 功能验收。

**状态**：已实现、验证并通过代码审查（2026-09-04），待用户视觉确认

**交付内容**：

- 复制并运行 Art Design Pro，保留布局、路由、权限、请求封装、Pinia、表格、表单、抽屉和图标能力。
- 删除或禁用主题设置、深色模式、布局切换、多语言、工作标签、多余 Dashboard、聊天和示例入口。
- 建立原型/生产运行模式和统一 service/repository 边界，页面只能通过接口访问数据，后端落地时不重写页面。
- 建立覆盖三类系统角色的四个固定演示账号：一个业务人员、一个管理人员和两个 IT 工程师；两个工程师账号均只显示为“IT工程师”，主责/协作由具体项目成员关系决定并在项目中展示。在顶部当前用户区域实现仅原型模式可见的身份切换、“演示模式”标识和一键重置。
- 建立单一共享 Mock 数据库、固定初始场景和浏览器本地持久化；切换身份和刷新页面不得丢失已成功的业务操作。
- 实现设备门禁：手机、平板或业务区宽度小于 1024px 时只显示“请在电脑端使用”，门禁判定前不请求业务数据。

**关键文件**：

- `it-project-console/package.json` — 前后端统一开发、检查、测试和构建命令。
- `it-project-console/pnpm-workspace.yaml` — 声明 `web` 与 `api` 工作区。
- `it-project-console/.node-version` — 固定 Node.js 24.18.1。
- `it-project-console/web/package.json` — 前端脚本和依赖。
- `it-project-console/THIRD_PARTY_LICENSES/Art-Design-Pro-LICENSE` — 上游授权和来源提交。
- `it-project-console/web/src/router/routes/asyncRoutes.ts` — 精简后的角色路由。
- `it-project-console/web/src/config/setting.ts` — 固定浅色和单一布局。
- `it-project-console/web/src/config/runtime.ts` — 原型模式与生产模式的单向配置边界。
- `it-project-console/web/src/mocks/auth-context.ts` — 四个固定演示账号和三类角色上下文。
- `it-project-console/web/src/mocks/seed.ts` — 可重复恢复的领导评审初始场景。
- `it-project-console/web/src/repositories/prototype-repository.ts` — 共享 Mock 数据、持久化、事务式更新和重置入口。
- `it-project-console/web/src/store/modules/prototype.ts` — 当前演示身份、数据版本和异常场景状态。
- `it-project-console/web/src/components/core/layouts/art-header-bar/widget/ArtUserMenu.vue` — 在母版原生用户区内接入身份切换、演示标识和重置入口。
- `it-project-console/web/src/components/system/unsupported-device.vue` — 不支持设备提示。

**验收标准**：

- `pnpm dev` 可启动，应用框架视觉与 Art Design Pro 一致，母版仓库未被修改。
- 四个演示账号可切换，界面只显示三类系统角色；每次切换后当前用户、默认首页、导航和路由权限同步变化，刷新后保留当前身份。
- 所有页面数据调用都经过统一 repository；修改数据后切换身份或刷新仍保留，一键重置可恢复完全一致的初始快照。
- 生产模式无法显示身份切换、演示标识和重置入口，也无法回退到 Mock 数据源。
- 1024、1280、1440px 工作区可用；手机、平板和过窄窗口不加载业务数据。
- 类型检查、单元测试和生产构建通过。

---

## Phase 2: 跨角色最小业务闭环

**定版同步任务（2026-09-08）**：先调整既有路由、角色默认范围与 `domain/prototype.ts`，再补业务流程。复用现有 `views/index/index.vue` 及 ArtSidebarMenu、ArtHeaderBar、ArtPageContent；不得另建三套布局或把 HTML 直接作为生产页面。

**状态**：已实现并通过四步技术验证（2026-09-08），待用户预览确认。验收记录：`it-project-console/docs/PHASE-2-VERIFICATION.md`。

**本轮执行与验收顺序**：

1. 共享领域模型与事务服务：草稿/提交、评估/直接建项目、整体/个人更新；以权限、幂等、日期历史和旧数据迁移单测验收。
2. 需求列表与抽屉：原位改造 `views/my-demands/index.vue`，复用 Element Plus 表格、表单和 Drawer；以材料校验、退回原单重提、管理立项验收。
3. 项目列表与抽屉：原位改造 `views/project-overview/index.vue`、`views/my-projects/index.vue`；保留 Art 布局，抽取共用业务卡片/详情/更新组件，以同源进度、日期、风险及职责写权限验收。
4. 导航、集成与阶段验证：全员只读与默认范围分离；跨角色 E2E、持久化、失败不落盘、类型检查、生产构建和独立两阶段审查全部通过后记录证据。

完整图表、甘特与职责待办按 Phase 3 交付；本轮不把这些后续能力标为完成，也不以无行为按钮冒充交付。

**交付内容**：

- 在已有需求页面实现草稿、必交 PRD/HTML（各文件或 HTTPS 链接）、正式提交、退回补充和不予立项状态；演示文件明确标记模拟上传。
- 在需求池接入管理人员立项、退回补充、不予立项与原因校验；立项生成唯一项目及一名主负责人、多名协作人员；支持直接建项目，来源明确、demandId 为空。
- 实现 IT 工程师“我的项目”、项目详情、固定七阶段和进度更新抽屉；主负责人可更新整体百分比、阶段、状态及上线/交付日期，协作人员只能提交个人进展或阻塞。
- 实现管理人员“项目总览 / 风险工作台”的核心版本；工程师更新后，同一项目的指标、风险文字、当前阶段和最近更新时间立即变化。
- 贯通“业务提交 → 管理立项 → 主负责人更新 → 管理查看结果”的共享 Mock 数据链路，不允许用静态假成功代替关联数据变化。

**关键文件**：

- `it-project-console/web/src/views/my-demands/index.vue` — 业务需求列表。
- `it-project-console/web/src/components/demand/demand-editor.vue` — 复用表单组件，在右侧全高抽屉提交和编辑需求。
- `it-project-console/web/src/views/my-demands/index.vue` — 管理评估复用同一需求池，以状态筛选待评估记录，不另建审批页面。
- `it-project-console/web/src/components/demand/material-field.vue` — 明确标识为模拟上传的 PRD 和 HTML 原型输入。
- `it-project-console/web/src/components/demand/demand-review.vue` — 立项与退回操作。
- `it-project-console/web/src/views/my-projects/index.vue` — 工程师项目入口。
- `it-project-console/web/src/components/project/project-detail-drawer.vue` — 项目详情抽屉，卡片/甘特/深链共用；路由仅定位记录并自动打开弹窗。
- `it-project-console/web/src/views/project-overview/index.vue` — 风险优先管理首页。
- `it-project-console/web/src/components/project/project-card.vue` — 按 V2 展示项目卡片及风险，复用总览与工程师页面。
- `it-project-console/web/src/components/project/stage-progress.vue` — 固定七阶段进度条。
- `it-project-console/web/src/components/project/progress-update-drawer.vue` — 进度更新抽屉。
- `it-project-console/web/src/components/project/risk-tag.vue` — 文字加颜色的风险标签。
- `it-project-console/web/src/domain/prototype.ts` — 原位扩展共享领域模型：来源、材料、需求状态、整体百分比、两类日期、整体更新时间；现有类型优先复用，避免平行定义。
- `it-project-console/web/src/router/routes/asyncRoutes.ts`、`it-project-console/web/src/router/access.ts` — 先开放本阶段已实现的项目、需求入口，完成全员只读与职责写权限；四个主模块的最终顺序在 Phase 3 待办、甘特交付时同步启用，不展示空入口。
- `it-project-console/web/src/components/project/project-create-drawer.vue` — 复用项目字段的管理人员直接创建入口。
- `it-project-console/web/src/domain/demand.ts` — 若需拆分则由既有领域模型提取需求状态与附件类型，禁止重复定义。
- `it-project-console/web/src/domain/prototype.ts` — 本轮阶段、状态、材料与成员类型沿用同一领域文件，不重复拆分。
- `it-project-console/web/src/services/demand-service.ts` — 需求数据接口边界。
- `it-project-console/web/src/services/project-service.ts` — 项目与管理总览数据接口边界。
- `it-project-console/web/src/services/progress-service.ts` — 进度数据接口边界。

**验收标准**：

- 从重置后的初始场景开始，可连续走通“业务提交 → 管理立项 → 主负责人更新 → 管理查看结果”，且全程操作同一需求和项目记录。
- 立项生成的项目立即出现在所选主负责人和协作人员的“我的项目”；主负责人更新后，管理总览显示新的阶段、状态、日期和风险。
- 主负责人可在 1 分钟内更新一次进度；七阶段名称和顺序固定，保留唯一整体百分比，100% 不自动完成。
- 三角色均可查看全部需求、项目和图表，业务默认本人需求，工程师默认主责/协作，管理人员默认全部；直接访问无权限路由或执行越权操作都不能修改共享数据。
- 完成闭环后刷新页面仍保留结果；一键重置后需求、项目、进度、风险和当前身份恢复固定初始状态。
- 类型检查、单元测试、跨角色 E2E 和生产构建通过。

---

## Phase 3: 管理决策与生命周期补齐

**状态**：已实现并通过技术验收（2026-09-08），待用户预览确认；证据见 `it-project-console/docs/PHASE-3-VERIFICATION.md`

**本轮执行与验收**：

1. 生命周期及管理授权：补全状态操作、纠正与审计，旧演示数据可迁移；权限与失败路径单测通过。
2. 总览与需求图表：原位扩展现有页面，复用 Art 图表；图表和列表共用筛选结果，负载不重复计算主责。
3. 职责待办与月度甘特：补全四模块导航，真实任务跳转与同源日期进度，覆盖跨月边界。
4. 整体验收：跨角色 E2E、桌面截图、类型检查、单测、生产构建及独立两阶段审查全部通过，记录证据后本地提交。

审查约束：阶段纠正以“纠正离开、未完成”独立记录，不填造实际完成时间；旧数据未知时间继续保留未知。删除记录保留审计墓碑，后续需求与项目不得复用其编号；误建项目删除后关联需求恢复待评估。

**交付内容**：

- 随职责待办与甘特页面交付，按 Design Brief 4.2 完成三角色四个主模块的导航顺序与文案。
- 按 V2 完成总览指标、项目分布柱形图、人员负载及完整项目卡片；完成需求池提出人/部门环形图与数量条、月度部门堆叠趋势和需求表格。图表和明细共用范围筛选。
- 完成职责待办与确定性风险：管理人员看评估和全局异常，工程师看本人更新，业务看补充材料；停更只按最近整体更新计算 3 个工作日，不强制日报。
- 完成项目详情的日期调整历史、进度历史和管理纠正；支持需求退回/重提/撤回/删除，以及项目完成、取消、归档、重新打开和符合条件的误建删除。
- 实现人员负载：分开统计主责、协作、同期项目、阶段和风险，不做排名、得分或绩效评价。
- 用 DOM/CSS Grid 实现 V2 只读月度甘特：一项目一行、逐日轴、灰色计划条与同源整体百分比进度条、原计划交付标记、今日线、跨月、悬停及详情；终点和项目延期按预计交付计算。
- 实现管理人员名单页的 Mock 交互和最后一名管理员保护，并让所有管理页面继续使用 Phase 2 的共享数据。

**关键文件**：

- `it-project-console/web/src/components/project/schedule-history.vue` — 日期调整历史。
- `it-project-console/web/src/services/risk-service.ts` — 前端评审版确定性风险计算。
- `it-project-console/web/src/views/project-overview/modules/project-distribution.vue`、`person-workload.vue` — 复用 Art 图表封装实现总览分布和负载，不另造图表框架。
- `it-project-console/web/src/views/my-demands/modules/demand-charts.vue` — 提出人/部门分布及月度趋势。
- `it-project-console/web/src/views/today-tasks/index.vue` — 三角色职责待办。
- `it-project-console/web/src/views/workload/index.vue` — 复用负载内容作为总览区域或二级明细，不新增重复主导航。
- `it-project-console/web/src/views/monthly-gantt/index.vue` — 月度甘特页面。
- `it-project-console/web/src/components/project/monthly-gantt.vue` — CSS Grid 只读时间轴。
- `it-project-console/web/src/views/manager-grants/index.vue` — 管理人员名单。
- `it-project-console/web/src/services/management-service.ts` — 负载、甘特和管理人员数据接口边界。

**验收标准**：

- 三角色页面对照定版 HTML，图表、卡片、甘特和悬停明细逐项齐全；管理人员可在 30 秒内定位风险项目。
- 日期变化未填原因不能保存；保存后旧值、新值、原因、操作人和时间可查看，管理纠正与项目生命周期操作同步反映到所有相关页面。
- 负载分开统计主责和协作，多人项目只有一人计入主责；甘特展示与所选月份相交的项目，延期同时有颜色和“延期 N 天”。
- 项目完成、取消、归档、重新打开和删除规则与 Product Spec 一致，刷新与角色切换后状态不回滚。
- 页面没有 AI、聊天、工单、子任务、工时、绩效排名、甘特拖拽、依赖和阶段分段。
- 类型检查、单元测试、关键管理路径 E2E 和生产构建通过。

---

## Phase 4: 领导评审版打磨与确认

**状态**：已通过（2026-09-08）。技术验证后用户明确确认前端并要求开始后端。证据见 `it-project-console/docs/PHASE-4-VERIFICATION.md`，确认记录见 `it-project-console/docs/LEADERSHIP-REVIEW.md`。

**本轮执行与验收**：

1. 在原用户菜单接入正常、空数据、加载、网络错误、保存失败、无权限场景；场景切换不覆盖成功业务数据，恢复正常后原数据仍在，未保存编辑有保护。
2. 原位补强读取失败与数据损坏恢复，重置有确认、忙碌和失败反馈；核对三角色页面、组件、字体及边界，不新建应用壳。
3. 固化从重置开始的领导评审路线和全状态/生产边界 E2E，执行全量检查与独立两阶段审查，技术验收完成后本地提交。领导是否通过单独记录，Phase 5 继续锁定。

**交付内容**：

- 补齐三类角色的导航、页面互通以及加载、空数据、网络错误、保存失败、无权限、提交中、成功和数据损坏恢复状态。
- 建立可控演示场景，在不改代码的情况下切换正常、空数据、加载、保存失败和无权限结果；失败场景不得破坏最近一次成功数据。
- 清理全部死按钮、静态假成功、孤立页面和模板残留；所有可见核心业务操作必须产生可追踪的数据变化或明确说明模拟边界。
- 用 Playwright 固化跨角色完整闭环、权限隔离、刷新持久化、一键重置、异常恢复和 1024/1280/1440px 截图基线。
- 编写领导评审路线与结果清单；领导未明确确认流程、信息结构和核心交互时，Phase 5 保持锁定并回到上游文档和前端迭代。

**关键文件**：

- `it-project-console/web/src/mocks/scenarios.ts` — 正常、空数据、失败和无权限演示场景。
- `it-project-console/web/src/components/system/prototype-scenario-menu.vue` — 仅原型模式可见的受控场景入口。
- `it-project-console/web/src/components/system/prototype-data-error.vue` — 原位增强演示数据损坏提示与重置恢复，保留现有入口。
- `it-project-console/web/playwright.config.ts` — E2E 与桌面视口配置。
- `it-project-console/web/e2e/leadership-review.spec.ts` — 跨角色完整闭环和评审路径。
- `it-project-console/web/e2e/prototype-boundary.spec.ts` — 权限、持久化、重置和生产禁用验证。
- `it-project-console/docs/LEADERSHIP-REVIEW.md` — 可重复执行的领导评审路线和结论清单。

**验收标准**：

- 从一键重置开始，可在同一浏览器连续完成“提交需求 → 审批立项 → 更新进度 → 查看风险、负载与甘特”，中途刷新或切换身份不丢数据。
- 四个演示账号的导航、默认首页、数据范围和操作权限正确；直接访问无权限路由或越权操作不会改变数据。
- 核心页面的加载、空、错误、无权限、提交中、成功和恢复状态均可稳定重现，所有可见核心按钮均有可观察结果。
- Design Brief 的 12 个 SCREEN、15 个 CMP 和全部通用状态逐项通过。
- E2E、截图回归、类型检查和生产构建通过；生产构建不包含演示身份、场景控制、重置入口或 Mock 回退。
- 领导按照 `LEADERSHIP-REVIEW.md` 实际走完主链路，并明确记录“通过”后，才确认前端评审版定稿并解锁 Phase 5。

---

## 5. 已确认架构与复用边界

### 5.1 后端形态

- 使用 Node.js + TypeScript + Fastify 构建一个 REST API 模块化单体，不使用 Next.js 充当后端，不拆微服务。
- 使用 Prisma 管理 PostgreSQL 16 的类型安全访问和 migration；新建精简 Schema，不复制旧系统整份模型。
- 使用 MinIO 私有 Bucket 保存文件，PostgreSQL 只保存附件元数据；浏览器通过短期预签名 URL 直传和下载。
- 使用 PostgreSQL 保存会话，浏览器只持有随机会话令牌的 HttpOnly Cookie；不使用无法立即撤销的长期 JWT。
- 使用 `node-cron` 在单 API 实例内运行风险扫描和通知重试，利用 PostgreSQL advisory lock 与通知幂等键防止重复；第一版不引入 Redis 或消息队列。

### 5.2 附件安全流程

1. 前端向 API 申请上传，API 检查角色、需求状态、扩展名、MIME 和大小，并创建 `PENDING` 附件记录。默认允许 PRD 的 `.pdf/.doc/.docx`、原型的 `.html/.zip`，单文件 20 MB、单需求合计 50 MB，均由服务端配置。
2. API 生成随机 objectKey 和 5 分钟有效的 MinIO `PUT` 预签名 URL；Access Key 与 Secret 永远不下发浏览器。
3. 浏览器直传 MinIO 后调用确认接口，API 使用 `HeadObject` 校验对象存在、大小和 MIME，再把记录改为 `READY`。
4. 下载时 API 重新检查当前用户的数据权限，再返回 5 分钟有效的 `GET` 预签名 URL。
5. HTML/ZIP 原型一律以附件方式下载，不在系统同源页面执行；超时未确认的对象由清理任务删除。

### 5.3 `D:/Work_Project/itpd-main` 复用清单

| 现有资产 | 结论 | 新系统处理方式 |
|---|---|---|
| `docker-compose.yml` 的 PostgreSQL/MinIO/minio-init | 复用结构 | 改为独立服务名、数据库、Bucket 和 volume；不复用旧数据 |
| `lib/s3.ts` | 高复用 | 移植 S3 Client、预签名、Head/Get/Put/Delete；补附件状态和权限边界 |
| `app/api/attachments/presign/route.ts` | 复用业务思路 | 保留校验、预签名和确认流程，改写成 Fastify 路由 |
| `lib/workday.ts` | 高复用 | 移植工作日计算并增加本项目风险规则测试 |
| `services/dingtalk-*` | 选择性复用 | 提取 OAuth、组织同步和工作通知的纯逻辑，移除 Next.js/旧模型依赖 |
| outbox/notification 相关服务和测试 | 选择性复用 | 保留幂等、失败重试和审计思想，缩成风险通知所需最小集合 |
| `prisma/schema.prisma` | 仅参考 | 只参考 User、Department、Attachment 等字段，不复制重型业务表 |
| Next.js 页面、NextAuth、AI、工时、多级审批 | 不复用 | 与本产品范围冲突，禁止带入 |

---

## Phase 5: Fastify、PostgreSQL 与 MinIO 基础

**状态**：已实现并通过技术验证（2026-09-08），证据见 `it-project-console/docs/PHASE-5-VERIFICATION.md`。用户确认“这一步没什么问题了 开始开发后端吧”后启动。

**本轮步骤与完成标准**：

1. 建立 API workspace、配置校验、统一错误、OpenAPI 与健康检查；严格类型和 inject 正常/错误测试通过。
2. 建立独立 PostgreSQL/MinIO Compose、Prisma 模型与可重复 migration/开发 seed；不使用旧系统数据库或存储卷，真实隔离集成测试可运行。
3. 实现数据库会话、RBAC 和开发账号登录；未登录401、越权403、生产禁开发登录，无密码或会话泄漏。
4. 从旧项目原文件移植 S3 适配，完成申请/直传确认/下载/孤儿清理；用真实独立 Bucket 验证合法与拒绝路径。
5. 独立审查、后端全量检查与前端回归通过后本地提交；不执行发布或推送。

**交付内容**：

- 建立 Fastify API、统一响应/错误、Zod 校验、OpenAPI、日志、安全插件和健康检查。
- 建立独立 PostgreSQL 16、MinIO、自动建桶及独立数据卷，提供可重复启动的 Docker Compose。
- 建立 Prisma 基础模型、migration、种子数据、服务端 RBAC 和仅开发环境可用的四个演示账号（一个业务人员、一个管理人员、两个 IT 工程师）；在具体项目的成员关系中为工程师分配主责或协作权限，同时建立可在业务事务内写入的通知 outbox。
- 移植并收窄旧项目 S3/MinIO 代码，实现预签名上传、确认、鉴权下载和孤儿对象清理。
- 建立 Vitest + Fastify `inject()` 单测和使用独立 PostgreSQL schema/MinIO Bucket 的集成测试入口。

**关键文件**：

- `it-project-console/api/src/app.ts` — 组装 Fastify、插件和业务路由。
- `it-project-console/api/src/server.ts` — 启动、优雅关闭和定时任务生命周期。
- `it-project-console/api/src/config/env.ts` — Zod 环境变量校验。
- `it-project-console/api/src/plugins/auth.ts` — 会话、角色和数据范围基础守卫。
- `it-project-console/api/src/plugins/prisma.ts` — Prisma 生命周期和请求上下文。
- `it-project-console/api/prisma/schema.prisma` — 精简业务模型与数据库约束。
- `it-project-console/api/prisma.config.ts` — Prisma 7 数据源和 migration 配置。
- `it-project-console/api/src/modules/storage/s3-storage.ts` — 从旧系统收窄后的 MinIO/S3 适配器。
- `it-project-console/api/src/modules/attachments/attachment-service.ts` — 附件状态、预签名、确认和清理。
- `it-project-console/compose.yaml` — 本阶段独立 PostgreSQL、MinIO、minio-init 编排；API/Web 由 `pnpm dev` 同时启动，生产容器编排按 Phase 10 实施。

**验收标准**：

- 空环境执行 Compose 可创建 `it_project_console` 数据库、`it-project-console` 私有 Bucket 和独立 volume，不访问旧系统数据。
- migration 和 seed 可重复执行；四个开发账号获得正确的三类系统角色及工程师项目关系，生产环境无法启用开发登录。
- 未登录为 401、越权为 403，错误响应不暴露堆栈、数据库字段或密钥。
- 合法文件可完成申请、直传、确认和鉴权下载；非法类型、超限、伪造确认和越权下载被拒绝。
- API 类型检查、单测、集成测试、构建和依赖审计通过。

---

## Phase 6: 需求提交与单级立项闭环

**状态**：已实现并通过技术验证（2026-09-08），证据见 `it-project-console/docs/PHASE-6-VERIFICATION.md`。待用户体验确认，下一阶段为 Phase 7。

**本轮步骤与验收**：

1. 扩展原 Prisma 模型与迁移，实现本人草稿/提交/修改/撤回/删除及管理评估/直接建项目；以行锁、版本与幂等记录保证并发安全，通知outbox同事务写入。
2. 在原需求表、需求编辑/评估抽屉、材料控件和项目创建抽屉接入真实API；保留显式prototype演示构建，新增仅开发的live联调入口，production仅使用真实会话/API且无Mock回退。
3. 原Art壳与共享详情继续复用；尚属Phase7的进度/生命周期写入在真实模式标明未开放，不把原型写入当服务端成功。
4. 真实PostgreSQL/MinIO集成与隔离浏览器完成文件/链接提交→评估→方案设计→刷新；验证越权、并发、回滚和生产边界，独立审查及全量检查后本地提交。

**交付内容**：

- 实现全员只读需求查询、本人草稿与提交、修改、撤回、退回补充后重提和受约束删除；PRD/HTML 各支持文件或 HTTPS 链接，缺任一材料服务端拒绝正式提交。
- 实现 PRD 与 HTML 原型的 MinIO 文件或 HTTPS 链接保存，删除未引用附件时事务记录持久清理任务，存储对象按清理周期回收并失败重试；未保存的READY材料支持主动丢弃与24小时孤儿回收。
- 实现管理人员立项、退回补充、不予立项（后两项必填原因），以及标记来源的直接建项目；立项事务一次创建项目、七阶段初始记录、唯一主负责人和协作关系。
- 退回时在同一事务写入业务提交人的通知 outbox；立项时写入提交人、主负责人和全部协作人员的通知 outbox，业务事务成功后由 Phase 9 投递。
- 将“我的需求、提交需求、需求审批”从 mock 切换为真实 API，保留显式原型模式用于 UI 演示。

**关键文件**：

- `it-project-console/api/src/modules/demands/demand-routes.ts` — 需求 REST 路由与数据范围入口。
- `it-project-console/api/src/modules/demands/demand-service.ts` — 需求状态、幂等和删除规则。
- `it-project-console/api/src/modules/demands/demand-schemas.ts` — 请求与响应 Zod Schema。
- `it-project-console/api/src/modules/approvals/approval-routes.ts` — 立项和退回端点。
- `it-project-console/api/src/modules/approvals/approval-service.ts` — 单级立项事务。
- `it-project-console/api/src/modules/projects/project-routes.ts`、`project-service.ts` — Phase 6 建立管理人员直接创建端点与事务，记录来源和可空 demandId；Phase 7 在原文件扩展更新及管理动作。
- `it-project-console/api/src/modules/notifications/lifecycle-event-service.ts` — 退回、立项和完成事件的幂等记录。
- `it-project-console/web/src/services/live-demand-service.ts` — 需求/审批/直接立项真实 API 适配；既有 demand-service 保留原型语义。
- `it-project-console/api/src/modules/workspace/workspace-routes.ts` — 会话鉴权后的页面数据投影。

**验收标准**：

- AC-004 至 AC-008、AC-034 至 AC-036 通过集成测试；直接创建不生成虚假需求。
- 重复提交不创建两条需求，同一需求并发立项只产生一个项目。
- 已立项需求及被项目引用的 MinIO 对象不能物理删除。
- 业务人员可只读其他部门需求，工程师不能调用管理评估接口，所有角色不能修改他人的需求。
- 浏览器完成“提交需求 → 管理人员立项 → 项目进入方案设计”的真实流程。
- 退回和立项事务分别生成正确收件人的通知事件，通知服务未配置时不影响业务结果。

---

## Phase 7: 项目进度、历史与风险引擎

**状态**：已实现并通过技术验证（2026-09-08），证据见 `it-project-console/docs/PHASE-7-VERIFICATION.md`。下一阶段为 Phase 8 管理看板与全量联调。

**本轮步骤与完成标准**：

1. 扩展增量模型及项目写事务：整体/个人权限、七阶段历史、日期历史、管理纠正、结束与重开；版本/幂等、历史保留和通知原子性通过真实数据库测试。
2. 移植工作日纯逻辑并实现风险快照与定时扫描：上海业务日期、跨周末、整体停更、风险改变通知、advisory锁及重复扫描去重通过测试。
3. 原进度抽屉、生命周期控件、共享详情/卡片/待办/甘特接真实API；保留Art母版和prototype，错误输入保留、冲突可恢复。
4. 隔离浏览器完成更新→风险变化→验收完成归档→管理重开，并回归需求立项、生产隔离与原型；独立review与全部检查通过后本地提交。


**交付内容**：

- 实现主负责人/管理人员更新整体百分比、阶段、简单状态、阶段预计完成日、预计上线日、预计交付日和公开进展；百分比 100% 不自动关闭。
- 实现协作人员个人进展与阻塞，服务端禁止协作者修改整体百分比、阶段和关键日期；个人更新不重置整体停更时间。
- 实现七阶段历史、日期调整历史、完成自动归档；允许管理人员纠正阶段/简单状态、取消、手动归档、重新打开，并仅在项目从未产生进度记录时物理删除。
- 需求立项项目完成时写入业务提交人的完成通知 outbox；直接创建项目没有关联提交人时不伪造通知收件人。实际投递失败不能回滚项目完成。
- 移植工作日算法，实现临期、阶段延期、项目延期、计划变化、3 工作日停更和阻塞风险快照。
- 使用 `node-cron` 定时重算风险，使用 PostgreSQL advisory lock 保证同一批任务只执行一次；风险展示值变化保留快照，通知仅在风险首次出现、解除后再出现或风险状态集合变化时写入 outbox。Phase 9 按 Spec AC-016 收敛口径：单纯延期/停更天数增长不重复提醒。

**关键文件**：

- `it-project-console/api/src/modules/projects/project-routes.ts` — 项目查询、更新和管理动作。
- `it-project-console/api/src/modules/projects/project-service.ts` — 项目状态与成员权限事务。
- `it-project-console/api/src/modules/projects/project-admin-service.ts` — 管理人员纠正、删除、取消、归档和重新打开。
- `it-project-console/api/src/modules/progress/progress-service.ts` — 进度、阶段和日期历史。
- `it-project-console/api/src/modules/risks/risk-engine.ts` — 无数据库依赖的风险计算纯函数。
- `it-project-console/api/src/modules/risks/risk-scan-job.ts` — 定时扫描、锁和风险快照更新。
- `it-project-console/api/src/modules/calendar/workday.ts` — 从旧项目移植的工作日算法。
- `it-project-console/web/src/services/project-service.ts` — 项目真实 API 与 mock 适配。
- `it-project-console/web/src/services/progress-service.ts` — 进度真实 API 与 mock 适配。

**验收标准**：

- AC-009 至 AC-014、AC-023 至 AC-026、AC-032、AC-033、AC-037 通过自动化测试。
- 主责、协作、业务和管理人员的数据范围均由 API 强制执行。
- 阶段、进度和日期旧值不可覆盖；关键写入全部处于事务内。
- 管理人员纠正操作写入历史；有进度记录的项目不能物理删除，只能取消或归档。
- 风险测试覆盖临界日、跨周末、重复扫描、风险解除、上线与交付不同、协作更新不重置停更及主责/管理整体更新重置停更。
- 相同风险版本重复扫描不新增 outbox；新风险状态生成 outbox，仅天数变化更新展示快照不生成通知，钉钉未配置不影响风险快照提交。
- 浏览器完成“更新进度 → 风险变化 → 完成归档 → 管理人员重新打开”。

---

## Phase 8: 管理看板与全量联调

**状态**：已实现并通过技术验证（2026-09-08），证据见 `it-project-console/docs/PHASE-8-VERIFICATION.md`。下一阶段为 Phase 9，真实联调需要企业应用凭据。

**执行与验收顺序**：

1. 同源查询：实现总览筛选分页、风险关注顺序、人员负载和需求统计、甘特几何查询；以真实数据库验证 AC-017～022 与统计明细一致。
2. 原位接入：复用 project-overview 的图表与卡片、my-demands 图表表格、monthly-gantt 时间轴和 manager-grants 名单；保留筛选、悬停、详情、危险操作确认，补充局部加载/错误/重试，名单事务保护最后一名管理员并审计。
3. 全量验证：三角色真实 API 浏览器闭环、1024/1280/1440 桌面布局、生产无 mock、类型与构建、单测和集成及独立审查通过后记录证据并本地提交。

联调容量修正：总览初载需要多个聚合请求，约 10 人同出口共用原 120 次/分钟 IP 限额会误拦正常操作。全局上限提供服务端正整数配置，默认 600 次/分钟；开发登录仍独立限制 10 次/分钟，保留真实 429 与重试提示。

**交付内容**：

- 实现风险工作台的五个指标、今日需关注、全项目筛选和分页查询。
- 实现分别统计主责与协作的人员负载聚合，以及项目分布、提出人/部门需求分布、月度趋势；筛选口径与图表明细一致，全员可读。
- 实现月度甘特查询：立项至预计交付的整体区间、同源整体百分比、原计划交付、今日线和风险；跨月裁剪不改变原始比例。
- 实现管理人员名单维护和最后一名管理员保护。
- 移除生产路径 mock，统一前后端加载、错误、空数据和权限状态。

**关键文件**：

- `it-project-console/api/src/modules/dashboard/dashboard-routes.ts` — 管理看板端点。
- `it-project-console/api/src/modules/dashboard/dashboard-service.ts` — 风险指标和需关注聚合。
- `it-project-console/api/src/modules/dashboard/demand-statistics-service.ts` — 提出人、部门分布与月度趋势聚合，图表与明细使用相同筛选条件。
- `it-project-console/api/src/modules/workload/workload-service.ts` — 人员负载聚合。
- `it-project-console/api/src/modules/gantt/gantt-service.ts` — 月度区间裁剪和风险信息。
- `it-project-console/api/src/modules/manager-grants/manager-grant-service.ts` — 最高权限名单。
- `it-project-console/web/src/utils/http/index.ts` — API 基址、Cookie、错误和重试边界。
- `it-project-console/web/src/store/modules/user.ts` — 服务端身份和角色上下文。

**验收标准**：

- AC-017 至 AC-022 通过自动化测试。
- 管理人员能在 30 秒内从首页定位风险项目；主责和协作计数不混淆。
- 约 10 名工程师和预期项目量下，列表/详情 2 秒内展示主要内容，保存 1 秒内返回反馈。
- 生产模式不请求 mock；三角色真实 API E2E 和三档桌面视口测试通过。
- 系统不能删除最后一名有效管理人员，名单变更写入审计记录。

---

## Phase 9: 钉钉身份与风险通知

**状态**：代码已实现并通过技术验证（2026-09-09）。按用户确认复用 `D:/Work_Project/itpd-main` 的钉钉逻辑，接入说明见 `it-project-console/docs/DINGTALK-INTEGRATION.md`，证据见 `it-project-console/docs/PHASE-9-VERIFICATION.md`；真实企业配置、组织同步和扫码登录已验证；消息实发仍需指定收件人，尚未认定本阶段全部企业验收完成。

**本轮实施与完成标准**：

1. 移植旧 `services/dingtalk.ts` 的请求校验、Token 缓存、授权码交换；适配当前 Fastify Cookie 会话，补齐一次性 OAuth state、企业通讯录身份校验及手机访问阻断。授权失败不得创建会话。
2. 移植旧 `dingtalk-organization.ts` 的分页、遍历及受控并发；完整快照事务同步至新用户表，撤销失效用户会话，幂等初始化首位管理员；不按姓名合并样例账号。
3. 原位适配 Art 登录页面，复用旧 H5 Bridge 授权流程；电脑浏览器扫码、电脑钉钉免登、配置缺失及授权失败均有明确状态，本地联调入口保留。
4. 移植旧 `dingtalk-notification.ts` 的工作通知、任务领取和退避逻辑，对接现有 outbox，记录投递证据与异步结果；实际投递默认关闭，自动测试不调用真实钉钉。
5. 完成独立审查、单测/隔离接口及浏览器测试、类型检查与构建；明确区分代码验证与尚未进行的企业真实登录/消息验收。旧项目只读，当前样例数据保留。

**交付内容**：

- 从旧系统选择性移植钉钉 OAuth、组织同步和工作通知逻辑，去除 Next.js 和旧表依赖。
- 实现电脑钉钉客户端免登、电脑浏览器扫码登录，以及企业用户、部门和系统角色映射。
- 钉钉组织首次同步成功后，使用 `BOOTSTRAP_ADMIN_DING_USER_ID` 匹配已验证用户并幂等初始化首位生产管理员。
- 实现风险首次出现或风险集合变化时的钉钉通知，消息包含项目、风险、负责人和深链。
- 实现业务人员的退回、立项、完成通知，以及立项时主负责人和协作人员通知；收件人来自 Phase 6/7 已记录的生命周期事件。
- 实现通知幂等、失败落库和退避重试；相同风险版本不重复发送。

**关键文件**：

- `it-project-console/api/src/modules/dingtalk/dingtalk-auth.ts` — 授权码交换和企业身份校验。
- `it-project-console/api/src/modules/dingtalk/dingtalk-directory.ts` — 用户与部门同步。
- `it-project-console/api/src/modules/dingtalk/bootstrap-admin.ts` — 同步后初始化首位生产管理员。
- `it-project-console/api/src/modules/dingtalk/dingtalk-message.ts` — 工作通知适配器。
- `it-project-console/api/src/modules/notifications/notification-service.ts` — 去重、重试和汇总。
- `it-project-console/api/src/modules/notifications/notification-job.ts` — 带数据库锁的投递任务。
- `it-project-console/web/src/views/auth/login/index.vue` — 扫码与钉钉内免登入口。
- `it-project-console/web/src/utils/dingtalk/runtime.ts` — 客户端环境识别和授权码获取。

**验收标准**：

- AC-001 至 AC-003、AC-015、AC-016 在钉钉企业测试环境通过。
- 退回只通知提交人；立项通知提交人、主负责人和协作人员；完成通知提交人，重复任务不重复发送。
- 手机钉钉只显示电脑端提示，获得授权码后也不加载业务数据。
- 通知失败不影响业务写入，恢复后可重试；相同风险版本仅一条成功通知。
- 非本企业、停用或权限被移除的用户不能沿旧深链访问数据。
- 首位管理员只能从已同步且有效的企业用户中初始化；重复执行不产生重复授权。

---

## Phase 10: 安全、部署准备与最终验收

2026-09-09 真实登录缺陷：张帅的钉钉部门为“IT部”，旧判断仅识别“信息技术部”，导致业务角色及 IT 人员候选错误。修复顺序：统一前后端精确部门识别并覆盖同步/登录/撤权/分派；回归两种 IT 名称与非 IT 拒绝；审查后重新打包独立部署，验证本人会话变为工程师。当次修复保持原四位管理员、旧公开入口和原始部门名称；后续名单变更见下方。

2026-09-09 管理名单收敛：用户指定仅保留林炳辰（Albert）、姚泽攀。执行顺序：更新Spec及迁移约束；核对四人钉钉身份和初始化配置并备份；复用ManagerGrantService撤销周熹、蒋燕授权；验证有效管理名单恰为两人、撤权角色按真实部门恢复、管理鉴权拒绝。此项为既有持久化配置调整，不改登录代码或硬编码个人姓名。

该名单调整已执行并只读复核：activeManagers=2；林炳辰、姚泽攀MANAGER；周熹、蒋燕BUSINESS且grant=false，管理鉴权拒绝。备份已生成，两阶段有界审查PASS；详见SERVER-ACCEPTANCE最新名单章节。下述“四位管理员”指先前部署验收时点。

**状态**：2026-09-09 已使用统一脚本将 `20260909-bd92912-uat` 独立部署至目标服务器，五项服务（含 HTTPS 预览）健康，旧公开入口保留。生产依赖告警已清零；181 名有效成员、54 个部门同步及四位管理员配置通过。真实扫码及核心业务闭环（提交附件、审批分派、工程师25%进度、甘特图、阻塞风险/并发）已通过；本人临时管理权限已撤销，剩余消息、备份恢复和最终上线检查，详见 `it-project-console/docs/SERVER-ACCEPTANCE.md`。

**已确认的生产替换目标**：用户指定新系统沿用 `https://pmg.qhhengxin.top:8443`，正式切换后替代旧系统入口。目标服务器为 `192.168.1.245`；只读检查确认现有 Nginx 在服务器监听 80/443，TLS 卷与配置仍由旧部署维护。外部 8443 的网关映射须在切换前实测确认，不把服务器监听端口改成推测值。

- 用户进一步确认全部对外接入配置沿用旧系统，新代码承担兼容：`WEB_ORIGIN` 兼容旧 `NEXTAUTH_URL`，`DINGTALK_CLIENT_ID/SECRET` 兼容旧 `DINGTALK_APP_KEY/SECRET`，CorpId/AgentId 原名不变。
- 正式回调沿用 `https://pmg.qhhengxin.top:8443/api/auth/callback/dingtalk`，不要求修改钉钉后台；新系统同时保留此前 `/api/auth/dingtalk/callback` 兼容路由，共用一次性 state 与 Cookie 校验。
- 完成标准：旧配置名能正确加载、显式新配置优先、两条回调均通过会话/防重放测试，隔离测试清空全部旧凭据别名。数据库连接/附件权限和旧会话兼容性须在生产切换阶段独立验证，不将旧 NextAuth 会话当作新系统会话。
- 先准备独立新服务并完成生产产物、数据恢复及身份验证，再切换现有 HTTPS 入口；保留旧镜像、配置、数据库及附件用于回滚。新旧数据库结构不同，不直接将新服务连到旧库。
- 已新增新系统独立配置、容器和回环预览代理，未改旧代理配置、停止旧应用或发送真实消息。

**统一发布脚本任务（2026-09-09）**：用户要求以后统一从本机打包上传这台服务器，本轮交付脚本并验证，不执行旧系统入口切换。

发布门禁：正式 `/opt/it-project-console` 部署必须审计 high/critical 为零；本次 Vite/xlsx 整改后已满足并完成独立部署。本机隔离测试根仅验证发布流程，不表示企业最终验收完成。

1. 原位复用旧 `scripts/deploy/publish-to-host.ps1` 与 `scripts/server/deploy-bundle.sh` 的镜像打包、SCP 上传和 Compose 部署流程，收窄为本项目的 Web/API；Linux amd64 镜像在本机构建，包不含生产密钥、样例数据或本机依赖目录。
2. 单入口提供 Package、Upload、Initialize、Deploy、Status、Rollback；版本包带清单与 SHA256，服务器独立目录与 Compose 项目，迁移失败阻止启动，记录上一版本，数据库回滚不得冒充镜像回滚。
3. 准备生产 Compose、网关与服务端部署配置；仅在独立本地测试栈做实际镜像安装/升级/回滚验证，检查包隐私、脚本边界与失败路径。新服务默认服务器回环端口，不抢占旧 80/443；公网入口切换及旧业务数据迁移单独验收。
4. 交付可复制命令和服务器首次配置说明，保留已有域名、钉钉凭据/回调与证书；本轮不停止旧服务、不修改其配置或数据。

验证与剩余项详见 `it-project-console/docs/RELEASE-VERIFICATION.md`，日常入口见 `it-project-console/docs/DEPLOYMENT.md`；统一脚本子任务完成不等于整个 Phase 10 完成。

**服务器联调执行（2026-09-09，用户已授权按顺序实施）**：

1. 修复 Vite/xlsx 现有高危依赖，保留 Art 母版组件与业务交互；完成标准是锁文件可重装、依赖 high/critical 为零、类型/测试/生产构建通过。
2. 经代码审查后提交并重新打包，在 `192.168.1.245` 的独立目录初始化及部署；完成标准是新服务健康、旧系统继续运行、密钥仍留服务器且无演示数据。
3. 验证目标机内核兼容、钉钉 API/登录入口、权限与附件链路和备份恢复；真实用户扫码授权须由用户完成，不以模拟登录代替。记录已验证及需用户操作的具体步骤。
4. 完成企业真实验收后再切换正式入口；未通过前保持旧代理与公开域名不变。通知发送仅在明确指定测试对象并获授权后执行。

联调入口：复用现有 TLS 卷只读挂载到独立预览代理，仅绑定服务器回环 `18443`，不改旧代理。通过本机 SSH 隧道和专用浏览器的域名解析覆盖验证原域名 OAuth 回调；不改系统 hosts，不影响其他浏览器访问旧系统。管理员按用户明确选择初始化姚泽攀，再通过既有权限服务加入另外三位旧管理员，保留授权审计。

网关日志要求：新 Web 与预览代理不能把 OAuth code/state 或附件签名参数写入访问/错误日志；访问日志仅保留方法、无查询路径、状态与耗时，server 层统一关闭可能回显原始请求或 Referer 的 Nginx 错误日志，保留 API 的脱敏业务日志与健康检查诊断。回归同时覆盖健康与静态资源错误。

**交付内容**：

- 完成 Web、API、PostgreSQL 和 MinIO 的生产 Compose 与 HTTPS 反向代理配置。
- 完成 Cookie、CORS、CSP、限流、安全头、日志脱敏、密钥注入和 MinIO 私网边界。
- 完成 PostgreSQL 与 MinIO 数据的备份、恢复和一次实际演练。
- 完成 Chrome、Edge、电脑钉钉 WebView、键盘、焦点和颜色对比度验收。
- 汇总 37 条 AC、P0、性能、安全和失败恢复证据。

**关键文件**：

- `it-project-console/compose.production.yaml` — 生产服务、网络和持久化卷。
- `it-project-console/deploy/nginx.conf` — Web、API、HTTPS 与安全响应头。
- `it-project-console/api/Dockerfile` — Fastify API 生产镜像。
- `it-project-console/web/Dockerfile` — Vue 构建与静态镜像。
- `it-project-console/docs/DEPLOYMENT.md` — 初始化、环境变量、升级和回滚。
- `it-project-console/docs/BACKUP-RESTORE.md` — PostgreSQL 与 MinIO 备份恢复。
- `it-project-console/docs/ACCEPTANCE.md` — REQ/AC 对照证据。

**验收标准**：

- 空服务器可按文档完成初始化、migration、启动和健康检查。
- PostgreSQL 与 MinIO 各完成一次可验证恢复演练。
- PostgreSQL、MinIO Console、Bucket 和 API 内部管理入口不直接暴露公网。
- AC-001 至 AC-037 均有自动化或人工验收证据，未通过项不能标记 MVP 完成。
- 未经用户明确要求不执行部署、发布或 push。

---

## 技术栈

| 层级 | 技术 | 锁定版本 | 说明 |
|---|---|---:|---|
| 运行时 | Node.js | 24.18.1 | 前后端统一 LTS 运行时 |
| 包管理 | pnpm | 11.24.0 | workspace 管理 `web` 与 `api` |
| 前端 | Vue | 3.5.21 | 保留 Art Design Pro 母版版本 |
| 构建 | Vite | 7.3.6 | Phase 10 安全补丁升级，保留母版构建配置 |
| 前端语言 | TypeScript | 5.6.3 | 保留母版版本 |
| UI | Element Plus | 2.11.2 | 复用母版组件与视觉系统 |
| 状态管理 | Pinia | 3.0.3 | 复用母版基础设施 |
| 图表 | ECharts | 6.0.0 | 仅必要汇总图使用；甘特不用它 |
| API | Fastify | 5.12.3 | 轻量 REST 模块化单体 |
| API Schema | Zod + fastify-type-provider-zod | 4.5.4 + 7.0.0 | 请求、响应和环境变量统一校验 |
| API 插件 | cookie/cors/helmet/rate-limit | 11.1.2 / 11.3.0 / 13.1.1 / 11.2.0 | 会话 Cookie 和基础安全 |
| OpenAPI | @fastify/swagger + swagger-ui | 9.8.1 + 6.1.1 | 开发环境接口文档与契约 |
| ORM | Prisma ORM | 7.10.0 | PostgreSQL 类型安全访问和 migration |
| 数据库 | PostgreSQL | 16.15 | 沿用本机主版本，仍处于官方支持期 |
| 对象存储 | MinIO | `minio/minio@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e` | 复用本机镜像，私有 Bucket；上线前执行镜像安全审计 |
| 存储初始化 | MinIO Client | `minio/mc@sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727` | 自动创建独立 Bucket |
| S3 SDK | AWS SDK v3 | 3.1126.0 | 复用旧系统预签名和对象操作代码 |
| 定时任务 | node-cron | 4.6.0 | 风险扫描与通知重试，配合 PG 锁 |
| TypeScript（API） | TypeScript | 5.9.3 | 避开刚发布的 TypeScript 7 主版本迁移风险 |
| 单元/集成测试 | Vitest | 4.1.11 | 前后端统一测试框架 |
| 浏览器 E2E | Playwright | 1.62.1 | 三角色主流程和桌面截图回归 |

技术版本依据（保留原计划锁定记录，本次不调整依赖；后端实施前须重新联网核实）：Fastify 和依赖版本来自原选型时的 npm registry；Prisma 7.10 仍受官方完整支持并支持 PostgreSQL 16；PostgreSQL 16 官方支持到 2028-11；MinIO 使用当前本机已安装镜像的 digest 保证开发环境可复现，上线前更新或审计。

Phase 5 实施核验（2026-09-08）：保留已锁定稳定版本（npm 的 Prisma latest 已指向 8.0 RC，不跟随）。审计发现 Prisma 间接依赖 deepmerge-ts/mysql2 有已知高危公告，分别局部固定为 8.0.0 / 3.23.1，并重验 migration、生成、构建和集成测试。前端 Vite/xlsx 告警已在 Phase 10（2026-09-09）整改：Vite 7.3.6、SheetJS 官方 CDN 0.20.3 固定完整性，生产依赖审计各等级均为零；原 Excel 组件未改，新增两种格式兼容回归。依赖审计通过不替代基础镜像和企业联调验收。

Vitest 间接引用的 Vite 也有开发服务器漏洞，测试工具链与前端直接构建依赖均固定到 7.3.6（含 esbuild 补丁），并回归前后端测试。

官方依据：

- Fastify v5 文档：<https://fastify.dev/docs/latest/>
- Prisma 7 与系统要求：<https://www.prisma.io/docs/orm/v7>、<https://docs.prisma.io/docs/orm/reference/system-requirements>
- PostgreSQL 版本支持：<https://www.postgresql.org/support/versioning/>
- AWS SDK v3 S3 预签名：<https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-s3-request-presigner/>
- MinIO JavaScript SDK：<https://github.com/minio/minio-js>

---

## 验证命令

以下是各阶段最终应提供的命令，后端未实现阶段的脚本不代表当前已经可用；本次文档同步不变更技术选型或安装依赖。

| 用途 | 工作目录 | 命令 | 何时执行 |
|---|---|---|---|
| 安装锁定依赖 | `it-project-console` | `corepack enable && pnpm install --frozen-lockfile` | 首次拉取、锁文件变化后 |
| 启动基础设施 | `it-project-console` | `docker compose up -d postgres minio minio-init` | 本地开发和集成测试前 |
| 启动前后端 | `it-project-console` | `pnpm dev` | 本地功能开发 |
| Web 类型检查 | `it-project-console` | `pnpm --filter @it-project-console/web typecheck` | 每个 Web Task 提交前 |
| Web 单元测试 | `it-project-console` | `pnpm --filter @it-project-console/web test` | 每个 Web Task 和 Phase 完成时 |
| Web E2E | `it-project-console` | `pnpm --filter @it-project-console/web test:e2e` | 每个前端 Phase 完成时 |
| Web 构建 | `it-project-console` | `pnpm --filter @it-project-console/web build` | 每个前端 Phase 完成时 |
| API 类型检查 | `it-project-console` | `pnpm --filter @it-project-console/api typecheck` | 每个 API Task 提交前 |
| API 单元测试 | `it-project-console` | `pnpm --filter @it-project-console/api test` | 每个 API Task 和 Phase 完成时 |
| API 集成测试 | `it-project-console` | `pnpm --filter @it-project-console/api test:integration` | Phase 5 起每个后端 Phase 完成时 |
| Prisma 校验 | `it-project-console` | `pnpm --filter @it-project-console/api exec prisma validate` | Schema 或 migration 变化后 |
| API 构建 | `it-project-console` | `pnpm --filter @it-project-console/api build` | 每个后端 Phase 完成时 |
| 全仓检查 | `it-project-console` | `pnpm check` | 每个 Phase 完成时 |
| 生产依赖审计 | `it-project-console` | `pnpm audit --prod --audit-level high` | Phase 10 和发布前 |
| Compose 校验 | `it-project-console` | `docker compose -f compose.production.yaml config` | Phase 10 和部署配置变化后 |

---

## 数据库表

| 表名 | 所属 Phase | 用途与关键约束 |
|---|---:|---|
| `departments` | 5 | 钉钉部门镜像，`ding_dept_id` 唯一 |
| `users` | 5 | 企业用户、部门、角色和启停状态，`ding_user_id` 唯一 |
| `sessions` | 5 | 可撤销登录会话，只保存令牌哈希和过期时间 |
| `manager_grants` | 5 | 最高权限名单和授权审计 |
| `system_settings` | 5 | 工作日、风险阈值、通知时间等服务端配置 |
| `audit_logs` | 5 | 权限、删除、取消、归档和重新打开等操作审计 |
| `notification_outbox` | 5 | 生命周期和风险事件、可空需求/项目关联、收件人、幂等键、投递状态与可投递时间 |
| `demands` | 6 | 业务申请、草稿/待评估/退回补充/不予立项/已立项/已撤回、处理原因与提交幂等键 |
| `attachments` | 6 | MinIO objectKey/外链、元数据和上传状态 |
| `projects` | 6 | 来源、可空 demand_id、唯一整体百分比、阶段、上线/交付原始与当前日期、整体更新时间、归档和版本号 |
| `project_members` | 6 | 主责/协作关系；数据库约束保证唯一主责 |
| `stage_histories` | 7 | 七阶段开始、完成和状态历史 |
| `progress_updates` | 7 | 整体/个人进度类型、百分比与阻塞记录，个人记录不重置整体更新时间 |
| `schedule_changes` | 7 | 日期旧值、新值、原因、操作人和时间 |
| `risk_snapshots` | 7 | 当前风险、风险版本、激活/失效和通知依据 |
| `notification_logs` | 9 | 接收人、幂等键、状态、重试次数和错误摘要 |
| `auth_challenges` | 9 | 一次性 OAuth state 哈希、站内返回地址与过期时间 |

---

## 定版新增验收覆盖

| 验收 | 前端 | 服务端与集成 |
|---|---|---|
| AC-032 整体百分比与显式完成 | Phase 2、3、4 | Phase 7、10 |
| AC-033 上线/交付分离与甘特 | Phase 2、3、4 | Phase 7、8、10 |
| AC-034 退回补充/不予立项 | Phase 2、4 | Phase 6、10 |
| AC-035 直接建项目与唯一主责 | Phase 2、4 | Phase 6、10 |
| AC-036 草稿与必交材料 | Phase 2、4 | Phase 6、10 |
| AC-037 整体停更计时 | Phase 2、3、4 | Phase 7、10 |

## 需求覆盖矩阵

| 需求 | 前端原型 | 后端实现与最终验证 |
|---|---:|---:|
| REQ-001 钉钉身份与角色权限 | Phase 1、4 | Phase 5、9、10 |
| REQ-002 业务需求提交 | Phase 2、4 | Phase 6、10 |
| REQ-003 单级立项与人员分派 | Phase 2、4 | Phase 6、10 |
| REQ-004 七环节进度管理 | Phase 2 | Phase 7、10 |
| REQ-005 滚动计划与风险规则 | Phase 2、3 | Phase 7、10 |
| REQ-006 钉钉消息提醒 | 通知入口原型 | Phase 7、9、10 |
| REQ-007 风险优先项目总览 | Phase 2、3、4 | Phase 8、10 |
| REQ-008 人员负载视图 | Phase 3、4 | Phase 8、10 |
| REQ-009 月度整体项目甘特图 | Phase 3、4 | Phase 8、10 |
| REQ-010 项目详情与历史 | Phase 2、3、4 | Phase 7、10 |
| REQ-011 删除、取消与归档 | Phase 3、4 | Phase 6、7、10 |
| REQ-012 领导可评审的真实前端原型模式 | Phase 1、2、3、4 | 生产环境禁用，Phase 10 复核无残留 |

---

## 开发规则

- 视觉以定版 V2 HTML > `Design-Brief.md` 为准；业务规则以 `Product-Spec.md` 为准。HTML 示例逻辑不能覆盖正式规则，现有 Art 母版必须原位复用。
- 每个 Phase 开始前拆成 1–3 个可独立验收 Task。
- 每个 Phase 执行 Code Review、测试完整性、编译验证和功能测试；全部通过才能 commit。
- 前端前四个 Phase 按“底座 → 纵向闭环 → 管理决策 → 领导确认”顺序执行，不按角色各自铺一套孤立页面。
- 所有可见核心业务操作必须修改共享状态并刷新关联页面；仅弹 Toast、死按钮和静态假成功不计入完成。
- Phase 4 未通过或领导未明确确认时，禁止开始 Phase 5；反馈先同步 Product Spec、Design Brief 和 DEV-PLAN，再迭代前端。
- Git 提交可用 `feat`、`fix`、`refactor`、`chore` 前缀，但摘要必须有中文。
- 不在产品子目录 `git init`，不修改 Art Design Pro 母版仓库。
- 前端优先复用已有实现，只新增风险表格、七阶段、进度弹窗、只读甘特等业务组件。
- 后端按已确认的 Fastify + Prisma + PostgreSQL 16 + MinIO 方案实施；新增基础设施前先检查旧项目是否已有可收窄复用的代码。
- 权限和数据范围最终必须由服务端校验，前端隐藏按钮不是安全边界。
- push、远程仓库、部署和发布必须由用户明确要求后执行。

2026-09-09 最新迁移执行：仅未删除进行中18、已完成56，共74条。用户要求缺关键字段也必须接入，授权补造明确标记的占位数据；其余不兼容资料跳过。步骤：更新Spec→只读导出和字段映射→独立数据库备份恢复与两次导入演练→有界审查→新系统事务导入→核对74条、状态分布、两人管理名单、通知无新增、页面读取。保留原库和联调项目，不新增旧档案模块。

迁移执行完成：74条已写入新系统（18进行中/56已完成），保留原测试后75；74份审计与迁移说明，45占位负责人（3进行中），8条兼容进展。隔离导入/重复执行/人工修改保留/末尾故障回滚通过，四API200，5映射测试及两阶段审查PASS。数据库恢复通过，浏览器视觉验收与对象存储恢复仍未完成；旧公开入口未切换。详见MIGRATION-ASSESSMENT实际执行结果。

2026-09-09 19:02：按用户指定仅给张帅完成真实定时通知测试，60秒触发、120秒正向SENT回执，仅发送1次。生产总开关仍关闭、原6条队列不变，独立测试库已清理、审计已留存。管理人员09:00汇总真实发送与全量启用尚未执行，详见SERVER-ACCEPTANCE。

2026-09-09 CSV替换计划：解析GB18030新文件20条并核对hash→生成18项目/2待评估需求映射→备份当前新库和保存附件对象清单→独立数据库事务替换/重跑幂等/失败回滚→有界审查→生产事务替换→真实页面20条总量及两人名单、通知关闭复核。

CSV替换已完成（2026-09-09 19:33）：新系统18 ACTIVE项目＋2 PENDING需求，旧75项目/1测试需求/2附件元数据/6队列已清理。10项映射测试、两阶段审查、隔离替换/幂等/20表全内容故障回滚、生产20行字段及审计核验通过；真实会话页面18项目/2需求/9月甘特9条验证。两人管理名单及通知关闭保留，演练库已清理。实际范围与占位说明见MIGRATION-ASSESSMENT最新一节。

正式上线执行计划：1 完整备份及隔离恢复逐项核验；2 每日备份/保留14份（只清理本脚本成功批次）及失败日志；3 实际部署镜像漏洞扫描；4 旧代理原位切换及回退脚本，独立Nginx验收和代码审查；5 正式路由切换与真实浏览器验证。用户暂缓占位核实，通知仍关闭。

2026-09-09正式收尾：21表＋2对象隔离恢复PASS，每日03:30完整备份、14批保留/PIN、失败状态与日志轮转已落地，新旧HTTPS候选200及清理PASS。实际镜像扫描未通过：5运行镜像32个CRITICAL命中，mc另3；正式切换门禁实测阻断，旧路由不变。镜像整改、底座许可/兼容决策及公开切换验收尚未完成，详见GO-LIVE-CHECK。

2026-09-09用户决定保留MinIO，取消AIStor/替代存储路线。继续同产品安全适用性审查及必要兼容修复，不以替换底座作为默认前提。

MinIO补丁候选计划：原tag源码隔离副本→固定Go工具链与grpc/x-crypto补丁依赖→模块完整性和构建→原始扫描保留并复扫→数据卷副本附件/恢复/旧内核验证→有界审查。仅构建研究，未验证前不更换生产镜像；任何兼容性补丁需独立记录。PG libxml2保持affected，无官方同发行版已修包，不能冒充全部漏洞清零。

MinIO补丁初验完成：两个原tag源码副本经Go1.27.1/grpc1.79.3/crypto0.55.0构建，模块verify通过，3项目标依赖CVE消失；Trivyraw0critical/20high，但(devel)漏报本体版本条目，OIDC/LDAP必须承接原始记录。目标服务器3.10内核、备份独立卷两个旧对象hash及CRUD/匿名403通过，清理PASS。尚未完整附件应用/multipart/重启回归、版本元数据与剩余安全处置；生产MinIO及公开入口未改。详见GO-LIVE-CHECK。

2026-09-10继续收尾：服务器健康、凌晨03:30备份成功；保持MinIO原tag源码，针对明确有修复版本的剩余Go依赖构建第二候选并复扫，补正式自定义版本标识和可复现构建材料；用独立存储/测试schema复用完整附件集成测试，加multipart与重启校验。PG XML残余风险需单独解决，不擅自将未修复项标零。全部证据具备后再推进候选发布和正式入口。

2026-09-10用户调整优先级：停止不影响正常功能的底层整改，停止PG XML自制修补，不再扩大数据库/存储改造；风险如实保留。第二MinIO候选72项应用集成、multipart/重启读取通过，生产不换研究镜像；API实际镜像临时库重复迁移及状态检查通过。公开代理候选HTTPS200、危险上传403、旧入口回退候选200均通过，正式域名仍未切换。后续只完成必要应用及入口补丁发布、准入记录、正式切换和上线实际验收，不以研究候选补齐或扫描清零作为新增工作目标。

2026-09-10 09:43实际收尾：统一包20260910-go-live-v2已校验、部署健康，正式域名已切换。136前端＋55后端＋72真实集成＋6发布＋7浏览器流程通过，有界审查及回退故障分支通过；部署前新完整备份和SQL备份均成功。业务表摘要保持，通讯录正常同步已核验；18项目/2需求、两名管理人员及关闭通知保留。正式TLS健康/资源/权限边界/钉钉入口和预签名附件上传下载、摘要及清理通过。当前仅等待切换后真人扫码及其登录页面核验，不将此等待误标完成。详见GO-LIVE-CHECK最新结果。

2026-09-10 09:53最终验收：Chrome真人钉钉登录张帅/IT部/ENGINEER通过，me/workspace200，工程师管理接口403；本人3项目、全部18项目、需求2条、需求分布及项目图表、9月9项目甘特/切月/详情/进度表单取消通过。写入流程由72项集成和7条隔离真实浏览器回归证明，正式数据未为测试而改写。既定发布收尾完成，正式通知仍关闭；已知迁移占位与底层限制保留。


## 2026-09-11 迭代实施计划（本地验收及生产部署通过）
1. 数据与服务：api/prisma、modules/projects、progress、workspace、risk；支持无日期立项、完整排期/历史、阶段自动流转、验收自动完成及旧数据兼容。验收：权限、缺计划、日期顺序、版本冲突、重复提交、改期、重开、迁移集成通过。
2. 项目UI与原型：web/components/project、hooks/business/use-progress-form、services/progress/management/workflow、repositories/migration、甘特图；原位实现已确认四张预览。验收：五阶段排期与完成闭环、旧数据只补剩余、百分比退出、历史可查。
3. 需求池：api/modules/dashboard/demand-statistics-service/query-schemas，web/views/my-demands、use-demand-page、analytics-service；一次筛选带动全部结果。验收：日期、正常/延期完成、空态、重置、月份范围和指标/清单一致。
4. 交付验证：pnpm typecheck、pnpm test、pnpm build、API test:integration、web test:e2e、真实API test:browser，code-reviewer两阶段审查修复；本地提交前运行项目门禁，不部署。

执行结果及用例证据见 [本轮验收记录](it-project-console/docs/STAGE-PLAN-VERIFICATION.md)：Web 153、API 65、集成 96、原型浏览器 42、真实浏览器 7、发布配置 6、Harness 20 条通过，前后端构建和独立两阶段审查通过。

用户后续明确授权生产发布，已部署 `20260911-ee53742`。完整备份、SQL备份、新迁移、服务健康、数据摘要、正式HTTPS附件与张帅现有登录浏览器验收通过；原19项目/4需求及业务历史保留。详见上方验收记录的生产章节。

## 第二轮：日期快捷筛选、项目编号、工程师例外资格与阶段甘特图（本地实现及验收通过）
依据：it-project-console/docs/UI-ROUND2-CONFIRMATION.md。
1. 数据基础：Project唯一编号与存量迁移，阶段完成时保留计划，工程师例外资格持久化及审计；验收并发/回填/角色保持与撤销。
2. 原位前端：统一日期快捷项、项目编号显示搜索、七阶段真实状态大块、双排甘特及鼠标提示；验收与已确认截图一致且未知数据不伪造。
3. 综合验证：pnpm typecheck、pnpm test、pnpm build、隔离API集成、Playwright业务流程及独立code-reviewer两阶段审查；通过后本地提交，不自动部署。

验收见 it-project-console/docs/UI-ROUND2-VERIFICATION.md：原型浏览器44个独立用例、真实API浏览器7项、隔离集成99项、类型及构建通过，独立两阶段审查通过。周熹生产启用须随后续明确授权的部署执行，不在本轮改生产。
# 公司LOGO替换

原位修改ArtLogo图片引用与index.html的favicon，使用同一公司原图；验证比例、实际加载及构建，独立审查后本地提交。本次不包含生产发布。

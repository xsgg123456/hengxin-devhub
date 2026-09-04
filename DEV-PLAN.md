# Development Plan — IT 项目管理台

> 本文件记录已确认的前后端技术方案、分阶段交付和验证标准。开发必须按依赖顺序执行。

---

## 0. 当前状态

| 项目 | 状态 |
|---|---|
| Product Spec | 已完成，12 项需求、31 条验收标准 |
| Design Brief | 已完成，Art Design Pro 为视觉与前端基线 |
| 设计交付方式 | 已确认：不单独画 Pencil、不做一次性 HTML；真实 Vue 前端就是领导可操作的评审版 |
| 前端技术 | 已确认：复用 Art Design Pro 现有代码和技术栈 |
| 后端技术架构 | 已确认：Node.js + TypeScript + Fastify + Prisma + PostgreSQL 16 + MinIO |
| 产品代码 | Phase 1 已实现、验证并通过代码审查，等待用户视觉确认 |
| 当前可执行阶段 | Phase 1 视觉验收；确认后进入 Phase 2 |
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

**状态**：已实现、验证并通过代码审查（2026-09-04），待用户视觉确认

**交付内容**：

- 复制并运行 Art Design Pro，保留布局、路由、权限、请求封装、Pinia、表格、表单、抽屉和图标能力。
- 删除或禁用主题设置、深色模式、布局切换、多语言、工作标签、多余 Dashboard、聊天和示例入口。
- 建立原型/生产运行模式和统一 service/repository 边界，页面只能通过接口访问数据，后端落地时不重写页面。
- 建立覆盖业务人员、项目主负责人、项目协作人员和管理人员的四个固定演示账号；在顶部当前用户区域实现仅原型模式可见的身份切换、“演示模式”标识和一键重置。
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
- 四个演示账号可切换；每次切换后当前用户、默认首页、导航和路由权限同步变化，刷新后保留当前身份。
- 所有页面数据调用都经过统一 repository；修改数据后切换身份或刷新仍保留，一键重置可恢复完全一致的初始快照。
- 生产模式无法显示身份切换、演示标识和重置入口，也无法回退到 Mock 数据源。
- 1024、1280、1440px 工作区可用；手机、平板和过窄窗口不加载业务数据。
- 类型检查、单元测试和生产构建通过。

---

## Phase 2: 跨角色最小业务闭环

**状态**：待开始，依赖 Phase 1

**交付内容**：

- 实现业务人员“我的需求”和提交表单；完成校验后创建待审批需求，并以“模拟上传”展示 PRD 与 HTML 原型的附件元数据。
- 实现管理人员“需求审批”和审批抽屉；通过立项后从同一需求生成唯一正式项目、主负责人、协作人员及前两环节历史。
- 实现 IT 工程师“我的项目”、项目详情、固定七阶段和进度更新抽屉；主负责人可更新阶段、状态和日期，协作人员只能提交个人进展或阻塞。
- 实现管理人员“项目总览 / 风险工作台”的核心版本；工程师更新后，同一项目的指标、风险文字、当前阶段和最近更新时间立即变化。
- 贯通“业务提交 → 管理立项 → 主负责人更新 → 管理查看结果”的共享 Mock 数据链路，不允许用静态假成功代替关联数据变化。

**关键文件**：

- `it-project-console/web/src/views/my-demands/index.vue` — 业务需求列表。
- `it-project-console/web/src/views/demand-form/index.vue` — 提交和编辑需求。
- `it-project-console/web/src/views/demand-approval/index.vue` — 待审批列表。
- `it-project-console/web/src/components/demand/attachment-field.vue` — 明确标识为模拟上传的 PRD 和 HTML 原型输入。
- `it-project-console/web/src/components/demand/approval-drawer.vue` — 立项与退回操作。
- `it-project-console/web/src/views/my-projects/index.vue` — 工程师项目入口。
- `it-project-console/web/src/views/project-detail/index.vue` — 项目详情。
- `it-project-console/web/src/views/project-overview/index.vue` — 风险优先管理首页。
- `it-project-console/web/src/views/project-overview/modules/risk-project-table.vue` — 风险项目表格。
- `it-project-console/web/src/components/project/stage-progress.vue` — 固定七阶段进度条。
- `it-project-console/web/src/components/project/progress-update-drawer.vue` — 进度更新抽屉。
- `it-project-console/web/src/components/project/risk-tag.vue` — 文字加颜色的风险标签。
- `it-project-console/web/src/domain/demand.ts` — 需求状态与附件类型。
- `it-project-console/web/src/domain/project.ts` — 阶段、状态和成员类型。
- `it-project-console/web/src/services/demand-service.ts` — 需求数据接口边界。
- `it-project-console/web/src/services/project-service.ts` — 项目与管理总览数据接口边界。
- `it-project-console/web/src/services/progress-service.ts` — 进度数据接口边界。

**验收标准**：

- 从重置后的初始场景开始，可连续走通“业务提交 → 管理立项 → 主负责人更新 → 管理查看结果”，且全程操作同一需求和项目记录。
- 立项生成的项目立即出现在所选主负责人和协作人员的“我的项目”；主负责人更新后，管理总览显示新的阶段、状态、日期和风险。
- 主负责人可在 1 分钟内更新一次进度；七阶段名称和顺序固定，不出现百分比字段。
- 业务只看本部门，工程师只看本人主责或协作项目，管理人员看全部；直接访问无权限路由或执行越权操作都不能修改共享数据。
- 完成闭环后刷新页面仍保留结果；一键重置后需求、项目、进度、风险和当前身份恢复固定初始状态。
- 类型检查、单元测试、跨角色 E2E 和生产构建通过。

---

## Phase 3: 管理决策与生命周期补齐

**状态**：待开始，依赖 Phase 2

**交付内容**：

- 完成风险工作台：五个指标、今日需关注、项目表格、负责人/部门/阶段/状态/风险筛选，以及延期、停更、阻塞、临期和计划变化的确定性计算。
- 完成项目详情的日期调整历史、进度历史和管理纠正；支持需求退回/重提/撤回/删除，以及项目完成、取消、归档、重新打开和符合条件的误建删除。
- 实现人员负载：分开统计主责、协作、同期项目、阶段和风险，不做排名、得分或绩效评价。
- 用 DOM/CSS Grid 实现只读月度甘特：一项目一行、整体时间条、原计划标记、今日线、风险颜色和延期文字。
- 实现管理人员名单页的 Mock 交互和最后一名管理员保护，并让所有管理页面继续使用 Phase 2 的共享数据。

**关键文件**：

- `it-project-console/web/src/components/project/schedule-history.vue` — 日期调整历史。
- `it-project-console/web/src/services/risk-service.ts` — 前端评审版确定性风险计算。
- `it-project-console/web/src/views/workload/index.vue` — 人员负载。
- `it-project-console/web/src/views/monthly-gantt/index.vue` — 月度甘特页面。
- `it-project-console/web/src/components/project/monthly-gantt.vue` — CSS Grid 只读时间轴。
- `it-project-console/web/src/views/manager-grants/index.vue` — 管理人员名单。
- `it-project-console/web/src/services/management-service.ts` — 负载、甘特和管理人员数据接口边界。

**验收标准**：

- 管理人员首屏先看到五个指标和约 8–12 行风险项目，可在 30 秒内按负责人、部门、阶段、状态或风险定位目标项目。
- 日期变化未填原因不能保存；保存后旧值、新值、原因、操作人和时间可查看，管理纠正与项目生命周期操作同步反映到所有相关页面。
- 负载分开统计主责和协作，多人项目只有一人计入主责；甘特展示与所选月份相交的项目，延期同时有颜色和“延期 N 天”。
- 项目完成、取消、归档、重新打开和删除规则与 Product Spec 一致，刷新与角色切换后状态不回滚。
- 页面没有 AI、聊天、工单、子任务、工时、绩效排名、甘特拖拽、依赖和阶段分段。
- 类型检查、单元测试、关键管理路径 E2E 和生产构建通过。

---

## Phase 4: 领导评审版打磨与确认

**状态**：待开始，依赖 Phase 3

**交付内容**：

- 补齐三类角色的导航、页面互通以及加载、空数据、网络错误、保存失败、无权限、提交中、成功和数据损坏恢复状态。
- 建立可控演示场景，在不改代码的情况下切换正常、空数据、加载、保存失败和无权限结果；失败场景不得破坏最近一次成功数据。
- 清理全部死按钮、静态假成功、孤立页面和模板残留；所有可见核心业务操作必须产生可追踪的数据变化或明确说明模拟边界。
- 用 Playwright 固化跨角色完整闭环、权限隔离、刷新持久化、一键重置、异常恢复和 1024/1280/1440px 截图基线。
- 编写领导评审路线与结果清单；领导未明确确认流程、信息结构和核心交互时，Phase 5 保持锁定并回到上游文档和前端迭代。

**关键文件**：

- `it-project-console/web/src/mocks/scenarios.ts` — 正常、空数据、失败和无权限演示场景。
- `it-project-console/web/src/components/system/prototype-scenario-menu.vue` — 仅原型模式可见的受控场景入口。
- `it-project-console/web/src/components/system/error-recovery.vue` — 演示数据损坏提示与重置恢复。
- `it-project-console/web/playwright.config.ts` — E2E 与桌面视口配置。
- `it-project-console/web/e2e/leadership-review.spec.ts` — 跨角色完整闭环和评审路径。
- `it-project-console/web/e2e/prototype-boundary.spec.ts` — 权限、持久化、重置和生产禁用验证。
- `it-project-console/docs/LEADERSHIP-REVIEW.md` — 可重复执行的领导评审路线和结论清单。

**验收标准**：

- 从一键重置开始，可在同一浏览器连续完成“提交需求 → 审批立项 → 更新进度 → 查看风险、负载与甘特”，中途刷新或切换身份不丢数据。
- 四个演示账号的导航、默认首页、数据范围和操作权限正确；直接访问无权限路由或越权操作不会改变数据。
- 核心页面的加载、空、错误、无权限、提交中、成功和恢复状态均可稳定重现，所有可见核心按钮均有可观察结果。
- Design Brief 的 11 个 SCREEN、15 个 CMP 和全部通用状态逐项通过。
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

**状态**：待开始且锁定；依赖 Phase 4 通过及领导明确确认前端评审版

**交付内容**：

- 建立 Fastify API、统一响应/错误、Zod 校验、OpenAPI、日志、安全插件和健康检查。
- 建立独立 PostgreSQL 16、MinIO、自动建桶及独立数据卷，提供可重复启动的 Docker Compose。
- 建立 Prisma 基础模型、migration、种子数据、服务端 RBAC 和仅开发环境可用的四个演示账号（业务、主责、协作、管理）；同时建立可在业务事务内写入的通知 outbox。
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
- `it-project-console/compose.yaml` — 独立 PostgreSQL、MinIO、minio-init、API 和 Web 编排。

**验收标准**：

- 空环境执行 Compose 可创建 `it_project_console` 数据库、`it-project-console` 私有 Bucket 和独立 volume，不访问旧系统数据。
- migration 和 seed 可重复执行；三个开发身份能获得正确角色，生产环境无法启用开发登录。
- 未登录为 401、越权为 403，错误响应不暴露堆栈、数据库字段或密钥。
- 合法文件可完成申请、直传、确认和鉴权下载；非法类型、超限、伪造确认和越权下载被拒绝。
- API 类型检查、单测、集成测试、构建和依赖审计通过。

---

## Phase 6: 需求提交与单级立项闭环

**状态**：待开始，依赖 Phase 5

**交付内容**：

- 实现本部门需求查询、创建、修改、撤回、退回后重提和受约束删除。
- 实现 PRD 与 HTML 原型的 MinIO 文件或 HTTPS 链接保存，删除未引用附件时同步清理对象。
- 实现管理人员单级立项和退回；立项事务一次创建项目、七阶段初始记录、唯一主负责人和协作关系。
- 退回时在同一事务写入业务提交人的通知 outbox；立项时写入提交人、主负责人和全部协作人员的通知 outbox，业务事务成功后由 Phase 9 投递。
- 将“我的需求、提交需求、需求审批”从 mock 切换为真实 API，保留显式原型模式用于 UI 演示。

**关键文件**：

- `it-project-console/api/src/modules/demands/demand-routes.ts` — 需求 REST 路由与数据范围入口。
- `it-project-console/api/src/modules/demands/demand-service.ts` — 需求状态、幂等和删除规则。
- `it-project-console/api/src/modules/demands/demand-schemas.ts` — 请求与响应 Zod Schema。
- `it-project-console/api/src/modules/approvals/approval-routes.ts` — 立项和退回端点。
- `it-project-console/api/src/modules/approvals/approval-service.ts` — 单级立项事务。
- `it-project-console/api/src/modules/notifications/lifecycle-event-service.ts` — 退回、立项和完成事件的幂等记录。
- `it-project-console/web/src/services/demand-service.ts` — 需求真实 API 与 mock 适配。

**验收标准**：

- AC-004 至 AC-008 通过集成测试。
- 重复提交不创建两条需求，同一需求并发立项只产生一个项目。
- 已立项需求及被项目引用的 MinIO 对象不能物理删除。
- 业务人员不能读取其他部门需求，工程师不能调用审批接口。
- 浏览器完成“提交需求 → 管理人员立项 → 项目进入方案设计”的真实流程。
- 退回和立项事务分别生成正确收件人的通知事件，通知服务未配置时不影响业务结果。

---

## Phase 7: 项目进度、历史与风险引擎

**状态**：待开始，依赖 Phase 6

**交付内容**：

- 实现主负责人更新阶段、简单状态、阶段预计完成日、预计上线日和公开进展。
- 实现协作人员个人进展与阻塞，服务端禁止协作者修改整体阶段和关键日期。
- 实现七阶段历史、日期调整历史、完成自动归档；允许管理人员纠正阶段/简单状态、取消、手动归档、重新打开，并仅在项目从未产生进度记录时物理删除。
- 项目完成事务写入业务提交人的完成通知 outbox，实际投递失败不能回滚项目完成。
- 移植工作日算法，实现临期、阶段延期、项目延期、计划变化、3 工作日停更和阻塞风险快照。
- 使用 `node-cron` 定时重算风险，使用 PostgreSQL advisory lock 保证同一批任务只执行一次；风险扫描事务在风险首次出现、风险值变化或风险集合变化时幂等写入对应收件人的通知 outbox。

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

- AC-009 至 AC-014、AC-023 至 AC-026 通过自动化测试。
- 主责、协作、业务和管理人员的数据范围均由 API 强制执行。
- 阶段、进度和日期旧值不可覆盖；关键写入全部处于事务内。
- 管理人员纠正操作写入历史；有进度记录的项目不能物理删除，只能取消或归档。
- 风险测试覆盖临界日、跨周末、重复扫描、风险解除和风险值变化。
- 相同风险版本重复扫描不新增 outbox；风险首次出现或风险值/集合变化时生成新 outbox，钉钉未配置不影响风险快照提交。
- 浏览器完成“更新进度 → 风险变化 → 完成归档 → 管理人员重新打开”。

---

## Phase 8: 管理看板与全量联调

**状态**：待开始，依赖 Phase 7

**交付内容**：

- 实现风险工作台的五个指标、今日需关注、全项目筛选和分页查询。
- 实现分别统计主责与协作的人员负载聚合。
- 实现仅返回项目整体区间、今日线和风险信息的月度甘特查询。
- 实现管理人员名单维护和最后一名管理员保护。
- 移除生产路径 mock，统一前后端加载、错误、空数据和权限状态。

**关键文件**：

- `it-project-console/api/src/modules/dashboard/dashboard-routes.ts` — 管理看板端点。
- `it-project-console/api/src/modules/dashboard/dashboard-service.ts` — 风险指标和需关注聚合。
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

**状态**：待开始，依赖 Phase 8；真实联调需要企业应用凭据

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

**状态**：待开始，依赖 Phase 9；公司环境上线需要域名、证书和网关信息

**交付内容**：

- 完成 Web、API、PostgreSQL 和 MinIO 的生产 Compose 与 HTTPS 反向代理配置。
- 完成 Cookie、CORS、CSP、限流、安全头、日志脱敏、密钥注入和 MinIO 私网边界。
- 完成 PostgreSQL 与 MinIO 数据的备份、恢复和一次实际演练。
- 完成 Chrome、Edge、电脑钉钉 WebView、键盘、焦点和颜色对比度验收。
- 汇总 27 条 AC、P0、性能、安全和失败恢复证据。

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
- AC-001 至 AC-027 均有自动化或人工验收证据，未通过项不能标记 MVP 完成。
- 未经用户明确要求不执行部署、发布或 push。

---

## 技术栈

| 层级 | 技术 | 锁定版本 | 说明 |
|---|---|---:|---|
| 运行时 | Node.js | 24.18.1 | 前后端统一 LTS 运行时 |
| 包管理 | pnpm | 11.24.0 | workspace 管理 `web` 与 `api` |
| 前端 | Vue | 3.5.21 | 保留 Art Design Pro 母版版本 |
| 构建 | Vite | 7.1.5 | 保留母版版本 |
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

技术版本依据：Fastify 和依赖版本取 npm registry 当前稳定版；Prisma 7.10 仍受官方完整支持并支持 PostgreSQL 16；PostgreSQL 16 官方支持到 2028-11；MinIO 使用当前本机已安装镜像的 digest 保证开发环境可复现，上线前更新或审计。

官方依据：

- Fastify v5 文档：<https://fastify.dev/docs/latest/>
- Prisma 7 与系统要求：<https://www.prisma.io/docs/orm/v7>、<https://docs.prisma.io/docs/orm/reference/system-requirements>
- PostgreSQL 版本支持：<https://www.postgresql.org/support/versioning/>
- AWS SDK v3 S3 预签名：<https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-s3-request-presigner/>
- MinIO JavaScript SDK：<https://github.com/minio/minio-js>

---

## 验证命令

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
| `demands` | 6 | 业务申请、状态、退回原因和提交幂等键 |
| `attachments` | 6 | MinIO objectKey/外链、元数据和上传状态 |
| `projects` | 6 | 项目主记录、当前阶段、简单状态、日期、归档和版本号 |
| `project_members` | 6 | 主责/协作关系；数据库约束保证唯一主责 |
| `stage_histories` | 7 | 七阶段开始、完成和状态历史 |
| `progress_updates` | 7 | 不可覆盖的进度与阻塞记录 |
| `schedule_changes` | 7 | 日期旧值、新值、原因、操作人和时间 |
| `risk_snapshots` | 7 | 当前风险、风险版本、激活/失效和通知依据 |
| `notification_logs` | 9 | 接收人、幂等键、状态、重试次数和错误摘要 |

---

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

- 单一真相源优先级：真实前端原型 > `Design-Brief.md` > `Product-Spec.md`。
- 每个 Phase 开始前拆成 1–3 个可独立验收 Task。
- 每个 Phase 执行 Code Review、测试完整性、编译验证和功能测试；全部通过才能 commit。
- 前端前四个 Phase 按“底座 → 纵向闭环 → 管理决策 → 领导确认”顺序执行，不按角色各自铺一套孤立页面。
- 所有可见核心业务操作必须修改共享状态并刷新关联页面；仅弹 Toast、死按钮和静态假成功不计入完成。
- Phase 4 未通过或领导未明确确认时，禁止开始 Phase 5；反馈先同步 Product Spec、Design Brief 和 DEV-PLAN，再迭代前端。
- Git 提交可用 `feat`、`fix`、`refactor`、`chore` 前缀，但摘要必须有中文。
- 不在产品子目录 `git init`，不修改 Art Design Pro 母版仓库。
- 前端优先复用已有实现，只新增风险表格、七阶段、进度抽屉、只读甘特等业务组件。
- 后端按已确认的 Fastify + Prisma + PostgreSQL 16 + MinIO 方案实施；新增基础设施前先检查旧项目是否已有可收窄复用的代码。
- 权限和数据范围最终必须由服务端校验，前端隐藏按钮不是安全边界。
- push、远程仓库、部署和发布必须由用户明确要求后执行。

# 后端本地开发

Phase 7 已接入真实需求、单级审批、立项、附件、进度、项目生命周期和风险。前端继承 Art Design Pro 页面与交互，提供独立原型和真实联调模式；钉钉登录在 Phase 9 接入。

## 启动

在 `it-project-console` 目录依次执行：

```powershell
pnpm install --frozen-lockfile
pnpm setup:local
docker compose up -d postgres minio minio-init
pnpm --filter @it-project-console/api db:migrate
pnpm --filter @it-project-console/api db:seed
pnpm dev
# 另一个终端启动真实前端
pnpm dev:live
```

`setup:local` 仅首次生成根 `.env` 与 `api/.env`，使用随机凭据，不覆盖现有配置。两者均被 Git 忽略。已有配置缺项时参照 `.env.example` 补齐，不重新初始化数据库。

- 原型前端：http://127.0.0.1:4317/ ，使用原有浏览器演示库。
- 真实前端：http://127.0.0.1:4318/ ，选择本地联调账号后读写独立 PostgreSQL/MinIO。已有 `api/.env` 的 `WEB_ORIGIN` 须改为 `http://127.0.0.1:4318` 并重启 API。
- API：http://127.0.0.1:4322/ ，文档在 `/docs`，存活 `/health/live`，数据库和存储就绪 `/health/ready`。
- PostgreSQL：回环端口 55432、独立数据库 `it_project_console`。
- MinIO：回环端口 59000、Console 59001、私有 Bucket `it-project-console`。凭据读取本机 `.env`。

已有前端服务运行时用 `pnpm dev:api` 单独启动 API。默认 API 端口使用本机空闲的 4322，可在 `api/.env` 修改。停止基础设施用 `docker compose stop`；常规停止不会删除数据卷。

## API 契约

成功响应使用 `{data: ...}`；错误为 `{error: {code,message}, requestId}`（依赖就绪检查的503只含error）。参数错误400、未登录401、越权403、不存在404；内部异常不会返回数据库连接信息或堆栈。

开发环境须显式 `DEV_LOGIN=true` 才注册 `POST /api/auth/dev-login`，Body 为 `{userId}`，四个 ID 为 `user-manager-chen`、`user-business-li`、`user-engineer-wang`、`user-engineer-zhao`。这是后端开发入口，生产环境禁止启用。生产接口文档也关闭。

所有 POST/PUT/PATCH/DELETE 必须携带与 `WEB_ORIGIN` 完全一致的 Origin。登录返回 HttpOnly/SameSite Cookie，数据库只存令牌哈希；`GET /api/me` 查询当前身份，`POST /api/auth/logout` 撤销会话。每次访问重读用户启停状态和角色，`GET /api/admin/settings` 仅管理人员可读。生产 Cookie 为 Secure，生产 Origin 必须 HTTPS。

附件流程：

1. `POST /api/attachments/upload`，Body `{demandId,kind,name,mime,size}`。kind 为 `PRD` 或 `PROTOTYPE`；仅需求本人且状态可编辑时允许申请。
2. 使用返回的 `uploadUrl` 和 `headers` 执行 PUT，Body 为原文件。单文件20MB、同需求含待确认上传合计50MB；文件类型和MIME必须匹配。签名有效期5分钟。
3. `POST /api/attachments/:id/confirm`。服务端检查真实对象大小/MIME、条件复制到客户端不可写的最终对象并再次检查；重复确认幂等。尚未真实上传、大小不符、过期或越权都会拒绝。
4. `GET /api/attachments/:id/download` 返回5分钟下载链接。必须先登录，下载强制 attachment/octet-stream，HTML不会在应用同源页面执行。

需求额度分配、确认和清理共享数据库行锁。上传链接只能写临时对象，重放不会覆盖已确认文件。后台每分钟清理到期超过一分钟的未确认上传；已保存引用的附件只清临时对象。未保存到需求的已确认文件可由 `DELETE /api/attachments/:id` 丢弃，客户端移除/替换时调用；关闭页面遗漏的未引用 READY 文件满24小时后回收。删除需求或替换已保存材料时，事务写入持久对象删除队列；临时对象等签名过期额外一分钟再删，最终对象下一个清理周期删除。清理失败记录脱敏数量并下周期重试。

## 需求与立项

`GET /api/workspace` 返回当前会话可读的真实用户、需求、项目及阶段历史，兼容既有页面 DTO。需求使用 POST 创建、PATCH 修改、POST `/:id/withdraw` 撤回和 DELETE 删除。管理人员通过 POST `/api/demands/:id/review` 评估；POST `/api/projects` 直接立项。

每个写命令携带 `requestId`，修改还携带 `version`。相同请求重试返回已提交结果；同请求号不同内容或过期版本返回409。通知只写入 outbox，Phase 9 前不会发送钉钉消息。真实模式可更新进度、纠正、完成归档和管理重开；管理员授权仍待后续身份管理阶段。原型保留原有演示交互。

## 进度、历史与风险

`POST /api/projects/:id/progress` 接收 `requestId/version/kind/summary/status`；整体更新另外接收百分比及日期字段。协作人员只允许个人进展和阻塞，服务端拒绝整体字段。日期变化必须填写原因与说明，写入不可覆盖的旧值/新值记录。阶段标记完成后填写下一阶段日期并按固定顺序推进；100% 不自动关闭。

`POST /api/projects/:id/correct` 为管理纠正；`POST /api/projects/:id/action` 支持 complete/cancel/archive/reopen/delete。完成仅允许主负责人在验收交付完成后显式执行，并自动归档。有进度记录不能物理删除；删除无进度的需求项目会恢复关联需求为待评估。重开/纠正保留旧阶段记录并创建新 episode。

风险由服务端统一生成 `Project.risks/riskVersion` 和版本历史 `RiskSnapshot`，页面、待办和甘特读取同一快照。每次项目变更同事务重算，另由 node-cron 启动扫描并默认每分钟运行一次。`RISK_SCAN_CRON` 可改变扫描周期，时区固定 Asia/Shanghai；单实例 noOverlap、按数据库schema区分的 advisory lock 防止重复扫描。关闭服务等待在途风险事务。

工作日与停更阈值从 `SystemSetting` 的 `risk-policy` JSON 读取，默认 `{ "staleWorkdays": 3, "weekdays": [1,2,3,4,5] }`。工作日采用周一至周五，暂未接公司节假日日历。工程师仅收到自己主责项目的临期、延期、停更、阻塞事件；管理人员接收风险集合变化事件，业务人员不接风险事件。空风险不写通知，风险解除仍保留快照历史，再次出现会分配新版本。Phase 9 前仅写 outbox，不实际投递消息。

Prisma模型按职责拆在 `prisma/schema.prisma` 与 `prisma/progress.prisma`，配置指定同一个prisma目录；迁移目录仍是 `prisma/migrations`，没有新建数据库或第二套客户端。[Prisma多文件配置](https://docs.prisma.io/docs/orm/reference/prisma-config-reference)、[node-cron调度文档](https://nodecron.com/scheduling-options)用于本期实现核对。

## Phase 8 管理查询与名单

`REQUESTS_PER_MINUTE` 默认 600，允许 1～10000 的整数，作用于每个来源 IP（不是每个用户）。为约 10 人同出口加载多个聚合区域预留容量；开发登录独立限制 10 次/分钟。超限返回 429 和 retry-after，请稍后重试。

全员登录后可读取 `/api/dashboard`、`/api/workload`、`/api/gantt`、`/api/demand-statistics`。查询使用同一 workspace 映射与 RepeatableRead 快照；风险读取已持久化版本。总览支持范围、状态、人员（主责或协作）、关键词、部门、阶段、风险、交付日期及归档筛选，`page` 从 1 开始，`pageSize` 默认 20、最大 100。返回全筛选图表明细和分页卡片，同一范围的统计不受当前页影响。

负载和甘特要求 `month=YYYY-MM`；负载区分主责与协作，逾期在途项目仍占用当月人力。甘特保留完整计划区间计算的进度比例，裁剪当前月显示。需求统计支持范围、关键词、状态、部门和提出人，草稿无提交日期不计入月趋势。

`GET /api/manager-grants` 全员只读，`GET /api/manager-grants/candidates` 及 `POST /api/manager-grants` 限有效管理员；写入 `{ userId, enabled, requestId: UUID }`。事务锁保证并发撤权后至少一名有效管理员，记录新旧角色与操作者；撤权后同一会话立即使用部门默认角色。候选来自已登记有效组织用户，真实钉钉组织同步仍由 Phase 9 完成。

前端原位复用 Art 图表、分页、名单弹窗与抽屉；筛选请求取消与乱序保护、失败重试沿现有 API Cookie 边界，不回退 mock。[Vue watch 清理](https://vuejs.org/guide/essentials/watchers.html)、[Element Plus 分页](https://element-plus.org/en-US/component/pagination.html)用于实现核对。

## 验证与隔离

```powershell
pnpm check
pnpm --filter @it-project-console/api test:integration
pnpm --filter @it-project-console/api test:browser
pnpm --filter @it-project-console/api exec prisma validate
pnpm audit:api
pnpm --filter @it-project-console/web test:e2e --workers=2
```

集成测试入口只允许本机 `it_project_console` 数据库/存储，创建随机 `itpc_test_*` schema 和 `itpc-test-*` Bucket。迁移运行两次，测试结束或失败均回收本次资源。不要直接绕过入口运行集成测试文件；文件也检查隔离标识。不会使用默认 schema 的业务记录或固定 Bucket 作测试。

`audit:api` 对 npm 审计返回的完整 workspace 报告按真实 `api>` 依赖路径检查，包含开发工具；不会把 `--filter` 当成隔离审计。现有前端 Vite/xlsx 告警仍须在 Phase 10 发布前整改，全仓审计目前不是零告警。

## 复用与边界

S3 适配从 `itpd-main/lib/s3.ts` 收窄移植，保留内部/签名双 endpoint、SDK Put/Get/Head/Delete，增加条件 Copy、强制下载和并发控制。旧项目代码、数据库、Bucket 和 Docker 卷均未修改或连接。

Compose 当前负责本地数据库和存储，API/Web 由 workspace 脚本启动；生产容器、HTTPS反向代理、备份恢复及部署按 Phase 10 实施。

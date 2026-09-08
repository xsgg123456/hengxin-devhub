# 后端本地开发

Phase 6 已接入真实需求、单级审批、立项和附件。前端继承 Art Design Pro 页面与交互，提供独立原型和真实联调模式；钉钉登录在 Phase 9 接入。

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

每个写命令携带 `requestId`，修改还携带 `version`。相同请求重试返回已提交结果；同请求号不同内容或过期版本返回409。通知只写入 outbox，Phase 9 前不会发送钉钉消息。真实模式暂不开放进度更新、项目生命周期操作和管理员授权；原型保留这些既有演示交互。

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

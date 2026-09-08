# Phase 6 需求与立项验收

日期：2026-09-08。范围为需求提交与单级立项真实闭环，延续 Art Design Pro 母版。Phase 7 进度/风险/生命周期、Phase 9 钉钉登录与消息投递尚未实现。

## 交付与复用

| 需求 | 原位实现 | 验证 |
|---|---|---|
| 本人需求草稿、提交、修改、撤回、删除 | 原 `demand-editor`、`demand-lifecycle-actions` 接入 `live-demand-service`；API `modules/demands` | 身份与状态限制、材料必填、重提、并发幂等 |
| 单级审批与直接立项 | 原 `demand-review`、`project-create-drawer`；API `approvals`、`projects` | 七阶段第3方案设计、唯一主责、协作、来源与空需求关系 |
| 材料 | 原 `material-field/summary` 接真实上传/下载；`AttachmentService` 扩展清理 | 真实PUT失败重试、未引用清理、被引用保护、撤回补传 |
| 通知 | `lifecycle-event-service` 与业务事务内outbox | 正确收件人、故障回滚、同请求不重复写 |
| 运行模式 | 原bootstrap/App/store/ArtUserMenu原位扩展，原型专属菜单抽出懒加载 | prototype保留；live数据库；production无演示种子和入口 |
| 真实页面投影 | `/api/workspace` 一致事务读取用户/需求/项目/阶段，适配既有页面DTO | 草稿无提交时间，重提排序，刷新持久化 |

母版布局文件 `views/index/index.vue`、侧栏与顶部导航未另造副本。需求/审批保留760px右侧抽屉、字段顺序、dirty确认、就地报错、原Element/Art组件。模式子组件仅承接开发专属控制，未新建平行应用壳。三张1440px真实截图位于 `output/phase6-live-submit.png`、`phase6-live-review.png`、`phase6-live-project.png`。

## 并发、失败与清理

- 参数化需求行锁、actor/requestId事务advisory锁、幂等回执与版本检查保证重复请求和并发审批；唯一demandId数据库约束兜底。
- 需求、项目、七阶段、成员与outbox一次提交。真实数据库故障注入验证业务和回执同时回滚，恢复后原请求可重试。
- 文件在真实ticket发出后的PUT故障可重试，失败票据先丢弃，最终只保留一个READY附件。
- 移除未保存材料调用鉴权DELETE；已引用材料由保存需求事务删除引用并入持久清理队列。关闭页面遗漏的未引用READY满24小时回收；临时签名到期额外一分钟后删除暂存对象，最终对象按分钟周期重试清理，外部存储失败不丢删除任务。
- 写命令成功但刷新失败明确提示刷新，不谎报写入失败；会话过期清空已加载数据。上传期间阻止导航与切换身份。

## 审查修复

独立审查定位并关闭：未引用READY永久占额、跨新建抽屉复用幂等键、WITHDRAWN附件可写状态遗漏、未提交草稿错误填入提交时间。另修复真实切身份双重导航，补PUT超时与票据失败清理。所有源码文件不超过300行，生成物不纳入统计。

## 验证证据

- `pnpm check`：Web 104单测、API 28单测；前后端typecheck与生产构建通过。日志 `output/phase6-check.log`。
- `pnpm --filter @it-project-console/api test:integration`：32测试通过；迁移重复部署，独立schema/Bucket回收。日志 `output/phase6-integration.log`。
- `pnpm --filter @it-project-console/api test:browser`：1测试通过；真实上传失败重试→提交→陈立峰立项→王浩然方案设计→刷新→工程师审批403。自有API/Vite与隔离资源已回收。日志 `output/phase6-live-e2e.log`。
- 原型与生产静态边界34条浏览器回归：34 passed（1.7m）。日志 `output/phase6-prototype-e2e.log`。
- 独立code-review：Stage 1 / Stage 2 无遗留 HIGH / MEDIUM，全部回归通过。
- Harness：19 tests，OK（18.095s），日志 `output/phase6-harness.log`。API完整依赖路径审计0条公告，日志 `output/phase6-api-audit.log`。

## 本地使用与阶段边界

真实前端 `http://127.0.0.1:4318/`，API `http://127.0.0.1:4322/`。点击本地联调账号登录后操作独立数据库；原型仍在4317。运行方法见 `BACKEND-DEVELOPMENT.md`。用户本地数据库已执行增量迁移；测试不写该数据库默认schema或固定Bucket。

本轮不推送、不发布。钉钉身份和消息投递仍待Phase 9；进度与生命周期真实写入待Phase 7。继承的前端Vite/xlsx审计告警仍按Phase 10整改，不宣称当前已可发布。

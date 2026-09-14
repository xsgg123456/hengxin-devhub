# 指定立项审批人 · 2026-09-14

## 已确认范围

姚泽攀独占同意立项、退回业务补充、不予立项、直接创建及接单前重新指派/退回重提。其他管理员保留现有其他权限。前端沿用原需求列表、项目总览、评估和接单抽屉，仅修改能力条件，原布局、取消、删除与工程师接单不变。

## 配置与上线要求

- 服务端 `PROJECT_APPROVER_DING_USER_ID` 指定唯一员工 ID；结合数据库账号 active 与 MANAGER 检查。配置为空、身份解绑、停用或降级即无权，不按姓名或管理员名单回退。
- 发布前用通讯录核实姚泽攀的唯一有效账号及钉钉员工 ID，将该值写入私有 server.env。真实员工标识不写入仓库；不能填写应用 Client ID 或内部用户主键。
- 审批、直接创建、重提在幂等读取前及实际写事务内均校验。登录与工作台返回 canApproveProjects；已有登录下次请求读取新能力，无需迁移会话。
- 工程师退回仅为指定审批人入队；发送前再次核对，旧队列中其他管理员的未发送/待重试退回消息跳过。已经外发的消息继续查原回执，不撤回、不重复外发。
- 无新增数据表或业务数据迁移；旧提案按原版本继续接单。通知开关保持原配置，本次不新增需求提交/拒绝消息类型。
- 本地独立测试账号与员工 ID 为测试夹具，真实环境不使用演示账号。演示快照只迁移明确演示审批人，不按管理角色批量授权。

## 验证结果

- `pnpm typecheck` 与 `pnpm build`：前后端通过。
- `pnpm test`：API 80 项、Web 187 项通过。
- `pnpm --filter @it-project-console/api test:integration`：119 项基础集成与 6 项专项权限集成通过；实际 HTTP 覆盖同名管理员、非管理角色、三种审批决定、直接创建、pending/returned 重提、停用/降级/解绑、空配置及旧通知过滤；独立 schema 与 Bucket 已回收。
- `pnpm --filter @it-project-console/web test:e2e --workers=2`：48/49 首轮通过；日期用例在页面首次编译时超过 5 秒，截图为内容尚未渲染。独立预热服务后原用例复测 1/1 通过，未修改断言。
- `pnpm --filter @it-project-console/api test:browser`：7/8 首轮通过；接单用例切换账号触发真实 dev-login 429。单独隔离运行 `e2e-live/proposal-acceptance.spec.ts` 1/1 通过，保留原登录限流与业务断言。
- `pnpm test:release` 9 项、Harness `unittest discover -s tests -v` 20 项通过。
- 主代理目视普通管理员页面：风险待办和查看协调操作保持，未出现立项待办；原布局及交互复用。证据为忽略目录 `output/approval-*.log`、`output/approval-manager.png`。
- 既有边界：pending 重派通过原 API，本次收紧其授权；现有抽屉的改派/重提仍在 returned 状态提供。本次不新增 pending 编辑界面。

独立两阶段审查通过，未发现阻断问题。尚未生产部署，本地实现不代表生产权限已生效。

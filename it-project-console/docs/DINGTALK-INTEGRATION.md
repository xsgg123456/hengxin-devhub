# 钉钉接入与复用说明

本期移植本地旧项目 `itpd-main` 的已有逻辑，旧项目及生产环境未修改。

## 复用对应

| 旧实现 | 当前实现与适配 |
|---|---|
| services/dingtalk.ts | modules/dingtalk/dingtalk-client.ts：请求超时、脱敏错误、Token缓存、授权交换；OAuth unionId 经本企业接口映射 userid，不能把 openId 当员工ID |
| lib/auth.ts | modules/dingtalk/dingtalk-auth.ts：保留 state 校验语义，改为一次性数据库挑战和当前 HttpOnly Cookie 会话 |
| services/dingtalk-organization.ts | dingtalk-directory.ts：分页、部门遍历、详情并发5、完整快照事务同步、身份冲突拒绝 |
| components/dingtalk/DingTalkH5Bridge.tsx | 原位 Art 登录视图及 utils/dingtalk/runtime.ts：按当前官方 dd.requestAuthCode 回调接口适配 |
| services/dingtalk-notification.ts | dingtalk-message.ts 与 notifications 模块：工作通知、持久认领、退避与结果查询 |

## 配置与运行

在 API 的本地 `.env` 或部署环境注入 `DINGTALK_CLIENT_ID`、`DINGTALK_CLIENT_SECRET`、`DINGTALK_CORP_ID`、`DINGTALK_AGENT_ID`。密钥仅在后端使用，不进入前端构建变量。

`DINGTALK_REDIRECT_URI` 指向对外可访问的 `/api/auth/dingtalk/callback`，必须与开放平台登录配置一致。生产使用 HTTPS；`WEB_ORIGIN` 为业务前端 origin。公开 `/api/auth/dingtalk/config` 只返回 Client ID、Corp ID 和是否已配置。

`BOOTSTRAP_ADMIN_DING_USER_ID` 指定已验证企业员工。完整同步后首次初始化；本地样例管理授权不阻止企业初始化，已有企业管理名单（含撤销记录）不得被环境变量重新授予。首位企业管理员缺失会输出脱敏告警。

企业同步后，管理名单只展示有效且已绑定企业身份的管理员，候选和授予使用同一口径。最后一名真实企业管理员不能撤销；遗留样例授权不计入保护数量，可由企业管理员清理。

启动时及每15分钟同步组织；管理人员可调用 `POST /api/admin/dingtalk/sync`，使用正常登录与 Origin 校验。同步失败保留上次完整快照；完整同步确认离职/失去可见范围则停用账号、撤管理员授权和已有会话。新登录再次向企业通讯录校验身份与部门。

## 消息行为

`DINGTALK_NOTIFICATIONS_ENABLED=false` 为默认值。未开启时不消费队列、不发送消息；真实联调必须先确定应用可见范围及收件人。自动测试清空真实钉钉凭据并模拟远端响应。样例ID和固定开发账号不外发。

工程师只接收本人主责的临期、延期、停更和阻塞事件；业务人员接收退回、立项、完成；管理人员风险变化按上海工作日汇总，默认09:00，可用 `DINGTALK_MANAGER_DIGEST_TIME=HH:mm` 调整。当日检查后产生的变化留至下一工作日；错过计划时间后启动会补当日检查。当前工作日仍为周一至周五。

风险快照每日保留新的天数，但相同延期/停更状态不再次入队；新风险、解除后再次出现仍产生提醒。管理汇总只合并待处理的变化项目，已无风险不发空汇总。

通知 `task_id` 只表示受理，记录 ACCEPTED；查询到收件人正向回执才记 SENT。明确失败最多5次指数退避；发送过程中断、回执无法确认等 UNKNOWN 状态不自动重发，以防重复通知。超过24小时未确认转 UNKNOWN，需人工核查。所有结果保存在 NotificationLog，关联原 outbox，可追溯汇总来源。

## 上线前尚需真实验收

电脑钉钉免登、外部扫码、非本企业拒绝、组织权限/应用可见范围、指定测试收件人送达、深链返回新系统均需企业应用环境实测。本地模拟测试不能代替这些验收。

官方依据：[微应用授权码](https://open.dingtalk.com/tools/explorer/jsapi?id=11723)、[网页登录](https://dingtalk.apifox.cn/doc-3538471)、[异步工作通知](https://developer.alibaba.com/docs/api.htm?apiId=37692)、[发送结果](https://developer.alibaba.com/docs/api.htm?apiId=37024)。

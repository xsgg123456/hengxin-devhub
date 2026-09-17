# 钉钉接入与复用说明

## 当前展示配置（2026-09-14 后台核实）

- 应用名称、描述：IT项目管理台（旧称“it项目”）。
- 机器人名称、简介、描述：IT项目管理台机器人。英文配置对应三项也填写该中文文本。
- 应用与机器人头像：后台当前红色几何 H 形主体、顶部黄色菱形的公司标识；已目视核实，不复制密钥或重新绘制头像。
- 机器人配置开启，接收模式为 Stream；本次仅同步用户已修改的信息，没有再次发布或发送消息。员工端实际显示仍待验证。
- 后端已接入机器人单向单聊通道，生产尚未部署或启用；历史工作通知接口仅用于兼容旧回执。

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

`DINGTALK_REDIRECT_URI` 沿用旧应用对外可访问的 `/api/auth/callback/dingtalk`，与开放平台现有登录配置一致。生产使用 HTTPS；`WEB_ORIGIN` 为业务前端 origin。公开 `/api/auth/dingtalk/config` 只返回 Client ID、Corp ID 和是否已配置。

2026-09-09 用户确认沿用旧入口并在正式切换后替代旧系统：

```env
WEB_ORIGIN=https://pmg.qhhengxin.top:8443
DINGTALK_REDIRECT_URI=https://pmg.qhhengxin.top:8443/api/auth/callback/dingtalk
```

按用户最终确认，正式回调直接沿用旧系统 `/api/auth/callback/dingtalk`，无需为路径变化修改钉钉后台；同时兼容此前新路径 `/api/auth/dingtalk/callback`。现有应用凭据已在服务器运行环境中确认存在，密钥不写入文档。当前尚未切换代理或停用旧应用；正式入口切换安排见根目录 `DEV-PLAN.md` Phase 10。

旧配置 `DINGTALK_APP_KEY/SECRET` 自动映射到 `DINGTALK_CLIENT_ID/SECRET`，`NEXTAUTH_URL` 自动映射到 `WEB_ORIGIN`，未指定回调时从该访问地址生成旧回调。非空的新配置优先；`DINGTALK_CORP_ID/AGENT_ID`、S3 同名配置保留。仅复用所需配置，不启用旧 AI/机器人等无关功能；数据库结构和 NextAuth 会话不同，不能将旧库及会话密钥直接当成新系统的数据和登录状态。切换后首次访问需重新进行钉钉认证。

`BOOTSTRAP_ADMIN_DING_USER_ID` 指定已验证企业员工。完整同步后首次初始化；本地样例管理授权不阻止企业初始化，已有企业管理名单（含撤销记录）不得被环境变量重新授予。首位企业管理员缺失会输出脱敏告警。

企业同步后，管理名单只展示有效且已绑定企业身份的管理员，候选和授予使用同一口径。最后一名真实企业管理员不能撤销；遗留样例授权不计入保护数量，可由企业管理员清理。

启动时同步一次组织，之后每24小时自动执行一次全量同步；管理人员可调用 `POST /api/admin/dingtalk/sync`，使用正常登录与 Origin 校验。同步失败保留上次完整快照；完整同步确认离职/失去可见范围则停用账号、撤管理员授权和已有会话。新登录再次向企业通讯录校验身份与部门。

## 消息行为

`DINGTALK_NOTIFICATIONS_ENABLED=false` 为默认值。未开启时不消费队列、不发送消息；真实联调必须先确定应用可见范围及收件人。自动测试清空真实钉钉凭据并模拟远端响应。样例ID和固定开发账号不外发。

工程师只接收本人主责的临期、延期、停更和阻塞事件；业务人员接收退回、立项、完成；管理人员风险变化按上海工作日汇总，默认09:00，可用 `DINGTALK_MANAGER_DIGEST_TIME=HH:mm` 调整。当日检查后产生的变化留至下一工作日；错过计划时间后启动会补当日检查。当前工作日仍为周一至周五。

风险快照每日保留新的天数，但相同延期/停更状态不再次入队；新风险、解除后再次出现仍产生提醒。管理汇总只合并待处理的变化项目，已无风险不发空汇总。

机器人每条 outbox 只向一位员工发送，使用 `sampleText`，消息正文及深链复用原有业务模板。返回的 `processQueryKey` 记录为 ACCEPTED，不能据此宣称员工已经收到。已读查询仅在目标员工返回 `read` 时记 SENT；未读、空响应、未识别值和查询失败均不触发重发。首次约1分钟查询，其后按日志创建后15分钟、1小时、6小时、24小时的时间点退避，避免逐分钟消耗接口额度。超过24小时仍无法确认则转 UNKNOWN；这不代表发送失败，也不自动补发。真实企业返回字段及员工显示须单人联调核实。

明确限流最多5次指数退避；无效员工永久失败，网络超时、服务端错误、受理后落库异常均保守记录 UNKNOWN 或持久 SENDING 后恢复核查，禁止盲目重发。旧日志迁移默认为 work，原 `task_id` 仍查工作通知接口；旧通道已尝试通知不改走机器人重发。每次外发保存通道、机器人标识及员工ID，后续查询使用保存的身份。所有结果保存在 NotificationLog，关联原 outbox，可追溯汇总来源。

### 机器人启用配置

服务端增加以下配置，凭据与ID通过私有环境文件填写，不进入前端：

| 配置 | 行为 |
|---|---|
| DINGTALK_ROBOT_CODE | 现有企业应用机器人 robotCode，以后台实际值为准 |
| DINGTALK_NOTIFICATION_MODE | 默认 test；all 才按全体业务收件人规则处理 |
| DINGTALK_NOTIFICATION_USER_IDS | test 必填，逗号分隔的企业员工 userid |
| DINGTALK_NOTIFICATION_START_AT | 启用必填，带时区的 ISO 时间；例如格式 2026-09-14T12:00:00+08:00，实际时间由上线时确定 |
| DINGTALK_NOTIFICATIONS_ENABLED | 默认 false，配置校验通过并完成指定员工验收后才启用 |

名单也约束管理汇总来源。名单外通知保持待处理；从 test 切至 all 时应将起始时间更新为正式切换时间，防止向其他员工追发测试期间积压。起始时间之前的未尝试历史通知分批标记 SKIPPED 并保留日志；已受理记录继续查原回执。管理汇总的当日标记带配置范围，切换不会因测试时的空汇总吞掉其他员工通知。登录、通讯录、原业务定时任务和前端不变。

### 单向接收核查（2026-09-14）

新 API 没有 Stream 客户端、机器人入站路由或 AI 回复逻辑。生产只读检查：没有名称包含 bot 的容器（含停止容器）；旧 app 容器仅显示 next-server 进程；公开 GET `/api/dingtalk/bot-events` 返回404。旧本地项目保留 Stream 脚本及入站路由源码，不能将其重新启用。上线时需再次核对实际接收进程，并用指定员工发送一条消息确认无自动回复；当前只读快照不能替代真实验收。

## 上线前尚需真实验收

电脑钉钉免登、外部扫码、非本企业拒绝、组织权限/应用可见范围、指定测试收件人送达、深链返回新系统均需企业应用环境实测。本地模拟测试不能代替这些验收。

官方依据：[微应用授权码](https://open.dingtalk.com/tools/explorer/jsapi?id=11723)、[网页登录](https://dingtalk.apifox.cn/doc-3538471)、[异步工作通知](https://developer.alibaba.com/docs/api.htm?apiId=37692)、[发送结果](https://developer.alibaba.com/docs/api.htm?apiId=37024)。
机器人参考：[批量单聊发送](https://s.apifox.cn/apidoc/docs-site/467052/api-140273128)、[已读状态查询](https://s.apifox.cn/apidoc/docs-site/467052/api-140601737)。查询示例仅标明字符串类型，未将未核实的 sendStatus 枚举用于自动重发。

# 机器人单向单聊通知：本地实施与验收

日期：2026-09-14。范围：Product-Spec REQ-006、AC-ROBOT-001/002；本轮没有部署生产、改生产配置或向员工发送真实消息。

## 实现

- 复用现有企业应用 Token、员工 userid 和业务 outbox，一条通知一次只发一个员工的机器人单聊；发送模板为 sampleText，正文和深链沿用原规则。
- 服务启动固定使用 robot 通道。旧工作通知接口只用于旧记录回执；登录、通讯录、业务事件、前端不变。
- 默认关闭；test 模式必须填收件员工名单，all 才处理全部业务收件人。必须配置带时区的起始时间；历史未尝试记录跳过留痕，名单外记录保留。全员切换时设置新的起始时间避免积压补发。
- NotificationLog 增加 channel / senderCode / recipientDingId；兼容迁移默认旧日志为 work。查询冻结发送时身份，重试前发现身份变化则停止自动重发。
- 受理保存 processQueryKey；未读和不明确结果不重发，仅明确目标 read 后记 SENT。1分钟后首次查询，随后按15分钟、1小时、6小时、24小时退避；超过24小时仍无确认转 UNKNOWN，不等同失败。
- HTTP429、官方4种HTTP400发送限流以及目标员工限流可退避，最多5次；无效员工和权限拒绝停止重试。超时/服务端异常/受理后数据库失败保留不确定状态，不盲目重发。
- advisory lock、独立提交 SENDING 保护多实例投递及删除并发；原业务删除后保留已受理回执，禁止重新发送已删业务。
- 管理汇总也按名单与起始时间筛来源，按范围记录当日标记，测试转全员不会因测试时空汇总吞掉其他员工通知。

## 本地验证

所有集成和真实 API 浏览器测试创建独立 schema / Bucket，清空真实钉钉凭据；结束时回收，外部钉钉调用均模拟。

| 命令 | 结果 |
|---|---|
| `pnpm typecheck` | 前后端通过 |
| `pnpm test`，修复后 `pnpm --filter @it-project-console/api test` | Web 185 项、API 80 项通过 |
| `pnpm build`，修复后 `pnpm --filter @it-project-console/api build` | 前后端构建通过 |
| `pnpm --filter @it-project-console/api test:integration` | 17个文件119项通过 |
| `pnpm test:release` | 9项通过 |
| `pnpm --filter @it-project-console/api test:browser` | 8 项通过；最大创建反馈30ms、甘特查询25ms |
| `pnpm --filter @it-project-console/web test:e2e --workers=2` | 48项通过 |
| `python -X utf8 -m unittest discover -s tests -v` | 20 项通过 |
| 独立 code-reviewer | 修复后Stage 1、Stage 2均通过，无HIGH/MEDIUM遗留 |

测试覆盖：关闭/未来启用时间、名单与时间边界、并发只发送一次、未读不重发、发送身份变更、限流5次、HTTP400限流恢复、超时、旧通道回执和禁止跨通道重发、受理后落库失败、删除业务后保留回执、汇总范围切换、新API旧入站路径返回404。迁移入口执行两次，原始SQL未带channel写入仍得到work默认值。

初次浏览器并行运行：真实API测试1项耗时1776ms超过1000ms阈值；原型8worker有11项页面尚未加载即超时。真实API独立重跑8项通过，原型改2worker后48项通过，均未放宽验收断言。开发过程中另修正1处旧接口ID的测试断言（实际为字符串），不是接口行为变更。

第一次独立审查发现HTTP400明确限流未重试；已按官方4种错误码限定修复，增加4项传输测试及队列恢复用例，不能把所有400泛化重试。

原始测试日志保存在本地忽略目录 `output/robot-notification-20260914/`，不随发布包分发。集成日志含既有 pg 并发查询弃用提示；本轮全部用例通过，未将该提示当作送达失败。

## 生产只读核查与后续真实验收

- `docker ps -a --filter name=bot` 没有匹配容器；旧 app 容器 `docker top ... -eo pid,comm` 仅有 next-server。
- 宿主进程中匹配 `node ... dingtalk-bot-stream` 的计数为0；公开 GET `/api/dingtalk/bot-events` 为404。
- 以上只是当时快照；旧本地项目仍含 Stream/AI 入站源码，不重新启动其 bot 服务。新服务无 Stream 依赖和入站处理，真实启用前复查其他主机上的接收连接。
- 后台名称头像沿用已核实配置：应用“IT项目管理台”，机器人“IT项目管理台机器人”，公司H形标识；本轮没有再次修改或发布钉钉后台。

后续按明确授权：部署时保持通知关闭，配置现有 robotCode、指定测试员工与新的起始时间；先开启 test 模式发送一条约定内容，核实独立会话、名称头像、深链免登权限及无AI回复。核实实际已读返回后，再决定 all 模式正式起始时间。关闭开关可立即停止后续消费，已外发消息不会自动撤回；回滚应用仍保持关闭，避免旧版本误消费机器人日志。

官方参考：[单聊发送](https://s.apifox.cn/apidoc/docs-site/467052/api-140273128)、[已读查询](https://s.apifox.cn/apidoc/docs-site/467052/api-140601737)。公开示例未给出 sendStatus 枚举，因此代码未凭猜测将该字段解释为成功或可重发。员工端真实展示、无回复、实际已读字段尚待企业环境单人验收，本地通过不能替代。

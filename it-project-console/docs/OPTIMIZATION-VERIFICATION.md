# 单节点优化与工作日默认排期：本地验收记录

日期：2026-09-15。范围依据 [OPTIMIZATION-ITERATION.md](OPTIMIZATION-ITERATION.md)。本轮未部署生产、未推送远程。

## 已实现

- 已完成普通项目支持提交关联优化需求，附件选填，问题、验收标准和期望日期必填；指定审批人批准后由工程师接单立项。复用既有审批、待办、通知、验收及删除保护。
- 优化子项目仅一个“优化交付”执行节点，独立起止日期，指定人员验收通过才完成。父项目状态、历史及交付日期保持不变；列表筛选、负载、甘特与关联跳转贯通。
- 两张管理图表仅管理角色显示，业务和工程师保留筛选、五指标与项目明细。
- 初次计划按上海评审完成日的下一工作日起，每阶段预填3个周一至周五工作日；无可靠历史明确提示今日兜底。普通项目5阶段，优化1阶段。取消不保存，已有日期不覆盖，修改不级联。

## 验证证据

| 检查 | 结果 |
| --- | --- |
| Web 单测 | 47 文件、283 项通过，含工作日6项、优化材料和闭环、日期编辑保护 |
| API 单测 | 21 文件、106 项通过 |
| API 隔离集成 | 158 项通过，新增优化权限、并发删除、验收退回、只允许单节点及父历史保护 |
| 数据迁移 | 16个迁移在独立schema部署通过，重复部署无待执行项 |
| 真实浏览器 | 8个文件、14项全部通过，各自独立API/schema/Bucket并回收 |
| 优化真实浏览器 | 提交无附件、审批不直接生成项目、接单、单节点排期、完整编辑结束日期返回200且里程碑同步、指定业务验收、刷新关联通过 |
| 原型浏览器 | 最终全套57项中55项通过；两条既有all-staff-acceptance启动期间超时，单worker独立复跑2项全部通过（38.4秒），57项均有最终通过记录。优化UI清空标准错误路径及全闭环通过（22.0秒） |
| 发布审计 | 9项通过，仅运行本地隔离测试，未执行发布 |
| Harness | 20项通过 |
| 独立审查 | 两阶段通过，10条验收规则全覆盖，无剩余HIGH/MEDIUM |
| 类型与正式构建 | `pnpm typecheck` 退出0；末次 `pnpm build` 前后端退出0（Web built in 1m 28s），含最终材料校验补丁 |

真实浏览器覆盖：business-acceptance 1、optimization 1、phase7-workflow 1、phase8-dashboard 2、phase9-login 3、project-edit 3、proposal-acceptance 1、workflow 2。

命令：产品根执行 `pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm test:release`；API目录执行 `node node_modules/tsx/dist/cli.mjs --env-file-if-exists=.env scripts/integration.ts` 与 `scripts/browser-integration.ts`；Web目录执行 Playwright 全套与指定回归；Harness根执行 Python unittest discover。

日志保存在本地忽略目录 `output/optimization-*.log`。截图在 `output/playwright/optimization-implemented/`：`business-projects.png`、`default-plan.png`、`submit.png`、`plan.png`、`accepted.png`、`live-parent.png`。

## 审查修复与限制

- 完整编辑优化计划结束日期时同步隐藏的上线/交付里程碑，已用真实API浏览器复验。
- 原型优化保留受理/评审完成历史供默认日期取证，UI只展示交付执行历史；类型筛选同时作用待立项统计并持久化。
- 禁止待验收期间改计划、清空已有优化计划及原始里程碑分叉。
- 已提交优化修改仍须验收标准，审批再次复核持久化标准。单测与UI均验证清空保存失败、原值保留、补齐后正常流转。
- 沙箱导致Docker管道、Git子进程Python执行失败；使用已配置本地Docker/Python执行权限重跑通过，没有调整测试断言或绕过门禁。
- 原型首轮4项生产边界检查读取上轮演示dist失败，重新正式构建后8项边界复测及末次全套中的边界项均通过。最终全套首两项因30秒测试预算耗尽失败，当时同时运行构建和真实回归；其余55项通过后单独原命令复跑两项通过，无代码/断言/超时阈值调整。
- 最后fresh审查实例受线程上限限制，现有独立code-reviewer重新从Stage 1审查最终修复，关键4文件31项测试通过。仅有LOW命名残留：正式关联组件仍叫optimization-preview，prototype专属样例入口保留；正式构建隔离已验证。
- 工作日只跳过周末，不处理法定节假日及调休。真实生产钉钉消息和生产迁移须在明确授权上线时验证，本轮不外发。

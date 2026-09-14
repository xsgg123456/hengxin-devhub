# 业务确认验收：本地实现与验证

日期：2026-09-14。需求依据：[业务确认验收迭代](BUSINESS-ACCEPTANCE-ITERATION.md)。

## 交付行为

| 角色 | 可执行操作 | 通知与待办 |
| --- | --- | --- |
| 主负责工程师 | 填交付说明及可选网页链接（支持内网HTTP/HTTPS和无协议地址），提交验收；填写原因并确认后撤回；退回后整改重提 | 收到退回通知，出现整改待办；待业务验收期间停止工程师风险催办 |
| 指定业务验收人 | 查看交付材料，确认通过或填写原因退回 | 提交/重提后收到待验收消息及待办；改派后旧人立即失权 |
| 管理人员 | 指定或带原因改派有效业务验收人 | 等待满3个工作日纳入管理风险变化汇总；不能代业务确认通过 |

业务通过时完成末阶段和项目，记录真实完成时间，不自动归档。每轮提交、撤回、改派、退回和通过保留独立历史。旧已完成项目显示历史完成，不伪造业务验收记录。

## 本轮实际验证

命令在 `it-project-console` 目录执行，Harness 测试除外。原始日志在仓库根 `output/`，该目录不纳入版本管理。

| 验证 | 结果 | 原始证据 |
| --- | --- | --- |
| `pnpm check` | API/Web 类型检查及构建通过；API 19文件82测试、Web 37文件199测试通过 | `output/business-acceptance-check-final.log` |
| `pnpm --filter @it-project-console/api test:integration` | 19文件128测试，加审批6测试，共134通过；14项迁移及重复部署验证，临时 schema/Bucket 回收 | `output/business-acceptance-integration.log` |
| `pnpm --filter @it-project-console/web test:e2e --workers=2` | 49项通过 | `output/business-acceptance-prototype-complete.log` |
| `pnpm --filter @it-project-console/api test:browser` | 6个文件全部通过，共10次测试执行（9个独立用例，文件名筛选使 phase7-workflow 在 workflow 批次额外执行一次）；每批环境回收 | `output/business-acceptance-live-complete.log` |
| `pnpm test:release` | 9项通过，未执行发布 | `output/business-acceptance-release-check.log` |
| `python -X utf8 -m unittest discover -s tests -v` | 20项通过 | `output/business-acceptance-harness-check.log` |

真实浏览器新增场景覆盖指定验收人、工程师不能越过最后环节、空说明拒绝、保存计划后草稿保留、服务端保存成功但响应丢失后幂等重试、撤回确认取消不写入、撤回重提、业务待办进入、退回必填、整改重提通过、刷新持久化及三轮历史。

界面截图：`output/playwright/business-acceptance/business-pending.png`、`business-completed.png`。复用既有760px详情抽屉与20px内边距，实际查看通过/退回按钮可达，未发现遮挡或溢出。

## 审查与回归修复

- 独立审查发现并修复草稿随 workspace 对象刷新被重置、失败重试请求编号不稳定、撤回缺少二次确认、原型工程师资格检查不完整。草稿测试实际替换整个 project/user 对象，验证旧输入及编辑版本保留；前后端均拒绝资格失效工程师提交/撤回。
- 新业务闭环增加了开发账号切换次数，原共享 API 的全量浏览器运行触发真实10次/分钟登录限流。默认测试入口改为每个文件独立创建并回收环境；不修改正式登录限流。冷启动 Vite 编译曾超过5秒，真实浏览器断言等待上限改为15秒，保留失败即报错、不开自动重试。
- 原型旧测试曾将协作更新前后全对象直接比较。现严格验证版本加1且其余整体业务字段一致；日期测试通过菜单导航并确认目标标题后再读取需求表格。

## 发布边界

本轮仅本地实现与隔离验证，未 push、未部署、未触发真实钉钉消息。生产升级需执行新增迁移 `20260914050000_business_acceptance` 并同步发布前后端；通知仍受现有开关、名单、起始时间和通道配置约束。

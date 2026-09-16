# 2026-09-16 本轮开发验证

## 已实施

- 现有需求池增加优化提交按钮，复用需求编辑器及审批链路；搜索已完成主项目，未选原项目阻止草稿/提交/附件建单。
- ZIP显示和下载名称为 business-prd-prototype.zip；视频、ZIP真实文件仍待业务提供，不伪造文件或播放成功。ZIP获取检查HTTP状态、HTML回退及空文件，失败可重试。
- 项目编辑按demandId同步当前名称和需求版本、审计；重新评估、最终接单及迁移核实去前缀保持一致，不修改下属优化需求或历史快照。
- 电脑窗口缩放继续展示业务，菜单折叠、资源区换行、抽屉限制视口；表单和路由保持。手机/iPad不因宽屏误放行，触屏Windows仍可用。
- 草稿创建明确400等失败可改选项目、换请求键；网络/超时/5xx未知结果锁定关联、原请求幂等恢复，等待期间不能切换原项目。

## 验证证据

- `pnpm --dir it-project-console/web test`：54文件、323测试通过。
- `pnpm --dir it-project-console/api test`：23文件、112测试通过。
- `pnpm --dir it-project-console/api test:integration`：147 + 22 = 169测试通过，独立schema和Bucket回收。
- 前端 `build`（含vue-tsc）及后端 `typecheck`、`build` 通过。
- 全量原型浏览器61项：60项首次通过，1项跨角色长流程在30秒预算内超时；以60秒预算定向复跑该文件和新增功能，共7项通过，其中原超时项实际23.4秒通过。未修改该旧用例的业务断言。
- `test:browser demand-experience.spec.ts`：真实隔离API 1项通过，涵盖延迟失败、改选、实际创建后丢响应、同键重试以及仅一个草稿。隔离schema和Bucket已回收。
- Harness 20测试、发布审计9测试通过；新增前端组件和helper/service ESLint通过。
- 独立审查：Stage 1、Stage 2均通过；草稿失败恢复及下载错误反馈问题已关闭，无新增阻塞项。最后新增页面交互复跑3项全部通过。
- 浏览器截图在 `output/playwright/demand-experience-desktop.png`、`demand-experience-narrow.png`、`demand-experience-optimization.png`。

## 交付边界

- 未部署生产，未修改生产数据，未删除待审批项目。
- XQ-2026-0009 / XM-2026-0030 存量名称校正尚未执行；发布时应核对ID关联及仍为旧名称，使用项目最终名称、版本递增与生命周期审计在单事务内校正，不能批量覆盖其他名称。
- 视频和ZIP文件缺失；提供素材后通过SubmissionGuide的videoUrl/posterUrl/packageUrl接入。外域ZIP须允许跨域读取，建议同源静态资源。

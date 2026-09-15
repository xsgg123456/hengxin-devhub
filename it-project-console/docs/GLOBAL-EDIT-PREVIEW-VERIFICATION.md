# 全局编辑本地预览验证 · 2026-09-15

入口：http://127.0.0.1:4325/?editPreview=1#/project-overview
启动：在 Harness 根运行 pnpm --dir it-project-console/web dev --port 4325。

## 范围
原位复用项目卡片/详情，新增960px编辑抽屉；本地演示管理员模拟目标账号，不连接生产写入。业务待办/通知、实际日期纠正与完整附件编辑尚非本预览交付，界面说明保留。正式上线需另行实施与授权。

## 已验证
- pnpm --dir it-project-console/web typecheck：退出0。
- pnpm --dir it-project-console/web test：39文件，229用例通过，含5个全局编辑专项用例。
- pnpm --dir it-project-console/web build:prototype：3404 modules，built in 21.49s，退出0。
- pnpm --dir it-project-console/web build：3386 modules，built in 22.25s，退出0。
- Chrome真实界面：编辑入口、人员页签与互斥提示；原因缺失报错且保留输入；填原因保存成功；刷新后描述仍保留；完成核实后Amazon项目去前缀；取消未保存编辑显示放弃确认。新机项目仍为待核实，供用户体验。
- 独立代码审查：最终Stage1通过，Stage2静态质量通过，无阻断；主Agent已实际查看1920px Chrome渲染，独立审查员未完成视觉复核。
- 定向浏览器复核：phase-three-charts.spec.ts和prototype-boundary.spec.ts，单worker共12项均输出ok，包括生产构建隔离。

## 未完成的全量验收
首次49项浏览器套件8worker执行发生多项失败；其中生产边界失败因先前dist为prototype构建，改为production后定向4项通过，图表相关定向4项也通过。该次全量执行在49项输出后收尾未结束，已中断；尚未完成49项全绿验证，不能声明发布就绪或整个开发Phase完成。未提交Git，未部署。

定向12项均输出ok后，同样在Windows服务收尾等待未退出，已中断收尾；不将其记录为进程正常退出。4325用户预览服务继续运行。

## 2026-09-15 首次提出日期增量验证
- 单测：pnpm --dir it-project-console/web test，39文件231用例通过；独立审查专项7/7通过。
- 构建：pnpm --dir it-project-console/web build（含vue-tsc），3386 modules，built in 22.61s，退出0。
- Chrome用localhost:4325独立origin验证，不修改用户127.0.0.1预览数据：卡片未知显示待核实；全局编辑填写2026-06-10，摘要显示待核实→该日期；填写原因保存，刷新卡片及项目详情保留；关联需求清单同样显示2026-06-10，同时原提交时间2026-08-12 10:10不变。
- 独立审查：本次增量Stage1静态合规通过，Stage2静态质量通过，无阻断；实际浏览器由主Agent完成。
- 本轮未重新运行全量49浏览器套件；上轮全量未全绿的限制仍在，不声明生产发布就绪。未部署、未提交。

## 2026-09-15 主负责工程师迁移核实权限
- 用户确认仅当前项目主负责工程师可完整编辑待核实迁移项目，核实完成收回，转交主责随之转移；指定管理员长期全项目编辑保留。前端按钮及保存服务共用规则，保存检查已存储项目，不信任提交的主责/迁移状态。
- pnpm --dir it-project-console/web test：39文件235用例全部通过（最终复跑10:48:06）；新增主责/协作/无关/业务/非指定管理员、正常及已核实、核实后回收、转交后回收与管理员保留验证，包含工程师审计操作者断言。
- pnpm --dir it-project-console/web build：vue-tsc通过，3387模块，21.13s构建成功，退出0。独立审查专项11/11及prototype构建也通过；后者覆盖dist，当前dist是prototype产物，不可用于正式发布。
- Chrome localhost:4325隔离origin真实操作：王浩然可编辑主责待核实Amazon，协作新机及正常库存无完整编辑按钮；核实确认提示权限回收，填写原因保存成功，名称迁移标记解除，编辑按钮消失，原制定计划保留。刷新仍无完整编辑按钮。用户127.0.0.1预览保持独立。
- 本轮仅本地预览；正式后端与生产未修改。未复跑全量49浏览器套件，既有发布验收限制保留，未提交。
- 独立code-reviewer：本轮Stage 1与Stage 2代码审查通过，无新增阻断项；浏览器证据由主Agent完成。

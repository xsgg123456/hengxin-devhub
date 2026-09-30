# 张帅独立维护权限

## 需求与实施边界

用户明确要求同步姚泽攀全部系统操作权限，但张帅必须保持 IT工程师角色。先前拟采用管理名单提权的方案已取消，生产从未执行该方案。

采用独立 `users.maintenance_admin` 标记；默认 false，只对核实后的目标账号启用。姚泽攀的指定审批配置、现有管理名单、张帅部门与工程师资格、主责/协作关系不变。

## 执行规划与完成标准

1. 后端：增加独立持久授权，管理操作守卫与指定审批守卫兼容该能力；真实鉴权、登录、工作区下发字段。完成标准：ENGINEER+授权可审批及维护，ENGINEER不授权或撤销后拒绝额外操作，角色与名单不变，停用拒绝。
2. 前端：原位修改操作门禁与管理入口，工程师标签、默认范围、原工程师待办保持。完成标准：工程师能打开完整编辑、日期修订和管理功能，同时能接单、更新本人项目；普通工程师边界不变。
3. 验证：类型/单测/隔离数据库集成/真实浏览器/构建/产物审计，加独立两阶段审查。测试使用本机独立 schema 与存储桶。
4. 生产：统一发布脚本备份并应用加列迁移；运行下述授权脚本先预检再 apply，最后只读核对身份、能力、审计和健康。不得用真实业务项目试写权限。

## 可审计授权与撤销

`scripts/server/maintenance-access.mjs` 从运行中的 API 容器执行（工作目录 `/app`），读取既有容器配置，不输出密钥。参数为 `--user-id`、`--ding-user-id`、`--source-id`、`--source-ding-id`、`--reason`、`--action grant|revoke`，缺省只预检，加 `--apply` 才写入。

授权核对有效工程师和双重唯一身份；事务只更新维护标记，断言角色与管理名单未变化，同时记录审计。审计 actorId 留空，明确标记用户授权的运维执行，不假借姚泽攀身份。撤销使用同一入口的 revoke；保留工程师原有资格和业务关系。

数据库迁移只加默认 false 的布尔字段，不删除或重写业务记录。生产发布仍走既有 Prisma 7 `migrate deploy` 流程；加列后旧版镜像理论上兼容，但既有自动回滚因迁移指纹变化会拒绝，不能宣称可直接自动回退。维护权限撤销无需回滚程序。

## 验证与生产结果

发布审计发现现有间接依赖 brace-expansion 5.0.9 的两项 high，按发布门禁限制在同大版本更新至 5.0.12，避免顺带升级框架。依据官方安全公告 GHSA-qhr7-859c-m2p7、GHSA-6j4f-fj2g-mc7p 和 GHSA-q2hr-2g5m-vwhr。最终结果在完成后回填。

本地验证：前后端 typecheck 通过；API 114、Web 343 单测通过；隔离集成 151+34=185 通过；全部11个真实浏览器文件通过，依赖补丁后维护工程师专项再次1/1通过；发布脚本11、Harness20通过。最终依赖审计0 critical / 0 high，其余中风险不在此结论中伪称清零。记录在根目录 output/maintenance-package-final.log、maintenance-browser-all.log、maintenance-browser-final.log。

### 生产执行结果（2026-09-30）

- 已部署 `20260930-engineer-maintenance-v2`，迁移前备份 `/opt/it-project-console/backups/20260930T092016Z-37380.sql`。
- 已先运行授权脚本预检，再执行 grant --apply；仅张帅 maintenanceAdmin=false→true，role始终 ENGINEER，managerGrant.active始终 false。
- 生产运行代码只读断言通过：roleLabel=IT工程师、engineerEligible=true、canApproveProjects=true、管理操作能力=true；审批收件人包括姚泽攀和张帅，仅张帅拥有独立维护标记。
- 姚泽攀仍 MANAGER 且保留审批能力；有效管理名单仍2人。项目22、需求18与执行前一致。
- 授权审计 `cmunwboob00003xp98jvtoyys`。API/Web/PostgreSQL/MinIO健康；正式域名 `/health/ready` 返回 ready。
- 记录：根目录 output/maintenance-deploy.log、maintenance-production-dryrun.json、maintenance-production-apply.json、maintenance-production-verified.json。
- 验证边界：生产仅执行授权及只读断言，没有借用姚泽攀会话、创建测试会话或试写真实项目；业务写操作已在隔离环境和真实浏览器中验证。

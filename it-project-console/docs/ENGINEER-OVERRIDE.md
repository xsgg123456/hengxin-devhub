# 工程师例外资格操作

2026-09-11 已只读核实：生产中周熹仅匹配一名用户，内部ID `cmttusu8v002x07rqz8zaznkq`、钉钉ID `1549216820698961`、事业三部、有效、BUSINESS，管理授权已撤销。本轮没有修改生产数据。显示姓名只用于核实，不参与权限判断。

部署迁移 `202609110003_engineer_override` 后，授权操作人使用现有有效公司管理人员的内部ID。以下命令在 `api` 目录执行；默认只读预览，核对身份、动作和原因后添加 `--apply` 才写入。部署及生产写入须另获用户明确授权。

```powershell
node --import tsx --env-file-if-exists=.env src/maintenance/engineer-override.ts --user-id cmttusu8v002x07rqz8zaznkq --ding-user-id 1549216820698961 --actor-id <有效管理人员内部ID> --action grant --reason "已核实实际承担IT工程师职责，保留钉钉原部门"
```

生产镜像使用已编译的 `node --env-file-if-exists=.env dist/maintenance/engineer-override.js`，参数不变。

撤销使用同一命令改为 `--action revoke`，填写撤销原因，核对后加 `--apply`。服务按内部ID及钉钉ID匹配，检查操作人的有效公司管理权限；事务内保存资格、基础角色和审计日志。变更不修改部门或管理授权。撤销例外会清理该用户会话；非IT成员恢复业务角色，不再进入工程师候选或获得协作维护权，项目和历史仍保留。IT部门成员撤销例外后仍具有部门自带资格。

审计记录使用 `entity_type=engineer_override`、目标内部ID、grant/revoke，含操作人、原因和变更前后状态。重复执行同样状态不重复写审计。通讯录同步与登录会保留例外；停用用户无法凭例外登录或参与，已撤销的管理授权不会恢复。

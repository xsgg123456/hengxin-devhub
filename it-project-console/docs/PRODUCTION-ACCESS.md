# 生产连接上下文

用户已于2026-09-10要求持久配置生产登录，避免每次任务重新索要密码。本机已通过专用 SSH 密钥验证；先复用此配置，不把“默认密码认证失败”当成需要用户再次提供密码。

## 本机连接

```powershell
ssh hengxin-prod
ssh -o BatchMode=yes hengxin-prod "docker ps --format '{{.Names}} {{.Status}}'"
```

- 目标：root@192.168.1.245:22；系统目录：/opt/it-project-console。
- SSH 配置：本机用户目录 `~/.ssh/config`，Host 同时匹配 `hengxin-prod` 与 `192.168.1.245`，现有发布脚本无需改动。
- 专用私钥：`~/.ssh/hengxin_devhub_prod`；仅留本机用户目录，不读取/复制私钥内容到日志、仓库、包或服务器。
- 公钥指纹：`SHA256:EHYLjIcTAt3Obe72qlqhOORvpZoRMJAgNeVDF/gBf1I`。
- 服务器公钥登记：`/root/.ssh/authorized_keys`，保留原有条目，新增标记 `hengxin-devhub-prod-20260910`；禁止本条目的 agent/X11 转发。添加前备份 `authorized_keys.before-devhub-20260910`。
- 已启用 BatchMode、严格主机密钥检查及连接保活；服务器主机密钥沿用已有 known_hosts，不关闭主机校验。

## 排障顺序

1. 使用上面的别名或 IP，先做无密码只读连接测试。
2. 若 Codex 沙箱报网络/本机 `.ssh` 访问拒绝，按工具权限流程请求放行该连接；这不是服务器密码错误，不先向用户索要密码。
3. 若真实返回 publickey 拒绝，检查配置解析、私钥是否存在和公钥登记；只查看路径/指纹，不输出私钥。主机指纹变化必须先核实来源。
4. 只有密钥确实不可用且无法恢复，才让用户处理凭据。换电脑不会自动携带此私钥。

## 服务与权限边界

正式入口：https://pmg.qhhengxin.top:8443。新服务为 itpc-prod-api-1、itpc-prod-web-1、itpc-prod-postgres-1、itpc-prod-minio-1；公开代理 itpd-prod-proxy-1。旧系统仍保留，不能按名字相近误操作旧库。

连接授权用于用户要求的排查和开发；持久凭据不等于无限发布授权。部署、公开路由变更及数据修改仍按当次任务范围执行。需要撤销本机访问时，仅删除服务器上对应公钥条目，不覆盖整个 authorized_keys。

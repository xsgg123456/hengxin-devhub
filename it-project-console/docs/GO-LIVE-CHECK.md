# 正式上线检查结果（更新于2026-09-10）

当前结论：2026-09-10 09:42正式域名已切换到新系统，部署版本20260910-go-live-v2，API/Web/PostgreSQL/MinIO健康。完整测试、浏览器业务回归、备份恢复、正式TLS附件链路及Chrome真人钉钉登录通过；本轮既定发布验收已完成，未发现阻断正常使用的问题。业务18项目/2需求，管理林炳辰和姚泽攀，正式通知关闭。管理员/业务人员完整写入流程在隔离环境验收，本轮未借用领导账号或修改真实项目来重演全部写操作。

用户要求停止扩大底层整改，因此保留原数据库/MinIO/mc及公开代理镜像，发布必要API/Web和入口防护。扫描门禁按最新授权改为精确镜像身份、记录残余限制及已完成的功能/恢复评估；原始critical数量29（五个运行镜像）照实保留，mc另3，并未标成已修复。下文9月9日的全面整改计划及未切换状态为历史记录。

## 正式发布结果（2026-09-10 09:43）

- 09:48后Chrome正式真人授权完成：/api/me 200，张帅/IT部/ENGINEER/active；/api/workspace 200且18项目/2需求。本人范围3张卡、全部范围18张卡，项目柱图及人员负载渲染正常。9月甘特9项目，切换10月并返回9月通过；点击本人项目时间条打开详情，70%进度一致，更新表单可打开并取消，未写真实项目。需求池2待评估、物流组/商务组各1条，环图和趋势图渲染正常；管理候选接口对该工程师返回403。
- Chrome页面证据在`output/public-chrome/`，项目总览`page-2026-09-10T01-49-58-900Z.png`、甘特及详情`page-2026-09-10T01-51-17-287Z.png`、需求图表`page-2026-09-10T01-53-02-472Z.png`。交互工具首次点击隐藏radio及使用不完整页面标题等待失败，已改用真实可见标签/完整标题后通过，未修改应用或放宽业务断言。

- 统一发布包：`output/releases/20260910-go-live-v2/itpc-20260910-go-live-v2.tar.gz`，485851370字节；SHA256为`3f88b9f0e2621ecca8936f84ddf4d9592ccb6588f22d10e84171948b28c11180`，服务器独立验证归档和每文件摘要通过。manifest如实记为bd92912基础上的dirty工作区产物，不冒充来自干净提交。
- 完整类型检查、前端136/后端55项单元测试、真实PG/MinIO集成72项、发布回归6项、真实前后端浏览器流程7项全部通过。首次API基础启动用例5秒超时；未改代码或放宽时限，独立55项和完整发布复跑均通过。产物162文件隐私检查通过，应用依赖审计0 high/critical。
- 两阶段有界审查通过；自动回退现在验证旧页面再报告恢复成功，恢复失败明确提示人工处理。实际门禁程序7项、实际回退函数7项隔离失败分支测试通过；未为证明故障回退而中断正式入口。
- 新完整备份`full/20260910T013606Z-22512`成功；部署前SQL备份`20260910T013914Z-25430.sql`成功；6个迁移无待执行项。统一部署脚本输出`Deployment healthy: 20260910-go-live-v2`。
- 部署前后21表摘要比对：17表完全相同，包括项目、需求、附件、阶段/进度/审批等业务记录和管理授权。audit_logs增加一条dingtalk_directory/sync；用户、部门和system_settings变化来自启动通讯录同步，已核对该审计发生于09:39:37，不能写成全部21表无变化。项目18、需求2和两名有效管理人员再次核验通过。
- 原公开代理已加载新配置，`PUBLIC_ROUTE_SWITCHED`；普通DNS解析的Edge和Chrome都打开正式新系统登录页面，无SSH隧道或hosts覆盖。未登录workspace的401为预期权限拦截，第三方钉钉页的控制台提示不混称应用故障。
- 实际公开TLS代理：健康、首页、脚本资源200；未登录接口401；开发登录404；钉钉配置启用、回调地址精确一致、OAuth跳转302和安全Cookie属性通过。本脚本验证入口，不替代真人授权。
- 应用S3Storage生成实际预签名，经公开代理上传/下载PDF成功，内容SHA256为`d3ac201664ed922211992394bbddfb7c1aed2bf77c5c090ced9802fe311acbcbb`；匿名下载403，三种危险header变体均代理403，测试对象已删除，没有新增业务附件记录。连接从服务器内部网络进入实际TLS代理并保持真实Host/SNI；浏览器从普通公开域名确认页面访问。
- 证据：本机`output/go-live-package-v2.log`、`go-live-browser-regression.log`、`final-release-review.md`、`release-image-layer-comparison.json`；服务器`operations/go-live-20260909/deploy-v2.log`、`public-switch.log`、`public-verification.log`和原/新image-gate记录。

## 2026-09-10 收尾范围及新增证据

- PostgreSQL libxml2 CVE-2026-6653：特制XML可能触发内存错误；Debian评为Minor/no-dsa，当前同发行版无已修包。应用没有SQL/XML输入入口，数据库无对外端口，正常项目管理功能不受该项影响。保持affected记录，停止自制补丁；这不是“没有任何安全风险”的结论。
- 第二MinIO研究候选已通过12个测试文件/72项应用集成测试，以及真实multipart、预签名下载、内容摘要和容器重启后读取校验；临时schema、桶及容器已回收。生产MinIO未更换；该候选不作为本次上线新增前提。
- API候选镜像在独立临时数据库上两次运行实际Prisma迁移及迁移状态检查通过，6个迁移全部就绪，临时库已删除。
- Web入口真实代理回归及其他发布回归共6/6通过，普通预签名PUT/GET成功，危险未签名trailer请求返回代理固定403。该措施是入口缓解，不代表MinIO源码漏洞已修复。
- 服务器最新公开代理候选检查退出0：CANDIDATE_HTTPS_READY=200、PUBLIC_STORAGE_GUARD=403、ROLLBACK_CANDIDATE_OLD_APP=200，两次nginx -t成功。候选无公开端口并已清理；此证据不替代正式切换后的浏览器/附件验证。
- 每日备份最新状态SUCCESS 2026-09-09T19:30:05Z（北京时间9月10日03:30）。下一步范围限定为必要应用及入口补丁打包部署、如实记录准入判断、正式切换和实际功能验证。

## 已完成与证据

- 一致性完整备份：`/opt/it-project-console/backups/full/20260909T122016Z-53823`，数据库、MinIO整个卷、server.env、发布路径及镜像身份，SHA256清单；该批次已PIN保留。
- 真实隔离恢复：`/opt/it-project-console/backups/restore-20260909122425-58748`，21张public表（含迁移表）排序行摘要一致；全部2个S3对象内容、长度、MIME和SHA256一致（763/255字节）。RESULT=PASS，退出0，临时容器/卷均已清理。恢复不向生产库写入。
- 每日备份：`/etc/cron.d/itpc-full-backup`，Asia/Shanghai 03:30，crond active；调用 `operations/go-live-20260909/daily-backup.sh`。保留最新14个成功批次，PIN例外；记录最后状态与日志，日志轮转14份。当前备份在同一服务器，不能抵御整机/磁盘同时损坏；尚无用户指定的异机备份位置。
- 实际每日入口运行：`full/20260909T122707Z-64136`成功，`daily-status.txt`为SUCCESS。备份会短暂停新API和MinIO，成功/失败均恢复并等健康，夜间可能有短暂不可用。
- 独立Nginx候选：新配置HTTPS readiness=200，旧配置/login=200并确认Next静态标记；两次nginx -t通过，候选容器无公开端口且已清理。此前旧根路径307，已按真实登录跳转调整验证。
- 入口脚本：`scripts/server/cutover-public.sh check|switch|rollback`；原位更新旧代理模板及有效配置，保留旧配置；切换失败回退路由；不回滚或删除新业务库。未来正式切换后的新写入必须保留，不能把恢复旧路由误当成数据同步。
- 门禁实测：image-gate.approved=false，执行switch在路由修改前拒绝；旧模板SHA256保持af1f1ae23fa6e2c10eb10014e8bcce22801c7e8a798846aba58e5a7daa387a2b，输出IMAGE_GATE_BLOCKED_ROUTE_UNCHANGED。
- 脚本两阶段有界审查通过，5份Bash语法及对象验证脚本语法通过。一次性断网容器测试保留策略/PIN/备份失败/目录列举失败四项PASS。没有改应用运行代码，因此没有冒称本轮重新构建应用。

## 镜像扫描阻断

Trivy 0.74.0，扫描器摘要sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969；当日下载漏洞库。API/Web/PG/MinIO镜像所有RootFS层摘要与服务器逐项相同（本机containerd manifest与服务器传统镜像ID显示不同，已比对内容）。报告为包/漏洞命中数，同一CVE可能重复；不是可利用漏洞的独立数量，也不表示每项在当前配置可达。

| 镜像 | CRITICAL | HIGH |
|---|---:|---:|
| API 20260909-bd92912-uat | 6 | 81 |
| Web 20260909-bd92912-uat | 2 | 34 |
| PostgreSQL 16-f1c3376c26f2 | 14 | 98 |
| MinIO 14cea493d9a3 | 8 | 98 |
| mc a7fe349ef4bd | 3 | 44 |
| 旧公开Nginx 1.27-alpine | 2 | 34 |

原始报告与SHA256汇总位于本机output/image-*-scan.json、go-live-image-summary.json及服务器operations/go-live-20260909/。五个运行镜像严重命中共32；另mc有3条。image-gate.json明确approved=false，必须修复并对新镜像重新扫描/审查后才能批准，不允许手改数量绕过。

## 修复路线与仍需决策的部分

1. Web及公开Nginx的OpenSSL 3.3.3-r0命中CVE-2026-31789，报告修复值3.3.7-r0；需使用维护中的基础镜像重建并重新验证TLS、OAuth、附件代理。
2. API镜像含构建工具：tar 7.5.15修复值7.5.19，esbuild二进制带旧Go运行时；需拆分构建/迁移/运行依赖或升级工具链后回归。不能直接删Prisma CLI导致离线迁移失效。
3. API/PG的Perl等系统包部分没有扫描器提供的已修版本；需逐项核实发行版受影响状态和可用修复，不能用ignore-unfixed把结果冒充零漏洞，也不能未经验证切换老内核下的数据库基础镜像。
4. 用户已明确要求继续使用 MinIO，取消 AIStor 和替代存储路线。保持现有 MinIO、S3 接口及数据卷，继续做漏洞适用性审查和同产品兼容修复。

官方资料：[MinIO OIDC公告](https://github.com/minio/minio/security/advisories/GHSA-5cx5-wh4m-82fh)、[LDAP公告](https://github.com/minio/minio/security/advisories/GHSA-jv87-32hw-hh99)、[归档仓库](https://github.com/minio/minio)、[AIStor Free条款](https://www.min.io/legal/aistor-free-agreement)、[安装与许可证说明](https://docs.min.io/aistor/installation/linux/install/deploy-aistor-on-ubuntu-server/)。OIDC/LDAP公告有特定配置前提；未完成可达性复核，不能宣称这些在本系统可直接利用。

剩余：安全修复与镜像重建/扫描、旧内核兼容回归、批准后正式入口切换、切换后普通浏览器真实扫码和业务/附件验证。候选通过不替代公开切换验收。

## 保留 MinIO 后的补充验证

- Web 候选 `itpc-web:20260909-security-candidate` 完成同 Alpine 分支系统包升级，OpenSSL 库为 3.3.7-r0；构建通过，Trivy 复扫 CRITICAL=0、HIGH=0。尚未替换服务器 Web 或公开代理。
- API 候选 `itpc-api:20260909-security-candidate` 移除运行层全局 npm/pnpm，保留应用依赖和 Prisma CLI。构建及断网 `prisma validate` 通过；tar 严重告警消失，原始 CRITICAL 从6降为5，剩余告警仍需逐项适用性审查。
- MinIO 有效配置中 OIDC、LDAP、etcd、通知和 audit/logger 外发均未启用；无远程 tier，site replication enabled=false。不能据此推导所有 TLS/gRPC 依赖都不受影响。
- govulncheck v1.8.0 对与服务器 SHA256 一致的 minio/mc 二进制完成 symbol 扫描：确实包含受影响 gRPC Server Serve/ServeHTTP 和 TLS 函数。源码调用与运行配置适用性审查未闭环，保留 under_investigation；不能标记 vulnerable_code_not_present。
- 统一发布包需同时包含恢复指纹 SQL 和公开代理配置，避免未来仅有脚本却缺运行依赖；本轮补入打包清单。

上述均为候选与只读核查，未执行正式路由切换，未更换 MinIO。

## MinIO 同产品补丁试验结果（2026-09-09 21:08）

- 保留 MinIO RELEASE.2025-09-07T16-13-09Z、mc RELEASE.2025-08-13T08-35-41Z 源码副本；Go 1.27.1、grpc 1.79.3、x/crypto 0.55.0 构建成功，`go mod verify`通过，传递模块变更清单已保留。当前二进制标识 DEVELOPMENT.GOGET，为研究候选，未冒充官方发布。
- 两个二进制 govulncheck 目标 CVE-2026-33186、CVE-2026-56854、CVE-2025-68121 命中均为0。原镜像派生的候选 `itpc-minio:20260909-security-candidate` Trivy原始结果0 CRITICAL/20 HIGH；**主模块(devel)会漏报按MinIO版本匹配的OIDC/LDAP本体条目**，这两项仍承接原始报告和配置适用性记录，不得以此宣称全部严重风险修复。
- 镜像归档 SHA256 `dd6db79f1327447fbd95c1b11911749853e17a17d8a49fbbb734ac4278e373a7` 本地与服务器一致。服务器在原3.10内核实际启动通过。
- `/opt/it-project-console/operations/go-live-20260909/minio-candidate-smoke.log`：只读挂载已PIN完整备份，恢复到带时间/PID后缀的独立卷；候选无网络、无发布端口、不挂生产卷。两个旧对象SHA256一致，克隆桶写读校验、删除和匿名403通过；`CLONE_SMOKE_AND_CLEANUP_PASS`，退出0，临时容器/卷全部清理。
- 以上不是完整应用附件回归：尚未验证multipart、应用预签名/回调、重启后读写、正式版本元数据、源码分发打包及其余HIGH修复/适用性。候选仍未纳入生产release.env。
- Web和独立公开Nginx候选复扫均0 CRITICAL/0 HIGH；API候选5 CRITICAL/73 HIGH，离线Prisma validate及发布回归5/5通过。有界补丁审查PASS，正式门禁保持false。
- PG libxml2 CVE-2026-6653仍为affected，Debian当前同发行版无已修包。厂商Minor/no-dsa与扫描CRITICAL并列记录，不能标成不受影响。上游回补涉及公开结构，未验证ABI前不覆盖数据库镜像。

结论：坚持MinIO的兼容补丁路线已得到初步实证；正式上线安全准入和完整候选发布验收仍未完成。

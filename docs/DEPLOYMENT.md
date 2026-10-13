# 私人服务器部署与恢复

部署对象为自己的服务器；此交付包含源码及配置，**没有代替用户发布公网服务**。

## 1. 前提

Linux x86_64/arm64、Docker Engine、Compose v2（支持 `--wait`、BuildKit secret mount）。建议至少 2 核 CPU、2 GB RAM、10 GB 可用磁盘；实际存储取决于记录与备份数量。域名 DNS A/AAAA 指向服务器，放通 TCP 80/443（UDP 443 可选），不放通 5432/8000/8080。删除无用的旧 AAAA 记录，避免证书验证走错误地址。

如服务器只能通过 VPN 访问，可使用已有 HTTPS 反向代理；数据库仍保持私网。TLS 不可跳过。生产运行需要准确系统时间。

## 2. 上传源码和设置配置

将源码包解压到例如 `/srv/personal-workspace`，避免把 `.venv`、`node_modules`、`.runtime`、数据库、测试截图/账号、备份或云平台配置复制到生产。

```bash
cd /srv/personal-workspace
cp .env.example .env
chmod 600 .env
openssl rand -hex 32
```

在服务器本地编辑 `.env`：

| 变量 | 值 / 作用 |
|---|---|
| `POSTGRES_PASSWORD` | 上面生成的 64 位十六进制密码；不要使用占位文字。用十六进制避免数据库 URL 编码问题。 |
| `SITE_ADDRESS` | 自己的域名，例如 `workspace.your-domain.com`，不带路径。 |
| `ACME_EMAIL` | 自己用于证书续期通知的邮箱。 |
| `ALLOWED_HOSTS` | 域名加 `localhost,127.0.0.1`，逗号分隔，不能使用 `*`。 |
| `COOKIE_SECURE` | 生产必须是 `true`。 |
| `LOCAL_PORT` | 默认为 8080，只绑定服务器回环地址，供内部检查。 |

只在安全的本地终端输入配置，不在聊天或提交中发送密码。首次初始化后的数据库密码不会因为修改 `.env` 自动改变；已有数据库需要先在 PostgreSQL 内执行经过规划的角色密码轮换，再同步 API 配置。

## 3. 构建并启动 HTTPS

```bash
docker compose --profile https up -d --build --wait
docker compose ps
docker compose logs --tail=80 api
```

API 会先执行 `alembic upgrade head`，成功后才启动应用；数据库/API 的健康检查就绪后启动前端。Caddy 自动申请/续期证书，证书保存在自己的持久卷。不要水平扩展迁移启动命令；MVP 单 API 容器足够，扩容前应把迁移改为独立发布步骤。

检查自己的真实域名：

```bash
curl --fail --show-error https://workspace.your-domain.com/api/v1/health
```

应返回 `status: ok`。使用浏览器注册自己的账户，创建一个任务、刷新、检查保存，确认移动导航可用。确认 Cookie 中 `pw_session` 有 `HttpOnly`、`Secure`、`SameSite=Lax`；隐私开关刷新后保留；未登录时无法获取业务数据。不要公开真实账单或健康记录来验收。

### 已有 HTTPS 反向代理

不启动 `https` profile：

```bash
docker compose up -d --build --wait
```

让已有 HTTPS 代理转发到服务器回环的 `127.0.0.1:8080`，传递正确 Host。`COOKIE_SECURE=true`，Host 在 `ALLOWED_HOSTS` 中。若代理在另一容器，加入受控的 edge 网络并转发至 `web:80`，而不是暴露 API/数据库。HTTP 仅供隔离本地验收时使用，此时明确设置 `COOKIE_SECURE=false`；完成后恢复 HTTPS 与 Secure Cookie。

## 4. 构建网络与证书

构建需访问 Docker Hub/CDN、`registry.npmjs.org`、`pypi.org`、`files.pythonhosted.org`。运行时不访问这些依赖源。Caddy 需要其 ACME 证书服务的网络访问，未使用外部邮件、银行、健康或 AI API。

一般服务器无需特殊配置。企业代理需在 BuildKit 中提供代理参数和受信任 CA，Dockerfile 提供**可选** `build_ca` secret，只在安装步骤挂载，不留在最终镜像。使用平台/组织核实过的 CA，不使用 `--trusted-host`、`strict-ssl=false` 或其他关闭校验的方法。构建时网络隔离及代理 DNS 可用性应与普通容器运行网络分别排查。

前端使用 `npm ci` 的 lockfile 完整性校验，后端 `pip --require-hashes`。基础镜像随维护标签更新；需要完全固定上线镜像时，可在验证后记录实际镜像 digest，建立自己的升级流程。不要把云环境的代理域名、地址或证书硬编码到私人服务器。

## 5. 加密备份

数据库卷是数据源；前端/API 可重建。不要将热数据库目录直接当作可靠备份，使用 `pg_dump` 生成一致快照。

在安全设备建立用于备份的 GPG 加密密钥，把**公钥**导入服务器。私钥单独安全保管，不放源码、服务器公共目录或数据库容器。在服务器核实公钥指纹和信任关系。

```bash
export BACKUP_RECIPIENT='已核实的完整公钥指纹'
bash scripts/backup.sh
```

脚本启用 `pipefail` 和 `umask 077`，直接将 custom-format dump 流式加密，失败不保留伪成功文件，不落明文备份。定期把 `.dump.gpg` 复制到另一台受控设备，保留多代，监控退出状态与磁盘空间。不要给不明公钥强行关闭信任验证。

可用 cron/systemd timer 每日调用，显式设置部署目录、Docker 路径、`GNUPGHOME`、`BACKUP_RECIPIENT`。不要把私钥口令写进定时任务命令。

## 6. 隔离恢复演练

恢复设备须能解密备份；用受保护的 GPG agent 或本地交互解锁私钥。

```bash
bash scripts/restore.sh backups/workspace-时间戳.dump.gpg
```

只恢复至新的 `workspace_restore` 数据库，不覆盖生产；数据库已存在时脚本会停止，不擅自删除。核对迁移版本、记录数量及关键关系，在隔离 API 实例上测试登录、账户分录、训练历史和采购保护。恢复成功后，规划停机与切换：停止写入、做最新备份、确认恢复点，再由管理员切换连接配置。不要直接对生产使用 `pg_restore --clean`。

恢复后可撤销所有会话，要求用户重新登录：在恢复库运行 `DELETE FROM user_sessions;`。加密备份中包含私密财务/健康数据和密码哈希，解密权限必须受控。源码、部署配置和密钥的备份分别管理。

## 7. 升级与回滚

升级前加密备份并记录正在运行的镜像版本。先在独立环境运行迁移和测试，然后 `docker compose --profile https up -d --build --wait`。迁移失败 API 不启动，检查应用日志和数据库状态，不重置数据库或修改锁文件配平。

回滚应用须保证旧应用与当前 schema 兼容。不可仅凭代码回退就执行破坏性 schema downgrade；不可逆迁移需通过已验证备份制定恢复方案。`docker compose down` 停服务但保留卷；**不要使用 `down -v` 清理真实数据**。

## 8. 运维边界

服务端会话与 Argon2id、CSRF、按用户鉴权、数据库原子提交及版本锁构成 MVP 安全基线。生产 API 禁用访问日志中的请求细节；不得记录请求体、Cookie、密码、金额/健康内容。`X-Request-ID` 用于定位错误。

私人部署可在已有防火墙/VPN/反向代理进一步限制访问。公开注册允许创建彼此隔离的账户；若只供个人，限制入口比依赖未知 URL 更可靠。MVP 尚无邮件找回、MFA、自助账户删除流程；自行保管账户密码。上传的附件并未定义这些功能的完整政策。

服务器的真实域名、证书签发、持久存储及公网访问仍需由用户部署后验收；当前本机 HTTP 容器测试不能证明公网 HTTPS 已上线。

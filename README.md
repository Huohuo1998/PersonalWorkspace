# Personal Workspace

中文优先的私人生活工作台，包含首页、日程、经济、运动、饮食五个模块。React + TypeScript + Vite 前端、FastAPI 后端、PostgreSQL 数据库。桌面侧栏、手机固定底部导航、浅色 Calm Workspace 主题。

本项目依照附件的 V2.1 视觉基线、R1.1 需求、六项已批准 POL 政策和 S1 架构建议实现。原始材料保存在 [docs/spec](docs/spec)，实施与验收追溯见 [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md)。附件中的历史阶段限制不改变本次用户的明确开发授权。

## 私人服务器部署

完整步骤见 **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**。需要 Docker Engine + Compose v2、可用域名和服务器上的 80/443 端口。仅数据库有持久卷，数据库和 API 不映射公网端口。提供 Caddy 自动 HTTPS；已有反向代理也可使用。

```bash
cp .env.example .env
chmod 600 .env
# 编辑 .env，设置生成的密码、自己的域名、邮箱、允许的 Host。
docker compose --profile https up -d --build --wait
```

不要使用示例域名或占位密码上线。生产 `COOKIE_SECURE=true`；密码、备份私钥和数据库文件不进入仓库。当前交付没有发布到公网，服务器部署由用户执行。

## 本地开发

需要 Python 3.12、uv、Node.js 24、Docker。云任务直接使用已有 `/workspace/PersonalWorkspace`，无需另建 worktree。

```bash
bash scripts/install.sh
bash scripts/dev.sh
```

前端使用本机 5173 端口，API 使用本机 8000 端口，Vite 同源代理 `/api`。`personal-workspace-dev-db` 仅监听回环地址；其 trust 认证仅限开发，生产使用独立 Compose 数据库和密码。首次使用自行注册，没有默认账户或自动注入的财务/健康样本。可明确导入三份基础食谱，不会创建实际用餐。

手动启动：

```bash
cd backend
../.venv/bin/alembic upgrade head
../.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
# 另一个终端：
cd web
npm run dev
```

API 契约由 `/api/docs` 和 `/api/openapi.json` 提供。数据库迁移在 `backend/migrations/versions/`，Python 全部依赖及哈希在 `backend/requirements.lock`，前端依赖固定在 `web/package-lock.json`。

## 测试

后端测试会清空**专用** `workspace_test` 数据库，禁止指向开发/生产数据库。

```bash
docker exec personal-workspace-dev-db createdb -U workspace workspace_test
cd backend
../.venv/bin/pytest -q
cd ../web
npm run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e
```

若测试库已存在，跳过 `createdb`。浏览器测试每次注册隔离的临时用户，只写测试事实。不要对含真实用户数据的生产站点运行浏览器测试。默认针对开发服务；用 `E2E_BASE_URL` 可指定隔离的本机 Compose 部署。

测试覆盖资金原子性/幂等/并发退款、用户隔离/CSRF、训练单活动约束/冲突/保存恢复、计划与事实分离、采购多轮差异/已购与人工保护、隐私遮蔽、手机导航与可访问性。详见 [docs/TEST_REPORT.md](docs/TEST_REPORT.md)，不将 118 条原始验收项全部宣称为自动化通过。

## 工程目录

| 路径 | 内容 |
|---|---|
| `web/src` | 响应式界面、共享表单、隐私遮蔽、训练自动保存、日历时间结构 |
| `backend/app` | 安全会话、模型、参数契约、财务与采购领域规则、API |
| `backend/migrations` | 可版本化执行的数据库迁移 |
| `backend/tests` / `web/e2e` | PostgreSQL 业务/并发测试、真实浏览器测试 |
| `compose.yaml` / `deploy` | 容器部署、HTTPS 反向代理 |
| `scripts` | 重复安装、开发启动、加密备份和隔离恢复 |
| `docs` | 部署、技术说明、验收与来源追溯 |

## 当前范围

单账本货币，创建财务账户后锁定；日/周简单重复任务采用滚动实例，不覆盖历史；无银行/设备自动同步、AI 食谱、强制营养核算或完整离线同步。浏览器中尚未确认保存的训练输入仅保留在当前页面，不能承诺浏览器崩溃后恢复；服务器已确认版本可恢复。交易历史保持不可无痕修改，退款、余额校正另留分录与审计。

MVP 不提供邮箱验证、自助找回密码、MFA、账户删除/个人数据导出工作流。这些未在附件定义具体策略，不伪装成已实现。私人服务器可限制入口至 VPN 或反向代理访问控制。没有外部追踪、远程字体、公共演示账号或嵌入的真实个人信息。

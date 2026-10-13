# Personal Workspace｜S1 技术架构与技术选型评审 V1.0

> 日期：2026-10-12  
> 状态：**技术推荐草案，待审批；尚未建立代码仓库或开发网站**  
> 输入依据：业务重述 R1.1、全站视觉 V2.1、正式产品政策 POL-FIN-01~03 / POL-DIET-01~02 / POL-PRIV-01、DRR V1.3、118 项验收用例。

## 1. 目标与非目标

- 建立个人优先、未来多用户安全隔离的响应式 Web App；一级领域为 Dashboard、Schedule、Finance、Fitness、Diet。
- 保持设计确认的「计划 ≠ 实际事实」原则，所有领域对象具备明确归属。
- 重点保障财务一致性、训练自动保存、采购差异保护及敏感数据遮蔽。
- S1 只提供技术架构、对象设计、接口草案、实施分期与技术风险；**代码创建属于后续显式开发授权**。
- MVP 非目标：微服务、完整离线同步、银行/穿戴设备接入、AI 食谱生成、多人共享、仓储系统、强制热量核算。

## 2. 总体方案与取舍

| 维度 | S1 推荐方案 | 原因／边界 |
|---|---|---|
| 架构风格 | 模块化单体（Modular Monolith） | 一个服务与一套事务数据库，领域内部有独立应用服务、模型和仓储；不引入不必要的网络分布式一致性。 |
| Web 前端 | React + TypeScript + Vite | 移动桌面共用页面模型，各自适配；本产品无需对外 SEO 和 SSR 优先。 |
| 样式与组件 | CSS Variables/Tokens + Tailwind CSS + 可访问性 UI primitives | 统一 Calm Workspace Token；不要直接依赖外部默认主题决定视觉。 |
| 前端路由及请求 | React Router；TanStack Query | 前端视图及客户端状态与服务端请求状态分离；金融非幂等操作不得仅靠客户端防重。 |
| 后端 | Python、FastAPI、Pydantic 2 | 路由请求契约、类型验证、OpenAPI 自动文档。 |
| 持久化 | SQLAlchemy 2、Alembic、PostgreSQL | 原子交易、多字段约束、事务版本控制与数据库迁移。 |
| 认证 | 同站点 httpOnly + Secure Session Cookie；服务端会话 | 避免凭证进入浏览器 localStorage；应用需保护 CSRF、登录撞库、会话固定及登出撤销。 |
| 运行 | HTTPS 反向代理 + Web 容器 + API 容器 + 私有 PostgreSQL | Docker Compose 单机部署建议；数据库端口不公开。 |
| 观察与恢复 | 结构化日志、request_id、审计流水、加密备份和定期恢复演练 | 个人财务/健康类数据敏感；禁止把明文凭据、支付细节和私密健康内容写日志。 |

**不采用（MVP）：** 微服务拆分、Redis/Celery、Kafka、Kubernetes、复杂通用规则引擎、AI 自动驾驶式记账、全量离线优先。

## 3. 系统分层与模块所有权

- `web`：统一导航、响应式页面、全局 +、设计 Token、API 客户端、错误呈现、隐私遮蔽。只有显示与表单编排权，不拥有交易/会话/采购事实。
- `api`：认证、权限、路由契约、请求追踪、参数校验和应用服务入口。返回“已提交”“冲突”“结果未知”等可靠状态。
- `domains/schedule`：Task、TaskOccurrence、Event、Project、日期派生；仅组织行动。
- `domains/finance`：Account、金融流水/分录、预算、储蓄目标与财务审计；唯一资金事实源。
- `domains/fitness`：WorkoutSession、WorkoutSet、计划/模板、测量；唯一训练事实源。
- `domains/diet`：Recipe、MealPlan、ShoppingSnapshot、MealRecord；菜单与真实用餐分离。
- `read_models/dashboard`：从各领域读取独立查询模型（Query Service），禁止另立与源领域相冲突的真相数据库。
- `cross_domain_links`：稳定 source_domain/source_id/occurrence_id → target_domain/target_id 关联；访问前双向鉴权；源失效不删除既有事实。
- `shared`：鉴权用户上下文、原子事务/Unit of Work、idempotency store、审计、时间处理、基础异常标准；不得堆积各领域规则。

### 依赖方向

路由 → 应用服务 → 领域对象/策略 → 仓储接口 → PostgreSQL 适配；Dashboard 调用各领域只读 Query Service。跨域编辑应经过目标领域应用服务，不直接从 Schedule 改写财务或训练表。

## 4. 关键横向技术约束

### 4.1 多用户数据隔离

- 每一个用户私有业务实体必须有 `user_id`；所有检索、修改、删除必须以当前授权用户为范围；仅凭对象 UUID 不构成权限。
- 关联与批量操作也检查参与对象的用户身份；不应通过权限错误泄露其他用户的存在、标题或金额（可统一使用 404 语义）。
- PostgreSQL RLS 可作为未来防御纵深，但只有在正确的数据库角色和策略中生效，不代替 API 鉴权。

### 4.2 金额与记账

- 金额统一 Decimal/NUMERIC（例如 `NUMERIC(18,2)` 对于固定两位小数的单一 MVP 货币）；不得用二进制浮点保存资金。货币配置与未来多币种处理独立设计。
- 分离交易业务性质（支出、收入、内部转账、还款、退款、校正）与具体账户变动。**一条业务交易可以原子写入多条账户分录，但计作一次业务交易**。
- 原交易、更正/撤销、关联退款、账户变更与幂等记录需同事务完成。
- 统一信用卡净债务量 `C`：`C > 0` 待还欠款，`C < 0` 溢缴余额；呈现 `欠款=max(C,0)` 与 `溢缴=max(-C,0)`，不得相互重复计资产。
- 财务写入带 `idempotency_key` 与账户版本核对，超时查询原提交结果；不可直接以重新 POST 代表“重试”。

### 4.3 训练一致性

- 同一用户最多一个 `IN_PROGRESS` 或 `PAUSED` 的详细训练，会话唯一性必须数据库级保证；自由运动快速记录独立。
- 逐组自动保存使用版本号/乐观锁；冲突返回服务器当前版本及冲突标识，不静默覆盖。
- 最终结束会话先确保 dirty 组保存成功，再提交明确 COMPLETED 或 ABORTED；中断只能承诺恢复服务端已确认保存的状态，MVP 不承诺完整离线同步。

### 4.4 采购差异

- 把 `required` 理论需求、`purchased` 已购事实、`pending` 尚待购及 `manual_override` 人工调整显式分离。
- 同一食材/规格、同一量纲且等价可证明，才自动聚合；不同单位保留待核对。
- 每次菜单变更生成差异预览（不修改数据）；用户确认后才对允许的未购自动条目更新；使用需求版本/唯一业务键避免多轮补购重复。
- 采购勾选不会写 Finance.Transaction，只有用户实际记账才创建财务事实。

### 4.5 账户与隐私

- `POL-PRIV-01` 需跨导航摘要、图表、tooltip、提示文案、应用切换、通知等统一遮蔽；当前用户主动编辑中的必要数值可保留。
- 隐私遮蔽仅是 UI 显示策略，不等于数据鉴权、服务端脱敏或加密。

## 5. 环境、部署与安全

- 开发/测试/生产使用独立数据库和配置；生产不开放数据库端口到公网。
- 使用配置管理环境密钥；密码哈希建议 Argon2id；认证/敏感操作应使用 HTTPS + 安全会话 Cookie + CSRF 防护、速率限制。
- 备份 PostgreSQL（加密、权限隔离、恢复演练）；保留最小必要操作审计；确定用户删除/导出政策。
- 先采用同域服务前端与 API（例如 `/api/v1`），避免在 MVP 期引入复杂跨域凭据传递。

## 6. 关键架构决定及审批事项

| ID | 推荐 | 状态 |
|---|---|---|
| TECH-01 | React/TypeScript/Vite + FastAPI + PostgreSQL 模块化单体 | 待 S1 技术评审确认 |
| TECH-02 | SQLAlchemy 2 + Alembic；Decimal 金额；领域级所有权 | 待确认 |
| TECH-03 | 服务端 Session Cookie + CSRF；未来多用户隔离 | 待确认 |
| TECH-04 | 跨域稳定链接、读服务聚合，不引入跨域直接写表 | 待确认 |
| TECH-05 | 财务幂等 + 版本并发；训练唯一活动会话 + 版本保存 | 待确认 |
| TECH-06 | 单机容器部署，暂不引入 Redis/K8s 等 | 待确认 |
| TECH-07 | 单一货币 MVP，货币标识由用户设置或初始化确定 | 待确认；必须在数据表最终敲定前确定 |

## 7. 官方参考（2026-10-12 查阅）

- FastAPI Features: https://fastapi.tiangolo.com/features/
- Vite Guide: https://vite.dev/guide/
- SQLAlchemy ORM: https://docs.sqlalchemy.org/en/20/orm/
- Alembic: https://alembic.sqlalchemy.org/en/latest/
- TanStack Query: https://tanstack.com/query/latest/docs/framework/react
- PostgreSQL RLS: https://www.postgresql.org/docs/current/ddl-rowsecurity.html

> 本文任何技术选择均为建议；本次只制作设计交接文件，没有编写或运行应用代码。

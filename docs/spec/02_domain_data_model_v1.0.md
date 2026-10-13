# Personal Workspace｜核心数据模型与一致性规则 V1.0

> 状态：S1 概念／逻辑模型草案；**非最终 SQL 表定义**；未启动数据库实施。

## 1. 全局数据建模规则

- 每个私有业务实体需 `id`（UUID）、`user_id`、`created_at`、`updated_at`；有并发写入的实体加 `version`；真实事件/账务拥有独立 `occurred_on`/`occurred_at`。
- `user_id` 不仅是表列，也必须应用于读写、关联、唯一性以及跨域引用的授权校验。
- 金额使用 Decimal；数据库保存 Decimal 精度和货币标识；时间戳使用 UTC，用户时区解释日程中的本地日期、全天事件、周/月预算。
- 筛选和列表统一分页及排序；历史事实禁止无审计的静默覆盖。

## 2. 模块实体表

| 领域 | 实体候选 | 核心字段（示意） | 不变量 |
|---|---|---|---|
| Identity | `users` | id, email, password_hash, status | 私有数据均归属授权用户 |
| Identity | `user_preferences` | user_id, timezone, locale, privacy_masked, currency | 用户偏好与领域事实不同 |
| Identity | `user_sessions` | user_id, token_hash, expires_at, revoked_at | 服务端可撤销 |
| Schedule | `tasks` | title, status, inbox_position, scheduled_date, scheduled_at, due_at, project_id, source_ref | Inbox 不是任务状态；scheduled 和 due 独立 |
| Schedule | `task_recurrence_rules` | task_id, frequency, interval, until | 只支持确定范围的简单循环 |
| Schedule | `task_occurrences` | task_id, occurrence_key, scheduled overrides, status | 单次调整不重写模板和历史 |
| Schedule | `calendar_events` | title, start_at, end_at, all_day | 事件无任务完成勾选语义 |
| Schedule | `projects` | name, archived_at | 轻量任务组织 |
| Finance | `accounts` | type=ASSET/CREDIT, subtype, name, currency, active, version | 信用卡为净负债口径，正数欠款负数溢缴 |
| Finance | `financial_transactions` | type, occurred_on, amount, currency, category_id?, original_txn_id?, status, idempotency_key | 一个业务动作，一条事务主记录 |
| Finance | `account_movements` | transaction_id, account_id, balance_delta, movement_semantics | 同一业务原子产生正确账户变动；债务与资产采用不同方向定义 |
| Finance | `financial_corrections` | target_txn_id, reason, reversal_txn_id, author_id | 不无痕覆写历史 |
| Finance | `budgets` / `budget_categories` | month, limit, category_id | 分类不在总预算上重复叠加 |
| Finance | `savings_goals` | account_id, target_amount, status | 一个专用账户最多一个活动目标 |
| Fitness | `fitness_goals`, `training_plans` | name, schedule_rules, active | 不等于实际完成 |
| Fitness | `exercises`, `workout_templates` | name, metrics_schema, template_items | 历史保存快照，不随模板变化 |
| Fitness | `workout_sessions` | started_at, ended_at, status, version, source_ref | 同用户最多一个活跃/暂停详细会话 |
| Fitness | `workout_sets` | session_id, exercise_snapshot, ordinal, weight, reps, seconds, completed, version | 逐组实际数据并发保存 |
| Fitness | `quick_activities` | kind, duration, occurred_at, notes | 自由运动不占活动详细会话 |
| Fitness | `body_measurements`, `recovery_records` | occurred_on, numeric/body/symptom, optional | 可选；隐私覆盖 |
| Diet | `recipes`, `recipe_ingredients` | name, steps, ingredient_id, qty, unit_id, servings | 未知配料不自动推算 |
| Diet | `meal_plans`, `planned_meals` | date, meal_slot, recipe_id?, free_text?, servings | 计划不等于已吃 |
| Diet | `shopping_lists`, `shopping_items` | source_plan_revision, ingredient_id, normalized_unit, qty, purchased, manual_override, origin | 快照、已购事实、人工编辑独立 |
| Diet | `shopping_reconciliations` | list_id, target_plan_revision, diff_hash, apply_status | 相同版本/差异重复提交不得重复补购 |
| Diet | `meal_records` | occurred_on, slot, actual_description, source, plan_link? | 确认后才创建真实记录 |
| Cross-domain | `business_links` | source_domain, source_id, source_occurrence_id?, target_domain, target_id, user_id | 稳定 ID，禁止跨用户关联 |
| Shared | `idempotency_operations` | user_id, operation_type, key, request_hash, status, response_ref | 重试结果查询与防重 |
| Shared | `audit_events` | actor, subject, action, timestamp, relevant_ids, reason | 金额与历史更正保持追溯，日志脱敏 |

## 3. 资金一致性（核心公式）

设每个资产账户余额 `A_i` 为实际账面余额，可为负；信用卡净债务 `C_j` 为 **正欠款、负溢缴**。则：

- `净资产 = Σ A_i − Σ C_j` （负的信用卡净债务等于卡内溢缴，只能计一次）。
- `信用待还 = Σ max(C_j, 0)`。
- `信用溢缴 = Σ max(-C_j, 0)`。
- 如首页要显示“资产合计”，应说明是否含信用溢缴；推荐“其他资产合计”加“溢缴余额”单独列示，并提供不重复的净资产汇总。
- `本月净支出 = 本月实际支出交易之和 − 本月退款交易之和`；转账、还款、期初录入、对账校正均不进入收支。分类与退款挂原支出分类。

| 动作 | 资产账户变动 | 信用卡净债务变动 | 收支结果 |
|---|---|---|---|
| 工资到账银行 500 | bank +500 | 无 | 收入 +500 |
| 银行消费 80 | bank −80（允许核对后为负） | 无 | 支出 +80 |
| 信用卡消费 320 | 无 | credit +320 | 支出 +320 |
| 银行→现金转账 100 | bank −100、cash +100 | 无 | 不影响 |
| 银行还信用卡 600 | bank −600 | credit −600 | 不影响 |
| 信用卡消费退款到账现金 100 | cash +100 | 不变 | 退款月支出 −100 |
| 信用卡消费退款回信用卡 100 | 无 | credit −100 | 退款月支出 −100 |
| 对账校正 | 实际余额差额 | 可能有差额 | 不影响 |

**反例检查：** 欠款 500、还款 600 ⇒ `C=-100`；显示欠款 0、溢缴 100；净资产还款前后不改变。不能将“溢缴 100”既计负债抵减、又重复作为资产加一笔。

## 4. 训练状态机与并发约束

- `IN_PROGRESS ↔ PAUSED → COMPLETED/ABORTED`；最终态不可转回活动态，历史更正另设专用操作。
- `UNIQUE(user_id)` 对活动态（IN_PROGRESS、PAUSED）使用 PostgreSQL 部分唯一索引实现，防止并发创建两条未结束详细训练。
- 编辑 WorkoutSet 时携带 `expected_version`；如果不匹配 → `409 conflict` 并回传最新已保存版本的安全信息。
- WorkoutSession 结束时拒绝未完成保存和版本冲突；显式记录最终实际组数和终态。

## 5. 采购差异与数量口径

同一 `ingredient_id`、`specification_id`、`dimension` 且可证明单位换算时，才能合并。典型：`1kg+500g=1500g`；`2个番茄+200g番茄` 不能盲目混合。

对于同单位某食材：

- `Q_required` = 当前新菜单所需数量（只计可靠配料需求）。
- `Q_purchased` = 已购记录的数量（事实，不随菜单变化清空）。
- `Q_pending` = 用户当前仍计划购买的、未购的数量（可能受手工调整影响）。
- `Q_recommended_extra = max(0, Q_required − Q_purchased − Q_pending)`（仅用于可比的自动管理数量；含 manual_override 的条目必须逐项复核，不得无条件覆盖）。

示例：已购 2、待购 2、新需求 5 ⇒ 提醒补购 1。对于需求减少，先提示“原已购保留”，未购清单改变须确认。差异核对的 `target_plan_revision + reconciliation_id` 同一内容多次提交不重复创建。

## 6. 业务来源与生命周期

- 以 `business_links` 连接 Schedule TaskOccurrence ↔ WorkoutSession / MealPlan action / Finance action 等。
- UI 来源失效时目标领域事实仍存在；导航可安全回到目标领域首页。
- 不以任务标题、同一天或模糊相似名称反推事实。
- 用户取消“从菜单记一餐”预填表单，没有 `meal_records` 插入。

## 7. 审计与数据删除

- 交易更正、退款与余额校正必须能从原事件追溯到结果，禁止无痕硬改。实体可归档的具体政策仍由产品/法务评审。
- 账号删除、数据导出、保留期由后续合规与运营政策确定，不在本稿中冒充已确认。

> 本文只定义逻辑模型与一致性，不是迁移脚本；建议在 S1 冻结后再设计完整 SQLDDL、索引和关系图。

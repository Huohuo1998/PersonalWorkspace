# Personal Workspace｜API 契约草案与失败状态协议 V1.0

> 状态：S1 API 设计草案；端点、字段名和响应示例均非实际已实现接口。

## 1. 通用约定

- 前缀 `/api/v1`；采用 REST + JSON；基于 server-side session 的 httpOnly + Secure Cookie。所有变更请求防 CSRF。
- `user_id` 从会话获取，**客户端不能指定他人 user_id**；UUID 非授权凭据。
- 时间瞬时值返回 RFC 3339 / UTC；财务交易使用清晰的实际 `occurred_on` 日期；日程本地日期与时区另存。
- 金额在 JSON 使用十进制字符串（例如 `"120.50"`）并带 currency；不使用 JS float 计算最终账务。
- 非幂等创建/结束/补购提交用 `Idempotency-Key`，服务器端按用户+操作类型+key+请求内容核对；重复相同内容返回原结果，不同内容复用 key 返回冲突。
- 对存在并发变更的数据使用 `If-Match` 或 `expected_version`，不能依赖界面按钮禁用代替数据库一致性。
- 统一分页、排序、过滤；服务端禁止任意对象引用和过量数据返回。

## 2. 响应语义

| HTTP | 场景 | 前端反馈 |
|---|---|---|
| 200/201 | 查询或创建成功 | 已确认成功才展示 saved |
| 202 | 仅在服务器已明确接受异步处理时 | 不显示完成；使用返回的操作 ID 查询 |
| 400/422 | 参数或业务校验失败 | 关联字段提示并保留表单 |
| 401 | 会话失效 | 重新登录，敏感草稿谨慎处理 |
| 403/404 | 无权限或对象不可见 | 对他人私有对象建议统一不泄露存在性的 404 表现 |
| 409 | 版本冲突、活跃训练已存在、幂等 key 内容不一致 | 显示冲突状态及重新核对入口 |
| 429 | 频率限制 | 停止盲目重试，显示合理等待说明 |
| 5xx / 网络超时 | 本次请求失败或结果未知 | **财务不能简单地按失败重试创建**；先查询原操作状态 |

### 标准化错误响应概念结构

```json
{
  "error": {
    "code": "RESOURCE_VERSION_CONFLICT",
    "message": "数据已更新，请核对最新内容",
    "request_id": "example-request-id",
    "details": {"resource_version": 8}
  }
}
```

此代码段仅为**API 文档示例**，不是应用代码。

## 3. 端点草案

| 领域 | 方法与路径 | 描述 | 必需保护 |
|---|---|---|---|
| Auth | `POST /auth/login` / `POST /auth/logout` / `GET /me` | 身份、会话管理 | 安全 Cookie、CSRF、限流 |
| Settings | `GET/PATCH /me/preferences` | 时区/隐私/单一货币偏好 | 按当前用户 |
| Dashboard | `GET /dashboard?date=...` | 今日行动 + 四域独立摘要 | 单域失败可降级，拒绝虚构零值 |
| Schedule | `GET/POST /tasks` / `GET/PATCH /tasks/{id}` | 收集箱和任务 | scheduled/due 区分、鉴权、版本 |
| Schedule | `POST /tasks/{id}/schedule-today` | 今日执行意图 | 不改变 due_at |
| Schedule | `GET/PATCH /task-occurrences/{id}` | 仅修改一次实例 | 不自动改源模板 |
| Schedule | `GET/POST /events` / `GET/POST /projects` | 独立事件/轻项目 | 类型及鉴权 |
| Finance | `GET/POST /finance/accounts` | 资产/信用账户 | 开户余额单独期初分录 |
| Finance | `GET /finance/transactions` / `POST /finance/transactions` | 收支、列表 | 幂等、真实日期、用户隔离 |
| Finance | `POST /finance/transfers` | 自有资产转账 | 多分录原子事务、版本核对 |
| Finance | `POST /finance/credit-repayments` | 信用还款与溢缴 | 核对超额金额、不可算支出 |
| Finance | `POST /finance/transactions/{id}/refunds` | 关联原交易退款 | 累计可退、退款实际账户、幂等 |
| Finance | `POST /finance/accounts/{id}/adjustments` | 余额对账校正 | expected_version、原因、审计 |
| Finance | `GET/PUT /finance/budgets` / `GET/POST /finance/savings-goals` | 预算与真实账户储蓄 | 不重复计余额 |
| Fitness | `GET /fitness/sessions/active` | 查找未结束训练 | 每用户仅 1 个 |
| Fitness | `POST /fitness/sessions` | 开始详细训练 | 并发唯一约束、幂等 |
| Fitness | `PATCH /fitness/sessions/{id}/sets/{set_id}` | 逐组保存 | expected_version，冲突明确 |
| Fitness | `POST /fitness/sessions/{id}/finish` | 完成或中止 | 数据先保存、状态不可重复完成 |
| Fitness | `POST /fitness/quick-activities` | 自由运动 | 独立于持续会话 |
| Fitness | `GET/POST /fitness/body-measurements` | 身体测量 | 按用户与隐私策略 |
| Diet | `GET/POST /diet/recipes` | 食谱 | 配料单位与过敏原有效性 |
| Diet | `GET/PUT /diet/meal-plans/{week}` | 每周菜单 | 计划版本号 |
| Diet | `POST /diet/shopping-lists` | 从当前菜单生成采购快照 | 生成版本记录，保持独立 |
| Diet | `POST /diet/shopping-lists/{id}/reconciliation-preview` | 计算差异（不写） | 只做预览；返回版本 hash |
| Diet | `POST /diet/shopping-lists/{id}/reconciliation-apply` | 用户确认后更新 | 版本+幂等；已购与人工保护 |
| Diet | `PATCH /diet/shopping-lists/{id}/items/{item_id}` | 采购状态与人工数量 | 版本校验、不可造财务流水 |
| Diet | `GET/POST /diet/meal-records` | 实际用餐记录 | 预填并非创建；用户最终提交 |
| Shared | `GET /operations/{operation_id}` | 原操作结果查询 | 仅当前用户可查、状态不可泄露 |
| Shared | `GET /business-links/{id}` | 查询可访问跨域关联 | 双端鉴权、来源失效降级 |

## 4. 关键请求/响应契约字段（示意）

### 财务创建

- 输入：`idempotency_key`（推荐 HTTP header）、`account_id`、`type`、`amount`、`currency`、`occurred_on`、`category_id`、`description`、`expected_account_version`。
- 退款增补：`original_transaction_id`、`received_account_id`、`refund_amount`、`occurred_on`。
- 高风险操作先用只读预览响应返回 `before_balance`、`after_balance`、`warnings`、`expected_version`；真实提交再次由服务器验证，防过期核对。
- 成功：返回 `transaction_id`、相关账户最新状态与 `operation_id`；结果未知按 ID 查询，禁止产生第二次不同提交。

### 训练逐组保存

- 输入：实际 `weight` / `repetitions` / `duration_seconds` 等动作有效字段、`completed`、`expected_version`。
- 成功：返回 `saved_version`、`saved_at`；UI 才能显示“已保存”。
- 409：返回允许展示的服务器当前值与版本，客户端保留本地 dirty 输入供用户对照。

### 采购差异应用

- 预览：输入 `meal_plan_revision`、`shopping_list_version`，返回变更项（新增/减少/不可比/已购保护/手工保护）及稳定 `diff_hash`。
- 应用：提交原 `diff_hash`、`expected_versions`、用户明确的取舍决议、`Idempotency-Key`。
- 如果菜单、已购、手改状态变化，则返回 409 提示重新核对；不能静默应用过时计算。

## 5. 防止「超时误判」的状态图

1. 用户完成提交核对 → 前端生成或持有一个稳定 `idempotency_key`。
2. 发送 POST：
   - 200/201 => 已成功，显示真实结果；
   - 校验/冲突 => 显示可修正信息；
   - 网络超时 => UI 标为 `UNKNOWN`，不再发新的相同业务 POST。
3. 用同一 `operation_id` 或同一幂等请求标识查询服务器结果。
4. 查到 SUCCESS => 展示原交易；查到明确 FAILED => 在明示确认后重新发起新的操作（若使用原 key 重试必须保证服务端的语义一致）；仍 UNKNOWN => 保持提示且允许用户稍后查询。
5. 前端刷新或浏览器重启之后，用户仍应能够根据受保护的操作记录追溯提交结果。

## 6. 合同测试入口

- P0 财务规则：`FIN-POL-01..09`；结果未知：`PW-P0-EX01`、`PW-ERR-04`。
- P0 训练：`PW-P0-EX04..05`，以及 DRR 训练保存/恢复场景。
- P0 采购：`DIET-POL-01..07` 和 `PW-P0-EX06..07`。
- P0 隐私：`PRIV-POL-*` 与 `PW-P0-EX08`。
- P0 来源：`PW-P0-EX09` 与 `PW-ERR-07`。

正式 API 命名、鉴权细节、OpenAPI Schema 和接口测试应在 S1 技术决定签收后完成；本稿不属于已发布 API。

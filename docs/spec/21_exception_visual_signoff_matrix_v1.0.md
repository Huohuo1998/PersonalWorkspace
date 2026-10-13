# Personal Workspace｜异常全状态设计审核登记表 V1.0

> 日期：2026-10-12  
> **用途：** 按 16 个业务状态 × 桌面/手机建立**候选视觉稿**与验收用例对应关系。  
> **不构成：** 用户已签收、软件实现、真实接口测试。  
> **基线：** `01_visual_ux_baseline_v2.1.md`；`12_approved_product_policy_baseline_v1.0.md`。

## 1. 状态说明

- `候选稿已生成`：存在 SVG 与 PNG，且有设计语义说明。
- `待业务核对`：设计示例的事实和转移条件需要在评审中复核。
- `待设备核对`：实际屏幕尺寸、输入法和可访问性等尚未验证。
- `待签收`：尚未收到明确的最终视觉批准。
- `软件未测`：网站未开发，不能填写功能通过。

## 2. 全状态对应表

| 屏幕 | 业务状态 | 政策/验收用例 | 桌面稿 | 手机稿 | 业务核对 | 最终设计签收 |
|---|---|---|---|---|---|---|
| `FIN_F01` | 转账提交前核对 | `FIN-UX-D02` / `PW-F03` | `FIN_F01_desktop.svg/png` | `FIN_F01_mobile.svg/png` | 待复核 | 待签收 |
| `FIN_F02` | 提交中禁止重复 | `PW-P0-EX01` / `PW-P0-EX01` | `FIN_F02_desktop.svg/png` | `FIN_F02_mobile.svg/png` | 待复核 | 待签收 |
| `FIN_F03` | 提交结果未知 | `PW-P0-EX01` / `PW-P0-EX01` | `FIN_F03_desktop.svg/png` | `FIN_F03_mobile.svg/png` | 待复核 | 待签收 |
| `FIN_F04` | 核对原提交成功 | `PW-P0-EX01` / `PW-P0-EX01` | `FIN_F04_desktop.svg/png` | `FIN_F04_mobile.svg/png` | 待复核 | 待签收 |
| `FIN_F05` | 余额校正数据过期 | `PW-P0-EX03` / `PW-P0-EX03` | `FIN_F05_desktop.svg/png` | `FIN_F05_mobile.svg/png` | 待复核 | 待签收 |
| `FIN_F06` | 退款额度被占用 | `POL-FIN-03` / `PW-P0-EX02` | `FIN_F06_desktop.svg/png` | `FIN_F06_mobile.svg/png` | 待复核 | 待签收 |
| `FIT_R01` | 训练自动保存失败 | `FIT-UX-D02` / `PW-P0-EX05` | `FIT_R01_desktop.svg/png` | `FIT_R01_mobile.svg/png` | 待复核 | 待签收 |
| `FIT_R02` | 未结束会话恢复 | `FIT-UX-D03` / `PW-T07` | `FIT_R02_desktop.svg/png` | `FIT_R02_mobile.svg/png` | 待复核 | 待签收 |
| `FIT_R03` | 跨设备版本冲突 | `PW-P0-EX04` / `PW-P0-EX04` | `FIT_R03_desktop.svg/png` | `FIT_R03_mobile.svg/png` | 待复核 | 待签收 |
| `FIT_R04` | 保存失败阻断结束 | `PW-P0-EX05` / `PW-P0-EX05` | `FIT_R04_desktop.svg/png` | `FIT_R04_mobile.svg/png` | 待复核 | 待签收 |
| `FIT_R05` | 实际训练结束确认 | `FIT-UX-D03` / `PW-T08` | `FIT_R05_desktop.svg/png` | `FIT_R05_mobile.svg/png` | 待复核 | 待签收 |
| `DIET_D01` | 人工改量保护 | `POL-DIET-02` / `DIET-POL-06` | `DIET_D01_desktop.svg/png` | `DIET_D01_mobile.svg/png` | 待复核 | 待签收 |
| `DIET_D02` | 计划需求减少 | `POL-DIET-02` / `DIET-POL-05` | `DIET_D02_desktop.svg/png` | `DIET_D02_mobile.svg/png` | 待复核 | 待签收 |
| `DIET_D03` | 单位不可兼容 | `POL-DIET-01` / `DIET-POL-02` | `DIET_D03_desktop.svg/png` | `DIET_D03_mobile.svg/png` | 待复核 | 待签收 |
| `DIET_D04` | 多轮增量补购 | `POL-DIET-02` / `DIET-POL-07` | `DIET_D04_desktop.svg/png` | `DIET_D04_mobile.svg/png` | 待复核 | 待签收 |
| `DIET_D05` | 相同差异重复应用 | `POL-DIET-02` / `DIET-POL-07` | `DIET_D05_desktop.svg/png` | `DIET_D05_mobile.svg/png` | 待复核 | 待签收 |

## 3. 评审动作与关闭证据

| 主题 | 核心操作路径/检查点 | 验收关联 | 签收应留下的证据 |
|---|---|---|---|
| 财务结果未知 | 核对 → 发送 → 超时未知 → 查询原标识 → 真实结果；未得结论时不重建 | PW-P0-EX01 | 用户确认未知态文案、两个设备的操作出口、原请求关联 |
| 财务余额变化 | 输入核实余额 → 新交易发生 → 差额变化 → 重新核对 | PW-P0-EX03 | 用户确认旧摘要失效和新差额必须二次核对 |
| 财务退款超额 | 原剩额变化 → 金额超过限额 → 返回修改/刷新额度 | PW-P0-EX02 | 用户确认不提交超额退款且保留原交易关联 |
| 训练保存失败 | 本地更改 → 保存失败 → 保留输入 → 重试 → 成功后可结束 | PW-P0-EX05 | 未保存与已保存的具体标识及禁止结束出口 |
| 多设备冲突 | 服务端版本 A，本机草稿 B → 冲突 → 用户明确核对 | PW-P0-EX04 | 两份数据并列、失败/恢复路径与不自动覆盖 |
| 训练恢复 | 重新进入 → 检出已有未结束训练 → 恢复/中止 | PW-T07 / FIT-UX-D03 | 用户确认不创建第二会话 |
| 采购人工调整 | 已购 1 + 人工未购 2，新需求 4 → 核对剩余 1 | DIET-POL-06 | 原人工数量不覆盖、建议数量明确确认 |
| 采购需求减少 | 已购 4，新需求 2 → 展示超出 2，不产生 -2 | DIET-POL-05 | 不删已购记录、不伪造退款 |
| 不兼容单位 | 2 个番茄 + 200g + 1袋未知净量 | DIET-POL-02/03 | 独立保留、明确不自动换算 |
| 多轮补购 | P=2 U=2 N=5 → 增加1；同版本重复 → 再增0 | DIET-POL-07 | 补购 1 正确、重复应用幂等的产品结果 |

**状态：以上所有视觉候选稿全部等待用户正式签收；全部软件未测。**

## 4. 暂未完成的端侧设计核查

- 320px / 360px / 430px 横向尺寸与文本溢出。
- 200% 文字放大与系统缩放。
- 软键盘弹出时，主按钮、训练组输入、风险提示的安全区域。
- 交互焦点、键盘导航、读屏语义和错误文字宣布。
- 低端移动设备和长列表时的滚动定位（属于后续设计/测试验证）。

## 5. 对现有 118 项用例清单的影响

本轮**未增加新的业务需求，也未创建新的用例编号**。在 118 项既有用例中增加视觉证据引用；`08_unified_acceptance_register_v1.1.md` 的数量仍为 **92 P0 + 26 P1**，状态仍为未执行。

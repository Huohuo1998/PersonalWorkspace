# Personal Workspace｜新政策关键屏幕审阅索引 V1.0

> 本文件用于设计交接，不是软件测试报告。所有屏幕为使用虚构数据的**静态设计候选稿**，不是一个已经实现的应用。

## 候选图清单与审核状态

| 屏幕号 | 桌面 PNG | 手机 PNG | 矢量源 | 政策 | 设计签收 |
|---|---|---|---|---|---|
| FIN-S01 | `design_assets/policy_states_v1.1/FIN_S01_negative_desktop.png` | `design_assets/policy_states_v1.1/FIN_S01_negative_mobile.png` | 同名 `.svg` | POL-FIN-01 | 待签收 |
| FIN-S02 | `design_assets/policy_states_v1.1/FIN_S02_credit_desktop.png` | `design_assets/policy_states_v1.1/FIN_S02_credit_mobile.png` | 同名 `.svg` | POL-FIN-02 | 待签收 |
| FIN-S03 | `design_assets/policy_states_v1.1/FIN_S03_refund_desktop.png` | `design_assets/policy_states_v1.1/FIN_S03_refund_mobile.png` | 同名 `.svg` | POL-FIN-03 | 待签收 |
| DIET-S02 | `design_assets/policy_states_v1.1/DIET_S02_delta_desktop.png` | `design_assets/policy_states_v1.1/DIET_S02_delta_mobile.png` | 同名 `.svg` | POL-DIET-01/02 | 待签收 |
| PRIV-S01/S02 | `design_assets/policy_states_v1.1/PRIV_S01_mask_desktop.png` | `design_assets/policy_states_v1.1/PRIV_S01_mask_mobile.png` | 同名 `.svg` | POL-PRIV-01 | 待签收 |

## 用例映射

| 政策 | 对应 Case IDs | 视觉候选资产 | 完整性等级 |
|---|---|---|---|
| POL-FIN-01 | FIN-POL-01～03 | FIN-S01 双端图 | 核心核对态覆盖；历史/校正未出独立稿 |
| POL-FIN-02 | FIN-POL-04～06 | FIN-S02 双端图 | 核心核对态覆盖；消费后抵扣未出独立稿 |
| POL-FIN-03 | FIN-POL-07～09 | FIN-S03 双端图 | 核心核对态覆盖；跨月/多次退款未出独立稿 |
| POL-DIET-01 | DIET-POL-01～03 | DIET-S02 单位不兼容提示 | 局部覆盖；兼容换算屏未出独立稿 |
| POL-DIET-02 | DIET-POL-04～07 | DIET-S02 双端图 | 代表性多轮补购态覆盖；减量/手改待补 |
| POL-PRIV-01 | PRIV-POL-01～04 | PRIV-S01/S02 双端图 | 摘要/主动训练编辑局部覆盖；全站隐私待逐屏 |

## 签收栏位（预留）

- 评审负责人：**待填写**
- 评审日期：**待填写**
- 结论：**待签收 / 有条件接受 / 退回修改 / 通过**（尚无真实结论）
- 设备及字号复核：**待完成**
- 与原始 PRD/UX 的逐条核验：**待获得原件或批准的替代基线**

请不要通过生成本索引自动将现有 `16_approved_policy_traceability_v1.0.md` 的“设计签收”字段改为已通过。

预览总览：`design_assets/policy_states_v1.1/policy_contact_sheet.png`（供快速比对十张候选屏幕，文字请查看原尺寸 SVG/PNG）。

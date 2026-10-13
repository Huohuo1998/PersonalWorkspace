# Personal Workspace｜关键异常全状态双端高保真设计 V1.1

> **日期：** 2026-10-12  
> **状态：** 新增可离线审阅的静态设计候选稿；**尚未由用户正式签收**  
> **生效产品/UX 基线：** `12_approved_product_policy_baseline_v1.0.md`、`01_visual_ux_baseline_v2.1.md`、`02_critical_flows_and_edge_cases_v1.1.md`。  
> **边界：** 没有进行网站开发、数据库/API 设计或软件功能测试。本文的请求编号、版本与示例金额均为**设计演示值**。

## 1. 本轮范围与交付数量

- 财务 6 组：提交前核对、提交中、结果未知、核对原请求成功、余额校正版本过期、退款剩余额度变化。
- 运动 5 组：逐组保存失败、恢复旧会话、多设备冲突、结束阻断、基于实际完成的结束确认。
- 饮食采购 5 组：人工改量、需求减少、不可兼容单位、多轮补购、相同差异重复应用。
- **合计 16 组业务状态，32 张 PNG + 32 份 SVG**，分别提供 1350×840 桌面稿和 390×844 手机稿；另有状态清单 `manifest.json`、手机预览总览 `mobile_contact_sheet.png`。
- 设计文件位置：`design_assets/exception_full_states_v1.1/`。SVG 仅用于设计表达与矢量编辑，不是网站代码，也不是 Figma 原生组件文件。

## 2. 信息与保存语义

**已确认产品政策不发生变化：**

1. 任一财务高风险提交的结果只有在可信服务端结果可得时，才呈现真实成功或失败。网络中断返回的是**未知**，必须核对原提交而不是重建同一笔交易。
2. 财务核对数据一旦因并发操作过期，旧确认立即失效；核对最新账户余额、剩余额度后需由用户重新确认。
3. 训练的本地草稿、保存中、保存失败与已确认保存属于不同数据可信状态。结束训练必须在已确认同步的实际组数上完成。
4. 同一用户最多一条活动或暂停的详细训练。多端冲突时保留差异，不能将某端未保存输入自动覆盖到另一端。
5. 采购清单是独立快照，`P=已购`、`U=既有未购`、`N=新理论需求`；在同食材、同兼容单位且数量可信的前提下，补购建议一般为 `max(0, N-P-U)`；人工调整和已购事实需额外保护。
6. 用餐计划不等于实际用餐；采购勾选不等于实际支出；设计视图不能暗示产生了任何交易、训练会话或真实记录。

## 3. 全流程屏幕流转规范

### 3.1 财务提交与状态核验

`FIN_F01 核对` → `FIN_F02 处理中` → 可信成功 `FIN_F04`；或中断 / 超时 `FIN_F03 未知` → **核对原提交** → 查询到成功时才展示 `FIN_F04`，查询到确定失败时允许原请求失败恢复路径。查无可信结论时停留未知态，不开放“再提交一笔”。

独立并发分支：余额校正核对期间发现新账 `FIN_F05` → 重新加载余额、重新计算校正差额、再次确认；退款可退额度变化 `FIN_F06` → 返回改金额或核对最新额度，不能提交超过额度的旧退款。

**必须附带的财务核对信息：** 操作类型、金额、日期、两侧账户或原交易、预计余额影响、交易身份或可核对的原请求线索。超时应保留用户原本操作上下文，不因页面关闭失去核对入口。

### 3.2 训练保存与恢复

`训练编辑 dirty` → `保存中 saving` → `保存成功 saved`，失败时进入 `FIT_R01`；本机草稿可保留并提示重试。失败/冲突还不能直接结束（`FIT_R04`）。

用户重返运动页面且存在活动或暂停会话时，`FIT_R02` 优先显示已持久化的会话与最新真实确认时间，不创建新会话。跨端版本不一致触发 `FIT_R03`，显示**服务器版本 vs 本机草稿**；任何选择必须明确对未保存数据的影响。所有数据已确认后才能进入 `FIT_R05`，实际完成与计划未完成分列，最终完成/中止由用户确认。

### 3.3 采购快照与差异

`菜单变化` → `新需求 N` → `比较当前 P/U/人工编辑` → `差异核对` → `用户确认修改当前清单`。存在人工数量时显示 `DIET_D01`；新需求降低，显示 `DIET_D02`，不产生负数采购；单位无法可靠换算显示 `DIET_D03`，禁止强行合并；前轮已购2、待购2、新需求5时显示 `DIET_D04`，**仅新补购1**；对已确认的同一轮菜单版本再次进入时显示 `DIET_D05`，不会再生成同一补购项。

## 4. 双端布局与视觉约束

| 要素 | 桌面稿 | 手机稿 |
|---|---|---|
| 基本结构 | 左侧全站一级导航 + 主内容区；业务事实、影响分栏 | 顶部身份及模块区 + 业务状态单列 + 底部五入口 |
| 核对信息 | 事实与风险提示同时可见，返回/确认并列 | 单列明确阅读次序；主操作在页面底部导航上方留出安全间隔 |
| 危险/警告 | 状态色结合“文字标题+具体处理指引”，不依赖颜色 | 保证按钮不遮挡提示与操作内容；小屏可滚动 |
| 训练 | 将本机草稿与服务器已保存版本并列/对比 | 高优先级显示当前训练、保存与恢复阻断，不把复杂历史压成表格 |
| 采购 | 需求数据 P/U/N 和影响一起展示 | 数量差异按从上到下阅读，已购与补购区别明确 |
| 本轮静态画布 | 1350×840 | 390×844 |

**可访问性状态：** 本轮只作静态视觉首检；**320px、360px、430px、字体放大 200%、键盘焦点、屏幕阅读器及软键盘遮挡**均未进行实际产品验收，不能标为通过。

## 5. 独立状态稿与政策/用例索引

| 屏幕号 | 核心状态 | 桌面 PNG | 手机 PNG | 关联规范/用例 | 评审结果 |
|---|---|---|---|---|---|
| `FIN_F01` | 转账提交前核对 | [FIN_F01 桌面](design_assets/exception_full_states_v1.1/FIN_F01_desktop.png) | [FIN_F01 手机](design_assets/exception_full_states_v1.1/FIN_F01_mobile.png) | `FIN-UX-D02` · `PW-F03` | 待用户设计签收 |
| `FIN_F02` | 提交中禁止重复 | [FIN_F02 桌面](design_assets/exception_full_states_v1.1/FIN_F02_desktop.png) | [FIN_F02 手机](design_assets/exception_full_states_v1.1/FIN_F02_mobile.png) | `PW-P0-EX01` · `PW-P0-EX01` | 待用户设计签收 |
| `FIN_F03` | 提交结果未知 | [FIN_F03 桌面](design_assets/exception_full_states_v1.1/FIN_F03_desktop.png) | [FIN_F03 手机](design_assets/exception_full_states_v1.1/FIN_F03_mobile.png) | `PW-P0-EX01` · `PW-P0-EX01` | 待用户设计签收 |
| `FIN_F04` | 核对原提交成功 | [FIN_F04 桌面](design_assets/exception_full_states_v1.1/FIN_F04_desktop.png) | [FIN_F04 手机](design_assets/exception_full_states_v1.1/FIN_F04_mobile.png) | `PW-P0-EX01` · `PW-P0-EX01` | 待用户设计签收 |
| `FIN_F05` | 余额校正数据过期 | [FIN_F05 桌面](design_assets/exception_full_states_v1.1/FIN_F05_desktop.png) | [FIN_F05 手机](design_assets/exception_full_states_v1.1/FIN_F05_mobile.png) | `PW-P0-EX03` · `PW-P0-EX03` | 待用户设计签收 |
| `FIN_F06` | 退款额度被占用 | [FIN_F06 桌面](design_assets/exception_full_states_v1.1/FIN_F06_desktop.png) | [FIN_F06 手机](design_assets/exception_full_states_v1.1/FIN_F06_mobile.png) | `POL-FIN-03` · `PW-P0-EX02` | 待用户设计签收 |
| `FIT_R01` | 训练自动保存失败 | [FIT_R01 桌面](design_assets/exception_full_states_v1.1/FIT_R01_desktop.png) | [FIT_R01 手机](design_assets/exception_full_states_v1.1/FIT_R01_mobile.png) | `FIT-UX-D02` · `PW-P0-EX05` | 待用户设计签收 |
| `FIT_R02` | 未结束会话恢复 | [FIT_R02 桌面](design_assets/exception_full_states_v1.1/FIT_R02_desktop.png) | [FIT_R02 手机](design_assets/exception_full_states_v1.1/FIT_R02_mobile.png) | `FIT-UX-D03` · `PW-T07` | 待用户设计签收 |
| `FIT_R03` | 跨设备版本冲突 | [FIT_R03 桌面](design_assets/exception_full_states_v1.1/FIT_R03_desktop.png) | [FIT_R03 手机](design_assets/exception_full_states_v1.1/FIT_R03_mobile.png) | `PW-P0-EX04` · `PW-P0-EX04` | 待用户设计签收 |
| `FIT_R04` | 保存失败阻断结束 | [FIT_R04 桌面](design_assets/exception_full_states_v1.1/FIT_R04_desktop.png) | [FIT_R04 手机](design_assets/exception_full_states_v1.1/FIT_R04_mobile.png) | `PW-P0-EX05` · `PW-P0-EX05` | 待用户设计签收 |
| `FIT_R05` | 实际训练结束确认 | [FIT_R05 桌面](design_assets/exception_full_states_v1.1/FIT_R05_desktop.png) | [FIT_R05 手机](design_assets/exception_full_states_v1.1/FIT_R05_mobile.png) | `FIT-UX-D03` · `PW-T08` | 待用户设计签收 |
| `DIET_D01` | 人工改量保护 | [DIET_D01 桌面](design_assets/exception_full_states_v1.1/DIET_D01_desktop.png) | [DIET_D01 手机](design_assets/exception_full_states_v1.1/DIET_D01_mobile.png) | `POL-DIET-02` · `DIET-POL-06` | 待用户设计签收 |
| `DIET_D02` | 计划需求减少 | [DIET_D02 桌面](design_assets/exception_full_states_v1.1/DIET_D02_desktop.png) | [DIET_D02 手机](design_assets/exception_full_states_v1.1/DIET_D02_mobile.png) | `POL-DIET-02` · `DIET-POL-05` | 待用户设计签收 |
| `DIET_D03` | 单位不可兼容 | [DIET_D03 桌面](design_assets/exception_full_states_v1.1/DIET_D03_desktop.png) | [DIET_D03 手机](design_assets/exception_full_states_v1.1/DIET_D03_mobile.png) | `POL-DIET-01` · `DIET-POL-02` | 待用户设计签收 |
| `DIET_D04` | 多轮增量补购 | [DIET_D04 桌面](design_assets/exception_full_states_v1.1/DIET_D04_desktop.png) | [DIET_D04 手机](design_assets/exception_full_states_v1.1/DIET_D04_mobile.png) | `POL-DIET-02` · `DIET-POL-07` | 待用户设计签收 |
| `DIET_D05` | 相同差异重复应用 | [DIET_D05 桌面](design_assets/exception_full_states_v1.1/DIET_D05_desktop.png) | [DIET_D05 手机](design_assets/exception_full_states_v1.1/DIET_D05_mobile.png) | `POL-DIET-02` · `DIET-POL-07` | 待用户设计签收 |

## 6. 视觉审核清单（本轮核对及未通过声明）

| 检查维度 | 本轮证据 | 状态 |
|---|---|---|
| 依据已批准政策核对示例计算与文案 | 16 场景事实栏、影响栏、风险提示 | 初步静态自检完成，待产品复核 |
| 静态布局、文字与操作按钮是否超出画布 | 本轮 32 张原尺寸静态稿及总览图 | 原尺寸观察完成；窄屏/字号放大待查 |
| 危险状态与普通成功态差异 | 资金未知/冲突、训练失败、单位未知 | 已表达，待用户签收 |
| 多设备修改是否会静默覆盖 | FIT_R03 提示两端版本并给出核对方向 | 已表达，待交互全链审核 |
| 重复补购及重复资金提交 | FIN_F03/F04、DIET_D04/D05 | 已表达，待流程验收 |
| 设计稿内按钮点击、服务器状态、数据库持久化 | 纯 PNG/SVG，不含运行行为 | **未执行，不可认为已通过** |
| 118 项验收用例真实执行 | 仅在文档中引用部分用例 | **0 项软件测试** |
| 设计正式签收 | 审批栏仍为空/待签收 | **0 组正式签收** |

## 7. 本轮仍未关闭的 DRR 缺口

- **DRR-P0-03（财务）/P0-04（训练）/P0-05（采购）：** 已形成关键全状态静态候选稿，尚需按用例走完桌面/手机端设计审核及产品签收，不能直接关闭。
- **DRR-P0-01：** 原始 PRD / UX 全文及历史设计源稿仍未全部找回。
- **DRR-P0-02：** 118 项验收未完整获得条款→页面→逐项签收证据。
- **DRR-P0-06：** 隐私模式仍需全站组件级核对。
- **DRR-P0-07：** 采购→财务、菜单→用餐、日程→训练的跨域成功/取消/失败/来源失效流程仍缺完整最终视觉签收。
- **DRR-P0-08：** 六项产品政策已于 2026-10-12 正式批准，继续 CLOSED。

## 8. 下一阶段设计建议

**先进行这 16 组 × 2 设备的设计审核与修正签收**，优先核验 `FIN_F03` 的原请求核对、`FIT_R01/R03/R04` 的数据保护，以及 `DIET_D01/D03/D04/D05` 的人工修改与补购去重。随后执行全站隐私组件核查和跨模块返回路径的端到端视觉复核。**不启动网站开发。**

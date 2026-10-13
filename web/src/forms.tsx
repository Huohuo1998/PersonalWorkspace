import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Clock,
  Plus,
} from "lucide-react";
import { api, ApiError, errorText, key, dayAt, money } from "./api";
import { useWorkspace, type CreateAction } from "./context";
import { Modal, Loading, ErrorState, Sensitive } from "./components";
import type {
  Account,
  Recipe,
  Project,
  Entry,
  FinancePreview,
  Transaction,
  Task,
  ShoppingDiff,
} from "./types";

type Values = Record<string, string | boolean>;
type Field = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  options?: [string, string][];
  help?: string;
  min?: string;
  step?: string;
  max?: string;
};
function FieldInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: string | boolean;
  onChange: (v: string | boolean) => void;
}) {
  const f = field;
  return (
    <label className={f.type === "checkbox" ? "checkbox-field" : ""}>
      {f.type !== "checkbox" && f.label}
      {f.options ? (
        <select
          value={String(value)}
          required={f.required}
          onChange={(e) => onChange(e.target.value)}
        >
          {f.options.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      ) : f.type === "textarea" ? (
        <textarea
          value={String(value)}
          required={f.required}
          placeholder={f.placeholder}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
        />
      ) : f.type === "checkbox" ? (
        <>
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
          {f.label}
        </>
      ) : (
        <input
          type={f.type || "text"}
          value={String(value)}
          required={f.required}
          min={f.min}
          max={f.max}
          step={f.step}
          placeholder={f.placeholder}
          onChange={(e) => onChange(e.target.value)}
          maxLength={f.type === "text" || !f.type ? 400 : undefined}
        />
      )}{" "}
      {f.help && <small>{f.help}</small>}
    </label>
  );
}

const labels: Record<string, string> = {
  task: "任务",
  event: "事件",
  project: "项目",
  account: "账户",
  transaction: "记一笔",
  budget: "预算",
  goal: "储蓄目标",
  session: "开始详细训练",
  quick_activity: "自由运动",
  body: "身体与恢复",
  exercise: "动作",
  template: "训练模板",
  training_plan: "训练安排",
  recipe: "食谱",
  meal_plan: "菜单",
  meal_record: "实际用餐",
  shopping_item: "采购项",
};
function specs(
  kind: string,
  day: string,
  accounts: Account[],
  projects: Project[],
  recipes: Recipe[],
  templates: Entry[],
  values: Values,
): Field[] {
  const date = { name: "day", label: "实际日期", type: "date", required: true };
  const amount = {
    name: "amount",
    label: "金额",
    type: "number",
    required: true,
    min: "0.01",
    step: "0.01",
    max: "99999999999999.99",
  };
  const accountOptions: [string, string][] = [
    ["", "请选择账户"],
    ...accounts.map(
      (a) =>
        [
          a.id,
          a.name + " · " + (a.type === "CREDIT" ? "信用负债" : "资产"),
        ] as [string, string],
    ),
  ];
  switch (kind) {
    case "task":
      return [
        { name: "title", label: "任务标题", required: true },
        {
          name: "status",
          label: "执行状态",
          options: [
            ["TODO", "待办"],
            ["IN_PROGRESS", "进行中"],
            ["COMPLETED", "已完成"],
            ["CANCELLED", "已取消"],
          ],
        },
        { name: "inbox", label: "保留在收集箱", type: "checkbox" },
        {
          name: "scheduled_date",
          label: "计划执行日期（Scheduled）",
          type: "date",
        },
        { name: "scheduled_time", label: "计划执行时间", type: "time" },
        {
          name: "due_at",
          label: "截止日期（Due）",
          type: "date",
          help: "截止与执行日期独立，逾期不会自动改排期。",
        },
        {
          name: "project_id",
          label: "所属项目",
          options: [
            ["", "无项目"],
            ...projects
              .filter((p) => !p.archived)
              .map((p) => [p.id, p.name] as [string, string]),
          ],
        },
        {
          name: "priority",
          label: "优先级（可选）",
          options: [
            ["", "未设置"],
            ["LOW", "低"],
            ["NORMAL", "普通"],
            ["HIGH", "高"],
          ],
        },
        {
          name: "recurrence",
          label: "重复",
          options: [
            ["", "不重复"],
            ["DAILY", "每日"],
            ["WEEKLY", "每周"],
          ],
          help: "按每日或每周滚动生成实例。单次编辑不修改模板；历史保留。",
        },
        { name: "notes", label: "备注", type: "textarea" },
      ];
    case "event":
      return [
        { name: "title", label: "事件标题", required: true },
        {
          name: "start_at",
          label: "开始时间",
          type: "datetime-local",
          required: true,
          help: "按浏览器本地时区录入；保存为带时区的时间。",
        },
        {
          name: "end_at",
          label: "结束时间",
          type: "datetime-local",
          required: true,
        },
        { name: "all_day", label: "全天事件", type: "checkbox" },
        { name: "notes", label: "备注", type: "textarea" },
      ];
    case "project":
      return [{ name: "name", label: "项目名称", required: true }];
    case "account":
      return [
        { name: "name", label: "账户名称", required: true },
        {
          name: "type",
          label: "账户性质",
          options: [
            ["ASSET", "资产 · 银行 / 现金 / 电子钱包"],
            ["CREDIT", "负债 · 信用卡"],
          ],
        },
        {
          name: "opening_balance",
          label: "真实期初余额",
          type: "number",
          step: "0.01",
          required: true,
          help: "信用账户正数代表欠款，负数代表溢缴。期初余额不计收入。",
        },
      ];
    case "transaction":
      return [
        {
          name: "type",
          label: "业务类型",
          options: [
            ["EXPENSE", "支出"],
            ["INCOME", "收入"],
            ["TRANSFER", "资产账户转账"],
            ["REPAYMENT", "信用卡还款"],
            ["REFUND", "退款"],
            ["ADJUSTMENT", "余额校正"],
            ["CREDIT_WITHDRAWAL", "溢缴款转出"],
          ],
        },
        {
          name: "account_id",
          label: values.type === "REFUND" ? "本次实际到账账户" : "操作账户",
          options: accountOptions,
          required: true,
        },
        ...(["TRANSFER", "REPAYMENT", "CREDIT_WITHDRAWAL"].includes(
          String(values.type),
        )
          ? [
              {
                name: "destination_id",
                label: "实际到账账户",
                options: accountOptions,
                required: true,
              },
            ]
          : []),
        ...(values.type === "REFUND"
          ? [
              {
                name: "original_id",
                label: "原消费 ID",
                required: true,
                help: "从交易详情发起退款会自动关联原消费。",
              },
            ]
          : []),
        amount,
        {
          name: "occurred_on",
          label: "真实发生日期",
          type: "date",
          required: true,
        },
        { name: "category", label: "分类", required: true },
        {
          name: "description",
          label: values.type === "ADJUSTMENT" ? "校正原因" : "说明",
          required: values.type === "ADJUSTMENT",
        },
        ...(values.type === "ADJUSTMENT"
          ? [
              {
                name: "adjustment_direction",
                label: "账面调整方向",
                options: [
                  ["INCREASE", "增加账面余额"],
                  ["DECREASE", "减少账面余额"],
                ] as [string, string][],
              },
            ]
          : []),
      ];
    case "budget":
      return [
        { name: "month", label: "预算月份", type: "month", required: true },
        {
          name: "category",
          label: "分类",
          required: true,
          help: "「总预算」是总额，分类不会再叠加到总额。",
        },
        {
          ...amount,
          min: "0",
          help: "零元预算也是有效配置，预算额度不是账户现金。",
        },
      ];
    case "goal":
      return [
        { name: "name", label: "目标名称", required: true },
        {
          name: "account_id",
          label: "专用资产账户",
          required: true,
          options: [
            ["", "选择专用账户"],
            ...accounts
              .filter((a) => a.type === "ASSET")
              .map((a) => [a.id, a.name] as [string, string]),
          ],
        },
        { ...amount, name: "target_amount", label: "目标金额" },
      ];
    case "session":
      return [
        { name: "name", label: "训练名称", required: true },
        {
          name: "template_id",
          label: "使用模板（可选）",
          options: [
            ["", "自由训练"],
            ...templates.map(
              (t) => [t.id, t.data.name || "模板"] as [string, string],
            ),
          ],
        },
      ];
    case "quick_activity":
      return [
        {
          name: "name",
          label: "运动名称",
          required: true,
          placeholder: "例如：散步、跑步",
        },
        date,
        {
          name: "minutes",
          label: "实际时长（分钟）",
          type: "number",
          required: true,
          min: "1",
          max: "1440",
          step: "1",
        },
        { name: "notes", label: "备注", type: "textarea" },
      ];
    case "body":
      return [
        date,
        {
          name: "weight",
          label: "体重（kg，可选）",
          type: "number",
          min: "0.01",
          max: "500",
          step: "0.01",
        },
        {
          name: "waist",
          label: "腰围（cm，可选）",
          type: "number",
          min: "0.01",
          max: "400",
          step: "0.01",
        },
        {
          name: "recovery",
          label: "恢复反馈（可选）",
          type: "textarea",
          placeholder: "记录感受，不必评分",
        },
      ];
    case "exercise":
      return [
        { name: "name", label: "动作名称", required: true },
        { name: "equipment", label: "器械" },
        { name: "instructions", label: "动作说明", type: "textarea" },
      ];
    case "template":
      return [
        { name: "name", label: "模板名称", required: true },
        {
          name: "exercises",
          label: "动作名称（每行一个）",
          type: "textarea",
          required: true,
        },
        {
          name: "sets",
          label: "每个动作计划组数",
          type: "number",
          min: "1",
          max: "20",
          step: "1",
          required: true,
        },
      ];
    case "training_plan":
      return [
        { name: "name", label: "训练安排名称", required: true },
        { ...date, label: "计划日期" },
        {
          name: "template_id",
          label: "训练模板",
          options: [
            ["", "自由训练"],
            ...templates.map(
              (t) => [t.id, t.data.name || "模板"] as [string, string],
            ),
          ],
        },
        { name: "notes", label: "说明", type: "textarea" },
      ];
    case "recipe":
      return [
        { name: "name", label: "食谱名称", required: true },
        {
          name: "minutes",
          label: "制作时间（分钟）",
          type: "number",
          required: true,
          min: "1",
          max: "1440",
          step: "1",
        },
        {
          name: "servings",
          label: "食谱份数",
          type: "number",
          min: "0.01",
          max: "100",
          step: "0.01",
          required: true,
        },
        {
          name: "ingredients_text",
          label: "结构化配料",
          type: "textarea",
          help: "每行：食材 | 数量 | 单位 | 规格。未知量写 ?；件数必须注明规格，例如「鸡蛋 | 2 | 个 | 普通鸡蛋」。",
          placeholder: "番茄 | 300 | g |\n鸡蛋 | 2 | 个 | 普通鸡蛋",
        },
        { name: "steps", label: "制作步骤", type: "textarea", required: true },
        { name: "tags", label: "标签" },
        {
          name: "allergen_note",
          label: "过敏信息",
          type: "textarea",
          help: "只描述已知信息，不声明未知配料安全。",
        },
        {
          name: "illustration",
          label: "封面插画",
          options: [
            ["vegetable", "蔬菜"],
            ["egg", "鸡蛋"],
            ["rice", "米饭"],
            ["soup", "汤粥"],
          ],
        },
      ];
    case "meal_plan":
      return [
        { ...date, label: "计划日期" },
        {
          name: "slot",
          label: "餐次",
          options: [
            ["BREAKFAST", "早餐"],
            ["LUNCH", "午餐"],
            ["DINNER", "晚餐"],
          ],
        },
        {
          name: "recipe_id",
          label: "食谱（可选）",
          options: [
            ["", "自由文本"],
            ...recipes.map((r) => [r.id, r.name] as [string, string]),
          ],
        },
        { name: "description", label: "菜单内容（自由文本）" },
        {
          name: "servings",
          label: "计划份数",
          type: "number",
          min: "0.01",
          max: "100",
          step: "0.01",
          required: true,
        },
      ];
    case "meal_record":
      return [
        date,
        {
          name: "slot",
          label: "餐次",
          options: [
            ["BREAKFAST", "早餐"],
            ["LUNCH", "午餐"],
            ["DINNER", "晚餐"],
            ["SNACK", "加餐"],
          ],
        },
        { name: "description", label: "实际吃了什么", required: true },
        {
          name: "source",
          label: "真实用餐来源",
          options: [
            ["HOME_COOKED", "自炊"],
            ["EATING_OUT", "外食"],
            ["TAKEAWAY", "外卖"],
            ["OTHER", "其他"],
          ],
        },
        { name: "notes", label: "备注", type: "textarea" },
      ];
    case "shopping_item":
      return [
        { name: "ingredient", label: "食材名称", required: true },
        { name: "specification", label: "规格" },
        { name: "unit", label: "单位", required: true },
        {
          name: "pending",
          label: "待购数量",
          type: "number",
          required: true,
          min: "0.001",
          step: "0.001",
        },
      ];
    default:
      return [];
  }
}

function initialValues(action: CreateAction, day: string): Values {
  const v: Values = {
    title: "",
    name: "",
    notes: "",
    status: "TODO",
    inbox: true,
    priority: "",
    scheduled_date: "",
    scheduled_time: "",
    due_at: "",
    project_id: "",
    recurrence: "",
    type: action.kind === "account" ? "ASSET" : "EXPENSE",
    opening_balance: "0",
    account_id: "",
    destination_id: "",
    original_id: "",
    amount: "",
    occurred_on: day,
    category: action.kind === "budget" ? "总预算" : "其他",
    description: "",
    adjustment_direction: "INCREASE",
    month: day.slice(0, 7),
    target_amount: "",
    template_id: "",
    day,
    minutes: "",
    weight: "",
    waist: "",
    recovery: "",
    equipment: "徒手",
    instructions: "",
    exercises: "",
    sets: "3",
    servings: "1",
    ingredients_text: "",
    steps: "",
    tags: "",
    allergen_note: "过敏信息未确认，请核对全部配料",
    illustration: "vegetable",
    slot: "LUNCH",
    recipe_id: "",
    source: "HOME_COOKED",
    ingredient: "",
    specification: "",
    unit: "个",
    pending: "1",
    start_at: day + "T09:00",
    end_at: day + "T10:00",
    all_day: false,
  };
  for (const [name, value] of Object.entries(action.initial || {}))
    if (
      typeof value === "boolean" ||
      typeof value === "string" ||
      typeof value === "number"
    )
      v[name] = typeof value === "number" ? String(value) : value;
  if (action.kind === "template" && Array.isArray(action.initial?.exercises))
    v.exercises = (action.initial.exercises as string[]).join("\n");
  if (action.kind === "recipe" && Array.isArray(action.initial?.ingredients))
    v.ingredients_text = (action.initial.ingredients as Recipe["ingredients"])
      .map((i) =>
        [i.ingredient, i.quantity || "?", i.unit, i.specification].join(" | "),
      )
      .join("\n");
  if (action.kind === "event" && action.id) {
    for (const field of ["start_at", "end_at"]) {
      const d = new Date(String(action.initial?.[field]));
      v[field] = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    }
  }
  if (action.kind === "session" && !action.initial?.name)
    v.name = "自由力量训练";
  return v;
}

export function CreateDialog({
  action,
  onClose,
}: {
  action: CreateAction;
  onClose: () => void;
}) {
  const { user, refresh, notify, open } = useWorkspace();
  const navigate = useNavigate();
  const [values, setValues] = useState<Values>(() =>
    initialValues(action, dayAt(user.timezone)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<FinancePreview | null>(null);
  const [warningsAccepted, setWarningsAccepted] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [opKey] = useState(key);
  const options = useQuery({
    queryKey: ["form-options"],
    queryFn: () =>
      Promise.all([
        api<Account[]>("/finance/accounts"),
        api<Project[]>("/projects"),
        api<Recipe[]>("/diet/recipes"),
        api<Entry[]>("/fitness/entries/template"),
      ]),
  });
  const [accounts = [], projects = [], recipes = [], templates = []] =
    options.data || [];
  const update = (name: string, value: string | boolean) => {
    setValues((v) => ({ ...v, [name]: value }));
    setPreview(null);
    setError("");
    setWarningsAccepted(false);
  };
  const saveSucceeded = async () => {
    sessionStorage.removeItem("pw-pending-" + user.id);
    await refresh();
    notify("已确认保存");
    if (action.kind === "session") navigate("/fitness?view=workout");
    onClose();
    if (action.next) open(action.next);
  };
  const queryUnknown = async () => {
    setBusy(true);
    try {
      const result = await api<{ status: string }>("/operations/" + opKey);
      if (result.status === "SUCCESS") await saveSucceeded();
      else setError("仍未查到已确认结果。请稍后查询原操作，勿重复提交。");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || unknown) return;
    setBusy(true);
    setError("");
    let path = "",
      method = "POST";
    let body: Record<string, unknown> = {};
    let highRisk = false;
    try {
      const fields = specs(
        action.kind,
        dayAt(user.timezone),
        accounts as Account[],
        projects as Project[],
        recipes as Recipe[],
        templates as Entry[],
        values,
      );
      for (const f of fields) body[f.name] = values[f.name];
      switch (action.kind) {
        case "task":
          for (const f of [
            "priority",
            "scheduled_date",
            "scheduled_time",
            "due_at",
            "project_id",
            "recurrence",
          ])
            body[f] = body[f] || null;
          if (action.id) {
            path = "/tasks/" + action.id;
            method = "PATCH";
            body.expected_version = action.version;
            delete body.recurrence;
          } else {
            path = "/tasks";
            if (action.sourceKind) {
              body.source_kind = action.sourceKind;
              body.source_id = action.sourceId;
            }
          }
          break;
        case "event":
          path = "/events" + (action.id ? "/" + action.id : "");
          if (action.id) {
            method = "PATCH";
            body.expected_version = action.version;
          }
          body.start_at = new Date(String(values.start_at)).toISOString();
          body.end_at = new Date(String(values.end_at)).toISOString();
          break;
        case "project":
          path = "/projects";
          break;
        case "account":
          path = "/finance/accounts";
          highRisk = true;
          break;
        case "transaction": {
          highRisk = true;
          path = "/finance/transactions";
          body.destination_id = body.destination_id || null;
          body.original_id = body.original_id || null;
          const expected: Record<string, number> = {};
          for (const a of accounts as Account[])
            if ([body.account_id, body.destination_id].includes(a.id))
              expected[a.id] = a.version;
          body.expected_versions = preview
            ? Object.fromEntries(
                preview.effects.map((e) => [e.account_id, e.version]),
              )
            : expected;
          body.confirmed_warnings = warningsAccepted;
          if (action.sourceKind) {
            body.source_kind = action.sourceKind;
            body.source_id = action.sourceId;
          }
          if (!preview) {
            setPreview(
              await api<FinancePreview>("/finance/preview", {
                method: "POST",
                body,
              }),
            );
            return;
          }
          if (preview.warnings.length && !warningsAccepted) {
            setError("请确认风险提示后再提交。");
            return;
          }
          break;
        }
        case "budget":
          path = "/finance/budgets";
          method = "PUT";
          if (action.version) body.expected_version = action.version;
          break;
        case "goal":
          path = "/finance/savings-goals" + (action.id ? "/" + action.id : "");
          if (action.id) {
            method = "PATCH";
            body.expected_version = action.version;
            delete body.account_id;
          }
          break;
        case "session":
          path = "/fitness/sessions";
          body.template_id = body.template_id || null;
          if (action.initial?.source_task_id)
            body.source_task_id = action.initial.source_task_id;
          highRisk = true;
          break;
        case "quick_activity":
        case "body":
        case "exercise":
        case "template":
        case "training_plan":
          path = "/fitness/entries/" + action.kind;
          for (const f of ["weight", "waist"])
            if (f in body) body[f] = body[f] || null;
          if (action.kind === "template") {
            body.exercises = String(values.exercises)
              .split("\n")
              .map((v) => v.trim())
              .filter(Boolean);
            body.sets = Number(values.sets);
          }
          if (action.kind === "training_plan")
            body.template_id = body.template_id || null;
          if ("minutes" in body) body.minutes = Number(body.minutes);
          if (action.id) {
            path += "/" + action.id + "?expected_version=" + action.version;
            method = "PUT";
          } else highRisk = true;
          break;
        case "recipe":
          path = "/diet/recipes" + (action.id ? "/" + action.id : "");
          if (action.id) {
            method = "PUT";
            body.expected_version = action.version;
          }
          delete body.ingredients_text;
          body.minutes = Number(values.minutes);
          body.ingredients = String(values.ingredients_text)
            .split("\n")
            .filter((v) => v.trim())
            .map((line) => {
              const [ingredient, quantity, unit, specification = ""] = line
                .split("|")
                .map((v) => v.trim());
              if (!ingredient || !unit || !quantity)
                throw new Error(
                  "配料格式：食材 | 数量 | 单位 | 规格；未知数量使用 ?",
                );
              return {
                ingredient,
                quantity: quantity === "?" ? null : quantity,
                unit,
                specification,
              };
            });
          break;
        case "meal_plan":
          path = "/diet/meal-plans";
          method = "PUT";
          body.recipe_id = body.recipe_id || null;
          if (action.version) body.expected_version = action.version;
          break;
        case "meal_record":
          path = "/diet/meal-records" + (action.id ? "/" + action.id : "");
          if (action.initial?.plan_id) body.plan_id = action.initial.plan_id;
          if (action.id) {
            method = "PUT";
            body.expected_version = action.version;
          } else highRisk = true;
          break;
        case "shopping_item":
          path = "/diet/shopping-lists/" + action.sourceId + "/items";
          break;
      }
      if (!path) throw new Error("该操作暂不可用");
      if (highRisk) sessionStorage.setItem("pw-pending-" + user.id, opKey);
      await api(path, { method, body, key: highRisk ? opKey : undefined });
      await saveSucceeded();
    } catch (e) {
      if (highRisk && (!(e instanceof ApiError) || e.status >= 500)) {
        setUnknown(true);
        setError("提交结果未知。请查询本次操作；不会再次发送创建请求。");
      } else {
        setError(errorText(e));
        if (highRisk) sessionStorage.removeItem("pw-pending-" + user.id);
        if (e instanceof ApiError && e.status === 409) {
          setPreview(null);
          await options.refetch();
        }
      }
    } finally {
      setBusy(false);
    }
  };
  if (action.kind === "source")
    return <SourceDialog action={action} onClose={onClose} />;
  if (action.kind === "transaction_detail")
    return <TransactionDialog action={action} onClose={onClose} />;
  if (action.kind === "recipe_detail")
    return (
      <RecipeDialog
        recipe={action.initial as unknown as Recipe}
        onClose={onClose}
      />
    );
  if (action.kind === "shopping_diff")
    return <ShoppingDiffDialog action={action} onClose={onClose} />;
  const needAccount =
    action.kind === "transaction" &&
    !options.isPending &&
    !(accounts as Account[]).length;
  const fields = specs(
    action.kind,
    dayAt(user.timezone),
    accounts as Account[],
    projects as Project[],
    recipes as Recipe[],
    templates as Entry[],
    values,
  );
  return (
    <Modal
      title={
        (action.id ? "编辑" : "新增") +
        " · " +
        (labels[action.kind] || action.kind)
      }
      onClose={onClose}
      full={!!action.id || action.kind === "recipe"}
    >
      {action.sourceKind && (
        <p className="alert info">
          来自{action.sourceKind === "shopping_list" ? "采购清单" : "领域计划"}{" "}
          · 来源 ID 已保留，保存后返回当前页面。
        </p>
      )}
      {options.isPending ? (
        <Loading />
      ) : options.isError ? (
        <ErrorState
          error={options.error}
          retry={() => void options.refetch()}
        />
      ) : needAccount ? (
        <>
          <p className="alert info">
            还没有真实账户。请先建立账户，再回来填写这笔交易。
          </p>
          <button
            className="primary"
            onClick={() =>
              open({
                kind: "account",
                initial: {},
                returnTo: action.returnTo,
                next: action,
              })
            }
          >
            新增账户
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          {["transaction", "body", "session"].includes(action.kind) &&
            user.privacy_masked && (
              <p className="alert info">
                当前编辑字段可见；全局隐私遮蔽仍保持开启。
              </p>
            )}
          {action.kind === "meal_record" && (
            <p className="alert info">
              计划仅作预填。请核对真实吃过的内容；保存才生成记录。
            </p>
          )}
          {action.kind === "task" && action.initial?.parent_id != null && (
            <p className="alert info">
              仅修改本次重复实例，不重写模板或其他历史。
            </p>
          )}
          {action.kind === "task" && action.initial?.source_kind != null && (
            <p className="alert info">
              完成本任务不会创建账单、训练或用餐事实。
            </p>
          )}
          {fields
            .filter((f) => !action.id || f.name !== "recurrence")
            .map((f) => (
              <FieldInput
                key={f.name}
                field={f}
                value={values[f.name] ?? ""}
                onChange={(v) => update(f.name, v)}
              />
            ))}
          {preview && (
            <div className="review-box">
              <h3>核对本次账务影响</h3>
              {preview.original_account_id && (
                <p>
                  原支付账户：
                  {(accounts as Account[]).find(
                    (a) => a.id === preview.original_account_id,
                  )?.name || preview.original_account_id}
                  。本次退款只调整实际到账账户。
                </p>
              )}
              {preview.effects.map((effect) => (
                <div className="review-effect" key={effect.account_id}>
                  <strong>
                    {effect.name} ·{" "}
                    {effect.type === "CREDIT" ? "净债务" : "资产余额"}
                  </strong>
                  <span>
                    {money(effect.before, user.currency)}{" "}
                    <ArrowRight size={14} />{" "}
                    {money(effect.after, user.currency)}
                  </span>
                </div>
              ))}
              <p className="muted">
                转账、还款、余额校正不计收入或消费。退款按真实到账月份冲减原消费分类。
              </p>
              {preview.warnings.map((w) => (
                <p className="alert warning" key={w}>
                  <AlertTriangle size={17} />
                  {w}
                </p>
              ))}
              {!!preview.warnings.length && (
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={warningsAccepted}
                    onChange={(e) => setWarningsAccepted(e.target.checked)}
                  />
                  我已核对，确认记录真实发生的事实
                </label>
              )}
            </div>
          )}
          {error && (
            <div className="alert danger" role="alert">
              {error}
            </div>
          )}
          {unknown ? (
            <button
              type="button"
              disabled={busy}
              className="primary wide"
              onClick={() => void queryUnknown()}
            >
              <RefreshCw size={17} />
              查询原操作结果
            </button>
          ) : (
            <div className="form-footer">
              <button type="button" onClick={onClose}>
                取消
              </button>
              <button type="submit" className="primary" disabled={busy}>
                {busy
                  ? "正在处理…"
                  : action.kind === "transaction"
                    ? preview
                      ? "确认并提交"
                      : "核对账务影响"
                    : "保存"}
                <ArrowRight size={16} />
              </button>
            </div>
          )}
        </form>
      )}
    </Modal>
  );
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { user, refresh, notify } = useWorkspace();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState(user.name);
  const [timezone, setTimezone] = useState(user.timezone);
  const [currency, setCurrency] = useState(user.currency);
  return (
    <Modal title="个人设置" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api("/me/preferences", {
              method: "PATCH",
              body: { name, timezone, currency },
            });
            await refresh();
            notify("偏好已保存");
            onClose();
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          称呼
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
          />
        </label>
        <label>
          时区
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            {[
              ...new Set([
                user.timezone,
                "Asia/Shanghai",
                "Asia/Hong_Kong",
                "Asia/Tokyo",
                "Europe/London",
                "America/New_York",
                "UTC",
              ]),
            ].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          账本货币
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {["CNY", "USD", "EUR", "HKD"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <small>已有账户后锁定货币，不作自动汇率换算。</small>
        </label>
        <p className="muted">
          隐私遮蔽开关在顶部，偏好按账户保存。当前账户：{user.email}
        </p>
        {error && (
          <p className="alert danger" role="alert">
            {error}
          </p>
        )}
        <button className="primary wide" disabled={busy}>
          保存设置
        </button>
      </form>
      <button
        className="wide"
        onClick={async () => {
          try {
            await api("/auth/logout", { method: "POST" });
            onClose();
            client.setQueryData(["me"], null);
            client.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
          } catch (e) {
            setError(errorText(e));
          }
        }}
      >
        退出登录
      </button>
      <PendingOperations />
      <OperationHistory />
    </Modal>
  );
}
export function PendingOperations() {
  const { user, refresh, notify } = useWorkspace();
  const [pending, setPending] = useState(() =>
    sessionStorage.getItem("pw-pending-" + user.id),
  );
  const [status, setStatus] = useState("");
  if (!pending) return null;
  return (
    <div className="alert warning">
      <h3>有一笔待核对的提交</h3>
      <p>仅保存请求标识，不保存敏感表单内容。查询前请勿重复创建。</p>
      <p>{status}</p>
      <button
        onClick={async () => {
          try {
            const r = await api<{ status: string }>("/operations/" + pending);
            setStatus(
              r.status === "SUCCESS"
                ? "原操作已确认成功"
                : "结果仍未知，稍后再次查询",
            );
            if (r.status === "SUCCESS") {
              sessionStorage.removeItem("pw-pending-" + user.id);
              setPending(null);
              await refresh();
              notify("原操作已确认成功");
            }
          } catch (e) {
            setStatus(errorText(e));
          }
        }}
      >
        查询原操作结果
      </button>
    </div>
  );
}
function OperationHistory() {
  const q = useQuery({
    queryKey: ["operation-history"],
    queryFn: () =>
      api<
        {
          id: string;
          key: string;
          kind: string;
          status: string;
          created_at: string;
        }[]
      >("/operations"),
  });
  return (
    <div className="operation-history">
      <h3>最近已确认的操作</h3>
      <p className="fine-print">
        浏览器刷新或中断后，可在这里追溯服务器已确认的原提交。未知请求仍需使用原标识查询。
      </p>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      ) : (
        q.data.map((o) => (
          <div className="ledger-line" key={o.id}>
            <span>
              {o.kind}
              <small className="operation-key">
                {o.key} · {o.created_at.slice(0, 16)}
              </small>
            </span>
            <span className="badge">
              {o.status === "SUCCESS" ? "已确认成功" : o.status}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
function SourceDialog({
  action,
  onClose,
}: {
  action: CreateAction;
  onClose: () => void;
}) {
  const { open } = useWorkspace();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["source", action.sourceKind, action.sourceId],
    queryFn: () => api("/sources/" + action.sourceKind + "/" + action.sourceId),
  });
  const t = action.initial?.task as Task | undefined;
  return (
    <Modal title="关联来源" onClose={onClose} full>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <>
          <p className="alert warning">
            来源不可访问或已移除。历史事实仍保留。
          </p>
          <button
            onClick={() => {
              navigate("/");
              onClose();
            }}
          >
            返回首页
          </button>
        </>
      ) : (
        <>
          <p className="badge">稳定来源 ID · {action.sourceId}</p>
          <p>日程仅组织行动。请进入专业模块确认真实执行。</p>
          {action.sourceKind === "training_plan" ? (
            <button
              className="primary"
              onClick={() =>
                open({
                  kind: "session",
                  initial: {
                    name: t?.title || "计划训练",
                    source_task_id: t?.id,
                    template_id: (q.data as Entry)?.data?.template_id,
                  },
                })
              }
            >
              进入训练
            </button>
          ) : (
            <button
              className="primary"
              onClick={() => {
                navigate(
                  "/diet?view=" +
                    (action.sourceKind === "shopping_list"
                      ? "shopping"
                      : "plan"),
                );
                onClose();
              }}
            >
              进入饮食模块
            </button>
          )}
        </>
      )}
    </Modal>
  );
}
function TransactionDialog({
  action,
  onClose,
}: {
  action: CreateAction;
  onClose: () => void;
}) {
  const { user, open } = useWorkspace();
  const q = useQuery({
    queryKey: ["transaction", action.id],
    queryFn: () =>
      api<{
        transaction: Transaction;
        movements: { account_id: string; delta: string }[];
        refunds: Transaction[];
        refundable: string | null;
      }>("/finance/transactions/" + action.id),
  });
  return (
    <Modal title="交易详情 · 审计记录" onClose={onClose} full>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      ) : (
        q.data && (
          <>
            <div className="detail-value">
              <Sensitive>
                {money(q.data.transaction.amount, user.currency)}
              </Sensitive>
            </div>
            <p>
              {q.data.transaction.description || q.data.transaction.category}
            </p>
            <dl>
              <dt>实际发生日期</dt>
              <dd>{q.data.transaction.occurred_on}</dd>
              <dt>业务类型</dt>
              <dd>{q.data.transaction.type}</dd>
              <dt>记录 ID</dt>
              <dd className="mono">{q.data.transaction.id}</dd>
            </dl>
            <h3>持久化账户分录</h3>
            {q.data.movements.map((m, i) => (
              <p key={i} className="ledger-line">
                {m.account_id.slice(0, 8)}
                <Sensitive>{money(m.delta, user.currency)}</Sensitive>
              </p>
            ))}
            {!!q.data.refunds.length && (
              <>
                <h3>关联退款</h3>
                {q.data.refunds.map((r) => (
                  <p key={r.id}>
                    {r.occurred_on} ·{" "}
                    <Sensitive>{money(r.amount, user.currency)}</Sensitive>
                  </p>
                ))}
              </>
            )}
            {q.data.refundable !== null && (
              <>
                <p>
                  剩余可退：
                  <Sensitive>
                    {money(q.data.refundable, user.currency)}
                  </Sensitive>
                </p>
                <button
                  className="primary"
                  onClick={() =>
                    open({
                      kind: "transaction",
                      initial: {
                        type: "REFUND",
                        account_id: q.data!.transaction.account_id,
                        original_id: q.data!.transaction.id,
                        category: q.data!.transaction.category,
                      },
                    })
                  }
                >
                  发起关联退款
                </button>
              </>
            )}
            <p className="muted">
              历史交易不可无痕改写；余额校正需另行填写原因。
            </p>
          </>
        )
      )}
    </Modal>
  );
}
function RecipeDialog({
  recipe,
  onClose,
}: {
  recipe: Recipe;
  onClose: () => void;
}) {
  const { open } = useWorkspace();
  return (
    <Modal title={recipe.name} onClose={onClose} full>
      <p className="badge">
        <Clock size={14} />
        {recipe.minutes} 分钟 · {recipe.servings} 份
      </p>
      <p>{recipe.tags}</p>
      <h3>配料</h3>
      {recipe.ingredients.map((i, n) => (
        <div className="ledger-line" key={n}>
          <span>
            {i.ingredient} {i.specification}
          </span>
          <span>
            {i.quantity || "待核对"} {i.unit}
          </span>
        </div>
      ))}
      <p className="alert warning">
        {recipe.allergen_note || "过敏信息未确认，请核对全部配料"}
      </p>
      <h3>制作步骤</h3>
      <p className="pre-wrap">{recipe.steps}</p>
      <div className="form-footer">
        <button
          onClick={() =>
            open({
              kind: "recipe",
              id: recipe.id,
              version: recipe.version,
              initial: recipe as unknown as Record<string, unknown>,
            })
          }
        >
          编辑食谱
        </button>
        <button
          className="primary"
          onClick={() =>
            open({ kind: "meal_plan", initial: { recipe_id: recipe.id } })
          }
        >
          加入菜单
        </button>
      </div>
    </Modal>
  );
}
function ShoppingDiffDialog({
  action,
  onClose,
}: {
  action: CreateAction;
  onClose: () => void;
}) {
  const { refresh, notify } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unknown, setUnknown] = useState(false);
  const [op] = useState(key);
  const q = useQuery({
    queryKey: ["shopping-diff", action.id],
    queryFn: () =>
      api<ShoppingDiff>(
        "/diet/shopping-lists/" + action.id + "/reconciliation-preview",
        { method: "POST" },
      ),
  });
  const apply = async () => {
    setBusy(true);
    try {
      if (unknown) {
        const r = await api<{ status: string }>("/operations/" + op);
        if (r.status !== "SUCCESS") {
          setError("结果仍未知，请稍后查询原操作");
          return;
        }
      } else
        await api(
          "/diet/shopping-lists/" + action.id + "/reconciliation-apply",
          {
            method: "POST",
            body: {
              diff_hash: q.data!.diff_hash,
              expected_version: q.data!.expected_version,
            },
            key: op,
          },
        );
      await refresh();
      notify("采购差异已确认应用");
      onClose();
    } catch (e) {
      setError(errorText(e));
      if (!(e instanceof ApiError) || e.status >= 500) setUnknown(true);
      else if (e.status === 409) void q.refetch();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="核对采购需求差异" onClose={onClose} full>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      ) : (
        q.data && (
          <>
            <p className="alert info">
              已购事实永远保留。人工改量及不可靠单位保持原值，不会被本次核对覆盖。
            </p>
            {q.data.items.map((i, n) => (
              <div className="diff-item" key={n}>
                <strong>
                  {i.ingredient} · {i.specification} · {i.unit}
                </strong>
                <div className="diff-numbers">
                  <span>
                    新需求 <b>{i.uncertain ? "待核对" : i.required}</b>
                  </span>
                  <span>
                    已购 <b>{i.purchased}</b>
                  </span>
                  <span>
                    待购 <b>{i.pending}</b>
                  </span>
                  <span>
                    核对后待购 <b>{i.suggested_pending}</b>
                  </span>
                </div>
                {i.protected ? (
                  <p className="warning-text">
                    {i.manual_override
                      ? "人工调整保护：请在清单中明确修改"
                      : "数量/规格待人工核对，未作猜测换算"}
                  </p>
                ) : Number(i.change) > 0 ? (
                  <p className="success-text">
                    建议补购 +{i.change} {i.unit}
                  </p>
                ) : Number(i.change) < 0 ? (
                  <p>
                    需求减少：待购调整 {i.change} {i.unit}，已购保留
                  </p>
                ) : (
                  <p className="muted">无需补购</p>
                )}
                {Number(i.excess_purchased) > 0 && (
                  <p className="muted">已购超出当前需求，购买历史仍保留。</p>
                )}
              </div>
            ))}
            {q.data.notices.map((n) => (
              <p className="alert warning" key={n}>
                {n}
              </p>
            ))}
            {error && (
              <p className="alert danger" role="alert">
                {error}
              </p>
            )}
            <div className="form-footer">
              <button onClick={onClose}>取消</button>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void apply()}
              >
                {busy
                  ? "处理中…"
                  : unknown
                    ? "查询原操作结果"
                    : "确认应用允许的差异"}
              </button>
            </div>
          </>
        )
      )}
    </Modal>
  );
}

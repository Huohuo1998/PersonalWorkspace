export interface User {
  id: string;
  email: string;
  name: string;
  timezone: string;
  currency: string;
  privacy_masked: boolean;
}
export interface Owned {
  id: string;
  version: number;
  created_at: string;
}
export interface Task extends Owned {
  title: string;
  notes: string;
  status: string;
  inbox: boolean;
  priority: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  due_at: string | null;
  project_id: string | null;
  parent_id: string | null;
  source_kind: string | null;
  source_id: string | null;
}
export interface Event extends Owned {
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  notes: string;
}
export interface Project extends Owned {
  name: string;
  archived: boolean;
}
export interface Account extends Owned {
  name: string;
  type: "ASSET" | "CREDIT";
  currency: string;
  balance: string;
  debt: string | null;
  overpayment: string | null;
}
export interface Transaction extends Owned {
  type: string;
  amount: string;
  occurred_on: string;
  category: string;
  description: string;
  account_id: string;
  destination_id: string | null;
  original_id: string | null;
  source_kind: string | null;
  source_id: string | null;
}
export interface Budget extends Owned {
  month: string;
  category: string;
  amount: string;
  spent: string;
  remaining: string;
}
export interface Goal extends Owned {
  name: string;
  target_amount: string;
  account_id: string;
  balance: string;
  active: boolean;
}
export interface FinanceSummary {
  initialized: boolean;
  assets: string | null;
  debt: string | null;
  overpayment: string | null;
  net_assets: string | null;
  income: string;
  expense: string;
  has_transactions: boolean;
  budgets: Budget[];
  categories: Record<string, string>;
}
export interface WorkoutSet extends Owned {
  exercise: string;
  ordinal: number;
  weight: string | null;
  reps: number | null;
  seconds: number | null;
  completed: boolean;
}
export interface WorkoutSession extends Owned {
  name: string;
  status: string;
  sets: WorkoutSet[];
  ended_at: string | null;
  source_task_id: string | null;
}
export interface Entry extends Owned {
  kind: string;
  data: {
    name?: string;
    day?: string;
    minutes?: number;
    notes?: string;
    weight?: string;
    waist?: string;
    recovery?: string;
    equipment?: string;
    instructions?: string;
    exercises?: string[];
    sets?: number;
    template_id?: string;
  };
}
export interface Ingredient {
  ingredient: string;
  specification: string;
  quantity: string | null;
  unit: string;
}
export interface Recipe extends Owned {
  name: string;
  minutes: number;
  servings: string;
  ingredients: Ingredient[];
  steps: string;
  tags: string;
  allergen_note: string;
  illustration: string;
}
export interface MealPlan extends Owned {
  day: string;
  slot: string;
  recipe_id: string | null;
  description: string;
  servings: string;
}
export interface MealRecord extends Owned {
  day: string;
  slot: string;
  description: string;
  source: string;
  notes: string;
  plan_id: string | null;
}
export interface ShoppingItem extends Owned {
  ingredient: string;
  specification: string;
  unit: string;
  required: string;
  purchased: string;
  pending: string;
  manual_override: boolean;
  uncertain: boolean;
}
export interface ShoppingData {
  list: Owned & { week: string };
  items: ShoppingItem[];
  plan_changed?: boolean;
}
export interface ShoppingDiff {
  diff_hash: string;
  expected_version: number;
  changed: boolean;
  notices: string[];
  items: (ShoppingItem & {
    item_id: string | null;
    suggested_pending: string;
    extra: string;
    change: string;
    protected: boolean;
    excess_purchased: string;
  })[];
}
export interface FinancePreview {
  effects: {
    account_id: string;
    name: string;
    type: string;
    before: string;
    after: string;
    delta: string;
    version: number;
  }[];
  warnings: string[];
  original_account_id: string | null;
  category: string;
}
export interface DashboardData {
  day: string;
  tasks: Task[];
  overdue: Task[];
  events: Event[];
  finance: FinanceSummary;
  fitness: { completed_sessions: number; quick_minutes: number };
  diet: { records: number; home_cooked: number };
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  CalendarDays,
  Wallet,
  Activity,
  Utensils,
  Clock,
  ChevronLeft,
  ChevronRight,
  Leaf,
  Check,
  ShoppingBasket,
  TrendingUp,
  Search,
  BookOpen,
  Play,
  Pause,
  Flag,
  AlertCircle,
} from "lucide-react";
import {
  api,
  errorText,
  dayAt,
  addDay,
  monday,
  timeIn,
  money,
  key,
} from "./api";
import { useWorkspace } from "./context";
import {
  Card,
  Empty,
  Loading,
  ErrorState,
  Stat,
  PageHeading,
  Tabs,
  TaskRows,
  EventRows,
  AddButton,
  Sensitive,
  Modal,
} from "./components";
import { PendingOperations } from "./forms";
import { WorkoutFocus } from "./workout";
import { TemporalCalendar } from "./calendar";
import type {
  DashboardData,
  Task,
  Event,
  Project,
  Account,
  Transaction,
  FinanceSummary,
  Goal,
  WorkoutSession,
  Entry,
  Recipe,
  MealPlan,
  ShoppingData,
  MealRecord,
} from "./types";

function useView(defaultView: string, valid: string[]) {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") || defaultView;
  return [
    valid.includes(view) ? view : defaultView,
    (v: string) => {
      const next = new URLSearchParams(params);
      next.set("view", v);
      setParams(next);
    },
  ] as const;
}
const taskStatus: Record<string, string> = {
  TODO: "待办",
  IN_PROGRESS: "进行中",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};
const typeLabels: Record<string, string> = {
  EXPENSE: "支出",
  INCOME: "收入",
  TRANSFER: "转账",
  REPAYMENT: "还款",
  REFUND: "退款",
  ADJUSTMENT: "校正",
  OPENING: "期初",
  CREDIT_WITHDRAWAL: "溢缴转出",
};
const slots: Record<string, string> = {
  BREAKFAST: "早餐",
  LUNCH: "午餐",
  DINNER: "晚餐",
  SNACK: "加餐",
};
const sourceLabels: Record<string, string> = {
  HOME_COOKED: "自炊",
  EATING_OUT: "外食",
  TAKEAWAY: "外卖",
  OTHER: "其他",
};

export function Dashboard({ day }: { day: string }) {
  const { user, open } = useWorkspace();
  const q = useQuery({
    queryKey: ["dashboard", day],
    queryFn: () =>
      api<Pick<DashboardData, "day" | "tasks" | "events" | "overdue">>(
        "/dashboard/schedule?day=" + day,
      ),
  });
  const fin = useQuery({
    queryKey: ["dashboard-finance", day],
    queryFn: () =>
      api<FinanceSummary>("/finance/summary?month=" + day.slice(0, 7)),
  });
  const fit = useQuery({
    queryKey: ["dashboard-fitness", day],
    queryFn: () =>
      api<DashboardData["fitness"]>("/dashboard/fitness?day=" + day),
  });
  const diet = useQuery({
    queryKey: ["dashboard-diet", day],
    queryFn: () => api<DashboardData["diet"]>("/dashboard/diet?day=" + day),
  });
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: user.timezone,
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );
  const greeting = hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
  return (
    <>
      <PageHeading
        eyebrow="MY PERSONAL WORKSPACE"
        title={`${greeting}，${user.name}`}
        description="把注意力放在今天，给生活留一点从容。"
      />
      <PendingOperations />
      <div className="welcome-banner">
        <div>
          <span className="badge">ONE DAY AT A TIME</span>
          <h2>你的节奏，你的空间。</h2>
          <p>
            不必一次做好所有事。
            <br />
            记下一件小事，就已经是开始。
          </p>
          <button
            className="text-button"
            onClick={() =>
              open({
                kind: "task",
                initial: { scheduled_date: day, inbox: false },
              })
            }
          >
            安排今天
            <ArrowRight size={16} />
          </button>
        </div>
        <div className="desk-art" aria-hidden="true">
          <div className="sun" />
          <div className="plant">
            <i />
            <i />
            <i />
            <b />
          </div>
          <div className="notebook">
            <span />
            <span />
            <span />
          </div>
          <div className="cup" />
          <div className="desk-line" />
        </div>
      </div>
      <>
        <div className="dashboard-columns">
          <Card
            title="今日行动"
            action={
              <Link className="text-button" to="/schedule?view=today">
                查看日程
                <ArrowUpRight size={15} />
              </Link>
            }
            className="today-card"
          >
            <div className="section-meta">
              <CalendarDays size={15} />
              {day}
              {q.data && (
                <span>
                  {q.data.tasks.length + q.data.events.length} 项待安排 / 执行
                </span>
              )}
            </div>
            {q.isPending ? (
              <Loading />
            ) : q.isError ? (
              <ErrorState error={q.error} retry={() => void q.refetch()} />
            ) : (
              q.data && (
                <>
                  <TodayAgenda tasks={q.data.tasks} events={q.data.events} />
                  {!q.data.tasks.length && !q.data.events.length && (
                    <Empty
                      title="今天，留一点自由"
                      text="暂时没有今日安排。你可以收集想法，或为今天留出时间。"
                      action={
                        <button
                          onClick={() =>
                            open({
                              kind: "task",
                              initial: { scheduled_date: day },
                            })
                          }
                        >
                          <Plus size={16} />
                          添加今日任务
                        </button>
                      }
                    />
                  )}
                </>
              )
            )}
          </Card>
          <Card title="随手记录" className="quick-card">
            <p className="muted">生活里的小事，记在这里。</p>
            <div className="quick-grid">
              {[
                ["task", "一个待办", "先记下来", CalendarDays],
                ["transaction", "一笔收支", "如实记录", Wallet],
                ["quick_activity", "一次运动", "自由开始", Activity],
                ["meal_record", "一餐饮食", "记录实际", Utensils],
              ].map(([kind, title, sub, Icon]) => {
                const I = Icon as typeof Leaf;
                return (
                  <button
                    key={kind as string}
                    onClick={() => open({ kind: kind as string })}
                  >
                    <span>
                      <I size={20} />
                    </span>
                    <strong>{title as string}</strong>
                    <small>{sub as string}</small>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
        <div className="section-head outside">
          <h2>生活概览</h2>
          <span className="muted">来自真实记录 · 计划不计入实际</span>
        </div>
        <div className="summary-grid">
          <Card>
            <div className="summary-title">
              <Wallet size={19} />
              经济
              <Link to="/finance">
                <ArrowUpRight size={18} />
                <span className="sr-only">进入经济</span>
              </Link>
            </div>
            {fin.isPending ? (
              <Loading />
            ) : fin.isError ? (
              <ErrorState error={fin.error} retry={() => void fin.refetch()} />
            ) : (
              fin.data && (
                <>
                  {fin.data.initialized ? (
                    <>
                      <Stat
                        label="本月净支出"
                        value={money(fin.data.expense, user.currency)}
                        detail={
                          fin.data.has_transactions
                            ? "支出减去实际退款"
                            : "本月尚无交易"
                        }
                      />
                      <span className="muted">
                        账户净资产{" "}
                        <Sensitive>
                          {money(fin.data.net_assets, user.currency)}
                        </Sensitive>
                      </span>
                    </>
                  ) : (
                    <Empty
                      title="建立自己的账本"
                      text="新增真实账户后，开始记录。"
                      action={
                        <button onClick={() => open({ kind: "account" })}>
                          新增账户
                        </button>
                      }
                    />
                  )}
                </>
              )
            )}
          </Card>
          <Card>
            <div className="summary-title">
              <Activity size={19} />
              运动
              <Link to="/fitness">
                <ArrowUpRight size={18} />
                <span className="sr-only">进入运动</span>
              </Link>
            </div>
            {fit.isPending ? (
              <Loading />
            ) : fit.isError ? (
              <ErrorState error={fit.error} retry={() => void fit.refetch()} />
            ) : (
              fit.data && (
                <>
                  <Stat
                    label="今日已完成训练"
                    value={
                      <>
                        {fit.data.completed_sessions}
                        <small> 次</small>
                      </>
                    }
                    detail={`自由运动 ${fit.data.quick_minutes} 分钟`}
                  />
                  <p className="muted">按照自己的节奏，休息也很好。</p>
                </>
              )
            )}
          </Card>
          <Card>
            <div className="summary-title">
              <Utensils size={19} />
              饮食
              <Link to="/diet">
                <ArrowUpRight size={18} />
                <span className="sr-only">进入饮食</span>
              </Link>
            </div>
            {diet.isPending ? (
              <Loading />
            ) : diet.isError ? (
              <ErrorState
                error={diet.error}
                retry={() => void diet.refetch()}
              />
            ) : (
              diet.data && (
                <>
                  <Stat
                    label="今日实际用餐"
                    value={
                      <>
                        {diet.data.records}
                        <small> 餐</small>
                      </>
                    }
                    detail={`其中自炊 ${diet.data.home_cooked} 餐`}
                    sensitive={false}
                  />
                  <p className="muted">菜单计划与真实用餐分开记录。</p>
                </>
              )
            )}
          </Card>
        </div>
        <Card
          title="待关注"
          action={<span className="badge neutral">不会自动改期</span>}
          className="attention-card"
        >
          {q.isPending ? (
            <Loading />
          ) : q.isError ? (
            <ErrorState error={q.error} retry={() => void q.refetch()} />
          ) : (
            q.data && (
              <>
                {q.data.overdue.length ? (
                  <TaskRows tasks={q.data.overdue} />
                ) : (
                  <div className="quiet-empty">
                    <Check size={18} />
                    目前没有逾期待办。按自己的节奏继续。
                  </div>
                )}
              </>
            )
          )}
        </Card>
      </>
    </>
  );
}
function TodayAgenda({ tasks, events }: { tasks: Task[]; events: Event[] }) {
  const { user } = useWorkspace();
  const timed = [
    ...tasks
      .filter((t) => t.scheduled_time)
      .map((t) => ({
        type: "task" as const,
        time: t.scheduled_time!,
        item: t,
      })),
    ...events
      .filter((e) => !e.all_day)
      .map((e) => ({
        type: "event" as const,
        time: timeIn(e.start_at, user.timezone),
        item: e,
      })),
  ].sort((a, b) => a.time.localeCompare(b.time));
  return (
    <>
      <div className="timeline">
        {timed.map((v) => (
          <div className="timeline-item" key={v.item.id}>
            <time>{v.time}</time>
            {v.type === "task" ? (
              <TaskRows tasks={[v.item]} />
            ) : (
              <EventRows events={[v.item]} />
            )}
          </div>
        ))}
      </div>
      {events.some((e) => e.all_day) && (
        <>
          <p className="group-label">全天事件</p>
          <EventRows events={events.filter((e) => e.all_day)} />
        </>
      )}
      {tasks.some((t) => !t.scheduled_time) && (
        <>
          <p className="group-label">今日重点 · 无定时</p>
          <TaskRows tasks={tasks.filter((t) => !t.scheduled_time)} />
        </>
      )}
    </>
  );
}

export function Schedule({ day }: { day: string }) {
  const { open, user, refresh, notify } = useWorkspace();
  const [view, setView] = useView("today", [
    "today",
    "inbox",
    "tasks",
    "calendar",
    "projects",
  ]);
  const [selected, setSelected] = useState(day);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [project, setProject] = useState("");
  const [calendarMode, setCalendarMode] = useState("week");
  const tasks = useQuery({
    queryKey: ["tasks", view, selected, search, status, project],
    queryFn: () =>
      api<Task[]>(
        "/tasks?view=" +
          (["today", "inbox"].includes(view) ? view : "all") +
          "&day=" +
          selected +
          "&q=" +
          encodeURIComponent(search) +
          (status ? "&status=" + status : "") +
          (project ? "&project_id=" + project : ""),
      ),
  });
  const ev = useQuery({
    queryKey: ["events", selected],
    queryFn: () =>
      api<Event[]>(
        "/events?start=" +
          addDay(selected, -35) +
          "&end=" +
          addDay(selected, 35),
      ),
  });
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<Project[]>("/projects"),
  });
  const all = tasks.data || [];
  const events = ev.data || [];
  const dayEvents = events.filter(
    (e) =>
      dayAt(user.timezone, new Date(e.start_at)) <= selected &&
      dayAt(user.timezone, new Date(e.end_at)) >= selected,
  );
  const days =
    calendarMode === "day"
      ? [selected]
      : calendarMode === "month"
        ? Array.from({ length: 35 }, (_, n) =>
            addDay(monday(selected.slice(0, 8) + "01"), n),
          )
        : Array.from({ length: 7 }, (_, n) => addDay(monday(selected), n));
  return (
    <>
      <PageHeading
        eyebrow="SCHEDULE"
        title="日程"
        description="收集想法，安排时间。把计划与真实执行分开。"
        action={
          <AddButton onClick={() => open({ kind: "task" })}>新增任务</AddButton>
        }
      />
      <Tabs
        items={[
          { id: "today", label: "今日" },
          { id: "inbox", label: "收集箱" },
          { id: "tasks", label: "任务" },
          { id: "calendar", label: "日历" },
          { id: "projects", label: "项目" },
        ]}
        value={view}
        onChange={setView}
      />
      {view === "projects" ? (
        <Card
          title="轻量项目"
          action={
            <button onClick={() => open({ kind: "project" })}>
              <Plus size={16} />
              新增项目
            </button>
          }
        >
          {projects.isPending ? (
            <Loading />
          ) : projects.isError ? (
            <ErrorState
              error={projects.error}
              retry={() => void projects.refetch()}
            />
          ) : projects.data?.length ? (
            <div className="project-grid">
              {projects.data.map((p) => (
                <div className="project-card" key={p.id}>
                  <BookOpen size={24} />
                  <h3>{p.name}</h3>
                  <span className="badge neutral">
                    {p.archived ? "已归档" : "活动项目"}
                  </span>
                  <div className="form-footer">
                    <button
                      onClick={() => {
                        setProject(p.id);
                        setView("tasks");
                      }}
                    >
                      查看任务
                    </button>
                    {!p.archived && (
                      <button
                        className="text-button"
                        onClick={async () => {
                          try {
                            await api(
                              "/projects/" +
                                p.id +
                                "/archive?expected_version=" +
                                p.version,
                              { method: "PATCH" },
                            );
                            await refresh();
                          } catch (e) {
                            notify(errorText(e));
                          }
                        }}
                      >
                        归档
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="把相关任务放在一起"
              action={
                <button onClick={() => open({ kind: "project" })}>
                  建立第一个项目
                </button>
              }
            />
          )}
        </Card>
      ) : (
        <>
          {(view === "tasks" || view === "inbox") && (
            <div className="filters">
              <label className="search-field">
                <Search size={17} />
                <input
                  aria-label="搜索任务"
                  placeholder="搜索任务…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <select
                aria-label="筛选任务状态"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">所有状态</option>
                {Object.entries(taskStatus).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                aria-label="筛选所属项目"
                value={project}
                onChange={(e) => setProject(e.target.value)}
              >
                <option value="">所有项目</option>
                {projects.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {(view === "today" || view === "calendar") && (
            <div className="date-controls">
              <button
                className="icon-button"
                aria-label="前一天"
                onClick={() => setSelected(addDay(selected, -1))}
              >
                <ChevronLeft />
              </button>
              <input
                type="date"
                aria-label="日程日期"
                value={selected}
                onChange={(e) => e.target.value && setSelected(e.target.value)}
              />
              <button
                className="icon-button"
                aria-label="后一天"
                onClick={() => setSelected(addDay(selected, 1))}
              >
                <ChevronRight />
              </button>
              <button onClick={() => setSelected(day)}>今天</button>
              {view === "calendar" && (
                <select
                  aria-label="日历模式"
                  value={calendarMode}
                  onChange={(e) => setCalendarMode(e.target.value)}
                >
                  <option value="day">日</option>
                  <option value="week">周</option>
                  <option value="month">月</option>
                </select>
              )}
              <button
                className="text-button"
                onClick={() =>
                  open({
                    kind: "event",
                    initial: {
                      start_at: selected + "T09:00",
                      end_at: selected + "T10:00",
                    },
                  })
                }
              >
                <Plus size={16} />
                新增事件
              </button>
            </div>
          )}
          {tasks.isPending ? (
            <Loading />
          ) : tasks.isError ? (
            <ErrorState
              error={tasks.error}
              retry={() => void tasks.refetch()}
            />
          ) : view === "calendar" ? (
            <>
              {ev.isError && (
                <ErrorState error={ev.error} retry={() => void ev.refetch()} />
              )}
              <>
                {calendarMode !== "month" ? (
                  <TemporalCalendar
                    days={days}
                    tasks={all}
                    events={events}
                    today={day}
                  />
                ) : (
                  <div
                    className={"calendar-grid desktop-calendar " + calendarMode}
                  >
                    {days.map((d) => (
                      <div
                        className={
                          "calendar-day " + (d === day ? "is-today" : "")
                        }
                        key={d}
                      >
                        <button
                          className="calendar-day-head"
                          onClick={() => setSelected(d)}
                        >
                          <span>
                            {new Intl.DateTimeFormat("zh-CN", {
                              weekday: "short",
                            }).format(new Date(d + "T12:00:00"))}
                          </span>
                          <strong>{d.slice(8)}</strong>
                        </button>
                        {events
                          .filter(
                            (e) =>
                              dayAt(user.timezone, new Date(e.start_at)) <= d &&
                              dayAt(user.timezone, new Date(e.end_at)) >= d,
                          )
                          .map((e) => (
                            <button
                              className="calendar-event"
                              key={e.id}
                              onClick={() =>
                                open({
                                  kind: "event",
                                  id: e.id,
                                  version: e.version,
                                  initial: e as unknown as Record<
                                    string,
                                    unknown
                                  >,
                                })
                              }
                            >
                              <Clock size={13} />
                              事件 · {e.title}
                              <small>
                                {e.all_day
                                  ? "全天"
                                  : timeIn(e.start_at, user.timezone)}
                              </small>
                            </button>
                          ))}
                        {all
                          .filter((t) => t.scheduled_date === d)
                          .map((t) => (
                            <button
                              className="calendar-task"
                              key={t.id}
                              onClick={() =>
                                open({
                                  kind: "task",
                                  id: t.id,
                                  version: t.version,
                                  initial: t as unknown as Record<
                                    string,
                                    unknown
                                  >,
                                })
                              }
                            >
                              □ 任务 · {t.title}
                              <small>{t.scheduled_time || "未定时"}</small>
                            </button>
                          ))}
                      </div>
                    ))}
                  </div>
                )}
              </>
              <Card title="当日安排" className="mobile-agenda">
                <TodayAgenda
                  tasks={all.filter(
                    (t) =>
                      t.scheduled_date === selected || t.due_at === selected,
                  )}
                  events={dayEvents}
                />
              </Card>
            </>
          ) : (
            <Card
              title={
                view === "today"
                  ? "今日安排"
                  : view === "inbox"
                    ? "收集箱"
                    : "全部任务"
              }
              action={<span className="badge neutral">{all.length} 项</span>}
            >
              {view === "today" ? (
                <>
                  {ev.isError ? (
                    <ErrorState
                      error={ev.error}
                      retry={() => void ev.refetch()}
                    />
                  ) : (
                    <TodayAgenda tasks={all} events={dayEvents} />
                  )}
                  {!all.length && !dayEvents.length && (
                    <Empty
                      title="这一天还没有安排"
                      action={
                        <button
                          onClick={() =>
                            open({
                              kind: "task",
                              initial: { scheduled_date: selected },
                            })
                          }
                        >
                          安排一件事
                        </button>
                      }
                    />
                  )}
                </>
              ) : all.length ? (
                <TaskRows tasks={all} />
              ) : (
                <Empty
                  title={
                    search || status || project
                      ? "没有符合筛选的任务"
                      : "先把想法记下来"
                  }
                  text={
                    search || status || project
                      ? "记录仍然保留，试试清除筛选。"
                      : "仅填写标题就可以保存，其他信息以后再整理。"
                  }
                  action={
                    search || status || project ? (
                      <button
                        onClick={() => {
                          setSearch("");
                          setStatus("");
                          setProject("");
                        }}
                      >
                        清除筛选
                      </button>
                    ) : (
                      <button onClick={() => open({ kind: "task" })}>
                        新增任务
                      </button>
                    )
                  }
                />
              )}
            </Card>
          )}
        </>
      )}
    </>
  );
}

export function Finance({ day }: { day: string }) {
  const { open, user, refresh, notify } = useWorkspace();
  const [view, setView] = useView("overview", [
    "overview",
    "transactions",
    "accounts",
    "budget",
    "savings",
  ]);
  const [month, setMonth] = useState(day.slice(0, 7));
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const summary = useQuery({
    queryKey: ["finance-summary", month],
    queryFn: () => api<FinanceSummary>("/finance/summary?month=" + month),
  });
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api<Account[]>("/finance/accounts"),
  });
  const tx = useQuery({
    queryKey: ["transactions", month, type, search],
    queryFn: () =>
      api<Transaction[]>(
        "/finance/transactions?month=" +
          month +
          (type ? "&type=" + type : "") +
          "&q=" +
          encodeURIComponent(search),
      ),
  });
  const goals = useQuery({
    queryKey: ["goals"],
    queryFn: () => api<Goal[]>("/finance/savings-goals"),
  });
  const accountName = (id: string) =>
    accounts.data?.find((a) => a.id === id)?.name || "账户不可访问";
  const transactionList = (items: Transaction[]) => (
    <div className="transaction-list">
      {items.map((t) => (
        <button
          className="transaction-row"
          key={t.id}
          onClick={() => open({ kind: "transaction_detail", id: t.id })}
        >
          <span className="transaction-icon">
            <Wallet size={17} />
          </span>
          <span className="row-main">
            <strong>{t.description || t.category}</strong>
            <span>
              {typeLabels[t.type]} · {t.occurred_on} ·{" "}
              {accountName(t.account_id)}
            </span>
          </span>
          <span className="transaction-amount">
            <Sensitive>
              {t.type === "INCOME" || t.type === "REFUND"
                ? "+"
                : t.type === "EXPENSE"
                  ? "-"
                  : ""}
              {money(t.amount, user.currency)}
            </Sensitive>
            <small>{typeLabels[t.type]}</small>
          </span>
          <ChevronRight size={15} />
        </button>
      ))}
    </div>
  );
  return (
    <>
      <PageHeading
        eyebrow="FINANCE"
        title="经济"
        description="真实记录每一笔，清楚看见自己的生活。"
        action={
          <AddButton onClick={() => open({ kind: "transaction" })}>
            记一笔
          </AddButton>
        }
      />
      <Tabs
        items={[
          { id: "overview", label: "概览" },
          { id: "transactions", label: "交易" },
          { id: "accounts", label: "账户" },
          { id: "budget", label: "预算" },
          { id: "savings", label: "储蓄" },
        ]}
        value={view}
        onChange={setView}
      />
      <div className="filters">
        <label className="inline-label">
          账本月份
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
          />
        </label>
        {view === "transactions" && (
          <>
            <select
              aria-label="交易类型"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">所有业务类型</option>
              {Object.entries(typeLabels).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <input
              aria-label="搜索交易说明"
              placeholder="搜索说明"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </>
        )}
      </div>
      <PendingOperations />
      {view === "overview" || view === "budget" ? (
        summary.isPending ? (
          <Loading />
        ) : summary.isError ? (
          <ErrorState
            error={summary.error}
            retry={() => void summary.refetch()}
          />
        ) : (
          summary.data && (
            <>
              {view === "overview" && (
                <>
                  {summary.data.initialized ? (
                    <>
                      <div className="stats-grid four">
                        <Stat
                          label="资产账户合计"
                          value={money(summary.data.assets, user.currency)}
                        />
                        <Stat
                          label="信用待还"
                          value={money(summary.data.debt, user.currency)}
                          detail={
                            <>
                              溢缴{" "}
                              {money(summary.data.overpayment, user.currency)}
                            </>
                          }
                        />
                        <Stat
                          label="净资产参考"
                          value={money(summary.data.net_assets, user.currency)}
                          detail="溢缴只计入一次"
                        />
                        <Stat
                          label="本月净支出"
                          value={money(summary.data.expense, user.currency)}
                          detail={
                            <>
                              本月收入{" "}
                              {money(summary.data.income, user.currency)}
                            </>
                          }
                        />
                      </div>
                      <div className="finance-note">
                        <Leaf size={16} />
                        转账和还款不重复计消费。预算额度与账户现金分别计算。
                      </div>
                    </>
                  ) : (
                    <Card>
                      <Empty
                        title="给自己的账本一个起点"
                        text="先建立真实账户。空账户列表不会被当成零元资产。"
                        action={
                          <button
                            className="primary"
                            onClick={() => open({ kind: "account" })}
                          >
                            新增账户
                          </button>
                        }
                      />
                    </Card>
                  )}
                </>
              )}
              {(view === "budget" || summary.data.initialized) && (
                <Card
                  title="本月预算"
                  action={
                    <button
                      onClick={() =>
                        open({ kind: "budget", initial: { month } })
                      }
                    >
                      <Plus size={15} />
                      设置预算
                    </button>
                  }
                >
                  {summary.data.budgets.length ? (
                    summary.data.budgets.map((b) => (
                      <div className="budget-row" key={b.id}>
                        <div>
                          <strong>{b.category}</strong>
                          <Sensitive>
                            <span>
                              {money(b.spent, user.currency)} /{" "}
                              {money(b.amount, user.currency)}
                            </span>
                          </Sensitive>
                        </div>
                        <Sensitive>
                          <div className="progress" aria-label="预算使用">
                            <i
                              style={{
                                width:
                                  Math.min(
                                    100,
                                    Math.max(
                                      0,
                                      (Number(b.spent) /
                                        Number(b.amount || 1)) *
                                        100,
                                    ),
                                  ) + "%",
                              }}
                            />
                          </div>
                        </Sensitive>
                        <p>
                          <Sensitive>
                            剩余额度 {money(b.remaining, user.currency)}
                            {Number(b.remaining) < 0 ? " · 超出预算" : ""}
                          </Sensitive>
                          <button
                            className="text-button"
                            onClick={() =>
                              open({
                                kind: "budget",
                                version: b.version,
                                initial: b as unknown as Record<
                                  string,
                                  unknown
                                >,
                              })
                            }
                          >
                            编辑
                          </button>
                        </p>
                      </div>
                    ))
                  ) : (
                    <Empty
                      title="尚未设置预算"
                      text="没有预算配置与零元预算不同。按需要设置，不强制开启。"
                    />
                  )}
                  <p className="muted">
                    分类预算不额外叠加至总预算，剩余额度不是账户可用余额。
                  </p>
                </Card>
              )}
              {view === "overview" && (
                <Card
                  title="最近交易"
                  action={
                    <button
                      className="text-button"
                      onClick={() => setView("transactions")}
                    >
                      查看全部
                      <ArrowUpRight size={15} />
                    </button>
                  }
                >
                  {tx.isPending ? (
                    <Loading />
                  ) : tx.isError ? (
                    <ErrorState
                      error={tx.error}
                      retry={() => void tx.refetch()}
                    />
                  ) : tx.data?.length ? (
                    transactionList(tx.data.slice(0, 6))
                  ) : (
                    <Empty
                      title="本月暂无交易"
                      text="只展示真实账务，不填充示例记录。"
                    />
                  )}
                </Card>
              )}
            </>
          )
        )
      ) : view === "transactions" ? (
        <Card title="交易记录">
          {tx.isPending ? (
            <Loading />
          ) : tx.isError ? (
            <ErrorState error={tx.error} retry={() => void tx.refetch()} />
          ) : tx.data?.length ? (
            transactionList(tx.data)
          ) : (
            <Empty
              title="没有符合条件的交易"
              text="可以切换月份、清除筛选或记录真实发生的一笔。"
              action={
                <button
                  onClick={() => {
                    setType("");
                    setSearch("");
                  }}
                >
                  清除筛选
                </button>
              }
            />
          )}
        </Card>
      ) : view === "accounts" ? (
        <Card
          title="真实账户"
          action={
            <button onClick={() => open({ kind: "account" })}>
              <Plus size={16} />
              新增账户
            </button>
          }
        >
          {accounts.isPending ? (
            <Loading />
          ) : accounts.isError ? (
            <ErrorState
              error={accounts.error}
              retry={() => void accounts.refetch()}
            />
          ) : accounts.data?.length ? (
            <div className="account-grid">
              {accounts.data.map((a) => (
                <div className="account-card" key={a.id}>
                  <div className="section-head">
                    <Wallet size={24} />
                    <span className="badge neutral">
                      {a.type === "CREDIT" ? "信用负债" : "资产"}
                    </span>
                  </div>
                  <h3>{a.name}</h3>
                  {a.type === "CREDIT" ? (
                    <>
                      <p>
                        待还欠款{" "}
                        <Sensitive>{money(a.debt, user.currency)}</Sensitive>
                      </p>
                      <p>
                        溢缴余额{" "}
                        <Sensitive>
                          {money(a.overpayment, user.currency)}
                        </Sensitive>
                      </p>
                    </>
                  ) : (
                    <div className="detail-value">
                      <Sensitive>{money(a.balance, user.currency)}</Sensitive>
                    </div>
                  )}
                  {a.type === "ASSET" && Number(a.balance) < 0 && (
                    <p className="warning-text">
                      <Sensitive>账面负余额，需核对真实账目</Sensitive>
                    </p>
                  )}
                  <div className="form-footer">
                    <button
                      onClick={() =>
                        open({
                          kind: "transaction",
                          initial: {
                            account_id: a.id,
                            type: a.type === "CREDIT" ? "EXPENSE" : "TRANSFER",
                          },
                        })
                      }
                    >
                      {a.type === "CREDIT" ? "记录消费" : "转账"}
                    </button>
                    <button
                      className="text-button"
                      onClick={() =>
                        open({
                          kind: "transaction",
                          initial: { type: "ADJUSTMENT", account_id: a.id },
                        })
                      }
                    >
                      余额校正
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="还没有账户"
              action={
                <button onClick={() => open({ kind: "account" })}>
                  新增账户
                </button>
              }
            />
          )}
        </Card>
      ) : (
        <Card
          title="储蓄目标"
          action={
            <button onClick={() => open({ kind: "goal" })}>
              <Plus size={16} />
              新增目标
            </button>
          }
        >
          {goals.isPending ? (
            <Loading />
          ) : goals.isError ? (
            <ErrorState
              error={goals.error}
              retry={() => void goals.refetch()}
            />
          ) : goals.data?.length ? (
            goals.data.map((g) => (
              <div className="goal-row" key={g.id}>
                <h3>
                  {g.name} {g.active ? "" : "· 已归档"}
                </h3>
                <p>
                  {accountName(g.account_id)} ·{" "}
                  <Sensitive>
                    {money(g.balance, user.currency)} /{" "}
                    {money(g.target_amount, user.currency)}
                  </Sensitive>
                </p>
                <Sensitive>
                  <div className="progress">
                    <i
                      style={{
                        width:
                          Math.min(
                            100,
                            Math.max(
                              0,
                              (Number(g.balance) / Number(g.target_amount)) *
                                100,
                            ),
                          ) + "%",
                      }}
                    />
                  </div>
                </Sensitive>
                {g.active && (
                  <button
                    onClick={() =>
                      open({
                        kind: "goal",
                        id: g.id,
                        version: g.version,
                        initial: g as unknown as Record<string, unknown>,
                      })
                    }
                  >
                    编辑目标
                  </button>
                )}
                {g.active && (
                  <button
                    onClick={async () => {
                      try {
                        await api(
                          "/finance/savings-goals/" +
                            g.id +
                            "/archive?expected_version=" +
                            g.version,
                          { method: "PATCH" },
                        );
                        await refresh();
                      } catch (e) {
                        notify(errorText(e));
                      }
                    }}
                  >
                    归档目标
                  </button>
                )}
              </div>
            ))
          ) : (
            <Empty
              title="为想做的事，留一份储蓄"
              text="绑定真实专用资产账户，不再额外计算一份资产。"
            />
          )}
        </Card>
      )}
    </>
  );
}

export function Fitness({ day }: { day: string }) {
  const { open, notify, refresh } = useWorkspace();
  const [view, setView] = useView("overview", [
    "overview",
    "plan",
    "workout",
    "history",
    "body",
  ]);
  const [planTab, setPlanTab] = useState("training_plan");
  const active = useQuery({
    queryKey: ["active-workout"],
    queryFn: () => api<WorkoutSession | null>("/fitness/sessions/active"),
  });
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api<WorkoutSession[]>("/fitness/sessions"),
  });
  const quick = useQuery({
    queryKey: ["quick-activities"],
    queryFn: () => api<Entry[]>("/fitness/entries/quick_activity"),
  });
  const body = useQuery({
    queryKey: ["body"],
    queryFn: () => api<Entry[]>("/fitness/entries/body"),
  });
  const plans = useQuery({
    queryKey: ["fitness-plans", planTab],
    queryFn: () => api<Entry[]>("/fitness/entries/" + planTab),
  });
  const completed =
    sessions.data?.filter((s) => s.status === "COMPLETED") || [];
  const entryRows = (items: Entry[], sensitive = false) => (
    <div>
      {items.map((e) => (
        <div className="entry-row" key={e.id}>
          <div>
            <h3>{e.data.name || e.data.day}</h3>
            {sensitive ? (
              <Sensitive>
                <p>
                  {e.data.weight ? e.data.weight + " kg · " : ""}
                  {e.data.waist ? e.data.waist + " cm · " : ""}
                  {e.data.recovery}
                </p>
              </Sensitive>
            ) : (
              <p className="muted">
                {e.data.day || e.data.equipment}
                {e.data.minutes ? " · " + e.data.minutes + " 分钟" : ""}
                {e.data.exercises ? " · " + e.data.exercises.join("、") : ""}
                {e.data.sets ? " · 每动作 " + e.data.sets + " 组" : ""}
                {e.data.notes ? " · " + e.data.notes : ""}
              </p>
            )}
          </div>
          <button
            onClick={() =>
              open({
                kind: e.kind,
                id: e.id,
                version: e.version,
                initial: e.data as Record<string, unknown>,
              })
            }
          >
            编辑
          </button>
          {e.kind === "template" && (
            <button
              className="primary"
              onClick={() =>
                open({
                  kind: "session",
                  initial: { name: e.data.name, template_id: e.id },
                })
              }
            >
              开始
            </button>
          )}
          {e.kind === "training_plan" && (
            <button
              onClick={() =>
                open({
                  kind: "task",
                  sourceKind: "training_plan",
                  sourceId: e.id,
                  initial: {
                    title: e.data.name,
                    scheduled_date: e.data.day,
                    inbox: false,
                  },
                })
              }
            >
              安排到日程
            </button>
          )}
        </div>
      ))}
    </div>
  );
  return (
    <>
      <PageHeading
        eyebrow="FITNESS"
        title="运动"
        description="记录真实的进步，也给休息留出位置。"
        action={
          <AddButton onClick={() => open({ kind: "quick_activity" })}>
            记录运动
          </AddButton>
        }
      />
      <Tabs
        items={[
          { id: "overview", label: "概览" },
          { id: "plan", label: "计划" },
          { id: "workout", label: "训练" },
          { id: "history", label: "历史" },
          { id: "body", label: "身体" },
        ]}
        value={view}
        onChange={setView}
      />
      {active.isError && (
        <ErrorState error={active.error} retry={() => void active.refetch()} />
      )}
      {active.data && view !== "workout" && (
        <div className="resume-banner">
          <span>
            <Activity size={22} />
            <strong>有一段训练等你继续</strong>
            <small>
              {active.data.name} ·{" "}
              {active.data.status === "PAUSED" ? "已暂停" : "进行中"} ·{" "}
              <Sensitive>
                {active.data.sets.filter((s) => s.completed).length}{" "}
                组已确认完成
              </Sensitive>
            </small>
          </span>
          <button className="primary" onClick={() => setView("workout")}>
            恢复训练
            <ArrowRight size={16} />
          </button>
        </div>
      )}
      {view === "workout" ? (
        active.isPending ? (
          <Loading />
        ) : active.data ? (
          <WorkoutFocus session={active.data} />
        ) : (
          <Card>
            <Empty
              title="从这里，开始一次训练"
              text="详细训练逐组保存。也可以直接记录散步、跑步，无需计划。"
              action={
                <button
                  className="primary"
                  onClick={() => open({ kind: "session" })}
                >
                  <Play size={16} />
                  开始详细训练
                </button>
              }
            />
          </Card>
        )
      ) : view === "overview" ? (
        <>
          <div className="stats-grid">
            <Stat
              label="已完成详细训练"
              value={
                <>
                  {sessions.isSuccess
                    ? completed.length
                    : sessions.isError
                      ? "读取失败"
                      : "读取中"}
                  <small> 次</small>
                </>
              }
              detail="只统计真实完成的会话"
            />
            <Stat
              label="自由运动记录"
              value={
                <>
                  {quick.isSuccess
                    ? quick.data.length
                    : quick.isError
                      ? "读取失败"
                      : "读取中"}
                  <small> 次</small>
                </>
              }
              detail="无需先制定计划"
            />
            <Stat
              label="实际完成组数"
              value={
                sessions.isSuccess
                  ? completed.reduce(
                      (n, s) => n + s.sets.filter((v) => v.completed).length,
                      0,
                    )
                  : sessions.isError
                    ? "读取失败"
                    : "读取中"
              }
              detail="未完成计划组不计入"
            />
          </div>
          <div className="dashboard-columns">
            <Card title="今天，按自己的节奏">
              <div className="fitness-prompt">
                <Activity size={40} />
                <h3>可以训练，也可以休息。</h3>
                <p>不需要评分，记录真实的感受就好。</p>
                <div className="form-footer">
                  <button
                    className="primary"
                    onClick={() =>
                      active.data
                        ? setView("workout")
                        : open({ kind: "session" })
                    }
                  >
                    {active.data ? "继续训练" : "开始训练"}
                  </button>
                  <button onClick={() => open({ kind: "quick_activity" })}>
                    记录自由运动
                  </button>
                </div>
              </div>
            </Card>
            <Card title="身体与恢复">
              <p className="muted">体重、腰围、疲劳与酸痛记录都是可选项。</p>
              <button onClick={() => open({ kind: "body" })}>
                <Plus size={16} />
                记录身体或恢复
              </button>
              <p className="fine-print">
                健康数据按账户隔离，隐私遮蔽覆盖身体与训练表现摘要。
              </p>
            </Card>
          </div>
        </>
      ) : view === "plan" ? (
        <Card
          title="计划、动作与模板"
          action={
            <button onClick={() => open({ kind: planTab })}>
              <Plus size={16} />
              新增
            </button>
          }
        >
          <div className="segmented">
            {[
              ["training_plan", "周训练安排"],
              ["exercise", "动作库"],
              ["template", "训练模板"],
            ].map(([id, label]) => (
              <button
                className={id === planTab ? "active" : ""}
                key={id}
                onClick={() => setPlanTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {plans.isPending ? (
            <Loading />
          ) : plans.isError ? (
            <ErrorState
              error={plans.error}
              retry={() => void plans.refetch()}
            />
          ) : plans.data?.length ? (
            entryRows(plans.data)
          ) : (
            <Empty
              title="按需要制定计划"
              text="计划不是实际训练。创建模板后，可复制到详细训练逐组记录。"
              action={
                <button onClick={() => open({ kind: planTab })}>
                  新增
                  {planTab === "exercise"
                    ? "动作"
                    : planTab === "template"
                      ? "模板"
                      : "安排"}
                </button>
              }
            />
          )}
        </Card>
      ) : view === "body" ? (
        <Card
          title="身体测量与恢复反馈"
          action={
            <button onClick={() => open({ kind: "body" })}>
              <Plus size={16} />
              记录
            </button>
          }
        >
          {body.isPending ? (
            <Loading />
          ) : body.isError ? (
            <ErrorState error={body.error} retry={() => void body.refetch()} />
          ) : body.data?.length ? (
            entryRows(body.data, true)
          ) : (
            <Empty
              title="留下自己的身体感受"
              text="不用每天填报，不强制体重或评分。"
            />
          )}
        </Card>
      ) : (
        <>
          <Card title="详细训练历史">
            {sessions.isPending ? (
              <Loading />
            ) : sessions.isError ? (
              <ErrorState
                error={sessions.error}
                retry={() => void sessions.refetch()}
              />
            ) : sessions.data?.filter((s) =>
                ["COMPLETED", "ABORTED"].includes(s.status),
              ).length ? (
              sessions.data
                .filter((s) => ["COMPLETED", "ABORTED"].includes(s.status))
                .map((s) => (
                  <div className="history-row" key={s.id}>
                    <div>
                      <h3>{s.name}</h3>
                      <span>
                        {s.ended_at?.slice(0, 10)} ·{" "}
                        {s.status === "COMPLETED" ? "已完成" : "已中止"}
                      </span>
                    </div>
                    <Sensitive>
                      <p>
                        {s.sets.filter((v) => v.completed).length} 组实际完成
                      </p>
                      <ul>
                        {s.sets
                          .filter((v) => v.completed)
                          .map((v) => (
                            <li key={v.id}>
                              {v.exercise} · {v.weight || 0} kg × {v.reps || 0}{" "}
                              次{v.seconds ? " · " + v.seconds + " 秒" : ""}
                            </li>
                          ))}
                      </ul>
                    </Sensitive>
                  </div>
                ))
            ) : (
              <Empty
                title="暂无已结束训练"
                text="结束时会核对实际完成组数，未完成组不会被当作完成。"
              />
            )}
          </Card>
          <Card title="自由运动历史">
            {quick.isPending ? (
              <Loading />
            ) : quick.isError ? (
              <ErrorState
                error={quick.error}
                retry={() => void quick.refetch()}
              />
            ) : quick.data?.length ? (
              <Sensitive>{entryRows(quick.data)}</Sensitive>
            ) : (
              <Empty
                title="记录一次自由运动"
                action={
                  <button onClick={() => open({ kind: "quick_activity" })}>
                    记录散步或跑步
                  </button>
                }
              />
            )}
          </Card>
        </>
      )}
    </>
  );
}

function RecipeArt({ kind }: { kind: string }) {
  return (
    <div className={"recipe-art " + kind} aria-hidden="true">
      <svg viewBox="0 0 240 140">
        <ellipse cx="125" cy="120" rx="72" ry="7" fill="#000" opacity=".05" />
        <ellipse cx="120" cy="77" rx="66" ry="41" fill="#fff" />
        <ellipse
          cx="120"
          cy="77"
          rx="54"
          ry="30"
          fill={
            kind === "soup"
              ? "#ecc975"
              : kind === "rice"
                ? "#eee5c9"
                : "#e2ecda"
          }
        />
        {kind === "egg" ? (
          <>
            <ellipse cx="105" cy="75" rx="25" ry="16" fill="#f6cb5b" />
            <circle cx="130" cy="67" r="14" fill="#d98060" />
            <circle cx="142" cy="83" r="12" fill="#cf7154" />
            <path
              d="M92 61l14-9m19 37l12 7"
              stroke="#739768"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </>
        ) : kind === "rice" ? (
          <>
            <path d="M85 80q35-55 73 0" fill="#faf6e8" />
            <circle cx="108" cy="64" r="5" fill="#768f5e" />
            <circle cx="130" cy="75" r="7" fill="#bd9270" />
            <path
              d="M109 82l-12 8m35-33l9 7"
              stroke="#9ca764"
              strokeWidth="5"
            />
          </>
        ) : kind === "soup" ? (
          <>
            <ellipse cx="120" cy="76" rx="45" ry="24" fill="#edc374" />
            <path
              d="M90 70l12 15m26-17l18 12m-30-15l7 24"
              stroke="#f5d596"
              strokeWidth="6"
              strokeLinecap="round"
            />
          </>
        ) : (
          <>
            <path
              d="M86 90q-18-42 24-31q12-34 30-7q35-5 14 37z"
              fill="#8cac73"
            />
            <path
              d="M102 88l25-32m-3 39l24-23"
              stroke="#5b845c"
              strokeWidth="3"
            />
          </>
        )}
        <path
          d="M189 44l-10 63"
          stroke="#a79d88"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export function Diet({ day }: { day: string }) {
  const { open, refresh, notify } = useWorkspace();
  const [view, setView] = useView("overview", [
    "overview",
    "recipes",
    "plan",
    "shopping",
    "records",
  ]);
  const [selected, setSelected] = useState(day);
  const week = monday(selected);
  const [search, setSearch] = useState("");
  const [exclude, setExclude] = useState("");
  const [busy, setBusy] = useState(false);
  const recipes = useQuery({
    queryKey: ["recipes", search, exclude],
    queryFn: () =>
      api<Recipe[]>(
        "/diet/recipes?q=" +
          encodeURIComponent(search) +
          "&exclude=" +
          encodeURIComponent(exclude),
      ),
  });
  const plans = useQuery({
    queryKey: ["meal-plans", week],
    queryFn: () => api<MealPlan[]>("/diet/meal-plans?week=" + week),
  });
  const shopping = useQuery({
    queryKey: ["shopping", week],
    queryFn: () =>
      api<ShoppingData | null>("/diet/shopping-lists?week=" + week),
  });
  const records = useQuery({
    queryKey: ["meals"],
    queryFn: () => api<MealRecord[]>("/diet/meal-records"),
  });
  const allRecipes = useQuery({
    queryKey: ["all-recipes"],
    queryFn: () => api<Recipe[]>("/diet/recipes"),
  });
  const recipeName = (id: string | null) =>
    allRecipes.data?.find((r) => r.id === id)?.name || "食谱不可访问";
  const mealCell = (d: string, slot: string) => {
    const p = plans.data?.find((p) => p.day === d && p.slot === slot);
    return (
      <div className="meal-cell" key={slot}>
        <span className="meal-slot">{slots[slot]}</span>
        {p ? (
          <>
            <button
              className="meal-name"
              onClick={() =>
                open({
                  kind: "meal_plan",
                  version: p.version,
                  initial: p as unknown as Record<string, unknown>,
                })
              }
            >
              {p.recipe_id ? recipeName(p.recipe_id) : p.description}
            </button>
            <small>{p.servings} 份 · 计划</small>
            <div className="meal-actions">
              <button
                className="text-button"
                onClick={() =>
                  open({
                    kind: "meal_record",
                    initial: {
                      day: d,
                      slot,
                      description: p.recipe_id
                        ? recipeName(p.recipe_id)
                        : p.description,
                      plan_id: p.id,
                    },
                  })
                }
              >
                记录实际
              </button>
              <button
                className="icon-button"
                aria-label={"移除" + d + slots[slot] + "计划"}
                onClick={async () => {
                  try {
                    await api(
                      "/diet/meal-plans/" +
                        p.id +
                        "?expected_version=" +
                        p.version,
                      { method: "DELETE" },
                    );
                    await refresh();
                  } catch (e) {
                    notify(errorText(e));
                  }
                }}
              >
                ×
              </button>
            </div>
          </>
        ) : (
          <button
            className="meal-add"
            onClick={() =>
              open({ kind: "meal_plan", initial: { day: d, slot } })
            }
          >
            <Plus size={16} />
            安排一餐
          </button>
        )}
      </div>
    );
  };
  const purchase = async (i: ShoppingData["items"][number]) => {
    try {
      if (Number(i.pending) <= 0) return;
      await api(
        "/diet/shopping-lists/" + shopping.data!.list.id + "/items/" + i.id,
        {
          method: "PATCH",
          body: { expected_version: i.version, purchase_quantity: i.pending },
        },
      );
      await refresh();
    } catch (e) {
      notify(errorText(e));
    }
  };
  return (
    <>
      <PageHeading
        eyebrow="DIET"
        title="饮食"
        description="好好吃饭，从一顿简单的家常开始。"
        action={
          <AddButton onClick={() => open({ kind: "meal_record" })}>
            记录一餐
          </AddButton>
        }
      />
      <Tabs
        items={[
          { id: "overview", label: "概览" },
          { id: "recipes", label: "食谱" },
          { id: "plan", label: "菜单" },
          { id: "shopping", label: "采购" },
          { id: "records", label: "记录" },
        ]}
        value={view}
        onChange={setView}
      />
      {["plan", "shopping", "overview"].includes(view) && (
        <div className="date-controls">
          <button
            className="icon-button"
            aria-label="上一周"
            onClick={() => setSelected(addDay(selected, -7))}
          >
            <ChevronLeft />
          </button>
          <span>
            {week} — {addDay(week, 6)}
          </span>
          <button
            className="icon-button"
            aria-label="下一周"
            onClick={() => setSelected(addDay(selected, 7))}
          >
            <ChevronRight />
          </button>
          <button onClick={() => setSelected(day)}>本周</button>
        </div>
      )}
      {view === "overview" ? (
        <>
          {records.isError && (
            <ErrorState
              error={records.error}
              retry={() => void records.refetch()}
            />
          )}
          {shopping.isError && (
            <ErrorState
              error={shopping.error}
              retry={() => void shopping.refetch()}
            />
          )}
          <div className="stats-grid">
            <Stat
              label="今日实际用餐"
              value={
                records.isSuccess
                  ? records.data.filter((r) => r.day === day).length
                  : "—"
              }
              detail="只统计明确保存的真实记录"
              sensitive={false}
            />
            <Stat
              label="本周实际自炊"
              value={
                records.isSuccess
                  ? records.data.filter(
                      (r) =>
                        r.source === "HOME_COOKED" &&
                        r.day >= week &&
                        r.day <= addDay(week, 6),
                    ).length
                  : "—"
              }
              detail="菜单计划不算作吃过"
              sensitive={false}
            />
            <Stat
              label="采购待购项"
              value={
                shopping.isSuccess
                  ? shopping.data?.items.filter((i) => Number(i.pending) > 0)
                      .length || 0
                  : "—"
              }
              detail="采购勾选不会生成财务消费"
              sensitive={false}
            />
          </div>
          <div className="dashboard-columns">
            <Card
              title="今天的菜单"
              action={
                <button className="text-button" onClick={() => setView("plan")}>
                  周菜单
                  <ArrowUpRight size={16} />
                </button>
              }
            >
              {plans.isPending ? (
                <Loading />
              ) : plans.isError ? (
                <ErrorState
                  error={plans.error}
                  retry={() => void plans.refetch()}
                />
              ) : (
                <div className="today-meals">
                  {Object.keys(slots)
                    .slice(0, 3)
                    .map((s) => mealCell(selected, s))}
                </div>
              )}
            </Card>
            <Card title="让一餐简单一点">
              <RecipeArt kind="vegetable" />
              <h3>从现有食谱里，找一点灵感。</h3>
              <p className="muted">
                配料、份数、制作步骤。按真实情况修改，不必计算热量。
              </p>
              <button onClick={() => setView("recipes")}>
                浏览食谱
                <ArrowRight size={16} />
              </button>
            </Card>
          </div>
        </>
      ) : view === "recipes" ? (
        <>
          <div className="filters">
            <label className="search-field">
              <Search size={17} />
              <input
                aria-label="搜索食谱"
                placeholder="搜索菜名、标签"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <input
              aria-label="排除食材"
              placeholder="排除食材，用逗号分隔"
              value={exclude}
              onChange={(e) => setExclude(e.target.value)}
            />
            <button onClick={() => open({ kind: "recipe" })}>
              <Plus size={16} />
              新增食谱
            </button>
          </div>
          <p className="fine-print">
            筛选只依据已知配料。未知过敏信息不能保证安全，请逐项核对。
          </p>
          {recipes.isPending ? (
            <Loading />
          ) : recipes.isError ? (
            <ErrorState
              error={recipes.error}
              retry={() => void recipes.refetch()}
            />
          ) : recipes.data.length ? (
            <div className="recipe-grid">
              {recipes.data.map((r) => (
                <button
                  className="recipe-card"
                  key={r.id}
                  onClick={() =>
                    open({
                      kind: "recipe_detail",
                      initial: r as unknown as Record<string, unknown>,
                    })
                  }
                >
                  <RecipeArt kind={r.illustration} />
                  <div className="recipe-info">
                    <h3>{r.name}</h3>
                    <p>{r.tags || "个人食谱"}</p>
                    <span>
                      <Clock size={14} />
                      {r.minutes} 分钟 <span>· {r.servings} 份</span>
                    </span>
                  </div>
                  <ArrowUpRight className="recipe-arrow" size={17} />
                </button>
              ))}
            </div>
          ) : (
            <Card>
              <Empty
                title={
                  search || exclude
                    ? "没有符合条件的食谱"
                    : "自己的家常食谱，从这里开始"
                }
                text={
                  search || exclude
                    ? "保留禁忌筛选，或明确修改筛选条件。"
                    : "手动添加，或导入三份基础食谱。食谱不会创建用餐记录。"
                }
                action={
                  search || exclude ? (
                    <button
                      onClick={() => {
                        setSearch("");
                        setExclude("");
                      }}
                    >
                      修改筛选
                    </button>
                  ) : (
                    <div className="form-footer">
                      <button onClick={() => open({ kind: "recipe" })}>
                        手动添加
                      </button>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await api("/diet/recipes/starter", {
                              method: "POST",
                            });
                            await refresh();
                            notify("已导入基础食谱，请自行核对配料和过敏信息");
                          } catch (e) {
                            notify(errorText(e));
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        导入基础食谱
                      </button>
                    </div>
                  )
                }
              />
            </Card>
          )}
        </>
      ) : view === "plan" ? (
        <Card title="本周三餐 · 计划">
          <div className="day-strip">
            {Array.from({ length: 7 }, (_, n) => addDay(week, n)).map((d) => (
              <button
                className={d === selected ? "active" : ""}
                key={d}
                onClick={() => setSelected(d)}
              >
                {new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(
                  new Date(d + "T12:00:00"),
                )}
                <b>{d.slice(8)}</b>
              </button>
            ))}
          </div>
          {plans.isPending ? (
            <Loading />
          ) : plans.isError ? (
            <ErrorState
              error={plans.error}
              retry={() => void plans.refetch()}
            />
          ) : (
            <>
              <div className="week-meal-grid">
                {Array.from({ length: 7 }, (_, n) => addDay(week, n)).map(
                  (d) => (
                    <div className="meal-day" key={d}>
                      <h3>{d.slice(5)}</h3>
                      {Object.keys(slots)
                        .slice(0, 3)
                        .map((s) => mealCell(d, s))}
                    </div>
                  ),
                )}
              </div>
              <div className="mobile-meal-day">
                {Object.keys(slots)
                  .slice(0, 3)
                  .map((s) => mealCell(selected, s))}
              </div>
              <p className="muted">
                计划不自动变成实际用餐；从「记录实际」打开后需核对并保存。
              </p>
            </>
          )}
        </Card>
      ) : view === "shopping" ? (
        <Card
          title="独立采购快照"
          action={
            shopping.data && (
              <button
                onClick={() =>
                  open({
                    kind: "shopping_item",
                    sourceId: shopping.data!.list.id,
                  })
                }
              >
                <Plus size={16} />
                手动加项
              </button>
            )
          }
        >
          {shopping.isPending ? (
            <Loading />
          ) : shopping.isError ? (
            <ErrorState
              error={shopping.error}
              retry={() => void shopping.refetch()}
            />
          ) : shopping.data ? (
            <>
              {shopping.data.plan_changed && (
                <p className="alert warning">
                  菜单或食谱已变化，采购清单尚未被覆盖。请核对需求差异。
                </p>
              )}
              <div className="shopping-toolbar">
                <button
                  onClick={() =>
                    open({ kind: "shopping_diff", id: shopping.data!.list.id })
                  }
                >
                  核对最新需求差异
                  <ArrowRight size={16} />
                </button>
                <button
                  onClick={() =>
                    open({
                      kind: "transaction",
                      sourceKind: "shopping_list",
                      sourceId: shopping.data!.list.id,
                      initial: {
                        type: "EXPENSE",
                        category: "食材",
                        description: "采购食材",
                      },
                    })
                  }
                >
                  去经济记账
                </button>
              </div>
              {shopping.data.items.length ? (
                shopping.data.items.map((i) => (
                  <div
                    className={
                      "grocery-row " +
                      (Number(i.pending) === 0 ? "purchased" : "")
                    }
                    key={i.id}
                  >
                    <button
                      className={
                        "grocery-check " +
                        (Number(i.pending) === 0 ? "checked" : "")
                      }
                      disabled={Number(i.pending) === 0}
                      aria-label={"买到全部待购 " + i.ingredient}
                      onClick={() => void purchase(i)}
                    >
                      {Number(i.pending) === 0 && <Check size={17} />}
                    </button>
                    <div className="row-main">
                      <strong>
                        {i.ingredient} <small>{i.specification}</small>
                      </strong>
                      <span>
                        已购 {i.purchased} · 待购 {i.pending} {i.unit}
                      </span>
                      {i.manual_override && (
                        <span className="badge neutral">人工改量 · 保护</span>
                      )}
                      {i.uncertain && (
                        <span className="warning-text">
                          数量或规格待人工核对
                        </span>
                      )}
                    </div>
                    <ShoppingQuantity
                      item={i}
                      listId={shopping.data!.list.id}
                    />
                  </div>
                ))
              ) : (
                <Empty
                  title="快照中还没有食材"
                  text="自由文本菜单无法猜算食材；可以手动加项。"
                />
              )}
              <p className="fine-print">
                勾选只记录采购事实，不会创建财务支出。部分买到时可填写本次数量。
              </p>
            </>
          ) : (
            <Empty
              title="先留一份采购快照"
              text="从本周结构化食谱生成。之后菜单变化会先展示差异，不覆盖已购或手改。"
              action={
                <button
                  className="primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api("/diet/shopping-lists", {
                        method: "POST",
                        body: { week },
                        key: key(),
                      });
                      await refresh();
                    } catch (e) {
                      notify(errorText(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <ShoppingBasket size={17} />
                  生成本周清单
                </button>
              }
            />
          )}
        </Card>
      ) : (
        <Card
          title="真实用餐记录"
          action={
            <button onClick={() => open({ kind: "meal_record" })}>
              <Plus size={16} />
              记录一餐
            </button>
          }
        >
          {records.isPending ? (
            <Loading />
          ) : records.isError ? (
            <ErrorState
              error={records.error}
              retry={() => void records.refetch()}
            />
          ) : records.data.length ? (
            records.data.map((r) => (
              <div className="meal-record" key={r.id}>
                <span className="record-icon">
                  <Utensils size={20} />
                </span>
                <div>
                  <h3>{r.description}</h3>
                  <p>
                    {r.day} · {slots[r.slot]} · {sourceLabels[r.source]}
                  </p>
                  {r.notes && <small>{r.notes}</small>}
                </div>
                <button
                  onClick={() =>
                    open({
                      kind: "meal_record",
                      id: r.id,
                      version: r.version,
                      initial: r as unknown as Record<string, unknown>,
                    })
                  }
                >
                  详情 / 编辑
                </button>
                <span className="badge neutral">真实记录</span>
              </div>
            ))
          ) : (
            <Empty
              title="今天，实际吃了什么？"
              text="外食、外卖或自炊都可以直接记录，不要求先有食谱。"
              action={
                <button onClick={() => open({ kind: "meal_record" })}>
                  记录一餐
                </button>
              }
            />
          )}
        </Card>
      )}
    </>
  );
}
function ShoppingQuantity({
  item,
  listId,
}: {
  item: ShoppingData["items"][number];
  listId: string;
}) {
  const { refresh, notify } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(item.pending);
  const [purchase, setPurchase] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        onClick={() => {
          setPending(item.pending);
          setOpen(true);
        }}
      >
        改量 / 部分已购
      </button>
      {open && (
        <Modal
          title={item.ingredient + " · 数量核对"}
          onClose={() => setOpen(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const body: Record<string, unknown> = {
                  expected_version: item.version,
                };
                if (pending !== item.pending) body.pending = pending;
                if (purchase) body.purchase_quantity = purchase;
                await api(
                  "/diet/shopping-lists/" + listId + "/items/" + item.id,
                  { method: "PATCH", body },
                );
                await refresh();
                setOpen(false);
              } catch (e) {
                notify(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              待购数量
              <input
                type="number"
                min="0"
                step="0.001"
                value={pending}
                onChange={(e) => setPending(e.target.value)}
                required
              />
              <small>修改后标记为人工调整，后续菜单差异不会覆盖。</small>
            </label>
            <label>
              本次实际买到
              <input
                type="number"
                min="0.001"
                step="0.001"
                value={purchase}
                onChange={(e) => setPurchase(e.target.value)}
              />
            </label>
            <p>
              之前已购 {item.purchased} {item.unit}，不会被改量抹掉。
            </p>
            <button className="primary" disabled={busy}>
              保存数量
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

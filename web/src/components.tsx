import { useEffect, useId, useRef, type ReactNode } from "react";
import {
  X,
  ArrowRight,
  Inbox,
  AlertCircle,
  RefreshCw,
  Leaf,
  Plus,
  Check,
  Clock,
  CalendarDays,
} from "lucide-react";
import { useWorkspace } from "./context";
import { api, errorText } from "./api";
import type { Task, Event } from "./types";

export function Sensitive({ children }: { children: ReactNode }) {
  const { user } = useWorkspace();
  return user.privacy_masked ? (
    <span className="masked" aria-label="敏感内容已隐藏">
      ••••••
    </span>
  ) : (
    <>{children}</>
  );
}
export function Card({
  children,
  title,
  action,
  className = "",
}: {
  children: ReactNode;
  title?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={"card " + className}>
      {title && (
        <div className="section-head">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Empty({
  title = "这里还没有记录",
  text = "从一件小事开始，慢慢整理自己的节奏。",
  action,
}: {
  title?: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Leaf size={28} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div role="status" className="loading">
      <div className="skeleton" />
      <div className="skeleton" />
      <p>正在读取你的工作台…</p>
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <div role="alert" className="error-state">
      <AlertCircle />
      <h3>暂时无法读取数据</h3>
      <p>{errorText(error)}</p>
      <button onClick={retry}>
        <RefreshCw size={16} />
        重新加载
      </button>
    </div>
  );
}
export function Stat({
  label,
  value,
  detail,
  icon,
  sensitive = true,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  sensitive?: boolean;
}) {
  return (
    <div className="stat">
      <div className="stat-label">
        {label}
        {icon}
      </div>
      <div className="stat-value">
        {sensitive ? <Sensitive>{value}</Sensitive> : value}
      </div>
      {detail && (
        <div className="stat-detail">
          {sensitive ? <Sensitive>{detail}</Sensitive> : detail}
        </div>
      )}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Tabs({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <nav className="tabs" aria-label="模块视图">
      {items.map((i) => (
        <button
          key={i.id}
          aria-current={value === i.id ? "page" : undefined}
          className={value === i.id ? "active" : ""}
          onClick={() => onChange(i.id)}
        >
          {i.label}
        </button>
      ))}
    </nav>
  );
}
export function Modal({
  title,
  children,
  onClose,
  full = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  full?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const node = ref.current!;
    document.body.style.overflow = "hidden";
    node.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab") {
        const nodes = [
          ...node.querySelectorAll<HTMLElement>(
            "button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]",
          ),
        ].filter((v) => v.offsetParent !== null);
        if (!nodes.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === node)
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last || document.activeElement === node)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className="overlay">
      <div
        className={"modal " + (full ? "detail-modal" : "")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-head">
          <h2 id={id}>{title}</h2>
          <button
            className="icon-button"
            aria-label="关闭面板"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
export function TaskRows({
  tasks,
  onDetail,
}: {
  tasks: Task[];
  onDetail?: (task: Task) => void;
}) {
  const { refresh, notify, open, user } = useWorkspace();
  const update = async (t: Task) => {
    try {
      await api("/tasks/" + t.id, {
        method: "PATCH",
        body: {
          expected_version: t.version,
          status: t.status === "COMPLETED" ? "TODO" : "COMPLETED",
        },
      });
      await refresh();
    } catch (e) {
      notify(errorText(e));
    }
  };
  return (
    <div className="task-list">
      {tasks.map((t) => (
        <div
          key={t.id}
          className={
            "task-row " + (t.status === "COMPLETED" ? "completed" : "")
          }
        >
          <button
            className={
              "task-check " + (t.status === "COMPLETED" ? "checked" : "")
            }
            aria-label={
              (t.status === "COMPLETED" ? "重新打开任务 " : "完成任务 ") +
              t.title
            }
            onClick={() => void update(t)}
          >
            {t.status === "COMPLETED" && <Check size={15} />}
          </button>
          <button
            className="row-main"
            onClick={() =>
              onDetail
                ? onDetail(t)
                : open({
                    kind: "task",
                    id: t.id,
                    version: t.version,
                    initial: t as unknown as Record<string, unknown>,
                  })
            }
          >
            <strong>{t.title}</strong>
            <span>
              {t.source_kind
                ? "领域任务 · "
                : t.parent_id
                  ? "重复实例 · "
                  : "任务 · "}
              {t.scheduled_time || "未定时"}
              {t.due_at ? " · 截止 " + t.due_at : ""}
              {t.status === "CANCELLED" ? " · 已取消" : ""}
            </span>
          </button>
          {t.source_kind && (
            <button
              className="text-button"
              onClick={() =>
                open({
                  kind: "source",
                  sourceKind: t.source_kind!,
                  sourceId: t.source_id!,
                  initial: { task: t },
                })
              }
            >
              来源
              <ArrowRight size={14} />
            </button>
          )}
          {t.scheduled_date !== dayAtUser(user.timezone) &&
            t.status !== "CANCELLED" && (
              <button
                className="icon-button"
                title="安排今天"
                aria-label={"安排今天 " + t.title}
                onClick={async () => {
                  try {
                    await api(
                      "/tasks/" +
                        t.id +
                        "/schedule-today?expected_version=" +
                        t.version,
                      { method: "POST" },
                    );
                    await refresh();
                  } catch (e) {
                    notify(errorText(e));
                  }
                }}
              >
                <CalendarDays size={17} />
              </button>
            )}
        </div>
      ))}
    </div>
  );
}
function dayAtUser(tz: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function EventRows({ events }: { events: Event[] }) {
  const { user, open } = useWorkspace();
  return (
    <div>
      {events.map((e) => (
        <div className="task-row event-row" key={e.id}>
          <span className="event-symbol">
            <Clock size={17} />
          </span>
          <button
            className="row-main"
            onClick={() =>
              open({
                kind: "event",
                id: e.id,
                version: e.version,
                initial: e as unknown as Record<string, unknown>,
              })
            }
          >
            <strong>{e.title}</strong>
            <span>
              事件 ·{" "}
              {e.all_day
                ? "全天"
                : new Intl.DateTimeFormat("zh-CN", {
                    timeZone: user.timezone,
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(e.start_at))}{" "}
              · 不计任务完成
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}
export function AddButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="primary" onClick={onClick}>
      <Plus size={18} />
      {children}
    </button>
  );
}

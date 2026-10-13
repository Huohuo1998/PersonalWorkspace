import { Clock, CalendarDays } from "lucide-react";
import { useWorkspace } from "./context";
import { dayAt, timeIn } from "./api";
import type { Task, Event } from "./types";

export function TemporalCalendar({
  days,
  tasks,
  events,
  today,
}: {
  days: string[];
  tasks: Task[];
  events: Event[];
  today: string;
}) {
  const { user, open } = useWorkspace();
  const minute = (iso: string) => {
    const time = timeIn(iso, user.timezone);
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };
  const touches = (e: Event, d: string) =>
    dayAt(user.timezone, new Date(e.start_at)) <= d &&
    dayAt(user.timezone, new Date(e.end_at)) >= d;
  return (
    <div className="temporal-calendar desktop-calendar">
      <div
        className="temporal-header"
        style={{
          gridTemplateColumns: `44px repeat(${days.length},minmax(0,1fr))`,
        }}
      >
        <span className="calendar-zone">{user.timezone.split("/").pop()}</span>
        {days.map((d) => (
          <div className={d === today ? "current-date" : ""} key={d}>
            <span>
              {new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(
                new Date(d + "T12:00:00Z"),
              )}
            </span>
            <strong>{d.slice(8)}</strong>
          </div>
        ))}
      </div>
      <div
        className="all-day-grid"
        style={{
          gridTemplateColumns: `44px repeat(${days.length},minmax(0,1fr))`,
        }}
      >
        <span className="calendar-zone">全天 / 重点</span>
        {days.map((d) => (
          <div key={d}>
            {events
              .filter((e) => e.all_day && touches(e, d))
              .map((e) => (
                <button
                  className="calendar-event"
                  key={e.id}
                  onClick={() =>
                    open({
                      kind: "event",
                      id: e.id,
                      version: e.version,
                      initial: e as unknown as Record<string, unknown>,
                    })
                  }
                >
                  <Clock size={13} />
                  事件 · {e.title}
                </button>
              ))}
            {tasks
              .filter((t) => t.scheduled_date === d && !t.scheduled_time)
              .map((t) => (
                <button
                  className="calendar-task"
                  key={t.id}
                  onClick={() =>
                    open({
                      kind: "task",
                      id: t.id,
                      version: t.version,
                      initial: t as unknown as Record<string, unknown>,
                    })
                  }
                >
                  □ 任务 · {t.title}
                </button>
              ))}
          </div>
        ))}
      </div>
      <div
        className="time-grid"
        style={{
          gridTemplateColumns: `44px repeat(${days.length},minmax(0,1fr))`,
        }}
      >
        <div className="time-gutter">
          {Array.from({ length: 24 }, (_, h) => (
            <time key={h} style={{ top: h * 44 }}>
              {String(h).padStart(2, "0")}:00
            </time>
          ))}
        </div>
        {days.map((d) => (
          <div className="time-day" key={d}>
            {Array.from({ length: 24 }, (_, h) => (
              <div className="hour-rule" key={h} style={{ top: h * 44 }} />
            ))}
            {events
              .filter((e) => !e.all_day && touches(e, d))
              .map((e) => {
                const startDay = dayAt(user.timezone, new Date(e.start_at)),
                  endDay = dayAt(user.timezone, new Date(e.end_at));
                const start = startDay < d ? 0 : minute(e.start_at),
                  end = endDay > d ? 1440 : minute(e.end_at);
                if (end <= start) return null;
                return (
                  <button
                    key={e.id}
                    className="time-event"
                    style={{
                      top: (start / 60) * 44,
                      height: Math.max(44, ((end - start) / 60) * 44),
                    }}
                    onClick={() =>
                      open({
                        kind: "event",
                        id: e.id,
                        version: e.version,
                        initial: e as unknown as Record<string, unknown>,
                      })
                    }
                  >
                    <Clock size={12} />
                    <b>{e.title}</b>
                    <small>
                      事件 · {timeIn(e.start_at, user.timezone)}–
                      {timeIn(e.end_at, user.timezone)}
                    </small>
                  </button>
                );
              })}
            {tasks
              .filter((t) => t.scheduled_date === d && t.scheduled_time)
              .map((t) => {
                const [h, m] = t.scheduled_time!.split(":").map(Number);
                return (
                  <button
                    key={t.id}
                    className="time-task"
                    style={{ top: ((h * 60 + m) / 60) * 44 }}
                    onClick={() =>
                      open({
                        kind: "task",
                        id: t.id,
                        version: t.version,
                        initial: t as unknown as Record<string, unknown>,
                      })
                    }
                  >
                    <CalendarDays size={12} />
                    <b>{t.title}</b>
                    <small>任务 · {t.scheduled_time} · 执行时点</small>
                  </button>
                );
              })}
          </div>
        ))}
      </div>
      <p className="calendar-caption">
        任务标记执行时点，不虚构占用时长。仅截止的任务显示在今日重点，不绘制全天时间块。
      </p>
    </div>
  );
}

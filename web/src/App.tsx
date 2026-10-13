import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  NavLink,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  Wallet,
  Activity,
  Utensils,
  Plus,
  Eye,
  EyeOff,
  Settings,
  LogOut,
  Leaf,
  ArrowUpRight,
  Check,
  LockKeyhole,
} from "lucide-react";
import { api, errorText, dayAt } from "./api";
import { WorkspaceContext, type CreateAction } from "./context";
import { Modal, Loading, ErrorState } from "./components";
import { CreateDialog, SettingsDialog } from "./forms";
import { Dashboard, Schedule, Finance, Fitness, Diet } from "./pages";
import type { User } from "./types";

const nav = [
  ["/", "首页", LayoutDashboard],
  ["/schedule", "日程", CalendarDays],
  ["/finance", "经济", Wallet],
  ["/fitness", "运动", Activity],
  ["/diet", "饮食", Utensils],
] as const;
function Auth({ done }: { done: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      await api("/auth/csrf");
      const user = await api<User>("/auth/" + mode, {
        method: "POST",
        body: {
          email: f.get("email"),
          password: f.get("password"),
          name: f.get("name") || "朋友",
        },
      });
      done(user);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="auth-layout">
      <div className="auth-story">
        <Link className="brand" to="/">
          <span className="brand-mark">
            <Leaf size={24} />
          </span>
          Personal
          <br />
          Workspace
        </Link>
        <div>
          <p className="eyebrow">A LITTLE SPACE, JUST FOR YOU</p>
          <h1>
            生活有序，
            <br />
            从容一点。
          </h1>
          <p>
            把日程、财务、运动与饮食放在一起。
            <br />
            给每一天，留一点清晰的空间。
          </p>
          <div className="auth-tiles">
            {nav.slice(1).map(([, label, Icon]) => (
              <span key={label}>
                <Icon size={22} />
                {label}
              </span>
            ))}
          </div>
        </div>
        <small>
          <LockKeyhole size={14} /> 个人数据按账户隔离，只属于你
        </small>
      </div>
      <main className="auth-main">
        <div className="auth-card">
          <span className="badge">你的私人生活工作台</span>
          <h2>{mode === "login" ? "欢迎回来" : "开启自己的空间"}</h2>
          <p>
            {mode === "login"
              ? "登录，继续自己的节奏。"
              : "无需配置所有模块，随时从一件小事开始。"}
          </p>
          <form onSubmit={submit}>
            {mode === "register" && (
              <label>
                怎么称呼你
                <input
                  name="name"
                  required
                  maxLength={80}
                  autoComplete="nickname"
                  placeholder="你的名字"
                />
              </label>
            )}
            <label>
              邮箱
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </label>
            <label>
              密码
              <input
                type="password"
                name="password"
                required
                minLength={10}
                maxLength={128}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                placeholder="至少 10 个字符"
              />
            </label>
            {error && (
              <p className="alert danger" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="primary wide" disabled={pending}>
              {pending
                ? "正在验证…"
                : mode === "login"
                  ? "登录工作台"
                  : "创建账户"}
              <ArrowUpRight size={18} />
            </button>
          </form>
          <p className="auth-switch">
            {mode === "login" ? "还没有账户？" : "已经有账户？"}
            <button
              className="text-button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
            >
              {mode === "login" ? "创建自己的空间" : "返回登录"}
            </button>
          </p>
          <p className="fine-print">
            不创建示例账单或健康数据。密码经 Argon2id 哈希保存。
          </p>
        </div>
      </main>
    </div>
  );
}
export default function App() {
  const client = useQueryClient();
  const location = useLocation();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<User>("/me") });
  const [action, setAction] = useState<CreateAction | null>(null);
  const [createMenu, setCreateMenu] = useState(false);
  const [settings, setSettings] = useState(false);
  const [toast, setToast] = useState("");
  const [offline, setOffline] = useState(!navigator.onLine);
  const [expired, setExpired] = useState(false);
  const refresh = useCallback(async () => {
    await client.invalidateQueries();
  }, [client]);
  const notify = useCallback((message: string) => setToast(message), []);
  const open = useCallback(
    (a: CreateAction) => {
      setAction({
        ...a,
        returnTo: a.returnTo || location.pathname + location.search,
      });
      setCreateMenu(false);
    },
    [location],
  );
  const close = useCallback(() => setAction(null), []);
  const closeSettings = useCallback(() => setSettings(false), []);
  const closeMenu = useCallback(() => setCreateMenu(false), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const on = () => setOffline(false),
      off = () => setOffline(true);
    const auth = () => {
      setExpired(true);
      client.setQueryData(["me"], null);
      client.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("auth-expired", auth);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("auth-expired", auth);
    };
  }, [client]);
  if (me.isPending) return <Loading />;
  if (!me.data) {
    if (me.error && "status" in me.error && me.error.status !== 401)
      return <ErrorState error={me.error} retry={() => void me.refetch()} />;
    return (
      <>
        <Auth
          done={(u) => {
            setExpired(false);
            setAction(null);
            client.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
            client.setQueryData(["me"], u);
          }}
        />
        {expired && (
          <p className="auth-expired" role="alert">
            会话已失效。请重新登录，当前敏感输入已隐藏。
          </p>
        )}
      </>
    );
  }
  const user = me.data;
  const day = dayAt(user.timezone);
  const dateLabel = new Intl.DateTimeFormat("zh-CN", {
    timeZone: user.timezone,
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
  return (
    <WorkspaceContext.Provider value={{ user, refresh, open, notify }}>
      <div className="workspace">
        <a href="#main" className="skip-link">
          跳到主要内容
        </a>
        <aside className="sidebar">
          <Link to="/" className="brand">
            <span className="brand-mark">
              <Leaf size={24} />
            </span>
            <span>
              Personal
              <br />
              Workspace
            </span>
          </Link>
          <p className="nav-caption">我的生活空间</p>
          <nav aria-label="主导航">
            {nav.map(([path, label, Icon]) => (
              <NavLink key={path} to={path} end={path === "/"}>
                <Icon size={20} />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-note">
            <Leaf size={21} />
            <p>
              按照自己的节奏，
              <br />
              让生活一点点有序。
            </p>
            <span>YOUR SPACE, YOUR PACE</span>
          </div>
          <button
            className="sidebar-settings"
            onClick={() => setSettings(true)}
          >
            <Settings size={18} />
            个人设置
          </button>
          <div className="user-block">
            <span className="avatar">{user.name.slice(0, 1)}</span>
            <span>
              <strong>{user.name}</strong>
              <small>私人工作台</small>
            </span>
            <button
              className="icon-button"
              aria-label="退出登录"
              onClick={async () => {
                try {
                  await api("/auth/logout", { method: "POST" });
                  client.setQueryData(["me"], null);
                  client.removeQueries({
                    predicate: (q) => q.queryKey[0] !== "me",
                  });
                  setAction(null);
                } catch (e) {
                  notify(errorText(e));
                }
              }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </aside>
        <div className="content-shell">
          <header className="topbar">
            <span>
              <span className="live-dot" /> {dateLabel}
            </span>
            <div className="top-actions">
              <button
                className="icon-button"
                aria-label={
                  user.privacy_masked ? "显示敏感摘要" : "隐藏敏感摘要"
                }
                title="隐私遮蔽"
                onClick={async () => {
                  try {
                    await api("/me/preferences", {
                      method: "PATCH",
                      body: { privacy_masked: !user.privacy_masked },
                    });
                    await refresh();
                  } catch (e) {
                    notify(errorText(e));
                  }
                }}
              >
                {user.privacy_masked ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
              <button
                className="icon-button mobile-settings"
                aria-label="个人设置"
                onClick={() => setSettings(true)}
              >
                <Settings size={19} />
              </button>
              <button
                className="primary compact"
                onClick={() => setCreateMenu(true)}
              >
                <Plus size={18} />
                新增
              </button>
            </div>
          </header>
          {offline && (
            <div className="alert warning" role="alert">
              当前处于离线状态。已保存数据仍保留；新提交需联网确认。
            </div>
          )}
          {user.privacy_masked && (
            <div className="privacy-banner">
              <EyeOff size={14} />
              隐私遮蔽已开启 · 主动编辑中的必要字段仍可见
            </div>
          )}
          <main id="main" className="main-content">
            <Routes>
              <Route path="/" element={<Dashboard day={day} />} />
              <Route path="/schedule" element={<Schedule day={day} />} />
              <Route path="/finance" element={<Finance day={day} />} />
              <Route path="/fitness" element={<Fitness day={day} />} />
              <Route path="/diet" element={<Diet day={day} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <footer className="page-footer">
              <Leaf size={13} />
              Personal Workspace <span>一点点整理，慢慢来。</span>
            </footer>
          </main>
        </div>
        <nav className="bottom-nav" aria-label="手机主导航">
          {nav.map(([path, label, Icon]) => (
            <NavLink key={path} to={path} end={path === "/"}>
              <Icon size={21} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
      {createMenu && (
        <Modal title="想记录些什么？" onClose={closeMenu}>
          <p className="muted">每一次新增，都回到对应的真实记录。</p>
          <div className="create-grid">
            {[
              ["task", "任务", CalendarDays],
              ["event", "事件", CalendarDays],
              ["transaction", "记一笔", Wallet],
              ["quick_activity", "运动", Activity],
              ["meal_record", "用餐", Utensils],
            ].map(([kind, label, Icon]) => {
              const I = Icon as typeof Plus;
              return (
                <button
                  key={kind as string}
                  onClick={() => open({ kind: kind as string })}
                >
                  <I size={25} />
                  <strong>{label as string}</strong>
                  <ArrowUpRight size={16} />
                </button>
              );
            })}
          </div>
        </Modal>
      )}
      {action && (
        <CreateDialog
          key={action.kind + ":" + (action.id || "new")}
          action={action}
          onClose={close}
        />
      )}
      {settings && <SettingsDialog onClose={closeSettings} />}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button
            className="icon-button"
            aria-label="关闭提示"
            onClick={() => setToast("")}
          >
            ×
          </button>
        </div>
      )}
    </WorkspaceContext.Provider>
  );
}

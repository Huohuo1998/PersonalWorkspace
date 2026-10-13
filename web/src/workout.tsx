import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Play,
  Pause,
  Flag,
  Plus,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { api, ApiError, errorText, key } from "./api";
import { useWorkspace } from "./context";
import { Card, Modal } from "./components";
import type { WorkoutSession, WorkoutSet } from "./types";

export function WorkoutFocus({ session }: { session: WorkoutSession }) {
  const { refresh, notify, user } = useWorkspace();
  const client = useQueryClient();
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [newExercise, setNewExercise] = useState("");
  const [busy, setBusy] = useState(false);
  const [finish, setFinish] = useState<"COMPLETED" | "ABORTED" | null>(null);
  const [error, setError] = useState("");
  const [unknown, setUnknown] = useState<string | null>(null);
  const report = useCallback(
    (id: string, state: string) => setEditing((v) => ({ ...v, [id]: state })),
    [],
  );
  const dirty = Object.values(editing).some((v) => v !== "saved");
  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [dirty]);
  const state = async (status: string) => {
    setBusy(true);
    setError("");
    const requestKey = unknown || key();
    try {
      if (unknown) {
        const r = await api<{ status: string }>("/operations/" + requestKey);
        if (r.status !== "SUCCESS") {
          setError("结果仍未知，请稍后再次查询。");
          return;
        }
      } else {
        if (dirty) throw new Error("仍有未保存或冲突的训练组，请先处理。");
        await api("/fitness/sessions/" + session.id + "/state", {
          method: "POST",
          key: requestKey,
          body: {
            expected_version: session.version,
            status,
            expected_set_versions: Object.fromEntries(
              session.sets.map((s) => [s.id, s.version]),
            ),
          },
        });
      }
      setUnknown(null);
      setFinish(null);
      await refresh();
      notify(
        status === "COMPLETED"
          ? "训练已确认完成"
          : status === "ABORTED"
            ? "训练已中止，实际组已保留"
            : status === "PAUSED"
              ? "训练已暂停"
              : "训练已恢复",
      );
    } catch (e) {
      setError(errorText(e));
      if (
        (!(e instanceof ApiError) &&
          !(e instanceof Error && e.message.startsWith("仍有"))) ||
        (e instanceof ApiError && e.status >= 500)
      )
        setUnknown(requestKey);
    } finally {
      setBusy(false);
    }
  };
  const addSet = async () => {
    if (!newExercise.trim()) return;
    setBusy(true);
    try {
      await api("/fitness/sessions/" + session.id + "/sets", {
        method: "POST",
        key: key(),
        body: { exercise: newExercise.trim(), completed: false },
      });
      setNewExercise("");
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const closeFinish = useCallback(() => {
    if (!busy && !unknown) setFinish(null);
  }, [busy, unknown]);
  return (
    <div className="workout-focus">
      <Card>
        <div className="section-head">
          <div>
            <span className="badge">
              {session.status === "PAUSED" ? "已暂停" : "训练专注模式"}
            </span>
            <h2>{session.name}</h2>
          </div>
          <span className="save-indicator">
            {dirty ? "有待保存组" : "全部组已确认保存"}
          </span>
        </div>
        {user.privacy_masked && (
          <p className="alert info">
            当前训练输入可见可编辑，其他摘要仍保持遮蔽。
          </p>
        )}
        <p className="muted">
          每组修改后自动保存。刷新只恢复服务器已确认的版本；失败或冲突时保留本端输入供处理。
        </p>
        <div className="set-head">
          <span>组 / 动作</span>
          <span>重量 kg</span>
          <span>次数</span>
          <span>时长 秒</span>
          <span>实际完成</span>
        </div>
        {session.sets.map((s) => (
          <SetEditor
            key={s.id}
            item={s}
            session={session}
            report={report}
            onSaved={(saved, sessionVersion) => {
              client.setQueryData<WorkoutSession | null>(
                ["active-workout"],
                (old) =>
                  old
                    ? {
                        ...old,
                        version: sessionVersion,
                        sets: old.sets.map((v) =>
                          v.id === saved.id ? saved : v,
                        ),
                      }
                    : old,
              );
            }}
          />
        ))}
        {!session.sets.length && (
          <p className="quiet-empty">
            还没有训练组。添加一个动作后，记录实际重量、次数或时长。
          </p>
        )}
        {session.status === "IN_PROGRESS" && (
          <form
            className="add-set"
            onSubmit={(e) => {
              e.preventDefault();
              void addSet();
            }}
          >
            <input
              aria-label="新增训练动作名称"
              value={newExercise}
              onChange={(e) => setNewExercise(e.target.value)}
              placeholder="动作名称，例如：深蹲"
              required
              maxLength={100}
            />
            <button disabled={busy} type="submit">
              <Plus size={16} />
              添加一组
            </button>
          </form>
        )}
        {error && (
          <p role="alert" className="alert danger">
            {error}
          </p>
        )}
      </Card>
      <div className="workout-actions">
        <span>
          {session.sets.filter((s) => s.completed).length} 组已确认完成
        </span>
        {unknown ? (
          <button
            className="primary"
            disabled={busy}
            onClick={() => void state(finish || session.status)}
          >
            查询原操作结果
          </button>
        ) : (
          <>
            <button
              disabled={busy || dirty}
              onClick={() =>
                void state(
                  session.status === "PAUSED" ? "IN_PROGRESS" : "PAUSED",
                )
              }
            >
              {session.status === "PAUSED" ? (
                <Play size={17} />
              ) : (
                <Pause size={17} />
              )}
              {session.status === "PAUSED" ? "恢复" : "暂停"}
            </button>
            <button
              className="primary"
              disabled={busy || dirty}
              onClick={() => setFinish("COMPLETED")}
            >
              <Flag size={17} />
              结束核对
            </button>
            <button
              disabled={busy || dirty}
              onClick={() => setFinish("ABORTED")}
            >
              中止
            </button>
          </>
        )}
      </div>
      {finish && (
        <Modal
          title={finish === "COMPLETED" ? "确认结束训练" : "确认中止训练"}
          onClose={closeFinish}
        >
          <p>
            实际完成 {session.sets.filter((s) => s.completed).length} 组；未完成{" "}
            {session.sets.filter((s) => !s.completed).length} 组。
          </p>
          <p className="alert info">
            只记录真实完成的组，不会把计划组自动记为完成。已保存组将保留在历史中。
          </p>
          {error && (
            <p className="alert danger" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary wide"
            disabled={busy || dirty}
            onClick={() => void state(finish)}
          >
            {busy
              ? "提交中…"
              : unknown
                ? "查询原操作结果"
                : finish === "COMPLETED"
                  ? "确认完成"
                  : "确认中止"}
          </button>
        </Modal>
      )}
    </div>
  );
}
function SetEditor({
  item,
  session,
  report,
  onSaved,
}: {
  item: WorkoutSet;
  session: WorkoutSession;
  report: (id: string, state: string) => void;
  onSaved: (s: WorkoutSet, v: number) => void;
}) {
  const [draft, setDraft] = useState({ ...item });
  const [status, setStatus] = useState("saved");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [server, setServer] = useState<WorkoutSet | null>(null);
  const [serverSessionVersion, setServerSessionVersion] = useState(
    session.version,
  );
  const sending = useRef(false);
  const local = useRef(draft);
  const pending = useRef(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    report(item.id, status);
  }, [item.id, status, report]);
  const change = (field: string, value: unknown) => {
    const next = { ...local.current, [field]: value };
    local.current = next;
    pending.current = true;
    setDraft(next);
    setStatus("pending");
    setMessage("");
    setRevision((v) => v + 1);
  };
  useEffect(() => {
    if (
      !pending.current ||
      status === "conflict" ||
      status === "failed" ||
      session.status !== "IN_PROGRESS"
    )
      return;
    let cancelled = false;
    const timeout = setTimeout(async () => {
      if (sending.current) return;
      sending.current = true;
      const snapshot = { ...local.current };
      setStatus("saving");
      try {
        const result = await api<{ set: WorkoutSet; session_version: number }>(
          "/fitness/sessions/" + session.id + "/sets/" + item.id,
          {
            method: "PATCH",
            body: {
              exercise: snapshot.exercise,
              weight: snapshot.weight || null,
              reps: snapshot.reps,
              seconds: snapshot.seconds,
              completed: snapshot.completed,
              expected_version: snapshot.version,
            },
          },
        );
        onSaved(result.set, result.session_version);
        if (JSON.stringify(local.current) === JSON.stringify(snapshot)) {
          local.current = result.set;
          pending.current = false;
          setDraft(result.set);
          setStatus("saved");
        } else {
          local.current = { ...local.current, version: result.set.version };
          setDraft(local.current);
          setStatus("pending");
          setRevision((v) => v + 1);
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          setStatus("conflict");
          setServer((e.details.current as WorkoutSet) || null);
          setServerSessionVersion(
            Number(e.details.session_version || session.version),
          );
        } else setStatus("failed");
        setMessage(errorText(e));
      } finally {
        sending.current = false;
        if (pending.current && !cancelled) setRetry((v) => v + 1);
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [revision, retry, session.id, session.status, item.id, status, onSaved]);
  // Unsaved values stay in this component on a refetch; no automatic server overwrite.
  return (
    <div className="set-editor">
      <div className="set-row">
        <label className="exercise-input">
          <span className="set-number">{item.ordinal}</span>
          <input
            aria-label={"第" + item.ordinal + "组动作"}
            value={draft.exercise}
            disabled={session.status === "PAUSED"}
            onChange={(e) => change("exercise", e.target.value)}
          />
        </label>
        <label>
          <span className="mobile-field-label">重量 kg</span>
          <input
            type="number"
            min="0"
            step="0.01"
            aria-label={"第" + item.ordinal + "组重量"}
            value={draft.weight || ""}
            disabled={session.status === "PAUSED"}
            onChange={(e) => change("weight", e.target.value || null)}
          />
        </label>
        <label>
          <span className="mobile-field-label">次数</span>
          <input
            type="number"
            min="0"
            max="10000"
            step="1"
            aria-label={"第" + item.ordinal + "组次数"}
            value={draft.reps ?? ""}
            disabled={session.status === "PAUSED"}
            onChange={(e) =>
              change("reps", e.target.value ? Number(e.target.value) : null)
            }
          />
        </label>
        <label>
          <span className="mobile-field-label">秒</span>
          <input
            type="number"
            min="0"
            max="86400"
            step="1"
            aria-label={"第" + item.ordinal + "组时长"}
            value={draft.seconds ?? ""}
            disabled={session.status === "PAUSED"}
            onChange={(e) =>
              change("seconds", e.target.value ? Number(e.target.value) : null)
            }
          />
        </label>
        <label className="set-complete">
          <input
            type="checkbox"
            aria-label={"第" + item.ordinal + "组实际完成"}
            checked={draft.completed}
            disabled={session.status === "PAUSED"}
            onChange={(e) => change("completed", e.target.checked)}
          />
          <span>完成</span>
        </label>
      </div>
      <p
        className={
          "set-status " +
          (status === "failed" || status === "conflict" ? "danger-text" : "")
        }
        role="status"
      >
        {status === "saved" ? (
          <CheckCircle size={13} />
        ) : status === "failed" || status === "conflict" ? (
          <AlertTriangle size={13} />
        ) : (
          <RefreshCw size={13} />
        )}
        {status === "saved"
          ? "已保存 · v" + draft.version
          : status === "saving"
            ? "保存中…"
            : status === "pending"
              ? "等待自动保存"
              : status === "conflict"
                ? "版本冲突 · 本端输入保留"
                : "保存失败 · 本端输入保留"}
      </p>
      {message && (
        <div className="alert warning">
          <p>{message}</p>
          {status === "conflict" ? (
            <>
              <p>
                服务器版本 {server?.version}：{server?.weight || 0} kg ×{" "}
                {server?.reps || 0} 次。先核对，再明确选择。
              </p>
              <button
                onClick={() => {
                  if (!server) return;
                  local.current = server;
                  pending.current = false;
                  setDraft(server);
                  setStatus("saved");
                  onSaved(server, serverSessionVersion);
                  setMessage("");
                }}
              >
                采用服务器值（放弃本端输入）
              </button>
              <button
                onClick={() => {
                  if (!server) return;
                  local.current = { ...local.current, version: server.version };
                  setDraft(local.current);
                  setStatus("pending");
                  setRevision((v) => v + 1);
                }}
              >
                已核对，以本端输入重新保存
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                setStatus("pending");
                setRevision((v) => v + 1);
              }}
            >
              重试保存当前输入
            </button>
          )}
        </div>
      )}
    </div>
  );
}

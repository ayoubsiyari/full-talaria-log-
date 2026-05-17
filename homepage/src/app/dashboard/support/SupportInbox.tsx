"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import "../dashboard-shell.css";

type User = {
  id: number;
  name: string;
  email: string;
  role?: string;
};

type Thread = {
  id: number;
  user_id: number;
  user_name?: string | null;
  user_email?: string | null;
  subject: string;
  category: string;
  status: string;
  last_message_at?: string | null;
  last_message_preview?: string | null;
};

type Attachment = {
  id: number;
  url: string;
  mime_type?: string;
  original_name?: string | null;
};

type Msg = {
  id: number;
  thread_id: number;
  sender_user_id: number;
  sender_name?: string | null;
  body: string;
  created_at?: string | null;
  read_by_counterparty?: boolean;
  attachment?: Attachment | null;
};

const SUPPORT_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

async function api<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string>) };
  if (
    opts.body != null &&
    !(opts.body instanceof FormData) &&
    !headers["Content-Type"]
  ) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, {
    ...opts,
    credentials: "include",
    headers,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail || `Error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function wsUrl(): string {
  const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = typeof window !== "undefined" ? window.location.host : "";
  return `${proto}//${host}/ws/support`;
}

export type SupportInboxProps = {
  /** Render inside Settings profile (no duplicate page header). */
  embedded?: boolean;
  /** Deep-link thread id from `?thread=` */
  initialThreadId?: string | null;
};

function SupportFileUpload({
  inputRef,
  file,
  disabled,
  onPick,
  onClear,
  id,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  file: File | null;
  disabled?: boolean;
  onPick: (file: File | null) => void;
  onClear: () => void;
  id: string;
}) {
  return (
    <div className="db-file-upload">
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        disabled={disabled}
        className="db-file-upload__input"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        className="db-btn-sm"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        Choose file
      </button>
      <span className="db-file-upload__name">{file ? file.name : "No file chosen"}</span>
      {file ? (
        <button
          type="button"
          className="db-btn-sm db-file-upload__clear"
          disabled={disabled}
          onClick={() => {
            if (inputRef.current) inputRef.current.value = "";
            onClear();
          }}
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

export function SupportInbox({ embedded = false, initialThreadId }: SupportInboxProps = {}) {
  const [user, setUser] = useState<User | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [newCategory, setNewCategory] = useState("other");
  const [newBody, setNewBody] = useState("");
  const [newThreadFile, setNewThreadFile] = useState<File | null>(null);
  const [replyFile, setReplyFile] = useState<File | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const newThreadFileRef = useRef<HTMLInputElement | null>(null);
  const replyFileRef = useRef<HTMLInputElement | null>(null);
  const threadsRef = useRef(threads);
  threadsRef.current = threads;

  const selected = threads.find((t) => t.id === selectedId) ?? null;

  const loadThreads = useCallback(async () => {
    const data = await api<{ threads: Thread[] }>("/api/support/threads");
    setThreads(data.threads || []);
  }, []);

  const loadMessages = useCallback(async (threadId: number) => {
    const data = await api<{ messages: Msg[] }>(
      `/api/support/threads/${threadId}/messages?limit=200`
    );
    setMessages(data.messages || []);
  }, []);

  const markThreadRead = useCallback(async (threadId: number) => {
    try {
      await api(`/api/support/threads/${threadId}/read`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await api<{ user: User }>("/api/auth/me");
        if (!alive) return;
        setUser(me.user);
        await loadThreads();
        const tid =
          initialThreadId ??
          (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("thread") : null);
        if (tid) {
          const id = parseInt(tid, 10);
          if (!Number.isNaN(id)) {
            setSelectedId(id);
            await loadMessages(id);
            await markThreadRead(id);
          }
        }
      } catch {
        window.location.replace(
          `/login/?next=${encodeURIComponent("/dashboard/profile/?tab=support")}`,
        );
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadThreads, loadMessages, markThreadRead, initialThreadId]);

  const disconnectWs = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    }
  }, []);

  const connectWs = useCallback(
    (threadId: number) => {
      disconnectWs();
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      ws.onopen = () => {
        try {
          ws.send(JSON.stringify({ type: "subscribe_inbox" }));
          ws.send(JSON.stringify({ type: "subscribe", thread_id: threadId }));
        } catch {
          /* ignore */
        }
      };
      ws.onmessage = (ev) => {
        try {
          const d = JSON.parse(ev.data) as {
            type?: string;
            thread_id?: number;
            message?: Msg;
            requester_read_upto?: number;
            staff_read_upto?: number;
          };
          if (d.type === "notification_ping") {
            return;
          }
          if (d.type === "read_receipt" && d.thread_id === threadId) {
            const req = d.requester_read_upto ?? 0;
            const stf = d.staff_read_upto ?? 0;
            const th0 = threadsRef.current.find((t) => t.id === threadId);
            const owner = th0?.user_id;
            setMessages((prev) =>
              prev.map((m) => {
                if (owner == null) return m;
                const read =
                  m.sender_user_id === owner ? stf >= m.id : req >= m.id;
                return { ...m, read_by_counterparty: read };
              })
            );
            return;
          }
          if (d.type === "message" && d.message && d.thread_id === threadId) {
            setMessages((prev) => {
              if (prev.some((x) => x.id === d.message!.id)) return prev;
              return [...prev, d.message!];
            });
          }
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
      };
    },
    [disconnectWs]
  );

  useEffect(() => {
    if (!selectedId) {
      disconnectWs();
      return;
    }
    connectWs(selectedId);
    return () => disconnectWs();
  }, [selectedId, connectWs, disconnectWs]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectThread = async (id: number) => {
    setSelectedId(id);
    await loadMessages(id);
    await markThreadRead(id);
  };

  const sendReply = async () => {
    const body = reply.trim();
    if ((!body && !replyFile) || !selectedId || selected?.status === "closed") return;
    if (replyFile && replyFile.size > SUPPORT_IMAGE_MAX_BYTES) {
      setUploadErr("Image must be 2 MB or smaller.");
      return;
    }
    setUploadErr(null);
    if (replyFile) {
      const fd = new FormData();
      fd.append("body", body);
      fd.append("file", replyFile);
      await api(`/api/support/threads/${selectedId}/messages`, {
        method: "POST",
        body: fd,
      });
    } else {
      await api(`/api/support/threads/${selectedId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
    }
    setReply("");
    setReplyFile(null);
    if (replyFileRef.current) replyFileRef.current.value = "";
    await loadMessages(selectedId);
    await markThreadRead(selectedId);
    await loadThreads();
  };

  const createThread = async () => {
    const subject = newSubject.trim();
    const body = newBody.trim();
    if (!subject || (!body && !newThreadFile)) return;
    if (newThreadFile && newThreadFile.size > SUPPORT_IMAGE_MAX_BYTES) {
      setUploadErr("Image must be 2 MB or smaller.");
      return;
    }
    setUploadErr(null);
    let data: { thread: Thread };
    if (newThreadFile) {
      const fd = new FormData();
      fd.append("subject", subject);
      fd.append("category", newCategory);
      fd.append("body", body);
      fd.append("file", newThreadFile);
      data = await api<{ thread: Thread }>("/api/support/threads", {
        method: "POST",
        body: fd,
      });
    } else {
      data = await api<{ thread: Thread }>("/api/support/threads", {
        method: "POST",
        body: JSON.stringify({
          subject,
          category: newCategory,
          body,
        }),
      });
    }
    setNewSubject("");
    setNewBody("");
    setNewThreadFile(null);
    if (newThreadFileRef.current) newThreadFileRef.current.value = "";
    setNewCategory("other");
    setShowNew(false);
    await loadThreads();
    if (data.thread?.id) {
      setSelectedId(data.thread.id);
      await loadMessages(data.thread.id);
      await markThreadRead(data.thread.id);
    }
  };

  if (loading || !user) {
    return (
      <div className="db-card" style={{ padding: 48, textAlign: "center", color: "#4a4850" }}>
        Loading…
      </div>
    );
  }

  const ownerId = selected ? selected.user_id : null;
  const isClosed = selected?.status === "closed";

  return (
    <div className={embedded ? "prof-settings__support-embed db-page" : "db-page"}>
      {!embedded ? (
        <div>
          <h1 className="db-hero-greeting" style={{ fontSize: 26, marginBottom: 8 }}>
            Support
          </h1>
          <p style={{ color: "#4a4850", fontSize: 13, margin: 0 }}>
            Report bugs, errors, or ask for help. You can attach a screenshot (max 2 MB). Messages are delivered to the
            team in real time.
          </p>
        </div>
      ) : null}
      {uploadErr && (
        <div style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }} role="alert">
          {uploadErr}
        </div>
      )}

      <div className="db-support-grid">
        <div className="db-card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "14px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: "#e8e4dc" }}>Conversations</span>
            <button
              type="button"
              className="db-btn-sm db-btn-accent"
              onClick={() => setShowNew((s) => !s)}
            >
              {showNew ? "Cancel" : "New"}
            </button>
          </div>
          {showNew && (
            <div style={{ padding: 16, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <label className="db-field-label">Subject</label>
              <input
                className="db-field-input"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                placeholder="Short summary"
                style={{ marginBottom: 10 }}
              />
              <label className="db-field-label">Category</label>
              <select
                className="db-field-input"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                style={{ marginBottom: 10 }}
              >
                <option value="bug">Bug</option>
                <option value="error">Error</option>
                <option value="other">Other</option>
              </select>
              <label className="db-field-label">Message</label>
              <textarea
                className="db-field-input"
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                rows={4}
                placeholder="Describe the issue… (optional if you attach a screenshot)"
                style={{ marginBottom: 10, resize: "vertical" }}
              />
              <label className="db-field-label" htmlFor="support-new-screenshot">
                Screenshot (optional, max 2 MB)
              </label>
              <SupportFileUpload
                id="support-new-screenshot"
                inputRef={newThreadFileRef}
                file={newThreadFile}
                onPick={(f) => {
                  setNewThreadFile(f);
                  setUploadErr(null);
                }}
                onClear={() => {
                  setNewThreadFile(null);
                  setUploadErr(null);
                }}
              />
              <button
                type="button"
                className="db-btn-sm db-btn-accent"
                disabled={!newSubject.trim() || (!newBody.trim() && !newThreadFile)}
                onClick={() => void createThread()}
              >
                Send request
              </button>
            </div>
          )}
          <div style={{ maxHeight: "min(60vh, 520px)", overflowY: "auto" }}>
            {threads.length === 0 && (
              <div style={{ padding: 24, color: "#4a4850", fontSize: 13 }}>No threads yet — start one above.</div>
            )}
            {threads.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => void selectThread(t.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "12px 16px",
                  border: "none",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  background: t.id === selectedId ? "rgba(200,240,96,0.06)" : "transparent",
                  cursor: "pointer",
                  color: "#e8e4dc",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13 }}>{t.subject}</div>
                <div style={{ fontSize: 11, color: "#4a4850", marginTop: 4 }}>
                  {t.category} · {t.status}
                  {user.role === "admin" && (t.user_email || t.user_name)
                    ? ` · ${t.user_name || t.user_email}`
                    : ""}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="db-card" style={{ padding: 0, display: "flex", flexDirection: "column", minHeight: 480 }}>
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {selected ? selected.subject : "Select a conversation"}
          </div>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              minHeight: 280,
              background: "rgba(0,0,0,0.2)",
            }}
          >
            {!selected && (
              <div style={{ color: "#4a4850", fontSize: 13 }}>Choose a thread on the left or create a new one.</div>
            )}
            {selected &&
              messages.map((m) => {
                const isOwner = ownerId != null && m.sender_user_id === ownerId;
                return (
                  <div
                    key={m.id}
                    style={{
                      alignSelf: isOwner ? "flex-start" : "flex-end",
                      maxWidth: "85%",
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: isOwner ? "rgba(255,255,255,0.05)" : "rgba(59,130,246,0.12)",
                      border: `1px solid ${isOwner ? "rgba(255,255,255,0.08)" : "rgba(59,130,246,0.25)"}`,
                    }}
                  >
                    <div style={{ fontSize: 10, color: "#4a4850", marginBottom: 6, textTransform: "uppercase" }}>
                      {isOwner ? "You" : "Support"} · {m.sender_name || ""}
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {m.body || ""}
                    </div>
                    {m.attachment?.url && (
                      <a
                        href={m.attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: "block", marginTop: 8 }}
                      >
                        <img
                          src={m.attachment.url}
                          alt=""
                          loading="lazy"
                          style={{
                            maxWidth: "100%",
                            maxHeight: 240,
                            borderRadius: 8,
                            display: "block",
                          }}
                        />
                      </a>
                    )}
                    {m.read_by_counterparty === true ? (
                      <div style={{ fontSize: 10, color: "#4ade80", marginTop: 6, textAlign: "right" }}>Read</div>
                    ) : m.read_by_counterparty === false ? (
                      <div style={{ fontSize: 10, color: "#4a4850", marginTop: 6, textAlign: "right" }}>Delivered</div>
                    ) : null}
                  </div>
                );
              })}
            <div ref={messagesEndRef} />
          </div>
          <div
            style={{
              padding: 16,
              borderTop: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <textarea
                className="db-field-input"
                value={reply}
                onChange={(e) => {
                  setReply(e.target.value);
                  setUploadErr(null);
                }}
                placeholder={
                  selected ? (isClosed ? "Thread closed" : "Type a message… (optional if you attach a screenshot)") : "Select a thread"
                }
                disabled={!selected || isClosed}
                rows={3}
                style={{ flex: 1, resize: "vertical" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendReply();
                  }
                }}
              />
              <button
                type="button"
                className="db-btn-sm db-btn-accent"
                disabled={!selected || isClosed || (!reply.trim() && !replyFile)}
                onClick={() => void sendReply()}
              >
                Send
              </button>
            </div>
            <label className="db-field-label" htmlFor="support-reply-screenshot">
              Screenshot (optional, max 2 MB)
            </label>
            <SupportFileUpload
              id="support-reply-screenshot"
              inputRef={replyFileRef}
              file={replyFile}
              disabled={!selected || isClosed}
              onPick={(f) => {
                setReplyFile(f);
                setUploadErr(null);
              }}
              onClear={() => {
                setReplyFile(null);
                setUploadErr(null);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SUPPORT_CATEGORIES, buildSupportContext } from "../support/supportUi";

const F = "'Exo 2', sans-serif";
const C = {
  sf: "#111520",
  bg: "#0a0c12",
  tx: "#e8ecff",
  ts: "#8b95b8",
  tm: "#5c6688",
  br: "rgba(140,160,255,0.15)",
  acL: "#6b8cff",
  acD: "rgba(74,106,255,0.12)",
  hv: "rgba(140,160,255,0.08)",
};

type Thread = {
  id: number;
  user_id: number;
  subject: string;
  category: string;
  status: string;
  last_message_at?: string | null;
  last_message_preview?: string | null;
};

type Msg = {
  id: number;
  sender_user_id: number;
  body: string;
  created_at?: string | null;
  read_by_counterparty?: boolean;
  attachment?: { url?: string; mime_type?: string } | null;
};

const IMAGE_MAX = 2 * 1024 * 1024;

async function supportApi<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string>) };
  if (opts.body != null && !(opts.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, { ...opts, credentials: "include", headers });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(err.detail || `Error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function wsUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/support`;
}

function threadIsOpen(status: string) {
  return status === "open" || status === "pending";
}

function fmtTime(iso?: string | null) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return (
      d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
      " " +
      d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    );
  } catch {
    return "";
  }
}

function popoverPosition() {
  const navAnchor = window.__TALARIA_SUPPORT_NAV_ANCHOR__;
  const btnR = navAnchor?.getBoundingClientRect() ?? null;
  const POP_W = 360;
  const POP_H = 500;
  const maxPopH = Math.min(POP_H, window.innerHeight * 0.75);
  let right = Math.max(8, window.innerWidth - 76);
  let top = Math.max(8, window.innerHeight - maxPopH - 16);
  if (btnR) {
    right = Math.max(8, window.innerWidth - btnR.right - 4);
    const below = Math.round(btnR.bottom + 6);
    const above = Math.round(btnR.top - maxPopH - 6);
    top = below + maxPopH <= window.innerHeight - 8 ? below : Math.max(8, above);
  }
  return { top, right, width: POP_W, maxHeight: maxPopH };
}

/** Chart-style support ticket dropdown for V16 dashboard (when chart is not mounted). */
export function V16SupportChatPopover() {
  const [open, setOpen] = useState(false);
  const [hov, setHov] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selThread, setSelThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newThread, setNewThread] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newCategory, setNewCategory] = useState("other");
  const [newBody, setNewBody] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);
  const [reply, setReply] = useState("");
  const [replyFile, setReplyFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("all");

  const popRef = useRef<HTMLDivElement | null>(null);
  const msgEndRef = useRef<HTMLDivElement | null>(null);
  const newFileRef = useRef<HTMLInputElement | null>(null);
  const replyFileRef = useRef<HTMLInputElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  const disconnectWs = useCallback(() => {
    if (pingRef.current) {
      clearInterval(pingRef.current);
      pingRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    }
  }, []);

  const loadThreads = useCallback(async () => {
    const data = await supportApi<{ threads: Thread[] }>("/api/support/threads");
    setThreads(data.threads || []);
  }, []);

  const loadMessages = useCallback(async (threadId: number) => {
    const data = await supportApi<{ messages: Msg[] }>(
      `/api/support/threads/${threadId}/messages?limit=200`
    );
    setMessages(data.messages || []);
  }, []);

  const markRead = useCallback(async (threadId: number) => {
    try {
      await supportApi(`/api/support/threads/${threadId}/read`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
    } catch {
      /* ignore */
    }
  }, []);

  const connectWs = useCallback(
    (threadId?: number) => {
      disconnectWs();
      try {
        const ws = new WebSocket(wsUrl());
        wsRef.current = ws;
        ws.onopen = () => {
          try {
            ws.send(JSON.stringify({ type: "subscribe_inbox" }));
            if (threadId) ws.send(JSON.stringify({ type: "subscribe", thread_id: threadId }));
          } catch {
            /* ignore */
          }
          pingRef.current = setInterval(() => {
            try {
              ws.send(JSON.stringify({ type: "ping" }));
            } catch {
              /* ignore */
            }
          }, 30000);
        };
        ws.onmessage = (ev) => {
          try {
            const d = JSON.parse(ev.data);
            if (d.type === "notification_ping") {
              void loadThreads();
              return;
            }
            if (d.type === "message" && d.message && d.thread_id === threadId) {
              setMessages((prev) =>
                prev.some((x) => x.id === d.message.id) ? prev : [...prev, d.message]
              );
              void loadThreads();
            }
          } catch {
            /* ignore */
          }
        };
        ws.onclose = () => {
          if (wsRef.current === ws) wsRef.current = null;
        };
      } catch {
        /* ignore */
      }
    },
    [disconnectWs, loadThreads]
  );

  const sendReply = async () => {
    const body = reply.trim();
    if ((!body && !replyFile) || !selThread) return;
    if (replyFile && replyFile.size > IMAGE_MAX) {
      setError("Image must be 2 MB or smaller.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      if (replyFile) {
        const fd = new FormData();
        fd.append("body", body);
        fd.append("file", replyFile);
        await supportApi(`/api/support/threads/${selThread.id}/messages`, { method: "POST", body: fd });
      } else {
        await supportApi(`/api/support/threads/${selThread.id}/messages`, {
          method: "POST",
          body: JSON.stringify({ body }),
        });
      }
      setReply("");
      setReplyFile(null);
      if (replyFileRef.current) replyFileRef.current.value = "";
      await loadMessages(selThread.id);
      await markRead(selThread.id);
      await loadThreads();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    }
    setSending(false);
  };

  const createThread = async () => {
    const subject = newSubject.trim();
    const body = newBody.trim();
    if (!subject || (!body && !newFile)) return;
    if (newFile && newFile.size > IMAGE_MAX) {
      setError("File must be 2 MB or smaller.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      let data: { thread?: Thread };
      const ctx = buildSupportContext();
      if (newFile) {
        const fd = new FormData();
        fd.append("subject", subject);
        fd.append("category", newCategory);
        fd.append("body", body);
        fd.append("context", JSON.stringify(ctx));
        fd.append("file", newFile);
        data = await supportApi("/api/support/threads", { method: "POST", body: fd });
      } else {
        data = await supportApi("/api/support/threads", {
          method: "POST",
          body: JSON.stringify({ subject, category: newCategory, body, context: ctx }),
        });
      }
      setNewSubject("");
      setNewBody("");
      setNewFile(null);
      setNewCategory("other");
      if (newFileRef.current) newFileRef.current.value = "";
      setNewThread(false);
      await loadThreads();
      if (data.thread?.id) {
        setSelThread(data.thread);
        await loadMessages(data.thread.id);
        await markRead(data.thread.id);
        connectWs(data.thread.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    }
    setSending(false);
  };

  useEffect(() => {
    window.__TALARIA_TOGGLE_SUPPORT__ = toggle;
    return () => {
      delete window.__TALARIA_TOGGLE_SUPPORT__;
    };
  }, [toggle]);

  useEffect(() => {
    try {
      window.dispatchEvent(new CustomEvent("talaria-support-chat-change", { detail: { open } }));
    } catch {
      /* ignore */
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node;
      const navAnchor = window.__TALARIA_SUPPORT_NAV_ANCHOR__;
      if (navAnchor?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      disconnectWs();
      return;
    }
    setLoading(true);
    void loadThreads().finally(() => setLoading(false));
    if (!wsRef.current) connectWs(selThread?.id);
  }, [open, disconnectWs, loadThreads, connectWs, selThread?.id]);

  useEffect(() => {
    if (!selThread) return;
    void loadMessages(selThread.id);
    void markRead(selThread.id);
    connectWs(selThread.id);
  }, [selThread?.id, loadMessages, markRead, connectWs]);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!open || typeof document === "undefined") return null;

  const pos = popoverPosition();
  const openCount = threads.filter((t) => threadIsOpen(t.status)).length;
  const closedCount = threads.length - openCount;
  const filtered = threads.filter((t) => {
    if (statusFilter === "open") return threadIsOpen(t.status);
    if (statusFilter === "closed") return !threadIsOpen(t.status);
    return true;
  });
  const catLabel = Object.fromEntries(SUPPORT_CATEGORIES.map((c) => [c.value, c.label]));

  const filterChip = (id: "all" | "open" | "closed", label: string, count?: number) => {
    const active = statusFilter === id;
    return (
      <div
        key={id}
        onClick={() => setStatusFilter(id)}
        onMouseEnter={() => setHov(`filter-${id}`)}
        onMouseLeave={() => setHov(null)}
        style={{
          cursor: "default",
          padding: "3px 8px",
          borderRadius: 4,
          fontSize: 10,
          fontWeight: 700,
          flexShrink: 0,
          color: active
            ? id === "open"
              ? "#4caf50"
              : id === "closed"
                ? "#e53935"
                : C.acL
            : C.ts,
          background: active
            ? id === "open"
              ? "rgba(76,175,80,0.14)"
              : id === "closed"
                ? "rgba(229,57,53,0.14)"
                : C.acD
            : hov === `filter-${id}`
              ? C.hv
              : "rgba(255,255,255,0.04)",
          border: `1px solid ${active ? (id === "open" ? "rgba(76,175,80,0.35)" : id === "closed" ? "rgba(229,57,53,0.35)" : "rgba(74,106,255,0.35)") : C.br}`,
        }}
      >
        {label}
        {count != null ? ` (${count})` : ""}
      </div>
    );
  };

  return createPortal(
    <div
      ref={popRef}
      data-v9-chrome="1"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top: pos.top,
        right: pos.right,
        width: pos.width,
        height: 500,
        maxHeight: "min(75vh, 560px)",
        background: C.sf,
        border: "1px solid rgba(140,160,255,0.32)",
        borderRadius: 6,
        boxShadow: "0 10px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.4)",
        zIndex: 100010,
        display: "flex",
        flexDirection: "column",
        fontFamily: F,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          borderBottom: `1px solid ${C.br}`,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
        }}
      >
        {selThread && !newThread ? (
          <>
            <div
              onClick={() => {
                setSelThread(null);
                setMessages([]);
                setError(null);
              }}
              style={{ cursor: "default", display: "flex", alignItems: "center", padding: "2px 4px" }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={C.ts} strokeWidth="2.5" strokeLinecap="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.tx, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {selThread.subject}
            </span>
            {selThread.status === "closed" ? (
              <span style={{ fontSize: 10, color: "#e53935", fontWeight: 700, background: "rgba(229,57,53,0.12)", padding: "1px 6px", borderRadius: 3 }}>
                Closed
              </span>
            ) : null}
          </>
        ) : (
          <>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.acL} strokeWidth="1.5">
              <path d="M4 4h16v12H9l-5 4V4z" strokeLinejoin="round" />
              <line x1="8" y1="9" x2="16" y2="9" strokeLinecap="round" />
              <line x1="8" y1="12.5" x2="13" y2="12.5" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.tx, flex: 1 }}>{newThread ? "New Thread" : "Support"}</span>
            {!newThread ? (
              <div
                onClick={() => {
                  setNewThread(true);
                  setError(null);
                }}
                style={{ cursor: "default", padding: "3px 10px", borderRadius: 4, background: C.acD, color: C.acL, fontSize: 11, fontWeight: 700 }}
              >
                + New
              </div>
            ) : (
              <div
                onClick={() => {
                  setNewThread(false);
                  setError(null);
                }}
                style={{ cursor: "default", padding: "3px 8px", borderRadius: 4, color: C.ts, fontSize: 11, fontWeight: 600 }}
              >
                Cancel
              </div>
            )}
          </>
        )}
      </div>

      {error ? (
        <div style={{ padding: "6px 14px", background: "rgba(229,57,53,0.12)", color: "#e53935", fontSize: 11, fontWeight: 600, borderBottom: `1px solid ${C.br}` }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.ts, fontSize: 13 }}>Loading…</div>
      ) : newThread ? (
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.tm, display: "block", marginBottom: 4 }}>Subject</label>
            <input
              type="text"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              placeholder="Brief description…"
              maxLength={200}
              style={{ width: "100%", boxSizing: "border-box", padding: "6px 10px", fontSize: 12, background: C.bg, color: C.tx, border: `1px solid ${C.br}`, borderRadius: 4, outline: "none", fontFamily: F }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.tm, display: "block", marginBottom: 4 }}>Category</label>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              style={{ width: "100%", padding: "6px 10px", fontSize: 12, background: C.bg, color: C.tx, border: `1px solid ${C.br}`, borderRadius: 4, outline: "none", fontFamily: F }}
            >
              {SUPPORT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.tm, display: "block", marginBottom: 4 }}>Message</label>
            <textarea
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder="Describe your issue…"
              rows={4}
              style={{ width: "100%", boxSizing: "border-box", padding: "6px 10px", fontSize: 12, background: C.bg, color: C.tx, border: `1px solid ${C.br}`, borderRadius: 4, outline: "none", fontFamily: F, resize: "vertical" }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: C.ts }}>
            <label style={{ cursor: "default" }}>
              {newFile ? newFile.name.slice(0, 20) : "Attach image"}
              <input ref={newFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => setNewFile(e.target.files?.[0] ?? null)} />
            </label>
            {newFile ? (
              <span
                onClick={() => {
                  setNewFile(null);
                  if (newFileRef.current) newFileRef.current.value = "";
                }}
                style={{ cursor: "default", color: "#e53935" }}
              >
                ✕
              </span>
            ) : null}
          </div>
          <button
            type="button"
            disabled={sending || !newSubject.trim() || (!newBody.trim() && !newFile)}
            onClick={() => void createThread()}
            style={{ padding: "8px 0", fontSize: 13, fontWeight: 700, borderRadius: 4, border: "none", cursor: "default", background: C.acL, color: "#fff", opacity: sending ? 0.6 : 1, marginTop: 4 }}
          >
            {sending ? "Sending…" : "Create Thread"}
          </button>
        </div>
      ) : selThread ? (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
            {messages.length === 0 ? (
              <div style={{ color: C.ts, fontSize: 12, textAlign: "center", padding: 20 }}>No messages yet.</div>
            ) : null}
            {messages.map((msg) => {
              const isOwn = msg.sender_user_id === selThread.user_id;
              return (
                <div
                  key={msg.id}
                  style={{ display: "flex", flexDirection: "column", alignItems: isOwn ? "flex-end" : "flex-start", maxWidth: "85%", alignSelf: isOwn ? "flex-end" : "flex-start" }}
                >
                  <div
                    style={{
                      padding: "7px 11px",
                      borderRadius: isOwn ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                      background: isOwn ? C.acD : "rgba(255,255,255,0.06)",
                      border: `1px solid ${isOwn ? "rgba(74,106,255,0.25)" : "rgba(255,255,255,0.08)"}`,
                      maxWidth: "100%",
                    }}
                  >
                    {msg.attachment?.url && (msg.attachment.mime_type || "").startsWith("image/") ? (
                      <img src={msg.attachment.url} alt="" style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 4, marginBottom: msg.body ? 6 : 0, display: "block" }} />
                    ) : null}
                    {msg.body ? (
                      <div style={{ fontSize: 12, color: C.tx, wordBreak: "break-word", whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{msg.body}</div>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                    <span style={{ fontSize: 9, color: C.tm }}>{fmtTime(msg.created_at)}</span>
                    {isOwn ? (
                      <span style={{ fontSize: 9, color: msg.read_by_counterparty ? C.acL : C.tm }}>{msg.read_by_counterparty ? "Read" : "Sent"}</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
            <div ref={msgEndRef} />
          </div>
          {selThread.status !== "closed" ? (
            <div style={{ padding: "8px 10px", borderTop: `1px solid ${C.br}`, display: "flex", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
              <label style={{ cursor: "default", padding: 4 }}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={replyFile ? C.acL : C.ts} strokeWidth="1.6">
                  <path d="M16.5 6v11.5a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V6" />
                  <path d="M20 6H4" />
                </svg>
                <input ref={replyFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => setReplyFile(e.target.files?.[0] ?? null)} />
              </label>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                {replyFile ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: C.ts }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{replyFile.name}</span>
                    <span
                      onClick={() => {
                        setReplyFile(null);
                        if (replyFileRef.current) replyFileRef.current.value = "";
                      }}
                      style={{ cursor: "default", color: "#e53935" }}
                    >
                      ✕
                    </span>
                  </div>
                ) : null}
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Type a message…"
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendReply();
                    }
                  }}
                  style={{ width: "100%", boxSizing: "border-box", padding: "6px 10px", fontSize: 12, background: C.bg, color: C.tx, border: `1px solid ${C.br}`, borderRadius: 6, outline: "none", fontFamily: F, resize: "none", maxHeight: 80 }}
                />
              </div>
              <div
                onClick={() => {
                  if (!sending) void sendReply();
                }}
                style={{ cursor: "default", display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 6, background: C.acL, opacity: sending ? 0.5 : 1, flexShrink: 0 }}
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="#fff">
                  <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
                </svg>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          {threads.length > 0 ? (
            <div style={{ padding: "8px 14px", borderBottom: `1px solid ${C.br}`, display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              {filterChip("all", "All", threads.length)}
              {filterChip("open", "Open", openCount)}
              {filterChip("closed", "Closed", closedCount)}
            </div>
          ) : null}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {threads.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: C.ts, fontSize: 12 }}>
                No support threads yet.
                <br />
                Click <b>+ New</b> to start one.
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: C.ts, fontSize: 12 }}>
                No {statusFilter === "open" ? "open" : "closed"} tickets.
              </div>
            ) : (
              filtered.map((t) => (
                <div
                  key={t.id}
                  onClick={() => {
                    setSelThread(t);
                    setError(null);
                  }}
                  onMouseEnter={() => setHov(`t-${t.id}`)}
                  onMouseLeave={() => setHov(null)}
                  style={{
                    padding: "10px 14px",
                    borderBottom: `1px solid ${C.br}`,
                    cursor: "default",
                    background: hov === `t-${t.id}` ? C.hv : "transparent",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.tx, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.subject}</span>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: threadIsOpen(t.status) ? "#4caf50" : "#e53935",
                        background: threadIsOpen(t.status) ? "rgba(76,175,80,0.12)" : "rgba(229,57,53,0.12)",
                        padding: "1px 6px",
                        borderRadius: 3,
                        flexShrink: 0,
                      }}
                    >
                      {threadIsOpen(t.status) ? "Open" : "Closed"}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                    <span style={{ fontSize: 10, color: C.tm, background: "rgba(140,160,255,0.1)", padding: "0 5px", borderRadius: 2, textTransform: "capitalize" }}>
                      {catLabel[t.category] || t.category}
                    </span>
                    {t.last_message_preview ? (
                      <span style={{ fontSize: 10, color: C.tm, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.last_message_preview}</span>
                    ) : null}
                    {t.last_message_at ? <span style={{ fontSize: 9, color: C.tm, flexShrink: 0 }}>{fmtTime(t.last_message_at)}</span> : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>,
    document.body
  );
}

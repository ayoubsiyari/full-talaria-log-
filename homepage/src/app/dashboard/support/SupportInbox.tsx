"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import "../dashboard-shell.css";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_FILE_ACCEPT,
  SupportCategoryBadge,
  buildSupportContext,
} from "./supportUi";

type User = {
  id: number;
  name: string;
  email: string;
  role?: string;
};

type Thread = {
  id: number;
  ticket_ref?: string;
  user_id: number;
  user_name?: string | null;
  user_email?: string | null;
  subject: string;
  category: string;
  status: string;
  priority?: string;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  csat_rating?: number | null;
  csat_at?: string | null;
  context?: Record<string, string> | null;
  related_ticket_ref?: string | null;
  tags?: string[];
};

function ticketRef(t: Thread): string {
  return t.ticket_ref ?? `TAL-${String(t.id).padStart(5, "0")}`;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    open: "Open",
    pending: "Awaiting your reply",
    resolved: "Resolved",
    user_replied: "Follow-up sent",
    closed: "Closed",
  };
  return map[status] ?? status;
}

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
        accept={SUPPORT_FILE_ACCEPT}
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
  const [newTags, setNewTags] = useState("");
  const [structChange, setStructChange] = useState("");
  const [structCurrent, setStructCurrent] = useState("");
  const [structExpected, setStructExpected] = useState("");
  const [structFeature, setStructFeature] = useState("");
  const [structUseCase, setStructUseCase] = useState("");
  const [csatSending, setCsatSending] = useState(false);
  const [exporting, setExporting] = useState(false);
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
    try {
      const data = await api<{ messages: Msg[] }>(
        `/api/support/threads/${threadId}/messages?limit=200`
      );
      setMessages(data.messages || []);
    } catch {
      setMessages([]);
      setSelectedId(null);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("thread");
        window.history.replaceState({}, "", url.pathname + url.search);
      }
    }
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
            const visible = (await api<{ threads: Thread[] }>("/api/support/threads")).threads || [];
            if (visible.some((t) => t.id === id)) {
              setSelectedId(id);
              await loadMessages(id);
              await markThreadRead(id);
            }
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
    // resolved tickets accept replies (moves to admin user-replied queue on server)
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
    const structured: Record<string, string> = {};
    if (newCategory === "modifications") {
      if (structChange.trim()) structured.change_summary = structChange.trim();
      if (structCurrent.trim()) structured.current_behavior = structCurrent.trim();
      if (structExpected.trim()) structured.expected_behavior = structExpected.trim();
    } else if (newCategory === "suggestions") {
      if (structFeature.trim()) structured.feature_summary = structFeature.trim();
      if (structUseCase.trim()) structured.use_case = structUseCase.trim();
    }
    const payload: Record<string, unknown> = {
      subject,
      category: newCategory,
      body,
      context: buildSupportContext(),
      structured: Object.keys(structured).length ? structured : undefined,
      tags: newTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };
    let data: { thread: Thread };
    if (newThreadFile) {
      const fd = new FormData();
      fd.append("subject", subject);
      fd.append("category", newCategory);
      fd.append("body", body);
      fd.append("context", JSON.stringify(payload.context));
      if (payload.structured) fd.append("structured", JSON.stringify(payload.structured));
      if (payload.tags && (payload.tags as string[]).length) {
        fd.append("tags", (payload.tags as string[]).join(","));
      }
      fd.append("file", newThreadFile);
      data = await api<{ thread: Thread }>("/api/support/threads", {
        method: "POST",
        body: fd,
      });
    } else {
      data = await api<{ thread: Thread }>("/api/support/threads", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    setNewSubject("");
    setNewBody("");
    setNewTags("");
    setStructChange("");
    setStructCurrent("");
    setStructExpected("");
    setStructFeature("");
    setStructUseCase("");
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

  const exportMyTickets = async () => {
    setExporting(true);
    setUploadErr(null);
    try {
      const res = await fetch("/api/support/threads/export", { credentials: "include" });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(err.detail || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `talaria-tickets-u${user?.id ?? "me"}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
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
  const isResolved = selected?.status === "resolved";
  const isUserReplied = selected?.status === "user_replied";

  return (
    <div className={embedded ? "prof-settings__support-embed db-page" : "db-page"}>
      {!embedded ? (
        <div>
          <h1 className="db-hero-greeting" style={{ fontSize: 26, marginBottom: 8 }}>
            Support tickets
          </h1>
          <p style={{ color: "#4a4850", fontSize: 13, margin: 0 }}>
            Open a ticket for billing, access, bugs, or general help. Attach a screenshot (max 2 MB). The team replies in
            real time.
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
            <span style={{ fontSize: 12, fontWeight: 700, color: "#e8e4dc" }}>
              Your tickets{threads.length ? ` (${threads.length})` : ""}
            </span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="db-btn-sm"
                disabled={exporting || threads.length === 0}
                title="Download a JSON file you can send to support for admin import"
                onClick={() => void exportMyTickets()}
              >
                {exporting ? "Exporting…" : "Export my tickets"}
              </button>
              <button
                type="button"
                className="db-btn-sm db-btn-accent"
                onClick={() => setShowNew((s) => !s)}
              >
                {showNew ? "Cancel" : "New"}
              </button>
            </div>
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
                {SUPPORT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              {(newCategory === "modifications" || newCategory === "suggestions") && (
                <div className="support-structured-block">
                  {newCategory === "modifications" ? (
                    <>
                      <input
                        className="db-field-input"
                        placeholder="What should change?"
                        value={structChange}
                        onChange={(e) => setStructChange(e.target.value)}
                      />
                      <input
                        className="db-field-input"
                        placeholder="Current behavior (optional)"
                        value={structCurrent}
                        onChange={(e) => setStructCurrent(e.target.value)}
                      />
                      <input
                        className="db-field-input"
                        placeholder="Expected behavior (optional)"
                        value={structExpected}
                        onChange={(e) => setStructExpected(e.target.value)}
                      />
                    </>
                  ) : (
                    <>
                      <input
                        className="db-field-input"
                        placeholder="Feature / idea summary"
                        value={structFeature}
                        onChange={(e) => setStructFeature(e.target.value)}
                      />
                      <input
                        className="db-field-input"
                        placeholder="Use case (optional)"
                        value={structUseCase}
                        onChange={(e) => setStructUseCase(e.target.value)}
                      />
                    </>
                  )}
                </div>
              )}
              <label className="db-field-label">Tags (optional, comma-separated)</label>
              <input
                className="db-field-input"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="v9-chart, mobile"
                style={{ marginBottom: 10 }}
              />
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
                Screenshot or log/json (optional, max 2 MB)
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
              <div style={{ padding: 24, color: "#4a4850", fontSize: 13 }}>No tickets yet — create one above.</div>
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
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  <span style={{ color: "#4a4850", marginRight: 6 }}>{ticketRef(t)}</span>
                  {t.subject}
                </div>
                <div style={{ fontSize: 11, color: "#4a4850", marginTop: 4, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  <SupportCategoryBadge category={t.category} />
                  <span>{statusLabel(t.status)}</span>
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
            {selected ? (
              <>
                <SupportCategoryBadge category={selected.category} />
                {ticketRef(selected)} · {selected.subject}
              </>
            ) : (
              "Select a ticket"
            )}
          </div>
          {selected?.status === "resolved" && selected.csat_rating == null && (
            <div className="support-csat-row">
              <span style={{ fontSize: 12, color: "#a3a3a3", width: "100%" }}>How was support?</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="support-csat-btn"
                  disabled={csatSending}
                  onClick={() => {
                    void (async () => {
                      setCsatSending(true);
                      try {
                        await api(`/api/support/threads/${selected.id}/csat`, {
                          method: "POST",
                          body: JSON.stringify({ rating: n }),
                        });
                        await loadThreads();
                      } finally {
                        setCsatSending(false);
                      }
                    })();
                  }}
                >
                  {n}★
                </button>
              ))}
            </div>
          )}
          {selected?.csat_rating != null && (
            <div style={{ padding: "8px 18px", fontSize: 12, color: "#86efac" }}>
              Thanks — you rated this ticket {selected.csat_rating}/5.
            </div>
          )}
          {isResolved && (
            <div
              style={{
                padding: "10px 18px",
                fontSize: 12,
                color: "#a3e635",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                background: "rgba(163,230,53,0.08)",
              }}
            >
              This ticket is marked resolved. Send a reply if you still need help — support will review your follow-up.
            </div>
          )}
          {isUserReplied && (
            <div
              style={{
                padding: "10px 18px",
                fontSize: 12,
                color: "#e9d5ff",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                background: "rgba(168,85,247,0.1)",
              }}
            >
              Your follow-up was sent. Support will review it and get back to you.
            </div>
          )}
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
              <div style={{ color: "#4a4850", fontSize: 13 }}>Choose a ticket on the left or create a new one.</div>
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
                    {m.attachment?.url && (m.attachment.mime_type || "").startsWith("image/") && (
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
                    {m.attachment?.url && !(m.attachment.mime_type || "").startsWith("image/") && (
                      <a
                        href={m.attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: "block", marginTop: 8, fontSize: 12, color: "#93c5fd" }}
                      >
                        📎 {m.attachment.original_name || "Download attachment"}
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
                  selected
                    ? isClosed
                      ? "Ticket closed"
                      : isResolved
                        ? "Reply to reopen this ticket…"
                        : "Type a message… (optional if you attach a screenshot)"
                    : "Select a ticket"
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

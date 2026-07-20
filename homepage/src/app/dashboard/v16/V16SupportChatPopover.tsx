"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SUPPORT_CATEGORIES, buildSupportContext } from "../support/supportUi";
import {
  MAX_IMAGE_UPLOAD_BYTES,
  IMAGE_UPLOAD_FORMAT_HINT,
  imageUploadTooLargeError,
} from "@/lib/imageUploadLimits";

const SAFE_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const SAFE_IMAGE_ACCEPT = "image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp";

async function sniffImageMime(file: File): Promise<string | null> {
  try {
    const buf = await file.slice(0, 16).arrayBuffer();
    const u = new Uint8Array(buf);
    if (u.length >= 3 && u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff) return "image/jpeg";
    if (
      u.length >= 8 &&
      u[0] === 0x89 &&
      u[1] === 0x50 &&
      u[2] === 0x4e &&
      u[3] === 0x47 &&
      u[4] === 0x0d &&
      u[5] === 0x0a &&
      u[6] === 0x1a &&
      u[7] === 0x0a
    ) {
      return "image/png";
    }
    if (
      u.length >= 6 &&
      u[0] === 0x47 &&
      u[1] === 0x49 &&
      u[2] === 0x46 &&
      u[3] === 0x38 &&
      (u[4] === 0x37 || u[4] === 0x39) &&
      u[5] === 0x61
    ) {
      return "image/gif";
    }
    if (
      u.length >= 12 &&
      u[0] === 0x52 &&
      u[1] === 0x49 &&
      u[2] === 0x46 &&
      u[3] === 0x46 &&
      u[8] === 0x57 &&
      u[9] === 0x45 &&
      u[10] === 0x42 &&
      u[11] === 0x50
    ) {
      return "image/webp";
    }
  } catch {
    /* ignore */
  }
  return null;
}

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
  let left = 76;
  let top = Math.max(8, window.innerHeight - maxPopH - 16);
  if (btnR) {
    left = Math.round(btnR.right + 8);
    left = Math.min(left, window.innerWidth - POP_W - 8);
    left = Math.max(8, left);
    const below = Math.round(btnR.bottom + 6);
    const above = Math.round(btnR.top - maxPopH - 6);
    top = below + maxPopH <= window.innerHeight - 8 ? below : Math.max(8, above);
  }
  return { top, left, width: POP_W, maxHeight: maxPopH };
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
  const [toast, setToast] = useState<{ id: string; subject: string; preview: string; threadId: number | null } | null>(null);

  const popRef = useRef<HTMLDivElement | null>(null);
  const msgEndRef = useRef<HTMLDivElement | null>(null);
  const newFileRef = useRef<HTMLInputElement | null>(null);
  const replyFileRef = useRef<HTMLInputElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRef = useRef(false);
  openRef.current = open;
  const selThreadRef = useRef<Thread | null>(null);
  selThreadRef.current = selThread;
  const threadsRef = useRef<Thread[]>([]);
  threadsRef.current = threads;

  const pickImage = async (file: File | null, which: "new" | "reply") => {
    if (!file) return;
    const name = String(file.name || "");
    const declared = String(file.type || "").toLowerCase();
    if (/\.svg$/i.test(name) || declared === "image/svg+xml") {
      setError("SVG files are not allowed.");
      return;
    }
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      setError(imageUploadTooLargeError(file.size));
      return;
    }
    const sniffed = await sniffImageMime(file);
    if (!sniffed || !SAFE_IMAGE_MIME.has(sniffed)) {
      setError(`Only ${IMAGE_UPLOAD_FORMAT_HINT} are allowed.`);
      return;
    }
    const ext = sniffed === "image/jpeg" ? "jpg" : sniffed.split("/")[1];
    const safeName = name && !/\.svg$/i.test(name) ? name : `image-${Date.now()}.${ext}`;
    const safeFile = sniffed !== declared ? new File([file], safeName, { type: sniffed }) : file;
    setError(null);
    if (which === "new") setNewFile(safeFile);
    else setReplyFile(safeFile);
  };

  const onPasteImage = (e: React.ClipboardEvent, which: "new" | "reply") => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const t = String(item?.type || "").toLowerCase();
      if (item && t.startsWith("image/") && t !== "image/svg+xml") {
        const f = item.getAsFile();
        if (f) {
          e.preventDefault();
          void pickImage(f, which);
        }
        break;
      }
    }
  };

  const showReplyToast = (payload: { subject: string; preview: string; threadId: number | null }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToast({ id, ...payload });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToast((cur) => (cur && cur.id === id ? null : cur));
    }, 6500);
  };

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
    try {
      await supportApi("/api/notifications/read", {
        method: "PATCH",
        body: JSON.stringify({ thread_id: threadId }),
      });
    } catch {
      /* ignore */
    }
    setToast((cur) => (cur && cur.threadId === threadId ? null : cur));
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
            if (d.type === "message" && d.message) {
              const msg = d.message as Msg;
              const tid = d.thread_id as number;
              const sel = selThreadRef.current;
              const meta = threadsRef.current.find((t) => t.id === tid);
              const ownerId = sel && sel.id === tid ? sel.user_id : meta?.user_id;
              const fromSupport = ownerId != null && msg.sender_user_id !== ownerId;
              if (tid === threadId || (sel && sel.id === tid)) {
                setMessages((prev) =>
                  prev.some((x) => x.id === msg.id) ? prev : [...prev, msg]
                );
              }
              void loadThreads();
              if (fromSupport) {
                const viewing = !!(openRef.current && sel && sel.id === tid);
                if (!viewing) {
                  showReplyToast({
                    subject: meta?.subject || sel?.subject || "Support reply",
                    preview: (msg.body || (msg.attachment ? "Sent an image" : "New message")).slice(0, 90),
                    threadId: tid,
                  });
                }
              }
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
    if (replyFile && replyFile.size > MAX_IMAGE_UPLOAD_BYTES) {
      setError(imageUploadTooLargeError(replyFile.size));
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
    if (newFile && newFile.size > MAX_IMAGE_UPLOAD_BYTES) {
      setError(imageUploadTooLargeError(newFile.size));
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
    <>
    <div
      ref={popRef}
      data-v9-chrome="1"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width: Math.max(pos.width, 380),
        height: 540,
        maxHeight: "min(78vh, 580px)",
        background: "linear-gradient(180deg, #111520 0%, #0c101c 100%)",
        border: "1px solid rgba(140,160,255,0.34)",
        borderRadius: 10,
        boxShadow: "0 16px 48px rgba(0,0,0,0.62)",
        zIndex: 100010,
        display: "flex",
        flexDirection: "column",
        fontFamily: F,
        overflow: "hidden",
      }}
    >
      <div style={{ height: 2, background: "linear-gradient(90deg, transparent, rgba(74,106,255,0.85), transparent)", flexShrink: 0 }} />
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
        <div
          style={{ flex: 1, overflowY: "auto", padding: "14px", display: "flex", flexDirection: "column", gap: 12 }}
          onPaste={(e) => onPasteImage(e, "new")}
        >
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.tm, display: "block", marginBottom: 5 }}>Subject</label>
            <input
              type="text"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              placeholder="Brief description…"
              maxLength={200}
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", fontSize: 12, background: "rgba(0,0,0,0.28)", color: C.tx, border: `1px solid ${C.br}`, borderRadius: 7, outline: "none", fontFamily: F }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.tm, display: "block", marginBottom: 5 }}>Category</label>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              style={{ width: "100%", padding: "8px 11px", fontSize: 12, background: "rgba(0,0,0,0.28)", color: C.tx, border: `1px solid ${C.br}`, borderRadius: 7, outline: "none", fontFamily: F }}
            >
              {SUPPORT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.tm, display: "block", marginBottom: 5 }}>Message</label>
            <textarea
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder="Describe your issue… (Ctrl/Cmd+V to paste an image)"
              rows={5}
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", fontSize: 12, background: "rgba(0,0,0,0.28)", color: C.tx, border: `1px solid ${C.br}`, borderRadius: 7, outline: "none", fontFamily: F, resize: "vertical", minHeight: 96 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.tm, marginBottom: 6 }}>Attachment</div>
            <input
              ref={newFileRef}
              type="file"
              accept={SAFE_IMAGE_ACCEPT}
              style={{ display: "none" }}
              onChange={(e) => {
                void pickImage(e.target.files?.[0] ?? null, "new");
                e.target.value = "";
              }}
            />
            <div
              tabIndex={0}
              role="group"
              aria-label="Image attachment"
              onPaste={(e) => onPasteImage(e, "new")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                minHeight: 40,
                padding: newFile ? "6px 8px" : "0 8px",
                borderRadius: 8,
                outline: "none",
                background: newFile ? C.acD : "rgba(0,0,0,0.22)",
                border: `1px solid ${newFile ? "rgba(74,106,255,0.4)" : C.br}`,
              }}
            >
              {newFile ? (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 650, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{newFile.name}</div>
                    <div style={{ fontSize: 9, color: C.tm, marginTop: 1 }}>{IMAGE_UPLOAD_FORMAT_HINT}</div>
                  </div>
                  <button
                    type="button"
                    aria-label="Remove attachment"
                    onClick={() => {
                      setNewFile(null);
                      if (newFileRef.current) newFileRef.current.value = "";
                    }}
                    style={{ border: "none", background: "transparent", color: C.ts, fontSize: 14, cursor: "pointer", padding: "2px 6px" }}
                  >
                    ✕
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    title="Attach from computer"
                    aria-label="Attach image from computer"
                    onClick={() => newFileRef.current?.click()}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      border: "none",
                      cursor: "pointer",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(74,106,255,0.14)",
                      color: C.acL,
                      fontSize: 14,
                    }}
                  >
                    +
                  </button>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: C.tm, lineHeight: 1.35 }}>
                    <span style={{ color: C.ts, fontWeight: 600 }}>Add image</span>
                    <span> · Ctrl+V to paste</span>
                  </div>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            disabled={sending || !newSubject.trim() || (!newBody.trim() && !newFile)}
            onClick={() => void createThread()}
            style={{ padding: "10px 0", fontSize: 13, fontWeight: 750, borderRadius: 8, border: "1px solid rgba(107,140,255,0.45)", cursor: "pointer", background: "linear-gradient(135deg,#4A6AFF,#3B5BDB)", color: "#fff", opacity: sending ? 0.6 : 1, marginTop: 2, boxShadow: "0 6px 18px rgba(74,106,255,0.28)" }}
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
            <div
              style={{ padding: "10px", borderTop: `1px solid ${C.br}`, display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}
              onPaste={(e) => onPasteImage(e, "reply")}
            >
              <input
                ref={replyFileRef}
                type="file"
                accept={SAFE_IMAGE_ACCEPT}
                style={{ display: "none" }}
                onChange={(e) => {
                  void pickImage(e.target.files?.[0] ?? null, "reply");
                  e.target.value = "";
                }}
              />
              <div
                tabIndex={0}
                role="group"
                aria-label="Image attachment"
                onPaste={(e) => onPasteImage(e, "reply")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  minHeight: 36,
                  padding: replyFile ? "6px 8px" : "0 8px",
                  borderRadius: 8,
                  outline: "none",
                  background: replyFile ? C.acD : "rgba(0,0,0,0.22)",
                  border: `1px solid ${replyFile ? "rgba(74,106,255,0.4)" : C.br}`,
                }}
              >
                {replyFile ? (
                  <>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 650, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{replyFile.name}</div>
                    <button
                      type="button"
                      aria-label="Remove attachment"
                      onClick={() => {
                        setReplyFile(null);
                        if (replyFileRef.current) replyFileRef.current.value = "";
                      }}
                      style={{ border: "none", background: "transparent", color: C.ts, fontSize: 14, cursor: "pointer", padding: "2px 6px" }}
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      title="Attach from computer"
                      aria-label="Attach image from computer"
                      onClick={() => replyFileRef.current?.click()}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 6,
                        border: "none",
                        cursor: "pointer",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(74,106,255,0.14)",
                        color: C.acL,
                        fontSize: 14,
                      }}
                    >
                      +
                    </button>
                    <div style={{ flex: 1, fontSize: 11, color: C.tm }}>
                      <span style={{ color: C.ts, fontWeight: 600 }}>Add image</span>
                      <span> · Ctrl+V</span>
                    </div>
                  </>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Type a message…"
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendReply();
                    }
                  }}
                  style={{ flex: 1, boxSizing: "border-box", padding: "8px 11px", fontSize: 12, background: "rgba(0,0,0,0.28)", color: C.tx, border: `1px solid ${C.br}`, borderRadius: 8, outline: "none", fontFamily: F, resize: "none", maxHeight: 90 }}
                />
                <div
                  onClick={() => {
                    if (!sending) void sendReply();
                  }}
                  style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 8, background: "linear-gradient(135deg,#4A6AFF,#3B5BDB)", opacity: sending ? 0.5 : 1, flexShrink: 0 }}
                >
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="#fff">
                    <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
                  </svg>
                </div>
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
    </div>
    {toast ? (
      <div
        data-v9-chrome="1"
        onClick={() => {
          const tid = toast.threadId;
          setToast(null);
          setOpen(true);
          setNewThread(false);
          if (tid) {
            const t = threadsRef.current.find((x) => x.id === tid);
            if (t) setSelThread(t);
          }
        }}
        style={{
          position: "fixed",
          top: 56,
          right: 18,
          width: 320,
          zIndex: 100060,
          cursor: "pointer",
          background: "linear-gradient(180deg, #141a2c 0%, #0e1320 100%)",
          border: "1px solid rgba(107,140,255,0.45)",
          borderRadius: 12,
          padding: "12px 14px",
          boxShadow: "0 14px 36px rgba(0,0,0,0.55)",
          fontFamily: F,
          animation: "tlrSupportToastIn 0.28s ease",
        }}
      >
        <style>{`@keyframes tlrSupportToastIn{from{opacity:0;transform:translateY(-10px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
        <div style={{ fontSize: 11, fontWeight: 750, color: C.acL, letterSpacing: "0.04em", textTransform: "uppercase" }}>New support reply</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginTop: 3 }}>{toast.subject}</div>
        <div style={{ fontSize: 12, color: C.ts, marginTop: 3, lineHeight: 1.4 }}>{toast.preview}</div>
      </div>
    ) : null}
    </>,
    document.body
  );
}

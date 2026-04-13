"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { JOURNAL_API_BASE } from "@/lib/journalApi";
import StrategyWizard from "./StrategyWizard";
import ShareStrategyModal from "./ShareStrategyModal";
import PostCard from "@/components/ui/post-card";
import FeedStrategyDetailModal from "./FeedStrategyDetailModal";
import { emptyDraft, definitionFromDraft, draftFromApi } from "@/strategyLab/defaults";
import { formatMarketsAndInstrumentsSummary } from "@/strategyLab/instruments";
import { Plus, Trash2, Share2, BarChart3, Copy } from "lucide-react";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

function loginUrlWithNext() {
  return `/login/?next=${encodeURIComponent("/strategies-lab/")}`;
}

function authHeaders() {
  const token = getToken();
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } as Record<string, string>;
}

/** Optional auth: omit invalid Bearer when logged out so public endpoints do not receive "Bearer null". */
function fetchHeadersJson() {
  const token = getToken();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export default function StrategiesLabPage() {
  const [tab, setTab] = useState<"builder" | "feed" | "templates">(() =>
    typeof window !== "undefined" && localStorage.getItem("token") ? "builder" : "feed"
  );
  const [builderView, setBuilderView] = useState("list");
  const [strategies, setStrategies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardStep, setWizardStep] = useState(1);
  const [draft, setDraft] = useState<Record<string, unknown>>(() => emptyDraft() as Record<string, unknown>);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [shareId, setShareId] = useState<number | null>(null);
  const [perf, setPerf] = useState<Record<string, unknown> | null>(null);
  const [perfId, setPerfId] = useState<number | null>(null);

  const [feedPosts, setFeedPosts] = useState<any[]>([]);
  const [feedDetailPost, setFeedDetailPost] = useState<any | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);

  const loadStrategies = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setStrategies([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${JOURNAL_API_BASE}/strategies`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) setStrategies(data.strategies || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Logged-in: full community feed. Visitors: read-only explore (posts with visibility = guest). */
  const loadFeed = useCallback(async () => {
    try {
      const path = getToken() ? "/feed" : "/feed/explore";
      const res = await fetch(`${JOURNAL_API_BASE}${path}`, { headers: fetchHeadersJson() });
      const data = await res.json();
      if (data.success) setFeedPosts(data.posts || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const path = getToken() ? "/templates" : "/templates/public";
      const res = await fetch(`${JOURNAL_API_BASE}${path}`, { headers: fetchHeadersJson() });
      const data = await res.json();
      if (data.success) setTemplates(data.templates || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadStrategies();
  }, [loadStrategies]);

  useEffect(() => {
    if (tab === "feed") loadFeed();
    if (tab === "templates") loadTemplates();
  }, [tab, loadFeed, loadTemplates]);

  const startNew = () => {
    if (!getToken()) {
      window.location.href = loginUrlWithNext();
      return;
    }
    setEditingId(null);
    setDraft(emptyDraft() as Record<string, unknown>);
    setWizardStep(1);
    setBuilderView("wizard");
  };

  const editStrategy = async (id: number) => {
    if (!getToken()) {
      window.location.href = loginUrlWithNext();
      return;
    }
    try {
      const res = await fetch(`${JOURNAL_API_BASE}/strategies/${id}`, { headers: authHeaders() });
      const data = await res.json();
      if (!data.success) return;
      setEditingId(id);
      setDraft(draftFromApi(data.strategy) as Record<string, unknown>);
      setWizardStep(1);
      setBuilderView("wizard");
    } catch (e) {
      console.error(e);
    }
  };

  const saveStrategy = async () => {
    if (!getToken()) {
      window.location.href = loginUrlWithNext();
      return;
    }
    if (!String(draft.name ?? "").trim()) return;
    setSaving(true);
    try {
      const body = {
        name: String(draft.name ?? "").trim(),
        description: draft.description || "",
        strategy_definition: definitionFromDraft(draft),
      };
      const method = editingId ? "PUT" : "POST";
      const url = editingId
        ? `${JOURNAL_API_BASE}/strategies/${editingId}`
        : `${JOURNAL_API_BASE}/strategies`;
      const res = await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Save failed");
      await loadStrategies();
      setBuilderView("list");
      setEditingId(null);
      setDraft(emptyDraft() as Record<string, unknown>);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const deleteStrategy = async (id: number) => {
    if (!window.confirm("Delete this strategy?")) return;
    try {
      const res = await fetch(`${JOURNAL_API_BASE}/strategies/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) loadStrategies();
    } catch (e) {
      console.error(e);
    }
  };

  const duplicateStrategy = async (id: number) => {
    try {
      const res = await fetch(`${JOURNAL_API_BASE}/strategies/${id}/duplicate`, {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) loadStrategies();
    } catch (e) {
      console.error(e);
    }
  };

  const loadPerformance = async (id: number) => {
    setPerfId(id);
    setPerf(null);
    try {
      const res = await fetch(`${JOURNAL_API_BASE}/strategies/${id}/performance`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) setPerf(data.performance);
    } catch (e) {
      console.error(e);
    }
  };

  const likePost = async (postId: number, liked: boolean) => {
    if (!getToken()) {
      window.location.href = loginUrlWithNext();
      return;
    }
    try {
      const method = liked ? "DELETE" : "POST";
      await fetch(`${JOURNAL_API_BASE}/posts/${postId}/like`, { method, headers: authHeaders() });
      loadFeed();
    } catch (e) {
      console.error(e);
    }
  };

  const cloneTemplate = async (tid: number) => {
    if (!getToken()) {
      window.location.href = loginUrlWithNext();
      return;
    }
    try {
      const res = await fetch(`${JOURNAL_API_BASE}/templates/${tid}/clone`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        await loadStrategies();
        setTab("builder");
        alert("Template cloned to your strategies.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const isAuthed = !!getToken();

  return (
    <div
      className="strategies-lab-root min-h-screen bg-[var(--sl-bg)] text-[var(--sl-text)]"
      data-strategy-lab="true"
    >
      <div className="border-b border-[var(--sl-border)] bg-[var(--sl-sidebar)] px-4 py-3">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <h1 className="text-xl font-bold" style={{ fontFamily: "Outfit, sans-serif" }}>
            Strategies Lab
          </h1>
          <nav className="flex gap-1">
            {(["builder", "feed", "templates"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-lg px-4 py-2 text-sm font-medium capitalize ${
                  tab === t
                    ? "bg-[var(--sl-accent)] text-white"
                    : "text-[var(--sl-text-sec)] hover:bg-[var(--sl-input)]"
                }`}
              >
                {t}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6">
        {tab === "builder" && builderView === "list" && !isAuthed && (
          <div className="rounded-xl border border-[var(--sl-border)] bg-[var(--sl-card)] px-6 py-12 text-center">
            <h2 className="text-lg font-semibold text-[var(--sl-text)]">Build and save strategies</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[var(--sl-text-sec)]">
              Visitors can browse the public feed and template library. Sign in to create strategies, save them to your
              journal, and post to the community.
            </p>
            <Link
              href="/login/?next=/strategies-lab/"
              className="mt-6 inline-flex items-center justify-center rounded-lg bg-[var(--sl-accent)] px-5 py-2.5 text-sm font-medium text-white"
            >
              Sign in to continue
            </Link>
          </div>
        )}

        {tab === "builder" && builderView === "list" && isAuthed && (
          <div>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Your strategies</h2>
              <button
                type="button"
                onClick={startNew}
                className="flex items-center gap-2 rounded-lg bg-[var(--sl-accent)] px-4 py-2 text-sm font-medium text-white"
              >
                <Plus size={18} /> New strategy
              </button>
            </div>
            {loading ? (
              <p className="text-[var(--sl-text-muted)]">Loading…</p>
            ) : (
              <ul className="space-y-3">
                {strategies.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--sl-border)] bg-[var(--sl-card)] p-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {typeof s.strategy_definition?.cover_image === "string" &&
                      s.strategy_definition.cover_image.startsWith("data:image/") ? (
                        <img
                          src={s.strategy_definition.cover_image}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-lg border border-[var(--sl-border)] object-cover"
                        />
                      ) : null}
                      <div className="min-w-0">
                        <div className="font-semibold">{s.name}</div>
                        <div className="text-xs text-[var(--sl-text-muted)]">
                          {[formatMarketsAndInstrumentsSummary(s.strategy_definition), s.strategy_definition?.timeframe]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => editStrategy(s.id)}
                        className="rounded border border-[var(--sl-border)] px-3 py-1 text-sm hover:bg-[var(--sl-input)]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicateStrategy(s.id)}
                        className="rounded border border-[var(--sl-border)] px-3 py-1 text-sm hover:bg-[var(--sl-input)]"
                        title="Duplicate"
                      >
                        <Copy size={16} className="inline" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setShareId(s.id)}
                        className="rounded border border-[var(--sl-border)] px-3 py-1 text-sm hover:bg-[var(--sl-input)]"
                        title="Share"
                      >
                        <Share2 size={16} className="inline" />
                      </button>
                      <button
                        type="button"
                        onClick={() => loadPerformance(s.id)}
                        className="rounded border border-[var(--sl-border)] px-3 py-1 text-sm hover:bg-[var(--sl-input)]"
                        title="Performance"
                      >
                        <BarChart3 size={16} className="inline" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteStrategy(s.id)}
                        className="rounded border border-[var(--sl-red)]/50 px-3 py-1 text-sm text-[var(--sl-red)] hover:bg-[var(--sl-red)]/10"
                      >
                        <Trash2 size={16} className="inline" />
                      </button>
                    </div>
                  </li>
                ))}
                {!strategies.length && (
                  <li className="text-[var(--sl-text-muted)]">
                    No strategies yet. Create one to get started.
                  </li>
                )}
              </ul>
            )}
            {perf && perfId && (
              <div className="mt-8 rounded-xl border border-[var(--sl-border)] bg-[var(--sl-card)] p-4">
                <h3 className="mb-2 font-semibold">Performance (strategy #{perfId})</h3>
                <pre className="text-xs text-[var(--sl-text-sec)]">{JSON.stringify(perf, null, 2)}</pre>
                <button
                  type="button"
                  onClick={() => {
                    setPerf(null);
                    setPerfId(null);
                  }}
                  className="mt-2 text-sm text-[var(--sl-accent)]"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        )}

        {tab === "builder" && builderView === "wizard" && isAuthed && (
          <StrategyWizard
            draft={draft}
            setDraft={setDraft}
            step={wizardStep}
            setStep={setWizardStep}
            saving={saving}
            isEdit={!!editingId}
            autosaveKey={editingId != null ? String(editingId) : "new"}
            onSubmit={saveStrategy}
            onBack={() => {
              setBuilderView("list");
              setEditingId(null);
              setDraft(emptyDraft() as Record<string, unknown>);
            }}
          />
        )}

        {tab === "feed" && (
          <div className="w-full">
            <div className="mx-auto mb-6 w-full max-w-6xl px-0 text-left">
              <h2 className="text-lg font-semibold">Community feed</h2>
              <p className="mt-1 text-xs text-[var(--sl-text-muted)]">
                {isAuthed ? (
                  <>
                    &quot;Friends&quot; = any logged-in user. &quot;Guest&quot; posts also appear on the public explore
                    view for visitors. &quot;Mutual&quot; = you both follow each other. Click a card for details.
                  </>
                ) : (
                  <>
                    You&apos;re viewing the public explore feed (posts authors marked for visitors).{" "}
                    <Link href="/login/?next=/strategies-lab/" className="text-[var(--sl-accent-light)] underline">
                      Sign in
                    </Link>{" "}
                    for the full community feed, likes, and comments.
                  </>
                )}
              </p>
            </div>
            <div className="mx-auto grid w-full max-w-[100rem] grid-cols-1 items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {feedPosts.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  onLike={isAuthed ? likePost : undefined}
                  variant="grid"
                  onOpenStrategy={setFeedDetailPost}
                />
              ))}
            </div>
            {!feedPosts.length && (
              <p className="mx-auto mt-8 w-full max-w-6xl text-center text-[var(--sl-text-muted)]">
                {isAuthed
                  ? "No posts yet."
                  : "No public posts yet. When members share with “Public (explore)”, they appear here."}
              </p>
            )}
          </div>
        )}

        {tab === "templates" && (
          <div>
            <h2 className="mb-2 text-lg font-semibold">Template library</h2>
            {!isAuthed && (
              <p className="mb-4 text-xs text-[var(--sl-text-muted)]">
                Browse published templates below.{" "}
                <Link href="/login/?next=/strategies-lab/" className="text-[var(--sl-accent-light)] underline">
                  Sign in
                </Link>{" "}
                to copy a template into your strategies.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((t) => (
                <div key={t.id} className="rounded-xl border border-[var(--sl-border)] bg-[var(--sl-card)] p-4">
                  <div className="font-semibold">{t.title}</div>
                  <div className="mt-1 text-xs text-[var(--sl-text-muted)]">
                    {t.category} · {t.template_type}
                    {t.rating_avg != null ? ` · ★ ${t.rating_avg}` : ""}
                  </div>
                  {isAuthed ? (
                    <button
                      type="button"
                      onClick={() => cloneTemplate(t.id)}
                      className="mt-3 rounded-lg bg-[var(--sl-green)] px-3 py-1.5 text-sm text-white"
                    >
                      Use template
                    </button>
                  ) : (
                    <Link
                      href="/login/?next=/strategies-lab/"
                      className="mt-3 inline-block rounded-lg border border-[var(--sl-border)] bg-[var(--sl-input)] px-3 py-1.5 text-sm text-[var(--sl-text)] hover:bg-[var(--sl-card)]"
                    >
                      Sign in to use
                    </Link>
                  )}
                </div>
              ))}
            </div>
            {!templates.length && (
              <p className="text-[var(--sl-text-muted)]">No templates published yet.</p>
            )}
          </div>
        )}
      </div>

      {shareId && isAuthed && (
        <ShareStrategyModal
          strategyId={shareId}
          strategy={strategies.find((s) => s.id === shareId) ?? null}
          onClose={() => setShareId(null)}
          onPosted={() => loadFeed()}
        />
      )}
      {feedDetailPost && (
        <FeedStrategyDetailModal post={feedDetailPost} onClose={() => setFeedDetailPost(null)} />
      )}
    </div>
  );
}

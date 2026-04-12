"use client";

import React, { useCallback, useEffect, useState } from "react";
import { JOURNAL_API_BASE } from "@/lib/journalApi";
import StrategyWizard from "./StrategyWizard";
import ShareStrategyModal from "./ShareStrategyModal";
import PostCard from "@/components/ui/post-card";
import { emptyDraft, definitionFromDraft, draftFromApi } from "@/strategyLab/defaults";
import { Plus, Trash2, Share2, BarChart3, Copy } from "lucide-react";

function authHeaders() {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } as Record<string, string>;
}

export default function StrategiesLabPage() {
  const [tab, setTab] = useState("builder");
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
  const [templates, setTemplates] = useState<any[]>([]);

  const loadStrategies = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return;
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

  const loadFeed = useCallback(async () => {
    try {
      const res = await fetch(`${JOURNAL_API_BASE}/feed`, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) setFeedPosts(data.posts || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch(`${JOURNAL_API_BASE}/templates`, { headers: authHeaders() });
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
    setEditingId(null);
    setDraft(emptyDraft() as Record<string, unknown>);
    setWizardStep(1);
    setBuilderView("wizard");
  };

  const editStrategy = async (id: number) => {
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
    try {
      const method = liked ? "DELETE" : "POST";
      await fetch(`${JOURNAL_API_BASE}/posts/${postId}/like`, { method, headers: authHeaders() });
      loadFeed();
    } catch (e) {
      console.error(e);
    }
  };

  const cloneTemplate = async (tid: number) => {
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
            {["builder", "feed", "templates"].map((t) => (
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
        {tab === "builder" && builderView === "list" && (
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
                    <div>
                      <div className="font-semibold">{s.name}</div>
                      <div className="text-xs text-[var(--sl-text-muted)]">
                        {(s.strategy_definition?.instrument || "") +
                          (s.strategy_definition?.timeframe
                            ? ` · ${s.strategy_definition.timeframe}`
                            : "")}
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

        {tab === "builder" && builderView === "wizard" && (
          <StrategyWizard
            draft={draft}
            setDraft={setDraft}
            step={wizardStep}
            setStep={setWizardStep}
            saving={saving}
            isEdit={!!editingId}
            onSubmit={saveStrategy}
            onBack={() => {
              setBuilderView("list");
              setEditingId(null);
              setDraft(emptyDraft() as Record<string, unknown>);
            }}
          />
        )}

        {tab === "feed" && (
          <div className="flex flex-col items-center gap-6">
            <div className="w-full max-w-[30rem] text-left">
              <h2 className="text-lg font-semibold">Community feed</h2>
              <p className="mt-1 text-xs text-[var(--sl-text-muted)]">
                Public for everyone; friends-only when you mutually follow the author; private only in your feed.
              </p>
            </div>
            {feedPosts.map((p) => (
              <PostCard key={p.id} post={p} onLike={likePost} />
            ))}
            {!feedPosts.length && (
              <p className="w-full max-w-[30rem] text-center text-[var(--sl-text-muted)]">No posts yet.</p>
            )}
          </div>
        )}

        {tab === "templates" && (
          <div>
            <h2 className="mb-4 text-lg font-semibold">Template library</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((t) => (
                <div key={t.id} className="rounded-xl border border-[var(--sl-border)] bg-[var(--sl-card)] p-4">
                  <div className="font-semibold">{t.title}</div>
                  <div className="mt-1 text-xs text-[var(--sl-text-muted)]">
                    {t.category} · {t.template_type}
                    {t.rating_avg != null ? ` · ★ ${t.rating_avg}` : ""}
                  </div>
                  <button
                    type="button"
                    onClick={() => cloneTemplate(t.id)}
                    className="mt-3 rounded-lg bg-[var(--sl-green)] px-3 py-1.5 text-sm text-white"
                  >
                    Use template
                  </button>
                </div>
              ))}
            </div>
            {!templates.length && (
              <p className="text-[var(--sl-text-muted)]">No templates published yet.</p>
            )}
          </div>
        )}
      </div>

      {shareId && (
        <ShareStrategyModal
          strategyId={shareId}
          onClose={() => setShareId(null)}
          onPosted={() => loadFeed()}
        />
      )}
    </div>
  );
}

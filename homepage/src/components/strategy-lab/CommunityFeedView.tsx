"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, Sparkles } from "lucide-react";
import PostCard, { type FeedPost } from "@/components/ui/post-card";

type SortKey = "newest" | "popular";
type AudienceKey = "all" | "explore" | "community" | "mutual" | "private";

function normVis(v: string | null | undefined): string {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return "public";
  return s;
}

function matchesAudience(post: FeedPost, audience: AudienceKey): boolean {
  const v = normVis(post.visibility);
  if (audience === "all") return true;
  if (audience === "explore") return v === "guest";
  if (audience === "community") return v === "public" || v === "";
  if (audience === "mutual") return v === "friends";
  if (audience === "private") return v === "private";
  return true;
}

function matchesSearch(post: FeedPost, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const title = String(post.strategy?.name ?? "").toLowerCase();
  const cap = String(post.caption ?? "").toLowerCase();
  const author = String(post.author?.name ?? "").toLowerCase();
  return title.includes(s) || cap.includes(s) || author.includes(s);
}

type Props = {
  posts: FeedPost[];
  isAuthed: boolean;
  onLike: (postId: number, currentlyLiked: boolean) => void;
  onOpenStrategy: (post: FeedPost) => void;
};

export default function CommunityFeedView({ posts, isAuthed, onLike, onOpenStrategy }: Props) {
  const [sort, setSort] = useState<SortKey>("newest");
  const [audience, setAudience] = useState<AudienceKey>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let list = posts.filter((p) => matchesAudience(p, audience) && matchesSearch(p, search));
    if (sort === "popular") {
      list = [...list].sort((a, b) => (b.likes_count ?? 0) - (a.likes_count ?? 0));
    } else {
      list = [...list].sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });
    }
    return list;
  }, [posts, sort, audience, search]);

  return (
    <div className="w-full">
      {/* Hero banner */}
      <div className="relative mb-8 overflow-hidden rounded-2xl border border-[var(--sl-border)] bg-gradient-to-br from-[#141420] via-[#0c0c18] to-[#0a1628] px-6 py-10 sm:px-10">
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[var(--sl-accent)]/20 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-16 left-1/4 h-48 w-48 rounded-full bg-[var(--sl-green)]/10 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--sl-border)] bg-[var(--sl-card)]/80 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-[var(--sl-accent-light)]">
              <Sparkles className="h-3.5 w-3.5" />
              Live from the community
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-[var(--sl-text)] sm:text-3xl" style={{ fontFamily: "Outfit, sans-serif" }}>
              Community feed
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--sl-text-sec)]">
              Discover strategies members have shared. When authors include stats, you&apos;ll see win rate and trade count
              on the card. Sign in to like, comment, and follow the full feed.
            </p>
          </div>
          {!isAuthed && (
            <Link
              href="/login/?next=/strategies-lab/"
              className="mt-4 inline-flex shrink-0 items-center justify-center rounded-xl bg-[var(--sl-accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[var(--sl-accent)]/25 transition hover:opacity-95 sm:mt-0"
            >
              Sign in to interact
            </Link>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-[var(--sl-border)] bg-[var(--sl-card)]/60 p-4 backdrop-blur-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="relative min-w-[200px] flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sl-text-muted)]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search strategy, caption, or author…"
            className="w-full rounded-lg border border-[var(--sl-border)] bg-[var(--sl-input)] py-2.5 pl-10 pr-3 text-sm text-[var(--sl-text)] placeholder:text-[var(--sl-text-faint)] focus:border-[var(--sl-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--sl-accent)]"
            aria-label="Search feed"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-[var(--sl-text-muted)]" aria-hidden />
            <span className="font-mono-label text-[10px] font-bold uppercase tracking-wide text-[var(--sl-text-muted)]">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-lg border border-[var(--sl-border)] bg-[var(--sl-input)] px-3 py-2 text-sm text-[var(--sl-text)] focus:border-[var(--sl-accent)] focus:outline-none"
            >
              <option value="newest">Newest first</option>
              <option value="popular">Most liked</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono-label text-[10px] font-bold uppercase tracking-wide text-[var(--sl-text-muted)]">Audience</span>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as AudienceKey)}
              className="rounded-lg border border-[var(--sl-border)] bg-[var(--sl-input)] px-3 py-2 text-sm text-[var(--sl-text)] focus:border-[var(--sl-accent)] focus:outline-none"
            >
              <option value="all">All</option>
              <option value="explore">Explore (visitors)</option>
              <option value="community">Community</option>
              <option value="mutual">Mutual only</option>
              <option value="private">Private (yours)</option>
            </select>
          </div>
        </div>
      </div>

      <p className="mb-4 text-xs text-[var(--sl-text-muted)]">
        {isAuthed ? (
          <>
            &quot;Friends&quot; = any logged-in user. &quot;Explore&quot; = posts visible to visitors. &quot;Mutual&quot; =
            both follow each other. Win rate reflects the author&apos;s journal trades for this strategy when they chose to
            include stats on the post.
          </>
        ) : (
          <>
            You&apos;re viewing the public explore feed or a filtered subset.{" "}
            <Link href="/login/?next=/strategies-lab/" className="text-[var(--sl-accent-light)] underline">
              Sign in
            </Link>{" "}
            for the full community feed and interactions.
          </>
        )}
      </p>

      <div className="mx-auto grid w-full max-w-[100rem] grid-cols-1 items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            onLike={isAuthed ? onLike : undefined}
            variant="grid"
            onOpenStrategy={onOpenStrategy}
          />
        ))}
      </div>

      {!filtered.length && (
        <p className="mx-auto mt-12 w-full max-w-md text-center text-sm text-[var(--sl-text-muted)]">
          {posts.length === 0
            ? isAuthed
              ? "No posts yet."
              : "No public posts yet. When members share with visibility for explore, they appear here."
            : "No posts match your filters. Try clearing search or setting Audience to All."}
        </p>
      )}
    </div>
  );
}

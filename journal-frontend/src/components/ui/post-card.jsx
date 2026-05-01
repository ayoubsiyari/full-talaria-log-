/**
 * Feed post card — Strategies Lab community feed.
 * Styled for `.strategies-lab-root` tokens (see src/styles/strategy-lab.css).
 * Icons: lucide-react (project standard). No next/image — Vite/CRA compatible.
 */
import React, { useState, useCallback } from 'react';
import { Heart, Bookmark, Send, MessageCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../../lib/utils';

/** Decorative hero when post has no images (Unsplash — trading / workspace). */
const DEFAULT_POST_IMAGE =
  'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&q=80&auto=format&fit=crop';

function avatarUrlFor(name) {
  const n = (name || 'T').trim() || 'T';
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(n)}&background=2643f7&color=fff&size=128&rounded=true`;
}

function handleFromName(name) {
  const s = String(name || 'user')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .slice(0, 24);
  return s ? `@${s}` : '@user';
}

/** public = all accounts (default, no chip). guest = visitors too. friends = mutual. private = author. */
function visibilityBadgeLabel(vis) {
  const v = String(vis || 'public').trim().toLowerCase();
  if (v === 'guest') return 'Public';
  if (v === 'friends') return 'Mutual';
  if (v === 'private') return 'Private';
  return null;
}

/**
 * @param {Object} props
 * @param {Object} props.post — feed item from GET /feed
 * @param {(postId: number, currentlyLiked: boolean) => void} props.onLike
 * @param {(post: object) => void} [props.onOpenComments]
 * @param {(post: object) => void} [props.onOpenStrategy] — click card to open detail (action buttons stop propagation)
 * @param {'default' | 'grid'} [props.variant]
 */
export default function PostCard({ post, onLike, onOpenComments, onOpenStrategy, variant = 'default' }) {
  const [bookmarked, setBookmarked] = useState(false);

  const authorName = post.author?.name || 'Trader';
  const handle = handleFromName(authorName);
  const timeAgo = post.created_at
    ? formatDistanceToNow(new Date(post.created_at), { addSuffix: true })
    : '';
  const liked = !!post.liked_by_me;
  const title = post.strategy?.name || 'Strategy';
  const caption = post.caption || '';
  const visBadge = visibilityBadgeLabel(post.visibility);
  const coverFromStrategy =
    typeof post.strategy?.strategy_definition?.cover_image === 'string'
      ? post.strategy.strategy_definition.cover_image
      : '';
  const heroSrc =
    coverFromStrategy && coverFromStrategy.startsWith('data:image/') ? coverFromStrategy : DEFAULT_POST_IMAGE;

  const handleLike = useCallback(() => {
    onLike?.(post.id, liked);
  }, [onLike, post.id, liked]);

  const handleBookmark = useCallback(() => {
    setBookmarked((prev) => !prev);
  }, []);

  const openStrategy = useCallback(() => {
    onOpenStrategy?.(post);
  }, [onOpenStrategy, post]);

  const handleShare = useCallback(async () => {
    const shareData = {
      title: title,
      text: caption || title,
      url: typeof window !== 'undefined' ? window.location.href : '',
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${title}\n${shareData.url}`);
      }
    } catch {
      /* user cancelled or unsupported */
    }
  }, [title, caption]);

  const isGrid = variant === 'grid';

  let statsLine = { kind: 'empty' };
  if (post.include_stats === false) {
    statsLine = { kind: 'hidden' };
  } else if (post.stats_preview) {
    const sp = post.stats_preview;
    const n = sp.total_trades ?? 0;
    if (n === 0) statsLine = { kind: 'notrade' };
    else if (sp.win_rate == null) statsLine = { kind: 'na', trades: n };
    else statsLine = { kind: 'rate', pct: sp.win_rate * 100, trades: n };
  }

  return (
    <article
      role={onOpenStrategy ? 'button' : undefined}
      tabIndex={onOpenStrategy ? 0 : undefined}
      onClick={onOpenStrategy ? openStrategy : undefined}
      onKeyDown={
        onOpenStrategy
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openStrategy();
              }
            }
          : undefined
      }
      className={cn(
        'flex h-full min-w-0 flex-col rounded-3xl border transition-shadow',
        isGrid ? 'p-3' : 'p-4',
        !isGrid && 'max-w-[30rem]',
        'border-[var(--sl-border)] bg-[var(--sl-card)]',
        'shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] hover:shadow-[0_28px_55px_-10px_rgba(38,67,247,0.12)]',
        onOpenStrategy && 'cursor-pointer select-none outline-none hover:border-[var(--sl-accent)]/40 focus-visible:ring-2 focus-visible:ring-[var(--sl-accent)]'
      )}
    >
      {/* Header */}
      <div className="card-header flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <img
            src={avatarUrlFor(authorName)}
            alt=""
            width={40}
            height={40}
            className={cn('shrink-0 rounded-full object-cover ring-2 ring-[var(--sl-border)]', isGrid ? 'h-8 w-8' : 'h-9 w-9')}
          />
          <div className="min-w-0 flex-1">
            <h3
              className={cn(
                'truncate font-semibold leading-tight text-[var(--sl-text)]',
                isGrid ? 'text-[13px]' : 'text-[15px]'
              )}
            >
              {authorName}
            </h3>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-normal text-[var(--sl-text-muted)]">
              <span className="truncate text-[var(--sl-text-sec)]">{handle}</span>
              <span className="text-[var(--sl-text-muted)]">·</span>
              <span className="shrink-0">{timeAgo}</span>
              {visBadge && (
                <span className="rounded bg-[var(--sl-input)] px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-[var(--sl-text-sec)]">
                  {visBadge}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className={cn('mt-3 flex min-h-0 flex-1 flex-col gap-2', !isGrid && 'gap-4')}>
        <div className="min-w-0">
          <p
            className={cn(
              'font-semibold leading-snug text-[var(--sl-text)]',
              isGrid ? 'line-clamp-2 text-sm' : 'text-base'
            )}
          >
            {title}
          </p>
          {caption ? (
            <p
              className={cn(
                'mt-1.5 text-[var(--sl-text-sec)]',
                isGrid ? 'line-clamp-2 text-xs leading-relaxed' : 'whitespace-pre-wrap text-sm leading-relaxed'
              )}
            >
              {caption}
            </p>
          ) : null}
        </div>
        <div
          className={cn(
            'relative w-full overflow-hidden rounded-xl bg-black/20',
            isGrid ? 'aspect-[16/10]' : ''
          )}
        >
          <img
            src={heroSrc}
            alt=""
            className={cn(
              'rounded-xl object-cover',
              isGrid ? 'absolute inset-0 h-full w-full object-center' : 'max-h-56 w-full'
            )}
            loading="lazy"
          />
          {isGrid && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2 pb-2 pt-8">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono-label text-[10px] font-bold uppercase tracking-wide text-white/70">
                  Performance
                </span>
                {statsLine.kind === 'hidden' && (
                  <span className="text-[10px] text-white/55">Stats not shared</span>
                )}
                {statsLine.kind === 'empty' && <span className="text-[10px] text-white/55">—</span>}
                {statsLine.kind === 'notrade' && (
                  <span className="text-[10px] text-amber-200/90">No trades yet</span>
                )}
                {statsLine.kind === 'na' && (
                  <span className="text-[10px] text-white/80">{statsLine.trades} trades</span>
                )}
                {statsLine.kind === 'rate' && (
                  <span className="tabular-nums text-[11px] font-semibold text-[var(--sl-green)]">
                    {statsLine.pct.toFixed(1)}% win rate
                    <span className="ml-1.5 font-normal text-white/75">· {statsLine.trades} trades</span>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Actions — grid cards use a fixed 4-col layout (never viewport-based text) */}
      {isGrid ? (
        <div className="mt-3 grid grid-cols-4 gap-0.5 border-t border-[var(--sl-border)] pt-2.5">
          <button
            type="button"
            title={liked ? 'Unlike' : 'Like'}
            onClick={(e) => {
              e.stopPropagation();
              handleLike();
            }}
            className="flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[var(--sl-text)] transition hover:bg-[var(--sl-input)]"
          >
            <Heart
              className={cn(
                'h-4 w-4 shrink-0',
                liked ? 'fill-[var(--sl-red)] text-[var(--sl-red)]' : 'text-[var(--sl-text-sec)]'
              )}
              strokeWidth={2}
            />
            <span className="max-w-full truncate text-center text-[10px] font-medium tabular-nums leading-none text-[var(--sl-text-muted)]">
              {post.likes_count ?? 0}
            </span>
          </button>
          <button
            type="button"
            title="Comments"
            onClick={(e) => {
              e.stopPropagation();
              onOpenComments?.(post);
            }}
            className="flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[var(--sl-text)] transition hover:bg-[var(--sl-input)]"
          >
            <MessageCircle className="h-4 w-4 shrink-0 text-[var(--sl-text-sec)]" strokeWidth={2} />
            <span className="max-w-full truncate text-center text-[10px] font-medium tabular-nums leading-none text-[var(--sl-text-muted)]">
              {post.comments_count ?? 0}
            </span>
          </button>
          <button
            type="button"
            title={bookmarked ? 'Remove save' : 'Save'}
            onClick={(e) => {
              e.stopPropagation();
              handleBookmark();
            }}
            className="flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[var(--sl-text)] transition hover:bg-[var(--sl-input)]"
            aria-pressed={bookmarked}
          >
            <Bookmark
              className={cn(
                'h-4 w-4 shrink-0',
                bookmarked ? 'fill-[var(--sl-cyan)] text-[var(--sl-cyan)]' : 'text-[var(--sl-text-sec)]'
              )}
              strokeWidth={2}
            />
            <span className="text-center text-[9px] font-medium leading-none text-[var(--sl-text-muted)]">Save</span>
          </button>
          <button
            type="button"
            title="Share"
            onClick={(e) => {
              e.stopPropagation();
              handleShare();
            }}
            className="flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[var(--sl-text)] transition hover:bg-[var(--sl-input)]"
          >
            <Send className="h-4 w-4 shrink-0 text-[var(--sl-text-sec)]" strokeWidth={2} />
            <span className="text-center text-[9px] font-medium leading-none text-[var(--sl-text-muted)]">Share</span>
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap justify-center gap-1 border-t border-[var(--sl-border)] pt-3 sm:flex-nowrap sm:justify-evenly">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleLike();
            }}
            className="flex min-h-[44px] min-w-[44px] flex-1 basis-[calc(50%-0.25rem)] items-center justify-center gap-2 rounded-xl px-2 py-2 text-[var(--sl-text)] transition hover:bg-[var(--sl-input)] sm:basis-auto sm:px-3"
          >
            <Heart
              className={cn(
                'h-5 w-5 shrink-0',
                liked ? 'fill-[var(--sl-red)] text-[var(--sl-red)]' : 'text-[var(--sl-text-sec)]'
              )}
              strokeWidth={2}
            />
            <span className="hidden font-medium text-[14px] opacity-90 sm:inline">
              {liked ? 'Liked' : 'Like'} ({post.likes_count ?? 0})
            </span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenComments?.(post);
            }}
            className="flex min-h-[44px] min-w-[44px] flex-1 basis-[calc(50%-0.25rem)] items-center justify-center gap-2 rounded-xl px-2 py-2 text-[var(--sl-text)] transition hover:bg-[var(--sl-input)] sm:basis-auto sm:px-3"
          >
            <MessageCircle className="h-5 w-5 shrink-0" strokeWidth={2} />
            <span className="hidden font-medium text-[14px] opacity-90 sm:inline">
              Comments ({post.comments_count ?? 0})
            </span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleBookmark();
            }}
            className="flex min-h-[44px] min-w-[44px] flex-1 basis-[calc(50%-0.25rem)] items-center justify-center gap-2 rounded-xl px-2 py-2 text-[var(--sl-text)] transition hover:bg-[var(--sl-input)] sm:basis-auto sm:px-3"
            aria-pressed={bookmarked}
          >
            <Bookmark
              className={cn(
                'h-5 w-5 shrink-0',
                bookmarked ? 'fill-[var(--sl-cyan)] text-[var(--sl-cyan)]' : 'text-[var(--sl-text-sec)]'
              )}
              strokeWidth={2}
            />
            <span className="hidden font-medium text-[14px] opacity-90 sm:inline">
              {bookmarked ? 'Saved' : 'Save'}
            </span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleShare();
            }}
            className="flex min-h-[44px] min-w-[44px] flex-1 basis-[calc(50%-0.25rem)] items-center justify-center gap-2 rounded-xl px-2 py-2 text-[var(--sl-text)] transition hover:bg-[var(--sl-input)] sm:basis-auto sm:px-3"
          >
            <Send className="h-5 w-5 shrink-0" strokeWidth={2} />
            <span className="hidden font-medium text-[14px] opacity-90 sm:inline">Share</span>
          </button>
        </div>
      )}
    </article>
  );
}

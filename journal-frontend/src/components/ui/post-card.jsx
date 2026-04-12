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
        'w-full rounded-3xl border p-4 transition-shadow',
        !isGrid && 'max-w-[30rem]',
        'border-[var(--sl-border)] bg-[var(--sl-card)]',
        'shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] hover:shadow-[0_28px_55px_-10px_rgba(38,67,247,0.12)]',
        onOpenStrategy && 'cursor-pointer select-none outline-none hover:border-[var(--sl-accent)]/40 focus-visible:ring-2 focus-visible:ring-[var(--sl-accent)]'
      )}
    >
      {/* Header */}
      <div className="card-header flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <img
            src={avatarUrlFor(authorName)}
            alt=""
            width={40}
            height={40}
            className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-[var(--sl-border)]"
          />
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold leading-tight text-[var(--sl-text)]">
              {authorName}
              <span className="mt-0.5 flex flex-wrap items-center gap-2 text-sm font-normal opacity-70">
                <small className="text-[var(--sl-text-sec)]">{handle}</small>
                <span className="text-[var(--sl-text-muted)]">·</span>
                <small className="text-[var(--sl-text-muted)]">{timeAgo}</small>
                {visBadge && (
                  <span className="rounded-md bg-[var(--sl-input)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--sl-text-sec)]">
                    {visBadge}
                  </span>
                )}
              </span>
            </h3>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mt-4 flex flex-col gap-4">
        <div>
          <p className="text-base font-semibold text-[var(--sl-text)]">{title}</p>
          {caption ? (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--sl-text-sec)]">
              {caption}
            </p>
          ) : null}
        </div>
        <img
          src={heroSrc}
          alt=""
          className={cn('w-full rounded-xl object-cover', isGrid ? 'max-h-36' : 'max-h-56')}
          loading="lazy"
        />
      </div>

      {/* Actions */}
      <div className="mt-4 flex justify-evenly gap-1 border-t border-[var(--sl-border)] pt-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleLike();
          }}
          className="flex grow items-center justify-center gap-2 rounded-xl px-3 py-2 text-[var(--sl-text)] transition hover:bg-[var(--sl-input)]"
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
          className="flex grow items-center justify-center gap-2 rounded-xl px-3 py-2 text-[var(--sl-text)] transition hover:bg-[var(--sl-input)]"
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
          className="flex grow items-center justify-center gap-2 rounded-xl px-3 py-2 text-[var(--sl-text)] transition hover:bg-[var(--sl-input)]"
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
          className="flex grow items-center justify-center gap-2 rounded-xl px-3 py-2 text-[var(--sl-text)] transition hover:bg-[var(--sl-input)]"
        >
          <Send className="h-5 w-5 shrink-0" strokeWidth={2} />
          <span className="hidden font-medium text-[14px] opacity-90 sm:inline">Share</span>
        </button>
      </div>
    </article>
  );
}

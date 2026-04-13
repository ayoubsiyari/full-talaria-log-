// @ts-nocheck
"use client";
import React, { useEffect, useState } from 'react';
import { ExternalLink, ImageIcon } from 'lucide-react';

/** Returns normalized https? URL or null. */
export function normalizeReferenceUrl(raw) {
  const t = typeof raw === 'string' ? raw.trim() : '';
  if (!t) return null;
  try {
    const href = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    const u = new URL(href);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}

export default function ConditionReferenceUrlBlock({ value, onChange, compact, readOnly }) {
  const safe = normalizeReferenceUrl(value);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [value]);

  if (readOnly) {
    if (!String(value || '').trim()) return null;
    return (
      <div className={compact ? 'mt-2' : 'mt-2'}>
        <div className="mb-1 flex items-center gap-1.5">
          <ImageIcon size={12} className="shrink-0 text-[var(--sl-text-muted)]" aria-hidden />
          <span className="font-mono-label text-[9px] font-bold uppercase text-[var(--sl-text-muted)]">
            Reference
          </span>
        </div>
        {safe ? (
          <div className="overflow-hidden rounded-md border border-[var(--sl-border)] bg-[var(--sl-bg)]">
            {!imgFailed ? (
              <img
                src={safe}
                alt=""
                className="max-h-36 w-full object-contain object-top"
                onError={() => setImgFailed(true)}
              />
            ) : (
              <div className="px-2 py-1.5 text-[10px] text-[var(--sl-text-sec)]">
                <a
                  href={safe}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-[var(--sl-accent)] hover:underline"
                >
                  <ExternalLink size={11} />
                  Open link
                </a>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[10px] text-[var(--sl-text-muted)]">Invalid URL</p>
        )}
      </div>
    );
  }

  return (
    <div className={compact ? 'mt-2' : 'mt-3 border-t border-[var(--sl-border)] pt-3'}>
      <div className="mb-1 flex items-center gap-1.5">
        <ImageIcon size={14} className="shrink-0 text-[var(--sl-text-muted)]" aria-hidden />
        <span className="font-mono-label text-[10px] font-bold uppercase text-[var(--sl-text-muted)]">
          Screenshot / link
        </span>
        <span className="text-[10px] text-[var(--sl-text-faint)]">optional</span>
      </div>
      <input
        type="url"
        inputMode="url"
        autoComplete="url"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://… (image URL or any page)"
        className="w-full rounded-md border border-[var(--sl-border)] bg-[var(--sl-card)] px-2 py-1.5 text-[11px] text-[var(--sl-text)] placeholder:text-[var(--sl-text-faint)] focus:outline-none focus:ring-1 focus:ring-[var(--sl-accent)]"
      />
      {safe ? (
        <div className="mt-2 overflow-hidden rounded-md border border-[var(--sl-border)] bg-[var(--sl-bg)]">
          {!imgFailed ? (
            <img
              src={safe}
              alt=""
              className="max-h-48 w-full object-contain object-top"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-[11px] text-[var(--sl-text-sec)]">
              <span>Preview not available for this URL.</span>
              <a
                href={safe}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-[var(--sl-accent)] hover:underline"
              >
                <ExternalLink size={12} />
                Open link
              </a>
            </div>
          )}
          {!imgFailed ? (
            <div className="flex justify-end border-t border-[var(--sl-border)] bg-[var(--sl-input)]/50 px-2 py-1">
              <a
                href={safe}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-[var(--sl-text-muted)] hover:text-[var(--sl-accent)]"
              >
                <ExternalLink size={12} />
                Open in new tab
              </a>
            </div>
          ) : null}
        </div>
      ) : value && String(value).trim() ? (
        <p className="mt-1 text-[10px] text-[var(--sl-orange)]">Enter a valid http(s) URL.</p>
      ) : null}
    </div>
  );
}

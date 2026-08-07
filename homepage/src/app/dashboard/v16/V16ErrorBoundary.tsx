"use client";

import React from "react";
import { maybeReloadForChunkError, isChunkLoadError } from "@/lib/chunkReload";

type Props = {
  isArabic?: boolean;
  /**
   * When this value changes while an error is showing, the boundary clears the
   * error and re-renders its children (recovery on view switch). Unlike keying
   * the whole boundary on the view, this does NOT remount children when there is
   * no error — so normal tab switches keep the heavy TalariaV16 app mounted
   * instead of tearing it down and re-bootstrapping (which caused a visible
   * "flash back to the previous view" + jank on every navigation).
   */
  resetKey?: string | number | null;
  children: React.ReactNode;
};

type State = { error: Error | null };

/**
 * Contains render/hydration crashes inside the embedded V16 dashboard so a single
 * bad record (e.g. a malformed saved strategy on the bank view) shows a recoverable
 * panel instead of Next's full-page "client-side exception" crash screen.
 *
 * Also catches `ChunkLoadError` thrown when the lazy `TalariaV16` chunk fails to
 * load after a deploy, and reloads once to fetch fresh chunks.
 */
export default class V16ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prevProps: Props) {
    // Recover when the user navigates to a different view after a crash.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error) {
    // Stale-deploy chunk failure: reload once to pick up the new bundle.
    if (maybeReloadForChunkError(error)) return;
    try {
      console.error("[V16] dashboard render error", error);
    } catch {
      /* ignore */
    }
  }

  handleReload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // A chunk error is being resolved by an in-flight reload — show a neutral
    // placeholder rather than an error message that will flash before reload.
    const chunk = isChunkLoadError(error);
    const isArabic = this.props.isArabic;

    return (
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          boxSizing: "border-box",
          background: "#000000",
          fontFamily: '"Helvetica Now","Helvetica Neue",Helvetica,Arial,sans-serif',
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 460 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#ff8a9a", marginBottom: 10 }}>
            {chunk
              ? isArabic
                ? "جارٍ تحديث التطبيق…"
                : "Updating the app…"
              : isArabic
                ? "تعذّر تحميل لوحة التحكم"
                : "This page hit an error"}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.65)", lineHeight: 1.5, marginBottom: 18 }}>
            {chunk
              ? isArabic
                ? "يتم إعادة التحميل تلقائياً للحصول على أحدث إصدار."
                : "Reloading automatically to get the latest version."
              : isArabic
                ? "حدث خطأ أثناء عرض هذه الصفحة. أعد التحميل للمحاولة مرة أخرى."
                : "Something went wrong while rendering this page. Reload to try again."}
          </div>
          {!chunk ? (
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#fff",
                background: "rgba(48,144,255,0.85)",
                border: "1px solid rgba(48,144,255,0.5)",
                borderRadius: 8,
                padding: "9px 18px",
                cursor: "pointer",
                fontFamily: '"Helvetica Now","Helvetica Neue",Helvetica,Arial,sans-serif',
              }}
            >
              {isArabic ? "إعادة التحميل" : "Reload"}
            </button>
          ) : null}
        </div>
      </div>
    );
  }
}

import React from "react";

export const SUPPORT_CATEGORIES: { value: string; label: string }[] = [
  { value: "billing", label: "Billing" },
  { value: "account", label: "Account" },
  { value: "access", label: "Access" },
  { value: "bug", label: "Bug" },
  { value: "error", label: "Error" },
  { value: "feature", label: "Feature request" },
  { value: "modifications", label: "Modifications" },
  { value: "suggestions", label: "Suggestions / Features" },
  { value: "other", label: "Other" },
];

const CAT_CLASS: Record<string, string> = {
  billing: "support-cat-billing",
  account: "support-cat-account",
  access: "support-cat-access",
  bug: "support-cat-bug",
  error: "support-cat-error",
  feature: "support-cat-feature",
  modifications: "support-cat-modifications",
  suggestions: "support-cat-suggestions",
  other: "support-cat-other",
};

export function supportCategoryLabel(cat: string): string {
  const key = (cat || "other").toLowerCase();
  return SUPPORT_CATEGORIES.find((c) => c.value === key)?.label ?? key;
}

export function SupportCategoryBadge({ category }: { category: string }) {
  const key = (category || "other").toLowerCase();
  const css = CAT_CLASS[key] ?? CAT_CLASS.other;
  return <span className={`support-cat-badge ${css}`}>{supportCategoryLabel(category)}</span>;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return value;
  const objectValue = value as object;
  if (seen.has(objectValue)) return value;
  seen.add(objectValue);

  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen);
  }

  return Object.freeze(value);
}

export function buildSupportContext(): Record<string, string | string[]> {
  if (typeof window === "undefined") return deepFreeze({});
  const ctx: Record<string, string | string[]> = {
    app: "talaria-dashboard",
    url: window.location.href.slice(0, 500),
  };
  try {
    ctx.user_agent = navigator.userAgent.slice(0, 200);
  } catch {
    /* ignore */
  }
  const boundedId = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
  try {
    const values = (
      window.__TALARIA_DEGRADED_STATE ??
      window.__TALARIA_DEGRADED_STATE__ ??
      window.__TALARIA_DEGRADED_MODE__
    )?.degradedModules;
    ctx.degradedModules = Array.isArray(values)
      ? [...new Set(values.filter((value): value is string =>
          typeof value === "string" && boundedId.test(value)
        ))].slice(0, 32)
      : [];
  } catch {
    ctx.degradedModules = [];
  }
  return deepFreeze(ctx);
}

export const SUPPORT_FILE_ACCEPT =
  "image/jpeg,image/png,image/gif,image/webp,.txt,.log,.json,application/json,text/plain";

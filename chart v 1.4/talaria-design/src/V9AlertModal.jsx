import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChromeIcon as I } from "./chromeIcons.jsx";

const CONDITIONS = [
  { id: "crossing", label: "Crossing" },
  { id: "crossing_up", label: "Crossing up" },
  { id: "crossing_down", label: "Crossing down" },
  { id: "greater_than", label: "Greater than" },
  { id: "less_than", label: "Less than" },
];

const TRIGGERS = [
  { id: "every_time", label: "Every time" },
  { id: "once", label: "Only once" },
  { id: "once_per_bar", label: "Once per bar" },
];

const COLOR_PRESETS = [
  ["#ff9800", "Orange"],
  ["#ffc107", "Amber"],
  ["#f44336", "Red"],
  ["#00d4a1", "Green"],
  ["#3090ff", "Blue"],
  ["#a78bfa", "Purple"],
];

const MIN_W = 360;
const MIN_H = 420;
const DEFAULT_W = 420;
const DEFAULT_H = 520;

function normalizeHex(c) {
  const s = String(c || "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  return s;
}

function clampSize(w, h) {
  const vpW = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vpH = typeof window !== "undefined" ? window.innerHeight : 900;
  return {
    w: Math.max(MIN_W, Math.min(w, Math.min(640, vpW - 24))),
    h: Math.max(MIN_H, Math.min(h, Math.min(720, vpH - 24))),
  };
}

function clampPos(x, y, w, h) {
  const vpW = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vpH = typeof window !== "undefined" ? window.innerHeight : 900;
  const maxX = Math.max(0, (vpW - w) / 2 - 8);
  const maxY = Math.max(0, (vpH - h) / 2 - 8);
  return {
    x: Math.max(-maxX, Math.min(maxX, x)),
    y: Math.max(-maxY, Math.min(maxY, y)),
  };
}

/**
 * Obsidian Create / Edit Alert — floating chrome window (drag + resize).
 * Opened via `talaria-v9-open-alert` from alert-system.js.
 */
export default function V9AlertModal({
  open,
  draft,
  onClose,
  onSubmit,
  onOpenColorPicker,
  onGeometryChange,
  fontFamily,
}) {
  const priceRef = useRef(null);
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const resizeRef = useRef(null);
  const hydrateKeyRef = useRef(null);
  const onGeometryChangeRef = useRef(onGeometryChange);
  onGeometryChangeRef.current = onGeometryChange;

  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState(() => clampSize(DEFAULT_W, DEFAULT_H));
  const [menu, setMenu] = useState(null); // "condition" | "trigger" | null

  const [symbol, setSymbol] = useState("SYMBOL");
  const [price, setPrice] = useState("");
  const [condition, setCondition] = useState("crossing");
  const [trigger, setTrigger] = useState("every_time");
  const [message, setMessage] = useState("");
  const [color, setColor] = useState("#ff9800");
  const [showPopup, setShowPopup] = useState(true);
  const [playSound, setPlaySound] = useState(true);
  const [priceError, setPriceError] = useState(false);

  // Hydrate once per open session — do not re-run when liveColor/color patches the draft
  // (that was snapping the window back to center while the color picker stayed put).
  useEffect(() => {
    if (!open || !draft) {
      hydrateKeyRef.current = null;
      return;
    }
    const key = [
      draft.isEdit ? `edit:${draft.alertId ?? ""}` : "create",
      draft.symbol || "",
      draft.priceText != null ? String(draft.priceText) : "",
      draft.condition || "",
      draft.expiration || "",
      draft.title || "",
    ].join("|");
    if (hydrateKeyRef.current === key) return;
    hydrateKeyRef.current = key;
    setSymbol(draft.symbol || "SYMBOL");
    setPrice(draft.priceText != null ? String(draft.priceText) : "");
    setCondition(draft.condition || "crossing");
    setTrigger(draft.expiration || "every_time");
    setMessage(draft.message || "");
    setColor(normalizeHex(draft.color || "#ff9800"));
    setShowPopup(draft.showPopup !== false);
    setPlaySound(draft.playSound !== false);
    setPriceError(false);
    setMenu(null);
    setPos({ x: 0, y: 0 });
    setSize(clampSize(DEFAULT_W, DEFAULT_H));
    const t = setTimeout(() => {
      priceRef.current?.focus();
      priceRef.current?.select?.();
    }, 40);
    return () => clearTimeout(t);
  }, [open, draft]);

  useEffect(() => {
    if (!open || draft?.liveColor == null) return;
    setColor(normalizeHex(draft.liveColor));
  }, [open, draft?.liveColor]);

  useEffect(() => {
    if (!open) return;
    const onMove = (e) => {
      const d = dragRef.current;
      if (d) {
        const next = clampPos(d.ox + (e.clientX - d.sx), d.oy + (e.clientY - d.sy), size.w, size.h);
        setPos(next);
        onGeometryChangeRef.current?.();
        return;
      }
      const r = resizeRef.current;
      if (r) {
        let nw = r.sw;
        let nh = r.sh;
        if (r.axes.w) nw = r.sw + (e.clientX - r.sx);
        if (r.axes.h) nh = r.sh + (e.clientY - r.sy);
        const clamped = clampSize(nw, nh);
        setSize(clamped);
        setPos((p) => clampPos(p.x, p.y, clamped.w, clamped.h));
        onGeometryChangeRef.current?.();
      }
    };
    const onUp = () => {
      dragRef.current = null;
      resizeRef.current = null;
      onGeometryChangeRef.current?.();
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (menu) {
          e.stopPropagation();
          setMenu(null);
          return;
        }
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, size.w, size.h, menu, onClose]);

  const startDrag = useCallback((e) => {
    if (e.button != null && e.button !== 0) return;
    if (e.target?.closest?.("button, a, input, [data-alert-v2-menu]")) return;
    e.preventDefault();
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
  }, [pos.x, pos.y]);

  const startResize = useCallback((e, axes) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = {
      axes: axes || {},
      sx: e.clientX,
      sy: e.clientY,
      sw: size.w,
      sh: size.h,
    };
  }, [size.w, size.h]);

  const subtitle = useMemo(() => {
    const cond = CONDITIONS.find((c) => c.id === condition)?.label || condition;
    return [symbol, price.trim() || null, cond].filter(Boolean).join(" · ");
  }, [symbol, price, condition]);

  const isEdit = !!draft?.isEdit;
  const title = draft?.title || (isEdit ? "Edit Alert" : "Create Alert");
  const colorNorm = normalizeHex(color);
  const presetHit = COLOR_PRESETS.some(([c]) => c === colorNorm);
  const conditionLabel = CONDITIONS.find((c) => c.id === condition)?.label || condition;
  const triggerLabel = TRIGGERS.find((t) => t.id === trigger)?.label || trigger;

  if (!open || typeof document === "undefined") return null;

  const submit = () => {
    const n = parseFloat(String(price).replace(",", "."));
    if (!Number.isFinite(n)) {
      setPriceError(true);
      priceRef.current?.focus();
      return;
    }
    setPriceError(false);
    onSubmit?.({
      isEdit,
      alertId: draft?.alertId,
      price: n,
      condition,
      expiration: trigger,
      message: message.trim() || `Price ${condition} ${n}`,
      color: colorNorm,
      showPopup,
      playSound,
    });
  };

  const renderMenu = (kind, options, value, onPick) => {
    if (menu !== kind) return null;
    return (
      <div data-alert-v2-menu="" role="listbox" onMouseDown={(e) => e.stopPropagation()}>
        {options.map((opt) => {
          const on = opt.id === value;
          return (
            <button
              type="button"
              key={opt.id}
              role="option"
              aria-selected={on}
              data-on={on ? "1" : undefined}
              onClick={(e) => {
                e.stopPropagation();
                onPick(opt.id);
                setMenu(null);
              }}
            >
              <span>{opt.label}</span>
              {on ? <I n="check" s={12} cl="currentColor" /> : null}
            </button>
          );
        })}
      </div>
    );
  };

  const sz = clampSize(size.w, size.h);
  const p = clampPos(pos.x, pos.y, sz.w, sz.h);

  return createPortal(
    <div
      ref={panelRef}
      data-v9-chrome="1"
      data-alert-v2="1"
      data-chrome-win="alert"
      data-sdrop="1"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (!e.target.closest("[data-alert-v2-dd]")) setMenu(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target?.tagName !== "TEXTAREA") {
          if (e.target?.tagName === "BUTTON") return;
          e.preventDefault();
          submit();
        }
      }}
      style={{
        position: "fixed",
        top: `calc(50% + ${p.y}px)`,
        left: `calc(50% + ${p.x}px)`,
        transform: "translate(-50%, -50%)",
        width: sz.w,
        height: sz.h,
        zIndex: 100050,
        fontFamily: fontFamily || "var(--font-ui)",
      }}
    >
      <header data-win-header="" data-alert-drag="" onPointerDown={startDrag}>
        <div data-win-icon="" aria-hidden="true">
          <I n="bell" s={15} cl="var(--accent)" />
        </div>
        <div data-alert-v2-titles="">
          <span data-win-title="">{title}</span>
          <em data-alert-v2-sub="">{subtitle}</em>
        </div>
        <button
          type="button"
          data-brand-icon="1"
          aria-label="Close"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onClose?.();
          }}
        >
          <I n="x" s={14} cl="var(--text-muted)" />
        </button>
      </header>

      <div data-alert-v2-body="" className="tlr-scroll">
        <div data-alert-v2-grid="">
          <label data-alert-v2-field="">
            <span>Symbol</span>
            <input type="text" value={symbol} readOnly tabIndex={-1} />
          </label>
          <label data-alert-v2-field="" data-err={priceError ? "1" : undefined}>
            <span>Price</span>
            <input
              ref={priceRef}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              data-alert-price=""
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                if (priceError) setPriceError(false);
              }}
            />
          </label>

          <div data-alert-v2-field="" data-alert-v2-dd="">
            <span>Condition</span>
            <button
              type="button"
              data-alert-v2-select=""
              data-open={menu === "condition" ? "1" : undefined}
              aria-haspopup="listbox"
              aria-expanded={menu === "condition"}
              onClick={(e) => {
                e.stopPropagation();
                setMenu((m) => (m === "condition" ? null : "condition"));
              }}
            >
              <em>{conditionLabel}</em>
              <I n="chevDown" s={11} cl="currentColor" />
            </button>
            {renderMenu("condition", CONDITIONS, condition, setCondition)}
          </div>

          <div data-alert-v2-field="" data-alert-v2-dd="">
            <span>Trigger</span>
            <button
              type="button"
              data-alert-v2-select=""
              data-open={menu === "trigger" ? "1" : undefined}
              aria-haspopup="listbox"
              aria-expanded={menu === "trigger"}
              onClick={(e) => {
                e.stopPropagation();
                setMenu((m) => (m === "trigger" ? null : "trigger"));
              }}
            >
              <em>{triggerLabel}</em>
              <I n="chevDown" s={11} cl="currentColor" />
            </button>
            {renderMenu("trigger", TRIGGERS, trigger, setTrigger)}
          </div>

          <label data-alert-v2-field="" data-span="2">
            <span>Message</span>
            <input
              type="text"
              value={message}
              placeholder="Optional note for this alert"
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
        </div>

        <div data-alert-v2-field="">
          <span>Line color</span>
          <div data-alert-v2-swatches="">
            {COLOR_PRESETS.map(([hex, name]) => (
              <button
                type="button"
                key={hex}
                data-alert-v2-swatch=""
                data-on={colorNorm === hex ? "1" : undefined}
                aria-label={name}
                style={{ "--swatch": hex }}
                onClick={() => setColor(hex)}
              />
            ))}
            <button
              type="button"
              data-alert-v2-swatch=""
              data-custom="1"
              data-on={!presetHit ? "1" : undefined}
              aria-label="Custom color"
              style={{ "--swatch": colorNorm }}
              onClick={(e) => {
                e.stopPropagation();
                onOpenColorPicker?.(e.currentTarget, colorNorm);
              }}
            >
              <I n="plus" s={12} cl="currentColor" />
            </button>
          </div>
        </div>

        <div data-alert-v2-field="">
          <span>Notify</span>
          <div data-alert-v2-togs="">
            <button
              type="button"
              data-alert-v2-tog=""
              data-on={showPopup ? "1" : undefined}
              aria-pressed={showPopup}
              onClick={() => setShowPopup((v) => !v)}
            >
              <I n="layout" s={13} cl="currentColor" />
              Popup
            </button>
            <button
              type="button"
              data-alert-v2-tog=""
              data-on={playSound ? "1" : undefined}
              aria-pressed={playSound}
              onClick={() => setPlaySound((v) => !v)}
            >
              <I n="bell" s={13} cl="currentColor" />
              Sound
            </button>
          </div>
        </div>
      </div>

      <footer data-win-foot="">
        <button type="button" data-brand-btn="ghost" onClick={() => onClose?.()}>
          Cancel
        </button>
        <button type="button" data-brand-btn="primary" onClick={submit}>
          {isEdit ? "Update" : "Create"}
        </button>
      </footer>

      <div data-alert-resize="e" onPointerDown={(e) => startResize(e, { w: true })} />
      <div data-alert-resize="s" onPointerDown={(e) => startResize(e, { h: true })} />
      <div data-alert-resize="se" onPointerDown={(e) => startResize(e, { w: true, h: true })} aria-hidden="true" />
    </div>,
    document.body
  );
}

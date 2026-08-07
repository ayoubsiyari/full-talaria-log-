import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

function $(id) {
  return typeof document !== "undefined" ? document.getElementById(id) : null;
}

function setInputValueAndNotify(input, value) {
  if (!input) return;
  const v = value == null ? "" : String(value);
  if (input.value === v) {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  input.value = v;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function setCheckboxAndNotify(input, checked) {
  if (!input) return;
  if (input.checked === checked) {
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  input.checked = checked;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function clickId(id) {
  $(id)?.click?.();
}

/**
 * HeroUI-minimal Place Order surface — forwards actions to native `#orderPanel`.
 * Uses chrome CSS variables so light/dark presets stay in sync.
 */
export function V9ReactPlaceOrder({ c, F, symbol, currentSymbol, setOrderPanelOpen }) {
  const presetSelectRef = useRef(null);
  const [side, setSide] = useState("buy");
  const [orderType, setOrderType] = useState("market");
  const [posMode, setPosMode] = useState("usd");
  const [riskField, setRiskField] = useState("100");
  const [entry, setEntry] = useState("0");
  const [sl, setSl] = useState("0");
  const [tp, setTp] = useState("0");
  const [tpRR, setTpRR] = useState("0");
  const [tpProfit, setTpProfit] = useState("0");
  const [slOn, setSlOn] = useState(true);
  const [tpOn, setTpOn] = useState(true);
  const [advanced, setAdvanced] = useState(false);
  const [rewardTxt, setRewardTxt] = useState("$0");
  const [riskSummaryTxt, setRiskSummaryTxt] = useState("$0");
  const [marginTxt, setMarginTxt] = useState("—");
  const [placeLabel, setPlaceLabel] = useState("Place order");
  const [costsLine, setCostsLine] = useState("");
  const [slDist, setSlDist] = useState("—");
  const [slQty, setSlQty] = useState("—");
  const [tpDist, setTpDist] = useState("—");
  const [tpProfitMeta, setTpProfitMeta] = useState("—");
  const [rrBar, setRrBar] = useState({ risk: "50%", reward: "50%" });
  const [validationTxt, setValidationTxt] = useState("");

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    window.__talariaV9ReactOrderUi = true;
    window.__talariaV9OrderRailOpen = true;
    try {
      window.chart?.orderManager?.syncOrderPanelMountTarget?.();
    } catch (_) {}
    return () => {
      window.__talariaV9ReactOrderUi = false;
      window.__talariaV9OrderRailOpen = false;
      try {
        window.chart?.orderManager?.syncOrderPanelMountTarget?.();
      } catch (_) {}
    };
  }, []);

  const syncPresetOptions = useCallback(() => {
    const src = $("orderPanelPresetSelect");
    const dst = presetSelectRef.current;
    if (!src || !dst) return;
    const keep = dst.value;
    dst.innerHTML = src.innerHTML;
    dst.value = src.value || keep;
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      const buyOn = $("buyTab")?.classList.contains("active");
      setSide(buyOn ? "buy" : "sell");
      const ot = document.querySelector("#orderPanel .order-type-btn.active");
      setOrderType(ot?.dataset?.type || "market");
      const pm = document.querySelector("#orderPanel .position-mode-tab.active");
      const mode = pm?.dataset?.mode;
      if (mode === "risk-usd") setPosMode("usd");
      else if (mode === "risk-percent") setPosMode("pct");
      else if (mode === "lot-size") setPosMode("lot");

      const rid = mode === "risk-percent" ? "riskAmountPercent" : mode === "lot-size" ? "lotSizeAmount" : "riskAmountUSD";
      setRiskField($(rid)?.value ?? "");

      setEntry($("orderEntryPrice")?.value ?? "0");
      setSl($("slPrice")?.value ?? "0");
      setTp($("tpPrice")?.value ?? "0");
      setTpRR($("tpRRInput")?.value ?? "0");
      setTpProfit($("tpTargetProfitUSD")?.value ?? "0");
      setSlOn(!!$("enableSL")?.checked);
      setTpOn(!!$("enableTP")?.checked);
      setAdvanced(!!$("advancedOrderToggle")?.checked);

      setRewardTxt($("rewardAmount")?.textContent?.trim() || "$0");
      setRiskSummaryTxt($("riskAmount")?.textContent?.trim() || "$0");
      setMarginTxt($("marginLevelBadge")?.textContent?.trim() || "—");
      const pb = $("placeOrderButton");
      setPlaceLabel(pb?.textContent?.trim() || "Place order");

      const inst = $("orderPanelInstrumentCosts");
      if (inst && inst.style.display !== "none" && inst.textContent?.trim()) {
        setCostsLine(inst.textContent.replace(/\s+/g, " ").trim());
      } else {
        setCostsLine("");
      }

      setSlDist($("slPipsDisplay")?.textContent?.trim() || "—");
      setSlQty($("slQuantityDisplay")?.textContent?.trim() || "—");
      setTpDist($("tpDistanceDisplay")?.textContent?.trim() || "—");
      setTpProfitMeta($("tpProfitDisplay")?.textContent?.trim() || "—");
      setRrBar({
        risk: $("tpRiskRewardBarRisk")?.style?.width || "50%",
        reward: $("tpRiskRewardBarReward")?.style?.width || "50%",
      });

      const vbox = $("orderValidation");
      const vErr = !!vbox && vbox.className.indexOf("order-validation--error") !== -1;
      setValidationTxt(vErr ? (vbox.textContent || "").replace(/\s+/g, " ").trim() : "");

      syncPresetOptions();
    }, 220);
    return () => clearInterval(t);
  }, [syncPresetOptions]);

  const onBuySell = (s) => {
    if (s === "buy") clickId("buyTab");
    else clickId("sellTab");
  };

  const onOrderType = (t) => {
    const btn = document.querySelector(`#orderPanel .order-type-btn[data-type="${t}"]`);
    btn?.click?.();
  };

  const onPosMode = (m) => {
    const map = { usd: "risk-usd", pct: "risk-percent", lot: "lot-size" };
    const btn = document.querySelector(`#orderPanel .position-mode-tab[data-mode="${map[m]}"]`);
    btn?.click?.();
  };

  const activeRiskInputId = () => {
    const pm = document.querySelector("#orderPanel .position-mode-tab.active");
    const mode = pm?.dataset?.mode;
    if (mode === "risk-percent") return "riskAmountPercent";
    if (mode === "lot-size") return "lotSizeAmount";
    return "riskAmountUSD";
  };

  const stepRisk = (dir) => {
    const target = activeRiskInputId();
    const btns = document.querySelectorAll(`#orderPanel .input-stepper[data-target="${target}"]`);
    const idx = dir < 0 ? 0 : 1;
    btns[idx]?.click?.();
  };

  const commitRiskInput = () => {
    setInputValueAndNotify($(activeRiskInputId()), riskField);
  };

  const typeCaps =
    currentSymbol?.type && typeof currentSymbol.type === "string"
      ? currentSymbol.type.charAt(0).toUpperCase() + currentSymbol.type.slice(1)
      : "Forex";

  const field = {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface-sunken)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    color: "var(--text)",
    fontSize: 13,
    fontFamily: F,
    padding: "10px 12px",
    outline: "none",
  };

  const label = {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-faint)",
    marginBottom: 6,
    letterSpacing: "0.02em",
  };

  return (
    <div
      id="v9OrderPanelMount"
      data-v9-chrome="1"
      data-v9-order="1"
      style={{
        flex: 1,
        minHeight: 0,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--surface)",
        fontFamily: F,
        color: "var(--text)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          padding: "12px 14px",
          borderBottom: "1px solid var(--line)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 650, letterSpacing: "-0.01em", marginBottom: 8 }}>Order</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <span
              style={{
                fontSize: 12,
                fontWeight: 650,
                padding: "4px 10px",
                borderRadius: 999,
                background: "var(--accent-quiet)",
                color: "var(--accent)",
              }}
            >
              {symbol || "—"}
            </span>
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{typeCaps}</span>
          </div>
          {costsLine ? (
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-faint)", lineHeight: 1.35 }}>{costsLine}</div>
          ) : null}
        </div>
        <button
          type="button"
          data-brand-icon="1"
          aria-label="Close"
          onClick={() => setOrderPanelOpen(false)}
          style={{ width: 32, height: 32, fontSize: 18, color: "var(--text-muted)" }}
        >
          ×
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 14px 16px" }}>
        <div style={label}>Template</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <select
            ref={presetSelectRef}
            onMouseDown={syncPresetOptions}
            onFocus={syncPresetOptions}
            onChange={(e) => {
              const src = $("orderPanelPresetSelect");
              if (!src) return;
              src.value = e.target.value;
              src.dispatchEvent(new Event("change", { bubbles: true }));
            }}
            data-brand-field="1"
            style={{ ...field, flex: 1, minWidth: 120 }}
          >
            <option value="">Select…</option>
          </select>
          {[
            ["Load", "orderPanelPresetLoadBtn"],
            ["Save", "orderPanelPresetSaveBtn"],
            ["Del", "orderPanelPresetDeleteBtn"],
          ].map(([lbl, id]) => (
            <button key={id} type="button" data-brand-btn="ghost" onClick={() => clickId(id)} style={{ padding: "8px 10px", fontSize: 11, fontWeight: 600, fontFamily: F }}>
              {lbl}
            </button>
          ))}
        </div>

        <div data-brand-seg="1" style={{ display: "flex", gap: 4, marginBottom: 10 }}>
          <button type="button" data-brand-btn="buy" data-active={side === "buy" ? "1" : undefined} onClick={() => onBuySell("buy")} style={{ flex: 1, height: 36, fontFamily: F }}>
            BUY
          </button>
          <button type="button" data-brand-btn="sell" data-active={side === "sell" ? "1" : undefined} onClick={() => onBuySell("sell")} style={{ flex: 1, height: 36, fontFamily: F }}>
            SELL
          </button>
        </div>

        <div data-brand-seg="1" style={{ display: "flex", gap: 2, marginBottom: 14 }}>
          {[
            ["market", "Market"],
            ["limit", "Limit"],
            ["stop", "Stop"],
          ].map(([t, lbl]) => (
            <button
              key={t}
              type="button"
              data-brand-seg-item=""
              data-active={orderType === t ? "1" : undefined}
              aria-pressed={orderType === t}
              onClick={() => onOrderType(t)}
              style={{ flex: 1, height: 30, fontSize: 11, fontWeight: 600, fontFamily: F, cursor: "default" }}
            >
              {lbl}
            </button>
          ))}
        </div>

        <div style={label}>Size</div>
        <div data-brand-seg="1" style={{ display: "inline-flex", gap: 2, marginBottom: 8 }}>
          {[
            ["usd", "$"],
            ["pct", "%"],
            ["lot", "#"],
          ].map(([m, sym]) => (
            <button
              key={m}
              type="button"
              data-brand-seg-item=""
              data-active={posMode === m ? "1" : undefined}
              onClick={() => onPosMode(m)}
              style={{ width: 36, height: 32, fontWeight: 700, fontSize: 13, fontFamily: F, cursor: "default" }}
            >
              {sym}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
          <input
            value={riskField}
            onChange={(e) => setRiskField(e.target.value)}
            onBlur={commitRiskInput}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRiskInput();
            }}
            style={{ ...field, flex: 1 }}
            inputMode="decimal"
          />
          <button type="button" data-brand-btn="ghost" onClick={() => stepRisk(-1)} style={{ width: 36, height: 36, fontFamily: F }}>−</button>
          <button type="button" data-brand-btn="ghost" onClick={() => stepRisk(1)} style={{ width: 36, height: 36, fontFamily: F }}>+</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div>
            <div style={label}>Entry</div>
            <input
              value={entry}
              onChange={(e) => {
                const v = e.target.value;
                setEntry(v);
                setInputValueAndNotify($("orderEntryPrice"), v);
              }}
              style={field}
              inputMode="decimal"
            />
          </div>
          <div>
            <div style={{ ...label, display: "flex", alignItems: "center", gap: 8 }}>
              Stop loss
              <input
                type="checkbox"
                checked={slOn}
                onChange={(e) => {
                  const on = e.target.checked;
                  setSlOn(on);
                  setCheckboxAndNotify($("enableSL"), on);
                }}
                style={{ marginLeft: "auto" }}
              />
            </div>
            <input
              value={sl}
              onChange={(e) => {
                const v = e.target.value;
                setSl(v);
                setInputValueAndNotify($("slPrice"), v);
              }}
              style={field}
              inputMode="decimal"
            />
            <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 4 }}>
              Dist {slDist} · Qty {slQty}
            </div>
          </div>
        </div>

        <div
          style={{
            border: "1px solid var(--line)",
            borderRadius: 14,
            padding: 12,
            marginBottom: 14,
            background: "var(--surface-sunken)",
          }}
        >
          <div style={{ ...label, display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "var(--text-muted)" }}>
            Take profit
            <input
              type="checkbox"
              checked={tpOn}
              onChange={(e) => {
                const on = e.target.checked;
                setTpOn(on);
                setCheckboxAndNotify($("enableTP"), on);
              }}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 4 }}>Price</div>
              <input
                value={tp}
                onChange={(e) => {
                  const v = e.target.value;
                  setTp(v);
                  setInputValueAndNotify($("tpPrice"), v);
                }}
                style={field}
                inputMode="decimal"
              />
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 4 }}>R:R</div>
              <input
                value={tpRR}
                onChange={(e) => {
                  const v = e.target.value;
                  setTpRR(v);
                  setInputValueAndNotify($("tpRRInput"), v);
                }}
                style={field}
                inputMode="decimal"
              />
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--text-faint)", marginBottom: 4 }}>Profit</div>
              <input
                value={tpProfit}
                onChange={(e) => {
                  const v = e.target.value;
                  setTpProfit(v);
                  setInputValueAndNotify($("tpTargetProfitUSD"), v);
                }}
                style={field}
                inputMode="decimal"
              />
            </div>
          </div>
          <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 8 }}>
            Dist {tpDist} · Profit {tpProfitMeta}
          </div>
          <div style={{ display: "flex", width: "100%", height: 4, borderRadius: 999, overflow: "hidden", marginTop: 10, background: "var(--line)" }}>
            <div style={{ flex: `0 0 ${rrBar.risk}`, background: "var(--down)" }} />
            <div style={{ flex: `0 0 ${rrBar.reward}`, background: "var(--up)" }} />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: "var(--text)" }}>Advanced</span>
          <button
            type="button"
            role="switch"
            aria-checked={advanced}
            onClick={() => $("advancedOrderToggle")?.click()}
            style={{
              width: 44,
              height: 26,
              borderRadius: 999,
              border: "1px solid var(--line)",
              background: advanced ? "var(--accent)" : "var(--surface-sunken)",
              position: "relative",
              cursor: "default",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 3,
                left: advanced ? 22 : 3,
                width: 18,
                height: 18,
                borderRadius: "50%",
                background: "var(--brand-white)",
                transition: "left var(--motion)",
              }}
            />
          </button>
        </div>

        <div style={{ marginBottom: 14, display: "grid", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Reward</span>
            <span style={{ fontSize: 13, fontWeight: 650, color: "var(--up)", fontVariantNumeric: "tabular-nums" }}>{rewardTxt}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Risk</span>
            <span style={{ fontSize: 13, fontWeight: 650, color: "var(--down)", fontVariantNumeric: "tabular-nums" }}>{riskSummaryTxt}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>Margin</span>
            <span style={{ fontSize: 13, fontWeight: 650, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{marginTxt}</span>
          </div>
        </div>

        {validationTxt ? (
          <div role="alert" style={{ marginBottom: 10, padding: "9px 11px", borderRadius: 12, border: "1px solid color-mix(in oklab, var(--down) 40%, transparent)", background: "color-mix(in oklab, var(--down) 12%, transparent)", color: "var(--down)", fontSize: 11, lineHeight: 1.35, fontFamily: F }}>
            {validationTxt}
          </div>
        ) : null}

        <button type="button" data-brand-btn="primary" onClick={() => clickId("placeOrderButton")} style={{ width: "100%", height: 42, fontSize: 13, fontWeight: 700, fontFamily: F, cursor: "default" }}>
          {placeLabel}
        </button>
      </div>
    </div>
  );
}

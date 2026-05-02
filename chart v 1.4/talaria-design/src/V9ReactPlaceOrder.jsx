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
 * V9 "new" Place Order surface: visible React UI that forwards all actions to
 * the native `#orderPanel` inputs and buttons managed by `order-manager.js`.
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
  const [placeLabel, setPlaceLabel] = useState("Make new order");
  const [costsLine, setCostsLine] = useState("");
  const [slDist, setSlDist] = useState("—");
  const [slQty, setSlQty] = useState("—");
  const [tpDist, setTpDist] = useState("—");
  const [tpProfitMeta, setTpProfitMeta] = useState("—");
  const [rrBar, setRrBar] = useState({ risk: "50%", reward: "50%" });

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
      setPlaceLabel(pb?.textContent?.trim() || "Make new order");

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

      syncPresetOptions();
    }, 180);
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

  const pairPill = symbol || "—";

  const tabBtn = (active, colActive, onClick, label) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "10px 8px",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.04em",
        borderRadius: 6,
        border: active ? `1px solid ${colActive}` : `1px solid rgba(140,160,255,0.2)`,
        background: active ? "rgba(74,106,255,0.12)" : c.hv,
        color: active ? colActive : c.ts,
        cursor: "default",
        fontFamily: F,
      }}
    >
      {label}
    </button>
  );

  const labelSm = { fontSize: 9, color: c.tm, letterSpacing: "0.08em", fontWeight: 700, marginBottom: 6 };
  const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    background: c.hv,
    border: "1px solid rgba(140,160,255,0.22)",
    borderRadius: 6,
    color: c.tx,
    fontSize: 13,
    fontFamily: F,
    padding: "8px 10px",
    outline: "none",
  };

  return (
    <div
      id="v9OrderPanelMount"
      style={{
        flex: 1,
        minHeight: 0,
        position: "relative",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        background: c.sf,
        fontFamily: F,
        color: c.tx,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          padding: "12px 12px 8px",
          borderBottom: `1px solid rgba(140,160,255,0.15)`,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#C9A84C" strokeWidth="2">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
            <span style={{ fontSize: 15, fontWeight: 700 }}>Place order</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "3px 8px",
                borderRadius: 4,
                background: "rgba(74,106,255,0.25)",
                color: "#9CB4FF",
              }}
            >
              {pairPill}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "3px 8px",
                borderRadius: 4,
                background: "rgba(139,92,246,0.25)",
                color: "#C4B5FD",
              }}
            >
              {typeCaps}
            </span>
          </div>
          {costsLine ? (
            <div style={{ marginTop: 8, fontSize: 10, color: c.tm, lineHeight: 1.35 }}>{costsLine}</div>
          ) : (
            <div style={{ marginTop: 8, fontSize: 10, color: c.tm }}>Spread and commission load with the session instrument.</div>
          )}
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={() => setOrderPanelOpen(false)}
          style={{
            flexShrink: 0,
            width: 28,
            height: 28,
            border: "none",
            borderRadius: 6,
            background: "transparent",
            color: c.ts,
            fontSize: 20,
            lineHeight: 1,
            cursor: "default",
            fontFamily: F,
          }}
        >
          ×
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "10px 12px 14px" }}>
        <div style={labelSm}>TEMPLATE PRESET</div>
        <div style={{ display: "flex", gap: 8, alignItems: "stretch", marginBottom: 14, flexWrap: "wrap" }}>
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
            style={{
              flex: 1,
              minWidth: 120,
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid rgba(140,160,255,0.22)",
              background: c.hv,
              color: c.tx,
              fontSize: 12,
              fontFamily: F,
            }}
          >
            <option value="">— Select —</option>
          </select>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              ["Load", "orderPanelPresetLoadBtn"],
              ["Save", "orderPanelPresetSaveBtn"],
              ["Del", "orderPanelPresetDeleteBtn"],
            ].map(([lbl, id]) => (
              <button
                key={id}
                type="button"
                onClick={() => clickId(id)}
                style={{
                  padding: "8px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: "1px solid rgba(140,160,255,0.25)",
                  background: c.hv,
                  color: c.tx,
                  cursor: "default",
                  fontFamily: F,
                }}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {tabBtn(side === "buy", "#34D399", () => onBuySell("buy"), "BUY")}
          {tabBtn(side === "sell", "#FB7185", () => onBuySell("sell"), "SELL")}
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {[
            ["market", "Market"],
            ["limit", "Limit"],
            ["stop", "Stop"],
          ].map(([t, lbl]) => (
            <button
              key={t}
              type="button"
              onClick={() => onOrderType(t)}
              style={{
                flex: 1,
                padding: "8px 6px",
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 6,
                border:
                  orderType === t
                    ? "1px solid #C9A84C"
                    : "1px solid rgba(140,160,255,0.2)",
                background: orderType === t ? "rgba(201,168,76,0.12)" : c.hv,
                color: orderType === t ? "#E8D48B" : c.ts,
                cursor: "default",
                fontFamily: F,
              }}
            >
              {lbl}
            </button>
          ))}
        </div>

        <div style={labelSm}>SIZE</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {[
            ["usd", "$"],
            ["pct", "%"],
            ["lot", "#"],
          ].map(([m, sym]) => (
            <button
              key={m}
              type="button"
              onClick={() => onPosMode(m)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 6,
                border:
                  posMode === m ? "1px solid rgba(74,106,255,0.8)" : "1px solid rgba(140,160,255,0.2)",
                background: posMode === m ? "rgba(74,106,255,0.15)" : c.hv,
                color: posMode === m ? c.acL : c.ts,
                fontWeight: 700,
                fontSize: 14,
                cursor: "default",
                fontFamily: F,
              }}
            >
              {sym}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
          <span style={{ color: c.ts, fontSize: 13, fontWeight: 600 }}>
            {posMode === "usd" ? "$" : posMode === "pct" ? "%" : "#"}
          </span>
          <input
            value={riskField}
            onChange={(e) => setRiskField(e.target.value)}
            onBlur={commitRiskInput}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRiskInput();
            }}
            style={{ ...inputStyle, flex: 1 }}
            inputMode="decimal"
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <button
              type="button"
              onClick={() => stepRisk(-1)}
              style={{
                width: 32,
                height: 26,
                borderRadius: 4,
                border: "1px solid rgba(140,160,255,0.2)",
                background: c.hv,
                color: c.tx,
                cursor: "default",
                fontFamily: F,
                fontSize: 14,
              }}
            >
              −
            </button>
            <button
              type="button"
              onClick={() => stepRisk(1)}
              style={{
                width: 32,
                height: 26,
                borderRadius: 4,
                border: "1px solid rgba(140,160,255,0.2)",
                background: c.hv,
                color: c.tx,
                cursor: "default",
                fontFamily: F,
                fontSize: 14,
              }}
            >
              +
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
          <div>
            <div style={{ ...labelSm, display: "flex", alignItems: "center", gap: 6 }}>
              ENTRY
              <span style={{ fontSize: 8, padding: "2px 5px", borderRadius: 3, background: c.hv, color: c.tm }}>
                MULTI
              </span>
            </div>
            <input
              value={entry}
              onChange={(e) => {
                const v = e.target.value;
                setEntry(v);
                setInputValueAndNotify($("orderEntryPrice"), v);
              }}
              style={inputStyle}
              inputMode="decimal"
            />
          </div>
          <div>
            <div style={{ ...labelSm, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#FB7185" }} />
              STOP LOSS
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
              style={inputStyle}
              inputMode="decimal"
            />
            <div style={{ fontSize: 10, color: c.tm, marginTop: 4 }}>
              Dist {slDist} — Qty {slQty}
            </div>
          </div>
        </div>

        <div
          style={{
            border: "1px solid rgba(52,211,153,0.45)",
            borderRadius: 8,
            padding: 10,
            marginBottom: 12,
            background: "rgba(52,211,153,0.04)",
          }}
        >
          <div style={{ ...labelSm, display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: "#6EE7B7" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: "#34D399" }} />
            PROFIT TARGET
            <input
              type="checkbox"
              checked={tpOn}
              onChange={(e) => {
                const on = e.target.checked;
                setTpOn(on);
                setCheckboxAndNotify($("enableTP"), on);
              }}
              style={{ marginLeft: 4 }}
            />
            <span style={{ fontSize: 8, padding: "2px 5px", borderRadius: 3, background: "rgba(0,0,0,0.2)", color: c.tm }}>
              MULTI
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 9, color: c.tm, marginBottom: 4 }}>PRICE</div>
              <input
                value={tp}
                onChange={(e) => {
                  const v = e.target.value;
                  setTp(v);
                  setInputValueAndNotify($("tpPrice"), v);
                }}
                style={inputStyle}
                inputMode="decimal"
              />
            </div>
            <div>
              <div style={{ fontSize: 9, color: c.tm, marginBottom: 4 }}>R:R</div>
              <input
                value={tpRR}
                onChange={(e) => {
                  const v = e.target.value;
                  setTpRR(v);
                  setInputValueAndNotify($("tpRRInput"), v);
                }}
                style={inputStyle}
                inputMode="decimal"
              />
            </div>
            <div>
              <div style={{ fontSize: 9, color: c.tm, marginBottom: 4 }}>PROFIT</div>
              <input
                value={tpProfit}
                onChange={(e) => {
                  const v = e.target.value;
                  setTpProfit(v);
                  setInputValueAndNotify($("tpTargetProfitUSD"), v);
                }}
                style={inputStyle}
                inputMode="decimal"
              />
            </div>
          </div>
          <div style={{ fontSize: 10, color: c.tm, marginTop: 8 }}>
            Dist {tpDist} — Profit {tpProfitMeta}
          </div>
          <div
            style={{
              display: "flex",
              width: "100%",
              height: 6,
              borderRadius: 3,
              overflow: "hidden",
              marginTop: 10,
            }}
          >
            <div style={{ flex: `0 0 ${rrBar.risk}`, background: "rgba(251,113,133,0.85)" }} />
            <div style={{ flex: `0 0 ${rrBar.reward}`, background: "rgba(52,211,153,0.85)" }} />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: c.tx }}>Advanced order</span>
          <button
            type="button"
            role="switch"
            aria-checked={advanced}
            onClick={() => {
              const el = $("advancedOrderToggle");
              if (!el) return;
              el.click();
            }}
            style={{
              width: 44,
              height: 24,
              borderRadius: 12,
              border: "1px solid rgba(140,160,255,0.3)",
              background: advanced ? c.acL : c.hv,
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
                background: "#fff",
                transition: "left 0.15s ease",
              }}
            />
          </button>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: c.tm }}>Reward</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#34D399" }}>{rewardTxt}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: c.tm }}>Risk</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#FB7185" }}>{riskSummaryTxt}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: c.tm }}>Margin Level</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: c.ts }}>{marginTxt}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => clickId("placeOrderButton")}
          style={{
            width: "100%",
            padding: "14px 16px",
            borderRadius: 8,
            border: "none",
            background: "linear-gradient(180deg, rgba(74,106,255,0.95), rgba(56,80,200,0.98))",
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            cursor: "default",
            fontFamily: F,
            boxShadow: "0 4px 16px rgba(45,67,255,0.35)",
          }}
        >
          {placeLabel}
        </button>
      </div>
    </div>
  );
}

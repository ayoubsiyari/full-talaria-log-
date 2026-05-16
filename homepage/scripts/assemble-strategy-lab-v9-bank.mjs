/**
 * One-shot assembler: builds strategyLabV9BankApp.jsx from strategyV8.jsx + extracted stratbank body.
 * Run: node scripts/assemble-strategy-lab-v9-bank.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const v8Path = path.join(root, "src/components/strategy-lab/strategyV8.jsx");
const extractPath = path.join(root, "src/components/strategy-lab-v9/_extracted_stratbank.txt");
const outPath = path.join(root, "src/components/strategy-lab-v9/strategyLabV9BankApp.jsx");

const lines = fs.readFileSync(v8Path, "utf8").split(/\r?\n/);

const sliceLines = (start1, end1) => lines.slice(start1 - 1, end1).join("\n");

const demoSessions = sliceLines(408, 419);
const sessionsBlock = sliceLines(431, 479);
const stratStates = sliceLines(610, 670);

let body = fs.readFileSync(extractPath, "utf8");
// Drop outer `if (sessView === "stratbank") {` / final `}`
body = body.replace(/^if \(sessView === "stratbank"\) \{\r?\n/, "");
body = body.replace(/\}\s*$/, "");

// New session flow from strategy bank → dashboard backtest (V8 chart wizard is not bundled here)
body = body.replace(
  /const startStrategy=\(\)=>\{[\s\S]*?setSessView\("sessions"\);\s*\};/,
  `const startStrategy=()=>{ router.push("/dashboard/backtest/"); };`,
);

const header = `"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  STRATEGY_TEMPLATES,
  buildNodesFromTemplate,
  buildInitialSections,
  TemplatePickerModal,
  StrategyBuilderModal,
  MKT_CAT_OPTS,
} from "./strategyBuilderModule.jsx";

${demoSessions}

`;

const mid = `
const Z = 1.05;
const F = "'Exo 2',sans-serif";
const c = {
  ac: "#2643F7", acL: "#4A6AFF", acD: "rgba(38,67,247,0.08)", acB: "rgba(38,67,247,0.22)", acG: "rgba(38,67,247,0.12)",
  gold: "#C9A84C", goldD: "rgba(201,168,76,0.07)",
  bg: "#07080E", sf: "#0A0C14", el: "#0F1119", well: "#060710",
  br: "rgba(140,160,255,0.05)", brL: "rgba(140,160,255,0.08)", brH: "rgba(140,160,255,0.12)",
  tx: "rgba(255,255,255,0.92)", ts: "rgba(255,255,255,0.70)", tm: "rgba(255,255,255,0.50)",
  gn: "#00D4A1", gnD: "rgba(0,212,161,0.07)", gnB: "rgba(0,212,161,0.18)",
  rd: "#FF5068", rdD: "rgba(255,80,104,0.07)", rdB: "rgba(255,80,104,0.18)",
  axTx: "rgba(255,255,255,0.45)", grid: "rgba(140,160,255,0.04)",
  hv: "rgba(255,255,255,0.05)", hv2: "rgba(255,255,255,0.03)", trk: "rgba(255,255,255,0.18)", hvLn: "rgba(255,255,255,0.15)",
  inputScheme: "dark",
};

const NAV = [
  { id: "dashboard", href: "/dashboard/", label: "Dashboard", icon: "dash" },
  { id: "journal", href: "/dashboard/journal/", label: "Journal", icon: "journal" },
  { id: "backtest", href: "/dashboard/backtest/", label: "Backtest", icon: "backtest" },
  { id: "cot", href: "/dashboard/cot/", label: "COT", icon: "cot" },
  { id: "strategies", href: "/dashboard/strategies/", label: "Strategies", icon: "stratlab" },
  { id: "resources", href: "/bootcamp/", label: "Resources", icon: "resources" },
  { id: "support", href: "/dashboard/support/", label: "Support", icon: "support" },
];

function LabNavPanel({ pathname, hov, setHov }) {
  const icon = (kind) => {
    if (kind === "dash") return (
      <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="13" y="3" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="3" y="13" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/><rect x="13" y="13" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5"/></svg>
    );
    if (kind === "journal") return (
      <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="15" height="18" rx="1" stroke="currentColor" strokeWidth="1.5"/><line x1="7" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="7" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="7" y1="16" x2="11" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
    );
    if (kind === "backtest") return (
      <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><polyline points="3,20 3,4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><polyline points="3,15 8,11 12,14 18,7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/><polygon points="20,10 23,13 20,16" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
    );
    if (kind === "cot") return (
      <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><rect x="3" y="12" width="3" height="8" rx="0.5" stroke="currentColor" strokeWidth="1.4"/><rect x="8" y="8" width="3" height="12" rx="0.5" stroke="currentColor" strokeWidth="1.4"/><rect x="13" y="5" width="3" height="15" rx="0.5" stroke="currentColor" strokeWidth="1.4"/><rect x="18" y="9" width="3" height="11" rx="0.5" stroke="currentColor" strokeWidth="1.4"/><line x1="3" y1="3" x2="21" y2="3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeDasharray="2 2"/></svg>
    );
    if (kind === "stratlab") return (
      <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><rect x="3" y="2" width="14" height="20" rx="1" stroke="currentColor" strokeWidth="1.4"/><rect x="8" y="1" width="4" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.3"/><circle cx="7" cy="9" r="1.2" fill="currentColor" opacity="0.8"/><circle cx="13" cy="9" r="1.2" fill="currentColor" opacity="0.8"/><circle cx="10" cy="14" r="1.2" fill="currentColor" opacity="0.8"/><path d="M7 9c0 3 3 3 3 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M13 9c-1 2-1 3-3 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><line x1="8.5" y1="19" x2="11.5" y2="19" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
    );
    if (kind === "strat") return (
      <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><path d="M7 3.5h11.5c.8 0 1.5.7 1.5 1.5v11.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" opacity="0.45"/><path d="M5 5.5h11.5c.8 0 1.5.7 1.5 1.5v11.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" opacity="0.7"/><rect x="3" y="7.5" width="13.5" height="13" rx="1.2" stroke="currentColor" strokeWidth="1.45"/><circle cx="7" cy="11.2" r="1.25" fill="currentColor"/><circle cx="12.5" cy="11.2" r="1.25" fill="currentColor"/><circle cx="9.8" cy="16.6" r="1.25" fill="currentColor"/><path d="M7 11.2c0 2.8 2.8 2.7 2.8 5.4M12.5 11.2c-.7 2.2-.8 3.2-2.7 5.4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/></svg>
    );
    if (kind === "support") return (
      <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="12" cy="17" r="0.5" fill="currentColor" stroke="currentColor" strokeWidth="1"/></svg>
    );
    return (
      <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><rect x="2" y="16.5" width="20" height="3.5" rx="0.5" stroke="currentColor" strokeWidth="1.4"/><line x1="5.5" y1="16.5" x2="5.5" y2="20" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><rect x="3.5" y="12" width="17" height="3.5" rx="0.5" stroke="currentColor" strokeWidth="1.4"/><line x1="7" y1="12" x2="7" y2="15.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><rect x="5" y="7.5" width="14" height="3.5" rx="0.5" stroke="currentColor" strokeWidth="1.4"/><line x1="8.5" y1="7.5" x2="8.5" y2="11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
    );
  };
  return (
    <div style={{ width: 64, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", padding: "8px 0 6px", background: c.el, gap: 1, boxShadow: "4px 0 20px rgba(0,0,0,0.45)", zIndex: 1 }}>
      {NAV.map(({ id, href, label, icon: ic }) => {
        const active =
          pathname === href ||
          (id === "strategies" && pathname.startsWith("/dashboard/strategies"));
        const isHn = hov === "snav_" + id;
        const rail = active ? { position: "absolute", left: 0, top: "20%", bottom: "20%", width: 2, background: "linear-gradient(180deg,transparent," + c.acL + ",transparent)", boxShadow: "0 0 6px " + c.acG } : null;
        return (
          <Link key={id} href={href}
            onMouseEnter={() => setHov("snav_" + id)} onMouseLeave={() => setHov(null)}
            style={{ width: "100%", height: 56, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "default", position: "relative", textDecoration: "none", background: active ? c.acD : isHn ? "rgba(255,255,255,0.07)" : "transparent", transition: "background 0.12s", color: active ? c.acL : isHn ? c.tx : c.ts }}>
            {active && <div style={rail} />}
            {icon(ic)}
            <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: F }}>{label}</span>
          </Link>
        );
      })}
      <div style={{ flex: 1 }} />
      <Link href="/dashboard/profile/" onMouseEnter={() => setHov("snav_profile")} onMouseLeave={() => setHov(null)}
        style={{ width: "100%", height: 56, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "default", textDecoration: "none", background: hov === "snav_profile" ? "rgba(255,255,255,0.07)" : "transparent", transition: "background 0.12s", color: hov === "snav_profile" ? c.tx : c.ts }}>
        <svg width={21} height={21} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: F }}>Profile</span>
      </Link>
    </div>
  );
}

export default function StrategyLabV9BankApp({ registerDashboardOpenBuilder }) {
  const router = useRouter();
  const pathname = usePathname() || "";
  const [hov, setHov] = useState(null);

${sessionsBlock}

${stratStates}

  const stratOpenBuilderLatestRef = useRef(() => {});
  useEffect(() => {
    if (!registerDashboardOpenBuilder) return;
    const run = () => stratOpenBuilderLatestRef.current();
    registerDashboardOpenBuilder(run);
    return () => registerDashboardOpenBuilder(null);
  }, [registerDashboardOpenBuilder]);

  const navPanel = <LabNavPanel pathname={pathname} hov={hov} setHov={setHov} />;

`;

const footer = `
}
`;

const out = header + mid + body + footer;
fs.writeFileSync(outPath, out, "utf8");
console.log("Wrote", outPath, "bytes", Buffer.byteLength(out));

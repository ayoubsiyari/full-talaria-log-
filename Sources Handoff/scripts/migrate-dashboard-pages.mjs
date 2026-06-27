import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcPath = path.join(root, "newdashboard.jsx");
const dstPath = path.join(root, "TalariaV16.jsx");

const src = fs.readFileSync(srcPath, "utf8");
let dst = fs.readFileSync(dstPath, "utf8");
const srcLines = src.split("\n");
const dstLines = dst.split("\n");

const sliceLines = (lines, start, end) => lines.slice(start - 1, end).join("\n");

const renderFreshPerformanceSummary = sliceLines(srcLines, 21936, 27356);
const renderReturnsGrowthPage = sliceLines(srcLines, 29131, 33418);

const replaceBlock = (content, startNeedle, endNeedle, replacement) => {
  const start = content.indexOf(startNeedle);
  const end = content.indexOf(endNeedle, start + startNeedle.length);
  if (start < 0 || end < 0) throw new Error(`Block not found: ${startNeedle.slice(0, 40)}`);
  return content.slice(0, start) + replacement + content.slice(end);
};

// Import metrics helpers
if (!dst.includes('from "./metrics/index.js"')) {
  dst = dst.replace(
    'import { SCORE_CONFIG, DIM_KEYS, computeTalariaScore, computeTrend, buildInsightSignals } from "./scoreEngine.js";',
    'import { SCORE_CONFIG, DIM_KEYS, computeTalariaScore, computeTrend, buildInsightSignals } from "./scoreEngine.js";\nimport { clampReturnDistributionConfidence, computeCostTotals, computeEmpiricalReturnDistribution, computeMovingAverageRegime, computePeriodBreakdown, computeProfitConcentration, computeReturnsGrowthEquityCurve, computeReturnsGrowthMetricStrip, computeSnapshotMetricCore } from "./metrics/index.js";'
  );
}

// dashFreshPage init + returns-growth state
dst = replaceBlock(
  dst,
  '  const [dashFreshPage, setDashFreshPage] = useState(() => {',
  '  const [dashRadarCompare, setDashRadarCompare] = useState("prior");',
  `  const [dashFreshPage, setDashFreshPage] = useState(() => {
    try {
      const hashPage = window.location.hash.match(/#dashboard\\/fresh\\/([^/?#]+)/)?.[1];
      if (["overview", "returns-growth"].includes(hashPage)) return hashPage;
      const legacyMap = {
        "performance-summary":"overview",
        "equity-returns":"returns-growth",
        "drawdown":"returns-growth",
        "streaks-consistency-risk-adjusted-metrics":"returns-growth",
        "statistics":"returns-growth",
        "performance":"returns-growth",
      };
      const raw = hashPage || localStorage.getItem("talaria_dashboard_fresh_page") || "overview";
      const saved = legacyMap[raw] || raw;
      return ["overview", "returns-growth"].includes(saved) ? saved : "overview";
    } catch {
      return "overview";
    }
  });
  const [dashReturnsCurveMode, setDashReturnsCurveMode] = useState("balance");
  const [dashReturnsCurveAggregation, setDashReturnsCurveAggregation] = useState("daily");
  const [dashReturnsCurveMenuOpen, setDashReturnsCurveMenuOpen] = useState(null);
  const [dashReturnsCurveHover, setDashReturnsCurveHover] = useState(null);
  const [dashReturnsPeriodHover, setDashReturnsPeriodHover] = useState(null);
  const [dashReturnsCurveView, setDashReturnsCurveView] = useState({zoom:1, pan:0, dragging:false, dragX:0, dragPan:0});
  const [dashReturnsMaEnabled, setDashReturnsMaEnabled] = useState(false);
  const [dashReturnsMaPeriod, setDashReturnsMaPeriod] = useState(20);
  const [dashReturnsMaPeriodDraft, setDashReturnsMaPeriodDraft] = useState("");
  const [dashReturnsMetricStripExpanded, setDashReturnsMetricStripExpanded] = useState(false);
  const [dashReturnsPeriodGrain, setDashReturnsPeriodGrain] = useState("trades");
  const [dashReturnsPeriodBreakdownGrain, setDashReturnsPeriodBreakdownGrain] = useState("auto");
  const [dashReturnsRollingWindow, setDashReturnsRollingWindow] = useState(20);
  const [dashReturnsRollingAggregation, setDashReturnsRollingAggregation] = useState("trades");
  const [dashReturnsRollingWindowDraft, setDashReturnsRollingWindowDraft] = useState("20");
  const [dashReturnsDistributionAggregation, setDashReturnsDistributionAggregation] = useState("trades");
  const [dashReturnsCostAggregation, setDashReturnsCostAggregation] = useState("trades");
  const [dashReturnsCostHover, setDashReturnsCostHover] = useState(null);
  const [dashReturnsDistributionCi, setDashReturnsDistributionCi] = useState(95);
  const [dashReturnsDistributionCiDraft, setDashReturnsDistributionCiDraft] = useState("95");
  const [dashProfitConcentrationPct, setDashProfitConcentrationPct] = useState(10);
  const [dashProfitConcentrationPctDraft, setDashProfitConcentrationPctDraft] = useState("10");
  const [dashProfitConcentrationAggregation, setDashProfitConcentrationAggregation] = useState("trades");
  const dashReturnsCurveMenuRef = useRef(null);
  const dashReturnsMaInputRef = useRef(null);
  const dashReturnsMaEditingRef = useRef(false);
  const [dashRadarCompare, setDashRadarCompare] = useState("prior");`
);

// useEffect for returns curve menu
if (!dst.includes("closeDashboardReturnsCurveMenu")) {
  dst = dst.replace(
    `  useEffect(() => {
    if (!dashAccountPulseMenuOpen) return;`,
    `  useEffect(() => {
    if (!dashReturnsCurveMenuOpen) return;
    const closeDashboardReturnsCurveMenu = (e) => {
      const menu = dashReturnsCurveMenuRef.current;
      if (menu && menu.contains(e.target)) return;
      if (e.target?.closest?.(".tlr-dashboard-value-menu-wrap")) return;
      setDashReturnsCurveMenuOpen(null);
    };
    document.addEventListener("pointerdown", closeDashboardReturnsCurveMenu, true);
    return () => document.removeEventListener("pointerdown", closeDashboardReturnsCurveMenu, true);
  }, [dashReturnsCurveMenuOpen]);
  useEffect(() => {
    if (dashReturnsCurveMenuOpen !== "regime" || !dashReturnsMaEditingRef.current) return;
    const focusInput = () => {
      const activeInput = dashReturnsMaInputRef.current;
      if (!activeInput || dashReturnsCurveMenuOpen !== "regime") return;
      activeInput.focus();
      activeInput.select?.();
    };
    focusInput();
  }, [dashReturnsMaPeriodDraft, dashReturnsCurveMenuOpen]);
  useEffect(() => {
    if (!dashAccountPulseMenuOpen) return;`
  );
}

// dashboardNavGroups
dst = replaceBlock(
  dst,
  '          const dashboardNavGroups = [',
  '          const activeFreshPageMeta = dashboardNavGroups.flatMap(group=>group.pages).find(page=>page.id===dashFreshPage) || dashboardNavGroups[0].pages[0];',
  `          const dashboardNavGroups = [
            {label:dashTxt("Dashboard","لوحة التحكم"), pages:[
              {id:"overview",label:dashTxt("Snapshot","لمحة"), question:dashTxt("How am I doing right now?","كيف أدائي الآن؟"), enabled:true},
              {id:"returns-growth",label:dashTxt("Returns & Growth","العوائد والنمو"), question:dashTxt("Is the account growing — and what builds or drains it?","هل الحساب ينمو وما الذي يبنيه أو يستنزفه؟"), enabled:true},
            ]},
          ].map(group => ({...group, pages:group.pages.filter(page => page.enabled)})).filter(group => group.pages.length);
          const activeFreshPageMeta = dashboardNavGroups.flatMap(group=>group.pages).find(page=>page.id===dashFreshPage) || dashboardNavGroups[0].pages[0];`
);

// activeFreshPageId + isSnapshotDashboardContext
if (!dst.includes("isSnapshotDashboardContext")) {
  dst = dst.replace(
    '          const activeFreshPageId = activeFreshPageMeta.id;\n          const activeFreshPageLabel = activeFreshPageMeta.label || dashTxt("Snapshot","لمحة");',
    '          const activeFreshPageId = activeFreshPageMeta.id;\n          const activeFreshPageLabel = activeFreshPageMeta.label || dashTxt("Snapshot","لمحة");\n          const isSnapshotDashboardContext = sessView !== "trades" && activeFreshPageId === "overview";'
  );
}

// DashboardPageIcon returns-growth + style param
dst = dst.replace(
  '          const DashboardPageIcon = ({id, size=14, color="currentColor"}) => {',
  '          const DashboardPageIcon = ({id, size=14, color="currentColor", style=null}) => {'
);
if (!dst.includes('"returns-growth":')) {
  dst = dst.replace(
    '              overview:<><path d="M3 5V3h2M11 3h2v2M13 11v2h-2M5 13H3v-2" {...common} fill="none"/><path d="M8 4.9l2.2 3.1L8 11.1 5.8 8 8 4.9z" {...common} fill="none"/><circle cx="8" cy="8" r=".9" {...dot}/></>,',
    '              overview:<><path d="M3 5V3h2M11 3h2v2M13 11v2h-2M5 13H3v-2" {...common} fill="none"/><path d="M8 4.9l2.2 3.1L8 11.1 5.8 8 8 4.9z" {...common} fill="none"/><circle cx="8" cy="8" r=".9" {...dot}/></>,\n              "returns-growth":<><path d="M2.75 12.5h10.5" stroke={color} strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity=".46" fill="none"/><path d="M3.35 10.55 6.35 7.5 8.55 9.35 12.7 4.55" stroke={color} strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" fill="none"/><path d="M10.05 4.55h2.65v2.65" stroke={color} strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" fill="none"/></>,'
  );
  dst = dst.replace(
    '            return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{display:"block",flexShrink:0,color}}>{icon}</svg>;',
    '            return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" shapeRendering="geometricPrecision" style={{display:"block",flexShrink:0,color,overflow:"visible",...(style||{})}}>{icon}</svg>;'
  );
}

// selectFreshDashboardPage
dst = dst.replace(
  `            setDashFreshNavOpen(false);
            try {
              if (window.location.hash.includes("dashboard")) window.history.replaceState(null, "", \`#dashboard/fresh/\${page.id}\`);
            } catch {}
          };`,
  `            setDashFreshNavOpen(false);
            if (page.id !== "overview") {
              setDashSnapshotTopModeOpen(false);
              setDashUnitMenuOpen(false);
            }
            try {
              if (window.location.hash.includes("dashboard")) window.history.replaceState(null, "", \`#dashboard/fresh/\${page.id}\`);
            } catch {}
          };`
);

// Replace renderFreshPerformanceSummary
dst = replaceBlock(
  dst,
  '          const renderFreshPerformanceSummary = () => {',
  '          const renderFreshEquityReturns = () => {',
  `${renderFreshPerformanceSummary}\n          const renderFreshEquityReturns = () => {`
);

// Insert renderReturnsGrowthPage before renderFreshDashboardPage
if (!dst.includes("const renderReturnsGrowthPage")) {
  dst = dst.replace(
    '          const renderFreshDashboardPage = () => {',
    `${renderReturnsGrowthPage}\n\n          const renderFreshDashboardPage = () => {`
  );
}

// renderFreshDashboardPage route
if (!dst.includes('activeFreshPageId === "returns-growth"')) {
  dst = dst.replace(
    '            if (activeFreshPageId === "overview") return renderFreshPerformanceSummary();',
    '            if (activeFreshPageId === "overview") return renderFreshPerformanceSummary();\n            if (activeFreshPageId === "returns-growth") return renderReturnsGrowthPage();'
  );
}

// CSS for returns period controls
if (!dst.includes("tlr-return-period-control")) {
  const cssBlock = sliceLines(srcLines, 11754, 11757);
  dst = dst.replace(
    '      style.textContent += `.tlr-dashboard-score-row:hover',
    `      style.textContent += \`${cssBlock}\`;\n      style.textContent += \`.tlr-dashboard-score-row:hover`
  );
}

// Header snapshot context
dst = dst.replace(
  '{sessView !== "trades" && activeFreshPageId === "overview" && <SnapshotTopModeButton/>}',
  '{isSnapshotDashboardContext ? <SnapshotTopModeButton/> : null}'
);

fs.writeFileSync(dstPath, dst, "utf8");
console.log("Migration complete:", dstPath);

#!/usr/bin/env python3
"""Port snapshot dashboard metrics layout from dashbaord2.jsx into TalariaV16.jsx."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
D2 = ROOT / "Sources Handoff" / "dashbaord2.jsx"
V16 = ROOT / "Sources Handoff" / "TalariaV16.jsx"

d2 = D2.read_text(encoding="utf-8").splitlines()
v16 = V16.read_text(encoding="utf-8").splitlines()


def find_line(lines, needle, start=0):
    for i in range(start, len(lines)):
        if needle in lines[i]:
            return i
    raise ValueError(f"Marker not found: {needle!r}")


def slice_lines(lines, start_1based, end_1based_inclusive):
    return lines[start_1based - 1 : end_1based_inclusive]


# --- 1. Import buildInsightSignals ---
import_marker = 'import { SCORE_CONFIG, DIM_KEYS, computeTalariaScore, computeTrend } from "./scoreEngine.js";'
if 'buildInsightSignals' not in "\n".join(v16):
    idx = find_line(v16, import_marker)
    v16.insert(idx + 1, 'import { buildInsightSignals } from "./insightEngine.js";')

# --- 2. Calendar helpers + SnapshotPnlCalendar before BtMiniLine ---
bt_mini = find_line(v16, "const BtMiniLine = ({ points=[], c, color, height=34, fill=false, invert=false }) => {")
calendar_block = slice_lines(d2, 6358, 6713)
if "const SnapshotPnlCalendar" not in "\n".join(v16):
    v16[bt_mini:bt_mini] = calendar_block

# --- 3. State variables after dashFreshNavOpen ---
if "dashSnapshotTopMode" not in "\n".join(v16):
    nav_idx = find_line(v16, "const [dashFreshNavOpen, setDashFreshNavOpen] = useState(false);")
    state_block = [
        "  const [dashAccountPulsePeriod, setDashAccountPulsePeriod] = useState(\"ALL\");",
        "  const [dashAccountPulseMenuOpen, setDashAccountPulseMenuOpen] = useState(false);",
        "  const [dashAccountPulseHover, setDashAccountPulseHover] = useState(null);",
        "  const dashAccountPulseHoverFrameRef = useRef(null);",
        "  const dashAccountPulseHoverNextRef = useRef(null);",
        "  const [dashSnapshotTradePreview, setDashSnapshotTradePreview] = useState(null);",
        "  const dashSnapshotTradePreviewCardRef = useRef(null);",
        "  const [dashSnapshotTopMode, setDashSnapshotTopMode] = useState(\"basic\");",
        "  const [dashSnapshotTopModeOpen, setDashSnapshotTopModeOpen] = useState(false);",
        "  const dashAccountPulseMenuRef = useRef(null);",
        "  const [dashSnapshotCalendarMonth, setDashSnapshotCalendarMonth] = useState(null);",
    ]
    v16[nav_idx + 1 : nav_idx + 1] = state_block

# --- 4. Patch page menu close effect ---
if "dashSnapshotTopModeOpen) return" not in "\n".join(v16):
    eff_idx = find_line(v16, "    if (!dashFreshNavOpen) return;")
    # walk up to useEffect(
    while eff_idx > 0 and "useEffect(() => {" not in v16[eff_idx]:
        eff_idx -= 1
    v16[eff_idx + 1] = "    if (!dashFreshNavOpen && !dashSnapshotTopModeOpen) return;"
    close_idx = find_line(v16, "      if (e.target?.closest?.(\".tlr-dashboard-page-menu-wrap\")) return;", eff_idx)
    v16[close_idx] = '      if (e.target?.closest?.(".tlr-dashboard-page-menu-wrap,.tlr-dashboard-snapshot-mode-wrap")) return;'
    set_close = find_line(v16, "      setDashFreshNavOpen(false);", close_idx)
    if "setDashSnapshotTopModeOpen(false)" not in v16[set_close]:
        v16.insert(set_close + 1, "      setDashSnapshotTopModeOpen(false);")
    dep_idx = find_line(v16, "  }, [dashFreshNavOpen]);", eff_idx)
    v16[dep_idx] = "  }, [dashFreshNavOpen, dashSnapshotTopModeOpen]);"

# --- 5. Snapshot trade preview + pulse menu effects ---
if "closeSnapshotTradePreview" not in "\n".join(v16):
    dep_idx = find_line(v16, "  }, [dashFreshNavOpen, dashSnapshotTopModeOpen]);")
    effects = slice_lines(d2, 9593, 9613)
    v16[dep_idx + 1 : dep_idx + 1] = effects

# --- 6. CSS injections ---
css_needles = ["tlrSnapshotTopBasicIn", "tlr-snapshot-page,.tlr-snapshot-page"]
if not any(n in "\n".join(v16) for n in css_needles):
    css_idx = find_line(v16, ".tlr-dashboard-score-row:hover{background:rgba(255,255,255,0.045)!important}")
    css_blocks = slice_lines(d2, 10605, 10605) + slice_lines(d2, 10634, 10634) + slice_lines(d2, 10643, 10645)
    for offset, block in enumerate(css_blocks):
        v16.insert(css_idx + 1 + offset, block)

# --- 7. Snapshot top mode UI before DashboardPagesButton ---
if "SnapshotTopModeButton" not in "\n".join(v16):
    dash_btn = find_line(v16, "const DashboardPagesButton = () => (")
    header_block = slice_lines(d2, 20387, 20466)
    v16[dash_btn:dash_btn] = header_block
    # Close snapshot mode when opening pages menu
    ptr = find_line(v16, "e.preventDefault();setDashFreshNavOpen(v=>!v);setDashFiltersOpen(false);", dash_btn)
    if "setDashSnapshotTopModeOpen" not in v16[ptr]:
        v16[ptr] = v16[ptr].replace(
            "setDashFreshNavOpen(v=>!v);setDashFiltersOpen(false);",
            "setDashFreshNavOpen(v=>!v);setDashSnapshotTopModeOpen(false);setDashFiltersOpen(false);",
        )
    key = find_line(v16, "libraryKeyActivate(()=>{setDashFreshNavOpen(v=>!v);setDashFiltersOpen(false);", dash_btn)
    if "setDashSnapshotTopModeOpen" not in v16[key]:
        v16[key] = v16[key].replace(
            "setDashFreshNavOpen(v=>!v);setDashFiltersOpen(false);",
            "setDashFreshNavOpen(v=>!v);setDashSnapshotTopModeOpen(false);setDashFiltersOpen(false);",
        )

# --- 8. SnapshotTopModeButton in toolbar ---
if "<SnapshotTopModeButton/>" not in "\n".join(v16):
    toolbar = find_line(v16, "{sessView !== \"trades\" && <DashboardPagesButton/>}")
    v16[toolbar] = '                  {sessView !== "trades" && activeFreshPageId === "overview" && <SnapshotTopModeButton/>}\n                  {sessView !== "trades" && <DashboardPagesButton/>}'

# --- 9. dashboardSnapshotPulseCalendarHeight ---
if "dashboardSnapshotPulseCalendarHeight" not in "\n".join(v16):
    score_h = find_line(v16, "const dashboardScoreCardHeight = dashboardKpiCardHeight * 2 + dashboardKpiCardGap;")
    v16.insert(score_h + 1, "            const dashboardSnapshotPulseCalendarHeight = dashboardScoreCardHeight;")

# --- 10. formatInsightMetricValue + dashProfitFactorSub in metrics scope ---
if "formatInsightMetricValue" not in "\n".join(v16):
    anchor = find_line(v16, "const netPnlUseR = dashOverviewUnitMode === \"r\";")
    helpers = slice_lines(d2, 23442, 23463)
    v16[anchor:anchor] = helpers

# --- 11. Replace snapshot performance summary tail ---
prop_start = find_line(v16, "            const PropChallengeProgressSection = () => {")
render_end = find_line(v16, "          const renderFreshEquityReturns = () => {")
snapshot_block = slice_lines(d2, 24573, 27253)
v16[prop_start:render_end] = snapshot_block

V16.write_text("\n".join(v16) + "\n", encoding="utf-8")
print(f"Migrated snapshot dashboard: replaced {render_end - prop_start} lines with {len(snapshot_block)} lines from dashbaord2.jsx")

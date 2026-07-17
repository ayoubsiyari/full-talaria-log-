"""Seed PLAN2-SCOREBOARD.csv (D-028): one row per unit of work, one status each.

Sources: RESOLUTION-TRACKER.csv (engineering rows) + the 16-07 ticket export
(tester tickets). Lane 4 takes ownership of this file after seeding.
"""
import csv

OUT = "docs/tickets-overhaul/PLAN2-SCOREBOARD.csv"
TRACKER = "docs/tickets-overhaul/RESOLUTION-TRACKER.csv"
TICKETS = "tickets/support-export-full-16-07-26/messages.csv"

# --- engineering-status -> scoreboard-status ---
ENG_MAP = {
    "RESOLVED": "STAGED",
    "RESOLVED-DEV": "STAGED",
    "RESOLVED-NEEDS-LIVE": "STAGED",
    "RESOLVED-NEEDS-PO-AB": "STAGED",
    "GREEN-SYNTHETIC": "IN-TRACK",   # weak proof, not staged-quality
    "IN-PROGRESS": "IN-TRACK",
    "NEEDS-REFIX": "IN-TRACK",
    "FLAKE-TRACKED": "IN-TRACK",
    "OPEN-TRACKED": "IN-TRACK",
    "OPEN-BACKLOG": "IN-TRACK",
    "NEEDS-PO-CONFIRM": "BLOCKED-ON-DECISION",
    "DEFERRED": "IN-TRACK",
    "BLOCKED": "IN-TRACK",
    "FROZEN": "IN-TRACK",
}

# Engineering rows already PO-confirmed live on staging: per D-012, PO
# live-confirm is the interim acceptance authority during the freeze.
ENG_PO_CONFIRMED = {"TAL-01590", "H-S80"}

# --- ticket dispositions (from DAILY-INTAKE ledger) ---
CLOSED_VERIFIED = {"TAL-01588", "TAL-01596", "TAL-01590"}  # PO-fixed / tester-closed / PO-staging-confirmed (D-012)
STAGED = {
    "TAL-01581", "TAL-01582", "TAL-01585", "TAL-01590", "TAL-01600",
    "TAL-01602", "TAL-01609", "TAL-01610", "TAL-01611", "TAL-01612",
    "TAL-01616", "TAL-01626", "TAL-01629", "TAL-01631", "TAL-01638",
    "TAL-01647", "TAL-01650", "TAL-01653",
}
BLOCKED_ON_DECISION = {"TAL-01660"}  # multi-TP feature scope, PO to rule
OUT_OF_SCOPE = {"TAL-01637"}         # journal shell, forwarded

# ticket -> owning track/family (from DAILY-INTAKE dispositions)
TRACK = {
    "TAL-01560": "T8", "TAL-01561": "perf-backlog", "TAL-01562": "T8",
    "TAL-01563": "T8", "TAL-01564": "Lane2-hygiene", "TAL-01565": "A1-axis",
    "TAL-01566": "A1-axis", "TAL-01567": "RC-2-render", "TAL-01568": "T1",
    "TAL-01569": "T1", "TAL-01570": "T1", "TAL-01571": "T3-row13",
    "TAL-01572": "A1-axis", "TAL-01573": "T8", "TAL-01574": "T3-row14",
    "TAL-01575": "T8", "TAL-01576": "UI-polish(L5)", "TAL-01577": "T8",
    "TAL-01578": "T8", "TAL-01579": "T8/H-S73", "TAL-01580": "UI-polish(L5)",
    "TAL-01581": "A3", "TAL-01582": "A3", "TAL-01583": "A1-axis",
    "TAL-01584": "T1", "TAL-01585": "T5", "TAL-01586": "T3-row15",
    "TAL-01587": "T3-row11", "TAL-01588": "closed-by-PO",
    "TAL-01589": "T1/T2", "TAL-01590": "D-015", "TAL-01591": "T3-row16",
    "TAL-01592": "T3-row14", "TAL-01593": "A8(L5)", "TAL-01594": "T1/T2",
    "TAL-01595": "T8", "TAL-01596": "closed-by-tester", "TAL-01597": "T8-diag",
    "TAL-01598": "perf-backlog", "TAL-01599": "needs-repro", "TAL-01600": "D-015/016",
    "TAL-01601": "A6-4", "TAL-01602": "A6-1", "TAL-01603": "T8-diag",
    "TAL-01604": "A1-axis", "TAL-01605": "T8/T3", "TAL-01606": "T1/T2",
    "TAL-01607": "UI-polish(L5)", "TAL-01608": "perf-backlog",
    "TAL-01609": "D-015", "TAL-01610": "D-015", "TAL-01611": "D-009",
    "TAL-01612": "D-009", "TAL-01613": "A1-axis", "TAL-01614": "T4",
    "TAL-01615": "A6-3", "TAL-01616": "A6-2", "TAL-01617": "T4/A6",
    "TAL-01618": "A1-axis", "TAL-01619": "A1-axis", "TAL-01620": "A7",
    "TAL-01621": "T6", "TAL-01622": "T2/T6", "TAL-01623": "UI-polish(L5)",
    "TAL-01624": "T2-zoom(L5)", "TAL-01625": "A1-axis", "TAL-01626": "T8-persist",
    "TAL-01627": "UI-polish(L5)", "TAL-01628": "needs-repro", "TAL-01629": "T8",
    "TAL-01630": "T3-row11", "TAL-01631": "T8", "TAL-01632": "A7",
    "TAL-01633": "T8/perf", "TAL-01634": "T1-tool-math", "TAL-01635": "A7",
    "TAL-01636": "T6-correctness", "TAL-01637": "out-of-scope",
    "TAL-01638": "T4-reclassify", "TAL-01639": "A1-axis", "TAL-01640": "A7",
    "TAL-01641": "A1-axis", "TAL-01642": "T8-diag", "TAL-01643": "T2/RC-2",
    "TAL-01644": "T3-row14", "TAL-01645": "A7", "TAL-01646": "T6-phase6",
    "TAL-01647": "D-009", "TAL-01648": "T3-replay-ui", "TAL-01649": "T6-menu",
    "TAL-01650": "D-015/016", "TAL-01651": "A8(L5)", "TAL-01652": "T1-locked(L5)",
    "TAL-01653": "A6-1", "TAL-01654": "A8(L5)", "TAL-01655": "A8(L5)",
    "TAL-01656": "UI-polish(L5)", "TAL-01657": "UI-polish(L5)",
    "TAL-01658": "T4-multientry", "TAL-01659": "A7", "TAL-01660": "PO-decision",
    "TAL-01661": "A7b(L5)", "TAL-01662": "A7b(L5)", "TAL-01663": "T4/T8-diag",
    "TAL-01664": "A7b(L5)", "TAL-01665": "A7b(L5)", "TAL-01666": "A7b(L5)",
    "TAL-01667": "A7b(L5)", "TAL-01668": "UI-polish(L5)", "TAL-01669": "T4/A6",
}

rows = []

with open(TRACKER, encoding="utf-8") as f:
    for r in csv.DictReader(f):
        if not r["id"]:
            continue
        status = ENG_MAP.get(r["status"].strip(), "IN-TRACK")
        if r["id"] in ENG_PO_CONFIRMED:
            status = "CLOSED-VERIFIED"
        rows.append({
            "unit": r["id"], "origin": "engineering", "track": r["area"],
            "title": r["item"], "status": status,
            "note": r["status"] + (" | " + r["notes"] if r["notes"] else ""),
        })

seen = set()
with open(TICKETS, encoding="utf-8") as f:
    for r in csv.DictReader(f):
        ref = r["ticket_ref"]
        if ref in seen:
            continue
        seen.add(ref)
        if ref in CLOSED_VERIFIED:
            status = "CLOSED-VERIFIED"
        elif ref in STAGED:
            status = "STAGED"
        elif ref in BLOCKED_ON_DECISION:
            status = "BLOCKED-ON-DECISION"
        elif ref in OUT_OF_SCOPE:
            status = "OUT-OF-SCOPE"
        else:
            status = "IN-TRACK"
        rows.append({
            "unit": ref, "origin": "ticket", "track": TRACK.get(ref, "UNASSIGNED"),
            "title": r["subject"][:80], "status": status, "note": "",
        })

unassigned = [r["unit"] for r in rows if r["track"] == "UNASSIGNED"]
if unassigned:
    print("WARNING - unassigned rows (violates D-028 invariant):", unassigned)

with open(OUT, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=["unit", "origin", "track", "title", "status", "note"])
    w.writeheader()
    w.writerows(rows)

total = [r for r in rows if r["status"] != "OUT-OF-SCOPE"]
closed = [r for r in total if r["status"] == "CLOSED-VERIFIED"]
staged = [r for r in total if r["status"] == "STAGED"]
pct = 100 * len(closed) / len(total)
pct_ship = 100 * (len(closed) + len(staged)) / len(total)
print(f"rows={len(rows)} in-denominator={len(total)} closed={len(closed)} staged={len(staged)}")
print(f"PROGRESS: {pct:.0f}% verified now -> {pct_ship:.0f}% on combined-build ship")

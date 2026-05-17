#!/usr/bin/env python3
"""Patch admin-dashboard.html: tabbed Dataset Management hub."""
from pathlib import Path

P = Path(__file__).resolve().parents[1] / "chart v 1.4" / "chart" / "admin-dashboard.html"
D = "@@D@@"


def td(s: str) -> str:
    return s.replace(D, "div")


def main() -> None:
    text = P.read_text(encoding="utf-8")

    old_start = td(
        "      <!-- ════════ DATASETS SECTION ════════ -->\n"
        f'      <{D} class="section" id="sec-datasets">\n'
        "        <!-- FirstRate Data — primary vendor; Dukascopy card below for quick M1 samples -->\n"
        f'        <{D} class="card" style="margin-bottom:16px">'
    )

    hub = td(
        "      <!-- ════════ DATASETS SECTION (unified hub) ════════ -->\n"
        f'      <{D} class="section" id="sec-datasets">\n'
        f'        <{D} class="ds-hub">\n'
        f'          <{D} class="ds-hub-head">\n'
        f"            <{D}>\n"
        "              <h2>Market data pipeline</h2>\n"
        "              <p>Import from FirstRate, monitor sync health, browse the registry, and manage datasets for backtest sessions — one page, six tabs.</p>\n"
        f"            </{D}>\n"
        f"          </{D}>\n"
        f'          <{D} class="stat-cards ds-hub-stats" id="dsHubSummary">\n'
        f'            <{D} class="stat-card accent"><{D} class="label">Datasets</{D}><{D} class="value">—</{D}></{D}>\n'
        f'            <{D} class="stat-card warn"><{D} class="label">Disk (all)</{D}><{D} class="value" style="font-size:18px">—</{D}></{D}>\n'
        f'            <{D} class="stat-card ok"><{D} class="label">Healthy</{D}><{D} class="value">—</{D}></{D}>\n'
        f'            <{D} class="stat-card danger"><{D} class="label">Needs attention</{D}><{D} class="value">—</{D}></{D}>\n'
        f"          </{D}>\n"
        f'          <{D} class="ds-hub-tabs" role="tablist" aria-label="Dataset sections">\n'
        "            <button type=\"button\" class=\"ds-hub-tab active\" data-ds-tab=\"overview\" onclick=\"setDsHubTab('overview')\">Overview</button>\n"
        "            <button type=\"button\" class=\"ds-hub-tab\" data-ds-tab=\"registry\" onclick=\"setDsHubTab('registry')\">Registry</button>\n"
        "            <button type=\"button\" class=\"ds-hub-tab\" data-ds-tab=\"library\" onclick=\"setDsHubTab('library')\">Library</button>\n"
        "            <button type=\"button\" class=\"ds-hub-tab\" data-ds-tab=\"import\" onclick=\"setDsHubTab('import')\">Import</button>\n"
        "            <button type=\"button\" class=\"ds-hub-tab\" data-ds-tab=\"sync\" onclick=\"setDsHubTab('sync')\">Sync health</button>\n"
        "            <button type=\"button\" class=\"ds-hub-tab\" data-ds-tab=\"maintenance\" onclick=\"setDsHubTab('maintenance')\">Maintenance</button>\n"
        f"          </{D}>\n"
        f"        </{D}>\n"
        "\n"
        f'        <{D} id="dsTabPanel-import" class="ds-tab-panel">\n'
        f'        <{D} class="ds-import-grid ds-import-split">\n'
        f'        <{D} class="card">\n'
    )

    if old_start not in text:
        raise SystemExit("old_start not found")
    text = text.replace(old_start, hub, 1)

    text = text.replace(
        '              <button type="button" class="btn sm primary" id="dkFetchBtn" onclick="fetchDukascopy()">Fetch &amp; save dataset</button>\n'
        "            </div>\n"
        "          </motion>\n"
        "        </motion>\n"
        "\n"
        "        <!-- Daily Sync Overview",
        '              <button type="button" class="btn sm primary" id="dkFetchBtn" onclick="fetchDukascopy()">Fetch &amp; save dataset</button>\n'
        "            </div>\n"
        "          </div>\n"
        "        </div>\n"
        "        </motion>\n"
        "        </motion>\n"
        "\n"
        f'        <{D} id="dsTabPanel-overview" class="ds-tab-panel active">\n'
        "        <!-- Daily Sync Overview",
    )
    text = text.replace("motion", "div")  # fix any stray from replace above

    text = text.replace(
        '            <motion id="frLiveDetail"',
        '            <div id="frLiveDetail"',
    )

    needle_live = (
        '            <div id="frLiveDetail" style="font-size:11px;font-family:ui-monospace,monospace;'
        "color:var(--text-muted);line-height:1.5;white-space:pre-wrap;max-height:140px;overflow-y:auto\"></motion>\n"
        "          </motion>\n"
        "        </motion>\n"
        "\n"
        "        <!-- Nightly sync health"
    )
    needle_live = td(needle_live.replace("</motion>", f"</{D}>").replace("motion", D))
    repl_live = td(
        '            <motion id="frLiveDetail" style="font-size:11px;font-family:ui-monospace,monospace;'
        "color:var(--text-muted);line-height:1.5;white-space:pre-wrap;max-height:140px;overflow-y:auto\"></motion>\n"
        "          </motion>\n"
        "        </motion>\n"
        "        </motion>\n"
        "\n"
        f'        <{D} id="dsTabPanel-sync" class="ds-tab-panel">\n'
        "        <!-- Nightly sync health"
    )
    repl_live = td(repl_live.replace("motion", D))
    if needle_live not in text:
        raise SystemExit("live end needle not found")
    text = text.replace(needle_live, repl_live, 1)

    idx = text.find("        <!-- FirstRate duplicate-dataset cleanup")
    if idx < 0:
        raise SystemExit("dupes not found")
    text = text[:idx] + td(f"        </{D}>\n\n        <{D} id=\"dsTabPanel-maintenance\" class=\"ds-tab-panel\">\n        ") + text[idx:]

    idx2 = text.find("        <!-- Dataset List + Settings -->")
    if idx2 < 0:
        raise SystemExit("library not found")
    text = text[:idx2] + td(f"        </{D}>\n\n        <{D} id=\"dsTabPanel-library\" class=\"ds-tab-panel\">\n        ") + text[idx2:]

    reg_start = "      <!-- ════════ DATASET REGISTRY (ALL / HEALTH / SIZING) ════════ -->\n"
    reg_i = text.find(reg_start)
    if reg_i < 0:
        raise SystemExit("registry section not found")
    reg_end = text.find("      <!-- ════════ ANALYTICS", reg_i)
    reg_block = text[reg_i:reg_end]
    text = text[:reg_i] + text[reg_end:]
    lib_i = text.find(f'        <{D} id="dsTabPanel-library"')
    text = (
        text[:lib_i]
        + td(f'        <{D} id="dsTabPanel-registry" class="ds-tab-panel">\n')
        + reg_block
        + td(f"        </{D}>\n\n        ")
        + text[lib_i:]
    )

    text = text.replace(
        '      <a class="nav-item" data-section="dataset-registry" onclick="navigate(\'dataset-registry\')">\n'
        '        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>\n'
        "        Dataset registry\n"
        "      </a>\n",
        "",
    )

    text = text.replace('id="datasetRegistrySummary"', 'id="datasetRegistrySummary" style="display:none"', 1)

    if "function setDsHubTab" not in text:
        js = """
let _dsHubTab = 'overview';

function setDsHubTab(tab) {
  _dsHubTab = tab || 'overview';
  document.querySelectorAll('.ds-tab-panel').forEach(function (p) {
    p.classList.toggle('active', p.id === 'dsTabPanel-' + _dsHubTab);
  });
  document.querySelectorAll('.ds-hub-tab').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-ds-tab') === _dsHubTab);
  });
  if (tab === 'registry') loadDatasetRegistry();
  if (tab === 'library' && (!allDatasets || !allDatasets.length)) loadDatasets();
}

function parseDsHubTabFromHash() {
  var h = (window.location.hash || '').replace(/^#/, '');
  if (h === 'dataset-registry') return 'registry';
  if (h.indexOf('datasets:') === 0) return h.split(':')[1] || 'registry';
  return null;
}

"""
        text = text.replace("function navigate(section) {", js + "function navigate(section) {")

    if "window._dsHubPendingTab" not in text:
        text = text.replace(
            "function navigate(section) {\n  stopInsightsSystemPoll();",
            "function navigate(section) {\n  if (section === 'dataset-registry') {\n    section = 'datasets';\n    window._dsHubPendingTab = 'registry';\n  }\n  stopInsightsSystemPoll();",
            1,
        )

    text = text.replace("  if (section === 'dataset-registry') loadDatasetRegistry();\n", "")

    if "section === 'datasets')" not in text or "setDsHubTab(tab)" not in text.split("section === 'datasets'")[1][:200]:
        text = text.replace(
            "  if (section === 'insights') loadInsightsAnalyticsPage();",
            "  if (section === 'datasets') {\n    var tab = window._dsHubPendingTab || parseDsHubTabFromHash() || 'overview';\n    window._dsHubPendingTab = null;\n    setDsHubTab(tab);\n    loadDatasetRegistry().catch(function () {});\n  }\n  if (section === 'insights') loadInsightsAnalyticsPage();",
        )

    text = text.replace(
        "    if (sumEl) {\n      sumEl.innerHTML =",
        "  var _regSummaryHtml =",
        1,
    )
    # append hub fill after sumEl block - find closing of sumEl innerHTML assignment
    text = text.replace(
        "        '<div class=\"stat-card danger\"><motion class=\"stat-icon\">",
        "        '<div class=\"stat-card danger\"><div class=\"stat-icon\">",
    )

    # Fix loadDatasetRegistry to also set dsHubSummary
    old_sum = """    if (sumEl) {
      sumEl.innerHTML ="""
    if old_sum not in text and "_regSummaryHtml =" in text:
        text = text.replace(
            """        '<div class="stat-card danger"><motion class="stat-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></motion></div>' +
        '<div class="label">Needs attention</div><div class="value">' + fmtN(s.needs_attention_count || 0) + '</div></div>';
    }""",
            """        '<motion class="stat-card danger"><motion class="stat-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></motion></motion>' +
        '<motion class="label">Needs attention</motion><motion class="value">' + fmtN(s.needs_attention_count || 0) + '</motion></motion>';
    }
    var hubSum = $('dsHubSummary');
    if (hubSum && typeof _regSummaryHtml === 'string') hubSum.innerHTML = _regSummaryHtml;""",
        )
        text = text.replace("<motion", "<div").replace("</motion>", "</motion>")
        while "<motion" in text:
            text = text.replace("<motion", "<div")

    text = text.replace(
        'onclick="navigate(\'dataset-registry\')"',
        "onclick=\"navigate('datasets'); setDsHubTab('registry')\"",
    )
    text = text.replace(
        "<div class=\"card-title\">Download dataset (FirstRate Data)</div>",
        "<div class=\"card-title\">FirstRate import</div>",
    )
    text = text.replace("  datasets: 'Dataset Management',\n  'dataset-registry':", "  datasets: 'Dataset Management',\n  'dataset-registry':")
    text = text.replace(
        "  'dataset-registry': 'Dataset registry & health',\n",
        "",
    )

    # close sec-datasets - ensure library panel closed
    if text.count("dsTabPanel-library") == 1:
        pass

    P.write_text(text, encoding="utf-8")
    print("OK", P)


if __name__ == "__main__":
    main()

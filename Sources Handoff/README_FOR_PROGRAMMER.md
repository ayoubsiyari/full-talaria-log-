# Talaria Handoff Package

This folder contains the implementation handoff package for the Talaria dashboard/source/filter/add-trade/trades-ledger work.

## Start Here

1. `Talaria_Implementation_And_QA_Handoff.docx`
   - Main implementation plan, logic contract, UI behavior contract, and QA plan.

2. `Talaria_Implementation_And_QA_Handoff.pdf`
   - PDF copy of the same handoff for easy reading and review.

3. `Talaria_Implementation_QA_Tracker.xlsx`
   - Phase-by-phase QA tracker with implementation checks, logic checks, UI checks, and release gates.

## Prototype Reference

Folder: `prototype_reference`

This is a lightweight snapshot of the current prototype files needed to inspect the design and behavior:

- `package.json`
- `package-lock.json`
- `vite.config.js`
- `index.html`
- `src/main.jsx`
- `src/TalariaV8b.jsx`

Important: treat `TalariaV8b.jsx` as a prototype reference, not production architecture. The production implementation should split the logic into source, filter, trade math, validation, add/edit trade, and reusable UI modules.

## Reference Documents

Folder: `reference_documents`

Additional design, dashboard, data, and charting references that may help during implementation:

- `DASHBOARD_CONTENT_GUIDE.md`
- `DASHBOARD_KPI_DATA_GAP_NOTES.md`
- `codex_prompt_compact_card.md`
- `Dashboard_Design_Spec.docx`
- `NQ_Momentum_Q1_2024_dashboard.json`
- `Talaria_Dashboard_3Phase_Prioritization.pdf`
- `Talaria_Dashboard_Chart_Catalog.pdf`
- `talaria_historical_data_architecture.md`

Folder: `reference_documents/Dashboard design`

Original dashboard design phase documents:

- `TALARIA_DASHBOARD_BUILD_PROMPT.md`
- `TALARIA_PHASE_1_MVP.md`
- `TALARIA_PHASE_2_ANALYTICS.md`
- `TALARIA_PHASE_3_PROPFIRM_EXPORT.md`
- `Talaria_Dashboard_Components.pdf`
- `Talaria_Phase_Checklist.xlsx`

## Not Included

Temporary clipboard screenshots from `AppData/Local/Temp` were not copied because those files are unstable and may disappear. If screenshots are needed, export stable screenshots from the running prototype into a permanent folder and add them to this package.

# Dashboard KPI Data-Gap Notes

## Close-Time Rule Outcome

The Discipline KPI now ships with an objective `disciplineScore` that does not depend on journaling. It detects stop-widening, manual trail override, and risk overshoot from trade fields.

For subjective Rule Adherence, add one explicit close-time field when the backend is ready:

```js
postTradeNotes: {
  reason: "Short note from the close modal",
  rule_outcome: "followed" // or "deviated"
}
```

Until `rule_outcome` exists, unjournaled trades are excluded from Rule Adherence, not counted as violations. Journaled trades with a deviation reason or `rulesViolated[]` are treated as deviated.

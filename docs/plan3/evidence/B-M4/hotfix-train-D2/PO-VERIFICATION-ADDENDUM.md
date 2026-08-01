# Addendum to B-5 `PO-VERIFICATION.md` — read alongside, not instead

`PO-VERIFICATION.md` is sealed and unchanged. Two corrections belong with it, from
rulings issued after it was sealed. **The six steps and the STOP condition stand
exactly as written.**

## 1. Step 1 — where the build id comes from

Step 1 says to compare the console build id against "the build id recorded in
`MANIFEST.json`". **`MANIFEST.json` contains no build id**, because `record-build`
correctly refused to invent one before a build existed.

**The expected value is `20260728b81`**, assuming the train is built as recommended
in `CACHE-STAMP-RECONCILIATION.md` §3. If it is built with a different
`CHART_BUILD_ID`, that value is the expected one instead — take it from the build
command, not from this file.

The commit SHA anchor for the train is
`b6d94c767892c7134cd1e4b45c9f85a18e5bbb95`.

## 2. Step 1 has a precondition that is not the PO's to run

Per the DEPLOY-01 edge clause, "the served file" means **bytes returned by the
running deployment through its edge.** Before the PO is asked to run this check at
all, someone with edge access must confirm:

```bash
curl -s "https://<production-host>/chart/modules/order-manager.js?v=20260728b81" \
  | grep -c journalVouchedFor      # must be 2
```

**If that returns 0, do not hand this check to the PO.** The console may report the
new build id while Cloudflare still serves the old module, and in that state Step 1
passes and Step 5 destroys the throwaway journal without the guard engaging. Step 3
keeps the damage contained to `HOTFIX-CHECK`, which is why the check is still safe
to run — but the result would be a false negative reported as a real one.

Also worth checking, per `CACHE-STAMP-RECONCILIATION.md` §5, is the **old** URL
`?v=20260724b61`, which `chart-embed.html` requests by name when an embed is opened
without a `?v=` parameter.

## 3. Unchanged

The STOP condition, the throwaway-session discipline in Step 3, the rollback
vocabulary, and the "what this check does not prove" section are unaffected by
either ruling and stand as sealed.

#!/usr/bin/env python3
"""Print CME root symbols from the My Funded Futures instrument list article."""
import json
import re
import urllib.request

URL = "https://help.myfundedfutures.com/en/articles/9735811-futures-instrument-list"
req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
html = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")
cells = re.findall(r"<td[^>]*>(.*?)</td>", html, re.S | re.I)
rows = []
for cell in cells:
    text = re.sub(r"<[^>]+>", "", cell).replace("&amp;", "&")
    text = re.sub(r"\s+", " ", text).strip()
    if text:
        rows.append(text)

code_re = re.compile(r"^[A-Z0-9][A-Z0-9]{0,4}$")
skip = {
    "Instrument Name", "Code", "Trading Hours", "Tick Size",
    "Tick Value", "Total Cost Round Trip",
}
symbols = []
for i, row in enumerate(rows):
    if not code_re.match(row) or row in skip or row.startswith("0."):
        continue
    prev = rows[i - 1] if i else ""
    if "Sunday" in prev or "Monday" in prev or prev in skip:
        continue
    symbols.append(row)

ordered = []
seen = set()
for sym in symbols:
    if sym not in seen:
        seen.add(sym)
        ordered.append(sym)

print(",".join(sorted(ordered, key=lambda s: (len(s), s))))
print(f"# count={len(ordered)}", file=__import__("sys").stderr)

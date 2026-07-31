"""Assert the window gate is actually reachable at both call sites.

Written because it was not. Moving the websocket call off the event loop, I indented it one level
too far and it landed inside `if user is None:` after that branch's `return` — valid Python, clean
`ast.parse`, and the window gate silently removed from every websocket connection. A syntax check
cannot see that, and neither could a marker: the string was present in the file.

So this checks the two properties that actually matter:
  1. both call sites await the off-loop wrapper
  2. neither call site is dead code (no unconditional return/raise before it in the same block)
  3. the blocking form is not left behind at a call site
"""
import ast
import sys

PATH = sys.argv[1] if len(sys.argv) > 1 else "api_server.py"
SRC = open(PATH, encoding="utf-8").read()
tree = ast.parse(SRC)

ASYNC_NAME = "_require_active_chart_window_async"
SYNC_NAME = "_require_active_chart_window"

failures = []
found = []


def statements_before_in_block(block, node):
    """Return the statements preceding `node` in its own block, if `node` is a direct child."""
    for i, st in enumerate(block):
        if st is node:
            return block[:i]
    return None


class Visitor(ast.NodeVisitor):
    def __init__(self):
        self.stack = []

    def generic_visit(self, node):
        for field, value in ast.iter_fields(node):
            if isinstance(value, list) and value and isinstance(value[0], ast.stmt):
                for st in value:
                    self._check_block(value, st)
        super().generic_visit(node)

    def _check_block(self, block, st):
        for sub in ast.walk(st):
            if isinstance(sub, ast.Call) and isinstance(sub.func, ast.Name):
                if sub.func.id in (ASYNC_NAME, SYNC_NAME):
                    # only consider the statement that directly contains the call
                    if sub.func.id == ASYNC_NAME or _is_direct_call_stmt(st, sub):
                        preceding = statements_before_in_block(block, st)
                        if preceding is None:
                            continue
                        dead = any(isinstance(p, (ast.Return, ast.Raise)) for p in preceding)
                        found.append({
                            "name": sub.func.id,
                            "line": sub.lineno,
                            "awaited": _is_awaited(st, sub),
                            "dead": dead,
                        })


def _is_direct_call_stmt(st, call):
    return isinstance(st, ast.Expr) and st.value is call


def _is_awaited(st, call):
    for sub in ast.walk(st):
        if isinstance(sub, ast.Await) and sub.value is call:
            return True
    return False


Visitor().visit(tree)

# The definition itself calls the sync form; that is intended (kill-switch + threadpool target).
defn_lines = set()
for node in ast.walk(tree):
    if isinstance(node, ast.AsyncFunctionDef) and node.name == ASYNC_NAME:
        defn_lines = set(range(node.lineno, (node.end_lineno or node.lineno) + 1))

def dedupe(items):
    """One entry per source line; the walk visits nested blocks and re-reports the same call."""
    by_line = {}
    for it in items:
        cur = by_line.get(it["line"])
        # keep the strictest reading of each line
        if cur is None:
            by_line[it["line"]] = it
        else:
            cur["awaited"] = cur["awaited"] and it["awaited"]
            cur["dead"] = cur["dead"] or it["dead"]
    return [by_line[k] for k in sorted(by_line)]


call_sites = dedupe([f for f in found if f["name"] == ASYNC_NAME and f["line"] not in defn_lines])
leftover_sync = dedupe([f for f in found if f["name"] == SYNC_NAME and f["line"] not in defn_lines])

print(f"off-loop call sites found : {len(call_sites)}")
for f in call_sites:
    print(f"  line {f['line']}  awaited={f['awaited']}  dead_code={f['dead']}")
    if not f["awaited"]:
        failures.append(f"line {f['line']}: gate called without await — it would never run")
    if f["dead"]:
        failures.append(f"line {f['line']}: gate is unreachable (return/raise earlier in the same block)")

print(f"blocking call sites left  : {len(leftover_sync)}")
for f in leftover_sync:
    print(f"  line {f['line']}  <-- still inline")
    failures.append(f"line {f['line']}: blocking gate still called outside the wrapper")

if len(call_sites) < 2:
    failures.append(f"expected 2 off-loop call sites (middleware + websocket), found {len(call_sites)}")

print()
if failures:
    print("GATE_REACHABILITY_FAIL")
    for f in failures:
        print(f"  {f}")
    sys.exit(1)
print("GATE_REACHABILITY_OK — both sites await the gate and neither is dead code")

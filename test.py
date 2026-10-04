#!/usr/bin/env python3
"""Run the whole reView pipeline (Ghidra export -> gdb traces) on a set of small test programs
and report what worked and what broke.

  python3 tests/run_tests.py                 # everything (takes several minutes: Ghidra per binary)
  python3 tests/run_tests.py --quick         # skip the slow ones (static, C++)
  python3 tests/run_tests.py --only basic_o0,crash
  python3 tests/run_tests.py --build-only    # just compile the programs

Needs: gcc/g++, Ghidra (GHIDRA_INSTALL_DIR), gdb with Python, Linux x86-64.
These programs are EXECUTED under gdb (they are harmless, but spin.c burns CPU until its timeout).
Results: tests/report.md and tests/report.json. Exit code 1 if any run FAILs.
"""
import argparse, json, os, shutil, subprocess, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
# works from tests/ (next to programs/) or copied into the project root (next to review.py)
ROOT = next((p for p in (HERE, HERE.parent) if (p / "review.py").is_file()), None)
if ROOT is None:
    sys.exit("review.py not found next to this script or in its parent directory")
PROG = next((p for p in (HERE / "programs", HERE / "tests" / "programs", ROOT / "tests" / "programs") if p.is_dir()), None)
if PROG is None:
    sys.exit("test programs not found: put the programs/ folder next to this script (or use tests/programs/)")
BASE = PROG.parent                      # build/, out/ and the reports go here
BUILD, OUT = BASE / "build", BASE / "out"
sys.path.insert(0, str(ROOT))


# ------------------------------------------------------------------ test matrix
def exp(user, libc, names=True, imports=True):
    """expected function labels: user functions need symbols, libc ones need a dynamic link"""
    return (list(user) if names else []) + (list(libc) if imports else [])


def basic_runs(names=True, imports=True):
    # (kind, text, expected called labels, labels that must NOT be called)
    return [
        ("args", "hello", exp(["check", "ok"], ["strlen", "strcmp", "puts"], names, imports), ["bad"] if names else []),
        ("args", "nope", exp(["check", "bad"], ["strlen", "puts"], names, imports), ["ok"] if names else []),
        ("stdin", "hello", exp(["check", "ok"], ["fgets", "strcspn"], names, imports), ["bad"] if names else []),
    ]


# name, source, compiler, flags, tags, runs, extra
TESTS = [
    dict(name="basic_o0", src="basic.c", cc="gcc", flags=["-O0"], runs=basic_runs()),
    dict(name="basic_o2", src="basic.c", cc="gcc", flags=["-O2"], runs=basic_runs()),
    dict(name="basic_nopie", src="basic.c", cc="gcc", flags=["-O0", "-no-pie"], runs=basic_runs()),
    dict(name="basic_stripped", src="basic.c", cc="gcc", flags=["-O0", "-s"], runs=basic_runs(names=False)),
    dict(name="basic_static", src="basic.c", cc="gcc", flags=["-O0", "-static"], tags={"slow"},
         runs=basic_runs(imports=False)),
    dict(name="recursion", src="recursion.c", cc="gcc", flags=["-O0"], trunc_ok=True,
         runs=[("args", "", ["fact", "fib"], [])]),
    dict(name="funcptr", src="funcptr.c", cc="gcc", flags=["-O0"],
         runs=[("args", "", ["handler_a", "handler_b", "cmp_int", "qsort"], [])]),
    dict(name="loop_calls", src="loop_calls.c", cc="gcc", flags=["-O0"], trunc_ok=True,
         runs=[("args", "", ["tick"], [])]),
    dict(name="threads", src="threads.c", cc="gcc", flags=["-O0", "-pthread"],
         runs=[("args", "", ["worker", "work_unit", "pthread_create"], [])]),
    dict(name="cpp_hello", src="cpp_hello.cpp", cc="g++", flags=["-O0"], tags={"slow"},
         runs=[("args", "", ["compute"], [])]),
    dict(name="crash", src="crash.c", cc="gcc", flags=["-O0"],
         runs=[("args", "", ["boom"], [], "CRASHED")]),
    dict(name="spin", src="spin.c", cc="gcc", flags=["-O0"], expect_fail="timed out",
         runs=[("args", "", [], [])]),
]


# ------------------------------------------------------------------ build
def build(t):
    BUILD.mkdir(parents=True, exist_ok=True)
    out = BUILD / t["name"]
    if not shutil.which(t["cc"]):
        return None, "%s not found" % t["cc"]
    p = subprocess.run([t["cc"], *t["flags"], "-o", str(out), str(PROG / t["src"])], capture_output=True, text=True)
    if p.returncode:
        msg = (p.stderr or p.stdout).strip().splitlines()
        return None, ([l for l in msg if "error" in l.lower()] or msg or ["compiler failed"])[0][:200]
    return out, None


# ------------------------------------------------------------------ analysis of one recorded trace
def analyze(graph, trace, spec, trunc_ok=False):
    """-> (status, problems, warnings, infos, stats)"""
    nodes = {n["id"]: n for n in graph["nodes"]}
    edges = {(e["source"], e["target"]) for e in graph["edges"]}
    label = lambda i: nodes[i]["label"] if i in nodes else i
    events = trace["events"]
    end = events[-1] if events and events[-1].get("t") == "end" else {}

    called, abnormal, missing_edges = [], 0, set()
    for e in events:
        if e.get("t") == "call":
            called.append(e["to"])
            if (e["from"], e["to"]) not in edges:
                missing_edges.add((label(e["from"]), label(e["to"])))
        elif e.get("t") == "ret" and e.get("note"):
            abnormal += 1
    names = {label(i) for i in called}
    reached_user = any(i in nodes and nodes[i]["type"] != "import" and nodes[i]["label"] not in ("_start", "entry")
                       for i in called)

    problems, warns, infos = [], [], []
    want_end = spec[4] if len(spec) > 4 else None
    note = end.get("note", "")
    if want_end:
        if want_end not in note:
            problems.append("expected end '%s' but got '%s'" % (want_end, note or "no end event"))
    elif end.get("level") == "error" or not end:
        problems.append("trace ended badly: %s" % (note or "no end event"))
    elif end.get("level") == "warn":
        (infos if trunc_ok else warns).append("trace cut off (%s)" % note)
    if not reached_user:
        problems.append("never reached any program function (only libc / startup)")
    miss = [x for x in spec[2] if x not in names]
    if miss:
        problems.append("missing calls: " + ", ".join(miss))
    bad = [x for x in spec[3] if x in names]
    if bad:
        problems.append("calls that should not happen: " + ", ".join(bad))
    if trace.get("skipped"):
        warns.append("no breakpoint for: " + ", ".join(trace["skipped"]))
    if abnormal:
        warns.append("%d abnormal return(s) (tail call / longjmp / threads?)" % abnormal)
    if missing_edges:
        infos.append("%d call(s) not in the static graph, e.g. %s -> %s" % ((len(missing_edges),) + sorted(missing_edges)[0]))
    status = "FAIL" if problems else "WARN" if warns else "PASS"
    stats = dict(events=len(events), calls=len(called), distinct=len(names), end=note or "?")
    return status, problems, warns, infos, stats


# ------------------------------------------------------------------ run one test
def leftover(binname):
    if not shutil.which("pgrep"):
        return False
    if subprocess.run(["pgrep", "-x", binname[:15]], capture_output=True).returncode == 0:
        subprocess.run(["pkill", "-9", "-x", binname[:15]])
        return True
    return False


def run_test(t, binpath, a):
    res = dict(name=t["name"], nodes=None, edges=None, runs=[], error=None, secs=0)
    outdir = OUT / t["name"]
    shutil.rmtree(outdir, ignore_errors=True)
    runs = sorted(t["runs"], key=lambda r: r[0] != "args")        # trace_run records args runs first, then stdin
    cmd = [sys.executable, str(ROOT / "review.py"), str(binpath), "--out", str(outdir), "--no-ai", "--no-serve",
           "--yes", "--max-events", str(a.max_events), "--trace-timeout", str(a.trace_timeout)]
    for r in runs:
        cmd += ["--run" if r[0] == "args" else "--stdin-run", r[1]]
    t0 = time.time()
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=a.test_timeout, cwd=ROOT)
        log = p.stdout + p.stderr
    except subprocess.TimeoutExpired as ex:
        res.update(error="pipeline timed out after %ds" % a.test_timeout, secs=time.time() - t0)
        leftover(t["name"])
        return res
    res["secs"] = round(time.time() - t0, 1)
    failed = {}
    for line in log.splitlines():                               # "[-] <label>   failed: <reason>"
        if line.startswith("[-]") and "failed:" in line:
            lab, why = line[3:].split("failed:", 1)
            failed[lab.strip()] = why.strip()
    graph_path = outdir / binpath.name / "graph.json"
    if not graph_path.exists():
        res["error"] = "Ghidra export failed: " + (log.strip().splitlines() or ["no output"])[-1][:200]
        return res
    graph = json.load(open(graph_path))
    res["nodes"], res["edges"] = len(graph["nodes"]), len(graph["edges"])
    traces = {tr["label"]: tr for tr in graph.get("traces", [])}

    for r in runs:
        label = ("args: " + r[1] if r[1] else "no arguments") if r[0] == "args" else "stdin: " + r[1]
        entry = dict(label=label, status="FAIL", problems=[], warnings=[], infos=[], stats={})
        if label in traces:
            if t.get("expect_fail"):
                entry["problems"].append("expected a failure (%s) but a trace was recorded" % t["expect_fail"])
            else:
                s, pr, wa, inf, st = analyze(graph, traces[label], r, t.get("trunc_ok", False))
                entry.update(status=s, problems=pr, warnings=wa, infos=inf, stats=st)
        elif t.get("expect_fail") and t["expect_fail"] in failed.get(label, ""):
            entry.update(status="PASS", infos=["failed as expected: " + failed[label]])
        else:
            entry["problems"].append("no trace recorded: " + failed.get(label, "unknown (see pipeline log)"))
        res["runs"].append(entry)
    if leftover(t["name"]):
        res["runs"].append(dict(label="cleanup", status="FAIL", problems=["the traced program was still running afterwards (killed it)"],
                                warnings=[], infos=[], stats={}))
    return res


# ------------------------------------------------------------------ report
def report(results):
    mark = {"PASS": "PASS", "WARN": "WARN", "FAIL": "FAIL"}
    lines = ["# reView pipeline test report", "",
             "| program | nodes/edges | secs | runs |", "|---|---|---|---|"]
    for r in results:
        if r["error"]:
            lines.append("| %s | - | %s | **FAIL**: %s |" % (r["name"], r["secs"], r["error"]))
            continue
        runs = ", ".join("%s %s" % (mark[x["status"]], x["label"]) for x in r["runs"])
        lines.append("| %s | %s/%s | %s | %s |" % (r["name"], r["nodes"], r["edges"], r["secs"], runs))
    lines += ["", "## Details (anything that is not a clean PASS)", ""]
    for r in results:
        notes = []
        for x in r["runs"]:
            for kind, items in (("FAIL", x["problems"]), ("WARN", x["warnings"]), ("info", x["infos"])):
                notes += ["- `%s` [%s] %s: %s" % (r["name"], kind, x["label"], i) for i in items]
        if r["error"]:
            notes.append("- `%s` [FAIL] %s" % (r["name"], r["error"]))
        lines += notes
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help="comma-separated program names")
    ap.add_argument("--quick", action="store_true", help="skip slow programs (static, C++)")
    ap.add_argument("--build-only", action="store_true")
    ap.add_argument("--max-events", type=int, default=300)
    ap.add_argument("--trace-timeout", type=int, default=10, help="seconds per traced run")
    ap.add_argument("--test-timeout", type=int, default=900, help="seconds for one whole pipeline run")
    a = ap.parse_args()

    tests = [t for t in TESTS if not (a.quick and "slow" in t.get("tags", ()))]
    if a.only:
        want = set(a.only.split(","))
        tests = [t for t in tests if t["name"] in want]
        unknown = want - {t["name"] for t in TESTS}
        if unknown:
            sys.exit("unknown program(s): " + ", ".join(sorted(unknown)))

    if not a.build_only:
        import review
        if not shutil.which("gdb"):
            sys.exit("gdb not found")
        if not review.find_headless(None):
            sys.exit("Ghidra not found (set GHIDRA_INSTALL_DIR)")

    results = []
    for t in tests:
        print("== %s" % t["name"], flush=True)
        binpath, err = build(t)
        if err:
            print("   BUILD FAILED: %s" % err)
            results.append(dict(name=t["name"], nodes=None, edges=None, runs=[], secs=0, error="build failed: " + err))
            continue
        if a.build_only:
            print("   built %s" % binpath)
            continue
        r = run_test(t, binpath, a)
        results.append(r)
        print("   " + (r["error"] or ", ".join("%s %s" % (x["status"], x["label"]) for x in r["runs"])) + "  (%ss)" % r["secs"], flush=True)

    if a.build_only:
        return
    md = report(results)
    (BASE / "report.md").write_text(md)
    (BASE / "report.json").write_text(json.dumps(results, indent=2))
    print("\n" + md)
    print("Saved %s and %s" % (BASE / "report.md", BASE / "report.json"))
    sys.exit(1 if any(r["error"] or any(x["status"] == "FAIL" for x in r["runs"]) for r in results) else 0)


if __name__ == "__main__":
    main()
#!/usr/bin/env python3
"""reView: give it a binary, get an interactive, explained call graph.

  python3 review.py ./mybinary          (GEMINI_API_KEY from the environment, or you'll be asked)

Pipeline: Ghidra headless export -> real execution traces (gdb) -> AI explanations -> local web viewer.
Re-running reuses finished steps; --force redoes them.
"""
import argparse, functools, getpass, glob, http.server, json, os, shutil, subprocess, sys, tempfile, webbrowser
from pathlib import Path

HERE = Path(__file__).resolve().parent
VIEWER = HERE / "viewer"
IN_SANDBOX = os.environ.get("REVIEW_SANDBOX") == "1" or Path("/.dockerenv").exists()
PLACEHOLDERS = {None, "", "Click on nodes to inspect execution pathways.", "AI analysis failed or hit rate limit."}


def step(msg): print("\n\033[1m==> %s\033[0m" % msg, flush=True)
def warn(msg): print("\033[33m[!] %s\033[0m" % msg, flush=True)


# ------------------------------------------------------------------ 1. Ghidra export
def find_headless(explicit):
    exe = "analyzeHeadless.bat" if os.name == "nt" else "analyzeHeadless"
    dirs = [explicit, os.environ.get("GHIDRA_INSTALL_DIR")]
    for pat in ("/opt/ghidra*", "/usr/share/ghidra", "/Applications/ghidra*",
                str(Path.home() / "ghidra*"), str(Path.home() / "Downloads" / "ghidra*")):
        dirs += sorted(glob.glob(pat), reverse=True)
    for d in dirs:
        if d and (Path(d) / "support" / exe).is_file():
            return Path(d) / "support" / exe
    w = shutil.which(exe)
    return Path(w) if w else None


def export_graph(headless, target, graph, timeout):
    graph.unlink(missing_ok=True)
    with tempfile.TemporaryDirectory(prefix="review-ghidra-") as proj:
        cmd = [str(headless), proj, "reView", "-import", str(target),
               "-scriptPath", str(HERE / "ghidra_scripts"),
               "-postScript", "ExportGraph.java", str(graph),
               "-deleteProject", "-analysisTimeoutPerFile", str(timeout)]
        print("Ghidra is importing and analysing the binary (this can take a minute)...", flush=True)
        p = subprocess.run(cmd, capture_output=True, text=True)
    if not graph.exists():
        print((p.stdout + p.stderr)[-2500:])
        hint = "" if shutil.which("java") else " Java was not found: Ghidra needs a JDK (21 for current releases)."
        sys.exit("Ghidra export failed (log above)." + hint)
    for line in p.stdout.splitlines():
        if "Graph Export Complete" in line:
            print(line.strip())


# ------------------------------------------------------------------ 2. traces
def trace_step(a, graph, target, work, binary_name):
    if a.no_trace:
        return
    data = json.load(open(graph))
    if data.get("traces") and not (a.force or a.run or a.stdin_run):
        print("Traces already recorded (use --force or --run to redo).")
        return
    if open(target, "rb").read(4) != b"\x7fELF":
        return warn("Tracing needs a Linux ELF binary; skipping traces.")
    if not data.get("arch", "").startswith("x86:LE:64"):
        return warn("Tracing supports x86-64 only (this is %s); skipping traces." % data.get("arch", "unknown"))
    if not shutil.which("gdb"):
        return warn("gdb not found; skipping traces.")
    if not (IN_SANDBOX or a.yes):
        if not sys.stdin.isatty():
            return warn("Tracing executes the binary. Not running it outside a sandbox without --yes; skipping.")
        if input("Tracing EXECUTES %s on this machine. Continue? [y/N] " % binary_name).strip().lower() != "y":
            return warn("Skipping traces.")
    runs = []
    for r in a.run:
        runs += ["--run", r]
    for s in a.stdin_run:
        runs += ["--stdin-run", s]
    if not runs:   # generic probes: no input, one argument, one line on stdin
        runs = ["--run", "", "--run", "test", "--stdin-run", "test"]
    r = subprocess.run([sys.executable, str(HERE / "trace_run.py"), str(graph), str(target)] + runs, cwd=work)
    if r.returncode:
        warn("Tracing failed; continuing without traces.")


# ------------------------------------------------------------------ 3. AI explanations
def enrich_step(a, graph):
    data = json.load(open(graph))
    todo = [n for n in data["nodes"] if n.get("summary") in PLACEHOLDERS]
    if not todo:
        print("All nodes already have explanations.")
        return
    env = dict(os.environ)
    if any(n.get("type") != "import" for n in todo):
        if a.no_ai:
            env.pop("GEMINI_API_KEY", None)
        else:
            key = env.get("GEMINI_API_KEY")
            if not key and sys.stdin.isatty():
                key = getpass.getpass("Gemini API key (input hidden, never stored): ").strip()
            if key:
                env["GEMINI_API_KEY"] = key
            else:
                warn("No GEMINI_API_KEY: skipping AI explanations (imports still get built-in blurbs).")
    # the key travels via the environment only: not on the command line, not written to disk
    subprocess.run([sys.executable, str(HERE / "enrich_summaries.py"), str(graph)], env=env)


# ------------------------------------------------------------------ 4. viewer
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def serve(outdir, host, port, open_browser):
    handler = functools.partial(Handler, directory=str(outdir))
    for p in range(port, port + 20):
        try:
            srv = http.server.ThreadingHTTPServer((host, p), handler)
            break
        except OSError:
            continue
    else:
        sys.exit("No free port near %d" % port)
    url = "http://%s:%d/" % ("localhost" if host in ("0.0.0.0", "") else host, p)
    step("reView is ready: %s   (Ctrl-C to stop)" % url)
    if open_browser:
        webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("binary")
    ap.add_argument("--out", default=os.environ.get("REVIEW_OUT", "reView-out"), help="output root directory")
    ap.add_argument("--ghidra", help="Ghidra install dir (default: $GHIDRA_INSTALL_DIR or auto-detect)")
    ap.add_argument("--no-ai", action="store_true", help="skip AI explanations")
    ap.add_argument("--no-trace", action="store_true", help="skip recording execution traces")
    ap.add_argument("--run", action="append", default=[], metavar="ARGS", help="trace a run with these arguments (repeatable)")
    ap.add_argument("--stdin-run", action="append", default=[], metavar="TEXT", help="trace a run with this stdin (repeatable)")
    ap.add_argument("-y", "--yes", action="store_true", help="don't ask before executing the binary")
    ap.add_argument("--force", action="store_true", help="redo steps that already finished")
    ap.add_argument("--analysis-timeout", type=int, default=600, help="Ghidra seconds per file")
    ap.add_argument("--no-serve", action="store_true")
    ap.add_argument("--no-open", action="store_true", default=IN_SANDBOX)
    ap.add_argument("--host", default=os.environ.get("REVIEW_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=8000)
    a = ap.parse_args()

    binary = Path(a.binary).expanduser().resolve()
    if not binary.is_file():
        sys.exit("Not a file: %s" % binary)
    outdir = Path(a.out).resolve() / binary.name
    outdir.mkdir(parents=True, exist_ok=True)
    graph = outdir / "graph.json"
    for f in ("index.html", "app.js", "styles.css"):
        shutil.copy2(VIEWER / f, outdir / f)

    with tempfile.TemporaryDirectory(prefix="review-work-") as work:
        target = Path(work) / binary.name          # private, executable copy: the original is never touched
        shutil.copy2(binary, target)
        target.chmod(0o755)

        step("1/3  Ghidra: building the call graph")
        if graph.exists() and not a.force:
            print("graph.json already exists, reusing it (use --force to redo).")
        else:
            headless = find_headless(a.ghidra)
            if not headless:
                sys.exit("Ghidra not found. Install it and set GHIDRA_INSTALL_DIR (or use --ghidra), or use the Docker image.")
            export_graph(headless, target, graph, a.analysis_timeout)

        step("2/3  Recording execution traces")
        trace_step(a, graph, target, work, binary.name)

    step("3/3  Writing explanations")
    enrich_step(a, graph)

    if not a.no_serve:
        serve(outdir, a.host, a.port, not a.no_open)
    else:
        print("Done: %s" % outdir)


if __name__ == "__main__":
    main()
#!/usr/bin/env python3
"""reView: give it a binary, get an interactive, explained call graph.

  python3 review.py ./mybinary
  python3 review.py ./mybinary --live     # the viewer can also run the binary with typed input

Run with --help for all flags. Pipeline: Ghidra headless export -> execution traces (gdb)
-> AI explanations -> local web viewer.
"""
import argparse, functools, getpass, glob, hmac, http.server, importlib.util, json, os, secrets, shlex
import shutil, subprocess, sys, tempfile, threading, webbrowser
from pathlib import Path
from urllib.parse import urlparse

import trace_run

HERE = Path(__file__).resolve().parent
VIEWER = HERE / "viewer" if (HERE / "viewer" / "index.html").is_file() else HERE
GHIDRA_SCRIPTS = HERE / "ghidra_scripts" if (HERE / "ghidra_scripts" / "ExportGraph.java").is_file() else HERE

IN_SANDBOX = os.environ.get("REVIEW_SANDBOX") == "1" or Path("/.dockerenv").exists()
LOOPBACK = {"127.0.0.1", "localhost", "::1"}
PLACEHOLDERS = {None, "", "Click on nodes to inspect execution pathways.", "AI analysis failed or hit rate limit."}
SOURCE_EXT = {".c", ".cc", ".cpp", ".cxx", ".h", ".hpp", ".rs", ".go", ".java", ".py", ".js", ".s", ".asm"}
BIN_MAGICS = (b"\x7fELF", b"MZ", b"\xfe\xed\xfa\xce", b"\xfe\xed\xfa\xcf",
              b"\xce\xfa\xed\xfe", b"\xcf\xfa\xed\xfe", b"\xca\xfe\xba\xbe")
MAX_ARGS, MAX_STDIN = 256, 4096     # live-mode input limits (characters)


def step(msg): print("\n\033[1m==> %s\033[0m" % msg, flush=True)
def warn(msg): print("\033[33m[!] %s\033[0m" % msg, flush=True)


def have_genai():
    try:
        return importlib.util.find_spec("google.genai") is not None
    except (ImportError, ValueError):
        return False


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
               "-scriptPath", str(GHIDRA_SCRIPTS),
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
def trace_blockers(a, data, target):
    """Why tracing can't work for this binary/machine, or None."""
    with open(target, "rb") as f:
        if f.read(4) != b"\x7fELF":
            return "tracing needs a Linux ELF binary"
    arch = data.get("arch", "")
    if arch and not arch.startswith("x86:LE:64"):
        return "tracing supports x86-64 only (this binary is %s)" % arch
    if not shutil.which(a.gdb):
        return "gdb not found"
    return None


def confirm_execution(a, name):
    if IN_SANDBOX or a.yes:
        return True
    if not sys.stdin.isatty():
        warn("Executing the binary needs confirmation (pass --yes to allow it without asking).")
        return False
    return input("This EXECUTES %s on this machine. Continue? [y/N] " % name).strip().lower() == "y"


def trace_step(a, graph, target, work, name):
    if a.no_trace:
        return
    data = json.load(open(graph))
    if data.get("traces") and not (a.force or a.run or a.stdin_run):
        print("Traces already recorded (use --force or --run to redo).")
        return
    why = trace_blockers(a, data, target)
    if why:
        return warn("Skipping traces: %s." % why)
    if not confirm_execution(a, name):
        return warn("Skipping traces.")
    runs = []
    for r in a.run:
        runs += ["--run", r]
    for s in a.stdin_run:
        runs += ["--stdin-run", s]
    if not runs:   # generic probes: no input, one argument, one line on stdin
        runs = ["--run", "", "--run", "test", "--stdin-run", "test"]
    cmd = [sys.executable, str(HERE / "trace_run.py"), str(graph), str(target),
           "--gdb", a.gdb, "--max-events", str(a.max_events), "--timeout", str(a.trace_timeout)] + runs
    if subprocess.run(cmd, cwd=work).returncode:
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
        if not a.no_ai and not have_genai():
            warn("The 'google-genai' package isn't installed for this Python (%s).\n"
                 "    Fix: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt\n"
                 "    Continuing without AI explanations." % sys.executable)
            a.no_ai = True
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


# ------------------------------------------------------------------ 4. viewer (+ live tracing API)
class LiveTracer:
    """Records one traced run on demand. One at a time."""

    def __init__(self, a, data, target, work):
        self.a, self.target, self.work = a, target, work
        self.nodes = trace_run.slim_nodes(data)
        self.g_entry = trace_run.ghidra_entry(data)
        self.lock = threading.Lock()
        self.token = secrets.token_urlsafe(24)

    def run(self, mode, text):
        limit = MAX_ARGS if mode == "args" else MAX_STDIN
        if len(text) > limit:
            return 400, {"error": "input too long (max %d characters)" % limit}
        if not self.lock.acquire(blocking=False):
            return 429, {"error": "another live run is still in progress"}
        try:
            if mode == "args":
                try:
                    args = shlex.split(text)
                except ValueError as ex:
                    return 400, {"error": "can't parse arguments: %s" % ex}
                stdin, label = None, "live args: " + (text[:40] or "none")
            else:
                args, stdin, label = [], text + "\n", "live stdin: " + (text[:40] or "(empty)")
            trace, err = trace_run.record_run(self.a.gdb, str(self.target), self.nodes, self.g_entry, label,
                                              args, stdin, self.a.max_events, self.a.trace_timeout, self.work)
            return (200, {"trace": trace}) if trace else (500, {"error": err})
        finally:
            self.lock.release()


class Handler(http.server.SimpleHTTPRequestHandler):
    live = None            # LiveTracer when --live
    allowed_hosts = set()

    def log_message(self, *args): pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _host_ok(self):
        return (self.headers.get("Host") or "").rsplit(":", 1)[0].strip("[]") in self.allowed_hosts

    def do_GET(self):
        if self.path.split("?")[0] == "/api/config":
            if self.live is None or not self._host_ok():
                return self._json(404, {"live": False})
            return self._json(200, {"live": True, "token": self.live.token,
                                    "max_args": MAX_ARGS, "max_stdin": MAX_STDIN})
        super().do_GET()

    def do_POST(self):
        if self.path != "/api/trace" or self.live is None:
            return self._json(404, {"error": "not found"})
        origin = self.headers.get("Origin")
        if not self._host_ok() or (origin and urlparse(origin).hostname not in self.allowed_hosts):
            return self._json(403, {"error": "request refused (host/origin check)"})
        sent = (self.headers.get("X-Review-Token") or "").encode()
        if not hmac.compare_digest(sent, self.live.token.encode()):
            return self._json(403, {"error": "bad token (reload the page)"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
            if not 0 < n <= 16384:
                raise ValueError
            req = json.loads(self.rfile.read(n))
            mode, text = req["mode"], req.get("text", "")
            if mode not in ("args", "stdin") or not isinstance(text, str):
                raise ValueError
        except (ValueError, KeyError, TypeError):
            return self._json(400, {"error": "bad request"})
        code, payload = self.live.run(mode, text)
        self._json(code, payload)


def serve(outdir, host, port, open_browser, live=None):
    allowed = set(LOOPBACK) | ({host} if host not in ("", "0.0.0.0", "::") else set())
    cls = type("ReviewHandler", (Handler,), {"live": live, "allowed_hosts": allowed})
    handler = functools.partial(cls, directory=str(outdir))
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
    if live:
        print("Live mode ON: the viewer can run the binary on demand. Live runs are not saved.")
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
    ap.add_argument("--analysis-timeout", type=int, default=600, help="Ghidra seconds per file")
    ap.add_argument("--no-ai", action="store_true", help="skip AI explanations")
    ap.add_argument("--no-trace", action="store_true", help="skip recording execution traces")
    ap.add_argument("--run", action="append", default=[], metavar="ARGS", help="trace a run with these arguments (repeatable)")
    ap.add_argument("--stdin-run", action="append", default=[], metavar="TEXT", help="trace a run with this stdin (repeatable)")
    ap.add_argument("--max-events", type=int, default=300, help="max call/return events per trace")
    ap.add_argument("--trace-timeout", type=int, default=30, help="seconds per traced run")
    ap.add_argument("--gdb", default="gdb", help="gdb executable")
    ap.add_argument("--live", action="store_true", help="let the viewer run the binary on demand with typed input")
    ap.add_argument("-y", "--yes", action="store_true", help="don't ask before executing the binary")
    ap.add_argument("--force", action="store_true", help="redo steps that already finished")
    ap.add_argument("--no-serve", action="store_true", help="build graph.json and exit")
    ap.add_argument("--no-open", action="store_true", default=IN_SANDBOX, help="don't open a browser tab")
    ap.add_argument("--host", default=os.environ.get("REVIEW_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=8000)
    a = ap.parse_args()

    if a.live and a.no_trace:
        sys.exit("--live and --no-trace contradict each other.")
    if a.live and a.no_serve:
        sys.exit("--live needs the web server (drop --no-serve).")
    if a.live and a.host not in LOOPBACK and not IN_SANDBOX:
        sys.exit("--live lets anyone who can reach %s:%d run the binary. Use the default --host 127.0.0.1." % (a.host, a.port))

    binary = Path(a.binary).expanduser().resolve()
    if not binary.is_file():
        sys.exit("Not a file: %s" % binary)
    if binary.suffix.lower() in SOURCE_EXT:
        sys.exit("%s looks like source code, not a compiled program.\n"
                 "Compile it first, e.g.  gcc -o %s %s" % (binary.name, binary.stem, binary.name))
    with open(binary, "rb") as f:
        if not f.read(4).startswith(BIN_MAGICS):
            warn("%s doesn't look like ELF/PE/Mach-O. Ghidra may fail to import it." % binary.name)

    missing = [f for f in ("index.html", "app.js", "styles.css") if not (VIEWER / f).is_file()]
    if missing or not (GHIDRA_SCRIPTS / "ExportGraph.java").is_file():
        sys.exit("reView project files missing (%s). Keep index.html, app.js, styles.css and ExportGraph.java "
                 "either next to review.py or in viewer/ and ghidra_scripts/."
                 % ", ".join(missing or ["ExportGraph.java"]))

    if a.live:
        if not confirm_execution(a, binary.name):
            sys.exit("--live needs permission to execute the binary.")
        a.yes = True      # already agreed: don't ask again for the probe runs

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

        live = None
        if a.live:
            data = json.load(open(graph))
            why = trace_blockers(a, data, target)
            if why:
                sys.exit("--live unavailable: %s." % why)
            live = LiveTracer(a, data, target, work)

        if a.no_serve:
            print("Done: %s" % outdir)
        else:
            serve(outdir, a.host, a.port, not a.no_open, live)   # inside the with: the binary copy must outlive the server


if __name__ == "__main__":
    main()
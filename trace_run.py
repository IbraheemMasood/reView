#!/usr/bin/env python3
"""Record real execution traces of a binary into graph.json ("traces").

  python3 trace_run.py graph.json ./target --run "AREV3RSZ" --run "wrongkey" --stdin-run "AREV3RSZ"

--run TEXT        run with TEXT as the command-line arguments (shell-style quoting)
--stdin-run TEXT  run with no arguments and TEXT typed on stdin
Needs Linux x86-64 + gdb with Python. The binary is EXECUTED: use a VM for untrusted samples.
"""
import argparse, json, os, re, shlex, shutil, subprocess, sys, tempfile

try:
    import gdb
    IN_GDB = True
except ImportError:
    IN_GDB = False

MASK64 = (1 << 64) - 1
ARG_REGS = ["rdi", "rsi", "rdx", "rcx", "r8", "r9"]


# ---------------------------------------------------------------- shared helpers
def parse_sig(code, name):
    """(return type, [param types]) from Ghidra's C output or an import prototype."""
    for line in code.split("\n"):
        line = line.strip()
        if not line or line.startswith("//"):
            continue
        m = re.match(r"(.*?)\b" + re.escape(name) + r"\s*\((.*)\)\s*;?\s*$", line)
        if not m:
            break
        raw = m.group(2).strip()
        params = [] if raw in ("", "void") else [p.strip() for p in raw.split(",")]
        types = []
        for p in params:
            if p == "...":
                continue
            pm = re.match(r"^(.*?)(\w+)$", p)
            types.append((pm.group(1).strip() or p) if pm else p)
        return m.group(1).strip(), types
    return "", []


def read_str(addr):
    """printable C string at addr, or None"""
    mem = gdb.selected_inferior()
    b = None
    for size in (48, 8):
        try:
            b = bytes(mem.read_memory(addr, size))
            break
        except gdb.MemoryError:
            continue
    if b is None:
        return None
    n = b.find(b"\0")
    chunk = b if n < 0 else b[:n]
    if not chunk or any((c < 32 and c not in (9, 10, 13)) or c > 126 for c in chunk):
        return None
    s = chunk.decode("ascii")
    return s[:32] + "…" if (len(s) > 32 or n < 0) else s


def fmt_val(t, v):
    ptr = "*" in t
    if re.search(r"\bbool\b", t):
        return "1" if v & 0xFF else "0"
    if (ptr or t.startswith("undefined")) and v >= 0x10000:
        s = read_str(v)
        if s is not None:
            return json.dumps(s, ensure_ascii=False)
        if ptr:
            return hex(v)
    bits = 32 if re.search(r"\b(int|uint|undefined4)\b", t) else 64
    v &= (1 << bits) - 1
    raw = v
    if re.search(r"\b(int|long)\b", t) and v >= 1 << (bits - 1):
        v -= 1 << bits
    if abs(v) < 256:
        return str(v)
    return hex(v) if (ptr or t.startswith("undefined")) else "%d (0x%x)" % (v, raw)


def reg(name):
    return int(gdb.parse_and_eval("$" + name)) & MASK64


def plt_spec(name):
    """Location of the program's own PLT stub for `name` (every call from the program goes through it)."""
    try:
        return "*0x%x" % (int(gdb.parse_and_eval("'%s@plt'" % name).address) & MASK64)
    except (gdb.error, RuntimeError):
        pass
    try:
        m = re.search(r"0x[0-9a-fA-F]+", gdb.execute("info address '%s@plt'" % name, to_string=True))
        return "*" + m.group(0) if m else None
    except gdb.error:
        return None


def import_bp(name):
    """Internal breakpoint on a library function, or RuntimeError if none can be placed.
    Normal functions: '*name' = exact entry (no prologue skipping, so [rsp] is the return address).
    GNU ifuncs (strlen, strncpy, ...): the symbol is only a resolver that already ran, and breaking on it
    by name makes gdb add its own stop-happy resolver breakpoints, so use the PLT stub instead."""
    try:
        kind = str(gdb.parse_and_eval(name).type)
    except gdb.error:
        kind = ""
    specs = [plt_spec(name)] if "indirect" in kind else ["*" + name, name]
    for spec in specs:
        if not spec:
            continue
        try:
            bp = gdb.Breakpoint(spec, internal=True)
            if bp.is_valid():
                return bp
        except (gdb.error, RuntimeError):
            continue
    raise RuntimeError("no usable breakpoint for " + name)


# ---------------------------------------------------------------- inside gdb
def gdb_main():
    cfg = json.load(open(os.environ["REVIEW_CFG"]))
    nodes, g_entry, max_events = cfg["nodes"], cfg["ghidra_entry"], cfg["max_events"]
    sigs = {n["id"]: parse_sig(n.get("decompiled", ""), n["label"]) for n in nodes}
    by_id = {n["id"]: n for n in nodes}

    tmp = tempfile.mkdtemp()
    inp, outp = os.path.join(tmp, "stdin"), os.path.join(tmp, "stdout")
    with open(inp, "w") as f:
        f.write(cfg.get("stdin") or "")

    for c in ("set pagination off", "set confirm off", "set breakpoint pending on"):
        gdb.execute(c)
    gdb.execute("starti %s < %s > %s 2>&1" % (shlex.join(cfg["args"]), shlex.quote(inp), shlex.quote(outp)),
                to_string=True)

    # map Ghidra addresses -> runtime addresses via the entry point
    aux = gdb.execute("info auxv", to_string=True)
    m = re.search(r"AT_ENTRY.*?(0x[0-9a-fA-F]+)\s*$", aux, re.M)
    at_entry = int(m.group(1), 16)
    delta = at_entry - g_entry

    # run to the entry point so shared libraries are loaded, then arm everything.
    # Statically linked programs have no dynamic loader: starti already stops at the entry point, and
    # `continue` from a breakpoint at the current pc would run the whole program to its end.
    if reg("rip") != at_entry:
        gdb.execute("tbreak *0x%x" % at_entry, to_string=True)
        gdb.execute("continue", to_string=True)

    events, stack, retmap, fnbp = [], [], {}, {}
    skipped = []
    entry_node = next((n for n in nodes if n["type"] != "import" and int(n["id"], 16) == g_entry), None)
    for n in nodes:
        try:
            if n["type"] == "import":
                bp = import_bp(n["label"])
            else:
                a = int(n["id"], 16)
                if a == g_entry:
                    continue
                bp = gdb.Breakpoint("*0x%x" % (a + delta), internal=True)
            if bp.is_valid():
                fnbp[bp.number] = n
            else:
                skipped.append(n["label"])   # gdb discarded it (symbol didn't resolve)
        except (gdb.error, RuntimeError):
            skipped.append(n["label"])

    if skipped:
        print("[trace] could not place breakpoints on: " + ", ".join(skipped))

    if entry_node:
        events.append({"t": "enter", "fn": entry_node["id"]})
        stack.append({"id": entry_node["id"], "rb": None, "rbnum": None})

    state = {"ev": None, "done": False, "code": None}
    gdb.events.stop.connect(lambda ev: state.update(ev=ev))
    gdb.events.exited.connect(lambda ev: state.update(done=True, code=getattr(ev, "exit_code", None)))

    def drop(fr):
        retmap.pop(fr["rbnum"], None)
        if fr["rb"] is not None:
            try:
                fr["rb"].delete()
            except Exception:
                pass

    def do_return(fr):
        if fr not in stack:
            return
        while stack[-1] is not fr:
            top = stack.pop()
            drop(top)
            events.append({"t": "ret", "fn": top["id"], "val": "",
                           "note": "Control left this function without a normal return (tail call, exit or longjmp)."})
        stack.pop()
        drop(fr)
        rt = sigs[fr["id"]][0]
        unknown = (not rt) or rt.strip() == "undefined"
        val = "" if (unknown or (re.search(r"\bvoid\b", rt) and "*" not in rt)) else fmt_val(rt, reg("rax"))
        events.append({"t": "ret", "fn": fr["id"], "val": val})

    truncated, crashed, last_import, stop_err = False, None, None, None
    spurious = 0
    if not gdb.selected_inferior().pid:
        stop_err, state["done"] = "the program exited before tracing could start", True
    while not state["done"]:
        state["ev"] = None
        try:
            gdb.execute("continue", to_string=True)
        except gdb.error as ex:
            stop_err = "gdb error: %s" % ex
            break
        if state["done"]:
            break
        ev = state["ev"]
        if isinstance(ev, gdb.SignalEvent):
            crashed = ev.stop_signal
            try:
                crashed += " at " + gdb.execute("info symbol $pc", to_string=True).strip().rstrip(".")
            except gdb.error:
                crashed += " at 0x%x" % reg("rip")
            if stack:
                crashed += ", inside " + by_id[stack[-1]["id"]]["label"]
            break
        if not isinstance(ev, gdb.BreakpointEvent):
            # gdb sometimes stops for its own bookkeeping (not one of our breakpoints): just keep going
            spurious += 1
            if spurious > 50:
                stop_err = "too many unexpected stops (%s)" % type(ev).__name__
                break
            continue
        spurious = 0
        nums = [b.number for b in ev.breakpoints if b.is_valid()]

        # returns first, deepest frame first
        rets = [retmap[x] for x in nums if x in retmap]
        for fr in sorted(rets, key=lambda f: stack.index(f) if f in stack else -1, reverse=True):
            do_return(fr)

        for num in nums:
            n = fnbp.get(num)
            if n is None:
                continue
            sp = reg("rsp")
            ra = int.from_bytes(bytes(gdb.selected_inferior().read_memory(sp, 8)), "little")
            if n["type"] == "import":
                # ignore calls made from inside libc itself, and double hits (PLT + real function)
                if gdb.solib_name(ra) is not None or last_import == (ra, sp):
                    continue
                last_import = (ra, sp)
            _, ptypes = sigs[n["id"]]
            args = ", ".join(fmt_val(t, reg(ARG_REGS[i])) for i, t in enumerate(ptypes[:4]))
            if stack:
                events.append({"t": "call", "from": stack[-1]["id"], "to": n["id"], "args": args})
            elif not events:
                events.append({"t": "enter", "fn": n["id"]})
            else:
                continue
            rb = gdb.Breakpoint("*0x%x" % ra, internal=True)
            rb.condition = "$rsp == 0x%x" % (sp + 8)
            fr = {"id": n["id"], "rb": rb, "rbnum": rb.number}
            retmap[rb.number] = fr
            stack.append(fr)

        if len(events) >= max_events:
            truncated = True
            break

    try:
        gdb.execute("kill", to_string=True)
    except gdb.error:
        pass

    try:
        output = open(outp, errors="replace").read()[:2000]
    except OSError:
        output = ""
    if crashed:
        level, note = "error", "CRASHED (%s)" % crashed
    elif stop_err:
        level, note = "error", "TRACE STOPPED: " + stop_err
    elif truncated:
        level, note = "warn", "TRACE CUT OFF after %d events" % max_events
    else:
        code = state["code"]
        level, note = "ok", "EXITED" + ("" if code is None else " (code %s)" % code)
    events.append({"t": "end", "ok": level != "error", "level": level, "note": note, "output": output.strip()})
    json.dump({"events": events, "skipped": skipped}, open(os.environ["REVIEW_OUT"], "w"))


# ---------------------------------------------------------------- normal python (driver)
SECRET_HINTS = ("KEY", "TOKEN", "SECRET", "PASSWORD", "PASSWD", "CREDENTIAL", "AUTH", "SESSION")


def clean_env():
    """Environment for the traced program: drop anything that looks like an API key or secret."""
    return {k: v for k, v in os.environ.items() if not any(h in k.upper() for h in SECRET_HINTS)}


def slim_nodes(data):
    return [{k: n.get(k, "") for k in ("id", "label", "type", "decompiled")} for n in data["nodes"]]


def ghidra_entry(data):
    e = data.get("entry")
    if e:
        return int(e, 16)
    n = next((n for n in data["nodes"] if n["label"] in ("_start", "entry")), None)
    if not n:
        raise ValueError("graph.json has no entry address. Re-export it with the updated ExportGraph.java")
    return int(n["id"], 16)


def record_run(gdb_bin, binary, nodes, g_entry, label, args, stdin, max_events, timeout, cwd=None):
    """One traced execution under gdb. Returns (trace dict, None) or (None, error text)."""
    with tempfile.TemporaryDirectory() as td:
        cfg, out = os.path.join(td, "cfg.json"), os.path.join(td, "out.json")
        with open(cfg, "w") as f:
            json.dump({"nodes": nodes, "ghidra_entry": g_entry, "max_events": max_events,
                       "args": args, "stdin": stdin}, f)
        env = dict(clean_env(), REVIEW_CFG=cfg, REVIEW_OUT=out)
        cmd = [gdb_bin, "-q", "-nx", "-batch", "-x", os.path.abspath(__file__), os.path.abspath(binary)]
        try:
            p = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=timeout, cwd=cwd)
        except subprocess.TimeoutExpired:
            return None, "timed out after %ds (waiting for input? infinite loop?)" % timeout
        if not os.path.exists(out):
            return None, (p.stderr or p.stdout)[-800:] or "gdb produced no trace"
        with open(out) as f:
            res = json.load(f)
    trace = {"label": label, "events": res["events"]}
    if res.get("skipped"):
        trace["skipped"] = res["skipped"]
    return trace, None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("graph")
    ap.add_argument("binary")
    ap.add_argument("--run", action="append", default=[], metavar="ARGS")
    ap.add_argument("--stdin-run", action="append", default=[], metavar="TEXT")
    ap.add_argument("--max-events", type=int, default=300)
    ap.add_argument("--timeout", type=int, default=30, help="seconds per run")
    ap.add_argument("--append", action="store_true", help="keep existing traces in graph.json")
    ap.add_argument("--gdb", default="gdb")
    a = ap.parse_args()

    if not shutil.which(a.gdb):
        sys.exit("gdb not found (install it, or pass --gdb /path/to/gdb)")
    data = json.load(open(a.graph))
    arch = data.get("arch", "")
    if arch and not arch.startswith("x86:LE:64"):
        sys.exit("Only x86-64 is supported so far (graph arch: %s)" % arch)
    try:
        g_entry = ghidra_entry(data)
    except ValueError as ex:
        sys.exit(str(ex))

    runs = [("args: " + r if r else "no arguments", shlex.split(r), None) for r in a.run]
    runs += [("stdin: " + s, [], s + "\n") for s in a.stdin_run]
    if not runs:
        runs = [("no arguments", [], None)]

    nodes, binary = slim_nodes(data), os.path.abspath(a.binary)
    print("[!] This executes %s for real. Use a VM for anything you don't trust." % binary)

    traces = []
    for label, args, stdin in runs:
        trace, err = record_run(a.gdb, binary, nodes, g_entry, label, args, stdin, a.max_events, a.timeout)
        if err:
            print("[-] %-30s failed: %s" % (label, err))
            continue
        traces.append(trace)
        print("[+] %-30s %d events, %s" % (label, len(trace["events"]), trace["events"][-1].get("note", "")))
        if trace.get("skipped"):
            print("    [!] no breakpoint could be placed on: " + ", ".join(trace["skipped"]))

    if not traces:
        sys.exit("No traces recorded.")
    data["traces"] = (data.get("traces", []) if a.append else []) + traces
    with open(a.graph, "w") as f:
        json.dump(data, f, indent=2)
    print("[+] Saved %d trace(s) to %s" % (len(traces), a.graph))


if IN_GDB:
    gdb_main()
elif __name__ == "__main__":
    main()
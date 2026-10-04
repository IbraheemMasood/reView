#!/usr/bin/env python3
"""Add beginner-friendly explanations to graph.json (output of ExportGraph.java)."""
import json, os, sys, time
from google import genai

API_KEY = os.getenv("GEMINI_API_KEY")
MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")   # override via env if you use another model
PATH = sys.argv[1] if len(sys.argv) > 1 else "graph.json"

API_KEY = os.getenv("GEMINI_API_KEY")
MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
PATH = sys.argv[1] if len(sys.argv) > 1 else "graph.json"

client = genai.Client(api_key=API_KEY) if API_KEY else None


# Static blurbs for common libc functions, so imports need no API calls
LIBC = {
    "strlen": "Returns the length of a string (number of characters before the terminating zero byte).",
    "strncpy": "Copies at most n characters from one string buffer to another. It does NOT guarantee a terminating zero, so programs often add one manually.",
    "strcspn": "Returns how many characters at the start of a string are NOT in a given set. Often used with \"\\n\" to find and strip a trailing newline.",
    "fgets": "Reads one line of text from a stream (like stdin) into a buffer, up to a size limit.",
    "printf": "Prints formatted text to the terminal.",
    "puts": "Prints a string followed by a newline. Compilers often turn printf(\"text\\n\") into puts.",
    "__stack_chk_fail": "Called when the stack canary has been overwritten, meaning a buffer overflow was detected. The program aborts.",
    "__libc_start_main": "Sets up the C runtime, calls main, then exits with main's return value.",
}
GENERIC_IMPORT = "A library function that lives outside this binary. Look it up in the docs (man <name>) rather than reversing it."
PLACEHOLDERS = {None, "", "Click on nodes to inspect execution pathways.", "AI analysis failed or hit rate limit."}

with open(PATH) as f:
    data = json.load(f)

labels = {n["id"]: n["label"] for n in data["nodes"]}
callees, callers = {}, {}
for e in data["edges"]:
    callees.setdefault(e["source"], []).append(labels[e["target"]])
    callers.setdefault(e["target"], []).append(labels[e["source"]])

def ask(prompt):
    for attempt in range(3):
        try:
            return client.models.generate_content(model=MODEL, contents=prompt).text.strip()
        except Exception as ex:
            print(f"    retry {attempt + 1}/3: {ex}")
            time.sleep(2 * (attempt + 1))
    return None

todo = [n for n in data["nodes"] if n.get("summary") in PLACEHOLDERS]
print(f"[*] {len(todo)} of {len(data['nodes'])} nodes need summaries (model: {MODEL})")
if client and any(n.get("type") != "import" for n in todo):
    try:
        client.models.generate_content(model=MODEL, contents="Reply with OK")
    except Exception as ex:
        print(f"[!] Gemini preflight failed (bad key, or wrong model '{MODEL}'?): {ex}")
        print("[!] Continuing without AI explanations.")
        client = None


try:
    for i, node in enumerate(todo, 1):
        name = node["label"]
        if node.get("type") == "import":
            node["summary"] = LIBC.get(name, GENERIC_IMPORT)
            continue
        if client is None:
            continue
        prompt = (
            "You are teaching a beginner who is learning reverse engineering. Below is one function "
            "decompiled by Ghidra (variable names like param_1 / iVar1 are auto-generated).\n"
            "In 2-3 plain sentences, explain what it does and its role in the program. "
            "Then add one line starting with 'Look for:' pointing at the most telling detail in the code. "
            "Define any jargon briefly. No code blocks, no markdown, no preamble.\n\n"
            f"Function: {name}\n"
            f"Called by: {', '.join(callers.get(node['id'], [])) or 'nothing in this graph'}\n"
            f"Calls: {', '.join(callees.get(node['id'], [])) or 'nothing'}\n"
            f"Decompiled C:\n{node.get('decompiled', '')}"
        )
        text = ask(prompt)
        node["summary"] = text or "AI analysis failed or hit rate limit."
        print(f"[{i}/{len(todo)}] {'ok ' if text else 'FAIL'} {name}")
        time.sleep(0.4)
finally:
    with open(PATH, "w") as f:
        json.dump(data, f, indent=2)
    print(f"[+] Saved {PATH}")
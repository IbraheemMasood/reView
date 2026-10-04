# reView

A local reverse-engineering tool for compiled binaries.

reView takes a binary, analyzes its structure with Ghidra, records execution traces with gdb, and opens an interactive browser-based call graph so you can inspect what the program does, which functions matter, and how data flows through the code.

It is designed for reverse-engineering beginners and security-minded users who want a faster, more visual way to understand a binary before diving into raw assembly or decompiled code.

## Why use reView?

When you have a compiled program and want to understand it quickly, the usual path is:

- open it in a disassembler or decompiler
- identify `main` and the interesting functions
- trace execution by hand
- infer what the program checks and rejects

reView automates the first half of that workflow and presents the result in a navigable graph.

## Features

- Ghidra-powered call graph export from a binary
- Decompiler output for each function in the browser UI
- Execution trace playback with gdb
- Detection of interesting functions and risky API usage
- Optional AI-assisted summaries using Gemini (via `google-genai`)
- Optional live tracing mode where the browser can run the binary with typed args or stdin
- Static HTML/JS viewer served locally from the generated output directory
- Docker support for a ready-to-run environment

## How it works

The workflow is:

1. You point `review.py` at a compiled binary.
2. It verifies the binary looks like an executable.
3. It locates a Ghidra install and runs the export script.
4. Ghidra produces a `graph.json` describing functions and calls.
5. Optionally, `trace_run.py` traces the program under gdb and records execution events.
6. Optional AI enrichment adds summaries for important functions.
7. The project serves a local viewer that renders the graph and lets you inspect the execution flow.

## Requirements

You need:

- Python 3
- Ghidra installed and on your system, or a containerized setup
- gdb on Linux x86-64 systems
- Java (Ghidra requires a JDK)
- Optional: a Gemini API key for AI-generated summaries

Supported environment assumptions from the project:

- Linux x86-64 is the main target for live tracing
- `trace_run.py` specifically expects gdb and runtime execution support

## Installation

Clone the repository:

```bash
git clone https://github.com/IbraheemMasood/reView.git
cd reView
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Then make sure Ghidra and gdb are installed and available on your PATH, or configure them via environment variables or command-line flags.

## Quickstart

Analyze a binary:

```bash
python3 review.py ./mybinary
```

This will generate output under `reView-out/<binary>/` and serve the viewer locally.

If the project is already prepared and you want to skip opening a browser automatically, use:

```bash
python3 review.py ./mybinary --no-open
```

To force a rebuild of the graph and traces:

```bash
python3 review.py ./mybinary --force
```

To skip AI summary generation:

```bash
python3 review.py ./mybinary --no-ai
```

To skip tracing entirely:

```bash
python3 review.py ./mybinary --no-trace
```

## Live tracing

reView supports a live mode with a browser-based input panel:

```bash
python3 review.py ./mybinary --live
```

This enables the viewer to execute the binary on demand with either:

- command-line arguments (`--args` style)
- stdin input (`stdin` style)

The application runs the binary under gdb and animates the trace through the graph in real time.

Important: live execution is intentionally guarded. The tool requires confirmation before running the target binary and warns against running untrusted software without a sandbox or VM.

## Environment variables

The project uses these environment variables in the normal flow:

- `GHIDRA_INSTALL_DIR` — optional path to the Ghidra installation
- `GEMINI_API_KEY` — used for AI explanations when enabled
- `REVIEW_OUT` — output folder override
- `REVIEW_HOST` — host for the local viewer
- `REVIEW_SANDBOX` — used to detect sandboxed execution envs

## Docker

A Docker image is included for a ready-made environment with Ghidra, gdb, and Python already installed.

Build:

```bash
docker build -t reView .
```

Run against a binary:

```bash
docker run --rm -p 8000:8000 -v /path/to/binary:/tmp/binary reView /tmp/binary
```

The container sets the default host to `0.0.0.0` and exposes port `8000`.

## Project structure

```text
.
├── build/                  # sample build artifacts and test binaries
├── ghidra_scripts/        # Ghidra export script
├── programs/              # sample binaries used for demonstration
├── reView-out/            # generated outputs per analyzed binary
├── viewer/                # browser UI files (HTML/CSS/JS)
├── Dockerfile             # container definition
├── enrich_summaries.py    # adds AI summaries to graph data
├── requirements.txt      # Python dependencies
├── review.py              # main CLI and orchestration entry point
├── trace_run.py           # records real execution traces with gdb
└── README.md              # project overview and usage docs
```

## Safety notes

This project executes binaries and can introspect live program state.

- Use it only on binaries you trust or on isolated systems / VMs.
- The project warns when it is about to execute code and does not assume the binary is harmless.
- The tracing step runs the target under gdb, which is inherently sensitive and should be used carefully.

## Typical workflow

A common usage flow is:

```bash
python3 review.py ./challenge.bin --live --host 127.0.0.1 --port 8000
```

Then:

- inspect the graph for function relationships
- click interesting functions in the sidebar
- read decompiler output and AI explanations
- replay the trace and inspect inputs/returns
- identify important decision points like validation, hashing, branching, and access checks

## Acknowledgements

This project depends on:

- Ghidra for program analysis and decompilation
- gdb for runtime tracing
- Cytoscape and Dagre for the interactive graph UI
- Gemini AI via `google-genai` for optional summary generation






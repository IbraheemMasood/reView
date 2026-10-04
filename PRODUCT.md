# reView

<!-- impeccable:product-schema 1 -->

## Platform

web

## Product Purpose

Make compiled binaries understandable through interactive call graphs, decompiled C, and execution trace playback. Source: README.md and the existing viewer.

## Users

Reverse-engineering beginners and security-minded users inspecting a binary. This redesign also supports a visually compelling hackathon demonstration, as requested by the operator.

## Capabilities and Constraints

Keep the Python, Ghidra, and gdb backend unchanged. Preserve graph JSON, function renaming, recorded and simulated trace playback, optional live tracing, and the existing live API contract. The backend copies only index.html, styles.css, and app.js into the generated output directory, so runtime visuals must remain self-contained in these files.

## Design authorization

The operator delegated creative frontend decisions and requested branch codex-redesign and a PR with extensive screenshots. No new backend capabilities or fabricated analysis results are part of this work.

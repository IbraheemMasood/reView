# Frontend redesign

## Scope

Branch: codex-redesign. Base: master. Redesign viewer only, keep backend and graph data unchanged. Deliver a fork PR to IbraheemMasood/reView with before/after screenshots and deployed preview verification.

## Checkpoints

- Clean checkout inspected; branch created.
- Existing contracts and sample data audited by frontend_audit.
- Baseline served at localhost:8765 and captured.
- Chrome browser-only API connected. Legacy chrome skill unavailable in installed skill roots; current browser-use documentation is supplied by the Chrome plugin.
- Visual shell delegated to visual_shell; delivery discovery delegated to delivery_research.

## Direction contract

THESIS: A precision analysis desk that makes a binary's actual structure the visual centerpiece.

OWN-WORLD: Charcoal canvas, mint entry and execution state, muted lavender library imports, coral interest indicators. Host Grotesk for the interface and Martian Mono for code and addresses. Thin rules, confident spacing, restrained elevation.

STORY: Locate a function, follow its relationships, inspect its C, and play recorded or explicitly labelled simulated execution.

FIRST VIEWPORT: Brand and dataset header above a function navigator, large live graph, and open inspector. Trace launch is visible above the canvas; execution timeline opens below it. Real graph counts only.

FORM: Operate workbench. Code-led implementation under the user's creative delegation. Signature motion follows actual calls and returns through the graph, supported by subtle panel reveals and reduced-motion preferences.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Verification and delivery

- Completed the new visual system, desktop explorer, mobile dialogs, search/filter controls, source inspector, and animated trace camera.
- Automated viewer tests: 11 passed. JavaScript syntax and git whitespace checks passed.
- Browser-tested import, filtering, search/Enter, function selection, decompiled source, persistent rename/reload/restore, trace controls, successful simulation, zoom/fit, and reduced motion.
- Responsive checks covered 320, 375, 390, 414, 768, and 1440 CSS pixels with no document overflow.
- Final public demo assets match local SHA-256 hashes. Demo: https://review-redesign-demo.vercel.app/keychecker/.
- Final visual reviewer verdict: SHIP. Active trace node stays readable at 100 percent and legend overlap is fixed.
- Backend Python, graph datasets, API contracts, and the three-file viewer copy contract remain unchanged. Real GDB execution was not run on this Windows host; the live API request contract is covered by tests.
- Design system documented in DESIGN.md and .impeccable/design.json. Native SVG/CSS/canvas visuals only; screenshots are actual Chrome captures with before/after provenance in docs/UI_REDESIGN.md.
- Dedicated preview project is intentionally retained for PR review. Exact ownership and teardown are documented in preview-redesign.md.
- Browser verification tab closed, viewport overrides restored, temporary HTTP servers stopped, and local preview staging removed.
- Published and attached https://github.com/IbraheemMasood/reView/pull/2 from NathanPannell:codex-redesign to upstream master. PR is open and mergeable, with 19 screenshots. Implementation commit: 419255e151639ee4d5c85d59203361c953e8702f.

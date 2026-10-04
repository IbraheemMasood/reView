# Control and hierarchy refinement

## Scope

Preserve the approved charcoal/mint identity. Remove Import graph and the canvas headline, use larger controls and clearer type hierarchy, move inspector controls beside the inspector, cover the full graph with its background, and fix control behavior and graph position instability. Backend remains unchanged.

## Trace of the previous delivery

The initial full graph used horizontal layout on desktop, while incremental node placement used vertical coordinates. The earlier tests and screenshots did not cover a collapse/reopen sequence. Toolbar label updates replaced the complete button content and erased icons. An unconditional listener on the hidden import input could abort initialization when that markup was removed. The prior visual review did not catch these state transitions.

Added focused repository AGENTS.md checks for stable graph transitions and observable control outcomes, including initialization with removed optional markup. No global instructions were changed.

## Work

- Branch: codex/ui-control-refinement from origin/master, following merged PR #2.
- Source interaction audit complete; graph/control implementation and visual refinement delegated separately.
- Baseline capture saved in docs/screenshots/refinement.
- Pending: regression tests, deployed control matrix, desktop/mobile evidence, follow-up PR.

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
- Regression suite: 20/20 passed, including optional import markup removal, stable coordinates and direction, button child preservation, active trace visibility guards, and first Step after Reset.
- Final implementation: 92b2dad289e3486ab08a10fec8ff0d1f2d05bf22. Dedicated demo alias is hash-verified against all three viewer files and unchanged graph JSON.
- Chrome verified exact node coordinates through Show all/Hide all/Show all, graph click collapse/reopen, background deselection, and address search. Zoom, Fit, all filters, inspector toggle/close, path and connection links, source disclosure, trace Pause/Step/Reset/speed/Follow/Close all produced the expected results.
- Final simulated trace completed 23/23 events with ACCESS GRANTED. Trace graph visibility controls correctly disable until Reset or Close; first Step after Reset advances one event.
- Desktop inspector toggle is 20px from the inspector boundary. Final 1280x720 trace controls stay within canvas bounds. Mobile 390px and 320px layouts have no horizontal overflow; toolbar buttons are 44px tall. Mobile inspector focus and Escape dismissal passed.
- Browser errors were Chrome-extension message-channel errors already present in baseline; the optional live-config endpoint returns the expected 404 on the static demo. No backend service was deployed or modified.
- Browser test tab closed and viewport/media/cache overrides reset. Before/after captures are in docs/screenshots/refinement.
- Final independent visual verdict: SHIP across six final desktop/mobile captures. Thirteen review images are retained, including cropped before/after details.
- Remaining delivery: follow-up PR publication.

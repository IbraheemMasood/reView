# Control and hierarchy refinement

This follow-up preserves the approved charcoal and mint design while correcting interaction defects and making the workspace easier to operate.

## Changes

- Removed Import graph and the promotional canvas headline. Graph controls occupy the released toolbar space.
- Moved the inspector toggle to the graph's right edge, beside the inspector. The inspector also has a close control on desktop.
- Enlarged controls and strengthened the hierarchy between function names, section titles, explanations, and technical metadata. Missing summaries no longer occupy a large placeholder card.
- Added a full-canvas gradient behind the dot grid. The entrance sweep is a separate effect.
- Kept graph orientation and node coordinates stable across collapse/reopen, selection, search, Show all, and trace startup. Explicit Reset is the operation that rebuilds the layout.
- Preserved button icons during label changes, explained unavailable traces, and kept Pause usable during an animated step.

The original failure combined a horizontal initial graph layout with vertical incremental placement. The previous automated checks did not cover the full collapse/reopen journey. New regression tests and repository-specific review instructions cover that gap and startup after optional control markup is removed.

## Evidence

Before and after screenshots and the deployed control-check results are recorded with the follow-up pull request. The original redesign gallery remains in [UI_REDESIGN.md](UI_REDESIGN.md).

The Python backend, analysis pipeline, graph datasets, and viewer copy contract are unchanged. Live GDB execution requires the original backend; the static review demo supports recorded and simulated traces.

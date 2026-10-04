# Viewer changes

- Preserve node positions and graph orientation across selection, collapse/reopen, search, and panel toggles. Verify these sequences in the real browser, not only the initial graph screenshot or mocked layout calls.
- For every visible control, verify its observable result and disabled state. Re-test initialization after removing a control or its related markup; optional controls must not prevent the rest of the interface from binding.
- Keep the Python backend, graph data, and viewer three-file copy contract intact for frontend-only requests.

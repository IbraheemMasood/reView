# Header refinement

- Request: remove inaccurate inferred binary name, retain Functions, Call edges, and Traces.
- Cause: frontend derived identity from the hosting path instead of authoritative graph metadata. Removed the inference and identity markup; retained the graph counts and alignment.
- Added a focused repository instruction for authoritative binary identity. Backend and graph data unchanged.
- Branch: codex/remove-inferred-binary-name, from origin/master after PR #4 merged.
- Validation: JavaScript syntax and all 20 existing viewer regression tests pass.
- Deployed revision: 9d698ababc5e5f8097e2be98bdc5d638da0b5d0f. Chrome verified Functions 18, Call edges 18, Traces 3, no binaryName element, and no horizontal overflow at 390px. No captured console errors. Desktop/mobile cropped before and after screenshots retained. Browser viewport reset and test tabs closed.
- Preview retained for PR review at https://review-redesign-demo.vercel.app/keychecker/.

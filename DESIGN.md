---
name: reView Analysis Desk
description: A graph-led workbench for reading compiled binaries.
colors:
  background: "#111513"
  surface-0: "#141a17"
  surface-1: "#191f1c"
  surface-2: "#202723"
  surface-raised: "#252d28"
  border: "#303a34"
  border-soft: "#26302a"
  text: "#e8eee9"
  text-soft: "#c0cbc4"
  text-muted: "#9aa89f"
  text-faint: "#75847a"
  accent: "#bdebd8"
  accent-soft: "#253e33"
  accent-dim: "#7db69c"
  node: "#202a25"
  edge: "#526158"
  import: "#c8b4df"
  import-soft: "#322b39"
  risk: "#ef927e"
  risk-soft: "#422925"
typography:
  display:
    fontFamily: '"Host Grotesk", ui-sans-serif, system-ui, sans-serif'
    fontSize: "22px"
    fontWeight: 660
    lineHeight: 1.13
    letterSpacing: "-0.03em"
  title:
    fontFamily: '"Host Grotesk", ui-sans-serif, system-ui, sans-serif'
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  body:
    fontFamily: '"Host Grotesk", ui-sans-serif, system-ui, sans-serif'
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  reading:
    fontFamily: '"Host Grotesk", ui-sans-serif, system-ui, sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: '"Host Grotesk", ui-sans-serif, system-ui, sans-serif'
    fontSize: "13px"
    fontWeight: 650
    lineHeight: 1.35
  code:
    fontFamily: '"Martian Mono", ui-monospace, SFMono-Regular, Menlo, monospace'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.7
  identity:
    fontFamily: '"Martian Mono", ui-monospace, SFMono-Regular, Menlo, monospace'
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.18
rounded:
  sm: "4px"
  control: "5px"
  md: "6px"
  panel: "7px"
  lg: "8px"
spacing:
  tight: "4px"
  compact: "8px"
  inset: "12px"
  panel: "16px"
  gutter: "24px"
components:
  button-trace:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface-1}"
    rounded: "{rounded.control}"
    padding: "0 13px"
    height: "44px"
  button-quiet:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-soft}"
    rounded: "{rounded.panel}"
    padding: "0 13px"
    height: "44px"
  button-toolbar:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-soft}"
    rounded: "{rounded.control}"
    padding: "0 13px"
    height: "44px"
  input-search:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 11px"
    height: "44px"
  function-row:
    backgroundColor: "transparent"
    textColor: "{colors.text-soft}"
    rounded: "{rounded.control}"
    padding: "7px 10px"
    height: "40px"
  inspector-section:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-soft}"
    rounded: "{rounded.panel}"
    padding: "12px"
  connection-chip:
    backgroundColor: "{colors.node}"
    textColor: "{colors.accent}"
    rounded: "{rounded.sm}"
    padding: "5px 7px"
  graph-canvas:
    backgroundColor: "{colors.background}"
    width: "100%"
    height: "100%"
---

# Design System: reView Analysis Desk

## Overview

**Creative North Star: “The Precision Analysis Desk”**

The interface is a focused tool for following a binary's real structure. The call graph owns the center; the function navigator and inspector keep search, context, and decompiled output close at hand. A brand masthead and separate dataset strip sit above the workbench. Graph actions stay at the left of the canvas toolbar, with the inspector toggle at its right edge. The visible “Call graph” heading is screenreader-only.

Use thin dividers and restrained shadows to separate working regions. Mint marks entry points and active execution, lavender marks imported libraries, and coral marks functions worth inspection. The graph canvas carries a translucent forest-to-plum wash over its dotted field. The viewer's runtime palette stays in `viewer/styles.css` because the backend ships that file with `index.html` and `app.js`; `tokens.css` is a portable reference export only.

**Key Characteristics:**
- Graph-first, three-region workbench
- Tinted charcoal surfaces with fine rules
- Color distinguishes entry, import, and interest states

## Colors

The palette is a low-glare green-charcoal base with mint activity and two distinct semantic accents. A restrained forest-to-plum gradient spans the graph canvas without changing the semantic node colors.

### Primary
- **Execution Mint** (`{colors.accent}`): Entry nodes, selected graph nodes, call paths, trace controls, code emphasis, and focus indicators.

### Secondary
- **Library Lavender** (`{colors.import}`): Imported function nodes and their navigator markers.

### Tertiary
- **Interest Coral** (`{colors.risk}`): Functions flagged for closer inspection and relevant warning states.

### Neutral
- **Charcoal Canvas** (`{colors.background}`): Main application and graph canvas.
- **Raised Charcoal Surfaces** (`{colors.surface-0}`, `{colors.surface-1}`, `{colors.surface-2}`, `{colors.surface-raised}`): Header, navigator, inspector, trace panels, and nested sections.
- **Soft Rules** (`{colors.border}`, `{colors.border-soft}`): Panel edges and separators.
- **Cool-Mint Text** (`{colors.text}`, `{colors.text-soft}`, `{colors.text-muted}`, `{colors.text-faint}`): Primary copy through secondary labels and quiet status marks.
- **Graph Node and Edge** (`{colors.node}`, `{colors.edge}`): Ordinary functions and call links.

**The State-Color Rule.** Keep each graph state legible through its assigned accent: mint for entry and execution, lavender for imports, coral for interest.

## Typography

**Display Font:** Host Grotesk (with ui-sans-serif, system-ui, sans-serif fallbacks)

**Body Font:** Host Grotesk (with ui-sans-serif, system-ui, sans-serif fallbacks)
**Technical Font:** Martian Mono (with ui-monospace, SFMono-Regular, Menlo, monospace fallbacks)

**Character:** Host Grotesk carries the interface and readable explanations. Martian Mono gives addresses, large editable function identities, counts, and code a precise technical register.

### Hierarchy
- **Display** (`{typography.display}`): Inspector welcome heading.
- **Title** (`{typography.title}`): Product wordmark.
- **Reading** (`{typography.reading}`): Inspector explanations, summaries, and section content.
- **Body and labels** (`{typography.body}`, `{typography.label}`): Dataset details, controls, filters, and status copy. Quiet metadata may step down to 11px or 12px.
- **Code and identity** (`{typography.code}`, `{typography.identity}`): Decompiled output and technical values, with editable function identity set in the larger mono style.

## Layout

At wide desktop sizes, the app uses a 72px brand masthead, a 48px dataset strip, then a flexible workspace with a 280px navigator, a fluid graph canvas, and a 360px inspector. The canvas toolbar places graph actions on the left and the inspector toggle at the right edge. At 1220px the navigator narrows to 240px and the inspector to 336px. Below 1100px the graph becomes the sole workspace column, with the navigator and inspector opening as overlays. At 680px the masthead and toolbar compact for touch, the controls align in a two-column row, and the inspector toggle becomes icon-only. The optional trace panel occupies up to 300px or 40vh on desktop and up to 250px or 32vh on small screens, shrinking further on short viewports.

The spacing is dense and deliberate. Repeated tight and generous insets organize controls and panel interiors, with one-pixel rules marking boundaries. Keep the graph flexible and preserve the surrounding navigator and inspector relationship at wide sizes.

## Elevation & Depth

Most panels are flat, separated by tinted surfaces and one-pixel borders. Shallow shadows lift graph tool overlays; stronger shadows appear only when the navigator or inspector becomes a narrow-screen drawer. Focus is shown with a clear outline rather than a glow.

### Shadow Vocabulary
- **Graph overlay** (`0 3px 9px rgb(0 0 0 / 17%)`): Legend and zoom controls above the canvas.
- **Tooltip** (`0 7px 18px rgb(0 0 0 / 28%)`): Hover detail over a graph node.
- **Drawer** (`9px 14px 28px rgb(0 0 0 / 36%)`, `0 16px 38px rgb(0 0 0 / 38%)`): Navigator and inspector overlays on narrow screens.

## Shapes

Controls and chips use compact `{rounded.sm}` to `{rounded.md}` corners; inspector sections and the toggle reach `{rounded.panel}`. Dividers stay thin and square to keep the graph and code feeling like working instruments. Circular status marks remain small and semantic.

## Components

### Buttons
- **Shape:** Gently rounded controls using the small, control, and panel corner tokens.
- **Graph actions:** Surface-filled with a fine border and soft text; hover shifts the border and surface toward the graph edge colors.
- **Inspector toggle:** Sits at the right edge of the graph toolbar beside the graph actions, with glyph and label on wide screens. It becomes a 44px icon-only control at 680px and below.
- **Trace launch:** Mint-filled, 44px control; press moves it down by 1px.
- **Focus:** Keyboard-focusable controls use a 2px accent-dim outline with a 2px offset. The search wrapper brightens its border when focused.

### Chips
- **Function type:** Monospaced uppercase text on a soft bordered surface.
- **Connections and paths:** Mint monospaced text on node charcoal, with 4px corners and compact padding.
- **Interest:** A small coral dot marks a function in the navigator and toolbar.

### Cards / Containers
- **Corner Style:** Inspector sections use 7px corners; trace and workspace regions use borders rather than large card silhouettes.
- **Background:** Adjacent charcoal tones distinguish the canvas, panels, and raised sections.
- **Border:** Thin muted rules define panel edges and section boundaries.
- **Internal Padding:** Common insets are 11px to 17px in the inspector and 12px to 14px in trace content.

### Inputs / Fields
- **Style:** Dark canvas fill, muted border, `{rounded.md}` corners, and a 44px search field.
- **Focus:** The search wrapper lightens its border while focused. The input itself suppresses its outline, so the wrapper supplies the visible focus change.
- **Trace values:** Use Martian Mono to keep filenames and program input visually distinct from labels.

### Navigation
- **Desktop:** A 280px function list with a larger search field and four filters; rows use monospaced names and a 40px minimum height.
- **Selected row:** Muted tinted fill with an edge-colored border; entry and import markers retain their semantic colors.
- **Narrow screens:** The navigator is a left drawer with a dark scrim, close control, dialog semantics, and a keyboard focus loop below 1100px. Search, filter, and function-row controls are built for touch.

### Graph and Trace
- **Graph:** A fine 24px dot grid sits behind a full-canvas 135-degree wash, from translucent forest green through charcoal to plum. Rounded function nodes and directional edges use the existing semantic palette. Nodes use 176px by 48px boxes with 12px labels on desktop. Below 600px they use 132px by 48px boxes with 12px labels; layout switches from left-to-right to top-to-bottom with 20px padding. Incremental expansion follows the chosen axis and cached coordinates preserve user placements and collapsed nodes.
- **Trace:** Playback opens a panel below the graph with a scrolling event log and a separate call-stack column. Opening it hides the canvas legend. While a trace is active, tapping a node updates the inspector without expanding or collapsing the graph. Active execution is shown in mint and follows recorded events; Follow node centers the active node at a minimum zoom of 1.0 on desktop and 0.85 below 600px, and recenters it when the canvas resizes.
- **Motion:** The canvas sweep runs once for 1.35s; the active trace indicator pulses every 1.2s. Graph camera movements animate while node layout and incremental placement remain still. `prefers-reduced-motion` shortens CSS motion and removes camera animation; trace-token movement drops to 1ms.

## Do's and Don'ts

### Do:
- **Do** preserve the mint, lavender, and coral meaning across graph nodes, navigator markers, and trace states.
- **Do** use fine borders and nearby surface tones to separate work areas.
- **Do** keep technical values and decompiled code in Martian Mono.
- **Do** retain the compact desktop columns and switch them to drawers at 1100px.
- **Do** honor reduced-motion preferences for CSS and graph animation.

### Don't:
- **Don't** make entry, import, execution, and interest states share one accent color.
- **Don't** replace the flexible graph canvas with a fixed-width content panel.
- **Don't** introduce heavy shadows to the resting workbench panels.

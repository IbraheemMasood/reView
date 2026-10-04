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
    fontSize: "24px"
    fontWeight: 640
    lineHeight: 1.12
    letterSpacing: "-0.035em"
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
  label:
    fontFamily: '"Host Grotesk", ui-sans-serif, system-ui, sans-serif'
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.04em"
  code:
    fontFamily: '"Martian Mono", ui-monospace, SFMono-Regular, Menlo, monospace'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.65
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
  button-import:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface-1}"
    rounded: "{rounded.panel}"
    padding: "0 13px"
    height: "38px"
  button-quiet:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-soft}"
    rounded: "{rounded.panel}"
    padding: "0 13px"
    height: "38px"
  input-search:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 9px"
    height: "36px"
  function-row:
    backgroundColor: "transparent"
    textColor: "{colors.text-soft}"
    rounded: "{rounded.control}"
    padding: "6px 9px"
    height: "36px"
  inspector-section:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text-soft}"
    rounded: "{rounded.panel}"
    padding: "11px"
  connection-chip:
    backgroundColor: "{colors.node}"
    textColor: "{colors.accent}"
    rounded: "{rounded.sm}"
    padding: "4px 6px"
---

# Design System: reView Analysis Desk

## Overview

**Creative North Star: “The Precision Analysis Desk”**

The interface is a focused tool for following a binary's real structure. The call graph owns the center; the function navigator and inspector keep search, context, and decompiled output close at hand. Charcoal surfaces make dense labels readable while color carries graph meaning.

Use thin dividers and restrained shadows to separate working regions. Mint marks entry points and active execution, lavender marks imported libraries, and coral marks functions worth inspection. The viewer's runtime palette stays in `viewer/styles.css` because the backend ships that file with `index.html` and `app.js`; `tokens.css` is a portable reference export only.

**Key Characteristics:**
- Graph-first, three-region workbench
- Tinted charcoal surfaces with fine rules
- Color distinguishes entry, import, and interest states

## Colors

The palette is a low-glare green-charcoal base with mint activity and two distinct semantic accents.

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
**Label/Mono Font:** Martian Mono (with ui-monospace, SFMono-Regular, Menlo, monospace fallbacks)

**Character:** Host Grotesk keeps controls and explanations compact and calm. Martian Mono gives addresses, function names, counts, and code a precise technical register.

### Hierarchy
- **Display** (weight 640, 24px, line-height 1.12): Main canvas heading.
- **Title** (weight 700, 17px, line-height 1.05): Product wordmark and compact workbench headings.
- **Body** (weight 400, 13px, line-height 1.45): Explanations and inspector content.
- **Label** (weight 600, 11px, line-height 1.3, slight tracking): Counts, filters, status, and compact control labels.
- **Code** (weight 400, 12px, line-height 1.65): Decompiled output and technical values; function names and addresses commonly use 11px or 12px.

## Layout

At wide desktop sizes, the app uses a fixed 72px masthead, a 48px dataset strip, then a flexible workspace with a 240px navigator, a fluid graph canvas, and a 360px inspector. At 1220px the side columns narrow to 222px and 336px; the inspector narrows to 320px at 1080px. At 1100px the graph becomes the sole workspace column, with the navigator and inspector opening as overlays. At 680px the masthead, toolbar, trace controls, and graph legend compact for touch; at 390px labels and decorative controls are further reduced. The optional trace panel occupies up to 320px or 42vh on desktop and up to 270px or 42vh on small screens.

The spacing is dense and deliberate. Repeated 4px, 8px, 12px, 16px, and 24px gaps and insets organize controls and panel interiors, with one-pixel rules marking boundaries. Keep the graph flexible and preserve the surrounding navigator and inspector relationship at wide sizes.

## Elevation & Depth

Most panels are flat, separated by tinted surfaces and one-pixel borders. Shallow shadows lift graph tool overlays; stronger shadows appear only when the navigator or inspector becomes a narrow-screen drawer. Focus is shown with a clear outline rather than a glow.

### Shadow Vocabulary
- **Graph overlay** (`0 3px 9px rgb(0 0 0 / 17%)`): Legend and zoom controls above the canvas.
- **Tooltip** (`0 7px 18px rgb(0 0 0 / 28%)`): Hover detail over a graph node.
- **Drawer** (`9px 14px 28px rgb(0 0 0 / 36%)`, `0 16px 38px rgb(0 0 0 / 38%)`): Navigator and inspector overlays on narrow screens.

## Shapes

Controls and chips use compact 4px to 6px corners; inspector sections and masthead actions reach 7px, while the scrollbar thumb uses 8px. Dividers stay thin and square to keep the graph and code feeling like working instruments. Circular status marks remain small and semantic.

## Components

### Buttons
- **Shape:** Gently rounded controls (4px to 7px).
- **Import:** Mint filled, dark text, 38px tall, with 13px horizontal padding.
- **Quiet actions:** Surface-filled with a fine border and soft text; hover shifts the border and surface toward the graph edge colors.
- **Trace launch:** Mint filled, 32px tall on desktop; press moves it down by 1px.
- **Focus:** Keyboard-focusable controls use a 2px accent-dim outline with a 2px offset. The search wrapper also brightens its border while focused.

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
- **Style:** Dark canvas fill, muted border, 5px to 6px corners, and 32px to 36px heights.
- **Focus:** Search container lightens its border; keyboard focus receives the shared visible outline.
- **Trace values:** Use Martian Mono to keep filenames and program input visually distinct from labels.

### Navigation
- **Desktop:** A 240px function list with search and four compact filters; rows use monospaced names and a 36px minimum height.
- **Selected row:** Muted tinted fill with an edge-colored border; entry and import markers retain their semantic colors.
- **Narrow screens:** The navigator is a left drawer with a dark scrim, close control, dialog semantics, and a keyboard focus loop below 1100px. Touch rows and controls gain 40px minimum targets at 680px.

### Graph and Trace
- **Graph:** A fine 24px dot grid sits behind rounded function nodes and directional call edges. Nodes use 176px by 48px boxes with 12px labels on desktop. Below 600px they use 132px by 48px boxes, 12px labels, and a 20px Dagre padding value; layout direction changes from left-to-right to top-to-bottom. The graph remains the largest flexible region.
- **Trace:** Playback opens a panel below the graph with a scrolling event log and a separate call-stack column. Opening it hides the canvas legend. Active execution is shown in mint and follows recorded events; Follow node centers the active node while keeping at least 1.0 zoom on desktop and 0.85 on narrow screens.
- **Motion:** Short control transitions support state changes. The entry sweep runs for 1.35s, the active trace indicator pulses every 1.2s, and graph layout and camera movements animate. `prefers-reduced-motion` shortens CSS motion; graph navigation and layout helpers use zero duration, while trace-token movement uses 1ms.

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

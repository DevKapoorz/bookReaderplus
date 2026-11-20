# 📖 Flipbook Reader ++

An exceptionally beautiful, tactile, and simple canvas-based flipbook web application feeling just like a real physical book.

---

## ✨ Features

- **Realistic Book Aesthetics & Canvas Physics**:
    - Genuine paper texture, 3D cylindrical curling with front & reverse page rendering.
    - Multi-layer fore-edge paper stack depth showing physical book thickness.
    - Center spine gutter shadow (ambient occlusion) and realistic drop shadows.
    - Web Audio synthesized page rustle sound on every page flip.
- **Cover Page Logic**:
    - **Page 1 is single** (Front Cover) displayed centered like a closed volume.
    - Flipping the cover opens into a **Two-Page Spread** (Pages 2 & 3).
    - Subsequent pages display in natural 2-page reading spreads.
- **Selectable Text & In-Book Search (No OCR)**:
    - **Native Vector Text Selection**: Select and copy text directly from the book pages with mouse or keyboard with high precision.
    - **Clickable PDF Links**: Embedded URLs open securely in a new browser tab; internal document links (jumping to specific pages) smoothly turn the flipbook to that page.
    - **In-Book Search (<kbd>Ctrl + F</kbd>)**: Floating search overlay with live match counts, prev/next match navigation, and glowing active search highlights across all pages.
- **Controls & Navigation**:
    - **Drag & Swipe**: Grab any page corner or edge to peel the page dynamically with the mouse/touch pointer. Releasing past the threshold flips the page; fast flick swipe also turns.
    - **Highly Transparent Buttons on Left & Right Extremes**: Discrete translucent buttons on the outer borders that gently glow on hover to turn pages forward/backward.
    - **Small Circle with Three Dots (`•••`)**: Floating circular button; hovering or clicking opens the options palette.
    - **Pinch-to-Zoom**: Multi-touch two-finger pinch zoom, plus mouse wheel zoom (with `Ctrl`/`Alt` or trackpad pinch) and smooth pan.
- **Options Palette (Hovering over 3-Dots Circle)**:
    - 🖊️ **Annotate**: Freehand smooth pen drawing.
    - 🖍️ **Highlighter**: Translucent highlighter marker.
    - 🔤 **Text Write**: Click directly on any page to place typed sticky notes.
    - ⭕ **Ellipse**: Precision vector ellipse tool.
    - ▢ **Rectangle**: Precision vector rectangle tool.
    - 🎨 **Palette**: Luxury colors (Crimson, Cobalt Blue, Emerald, Amber Gold, Amethyst, White).
    - 📏 **Stroke Width**: Fine (2px), Medium (4px), Bold (8px).
    - 🧽 **Eraser / Undo / Redo / Clear Page**.
- **LocalStorage Persistence**:
    - Annotations are automatically saved to `localStorage` keyed by document ID.
    - Reading progress is remembered: reopening a PDF resumes automatically at your last read page.
    - Theme preference (Dark Reading Mode / Light Archival Mode) is saved and restored automatically on return.
    - Zoom scale is saved and restored automatically across visits.
    - Page view mode (Two-Page Spread View / Single Page View) is saved and restored automatically on return.
    - Page color inversion state (`inverser: true`) is saved and restored automatically on return.
- **Onboarding Drop Area**:
    - Clean landing page with an interactive drag-and-drop zone and file picker.
    - Fast 100% client-side PDF rendering with PDF.js.

---

## ⌨️ Keyboard Shortcuts

| Shortcut                         | Action                                        |
| :------------------------------- | :-------------------------------------------- |
| `→` / `Space` / `Page Down`      | Next Page                                     |
| `←` / `Page Up`                  | Previous Page                                 |
| `D`                              | Toggle Dark Mode / Light Mode                 |
| `I`                              | Toggle Invert Page Colors (Inverser)          |
| `V`                              | Toggle 1-Page / 2-Page View                   |
| `Ctrl + F` / `Cmd + F`           | Search Document                               |
| `Ctrl + Z`                       | Undo Annotation                               |
| `Ctrl + Y` or `Ctrl + Shift + Z` | Redo Annotation                               |
| `+` / `-`                        | Zoom In / Out                                 |
| `Ctrl + 0`                       | Reset Zoom to 100%                            |
| `Ctrl + Wheel` / `Pinch`         | Zoom In / Out                                 |
| `Esc`                            | Return to Reading Mode (Deselect active tool) |

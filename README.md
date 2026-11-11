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
- **Session Annotations**:
    - Annotations are kept cleanly in memory outside the PDF file itself without altering the original document.
    - Undo and Redo stacks for fast editing during reading.
- **View & Theme Modes**:
    - **Dark Mode by default** (custom radial ambient lighting and eye-friendly dark paper mode).
    - **Two-Page View by default** with toggle for One-Page View.
    - Smooth animated transitions between modes.
- **Document Support**:
    - Comes with a built-in 12-page illustrated classic book (_The Art of Reading: A Bibliophile's Compendium_), complete with title plate, table of contents, diagrams, engravings, quotes, and colophon.
    - **Open Any PDF**: Click the PDF button or drag and drop any PDF file anywhere onto the book to render and read in the flipbook!

---

## 🚀 How to Run

Simply open `index.html` directly in any modern browser, or serve it with any static web server (such as Live Server or any static host).

---

## ⌨️ Keyboard Shortcuts

| Shortcut                         | Action                                        |
| :------------------------------- | :-------------------------------------------- |
| `→` / `Space` / `Page Down`      | Next Page                                     |
| `←` / `Page Up`                  | Previous Page                                 |
| `D`                              | Toggle Dark Mode / Light Mode                 |
| `V`                              | Toggle 1-Page / 2-Page View                   |
| `Ctrl + Z`                       | Undo Annotation                               |
| `Ctrl + Y` or `Ctrl + Shift + Z` | Redo Annotation                               |
| `Ctrl + Wheel` / `Pinch`         | Zoom In / Out                                 |
| `Esc`                            | Return to Reading Mode (Deselect active tool) |

---

## 📂 File Structure

```
bookReader++/
├── index.html             # Main reader markup with canvas stage & HUD
├── css/
│   └── style.css          # Master stylesheet: dark theme, paper texture, glassmorphism
├── js/
│   ├── pdf-loader.js      # PDF.js renderer & 12-page classic illustrated demo book
│   ├── flipbook.js        # Canvas flip engine with paper physics, curl, drag & audio
│   ├── annotations.js     # Vector annotation manager (pen, text, ellipse, rect, highlight)
│   └── app.js             # Controller connecting gestures, HUD, and tool controls
└── README.md
```

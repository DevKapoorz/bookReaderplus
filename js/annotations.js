/**
 * Real Book Annotation Layer
 * ===========================
 * Handles freehand annotation, text writing, shapes (ellipse, rectangle),
 * highlighter, color picking, and undo/redo.
 */

class AnnotationManager {
    constructor(canvas, flipbookEngine) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.engine = flipbookEngine;

        // Active tool state
        this.activeTool = null; // null (reading mode), 'draw', 'highlighter', 'text', 'rectangle', 'ellipse', 'eraser'
        this.currentColor = "#e63946"; // Default elegant crimson
        this.currentStrokeWidth = 3;

        // Current drawing draft
        this.isDrawing = false;
        this.currentStroke = null;
        this.dragStartPoint = null;

        // Annotation storage: Map of docId -> Map of pageNum -> Array of annotation objects
        // Each annotation: { id, type, color, strokeWidth, points: [{x,y}], text, rect: {x,y,w,h} }
        // All coordinates normalized to [0, 1] relative to page width and height!
        this.annotationsByDoc = new Map();
        this.undoStack = [];
        this.redoStack = [];
        this.onStatusChange = () => {};
        this.onToolChange = () => {};
        this.onHistoryChange = () => {};

        this.bindEvents();
    }

    setTool(tool) {
        this.activeTool = tool;
        window.isAnnotationActive = !!tool;

        // Reset any existing tool cursor classes
        this.canvas.classList.remove(
            "interactive",
            "tool-draw",
            "tool-highlighter",
            "tool-text",
            "tool-rectangle",
            "tool-ellipse",
            "tool-eraser",
        );

        if (tool) {
            this.canvas.classList.add("interactive", `tool-${tool}`);
        }
        this.render();
        this.onToolChange(this.activeTool);
    }

    setColor(color) {
        this.currentColor = color;
        this.onToolChange(this.activeTool);
    }

    setStrokeWidth(w) {
        this.currentStrokeWidth = w;
    }

    notifyHistoryChange() {
        if (typeof this.onHistoryChange === "function") {
            this.onHistoryChange({
                canUndo: this.undoStack.length > 0,
                canRedo: this.redoStack.length > 0,
            });
        }
    }

    // =========================================================================
    // LocalStorage Synchronization
    // =========================================================================

    loadFromLocalStorage(docId) {
        if (!docId) return;
        try {
            const raw = localStorage.getItem(`flipbook_annotations_${docId}`);
            if (raw) {
                const parsed = JSON.parse(raw);
                const pageMap = new Map();
                for (const [pageNum, items] of Object.entries(parsed)) {
                    if (Array.isArray(items)) {
                        pageMap.set(parseInt(pageNum, 10), items);
                    }
                }
                this.annotationsByDoc.set(docId, pageMap);
            } else {
                this.annotationsByDoc.set(docId, new Map());
            }
        } catch (e) {
            console.warn("Failed to load annotations from localStorage:", e);
        }
        this.render();
    }

    saveToLocalStorage(docId) {
        if (!docId) return;
        try {
            const docMap = this.annotationsByDoc.get(docId);
            if (!docMap) return;
            const obj = {};
            for (const [pageNum, items] of docMap.entries()) {
                if (Array.isArray(items) && items.length > 0) {
                    obj[pageNum] = items;
                }
            }
            localStorage.setItem(
                `flipbook_annotations_${docId}`,
                JSON.stringify(obj),
            );
        } catch (e) {
            console.warn("Failed to save annotations to localStorage:", e);
        }
    }

    persistCurrentDoc() {
        if (
            this.engine &&
            this.engine.docProvider &&
            this.engine.docProvider.currentDocId
        ) {
            this.saveToLocalStorage(this.engine.docProvider.currentDocId);
        }
    }

    // =========================================================================
    // Coordinate Normalization & Hit Testing
    // =========================================================================

    getHitPage(clientX, clientY) {
        // Map screen coordinate into book layout coordinate
        const engine = this.engine;
        const w = engine.stageWidth;
        const h = engine.stageHeight;

        // Get exact canvas-relative position accounting for viewport scroll and canvas rect
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;

        // Map client viewport (px) to canvas stage coordinates [0, w] and [0, h]
        const canvasX = (clientX - rect.left) * (w / rect.width);
        const canvasY = (clientY - rect.top) * (h / rect.height);

        // Invert zoom & pan transformations
        const centerX = w / 2;
        const centerY = h / 2;
        const localX = (canvasX - centerX - engine.panX) / engine.zoom + centerX;
        const localY = (canvasY - centerY - engine.panY) / engine.zoom + centerY;

        const bx = engine.bookX;
        const by = engine.bookY;
        const pw = engine.pageWidth;
        const ph = engine.pageHeight;

        // Check vertical bounds
        if (localY < by || localY > by + ph) return null;

        // Case 1: One-Page View Mode (Single centered page at [bx, by, pw, ph])
        if (!engine.isTwoPage) {
            if (localX >= bx && localX <= bx + pw) {
                return {
                    pageNum: engine.currentPage,
                    pageRect: { x: bx, y: by, w: pw, h: ph },
                    normX: Math.max(0, Math.min(1, (localX - bx) / pw)),
                    normY: Math.max(0, Math.min(1, (localY - by) / ph)),
                };
            }
            return null;
        }

        // Case 2: Two-Page View Mode on Page 1 (Cover rendered on the right side: [bx + pw, by, pw, ph])
        if (engine.currentPage === 1) {
            if (localX >= bx + pw && localX <= bx + pw * 2) {
                return {
                    pageNum: 1,
                    pageRect: { x: bx + pw, y: by, w: pw, h: ph },
                    normX: Math.max(0, Math.min(1, (localX - (bx + pw)) / pw)),
                    normY: Math.max(0, Math.min(1, (localY - by) / ph)),
                };
            }
            return null;
        }

        // Case 3: Two-Page Spread (Pages 2+)
        const spread = engine.getSpreadPages();
        if (localX >= bx && localX < bx + pw) {
            // Left Page
            if (spread.left) {
                return {
                    pageNum: spread.left,
                    pageRect: { x: bx, y: by, w: pw, h: ph },
                    normX: Math.max(0, Math.min(1, (localX - bx) / pw)),
                    normY: Math.max(0, Math.min(1, (localY - by) / ph)),
                };
            }
        } else if (localX >= bx + pw && localX <= bx + pw * 2) {
            // Right Page
            if (spread.right) {
                return {
                    pageNum: spread.right,
                    pageRect: { x: bx + pw, y: by, w: pw, h: ph },
                    normX: Math.max(0, Math.min(1, (localX - (bx + pw)) / pw)),
                    normY: Math.max(0, Math.min(1, (localY - by) / ph)),
                };
            }
        }

        return null;
    }

    getPageAnnotations(pageNum) {
        const docId = this.engine.docProvider.currentDocId;
        let docMap = this.annotationsByDoc.get(docId);
        if (!docMap) {
            docMap = new Map();
            this.annotationsByDoc.set(docId, docMap);
        }
        let list = docMap.get(pageNum);
        if (!list) {
            list = [];
            docMap.set(pageNum, list);
        }
        return list;
    }

    // =========================================================================
    // Canvas Rendering of Annotations
    // =========================================================================

    render() {
        const ctx = this.ctx;
        const engine = this.engine;
        const w = engine.stageWidth;
        const h = engine.stageHeight;

        // Align canvas sizing
        this.canvas.width = Math.round(w * engine.dpr);
        this.canvas.height = Math.round(h * engine.dpr);
        this.canvas.style.width = `${w}px`;
        this.canvas.style.height = `${h}px`;

        ctx.save();
        ctx.scale(engine.dpr, engine.dpr);
        ctx.clearRect(0, 0, w, h);

        // Apply zoom & pan
        ctx.translate(w / 2 + engine.panX, h / 2 + engine.panY);
        ctx.scale(engine.zoom, engine.zoom);
        ctx.translate(-w / 2, -h / 2);

        if (!engine.docProvider || engine.docProvider.pageCount === 0) {
            ctx.restore();
            return;
        }

        if (engine.isFlipping) {
            ctx.restore();
            return; // Suppress drawing overlay during active 3D curl flip
        }

        const bx = engine.bookX;
        const by = engine.bookY;
        const pw = engine.pageWidth;
        const ph = engine.pageHeight;

        if (!engine.isTwoPage) {
            // One-Page View: Single centered page at [bx, by, pw, ph]
            this.renderPageAnnotations(ctx, engine.currentPage, bx, by, pw, ph);
        } else if (engine.currentPage === 1) {
            // Two-Page Mode - Page 1 (Cover rendered on Right side: [bx + pw, by, pw, ph])
            this.renderPageAnnotations(ctx, 1, bx + pw, by, pw, ph);
        } else {
            // Two-Page Spread (Pages 2+)
            const spread = engine.getSpreadPages();
            if (spread.left) {
                this.renderPageAnnotations(ctx, spread.left, bx, by, pw, ph);
            }
            if (spread.right) {
                this.renderPageAnnotations(
                    ctx,
                    spread.right,
                    bx + pw,
                    by,
                    pw,
                    ph,
                );
            }
        }

        // Render in-progress drawing preview
        if (this.isDrawing && this.currentStroke) {
            this.renderDraftStroke(ctx);
        }

        ctx.restore();
    }

    renderPageAnnotations(ctx, pageNum, px, py, pw, ph) {
        const list = this.getPageAnnotations(pageNum);
        if (!list || list.length === 0) return;

        list.forEach((item) => {
            ctx.save();
            if (item.type === "highlighter") {
                ctx.globalAlpha = 0.38;
                ctx.globalCompositeOperation = "multiply";
                ctx.lineWidth = item.strokeWidth * (pw / 500) * 3.5;
                ctx.strokeStyle = item.color;
                ctx.lineCap = "round";
                ctx.lineJoin = "round";
                ctx.beginPath();
                if (item.points && item.points.length > 0) {
                    ctx.moveTo(
                        px + item.points[0].x * pw,
                        py + item.points[0].y * ph,
                    );
                    for (let i = 1; i < item.points.length; i++) {
                        ctx.lineTo(
                            px + item.points[i].x * pw,
                            py + item.points[i].y * ph,
                        );
                    }
                }
                ctx.stroke();
            } else if (item.type === "draw") {
                ctx.globalAlpha = 0.95;
                ctx.lineWidth = item.strokeWidth * (pw / 500);
                ctx.strokeStyle = item.color;
                ctx.lineCap = "round";
                ctx.lineJoin = "round";
                ctx.beginPath();
                if (item.points && item.points.length > 0) {
                    ctx.moveTo(
                        px + item.points[0].x * pw,
                        py + item.points[0].y * ph,
                    );
                    for (let i = 1; i < item.points.length; i++) {
                        ctx.lineTo(
                            px + item.points[i].x * pw,
                            py + item.points[i].y * ph,
                        );
                    }
                }
                ctx.stroke();
            } else if (item.type === "rectangle" && item.rect) {
                const rx = px + item.rect.x * pw;
                const ry = py + item.rect.y * ph;
                const rw = item.rect.w * pw;
                const rh = item.rect.h * ph;

                // Subtle tint fill
                ctx.globalAlpha = 0.08;
                ctx.fillStyle = item.color;
                ctx.fillRect(rx, ry, rw, rh);

                // Outline
                ctx.globalAlpha = 0.95;
                ctx.lineWidth = item.strokeWidth * (pw / 500);
                ctx.strokeStyle = item.color;
                ctx.strokeRect(rx, ry, rw, rh);
            } else if (item.type === "ellipse" && item.rect) {
                const rx = px + item.rect.x * pw;
                const ry = py + item.rect.y * ph;
                const rw = item.rect.w * pw;
                const rh = item.rect.h * ph;

                // Subtle tint fill
                ctx.globalAlpha = 0.08;
                ctx.fillStyle = item.color;
                ctx.beginPath();
                ctx.ellipse(
                    rx + rw / 2,
                    ry + rh / 2,
                    Math.abs(rw / 2),
                    Math.abs(rh / 2),
                    0,
                    0,
                    Math.PI * 2,
                );
                ctx.fill();

                // Outline
                ctx.globalAlpha = 0.95;
                ctx.lineWidth = item.strokeWidth * (pw / 500);
                ctx.strokeStyle = item.color;
                ctx.beginPath();
                ctx.ellipse(
                    rx + rw / 2,
                    ry + rh / 2,
                    Math.abs(rw / 2),
                    Math.abs(rh / 2),
                    0,
                    0,
                    Math.PI * 2,
                );
                ctx.stroke();
            } else if (item.type === "text") {
                const tx = px + item.x * pw;
                const ty = py + item.y * ph;

                const fontSize = Math.max(12, Math.round(14 * (pw / 500)));
                const lineHeight = fontSize * 1.35;
                ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

                const lines = (item.text || "").split("\n");
                let maxLineWidth = 0;
                for (const line of lines) {
                    const w = ctx.measureText(line).width;
                    if (w > maxLineWidth) maxLineWidth = w;
                }

                const padX = 9;
                const padY = 7;
                const bgW = Math.max(50, maxLineWidth + padX * 2);
                const bgH = Math.max(22, lines.length * lineHeight + padY * 2);
                const cornerRadius = 5;

                // Store normalized bounding box for accurate eraser hit testing
                item._bbox = {
                    x: item.x,
                    y: item.y,
                    w: bgW / pw,
                    h: bgH / ph,
                };

                // Drop shadow for sticky note
                ctx.shadowColor = "rgba(0, 0, 0, 0.25)";
                ctx.shadowBlur = 8;
                ctx.shadowOffsetY = 2;

                // Sticky background
                ctx.fillStyle = "rgba(255, 248, 225, 0.95)";
                ctx.beginPath();
                if (typeof ctx.roundRect === "function") {
                    ctx.roundRect(tx, ty, bgW, bgH, cornerRadius);
                } else {
                    ctx.rect(tx, ty, bgW, bgH);
                }
                ctx.fill();

                // Reset shadow before border & text
                ctx.shadowColor = "transparent";
                ctx.strokeStyle = item.color || "#e63946";
                ctx.lineWidth = 1.8;
                ctx.beginPath();
                if (typeof ctx.roundRect === "function") {
                    ctx.roundRect(tx, ty, bgW, bgH, cornerRadius);
                } else {
                    ctx.rect(tx, ty, bgW, bgH);
                }
                ctx.stroke();

                // Draw text lines
                ctx.fillStyle = "#1e1e24";
                lines.forEach((line, i) => {
                    ctx.fillText(
                        line,
                        tx + padX,
                        ty + padY + (i + 1) * lineHeight - (lineHeight * 0.22),
                    );
                });
            }
            ctx.restore();
        });
    }

    renderDraftStroke(ctx) {
        const s = this.currentStroke;
        if (!s || !s.pageRect) return;

        const px = s.pageRect.x;
        const py = s.pageRect.y;
        const pw = s.pageRect.w;
        const ph = s.pageRect.h;

        ctx.save();
        if (s.type === "highlighter") {
            ctx.globalAlpha = 0.38;
            ctx.globalCompositeOperation = "multiply";
            ctx.lineWidth = s.strokeWidth * (pw / 500) * 3.5;
            ctx.strokeStyle = s.color;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.beginPath();
            ctx.moveTo(px + s.points[0].x * pw, py + s.points[0].y * ph);
            for (let i = 1; i < s.points.length; i++) {
                ctx.lineTo(px + s.points[i].x * pw, py + s.points[i].y * ph);
            }
            ctx.stroke();
        } else if (s.type === "draw") {
            ctx.globalAlpha = 0.95;
            ctx.lineWidth = s.strokeWidth * (pw / 500);
            ctx.strokeStyle = s.color;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.beginPath();
            ctx.moveTo(px + s.points[0].x * pw, py + s.points[0].y * ph);
            for (let i = 1; i < s.points.length; i++) {
                ctx.lineTo(px + s.points[i].x * pw, py + s.points[i].y * ph);
            }
            ctx.stroke();
        } else if (s.type === "rectangle" && s.rect) {
            const rx = px + s.rect.x * pw;
            const ry = py + s.rect.y * ph;
            const rw = s.rect.w * pw;
            const rh = s.rect.h * ph;

            ctx.globalAlpha = 0.08;
            ctx.fillStyle = s.color;
            ctx.fillRect(rx, ry, rw, rh);

            ctx.globalAlpha = 0.95;
            ctx.lineWidth = s.strokeWidth * (pw / 500);
            ctx.strokeStyle = s.color;
            ctx.strokeRect(rx, ry, rw, rh);
        } else if (s.type === "ellipse" && s.rect) {
            const rx = px + s.rect.x * pw;
            const ry = py + s.rect.y * ph;
            const rw = s.rect.w * pw;
            const rh = s.rect.h * ph;

            ctx.globalAlpha = 0.08;
            ctx.fillStyle = s.color;
            ctx.beginPath();
            ctx.ellipse(
                rx + rw / 2,
                ry + rh / 2,
                Math.abs(rw / 2),
                Math.abs(rh / 2),
                0,
                0,
                Math.PI * 2,
            );
            ctx.fill();

            ctx.globalAlpha = 0.95;
            ctx.lineWidth = s.strokeWidth * (pw / 500);
            ctx.strokeStyle = s.color;
            ctx.beginPath();
            ctx.ellipse(
                rx + rw / 2,
                ry + rh / 2,
                Math.abs(rw / 2),
                Math.abs(rh / 2),
                0,
                0,
                Math.PI * 2,
            );
            ctx.stroke();
        }
        ctx.restore();
    }

    // =========================================================================
    // Pointer Event Handling for Tools
    // =========================================================================

    bindEvents() {
        this.canvas.addEventListener("pointerdown", (e) =>
            this.onPointerDown(e),
        );
        window.addEventListener("pointermove", (e) => this.onPointerMove(e));
        window.addEventListener("pointerup", (e) => this.onPointerUp(e));
        window.addEventListener("pointercancel", (e) => this.onPointerUp(e));
    }

    onPointerDown(e) {
        if (!this.activeTool || e.button !== 0) return;

        const hit = this.getHitPage(e.clientX, e.clientY);
        if (!hit) return;

        if (this.activeTool === "text") {
            this.promptTextInput(hit, e.clientX, e.clientY);
            return;
        }

        if (this.activeTool === "eraser") {
            this.eraseNearestAnnotation(hit);
            return;
        }

        this.isDrawing = true;
        this.dragStartPoint = { x: hit.normX, y: hit.normY };
        try {
            this.canvas.setPointerCapture?.(e.pointerId);
        } catch (_) {}

        this.currentStroke = {
            id:
                "ann_" +
                Date.now() +
                "_" +
                Math.random().toString(36).substr(2, 4),
            type: this.activeTool,
            color: this.currentColor,
            strokeWidth: this.currentStrokeWidth,
            pageNum: hit.pageNum,
            pageRect: hit.pageRect,
            points: [{ x: hit.normX, y: hit.normY }],
            rect: null,
        };

        this.render();
    }

    onPointerMove(e) {
        if (!this.isDrawing || !this.currentStroke) return;

        const engine = this.engine;
        const w = engine.stageWidth;
        const h = engine.stageHeight;
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const canvasX = (e.clientX - rect.left) * (w / rect.width);
        const canvasY = (e.clientY - rect.top) * (h / rect.height);
        const centerX = w / 2;
        const centerY = h / 2;
        const localX = (canvasX - centerX - engine.panX) / engine.zoom + centerX;
        const localY = (canvasY - centerY - engine.panY) / engine.zoom + centerY;

        const pr = this.currentStroke.pageRect;
        const normX = Math.max(0, Math.min(1, (localX - pr.x) / pr.w));
        const normY = Math.max(0, Math.min(1, (localY - pr.y) / pr.h));
        const pt = { x: normX, y: normY };

        if (
            this.currentStroke.type === "draw" ||
            this.currentStroke.type === "highlighter"
        ) {
            this.currentStroke.points.push(pt);
        } else if (
            this.currentStroke.type === "rectangle" ||
            this.currentStroke.type === "ellipse"
        ) {
            const start = this.dragStartPoint;
            this.currentStroke.rect = {
                x: Math.min(start.x, pt.x),
                y: Math.min(start.y, pt.y),
                w: Math.abs(pt.x - start.x),
                h: Math.abs(pt.y - start.y),
            };
        }

        this.render();
    }

    onPointerUp(e) {
        if (e && e.pointerId !== undefined) {
            try {
                this.canvas.releasePointerCapture?.(e.pointerId);
            } catch (_) {}
        }
        if (!this.isDrawing || !this.currentStroke) return;
        this.isDrawing = false;

        const stroke = this.currentStroke;
        this.currentStroke = null;

        // Check if stroke has valid geometry
        let isValid = false;
        if (stroke.type === "draw" || stroke.type === "highlighter") {
            isValid = stroke.points && stroke.points.length > 1;
        } else if (stroke.type === "rectangle" || stroke.type === "ellipse") {
            isValid =
                stroke.rect && (stroke.rect.w > 0.01 || stroke.rect.h > 0.01);
        }

        if (isValid) {
            delete stroke.pageRect; // Not needed in persistence
            const list = this.getPageAnnotations(stroke.pageNum);
            list.push(stroke);
            this.undoStack.push({ action: "add", item: stroke });
            this.redoStack = [];
            this.persistCurrentDoc();
            this.notifyHistoryChange();
        }

        this.render();
    }

    eraseNearestAnnotation(hit) {
        const list = this.getPageAnnotations(hit.pageNum);
        if (!list || list.length === 0) return;

        // Find annotation closest to hit point
        let closestIdx = -1;
        let minDist = 0.055; // Radius threshold for strokes

        for (let i = list.length - 1; i >= 0; i--) {
            const ann = list[i];
            if (ann.points) {
                for (const pt of ann.points) {
                    const d = Math.hypot(pt.x - hit.normX, pt.y - hit.normY);
                    if (d < minDist) {
                        minDist = d;
                        closestIdx = i;
                        break;
                    }
                }
            } else if (ann.rect) {
                const inX =
                    hit.normX >= ann.rect.x &&
                    hit.normX <= ann.rect.x + ann.rect.w;
                const inY =
                    hit.normY >= ann.rect.y &&
                    hit.normY <= ann.rect.y + ann.rect.h;
                if (inX && inY) {
                    closestIdx = i;
                    break;
                }
            } else if (ann.type === "text") {
                const bbox = ann._bbox || {
                    x: ann.x,
                    y: ann.y,
                    w: 0.15,
                    h: 0.06,
                };
                const inX =
                    hit.normX >= bbox.x && hit.normX <= bbox.x + bbox.w;
                const inY =
                    hit.normY >= bbox.y && hit.normY <= bbox.y + bbox.h;
                if (inX && inY) {
                    closestIdx = i;
                    break;
                }
                const d = Math.hypot(ann.x - hit.normX, ann.y - hit.normY);
                if (d < 0.05) {
                    closestIdx = i;
                    break;
                }
            }
        }

        if (closestIdx !== -1) {
            const removed = list.splice(closestIdx, 1)[0];
            this.undoStack.push({
                action: "delete",
                item: removed,
                pageNum: hit.pageNum,
            });
            this.persistCurrentDoc();
            this.notifyHistoryChange();
            this.render();
            this.onStatusChange("Annotation removed");
        }
    }

    promptTextInput(hit, clientX, clientY) {
        // Show custom modal input dialog
        const existing = document.getElementById("activeTextInputDialog");
        if (existing) existing.remove();

        const dialog = document.createElement("div");
        dialog.id = "activeTextInputDialog";
        dialog.className = "annotation-text-input-dialog";

        // Viewport-safe clamping
        const posX = Math.max(16, Math.min(window.innerWidth - 310, clientX - 20));
        const posY = Math.max(16, Math.min(window.innerHeight - 200, clientY - 30));
        dialog.style.left = `${posX}px`;
        dialog.style.top = `${posY}px`;

        dialog.innerHTML = `
      <div class="dialog-header">
        <span class="dialog-title">Add Note</span>
        <span class="dialog-swatch" style="background:${this.currentColor}; color:${this.currentColor}"></span>
      </div>
      <textarea placeholder="Write text note here... (Ctrl+Enter to save)" rows="3" autofocus></textarea>
      <div class="dialog-actions">
        <button type="button" class="cancel-btn">Cancel</button>
        <button type="button" class="save-btn" style="background:${this.currentColor}; color:#ffffff;">Place Note</button>
      </div>
    `;

        document.body.appendChild(dialog);
        const textarea = dialog.querySelector("textarea");
        textarea.focus();

        const closeDialog = () => {
            document.removeEventListener("pointerdown", handleOutsideClick);
            dialog.remove();
        };

        const handleOutsideClick = (e) => {
            if (!dialog.contains(e.target)) {
                closeDialog();
            }
        };

        const saveNote = () => {
            const text = textarea.value.trim();
            if (text) {
                const note = {
                    id: "note_" + Date.now(),
                    type: "text",
                    color: this.currentColor,
                    text: text,
                    x: hit.normX,
                    y: hit.normY,
                    pageNum: hit.pageNum,
                };
                const list = this.getPageAnnotations(hit.pageNum);
                list.push(note);
                this.undoStack.push({ action: "add", item: note });
                this.redoStack = [];
                this.persistCurrentDoc();
                this.notifyHistoryChange();
                this.render();
                this.onStatusChange("Note placed");
            }
            closeDialog();
        };

        dialog.querySelector(".cancel-btn").onclick = closeDialog;
        dialog.querySelector(".save-btn").onclick = saveNote;

        textarea.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                saveNote();
            } else if (e.key === "Escape") {
                e.preventDefault();
                closeDialog();
            }
        });

        // Delay attaching outside click to avoid closing on trigger click
        setTimeout(() => {
            document.addEventListener("pointerdown", handleOutsideClick);
        }, 80);
    }

    undo() {
        if (this.undoStack.length === 0) return;
        const op = this.undoStack.pop();

        if (op.action === "add") {
            const list = this.getPageAnnotations(op.item.pageNum);
            const idx = list.findIndex((a) => a.id === op.item.id);
            if (idx !== -1) {
                list.splice(idx, 1);
                this.redoStack.push(op);
            }
        } else if (op.action === "delete") {
            const list = this.getPageAnnotations(op.pageNum);
            list.push(op.item);
            this.redoStack.push(op);
        }
        this.persistCurrentDoc();
        this.notifyHistoryChange();
        this.render();
    }

    redo() {
        if (this.redoStack.length === 0) return;
        const op = this.redoStack.pop();

        if (op.action === "add") {
            const list = this.getPageAnnotations(op.item.pageNum);
            list.push(op.item);
            this.undoStack.push(op);
        } else if (op.action === "delete") {
            const list = this.getPageAnnotations(op.pageNum);
            const idx = list.findIndex((a) => a.id === op.item.id);
            if (idx !== -1) {
                list.splice(idx, 1);
                this.undoStack.push(op);
            }
        }
        this.persistCurrentDoc();
        this.notifyHistoryChange();
        this.render();
    }

    clearCurrentPages() {
        const engine = this.engine;
        const pagesToClear = [];
        if (!engine.isTwoPage || engine.currentPage === 1) {
            pagesToClear.push(engine.currentPage);
        } else {
            const spread = engine.getSpreadPages();
            if (spread.left) pagesToClear.push(spread.left);
            if (spread.right) pagesToClear.push(spread.right);
        }

        let clearedCount = 0;
        pagesToClear.forEach((p) => {
            const list = this.getPageAnnotations(p);
            if (list.length > 0) {
                clearedCount += list.length;
                list.length = 0;
            }
        });

        if (clearedCount > 0) {
            this.undoStack = [];
            this.redoStack = [];
            this.persistCurrentDoc();
            this.notifyHistoryChange();
            this.render();
            this.onStatusChange("Page annotations cleared");
        }
    }
}

window.AnnotationManager = AnnotationManager;


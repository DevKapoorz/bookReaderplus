/**
 * Real Book Annotation Layer
 * ===========================
 * Handles freehand annotation, text writing, shapes (ellipse, rectangle),
 * highlighter, color picking, undo/redo, and JSON history synchronization
 * with Python server (history.json).
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

        // History API auto-save debounce timer
        this.saveTimeout = null;
        this.onStatusChange = () => {};

        this.bindEvents();
    }

    setTool(tool) {
        this.activeTool = tool;
        window.isAnnotationActive = !!tool;

        if (tool) {
            this.canvas.classList.add("interactive");
        } else {
            this.canvas.classList.remove("interactive");
        }
        this.render();
    }

    setColor(color) {
        this.currentColor = color;
    }

    setStrokeWidth(w) {
        this.currentStrokeWidth = w;
    }

    // =========================================================================
    // API Synchronization with Python history.json
    // =========================================================================

    async loadFromHistory(docId) {
        try {
            const res = await fetch(
                `/api/history?docId=${encodeURIComponent(docId)}`,
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();

            if (json.success && json.data && json.data.annotations) {
                const pageMap = new Map();
                for (const [pageNum, item] of Object.entries(
                    json.data.annotations,
                )) {
                    const annots = item.items || item;
                    if (Array.isArray(annots)) {
                        pageMap.set(parseInt(pageNum, 10), annots);
                    }
                }
                this.annotationsByDoc.set(docId, pageMap);
                this.onStatusChange("✓ Synced with history.json");
            }
        } catch (e) {
            console.warn("Could not load annotations from server:", e);
            this.onStatusChange("Offline mode");
        }
        this.render();
    }

    async saveToHistory(docId, pageNum) {
        const docMap = this.annotationsByDoc.get(docId) || new Map();
        const pageAnnots = docMap.get(pageNum) || [];

        const payload = {
            docId: docId,
            docTitle: this.engine.docProvider.currentTitle,
            pageNum: pageNum,
            annotations: pageAnnots,
            timestamp: new Date().toISOString(),
        };

        try {
            this.onStatusChange("Saving to history.json...");
            const res = await fetch("/api/history", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                this.onStatusChange("✓ Saved to history.json");
            } else {
                this.onStatusChange("⚠ Save error");
            }
        } catch (err) {
            console.warn("Failed to save to /api/history:", err);
            this.onStatusChange("⚠ Offline (cached)");
        }
    }

    triggerAutoSave(pageNum) {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            this.saveToHistory(this.engine.docProvider.currentDocId, pageNum);
        }, 700);
    }

    // =========================================================================
    // Coordinate Normalization & Hit Testing
    // =========================================================================

    getHitPage(screenX, screenY) {
        // Map screen coordinate into book layout coordinate
        const engine = this.engine;
        const w = engine.stageWidth;
        const h = engine.stageHeight;

        // Invert zoom & pan
        const centerX = w / 2;
        const centerY = h / 2;
        const localX =
            (screenX - centerX - engine.panX) / engine.zoom + centerX;
        const localY =
            (screenY - centerY - engine.panY) / engine.zoom + centerY;

        const bx = engine.bookX;
        const by = engine.bookY;
        const pw = engine.pageWidth;
        const ph = engine.pageHeight;

        // Check bounds
        if (localY < by || localY > by + ph) return null;

        if (!engine.isTwoPage || engine.currentPage === 1) {
            // Single / cover page
            if (localX >= bx && localX <= bx + pw) {
                return {
                    pageNum: engine.currentPage,
                    pageRect: { x: bx, y: by, w: pw, h: ph },
                    normX: (localX - bx) / pw,
                    normY: (localY - by) / ph,
                };
            }
            return null;
        }

        // Two-page spread
        const spread = engine.getSpreadPages();
        if (localX >= bx && localX < bx + pw) {
            // Left Page
            if (spread.left) {
                return {
                    pageNum: spread.left,
                    pageRect: { x: bx, y: by, w: pw, h: ph },
                    normX: (localX - bx) / pw,
                    normY: (localY - by) / ph,
                };
            }
        } else if (localX >= bx + pw && localX <= bx + pw * 2) {
            // Right Page
            if (spread.right) {
                return {
                    pageNum: spread.right,
                    pageRect: { x: bx + pw, y: by, w: pw, h: ph },
                    normX: (localX - (bx + pw)) / pw,
                    normY: (localY - by) / ph,
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
        this.canvas.width = w * engine.dpr;
        this.canvas.height = h * engine.dpr;
        this.canvas.style.width = `${w}pt`;
        this.canvas.style.height = `${h}pt`;

        ctx.save();
        ctx.scale(engine.dpr, engine.dpr);
        ctx.clearRect(0, 0, w, h);

        // Apply zoom & pan
        ctx.translate(w / 2 + engine.panX, h / 2 + engine.panY);
        ctx.scale(engine.zoom, engine.zoom);
        ctx.translate(-w / 2, -h / 2);

        if (engine.isFlipping) {
            ctx.restore();
            return; // Suppress drawing overlay during active 3D curl flip
        }

        const bx = engine.bookX;
        const by = engine.bookY;
        const pw = engine.pageWidth;
        const ph = engine.pageHeight;

        if (!engine.isTwoPage || engine.currentPage === 1) {
            // Single / cover page
            this.renderPageAnnotations(ctx, engine.currentPage, bx, by, pw, ph);
        } else {
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
                ctx.globalAlpha = 0.35;
                ctx.lineWidth = item.strokeWidth * (pw / 500) * 3.5;
                ctx.strokeStyle = item.color;
                ctx.lineCap = "square";
                ctx.lineJoin = "miter";
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
            } else if (item.type === "rectangle") {
                ctx.globalAlpha = 0.9;
                ctx.lineWidth = item.strokeWidth * (pw / 500);
                ctx.strokeStyle = item.color;
                const rx = px + item.rect.x * pw;
                const ry = py + item.rect.y * ph;
                const rw = item.rect.w * pw;
                const rh = item.rect.h * ph;
                ctx.strokeRect(rx, ry, rw, rh);
            } else if (item.type === "ellipse") {
                ctx.globalAlpha = 0.9;
                ctx.lineWidth = item.strokeWidth * (pw / 500);
                ctx.strokeStyle = item.color;
                const rx = px + item.rect.x * pw;
                const ry = py + item.rect.y * ph;
                const rw = item.rect.w * pw;
                const rh = item.rect.h * ph;
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

                ctx.font = `bold ${Math.max(14, 16 * (pw / 500))}px -apple-system, sans-serif`;
                const textMetrics = ctx.measureText(item.text);
                const padX = 8;
                const padY = 5;
                const bgW = textMetrics.width + padX * 2;
                const bgH = 24 * (pw / 500);

                // Sticky note background
                ctx.fillStyle = "rgba(255, 243, 196, 0.92)";
                ctx.strokeStyle = item.color;
                ctx.lineWidth = 1.5;
                ctx.shadowColor = "rgba(0,0,0,0.25)";
                ctx.shadowBlur = 6;
                ctx.fillRect(tx, ty - bgH + 4, bgW, bgH);
                ctx.strokeRect(tx, ty - bgH + 4, bgW, bgH);
                ctx.shadowBlur = 0;

                ctx.fillStyle = "#222";
                ctx.fillText(item.text, tx + padX, ty - 4);
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
            ctx.globalAlpha = 0.35;
            ctx.lineWidth = s.strokeWidth * (pw / 500) * 3.5;
            ctx.strokeStyle = s.color;
            ctx.lineCap = "square";
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
            ctx.globalAlpha = 0.9;
            ctx.lineWidth = s.strokeWidth * (pw / 500);
            ctx.strokeStyle = s.color;
            ctx.strokeRect(
                px + s.rect.x * pw,
                py + s.rect.y * ph,
                s.rect.w * pw,
                s.rect.h * ph,
            );
        } else if (s.type === "ellipse" && s.rect) {
            ctx.globalAlpha = 0.9;
            ctx.lineWidth = s.strokeWidth * (pw / 500);
            ctx.strokeStyle = s.color;
            const rx = px + s.rect.x * pw;
            const ry = py + s.rect.y * ph;
            const rw = s.rect.w * pw;
            const rh = s.rect.h * ph;
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

        const hit = this.getHitPage(e.clientX, e.clientY);
        if (!hit || hit.pageNum !== this.currentStroke.pageNum) return;

        const pt = { x: hit.normX, y: hit.normY };

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
            this.triggerAutoSave(stroke.pageNum);
        }

        this.render();
    }

    eraseNearestAnnotation(hit) {
        const list = this.getPageAnnotations(hit.pageNum);
        if (!list || list.length === 0) return;

        // Find annotation closest to hit point
        let closestIdx = -1;
        let minDist = 0.06; // Radius threshold

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
                const d = Math.hypot(ann.x - hit.normX, ann.y - hit.normY);
                if (d < 0.08) {
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
            this.triggerAutoSave(hit.pageNum);
            this.render();
        }
    }

    promptTextInput(hit, clientX, clientY) {
        // Show custom modal input dialog
        const existing = document.getElementById("activeTextInputDialog");
        if (existing) existing.remove();

        const dialog = document.createElement("div");
        dialog.id = "activeTextInputDialog";
        dialog.className = "annotation-text-input-dialog";
        dialog.style.left = `${Math.min(window.innerWidth - 260, clientX)}px`;
        dialog.style.top = `${Math.min(window.innerHeight - 150, clientY)}px`;

        dialog.innerHTML = `
      <textarea placeholder="Write text note here..." rows="3" autofocus></textarea>
      <div class="dialog-actions">
        <button class="cancel-btn">Cancel</button>
        <button class="save-btn" style="background:${this.currentColor};color:#fff;">Place Note</button>
      </div>
    `;

        document.body.appendChild(dialog);
        const textarea = dialog.querySelector("textarea");
        textarea.focus();

        const closeDialog = () => dialog.remove();

        dialog.querySelector(".cancel-btn").onclick = closeDialog;
        dialog.querySelector(".save-btn").onclick = () => {
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
                this.triggerAutoSave(hit.pageNum);
                this.render();
            }
            closeDialog();
        };
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
                this.triggerAutoSave(op.item.pageNum);
            }
        } else if (op.action === "delete") {
            const list = this.getPageAnnotations(op.pageNum);
            list.push(op.item);
            this.redoStack.push(op);
            this.triggerAutoSave(op.pageNum);
        }
        this.render();
    }

    redo() {
        if (this.redoStack.length === 0) return;
        const op = this.redoStack.pop();

        if (op.action === "add") {
            const list = this.getPageAnnotations(op.item.pageNum);
            list.push(op.item);
            this.undoStack.push(op);
            this.triggerAutoSave(op.item.pageNum);
        } else if (op.action === "delete") {
            const list = this.getPageAnnotations(op.pageNum);
            const idx = list.findIndex((a) => a.id === op.item.id);
            if (idx !== -1) {
                list.splice(idx, 1);
                this.undoStack.push(op);
                this.triggerAutoSave(op.pageNum);
            }
        }
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

        pagesToClear.forEach((p) => {
            const list = this.getPageAnnotations(p);
            list.length = 0;
            this.triggerAutoSave(p);
        });

        this.render();
        this.onStatusChange("Page cleared");
    }
}

window.AnnotationManager = AnnotationManager;

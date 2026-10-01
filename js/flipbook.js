/**
 * Real Book Canvas Flipbook Engine
 * ================================
 * High-performance canvas-based flipbook with realistic paper physics,
 * curling animation, interactive drag & swipe, pinch-to-zoom,
 * single cover page rule, and two-page spread rendering.
 */

class FlipbookEngine {
    constructor(canvas, docProvider, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.docProvider = docProvider;

        // View Options (Defaults per prompt requirements)
        this.isTwoPage =
            options.isTwoPage !== undefined ? options.isTwoPage : true;
        this.currentPage = 1; // 1-based page index. Page 1 is Cover (single)

        // Zoom & Pan state
        this.zoom = 1.0;
        this.panX = 0;
        this.panY = 0;
        this.minZoom = 0.8;
        this.maxZoom = 3.0;

        // Dimensions & Layout
        this.stageWidth = 0;
        this.stageHeight = 0;
        this.pageWidth = 0;
        this.pageHeight = 0;
        this.bookX = 0;
        this.bookY = 0;
        this.dpr = window.devicePixelRatio || 1;

        // Flip Animation & Interaction State
        this.isFlipping = false;
        this.flipProgress = 0; // 0 to 1
        this.flipDirection = 0; // +1 = next (turning right page to left), -1 = prev (turning left page to right)
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragCurrentX = 0;
        this.dragCurrentY = 0;
        this.dragSide = null; // 'left' or 'right'
        this.dragTimestamp = 0;

        // Pinch Zoom Tracking
        this.touchStartDist = 0;
        this.touchStartZoom = 1.0;
        this.isPinching = false;

        // Sound Synthesizer
        this.audioCtx = null;
        this.initAudio();

        // Callbacks
        this.onPageChange = options.onPageChange || (() => {});
        this.onZoomChange = options.onZoomChange || (() => {});

        // Bind Event Handlers
        this.bindEvents();
        this.resize();
    }

    initAudio() {
        try {
            const AudioContext =
                window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.audioCtx = new AudioContext();
            }
        } catch (e) {
            console.warn("Web Audio not supported", e);
        }
    }

    playTurnSound() {
        if (!this.audioCtx) return;
        if (this.audioCtx.state === "suspended") {
            this.audioCtx.resume();
        }
        try {
            // Synthesize realistic paper rustle sound using noise buffer & lowpass sweep
            const bufferSize = this.audioCtx.sampleRate * 0.22;
            const buffer = this.audioCtx.createBuffer(
                1,
                bufferSize,
                this.audioCtx.sampleRate,
            );
            const output = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
            }

            const whiteNoise = this.audioCtx.createBufferSource();
            whiteNoise.buffer = buffer;

            const filter = this.audioCtx.createBiquadFilter();
            filter.type = "bandpass";
            filter.frequency.setValueAtTime(800, this.audioCtx.currentTime);
            filter.frequency.exponentialRampToValueAtTime(
                160,
                this.audioCtx.currentTime + 0.2,
            );
            filter.Q.value = 3.0;

            const gain = this.audioCtx.createGain();
            gain.gain.setValueAtTime(0.01, this.audioCtx.currentTime);
            gain.gain.linearRampToValueAtTime(
                0.18,
                this.audioCtx.currentTime + 0.04,
            );
            gain.gain.exponentialRampToValueAtTime(
                0.001,
                this.audioCtx.currentTime + 0.22,
            );

            whiteNoise.connect(filter);
            filter.connect(gain);
            gain.connect(this.audioCtx.destination);

            whiteNoise.start();
        } catch (err) {
            // Audio autoplay policy fallback
        }
    }

    resize() {
        this.dpr = window.devicePixelRatio || 1;

        // Size reading canvas to just slightly smaller than webpage with appropriate paddings / margins
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;

        const padX = Math.max(18, Math.min(18, Math.floor(screenW * 0.04)));
        const padY = Math.max(14, Math.min(14, Math.floor(screenH * 0.04)));

        const canvasW = Math.max(300, screenW - padX * 2);
        const canvasH = Math.max(300, screenH - padY * 2);

        this.stageWidth = canvasW;
        this.stageHeight = canvasH;
        this.canvasWidth = canvasW;
        this.canvasHeight = canvasH;

        // Logical and pixel canvas dimensions
        this.canvas.width = Math.round(canvasW * this.dpr);
        this.canvas.height = Math.round(canvasH * this.dpr);
        this.canvas.style.width = `${canvasW}px`;
        this.canvas.style.height = `${canvasH}px`;

        // Sync container stage wrapper
        const stage = document.getElementById("bookCanvasStage");
        if (stage) {
            stage.style.width = `${canvasW}px`;
            stage.style.height = `${canvasH}px`;
        }

        // Dynamic aspect ratio from document (height / width)
        const samplePage =
            this.docProvider.getPage(this.currentPage) ||
            this.docProvider.getPage(1);
        const aspect =
            samplePage && samplePage.width > 0
                ? samplePage.height / samplePage.width
                : 1.414;

        // Book reading area scaled to fill reading canvas with subtle inner margin
        const innerMargin = 16;
        const availW = canvasW - innerMargin * 2;
        const availH = canvasH - innerMargin * 2;

        if (this.isTwoPage && this.currentPage > 1) {
            // Two-page spread: width = 2 * pageWidth
            let pHeight = availH;
            let pWidth = pHeight / aspect;

            if (pWidth * 2 > availW) {
                pWidth = availW / 2;
                pHeight = pWidth * aspect;
            }

            this.pageWidth = Math.floor(pWidth);
            this.pageHeight = Math.floor(pHeight);
            this.bookX = Math.floor((canvasW - this.pageWidth * 2) / 2);
            this.bookY = Math.floor((canvasH - this.pageHeight) / 2);
        } else {
            // Single page view OR Cover page (Page 1 is single centered)
            let pHeight = availH;
            let pWidth = pHeight / aspect;

            if (pWidth > availW) {
                pWidth = availW;
                pHeight = pWidth * aspect;
            }

            this.pageWidth = Math.floor(pWidth);
            this.pageHeight = Math.floor(pHeight);
            this.bookX = Math.floor((canvasW - this.pageWidth) / 2);
            this.bookY = Math.floor((canvasH - this.pageHeight) / 2);
        }

        this.render();
    }

    // =========================================================================
    // Navigation & Page State Logic
    // =========================================================================

    isCoverPage() {
        return this.currentPage === 1;
    }

    isBackCover() {
        return this.currentPage >= this.docProvider.pageCount;
    }

    getSpreadPages() {
        if (!this.isTwoPage || this.currentPage === 1) {
            return { left: null, right: this.currentPage };
        }
        // In two-page mode, spread starts on even page (2 & 3, 4 & 5, ...)
        const leftPage =
            this.currentPage % 2 === 0
                ? this.currentPage
                : this.currentPage - 1;
        const rightPage =
            leftPage + 1 <= this.docProvider.pageCount ? leftPage + 1 : null;
        return { left: leftPage, right: rightPage };
    }

    canGoNext() {
        return (
            this.currentPage < this.docProvider.pageCount && !this.isFlipping
        );
    }

    canGoPrev() {
        return this.currentPage > 1 && !this.isFlipping;
    }

    turnNext() {
        if (!this.canGoNext()) return;
        this.playTurnSound();
        this.animateFlip(1);
    }

    turnPrev() {
        if (!this.canGoPrev()) return;
        this.playTurnSound();
        this.animateFlip(-1);
    }

    goToPage(pageNum) {
        if (this.isFlipping) return;
        pageNum = Math.max(1, Math.min(pageNum, this.docProvider.pageCount));
        if (pageNum === this.currentPage) return;

        const dir = pageNum > this.currentPage ? 1 : -1;
        this.playTurnSound();
        this.currentPage = pageNum;
        this.resize();
        this.onPageChange(this.getPageStatusInfo());
    }

    toggleViewMode() {
        this.isTwoPage = !this.isTwoPage;
        this.resize();
        this.onPageChange(this.getPageStatusInfo());
    }

    getPageStatusInfo() {
        const total = this.docProvider.pageCount;
        if (this.currentPage === 1) {
            return {
                label: `Cover (Page 1 of ${total})`,
                current: 1,
                total,
                isTwoPage: this.isTwoPage,
            };
        }
        if (!this.isTwoPage) {
            return {
                label: `Page ${this.currentPage} of ${total}`,
                current: this.currentPage,
                total,
                isTwoPage: false,
            };
        }
        const spread = this.getSpreadPages();
        if (spread.right) {
            return {
                label: `Pages ${spread.left}–${spread.right} of ${total}`,
                current: spread.left,
                total,
                isTwoPage: true,
            };
        }
        return {
            label: `Page ${spread.left} of ${total}`,
            current: spread.left,
            total,
            isTwoPage: true,
        };
    }

    // =========================================================================
    // Page Turn Animation Physics
    // =========================================================================

    animateFlip(direction) {
        this.isFlipping = true;
        this.flipDirection = direction; // 1 = forward, -1 = backward
        this.flipProgress = 0;

        const duration = 480; // ms
        const startTime = performance.now();

        const step = (now) => {
            const elapsed = now - startTime;
            const t = Math.min(1, elapsed / duration);
            // Smooth cubic ease-in-out
            this.flipProgress =
                t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

            this.render();

            if (t < 1) {
                requestAnimationFrame(step);
            } else {
                this.finalizeTurn(direction);
            }
        };

        requestAnimationFrame(step);
    }

    finalizeTurn(direction) {
        this.isFlipping = false;
        this.flipProgress = 0;

        if (direction > 0) {
            // Forward turn
            if (this.isTwoPage) {
                if (this.currentPage === 1) {
                    this.currentPage = 2; // Open from cover to pages 2 & 3
                } else {
                    this.currentPage = Math.min(
                        this.docProvider.pageCount,
                        this.currentPage + 2,
                    );
                }
            } else {
                this.currentPage = Math.min(
                    this.docProvider.pageCount,
                    this.currentPage + 1,
                );
            }
        } else {
            // Backward turn
            if (this.isTwoPage) {
                if (this.currentPage <= 3) {
                    this.currentPage = 1; // Back to closed cover
                } else {
                    this.currentPage = Math.max(2, this.currentPage - 2);
                }
            } else {
                this.currentPage = Math.max(1, this.currentPage - 1);
            }
        }

        this.resize();
        this.onPageChange(this.getPageStatusInfo());
    }

    // =========================================================================
    // Canvas Rendering (Real Book Aesthetics)
    // =========================================================================

    render() {
        const ctx = this.ctx;
        const w = this.stageWidth;
        const h = this.stageHeight;

        ctx.save();
        ctx.scale(this.dpr, this.dpr);
        ctx.clearRect(0, 0, w, h);

        // Apply Zoom & Pan transforms
        ctx.save();
        ctx.translate(w / 2 + this.panX, h / 2 + this.panY);
        ctx.scale(this.zoom, this.zoom);
        ctx.translate(-w / 2, -h / 2);

        if (this.isFlipping || this.isDragging) {
            this.renderFlippingBook(ctx);
        } else {
            this.renderStaticBook(ctx);
        }

        ctx.restore();
        ctx.restore();
    }

    renderStaticBook(ctx) {
        const isDark = document.body.classList.contains("dark-mode");

        // Case 1: Cover Page (Single page centered like a closed book)
        if (this.isCoverPage() || (!this.isTwoPage && this.currentPage === 1)) {
            this.drawSingleBookPage(
                ctx,
                this.bookX,
                this.bookY,
                this.pageWidth,
                this.pageHeight,
                1,
                "cover",
                isDark,
            );
            return;
        }

        // Case 2: One-Page View Mode
        if (!this.isTwoPage) {
            this.drawSingleBookPage(
                ctx,
                this.bookX,
                this.bookY,
                this.pageWidth,
                this.pageHeight,
                this.currentPage,
                "single",
                isDark,
            );
            return;
        }

        // Case 3: Two-Page Spread
        const spread = this.getSpreadPages();
        const bx = this.bookX;
        const by = this.bookY;
        const pw = this.pageWidth;
        const ph = this.pageHeight;

        // Draw Drop Shadow under whole book
        this.drawBookShadow(ctx, bx, by, pw * 2, ph);

        // Multi-page edge thickness effect (fore-edge paper leaves stack)
        this.drawPaperStackEdges(ctx, bx, by, pw * 2, ph, isDark);

        // Left Page
        if (spread.left) {
            this.drawPageContent(ctx, spread.left, bx, by, pw, ph);
        } else {
            this.drawBlankPage(ctx, bx, by, pw, ph, isDark);
        }

        // Right Page
        if (spread.right) {
            this.drawPageContent(ctx, spread.right, bx + pw, by, pw, ph);
        } else {
            this.drawBlankPage(ctx, bx + pw, by, pw, ph, isDark);
        }

        // Center Spine Gutter Shadow (Ambient Occlusion depth)
        this.drawGutterShadow(ctx, bx + pw, by, ph);

        // Outer subtle border
        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.1)";
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, pw * 2, ph);
    }

    drawSingleBookPage(ctx, x, y, w, h, pageNum, mode, isDark) {
        // Drop shadow
        this.drawBookShadow(ctx, x, y, w, h);

        // Book spine trim on left
        if (mode === "cover") {
            // Leather / hardcover spine crease
            ctx.fillStyle = isDark ? "#0b0c10" : "#c8bba8";
            ctx.fillRect(x - 8, y - 2, 8, h + 4);

            // Fore-edge paper stack on right & bottom
            ctx.fillStyle = isDark ? "#1a1b22" : "#e6decb";
            ctx.fillRect(x + w, y + 4, 6, h - 8);
            ctx.fillRect(x + 4, y + h, w - 8, 6);
        }

        // Draw page content
        this.drawPageContent(ctx, pageNum, x, y, w, h);

        // Thin framing line
        ctx.strokeStyle = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
    }

    renderFlippingBook(ctx) {
        const isDark = document.body.classList.contains("dark-mode");
        const progress = this.flipProgress;
        const dir = this.flipDirection;
        const pw = this.pageWidth;
        const ph = this.pageHeight;
        const bx = this.bookX;
        const by = this.bookY;

        // Draw background book base
        if (this.isTwoPage && this.currentPage > 1) {
            this.drawBookShadow(ctx, bx, by, pw * 2, ph);
            this.drawPaperStackEdges(ctx, bx, by, pw * 2, ph, isDark);
        } else {
            this.drawBookShadow(ctx, bx, by, pw, ph);
        }

        const spineX = this.isTwoPage && this.currentPage > 1 ? bx + pw : bx;

        if (dir > 0) {
            // Flipping forward: Right page curls towards left
            const currentSpread = this.getSpreadPages();
            const currentRight = currentSpread.right || this.currentPage;
            const nextSpreadLeft = currentRight + 1; // back of curling page
            const nextSpreadRight = currentRight + 2; // newly revealed page on right

            // Draw stationary left page
            if (this.isTwoPage && currentSpread.left) {
                this.drawPageContent(ctx, currentSpread.left, bx, by, pw, ph);
            }

            // Draw newly revealed page underneath on right
            if (nextSpreadRight <= this.docProvider.pageCount) {
                this.drawPageContent(ctx, nextSpreadRight, bx + pw, by, pw, ph);
            } else {
                this.drawBlankPage(ctx, bx + pw, by, pw, ph, isDark);
            }

            // Render the animated curling leaf
            this.drawCurlingLeaf(
                ctx,
                spineX,
                by,
                pw,
                ph,
                progress,
                currentRight,
                nextSpreadLeft,
                "rightToLeft",
                isDark,
            );

            // Spine shadow
            if (this.isTwoPage) {
                this.drawGutterShadow(ctx, spineX, by, ph);
            }
        } else {
            // Flipping backward: Left page curls towards right
            const currentSpread = this.getSpreadPages();
            const currentLeft = currentSpread.left || this.currentPage;
            const prevRight = currentLeft - 1; // back of turning leaf
            const prevLeft = currentLeft - 2; // newly revealed page on left

            // Draw stationary right page
            if (this.isTwoPage && currentSpread.right) {
                this.drawPageContent(
                    ctx,
                    currentSpread.right,
                    bx + pw,
                    by,
                    pw,
                    ph,
                );
            }

            // Draw newly revealed page underneath on left
            if (prevLeft >= 1) {
                this.drawPageContent(ctx, prevLeft, bx, by, pw, ph);
            } else {
                this.drawBlankPage(ctx, bx, by, pw, ph, isDark);
            }

            // Render the animated curling leaf
            this.drawCurlingLeaf(
                ctx,
                spineX,
                by,
                pw,
                ph,
                progress,
                currentLeft,
                prevRight,
                "leftToRight",
                isDark,
            );

            // Spine shadow
            if (this.isTwoPage) {
                this.drawGutterShadow(ctx, spineX, by, ph);
            }
        }
    }

    drawCurlingLeaf(
        ctx,
        spineX,
        y,
        pw,
        ph,
        progress,
        frontPageNum,
        backPageNum,
        direction,
        isDark,
    ) {
        ctx.save();

        if (direction === "rightToLeft") {
            // Turning page from right (1.0) to left (0.0)
            // Width of visible curled face
            const foldX = spineX + pw * (1 - 2 * progress);
            const isFrontVisible = progress < 0.5;
            const visibleWidth = Math.abs(foldX - spineX);

            // Dynamic Drop Shadow cast onto the underlying page
            ctx.save();
            const shadowGrad = ctx.createLinearGradient(
                foldX,
                y,
                foldX + 40,
                y,
            );
            shadowGrad.addColorStop(0, "rgba(0, 0, 0, 0.45)");
            shadowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
            ctx.fillStyle = shadowGrad;
            ctx.fillRect(foldX, y, Math.min(pw, 50), ph);
            ctx.restore();

            if (isFrontVisible) {
                // Front face curling up (compressed horizontally)
                ctx.save();
                ctx.beginPath();
                ctx.rect(spineX, y, visibleWidth, ph);
                ctx.clip();

                // Skew & scale perspective
                const scaleX = 1 - 2 * progress;
                ctx.translate(spineX, y);
                ctx.scale(scaleX, 1);
                this.drawPageContent(ctx, frontPageNum, 0, 0, pw, ph);

                // Cylinder reflection gradient on curling page
                const curlGrad = ctx.createLinearGradient(0, 0, pw, 0);
                curlGrad.addColorStop(0, "rgba(0, 0, 0, 0.15)");
                curlGrad.addColorStop(0.7, "rgba(255, 255, 255, 0.15)");
                curlGrad.addColorStop(1, "rgba(0, 0, 0, 0.35)");
                ctx.fillStyle = curlGrad;
                ctx.fillRect(0, 0, pw, ph);

                ctx.restore();
            } else {
                // Back of page curling over to the left side
                ctx.save();
                const leafLeft = foldX;
                const leafWidth = spineX - foldX;
                ctx.beginPath();
                ctx.rect(leafLeft, y, leafWidth, ph);
                ctx.clip();

                const scaleX = 2 * progress - 1;
                ctx.translate(spineX, y);
                ctx.scale(-scaleX, 1);

                if (
                    backPageNum >= 1 &&
                    backPageNum <= this.docProvider.pageCount
                ) {
                    this.drawPageContent(ctx, backPageNum, 0, 0, pw, ph);
                } else {
                    this.drawBlankPage(ctx, 0, 0, pw, ph, isDark);
                }

                // Gradient shadow on reverse face
                const backGrad = ctx.createLinearGradient(0, 0, pw, 0);
                backGrad.addColorStop(0, "rgba(0,0,0,0.25)");
                backGrad.addColorStop(0.6, "rgba(255,255,255,0.08)");
                backGrad.addColorStop(1, "rgba(0,0,0,0.2)");
                ctx.fillStyle = backGrad;
                ctx.fillRect(0, 0, pw, ph);

                ctx.restore();
            }
        } else {
            // Turning page from left (-1.0) to right
            const foldX = spineX - pw * (1 - 2 * progress);
            const isFrontVisible = progress < 0.5;
            const visibleWidth = Math.abs(spineX - foldX);

            // Cast shadow
            ctx.save();
            const shadowGrad = ctx.createLinearGradient(
                foldX - 40,
                y,
                foldX,
                y,
            );
            shadowGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
            shadowGrad.addColorStop(1, "rgba(0, 0, 0, 0.45)");
            ctx.fillStyle = shadowGrad;
            ctx.fillRect(foldX - 50, y, 50, ph);
            ctx.restore();

            if (isFrontVisible) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(foldX, y, visibleWidth, ph);
                ctx.clip();

                const scaleX = 1 - 2 * progress;
                ctx.translate(spineX, y);
                ctx.scale(-scaleX, 1);
                this.drawPageContent(ctx, frontPageNum, -pw, 0, pw, ph);

                const curlGrad = ctx.createLinearGradient(-pw, 0, 0, 0);
                curlGrad.addColorStop(0, "rgba(0, 0, 0, 0.35)");
                curlGrad.addColorStop(0.3, "rgba(255, 255, 255, 0.15)");
                curlGrad.addColorStop(1, "rgba(0, 0, 0, 0.15)");
                ctx.fillStyle = curlGrad;
                ctx.fillRect(-pw, 0, pw, ph);

                ctx.restore();
            } else {
                ctx.save();
                const leafWidth = foldX - spineX;
                ctx.beginPath();
                ctx.rect(spineX, y, leafWidth, ph);
                ctx.clip();

                const scaleX = 2 * progress - 1;
                ctx.translate(spineX, y);
                ctx.scale(scaleX, 1);

                if (
                    backPageNum >= 1 &&
                    backPageNum <= this.docProvider.pageCount
                ) {
                    this.drawPageContent(ctx, backPageNum, 0, 0, pw, ph);
                } else {
                    this.drawBlankPage(ctx, 0, 0, pw, ph, isDark);
                }

                const backGrad = ctx.createLinearGradient(0, 0, pw, 0);
                backGrad.addColorStop(0, "rgba(0,0,0,0.25)");
                backGrad.addColorStop(0.8, "rgba(0,0,0,0.05)");
                ctx.fillStyle = backGrad;
                ctx.fillRect(0, 0, pw, ph);

                ctx.restore();
            }
        }

        ctx.restore();
    }

    drawPageContent(ctx, pageNum, x, y, w, h) {
        const pageCanvas = this.docProvider.getPage(pageNum);
        if (pageCanvas) {
            ctx.drawImage(pageCanvas, x, y, w, h);
        } else {
            const isDark = document.body.classList.contains("dark-mode");
            this.drawBlankPage(ctx, x, y, w, h, isDark);
        }
    }

    drawBlankPage(ctx, x, y, w, h, isDark) {
        ctx.fillStyle = isDark ? "#22242c" : "#fbf8f1";
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = isDark
            ? "rgba(255,255,255,0.04)"
            : "rgba(0,0,0,0.06)";
        ctx.strokeRect(x, y, w, h);
    }

    drawBookShadow(ctx, x, y, w, h) {
        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
        ctx.shadowBlur = 35;
        ctx.shadowOffsetY = 18;
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.fillRect(x + 10, y + 10, w - 20, h - 10);
        ctx.restore();
    }

    drawPaperStackEdges(ctx, x, y, w, h, isDark) {
        ctx.save();
        // Simulate fore-edge paper thickness on left, right, and bottom
        const edgeColor = isDark ? "#1a1c22" : "#e4dcd0";
        const lineColor = isDark
            ? "rgba(255,255,255,0.05)"
            : "rgba(0,0,0,0.08)";

        // Right edge stack
        ctx.fillStyle = edgeColor;
        ctx.fillRect(x + w, y + 4, 7, h - 8);
        // Left edge stack
        ctx.fillRect(x - 7, y + 4, 7, h - 8);
        // Bottom stack
        ctx.fillRect(x + 4, y + h, w - 8, 7);

        // Thin lines simulating leaf layers
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1;
        for (let i = 1; i <= 3; i++) {
            // Right lines
            ctx.beginPath();
            ctx.moveTo(x + w + i * 2, y + 6);
            ctx.lineTo(x + w + i * 2, y + h - 6);
            ctx.stroke();

            // Left lines
            ctx.beginPath();
            ctx.moveTo(x - i * 2, y + 6);
            ctx.lineTo(x - i * 2, y + h - 6);
            ctx.stroke();
        }
        ctx.restore();
    }

    drawGutterShadow(ctx, spineX, y, h) {
        ctx.save();
        // Spine inner valley ambient occlusion
        const grad = ctx.createLinearGradient(spineX - 35, y, spineX + 35, y);
        grad.addColorStop(0, "rgba(0, 0, 0, 0)");
        grad.addColorStop(0.35, "rgba(0, 0, 0, 0.22)");
        grad.addColorStop(0.5, "rgba(0, 0, 0, 0.45)"); // deepest crease
        grad.addColorStop(0.65, "rgba(0, 0, 0, 0.22)");
        grad.addColorStop(1, "rgba(0, 0, 0, 0)");

        ctx.fillStyle = grad;
        ctx.fillRect(spineX - 35, y, 70, h);
        ctx.restore();
    }

    // =========================================================================
    // Drag, Swipe & Touch Gesture Handling
    // =========================================================================

    bindEvents() {
        const el = this.canvas;

        // Pointer events (works for Mouse, Touch, Stylus)
        el.addEventListener("pointerdown", (e) => this.onPointerDown(e));
        window.addEventListener("pointermove", (e) => this.onPointerMove(e));
        window.addEventListener("pointerup", (e) => this.onPointerUp(e));
        window.addEventListener("pointercancel", (e) => this.onPointerUp(e));

        // Wheel Zoom & Pan
        el.addEventListener("wheel", (e) => this.onWheel(e), {
            passive: false,
        });

        // Touch Pinch Gestures
        el.addEventListener("touchstart", (e) => this.onTouchStart(e), {
            passive: false,
        });
        el.addEventListener("touchmove", (e) => this.onTouchMove(e), {
            passive: false,
        });
        el.addEventListener("touchend", (e) => this.onTouchEnd(e));
    }

    getPointerPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
    }

    onPointerDown(e) {
        if (this.isFlipping || e.button !== 0 || window.isAnnotationActive)
            return;

        const pos = this.getPointerPos(e);
        const bx = this.bookX;
        const pw = this.pageWidth;
        const isTwo = this.isTwoPage && this.currentPage > 1;
        const bookWidth = isTwo ? pw * 2 : pw;

        // Check if clicked near right page edge or left page edge
        const isRightEdge =
            pos.x > bx + bookWidth - 140 && pos.x < bx + bookWidth + 40;
        const isLeftEdge = pos.x > bx - 40 && pos.x < bx + 140;

        if (isRightEdge && this.canGoNext()) {
            this.startDrag("right", pos.x, pos.y);
        } else if (isLeftEdge && this.canGoPrev()) {
            this.startDrag("left", pos.x, pos.y);
        }
    }

    startDrag(side, x, y) {
        this.isDragging = true;
        this.dragSide = side;
        this.dragStartX = x;
        this.dragStartY = y;
        this.dragCurrentX = x;
        this.dragCurrentY = y;
        this.dragTimestamp = performance.now();
        this.flipDirection = side === "right" ? 1 : -1;
        this.flipProgress = 0.02;
    }

    onPointerMove(e) {
        if (!this.isDragging) return;

        const pos = this.getPointerPos(e);
        this.dragCurrentX = pos.x;
        this.dragCurrentY = pos.y;

        const deltaX = this.dragCurrentX - this.dragStartX;
        const dragDistance = this.dragSide === "right" ? -deltaX : deltaX;
        const pw = this.pageWidth;

        // Calculate flip progress based on drag distance
        this.flipProgress = Math.max(0, Math.min(1, dragDistance / (pw * 1.1)));
        this.render();
    }

    onPointerUp(e) {
        if (!this.isDragging) return;
        this.isDragging = false;

        const dt = performance.now() - this.dragTimestamp;
        const deltaX = this.dragCurrentX - this.dragStartX;
        const velocity = Math.abs(deltaX) / Math.max(1, dt);

        // If dragged > 28% of page or fast swipe flick (> 0.45 px/ms in right direction)
        const shouldFlip =
            this.flipProgress > 0.28 ||
            (velocity > 0.45 && this.flipProgress > 0.08);

        if (shouldFlip) {
            // Animate remainder to 1.0 and finalize turn
            this.animateFlipRemainder(1.0, () => {
                this.finalizeTurn(this.flipDirection);
            });
        } else {
            // Cancel flip and animate back to 0.0
            this.animateFlipRemainder(0.0, () => {
                this.isFlipping = false;
                this.flipProgress = 0;
                this.render();
            });
        }
    }

    animateFlipRemainder(targetProgress, callback) {
        this.isFlipping = true;
        const startProg = this.flipProgress;
        const duration = 280;
        const startTime = performance.now();

        const step = (now) => {
            const elapsed = now - startTime;
            const t = Math.min(1, elapsed / duration);
            this.flipProgress =
                startProg +
                (targetProgress - startProg) *
                    (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

            this.render();

            if (t < 1) {
                requestAnimationFrame(step);
            } else {
                this.flipProgress = targetProgress;
                callback();
            }
        };

        requestAnimationFrame(step);
    }

    // =========================================================================
    // Zoom & Pinch Gestures
    // =========================================================================

    onWheel(e) {
        // Zoom with Ctrl or Alt or Trackpad Pinch
        if (e.ctrlKey || e.metaKey || e.altKey) {
            e.preventDefault();
            const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
            this.setZoom(this.zoom * zoomFactor);
        } else if (this.zoom > 1.05) {
            // Pan zoomed page with wheel
            e.preventDefault();
            this.panX -= e.deltaX * 0.8;
            this.panY -= e.deltaY * 0.8;
            this.render();
        }
    }

    onTouchStart(e) {
        if (e.touches.length === 2) {
            e.preventDefault();
            this.isPinching = true;
            this.touchStartDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY,
            );
            this.touchStartZoom = this.zoom;
        }
    }

    onTouchMove(e) {
        if (this.isPinching && e.touches.length === 2) {
            e.preventDefault();
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY,
            );
            if (this.touchStartDist > 0) {
                const factor = dist / this.touchStartDist;
                this.setZoom(this.touchStartZoom * factor);
            }
        }
    }

    onTouchEnd(e) {
        if (e.touches.length < 2) {
            this.isPinching = false;
        }
    }

    setZoom(val) {
        const oldZoom = this.zoom;
        this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, val));
        if (Math.abs(this.zoom - 1.0) < 0.05) {
            this.zoom = 1.0;
            this.panX = 0;
            this.panY = 0;
        }
        this.render();
        this.onZoomChange(Math.round(this.zoom * 100));
    }

    resetZoom() {
        this.zoom = 1.0;
        this.panX = 0;
        this.panY = 0;
        this.render();
        this.onZoomChange(100);
    }
}

window.FlipbookEngine = FlipbookEngine;

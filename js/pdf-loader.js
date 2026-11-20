/**
 * PDF Loader & Document Provider
 * ==============================
 * Handles loading external PDF files using PDF.js and rendering pages to offscreen canvases.
 * Includes a bounded LRU Canvas Cache (max 6–8 pages) that evicts distant pages and sets
 * canvas.width = canvas.height = 0 on eviction to immediately free GPU/VRAM texture memory.
 * Fully client-side with zero external backend dependencies.
 */

class DocumentProvider {
    constructor(options = {}) {
        this.currentDocId = "";
        this.currentTitle = "";
        this.pageCount = 0;
        this.maxCacheSize = options.maxCacheSize || 8; // Max 8 pages in bounded LRU cache
        this.pageCanvases = new Map(); // pageNum (1-based) -> HTMLCanvasElement (ordered by LRU recency)
        this.renderingPromises = new Map(); // pageNum -> Promise<HTMLCanvasElement>
        this.pdfDoc = null;
        this.isPdf = false;
        this.scale = 2.0; // High-DPI render multiplier for crisp text
        this.onPageRendered = null; // Callback when a page finishes rendering
        this.activePage = 1;
        this.defaultAspect = 1.414;
        this.getProtectedPageNumbers = () => new Set();
    }

    async init() {
        // Starts in clean onboarding state; ready to load user PDF
        return Promise.resolve();
    }

    /**
     * Retrieve page canvas from LRU cache.
     * Touching an entry moves it to the most-recently-used position.
     */
    getPage(pageNum) {
        if (!this.pageCanvases.has(pageNum)) {
            return null;
        }
        const canvas = this.pageCanvases.get(pageNum);
        // Refresh LRU recency: delete and re-insert at end of Map
        this.pageCanvases.delete(pageNum);
        this.pageCanvases.set(pageNum, canvas);
        return canvas;
    }

    /**
     * Store rendered page canvas into LRU cache and evict distant pages if exceeding maxCacheSize.
     */
    storePageCanvas(pageNum, canvas, protectedPages = new Set()) {
        if (this.pageCanvases.has(pageNum)) {
            const old = this.pageCanvases.get(pageNum);
            if (old && old !== canvas) {
                old.width = 0;
                old.height = 0;
            }
            this.pageCanvases.delete(pageNum);
        }
        this.pageCanvases.set(pageNum, canvas);
        this.trimCache(protectedPages);
    }

    /**
     * Trim LRU cache down to maxCacheSize by evicting pages farthest from active reading position.
     * Never evicts pages that are currently visible on screen (protectedPages).
     * Sets canvas.width = canvas.height = 0 on eviction to immediately release GPU texture memory.
     */
    trimCache(protectedPages = new Set()) {
        while (this.pageCanvases.size > this.maxCacheSize) {
            let candidateToEvict = null;
            let maxDistance = -1;
            const center = this.activePage || 1;

            // Find page with the greatest distance from current reading center that is NOT protected
            for (const p of this.pageCanvases.keys()) {
                if (protectedPages.has(p)) {
                    continue;
                }
                const dist = Math.abs(p - center);
                if (dist > maxDistance) {
                    maxDistance = dist;
                    candidateToEvict = p;
                }
            }

            // Fallback: if all pages are equidistant or none found above, pick oldest LRU not protected
            if (!candidateToEvict) {
                for (const p of this.pageCanvases.keys()) {
                    if (!protectedPages.has(p)) {
                        candidateToEvict = p;
                        break;
                    }
                }
            }

            // If everything in cache is currently protected (e.g. during rapid page transition), stop trimming
            if (!candidateToEvict) {
                break;
            }

            // Evict canvas and immediately release GPU/VRAM backing store
            const evictedCanvas = this.pageCanvases.get(candidateToEvict);
            if (evictedCanvas) {
                evictedCanvas.width = 0;
                evictedCanvas.height = 0;
            }
            this.pageCanvases.delete(candidateToEvict);
        }
    }

    /**
     * Explicitly destroy all cached canvas backing stores and reset cache state.
     */
    clearCache() {
        for (const canvas of this.pageCanvases.values()) {
            if (canvas) {
                canvas.width = 0;
                canvas.height = 0;
            }
        }
        this.pageCanvases.clear();
        this.renderingPromises.clear();
    }

    /**
     * Clean up all PDF document resources, workers, and cached canvases.
     */
    async destroy() {
        this.clearCache();
        if (this.pdfDoc) {
            try {
                await this.pdfDoc.destroy();
            } catch (_) {}
            this.pdfDoc = null;
        }
        this.isPdf = false;
        this.pageCount = 0;
        this.currentDocId = "";
        this.currentTitle = "";
    }

    async loadPdfFromFile(file, targetPage = 1) {
        const arrayBuffer = await file.arrayBuffer();
        // Stable docId based on name and file size for localStorage persistence across re-opens
        const docId = `pdf_${file.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_${file.size}`;
        return this.loadPdfFromArrayBuffer(arrayBuffer, file.name, docId, targetPage);
    }

    async loadPdfFromUrl(url, title = "Document", targetPage = 1) {
        if (typeof pdfjsLib === "undefined") {
            throw new Error("PDF.js library is not loaded");
        }
        const loadingTask = pdfjsLib.getDocument({ url });
        const pdf = await loadingTask.promise;
        const docId = `url_${url.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
        return this._processPdf(pdf, title, docId, targetPage);
    }

    async loadPdfFromArrayBuffer(
        arrayBuffer,
        title = "Uploaded Document",
        customDocId = null,
        targetPage = 1,
    ) {
        if (typeof pdfjsLib === "undefined") {
            throw new Error("PDF.js library is not loaded");
        }
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const docId = customDocId || "uploaded_" + Date.now();
        return this._processPdf(pdf, title, docId, targetPage);
    }

    async _processPdf(pdf, title, docId, targetPage = 1) {
        if (this.pdfDoc && this.pdfDoc !== pdf) {
            try {
                await this.pdfDoc.destroy();
            } catch (_) {}
        }
        this.clearCache();
        this.pdfDoc = pdf;
        this.isPdf = true;
        this.pageCount = pdf.numPages;
        this.currentTitle = title.replace(/\.[^/.]+$/, "");
        this.currentDocId = docId;
        this.activePage = targetPage;

        // Determine critical pages that must be rendered immediately
        // Page 1 (cover) + target page and its two-page spread partner
        const criticalPages = new Set([1]);
        const target = Math.max(1, Math.min(this.pageCount, targetPage || 1));
        criticalPages.add(target);

        if (target > 1) {
            const spreadLeft = target % 2 === 0 ? target : target - 1;
            if (spreadLeft >= 1 && spreadLeft <= this.pageCount) {
                criticalPages.add(spreadLeft);
            }
            if (spreadLeft + 1 <= this.pageCount) {
                criticalPages.add(spreadLeft + 1);
            }
        }

        // Render critical pages first and await their completion
        for (const p of criticalPages) {
            await this.renderPdfPage(p);
        }

        // Preload immediate adjacent neighbors in background within LRU capacity
        setTimeout(() => {
            this.preloadAround(target, true);
        }, 80);

        return {
            title: this.currentTitle,
            pageCount: this.pageCount,
            docId: this.currentDocId,
        };
    }

    /**
     * Proactively pre-render pages around the active page within LRU cache budget.
     */
    async preloadAround(currentPage, isTwoPage = true) {
        if (!this.pdfDoc || this.pageCount === 0) return;
        this.activePage = currentPage;

        const pagesToPreload = [];
        if (isTwoPage && currentPage > 1) {
            const spreadLeft = currentPage % 2 === 0 ? currentPage : currentPage - 1;
            // Preload next spread ahead (highest priority)
            if (spreadLeft + 2 <= this.pageCount) pagesToPreload.push(spreadLeft + 2);
            if (spreadLeft + 3 <= this.pageCount) pagesToPreload.push(spreadLeft + 3);
            // Preload previous spread behind
            if (spreadLeft - 2 >= 1) pagesToPreload.push(spreadLeft - 2);
            if (spreadLeft - 1 >= 1) pagesToPreload.push(spreadLeft - 1);
        } else {
            // Single page view: 1 page ahead, 1 page behind, 2 pages ahead
            if (currentPage + 1 <= this.pageCount) pagesToPreload.push(currentPage + 1);
            if (currentPage - 1 >= 1) pagesToPreload.push(currentPage - 1);
            if (currentPage + 2 <= this.pageCount) pagesToPreload.push(currentPage + 2);
        }

        // Render un-cached pages sequentially in background
        for (const p of pagesToPreload) {
            if (!this.pageCanvases.has(p) && !this.renderingPromises.has(p)) {
                try {
                    await this.renderPdfPage(p);
                } catch (_) {}
            }
        }
    }

    async ensurePages(pageNums) {
        const promises = [];
        for (const p of pageNums) {
            if (p && p >= 1 && p <= this.pageCount) {
                if (!this.pageCanvases.has(p)) {
                    promises.push(this.renderPdfPage(p));
                } else {
                    // Touch to refresh LRU recency
                    this.getPage(p);
                }
            }
        }
        if (promises.length > 0) {
            await Promise.all(promises);
        }
    }

    async renderPdfPage(pageNum) {
        if (this.pageCanvases.has(pageNum)) {
            return this.getPage(pageNum);
        }
        if (!this.pdfDoc || pageNum < 1 || pageNum > this.pageCount) {
            return null;
        }
        if (this.renderingPromises.has(pageNum)) {
            return this.renderingPromises.get(pageNum);
        }

        const renderPromise = (async () => {
            let page = null;
            try {
                page = await this.pdfDoc.getPage(pageNum);
                const viewport = page.getViewport({ scale: this.scale });

                // Capture document aspect ratio so resize never collapses even if page is evicted
                if (viewport && viewport.width > 0 && !this.defaultAspect) {
                    this.defaultAspect = viewport.height / viewport.width;
                }

                const canvas = document.createElement("canvas");
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext("2d");

                const renderContext = {
                    canvasContext: ctx,
                    viewport: viewport,
                };

                await page.render(renderContext).promise;

                let protectedSet = new Set();
                if (typeof this.getProtectedPageNumbers === "function") {
                    try {
                        protectedSet = this.getProtectedPageNumbers() || new Set();
                    } catch (_) {}
                }
                // Always protect the newly rendered page itself
                protectedSet.add(pageNum);

                this.storePageCanvas(pageNum, canvas, protectedSet);

                if (typeof this.onPageRendered === "function") {
                    this.onPageRendered(pageNum, canvas);
                }

                return canvas;
            } catch (e) {
                console.error(`Error rendering page ${pageNum}:`, e);
                return null;
            } finally {
                this.renderingPromises.delete(pageNum);
                if (page && typeof page.cleanup === "function") {
                    try {
                        page.cleanup();
                    } catch (_) {}
                }
            }
        })();

        this.renderingPromises.set(pageNum, renderPromise);
        return renderPromise;
    }
}

window.DocumentProvider = DocumentProvider;

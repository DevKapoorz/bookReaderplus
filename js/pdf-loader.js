/**
 * PDF Loader & Document Provider
 * ==============================
 * Handles loading external PDF files using PDF.js and rendering pages to offscreen canvases.
 * Supports prioritized rendering of resumed pages and progressive background caching.
 * Fully client-side with zero external backend dependencies.
 */

class DocumentProvider {
    constructor() {
        this.currentDocId = "";
        this.currentTitle = "";
        this.pageCount = 0;
        this.pageCanvases = new Map(); // pageNum (1-based) -> HTMLCanvasElement
        this.renderingPromises = new Map(); // pageNum -> Promise<HTMLCanvasElement>
        this.pdfDoc = null;
        this.isPdf = false;
        this.scale = 2.0; // High-DPI render multiplier for crisp text
        this.onPageRendered = null; // Callback when a page finishes rendering
    }

    async init() {
        // Starts in clean onboarding state; ready to load user PDF
        return Promise.resolve();
    }

    getPage(pageNum) {
        return this.pageCanvases.get(pageNum) || null;
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
        this.pdfDoc = pdf;
        this.isPdf = true;
        this.pageCount = pdf.numPages;
        this.currentTitle = title.replace(/\.[^/.]+$/, "");
        this.currentDocId = docId;
        this.pageCanvases.clear();
        this.renderingPromises.clear();

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

        // Render remaining pages progressively in background, prioritizing pages nearest to targetPage
        setTimeout(async () => {
            const sortedPages = [];
            for (let d = 1; d <= this.pageCount; d++) {
                const before = target - d;
                const after = target + d;
                if (before >= 1 && before <= this.pageCount && !criticalPages.has(before)) {
                    sortedPages.push(before);
                }
                if (after >= 1 && after <= this.pageCount && !criticalPages.has(after)) {
                    sortedPages.push(after);
                }
            }
            for (const p of sortedPages) {
                if (!this.pageCanvases.has(p)) {
                    await this.renderPdfPage(p);
                }
            }
        }, 60);

        return {
            title: this.currentTitle,
            pageCount: this.pageCount,
            docId: this.currentDocId,
        };
    }

    async ensurePages(pageNums) {
        const promises = [];
        for (const p of pageNums) {
            if (p && p >= 1 && p <= this.pageCount && !this.pageCanvases.has(p)) {
                promises.push(this.renderPdfPage(p));
            }
        }
        if (promises.length > 0) {
            await Promise.all(promises);
        }
    }

    async renderPdfPage(pageNum) {
        if (this.pageCanvases.has(pageNum)) {
            return this.pageCanvases.get(pageNum);
        }
        if (!this.pdfDoc || pageNum < 1 || pageNum > this.pageCount) {
            return null;
        }
        if (this.renderingPromises.has(pageNum)) {
            return this.renderingPromises.get(pageNum);
        }

        const renderPromise = (async () => {
            try {
                const page = await this.pdfDoc.getPage(pageNum);
                const viewport = page.getViewport({ scale: this.scale });

                const canvas = document.createElement("canvas");
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext("2d");

                const renderContext = {
                    canvasContext: ctx,
                    viewport: viewport,
                };

                await page.render(renderContext).promise;
                this.pageCanvases.set(pageNum, canvas);

                if (typeof this.onPageRendered === "function") {
                    this.onPageRendered(pageNum, canvas);
                }

                return canvas;
            } catch (e) {
                console.error(`Error rendering page ${pageNum}:`, e);
                return null;
            } finally {
                this.renderingPromises.delete(pageNum);
            }
        })();

        this.renderingPromises.set(pageNum, renderPromise);
        return renderPromise;
    }
}

window.DocumentProvider = DocumentProvider;

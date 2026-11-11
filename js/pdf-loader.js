/**
 * PDF Loader & Document Provider
 * ==============================
 * Handles loading external PDF files using PDF.js and rendering pages to offscreen canvases.
 * Fully client-side with zero external backend dependencies.
 */

class DocumentProvider {
    constructor() {
        this.currentDocId = "";
        this.currentTitle = "";
        this.pageCount = 0;
        this.pageCanvases = new Map(); // pageNum (1-based) -> HTMLCanvasElement
        this.pdfDoc = null;
        this.isPdf = false;
        this.scale = 2.0; // High-DPI render multiplier for crisp text
    }

    async init() {
        // Starts in clean onboarding state; ready to load user PDF
        return Promise.resolve();
    }

    getPage(pageNum) {
        return this.pageCanvases.get(pageNum) || null;
    }

    async loadPdfFromFile(file) {
        const arrayBuffer = await file.arrayBuffer();
        // Stable docId based on name and file size for localStorage persistence across re-opens
        const docId = `pdf_${file.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_${file.size}`;
        return this.loadPdfFromArrayBuffer(arrayBuffer, file.name, docId);
    }

    async loadPdfFromUrl(url, title = "Document") {
        if (typeof pdfjsLib === "undefined") {
            throw new Error("PDF.js library is not loaded");
        }
        const loadingTask = pdfjsLib.getDocument({ url });
        const pdf = await loadingTask.promise;
        const docId = `url_${url.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
        return this._processPdf(pdf, title, docId);
    }

    async loadPdfFromArrayBuffer(arrayBuffer, title = "Uploaded Document", customDocId = null) {
        if (typeof pdfjsLib === "undefined") {
            throw new Error("PDF.js library is not loaded");
        }
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const docId = customDocId || ("uploaded_" + Date.now());
        return this._processPdf(pdf, title, docId);
    }

    async _processPdf(pdf, title, docId) {
        this.pdfDoc = pdf;
        this.isPdf = true;
        this.pageCount = pdf.numPages;
        this.currentTitle = title.replace(/\.[^/.]+$/, "");
        this.currentDocId = docId;
        this.pageCanvases.clear();

        // Render first batch of pages immediately
        for (let i = 1; i <= Math.min(this.pageCount, 6); i++) {
            await this.renderPdfPage(i);
        }

        // Render remainder progressively in background
        setTimeout(async () => {
            for (let i = 7; i <= this.pageCount; i++) {
                if (!this.pageCanvases.has(i)) {
                    await this.renderPdfPage(i);
                }
            }
        }, 150);

        return {
            title: this.currentTitle,
            pageCount: this.pageCount,
            docId: this.currentDocId,
        };
    }

    async renderPdfPage(pageNum) {
        if (this.pageCanvases.has(pageNum)) {
            return this.pageCanvases.get(pageNum);
        }
        if (!this.pdfDoc || pageNum < 1 || pageNum > this.pageCount) {
            return null;
        }

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
            return canvas;
        } catch (e) {
            console.error(`Error rendering page ${pageNum}:`, e);
            return null;
        }
    }
}

window.DocumentProvider = DocumentProvider;

/**
 * Real Book Text Layer & In-Book Search Manager
 * ============================================
 * Provides selectable text (native vector PDF text, NO OCR),
 * clickable internal/external PDF link annotations with direct page jumping,
 * and high-performance in-book search with real-time match highlighting.
 */

class TextLayerManager {
    constructor(overlayElement, flipbookEngine, docProvider) {
        this.overlay = overlayElement;
        this.engine = flipbookEngine;
        this.docProvider = docProvider;
        this.renderedPages = new Map(); // pageNum -> { container, width, height }
        this.currentSearchMatches = [];
        this.activeSearchMatchIndex = -1;
        this.searchQuery = "";
    }

    clear() {
        if (this.overlay) {
            this.overlay.innerHTML = "";
        }
        this.renderedPages.clear();
    }

    /**
     * Update overlay positioning, scale, and visibility to match canvas book.
     */
    update() {
        if (!this.overlay || !this.docProvider || !this.docProvider.isPdf || this.docProvider.pageCount === 0) {
            if (this.overlay) this.overlay.style.display = "none";
            return;
        }

        // Hide overlay during 3D flip animation or drag peel so canvas physics remain smooth and unmarred
        if (this.engine.isFlipping || this.engine.isDragging) {
            this.overlay.style.display = "none";
            return;
        }

        this.overlay.style.display = "";

        const w = this.engine.stageWidth;
        const h = this.engine.stageHeight;
        this.overlay.style.width = `${w}px`;
        this.overlay.style.height = `${h}px`;
        this.overlay.style.transformOrigin = `${w / 2}px ${h / 2}px`;
        this.overlay.style.transform = `translate(${this.engine.panX}px, ${this.engine.panY}px) scale(${this.engine.zoom})`;

        const visiblePages = this.getVisiblePageRects();
        const currentVisiblePageNums = new Set(visiblePages.map((p) => p.pageNum));

        // Remove containers for pages that are no longer visible
        for (const [pageNum, entry] of this.renderedPages.entries()) {
            if (!currentVisiblePageNums.has(pageNum)) {
                if (entry.container && entry.container.parentNode) {
                    entry.container.parentNode.removeChild(entry.container);
                }
                this.renderedPages.delete(pageNum);
            }
        }

        // Render or update visible pages
        for (const pageInfo of visiblePages) {
            const { pageNum, x, y, pw, ph } = pageInfo;
            let entry = this.renderedPages.get(pageNum);

            if (entry && (entry.width !== pw || entry.height !== ph)) {
                // Dimensions changed (e.g. resize), re-create
                if (entry.container && entry.container.parentNode) {
                    entry.container.parentNode.removeChild(entry.container);
                }
                this.renderedPages.delete(pageNum);
                entry = null;
            }

            if (!entry) {
                this.renderPageOverlay(pageNum, x, y, pw, ph);
            } else {
                // Update position
                entry.container.style.left = `${x}px`;
                entry.container.style.top = `${y}px`;
                entry.container.style.width = `${pw}px`;
                entry.container.style.height = `${ph}px`;
            }
        }
    }

    getVisiblePageRects() {
        const list = [];
        const bx = this.engine.bookX;
        const by = this.engine.bookY;
        const pw = this.engine.pageWidth;
        const ph = this.engine.pageHeight;

        if (!this.engine.isTwoPage) {
            list.push({ pageNum: this.engine.currentPage, x: bx, y: by, pw, ph });
        } else {
            if (this.engine.currentPage === 1) {
                // Single cover page on right
                list.push({ pageNum: 1, x: bx + pw, y: by, pw, ph });
            } else {
                const spread = this.engine.getSpreadPages();
                if (spread.left && spread.left <= this.docProvider.pageCount) {
                    list.push({ pageNum: spread.left, x: bx, y: by, pw, ph });
                }
                if (spread.right && spread.right <= this.docProvider.pageCount) {
                    list.push({ pageNum: spread.right, x: bx + pw, y: by, pw, ph });
                }
            }
        }
        return list;
    }

    async renderPageOverlay(pageNum, x, y, pw, ph) {
        if (!this.docProvider.pdfDoc || pageNum < 1 || pageNum > this.docProvider.pageCount) {
            return;
        }

        const container = document.createElement("div");
        container.className = "page-text-container";
        container.setAttribute("data-page", pageNum);
        container.style.left = `${x}px`;
        container.style.top = `${y}px`;
        container.style.width = `${pw}px`;
        container.style.height = `${ph}px`;
        this.overlay.appendChild(container);

        this.renderedPages.set(pageNum, { container, width: pw, height: ph });

        try {
            const page = await this.docProvider.pdfDoc.getPage(pageNum);
            const unscaledViewport = page.getViewport({ scale: 1.0 });
            const scale = pw / unscaledViewport.width;
            const viewport = page.getViewport({ scale });

            // 1. Text Layer (Selectable text + Search highlights)
            const textContent = await page.getTextContent();
            this.buildTextLayer(textContent, viewport, container, pageNum);

            // 2. Link Layer (Internal page jumps & External URLs)
            const annotations = await page.getAnnotations();
            this.buildLinkLayer(annotations, viewport, container, pageNum);

            if (typeof page.cleanup === "function") {
                page.cleanup();
            }
        } catch (e) {
            console.warn(`Failed to render overlay for page ${pageNum}:`, e);
        }
    }

    buildTextLayer(textContent, viewport, container, pageNum) {
        const textLayer = document.createElement("div");
        textLayer.className = "pdf-text-layer";
        textLayer.setAttribute("data-page", pageNum);

        if (!textContent || !textContent.items) {
            container.appendChild(textLayer);
            return;
        }

        const query = this.searchQuery ? this.searchQuery.toLowerCase() : "";

        for (let i = 0; i < textContent.items.length; i++) {
            const item = textContent.items[i];
            if (!item.str && item.str !== " ") continue;

            const m = this.transformMatrix(viewport.transform, item.transform);
            const fontHeight = Math.hypot(m[2], m[3]);
            const left = m[4];
            const top = m[5] - fontHeight;

            const span = document.createElement("span");
            span.textContent = item.str;
            span.style.left = `${left}px`;
            span.style.top = `${top}px`;
            span.style.fontSize = `${fontHeight}px`;
            if (item.fontName) {
                span.style.fontFamily = item.fontName;
            }

            // Search highlight check
            if (query && item.str.toLowerCase().includes(query)) {
                span.classList.add("search-highlight");
                if (
                    this.activeSearchMatchIndex >= 0 &&
                    this.currentSearchMatches[this.activeSearchMatchIndex] &&
                    this.currentSearchMatches[this.activeSearchMatchIndex].pageNum === pageNum
                ) {
                    span.classList.add("search-highlight-active");
                }
            }

            textLayer.appendChild(span);
        }

        container.appendChild(textLayer);
    }

    async buildLinkLayer(annotations, viewport, container, pageNum) {
        if (!annotations || annotations.length === 0) return;

        const linkLayer = document.createElement("div");
        linkLayer.className = "pdf-link-layer";

        for (const annot of annotations) {
            if (annot.subtype !== "Link" || !annot.rect) continue;

            const rect = viewport.convertToViewportRectangle(annot.rect);
            const left = Math.min(rect[0], rect[2]);
            const top = Math.min(rect[1], rect[3]);
            const width = Math.abs(rect[0] - rect[2]);
            const height = Math.abs(rect[1] - rect[3]);

            if (width < 2 || height < 2) continue;

            const link = document.createElement("a");
            link.className = "pdf-link";
            link.style.left = `${left}px`;
            link.style.top = `${top}px`;
            link.style.width = `${width}px`;
            link.style.height = `${height}px`;

            if (annot.url) {
                link.href = annot.url;
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                link.title = annot.url;
            } else if (annot.dest) {
                const targetPage = await this.docProvider.resolveDestination(annot.dest);
                if (targetPage && targetPage >= 1 && targetPage <= this.docProvider.pageCount) {
                    link.href = `#page=${targetPage}`;
                    link.setAttribute("data-page-target", targetPage);
                    link.title = `Jump to Page ${targetPage}`;
                    link.addEventListener("click", (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.engine.goToPage(targetPage);
                    });
                }
            }

            linkLayer.appendChild(link);
        }

        container.appendChild(linkLayer);
    }

    transformMatrix(m1, m2) {
        return [
            m1[0] * m2[0] + m1[2] * m2[1],
            m1[1] * m2[0] + m1[3] * m2[1],
            m1[0] * m2[2] + m1[2] * m2[3],
            m1[1] * m2[2] + m1[3] * m2[3],
            m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
            m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
        ];
    }
}

class SearchManager {
    constructor(textLayerManager, flipbookEngine, docProvider) {
        this.textLayerManager = textLayerManager;
        this.engine = flipbookEngine;
        this.docProvider = docProvider;

        // UI elements
        this.floatingBar = document.getElementById("searchFloatingBar");
        this.searchInput = document.getElementById("searchInput");
        this.matchBadge = document.getElementById("searchMatchBadge");
        this.btnPrev = document.getElementById("btnSearchPrev");
        this.btnNext = document.getElementById("btnSearchNext");
        this.btnClose = document.getElementById("btnSearchClose");
        this.btnToggleSearch = document.getElementById("btnSearch");

        this.matches = [];
        this.currentIndex = -1;
        this.searchDebounce = null;

        this.bindEvents();
    }

    bindEvents() {
        if (this.btnToggleSearch) {
            this.btnToggleSearch.addEventListener("click", () => this.toggle());
        }
        if (this.btnClose) {
            this.btnClose.addEventListener("click", () => this.close());
        }
        if (this.btnNext) {
            this.btnNext.addEventListener("click", () => this.next());
        }
        if (this.btnPrev) {
            this.btnPrev.addEventListener("click", () => this.prev());
        }
        if (this.searchInput) {
            this.searchInput.addEventListener("input", () => {
                clearTimeout(this.searchDebounce);
                this.searchDebounce = setTimeout(() => this.executeSearch(), 200);
            });
            this.searchInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    if (e.shiftKey) {
                        this.prev();
                    } else {
                        this.next();
                    }
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    this.close();
                }
            });
        }
    }

    open() {
        if (!this.floatingBar) return;
        this.floatingBar.style.display = "flex";
        if (this.btnToggleSearch) this.btnToggleSearch.classList.add("active");
        if (this.searchInput) {
            this.searchInput.focus();
            this.searchInput.select();
        }
    }

    close() {
        if (!this.floatingBar) return;
        this.floatingBar.style.display = "none";
        if (this.btnToggleSearch) this.btnToggleSearch.classList.remove("active");
        this.matches = [];
        this.currentIndex = -1;
        this.updateBadge();
        this.textLayerManager.searchQuery = "";
        this.textLayerManager.currentSearchMatches = [];
        this.textLayerManager.activeSearchMatchIndex = -1;
        this.textLayerManager.update();
    }

    toggle() {
        if (!this.floatingBar) return;
        if (this.floatingBar.style.display === "none" || !this.floatingBar.style.display) {
            this.open();
        } else {
            this.close();
        }
    }

    async executeSearch() {
        const query = (this.searchInput ? this.searchInput.value : "").trim();
        if (query.length < 2) {
            this.matches = [];
            this.currentIndex = -1;
            this.updateBadge();
            this.textLayerManager.searchQuery = "";
            this.textLayerManager.currentSearchMatches = [];
            this.textLayerManager.activeSearchMatchIndex = -1;
            this.textLayerManager.update();
            return;
        }

        if (this.matchBadge) this.matchBadge.textContent = "Searching...";
        this.matches = await this.docProvider.searchAllPages(query);
        this.textLayerManager.searchQuery = query;
        this.textLayerManager.currentSearchMatches = this.matches;

        if (this.matches.length > 0) {
            this.currentIndex = 0;
            this.updateBadge();
            this.goToCurrentMatch();
        } else {
            this.currentIndex = -1;
            this.updateBadge();
            this.textLayerManager.update();
        }
    }

    next() {
        if (this.matches.length === 0) return;
        this.currentIndex = (this.currentIndex + 1) % this.matches.length;
        this.updateBadge();
        this.goToCurrentMatch();
    }

    prev() {
        if (this.matches.length === 0) return;
        this.currentIndex = (this.currentIndex - 1 + this.matches.length) % this.matches.length;
        this.updateBadge();
        this.goToCurrentMatch();
    }

    updateBadge() {
        if (!this.matchBadge) return;
        if (this.matches.length === 0) {
            this.matchBadge.textContent = "0 of 0";
        } else {
            this.matchBadge.textContent = `${this.currentIndex + 1} of ${this.matches.length}`;
        }
    }

    goToCurrentMatch() {
        if (this.currentIndex < 0 || this.currentIndex >= this.matches.length) return;
        const match = this.matches[this.currentIndex];
        this.textLayerManager.activeSearchMatchIndex = this.currentIndex;

        if (this.engine.currentPage !== match.pageNum && !this.engine.isPageVisible(match.pageNum)) {
            this.engine.goToPage(match.pageNum);
        } else {
            this.textLayerManager.update();
        }
    }
}

if (typeof window !== "undefined") {
    window.TextLayerManager = TextLayerManager;
    window.SearchManager = SearchManager;
}

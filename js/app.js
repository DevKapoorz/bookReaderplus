/**
 * Flipbook Reader Main App
 * ========================
 * Coordinates DocumentProvider, FlipbookEngine, AnnotationManager,
 * UI controls, gesture navigation, and backend persistence.
 */

document.addEventListener("DOMContentLoaded", async () => {
    // Elements
    const bookCanvas = document.getElementById("bookCanvas");
    const annotationCanvas = document.getElementById("annotationCanvas");
    const bookTitleDisplay = document.getElementById("bookTitleDisplay");
    const pageIndicatorBadge = document.getElementById("pageIndicatorBadge");
    const pageSlider = document.getElementById("pageSlider");
    const zoomIndicatorPill = document.getElementById("zoomIndicatorPill");

    const btnOpenPdf = document.getElementById("btnOpenPdf");
    const pdfFileInput = document.getElementById("pdfFileInput");
    const btnToggleSpread = document.getElementById("btnToggleSpread");
    const iconTwoPage = document.getElementById("iconTwoPage");
    const iconOnePage = document.getElementById("iconOnePage");
    const btnToggleDarkMode = document.getElementById("btnToggleDarkMode");
    const iconMoon = document.getElementById("iconMoon");
    const iconSun = document.getElementById("iconSun");
    const btnZoomIn = document.getElementById("btnZoomIn");
    const btnZoomOut = document.getElementById("btnZoomOut");
    const btnFullscreen = document.getElementById("btnFullscreen");

    const btnTurnPrevExtreme = document.getElementById("btnTurnPrevExtreme");
    const btnTurnNextExtreme = document.getElementById("btnTurnNextExtreme");

    const fabContainer = document.getElementById("fabContainer");
    const fabMenuBtn = document.getElementById("fabMenuBtn");
    const optionsPalettePanel = document.getElementById("optionsPalettePanel");
    const saveStatusIndicator = document.getElementById("saveStatusIndicator");

    const toolBtns = document.querySelectorAll(".tool-btn");
    const colorSwatches = document.querySelectorAll(".color-swatch");
    const strokeChips = document.querySelectorAll(".stroke-chip");
    const btnEraserTool = document.getElementById("btnEraserTool");
    const btnUndoAnnot = document.getElementById("btnUndoAnnot");
    const btnClearPageAnnot = document.getElementById("btnClearPageAnnot");
    const btnSaveHistoryManual = document.getElementById(
        "btnSaveHistoryManual",
    );

    const fileDropzoneOverlay = document.getElementById("fileDropzoneOverlay");
    const toastNotification = document.getElementById("toastNotification");
    const toastMessage = document.getElementById("toastMessage");

    // Initialize PDF worker if pdfjsLib available
    if (typeof pdfjsLib !== "undefined") {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }

    // 1. Initialize Document Provider
    const docProvider = new DocumentProvider();
    await docProvider.init();

    // 2. Initialize Flipbook Engine (Default: Two-Page View, Page 1 as Cover Page)
    const flipbook = new FlipbookEngine(bookCanvas, docProvider, {
        isTwoPage: true, // Default per requirement
        onPageChange: (info) => {
            updatePageControls(info);
            annotationManager.render();
        },
        onZoomChange: (pct) => {
            zoomIndicatorPill.textContent = `${pct}%`;
            annotationManager.render();
        },
        onPanChange: () => {
            annotationManager.render();
        },
    });

    // 3. Initialize Annotation Layer
    const annotationManager = new AnnotationManager(annotationCanvas, flipbook);
    annotationManager.onStatusChange = (status) => {
        saveStatusIndicator.textContent = status;
    };

    // Load annotations from history.json for default book
    await annotationManager.loadFromHistory(docProvider.currentDocId);

    // Synchronize initial UI state
    updatePageControls(flipbook.getPageStatusInfo());
    bookTitleDisplay.textContent = docProvider.currentTitle;

    function showToast(msg, duration = 2200) {
        toastMessage.textContent = msg;
        toastNotification.classList.add("show");
        setTimeout(() => {
            toastNotification.classList.remove("show");
        }, duration);
    }

    function updatePageControls(info) {
        pageIndicatorBadge.textContent = info.label;
        pageSlider.max = info.total;
        pageSlider.value = info.current;

        // Dim extreme buttons if at boundaries
        btnTurnPrevExtreme.style.visibility = flipbook.canGoPrev()
            ? "visible"
            : "hidden";
        btnTurnNextExtreme.style.visibility = flipbook.canGoNext()
            ? "visible"
            : "hidden";

        flipbook.updateTurnButtonPositions();
    }

    // =========================================================================
    // Extreme Left and Right Transparent Page Turn Buttons
    // =========================================================================
    btnTurnPrevExtreme.addEventListener("click", (e) => {
        e.stopPropagation();
        flipbook.turnPrev();
    });

    btnTurnNextExtreme.addEventListener("click", (e) => {
        e.stopPropagation();
        flipbook.turnNext();
    });

    // Page Scrubber Slider
    pageSlider.addEventListener("input", (e) => {
        const targetPage = parseInt(e.target.value, 10);
        flipbook.goToPage(targetPage);
    });

    // =========================================================================
    // View Mode Toggle (1-Page vs 2-Page View)
    // Default is Two-Page View, first page is Cover
    // =========================================================================
    btnToggleSpread.addEventListener("click", () => {
        flipbook.toggleViewMode();
        const isTwo = flipbook.isTwoPage;
        document.body.setAttribute(
            "data-view-mode",
            isTwo ? "two-page" : "one-page",
        );
        btnToggleSpread.classList.toggle("active", isTwo);
        iconTwoPage.style.display = isTwo ? "block" : "none";
        iconOnePage.style.display = isTwo ? "none" : "block";
        annotationManager.render();
        showToast(isTwo ? "Two-Page Spread View" : "One-Page View");
    });

    // =========================================================================
    // Dark Mode Toggle (Default: Dark Mode)
    // =========================================================================
    btnToggleDarkMode.addEventListener("click", () => {
        document.body.classList.toggle("light-mode");
        document.body.classList.toggle("dark-mode");
        const isDark = document.body.classList.contains("dark-mode");
        btnToggleDarkMode.classList.toggle("active", isDark);
        iconMoon.style.display = isDark ? "block" : "none";
        iconSun.style.display = isDark ? "none" : "block";

        // If default book, re-render demo pages for new theme
        if (!docProvider.isPdf) {
            docProvider.generateDefaultBook().then(() => {
                flipbook.render();
                annotationManager.render();
            });
        } else {
            flipbook.render();
            annotationManager.render();
        }

        showToast(isDark ? "Dark Reading Mode" : "Light Archival Mode");
    });

    // =========================================================================
    // Zoom Controls & Reset
    // =========================================================================
    btnZoomIn.addEventListener("click", () => {
        flipbook.setZoom(flipbook.zoom * 1.15);
    });

    btnZoomOut.addEventListener("click", () => {
        flipbook.setZoom(flipbook.zoom * 0.85);
    });

    zoomIndicatorPill.addEventListener("click", () => {
        flipbook.resetZoom();
    });

    // Fullscreen
    btnFullscreen.addEventListener("click", () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    });

    // =========================================================================
    // Floating Circle with Three Dots & Options Menu
    // Hover or click opens the options
    // =========================================================================
    fabMenuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        fabContainer.classList.toggle("is-open");
    });

    // Close fab on outside click
    document.addEventListener("click", (e) => {
        if (!fabContainer.contains(e.target)) {
            fabContainer.classList.remove("is-open");
        }
    });

    // =========================================================================
    // Tool Selection (Annotate, Highlighter, Text, Ellipse, Rectangle)
    // =========================================================================
    toolBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            const tool = btn.dataset.tool;
            if (annotationManager.activeTool === tool) {
                // Deselect tool -> Return to normal reading mode
                btn.classList.remove("active");
                annotationManager.setTool(null);
                showToast("Reading Mode");
            } else {
                toolBtns.forEach((b) => b.classList.remove("active"));
                btnEraserTool.classList.remove("active");
                btn.classList.add("active");
                annotationManager.setTool(tool);

                const labels = {
                    draw: "Pen Annotate",
                    highlighter: "Highlighter",
                    text: "Text Write (Click on page)",
                    rectangle: "Rectangle Shape",
                    ellipse: "Ellipse Shape",
                };
                showToast(labels[tool] || tool);
            }
        });
    });

    // Eraser Tool
    btnEraserTool.addEventListener("click", () => {
        if (annotationManager.activeTool === "eraser") {
            btnEraserTool.classList.remove("active");
            annotationManager.setTool(null);
            showToast("Reading Mode");
        } else {
            toolBtns.forEach((b) => b.classList.remove("active"));
            btnEraserTool.classList.add("active");
            annotationManager.setTool("eraser");
            showToast("Eraser (Click any note/mark to erase)");
        }
    });

    // Color Swatches
    colorSwatches.forEach((swatch) => {
        swatch.addEventListener("click", () => {
            colorSwatches.forEach((s) => s.classList.remove("active"));
            swatch.classList.add("active");
            annotationManager.setColor(swatch.dataset.color);
        });
    });

    // Stroke Size Chips
    strokeChips.forEach((chip) => {
        chip.addEventListener("click", () => {
            strokeChips.forEach((c) => c.classList.remove("active"));
            chip.classList.add("active");
            annotationManager.setStrokeWidth(parseInt(chip.dataset.width, 10));
        });
    });

    // Undo & Clear
    btnUndoAnnot.addEventListener("click", () => {
        annotationManager.undo();
    });

    btnClearPageAnnot.addEventListener("click", () => {
        if (confirm("Clear all annotations on this page?")) {
            annotationManager.clearCurrentPages();
        }
    });

    // Save to history.json button
    btnSaveHistoryManual.addEventListener("click", async () => {
        const curDoc = docProvider.currentDocId;
        const curPage = flipbook.currentPage;
        await annotationManager.saveToHistory(curDoc, curPage);
        showToast("Annotations saved to history.json");
    });

    // =========================================================================
    // PDF Upload & File Loading
    // =========================================================================
    btnOpenPdf.addEventListener("click", () => {
        pdfFileInput.click();
    });

    pdfFileInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (file) {
            await loadCustomPdf(file);
        }
        pdfFileInput.value = "";
    });

    // Drag & Drop PDF
    window.addEventListener("dragover", (e) => {
        e.preventDefault();
        fileDropzoneOverlay.classList.add("drag-active");
    });

    window.addEventListener("dragleave", (e) => {
        if (e.relatedTarget === null) {
            fileDropzoneOverlay.classList.remove("drag-active");
        }
    });

    window.addEventListener("drop", async (e) => {
        e.preventDefault();
        fileDropzoneOverlay.classList.remove("drag-active");
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
                await loadCustomPdf(file);
            } else {
                alert("Please drop a valid PDF document.");
            }
        }
    });

    async function loadCustomPdf(file) {
        try {
            showToast(`Loading "${file.name}"...`);
            const info = await docProvider.loadPdfFromFile(file);
            bookTitleDisplay.textContent = info.title;
            flipbook.currentPage = 1; // Start on cover
            flipbook.resize();
            await annotationManager.loadFromHistory(info.docId);
            updatePageControls(flipbook.getPageStatusInfo());
            showToast(`Loaded ${info.pageCount} pages`);
        } catch (err) {
            console.error(err);
            alert("Failed to load PDF: " + err.message);
        }
    }

    // =========================================================================
    // Keyboard Shortcuts
    // =========================================================================
    window.addEventListener("keydown", (e) => {
        // If typing inside an input/textarea, ignore shortcuts
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
            return;

        if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
            e.preventDefault();
            flipbook.turnNext();
        } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
            e.preventDefault();
            flipbook.turnPrev();
        } else if (e.key === "ArrowUp") {
            if (flipbook.zoom > 1.05) {
                e.preventDefault();
                flipbook.panBy(0, 60); // Navigate up
            }
        } else if (e.key === "ArrowDown") {
            if (flipbook.zoom > 1.05) {
                e.preventDefault();
                flipbook.panBy(0, -60); // Navigate down
            }
        } else if (e.key === "d" || e.key === "D") {
            btnToggleDarkMode.click();
        } else if (e.key === "v" || e.key === "V") {
            btnToggleSpread.click();
        } else if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (e.shiftKey) {
                annotationManager.redo();
            } else {
                annotationManager.undo();
            }
        } else if (e.key === "y" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            annotationManager.redo();
        } else if (e.key === "Escape") {
            toolBtns.forEach((b) => b.classList.remove("active"));
            btnEraserTool.classList.remove("active");
            annotationManager.setTool(null);
            fabContainer.classList.remove("is-open");
        }
    });

    // Window Resize
    window.addEventListener("resize", () => {
        flipbook.resize();
        annotationManager.render();
    });

    // =========================================================================
    // Tab-Active & Inactivity Auto-Hide Controller (Titlebar & Pages HUD)
    // "visible only when the tab is active and then they go invisible after some time of inactivity"
    // =========================================================================
    const topNavbar = document.getElementById("topNavbar");
    const bottomReadingBar = document.getElementById("bottomReadingBar");

    let hudInactivityTimer = null;
    const INACTIVITY_DELAY = 2600; // 2.6 seconds of inactivity to auto-hide
    let isMouseOverHud = false;
    let isTabActive = !document.hidden;

    function showHud() {
        if (!isTabActive) return; // Only visible when tab is active
        topNavbar.classList.remove("hud-hidden");
        bottomReadingBar.classList.remove("hud-hidden");
        scheduleHudHide();
    }

    function hideHud() {
        if (isMouseOverHud || fabContainer.classList.contains("is-open"))
            return;
        topNavbar.classList.add("hud-hidden");
        bottomReadingBar.classList.add("hud-hidden");
    }

    function scheduleHudHide() {
        clearTimeout(hudInactivityTimer);
        if (!isMouseOverHud && !fabContainer.classList.contains("is-open")) {
            hudInactivityTimer = setTimeout(() => {
                hideHud();
            }, INACTIVITY_DELAY);
        }
    }

    // Pointer / touch / keyboard activity reveals the titlebar & pages HUD
    const onUserActivity = () => {
        if (isTabActive) {
            showHud();
        }
    };

    window.addEventListener("mousemove", onUserActivity, { passive: true });
    window.addEventListener("pointermove", onUserActivity, { passive: true });
    window.addEventListener("touchstart", onUserActivity, { passive: true });
    window.addEventListener("keydown", onUserActivity, { passive: true });

    // Hover detection so HUD remains visible while hovering / using controls
    [topNavbar, bottomReadingBar, fabContainer].forEach((el) => {
        if (!el) return;
        el.addEventListener("mouseenter", () => {
            isMouseOverHud = true;
            clearTimeout(hudInactivityTimer);
            showHud();
        });
        el.addEventListener("mouseleave", () => {
            isMouseOverHud = false;
            scheduleHudHide();
        });
    });

    // Visibility and tab focus listeners
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            isTabActive = false;
            clearTimeout(hudInactivityTimer);
            topNavbar.classList.add("hud-hidden");
            bottomReadingBar.classList.add("hud-hidden");
        } else {
            isTabActive = true;
            showHud();
        }
    });

    window.addEventListener("blur", () => {
        isTabActive = false;
        clearTimeout(hudInactivityTimer);
        topNavbar.classList.add("hud-hidden");
        bottomReadingBar.classList.add("hud-hidden");
    });

    window.addEventListener("focus", () => {
        isTabActive = true;
        showHud();
    });

    // Initial display: show on load, then auto-hide after inactivity
    showHud();
});

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
    const pagePrefix = document.getElementById("pagePrefix");
    const pageNumberInput = document.getElementById("pageNumberInput");
    const pageSuffix = document.getElementById("pageSuffix");
    const pageSlider = document.getElementById("pageSlider");
    const sliderPageBubble = document.getElementById("sliderPageBubble");
    const zoomIndicatorPill = document.getElementById("zoomIndicatorPill");

    const topNavbar = document.getElementById("topNavbar");
    const bottomReadingBar = document.getElementById("bottomReadingBar");

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
    const btnPaletteClose = document.getElementById("btnPaletteClose");
    const activeToolPill = document.getElementById("activeToolPill");
    const toolPropertiesSection = document.getElementById("toolPropertiesSection");

    const toolBtns = document.querySelectorAll(".tool-btn");
    const colorSwatches = document.querySelectorAll(".color-swatch");
    const strokeChips = document.querySelectorAll(".stroke-chip");
    const btnEraserTool = document.getElementById("btnEraserTool");
    const btnUndoAnnot = document.getElementById("btnUndoAnnot");
    const btnRedoAnnot = document.getElementById("btnRedoAnnot");
    const btnClearPageAnnot = document.getElementById("btnClearPageAnnot");

    const onboardingView = document.getElementById("onboardingView");
    const onboardingCard = document.getElementById("onboardingCard");
    const onboardingDropBox = document.getElementById("onboardingDropBox");
    const onboardingFileInput = document.getElementById("onboardingFileInput");
    const btnOnboardingSelect = document.getElementById("btnOnboardingSelect");
    const onboardingRecentBox = document.getElementById("onboardingRecentBox");
    const recentDocName = document.getElementById("recentDocName");
    const recentDocMeta = document.getElementById("recentDocMeta");

    const fileDropzoneOverlay = document.getElementById("fileDropzoneOverlay");
    const toastNotification = document.getElementById("toastNotification");
    const toastMessage = document.getElementById("toastMessage");

    // Initialize PDF worker if pdfjsLib available
    if (typeof pdfjsLib !== "undefined") {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }

    // 1. Initialize Document Provider (Clean onboarding state)
    const docProvider = new DocumentProvider();
    await docProvider.init();

    // Load saved zoom from localStorage (default: 1.0, min: 0.8, max: 3.0)
    let savedZoom = 1.0;
    try {
        const rawZoom = localStorage.getItem("flipbook_zoom");
        if (rawZoom !== null) {
            const parsed = parseFloat(rawZoom);
            if (!isNaN(parsed) && parsed >= 0.8 && parsed <= 3.0) {
                savedZoom = parsed;
            }
        }
    } catch (_) {}

    // Load saved view mode from localStorage (default: true for two-page spread)
    let savedIsTwoPage = true;
    try {
        const rawViewMode = localStorage.getItem("flipbook_view_mode");
        if (rawViewMode === "one-page" || rawViewMode === "single") {
            savedIsTwoPage = false;
        } else if (rawViewMode === "two-page" || rawViewMode === "double") {
            savedIsTwoPage = true;
        }
    } catch (_) {}

    // 2. Initialize Flipbook Engine (Default: Two-Page View, Page 1 as Cover Page)
    const flipbook = new FlipbookEngine(bookCanvas, docProvider, {
        isTwoPage: savedIsTwoPage, // Restored or default per requirement
        initialZoom: savedZoom,
        onPageChange: (info) => {
            updatePageControls(info);
            annotationManager.render();
            if (docProvider.currentDocId && info.current > 0) {
                localStorage.setItem(
                    `flipbook_last_page_${docProvider.currentDocId}`,
                    info.current,
                );
                try {
                    const recentRaw = localStorage.getItem("flipbook_recent_doc");
                    if (recentRaw) {
                        const rec = JSON.parse(recentRaw);
                        if (rec.docId === docProvider.currentDocId) {
                            rec.lastPage = info.current;
                            localStorage.setItem(
                                "flipbook_recent_doc",
                                JSON.stringify(rec),
                            );
                        }
                    }
                } catch (_) {}
            }
        },
        onZoomChange: (pct) => {
            if (zoomIndicatorPill) {
                zoomIndicatorPill.textContent = `${pct}%`;
            }
            annotationManager.render();
            try {
                localStorage.setItem("flipbook_zoom", flipbook.zoom);
            } catch (_) {}
        },
        onPanChange: () => {
            annotationManager.render();
        },
    });

    if (zoomIndicatorPill) {
        zoomIndicatorPill.textContent = `${Math.round(flipbook.zoom * 100)}%`;
    }

    // 3. Initialize Annotation Layer
    const annotationManager = new AnnotationManager(annotationCanvas, flipbook);
    window.annotationManager = annotationManager;

    // Re-render automatically whenever any visible page finishes rendering
    docProvider.onPageRendered = (pageNum) => {
        if (
            flipbook &&
            typeof flipbook.isPageVisible === "function" &&
            flipbook.isPageVisible(pageNum)
        ) {
            flipbook.render();
            annotationManager.render();
        }
    };

    // Initial state: Show onboarding if no PDF loaded
    setAppReadingState(false);
    updateRecentDocUI();

    function setAppReadingState(hasBook) {
        if (hasBook) {
            document.body.classList.add("has-book");
            if (topNavbar) topNavbar.classList.remove("hud-hidden");
            if (bottomReadingBar) bottomReadingBar.classList.remove("hud-hidden");
            scheduleHudHide();
        } else {
            document.body.classList.remove("has-book");
            bookTitleDisplay.textContent = "Flipbook Reader";
        }
    }

    function updateRecentDocUI() {
        if (!onboardingRecentBox || !recentDocName || !recentDocMeta) return;
        try {
            const raw = localStorage.getItem("flipbook_recent_doc");
            if (raw) {
                const doc = JSON.parse(raw);
                if (doc && doc.title) {
                    recentDocName.textContent = doc.fileName || doc.title;
                    recentDocMeta.textContent = `${doc.pageCount} pages • Last read: Page ${doc.lastPage || 1}`;
                    onboardingRecentBox.style.display = "block";
                    return;
                }
            }
        } catch (_) {}
        onboardingRecentBox.style.display = "none";
    }

    function showToast(msg, duration = 2200) {
        toastMessage.textContent = msg;
        toastNotification.classList.add("show");
        setTimeout(() => {
            toastNotification.classList.remove("show");
        }, duration);
    }

    function updatePageControls(info) {
        if (pageSlider) {
            pageSlider.max = info.total;
            pageSlider.value = info.current;
        }

        // Only update input if user is not actively typing in it
        if (pageNumberInput && document.activeElement !== pageNumberInput) {
            if (info.current === 1) {
                if (pagePrefix) pagePrefix.textContent = "Cover (";
                pageNumberInput.value = "1";
                if (pageSuffix) pageSuffix.textContent = `of ${info.total})`;
            } else if (info.isTwoPage) {
                const spread = flipbook.getSpreadPages();
                if (pagePrefix) pagePrefix.textContent = "Pages";
                pageNumberInput.value = spread.right
                    ? `${spread.left}–${spread.right}`
                    : `${spread.left}`;
                if (pageSuffix) pageSuffix.textContent = `of ${info.total}`;
            } else {
                if (pagePrefix) pagePrefix.textContent = "Page";
                pageNumberInput.value = `${info.current}`;
                if (pageSuffix) pageSuffix.textContent = `of ${info.total}`;
            }
            // Auto-size input field to fit content width
            pageNumberInput.style.width = `${Math.max(28, (pageNumberInput.value.length + 1) * 8.5)}px`;
        }

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
    // Typeable Page Number Input (Pages area just before scrollbar)
    // =========================================================================
    if (pageNumberInput) {
        pageNumberInput.addEventListener("focus", () => {
            pageNumberInput.select();
        });

        pageNumberInput.addEventListener("click", () => {
            pageNumberInput.select();
        });

        const commitPageInput = () => {
            const valStr = pageNumberInput.value.trim();
            const match = valStr.match(/\d+/);
            if (match) {
                const targetPage = parseInt(match[0], 10);
                if (targetPage >= 1 && targetPage <= docProvider.pageCount) {
                    flipbook.goToPage(targetPage);
                    return;
                }
            }
            updatePageControls(flipbook.getPageStatusInfo());
        };

        pageNumberInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                commitPageInput();
                pageNumberInput.blur();
            } else if (e.key === "Escape") {
                e.preventDefault();
                updatePageControls(flipbook.getPageStatusInfo());
                pageNumberInput.blur();
            }
        });

        pageNumberInput.addEventListener("blur", () => {
            commitPageInput();
        });
    }

    if (pageIndicatorBadge && pageNumberInput) {
        pageIndicatorBadge.addEventListener("click", (e) => {
            if (e.target !== pageNumberInput) {
                pageNumberInput.focus();
                pageNumberInput.select();
            }
        });
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

    // =========================================================================
    // Page Scrubber Slider & Real-time Floating Bubble
    // =========================================================================
    let sliderDebounce = null;
    let bubbleHideTimeout = null;

    function getSliderPageLabel(val) {
        const total = docProvider.pageCount;
        if (val === 1) return `Cover (Page 1 of ${total})`;
        if (flipbook.isTwoPage) {
            const left = val % 2 === 0 ? val : val - 1;
            const right = left + 1 <= total ? left + 1 : null;
            return right
                ? `Pages ${left}–${right} of ${total}`
                : `Page ${left} of ${total}`;
        }
        return `Page ${val} of ${total}`;
    }

    function updateSliderBubble(val) {
        if (!sliderPageBubble || !pageSlider) return;
        const min = parseInt(pageSlider.min, 10) || 1;
        const max = parseInt(pageSlider.max, 10) || 1;
        const ratio = max > min ? (val - min) / (max - min) : 0;

        sliderPageBubble.textContent = getSliderPageLabel(val);

        // Position bubble right above the moving slider thumb
        const sliderWidth = pageSlider.offsetWidth;
        const thumbRadius = 7;
        const thumbX = thumbRadius + ratio * (sliderWidth - thumbRadius * 2);
        sliderPageBubble.style.left = `${thumbX}px`;
    }

    function showSliderBubble() {
        if (!sliderPageBubble || !pageSlider) return;
        clearTimeout(bubbleHideTimeout);
        sliderPageBubble.classList.add("visible");
        const val = parseInt(pageSlider.value, 10);
        updateSliderBubble(val);
    }

    function hideSliderBubble(delay = 400) {
        if (!sliderPageBubble) return;
        clearTimeout(bubbleHideTimeout);
        bubbleHideTimeout = setTimeout(() => {
            sliderPageBubble.classList.remove("visible");
        }, delay);
    }

    pageSlider.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        showSliderBubble();
        updateSliderBubble(val);

        // Live preview in page number badge as you drag
        if (pageNumberInput && document.activeElement !== pageNumberInput) {
            if (val === 1) {
                if (pagePrefix) pagePrefix.textContent = "Cover (";
                pageNumberInput.value = "1";
                if (pageSuffix) pageSuffix.textContent = `of ${docProvider.pageCount})`;
            } else if (flipbook.isTwoPage) {
                const left = val % 2 === 0 ? val : val - 1;
                const right = left + 1 <= docProvider.pageCount ? left + 1 : null;
                if (pagePrefix) pagePrefix.textContent = "Pages";
                pageNumberInput.value = right ? `${left}–${right}` : `${left}`;
                if (pageSuffix) pageSuffix.textContent = `of ${docProvider.pageCount}`;
            } else {
                if (pagePrefix) pagePrefix.textContent = "Page";
                pageNumberInput.value = `${val}`;
                if (pageSuffix) pageSuffix.textContent = `of ${docProvider.pageCount}`;
            }
            pageNumberInput.style.width = `${Math.max(28, (pageNumberInput.value.length + 1) * 8.5)}px`;
        }

        // Debounce page navigation while dragging
        clearTimeout(sliderDebounce);
        sliderDebounce = setTimeout(() => {
            flipbook.goToPage(val);
        }, 45);
    });

    pageSlider.addEventListener("change", (e) => {
        const val = parseInt(e.target.value, 10);
        flipbook.goToPage(val);
        hideSliderBubble(300);
    });

    pageSlider.addEventListener("pointerdown", () => showSliderBubble());
    pageSlider.addEventListener("touchstart", () => showSliderBubble(), { passive: true });
    pageSlider.addEventListener("pointerup", () => hideSliderBubble(400));
    pageSlider.addEventListener("touchend", () => hideSliderBubble(400));
    pageSlider.addEventListener("mouseleave", () => hideSliderBubble(500));

    // =========================================================================
    // View Mode Toggle (1-Page vs 2-Page View with LocalStorage persistence)
    // Default is Two-Page View, first page is Cover
    // =========================================================================
    function applyViewMode(isTwo, save = true) {
        flipbook.setViewMode(isTwo);
        document.body.setAttribute(
            "data-view-mode",
            isTwo ? "two-page" : "one-page",
        );
        if (btnToggleSpread) {
            btnToggleSpread.classList.toggle("active", isTwo);
            btnToggleSpread.setAttribute(
                "aria-label",
                isTwo ? "Two-Page Spread View" : "Single Page View",
            );
        }
        if (iconTwoPage) iconTwoPage.style.display = isTwo ? "block" : "none";
        if (iconOnePage) iconOnePage.style.display = isTwo ? "none" : "block";
        if (annotationManager) annotationManager.render();

        if (save) {
            try {
                localStorage.setItem(
                    "flipbook_view_mode",
                    isTwo ? "two-page" : "one-page",
                );
            } catch (_) {}
        }
    }

    // Apply saved view mode on startup
    applyViewMode(savedIsTwoPage, false);

    btnToggleSpread.addEventListener("click", () => {
        const nextIsTwo = !flipbook.isTwoPage;
        applyViewMode(nextIsTwo, true);
        showToast(nextIsTwo ? "Two-Page Spread View" : "One-Page View");
    });

    // =========================================================================
    // Theme Management (Dark Mode / Light Mode with LocalStorage persistence)
    // =========================================================================
    function applyTheme(theme, save = true) {
        const isDark = theme !== "light";
        document.body.classList.toggle("light-mode", !isDark);
        document.body.classList.toggle("dark-mode", isDark);
        if (btnToggleDarkMode) {
            btnToggleDarkMode.classList.toggle("active", isDark);
            btnToggleDarkMode.setAttribute(
                "aria-label",
                isDark ? "Dark Mode" : "Light Mode",
            );
        }
        if (iconMoon) iconMoon.style.display = isDark ? "block" : "none";
        if (iconSun) iconSun.style.display = isDark ? "none" : "block";

        if (save) {
            try {
                localStorage.setItem("flipbook_theme", isDark ? "dark" : "light");
            } catch (_) {}
        }

        // If default book, re-render demo pages for new theme
        if (!docProvider.isPdf) {
            if (typeof docProvider.generateDefaultBook === "function") {
                docProvider.generateDefaultBook().then(() => {
                    flipbook.render();
                    annotationManager.render();
                });
            } else {
                flipbook.render();
                annotationManager.render();
            }
        } else {
            flipbook.render();
            annotationManager.render();
        }
    }

    // Restore saved theme from localStorage on startup
    try {
        const savedTheme = localStorage.getItem("flipbook_theme");
        if (savedTheme) {
            applyTheme(savedTheme, false);
        } else {
            const isDark = document.body.classList.contains("dark-mode");
            applyTheme(isDark ? "dark" : "light", false);
        }
    } catch (_) {
        applyTheme("dark", false);
    }

    btnToggleDarkMode.addEventListener("click", () => {
        const currentlyDark = document.body.classList.contains("dark-mode");
        const nextTheme = currentlyDark ? "light" : "dark";
        applyTheme(nextTheme, true);
        showToast(nextTheme === "dark" ? "Dark Reading Mode" : "Light Archival Mode");
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
    // Hover opens the options smoothly; clicking locks/toggles it
    // =========================================================================
    fabMenuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        fabContainer.classList.toggle("is-open");
    });

    if (btnPaletteClose) {
        btnPaletteClose.addEventListener("click", (e) => {
            e.stopPropagation();
            fabContainer.classList.remove("is-open");
        });
    }

    // Close fab on outside click
    document.addEventListener("click", (e) => {
        if (!fabContainer.contains(e.target)) {
            fabContainer.classList.remove("is-open");
        }
    });

    // =========================================================================
    // Unified Tool State Controller (Pen, Highlight, Text, Rectangle, Ellipse, Eraser)
    // =========================================================================
    function updateToolUiState(tool) {
        // 1. Synchronize tool buttons
        toolBtns.forEach((b) => {
            b.classList.toggle("active", b.dataset.tool === tool);
        });

        // 2. Synchronize active tool status pill in header
        if (activeToolPill) {
            const dot = activeToolPill.querySelector(".active-dot");
            const label = activeToolPill.querySelector(".active-label");
            if (tool) {
                const labels = {
                    draw: "Pen Active",
                    highlighter: "Highlight Active",
                    text: "Text Active",
                    rectangle: "Rectangle Active",
                    ellipse: "Ellipse Active",
                    eraser: "Eraser Active",
                };
                if (label) label.textContent = labels[tool] || `${tool} Active`;
                if (dot) {
                    dot.style.backgroundColor =
                        tool === "eraser"
                            ? "#ff5a79"
                            : annotationManager.currentColor;
                    dot.style.transform = "scale(1.25)";
                }
            } else {
                if (label) label.textContent = "Reading Mode";
                if (dot) {
                    dot.style.backgroundColor = "#888888";
                    dot.style.transform = "scale(1)";
                }
            }
        }

        // 3. Update FAB 3-dots circle engagement ring & active color
        if (tool) {
            fabMenuBtn.classList.add("tool-engaged");
            const activeColor =
                tool === "eraser"
                    ? "#ff5a79"
                    : annotationManager.currentColor;
            fabMenuBtn.style.setProperty("--tool-active-color", activeColor);
        } else {
            fabMenuBtn.classList.remove("tool-engaged");
            fabMenuBtn.style.removeProperty("--tool-active-color");
        }

        // 4. Dim/disable properties section if Eraser is active
        if (toolPropertiesSection) {
            toolPropertiesSection.classList.toggle("is-disabled", tool === "eraser");
        }
    }

    // Connect AnnotationManager callbacks
    annotationManager.onToolChange = (tool) => {
        updateToolUiState(tool);
    };

    annotationManager.onHistoryChange = ({ canUndo, canRedo }) => {
        if (btnUndoAnnot) btnUndoAnnot.disabled = !canUndo;
        if (btnRedoAnnot) btnRedoAnnot.disabled = !canRedo;
    };
    annotationManager.notifyHistoryChange();

    annotationManager.onStatusChange = (status) => {
        if (status) showToast(status);
    };

    // Tool Buttons (Includes all 6: Pen, Highlight, Text, Rectangle, Ellipse, Eraser)
    toolBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            const tool = btn.dataset.tool;
            if (annotationManager.activeTool === tool) {
                // Deselect tool -> Return to normal reading mode
                annotationManager.setTool(null);
                showToast("Reading Mode");
            } else {
                annotationManager.setTool(tool);

                const labels = {
                    draw: "Pen Annotate (Draw freely)",
                    highlighter: "Highlighter (Mark text)",
                    text: "Text Note (Click page to place)",
                    rectangle: "Rectangle Shape (Drag to draw)",
                    ellipse: "Ellipse Shape (Drag to draw)",
                    eraser: "Eraser (Click mark to erase)",
                };
                showToast(labels[tool] || tool);
            }
        });
    });

    // Header Status Pill Click -> Quick Switch to Reading Mode
    if (activeToolPill) {
        activeToolPill.addEventListener("click", () => {
            if (annotationManager.activeTool) {
                annotationManager.setTool(null);
                showToast("Reading Mode");
            }
        });
    }

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

    // Undo, Redo & Clear
    btnUndoAnnot.addEventListener("click", () => {
        annotationManager.undo();
    });

    if (btnRedoAnnot) {
        btnRedoAnnot.addEventListener("click", () => {
            annotationManager.redo();
        });
    }

    btnClearPageAnnot.addEventListener("click", () => {
        if (confirm("Clear all annotations on this page?")) {
            annotationManager.clearCurrentPages();
        }
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

    // Onboarding Drop & Browse Handlers
    if (btnOnboardingSelect && onboardingFileInput) {
        btnOnboardingSelect.addEventListener("click", (e) => {
            e.stopPropagation();
            onboardingFileInput.click();
        });
    }

    if (onboardingDropBox && onboardingFileInput) {
        onboardingDropBox.addEventListener("click", () => {
            onboardingFileInput.click();
        });
        onboardingDropBox.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onboardingFileInput.click();
            }
        });
        onboardingDropBox.addEventListener("dragover", (e) => {
            e.preventDefault();
            onboardingDropBox.classList.add("drag-active");
        });
        onboardingDropBox.addEventListener("dragleave", () => {
            onboardingDropBox.classList.remove("drag-active");
        });
        onboardingDropBox.addEventListener("drop", async (e) => {
            e.preventDefault();
            onboardingDropBox.classList.remove("drag-active");
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
                    await loadCustomPdf(file);
                } else {
                    alert("Please drop a valid PDF document.");
                }
            }
        });
    }

    if (onboardingRecentBox && onboardingFileInput) {
        onboardingRecentBox.addEventListener("click", () => {
            onboardingFileInput.click();
        });
    }

    if (onboardingFileInput) {
        onboardingFileInput.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (file) {
                await loadCustomPdf(file);
            }
            onboardingFileInput.value = "";
        });
    }

    // Window Drag & Drop PDF
    window.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (document.body.classList.contains("has-book")) {
            fileDropzoneOverlay.classList.add("drag-active");
        } else if (onboardingDropBox) {
            onboardingDropBox.classList.add("drag-active");
        }
    });

    window.addEventListener("dragleave", (e) => {
        if (e.relatedTarget === null) {
            fileDropzoneOverlay.classList.remove("drag-active");
            if (onboardingDropBox) {
                onboardingDropBox.classList.remove("drag-active");
            }
        }
    });

    window.addEventListener("drop", async (e) => {
        e.preventDefault();
        fileDropzoneOverlay.classList.remove("drag-active");
        if (onboardingDropBox) {
            onboardingDropBox.classList.remove("drag-active");
        }
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
                await loadCustomPdf(file);
            } else {
                alert("Please drop a valid PDF document.");
            }
        }
    });

    async function loadCustomPdf(file) {
        try {
            if (onboardingCard) {
                onboardingCard.classList.add("is-loading");
            }
            if (btnOnboardingSelect) {
                btnOnboardingSelect.innerHTML = `
                    <svg class="spin-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
                        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
                        <path d="M12 2a10 10 0 0 1 10 10"></path>
                    </svg>
                    <span>Opening "${file.name}"...</span>
                `;
            }
            showToast(`Loading "${file.name}"...`);

            // Compute expected docId and targetPage before loading so PDF loader prioritizes rendering it
            const docId = `pdf_${file.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_${file.size}`;
            const savedLastPage = parseInt(
                localStorage.getItem(`flipbook_last_page_${docId}`),
                10,
            );
            const targetPage =
                savedLastPage && savedLastPage >= 1 ? savedLastPage : 1;

            const info = await docProvider.loadPdfFromFile(file, targetPage);
            bookTitleDisplay.textContent = info.title;

            flipbook.currentPage =
                targetPage <= info.pageCount ? targetPage : 1;

            // Ensure current spread pages are fully rendered before drawing
            const spreadToEnsure = [flipbook.currentPage];
            if (flipbook.isTwoPage && flipbook.currentPage > 1) {
                const spread = flipbook.getSpreadPages();
                if (spread.left) spreadToEnsure.push(spread.left);
                if (spread.right) spreadToEnsure.push(spread.right);
            }
            await docProvider.ensurePages(spreadToEnsure);

            // Load saved annotations for this document from localStorage
            annotationManager.loadFromLocalStorage(info.docId);

            // Transition from onboarding to active book reader smoothly
            setAppReadingState(true);
            flipbook.resize();
            updatePageControls(flipbook.getPageStatusInfo());
            annotationManager.render();

            // Save recent document record in localStorage
            localStorage.setItem(
                "flipbook_recent_doc",
                JSON.stringify({
                    docId: info.docId,
                    title: info.title,
                    pageCount: info.pageCount,
                    lastPage: flipbook.currentPage,
                    fileName: file.name,
                    timestamp: Date.now(),
                }),
            );

            showToast(
                savedLastPage && savedLastPage > 1
                    ? `Resumed "${file.name}" at Page ${flipbook.currentPage}`
                    : `Opened "${file.name}" (${info.pageCount} pages)`,
            );
        } catch (err) {
            console.error(err);
            alert("Failed to load PDF: " + err.message);
        } finally {
            if (onboardingCard) {
                onboardingCard.classList.remove("is-loading");
            }
            if (btnOnboardingSelect) {
                btnOnboardingSelect.innerHTML = `
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                    <span>Choose PDF File</span>
                `;
            }
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
        } else if (e.key === "+" || e.key === "=") {
            e.preventDefault();
            flipbook.setZoom(flipbook.zoom * 1.15);
        } else if (e.key === "-" || e.key === "_") {
            e.preventDefault();
            flipbook.setZoom(flipbook.zoom * 0.85);
        } else if (e.key === "0" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            flipbook.resetZoom();
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
    let hudInactivityTimer = null;
    const INACTIVITY_DELAY = 2600; // 2.6 seconds of inactivity to auto-hide
    let isMouseOverHud = false;
    let isTabActive = !document.hidden;

    function showHud() {
        if (!isTabActive || !document.body.classList.contains("has-book")) return;
        if (topNavbar) topNavbar.classList.remove("hud-hidden");
        if (bottomReadingBar) bottomReadingBar.classList.remove("hud-hidden");
        scheduleHudHide();
    }

    function hideHud() {
        if (
            isMouseOverHud ||
            fabContainer.classList.contains("is-open") ||
            window.isAnnotationActive ||
            !document.body.classList.contains("has-book")
        ) {
            return;
        }
        if (topNavbar) topNavbar.classList.add("hud-hidden");
        if (bottomReadingBar) bottomReadingBar.classList.add("hud-hidden");
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

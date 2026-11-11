/**
 * PDF Loader & Document Provider
 * ==============================
 * Handles loading external PDF files using PDF.js and rendering pages to offscreen canvases.
 * Also provides an exquisitely crafted built-in 12-page classic illustrated demo book so
 * the reader is instantly functional out-of-the-box!
 */

class DocumentProvider {
    constructor() {
        this.currentDocId = "default_book";
        this.currentTitle = "The Art of Reading";
        this.pageCount = 12;
        this.pageCanvases = new Map(); // pageNum (1-based) -> HTMLCanvasElement
        this.pdfDoc = null;
        this.isPdf = false;
        this.scale = 2.0; // High-DPI render multiplier for crisp text
    }

    async init() {
        // Generate built-in default book pages initially
        await this.generateDefaultBook();
    }

    getPage(pageNum) {
        return this.pageCanvases.get(pageNum) || null;
    }

    async loadPdfFromFile(file) {
        const arrayBuffer = await file.arrayBuffer();
        return this.loadPdfFromArrayBuffer(arrayBuffer, file.name);
    }

    async loadPdfFromUrl(url, title = "Document") {
        if (typeof pdfjsLib === "undefined") {
            throw new Error("PDF.js library is not loaded");
        }
        const loadingTask = pdfjsLib.getDocument({ url });
        const pdf = await loadingTask.promise;
        return this._processPdf(pdf, title, url);
    }

    async loadPdfFromArrayBuffer(arrayBuffer, title = "Uploaded Document") {
        if (typeof pdfjsLib === "undefined") {
            throw new Error("PDF.js library is not loaded");
        }
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        return this._processPdf(pdf, title, "uploaded_" + Date.now());
    }

    async _processPdf(pdf, title, docId) {
        this.pdfDoc = pdf;
        this.isPdf = true;
        this.pageCount = pdf.numPages;
        this.currentTitle = title.replace(/\.[^/.]+$/, "");
        this.currentDocId = "doc_" + docId.replace(/[^a-zA-Z0-9_-]/g, "_");
        this.pageCanvases.clear();

        // Render pages lazily or batch first few
        for (let i = 1; i <= Math.min(this.pageCount, 6); i++) {
            await this.renderPdfPage(i);
        }

        // Render remainder in background
        setTimeout(async () => {
            for (let i = 7; i <= this.pageCount; i++) {
                if (!this.pageCanvases.has(i)) {
                    await this.renderPdfPage(i);
                }
            }
        }, 200);

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
        if (!this.pdfDoc || pageNum < 1 || pageNum > this.pageCount)
            return null;

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
        } catch (err) {
            console.error(`Failed to render PDF page ${pageNum}:`, err);
            return null;
        }
    }

    /**
     * Generates a 12-page classic literary book with authentic typography,
     * ornaments, chapter art, drop caps, and diagrams.
     */
    async generateDefaultBook() {
        this.isPdf = false;
        this.currentDocId = "default_book";
        this.currentTitle = "The Art of Reading: A Bibliophile's Compendium";
        this.pageCount = 12;
        this.pageCanvases.clear();

        const w = 1000;
        const h = 1414; // A-ratio aspect (1 : 1.4142)

        for (let p = 1; p <= this.pageCount; p++) {
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");

            this.renderDemoPageContent(ctx, p, w, h);
            this.pageCanvases.set(p, canvas);
        }
    }

    renderDemoPageContent(ctx, pageNum, w, h) {
        const isDark = document.body.classList.contains("dark-mode");

        // Page 1: Front Cover
        if (pageNum === 1) {
            this.drawFrontCover(ctx, w, h);
            return;
        }

        // Page 12: Back Cover
        if (pageNum === 12) {
            this.drawBackCover(ctx, w, h);
            return;
        }

        // Interior Pages Background (archival warm paper or dark paper)
        const paperColor = isDark ? "#22242c" : "#fbf8f1";
        const textColor = isDark ? "#e6e8f0" : "#2b2623";
        const subtextColor = isDark ? "#9da4b8" : "#73695f";
        const accentColor = isDark ? "#d4af37" : "#9b6c35"; // Antique gold

        ctx.fillStyle = paperColor;
        ctx.fillRect(0, 0, w, h);

        // Subtle paper grain vignette
        const grad = ctx.createRadialGradient(
            w / 2,
            h / 2,
            w * 0.3,
            w / 2,
            h / 2,
            w * 0.8,
        );
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(
            1,
            isDark ? "rgba(0,0,0,0.22)" : "rgba(160, 130, 90, 0.08)",
        );
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Outer framing rule
        ctx.strokeStyle = isDark
            ? "rgba(255,255,255,0.06)"
            : "rgba(0,0,0,0.08)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(60, 60, w - 120, h - 120);

        // Header & Footer
        ctx.font = 'italic 18px "Georgia", serif';
        ctx.fillStyle = subtextColor;
        ctx.textAlign = "center";

        // Running header
        const isLeftPage = pageNum % 2 === 0;
        const headerText = isLeftPage
            ? "THE ART OF READING"
            : "A BIBLIOPHILE'S COMPENDIUM";
        ctx.fillText(headerText, w / 2, 95);

        // Page Number
        ctx.font = '20px "Georgia", serif';
        ctx.fillText(`${pageNum}`, w / 2, h - 90);

        // Page Specific Content
        ctx.textAlign = "left";
        ctx.fillStyle = textColor;

        switch (pageNum) {
            case 2:
                // Table of Contents
                this.drawContentsPage(
                    ctx,
                    w,
                    h,
                    accentColor,
                    textColor,
                    subtextColor,
                    isDark,
                );
                break;
            case 3:
                // Chapter I: The Architecture of Thought
                this.drawChapterStart(
                    ctx,
                    w,
                    h,
                    "CHAPTER I",
                    "The Architecture of Thought",
                    "T",
                    "o hold a volume between one's palms is to cradle a quiet monument of centuries. The tactile cadence of paper—its gentle whisper under the thumb, the subtle aromatic perfume of binding glue and dried ink—transports the reader beyond mere words on a screen.",
                    [
                        "In every enduring book, there lies an unspoken dialogue between the typography and the human mind. The margins are not empty; they are the breath of the text, giving cadence to the reader's contemplation.",
                        "When we annotate a passage, circling an illuminating phrase or scribbling in the quiet margin, we etch our own consciousness into the timeless record of ideas.",
                        "Thus, reading ceases to be passive observation; it transforms into an intimate communion with the author's deepest reflections.",
                    ],
                    accentColor,
                    textColor,
                    subtextColor,
                    isDark,
                );
                break;
            case 4:
                // Classical Diagram / Illustration: Golden Ratio of Typography
                this.drawDiagramPage(
                    ctx,
                    w,
                    h,
                    accentColor,
                    textColor,
                    subtextColor,
                    isDark,
                );
                break;
            case 5:
                // Chapter II: The Art of Marginalia
                this.drawChapterStart(
                    ctx,
                    w,
                    h,
                    "CHAPTER II",
                    "The Art of Marginalia",
                    "M",
                    "arginalia is the whispered echo of the solitary thinker. From the meticulous notes of Isaac Newton to the fiery commentaries of Samuel Taylor Coleridge, the margin has long served as a private laboratory of thought.",
                    [
                        "To annotate is to declare that an idea struck with such resonance that silence was no longer sufficient. A quick underline, a gentle bracket, or a star in the border transforms a printed monument into an active dialogue.",
                        "Modern tools now grant us the freedom to annotate without defacing the pristine beauty of the leaf. Each stroke, highlight, and note may be gathered into an enduring history, forever preserved alongside the text.",
                    ],
                    accentColor,
                    textColor,
                    subtextColor,
                    isDark,
                );
                break;
            case 6:
                // Illustrated Spread / Quote
                this.drawQuoteSpread(
                    ctx,
                    w,
                    h,
                    "“A room without books is like a body without a soul.”",
                    "— Marcus Tullius Cicero, 106–43 BC",
                    accentColor,
                    textColor,
                    subtextColor,
                    isDark,
                );
                break;
            case 7:
                // Chapter III: The Physicality of the Page
                this.drawChapterStart(
                    ctx,
                    w,
                    h,
                    "CHAPTER III",
                    "The Physicality of the Page",
                    "P",
                    "aper possesses weight, resistance, and light. When the eye glances across a two-page spread, it does not scan as a machine does; it wanders in rhythmic arcs, guided by proportion and whitespace.",
                    [
                        "The double-page spread, known in classical typography as the 'opening', operates as a harmonious whole. The gutter brings stability, while the outer fore-edge invites the hand to peel and turn.",
                        "As digital interfaces evolve, we yearn not for flat cold glass, but for the tangible grace of turning leaves—the sensory curl, the depth of shadow, and the gentle anticipation of what lies on the reverse.",
                    ],
                    accentColor,
                    textColor,
                    subtextColor,
                    isDark,
                );
                break;
            case 8:
                // Botanical / Celestial Engraving Style Illustration
                this.drawEngravingPage(
                    ctx,
                    w,
                    h,
                    accentColor,
                    textColor,
                    subtextColor,
                    isDark,
                );
                break;
            case 9:
                // Chapter IV: Memory & Typography
                this.drawChapterStart(
                    ctx,
                    w,
                    h,
                    "CHAPTER IV",
                    "Memory and Typography",
                    "L",
                    "etters are vessels of light. The subtle serifs carved into classical typefaces are not ornamental flourishes; they guide the human gaze across lines of verse and prose like gentle stepping stones across water.",
                    [
                        "Studies in cognition demonstrate that spatial orientation within a physical book anchors memory. We recall not merely what we read, but where it rested—upper right, two-thirds down, just beneath a folded corner.",
                        "By retaining this spatial intuition in digital reading, we cultivate a deeper, more enduring retention of wisdom.",
                    ],
                    accentColor,
                    textColor,
                    subtextColor,
                    isDark,
                );
                break;
            case 10:
                // Interactive Study Guide / Checklist
                this.drawStudyPage(
                    ctx,
                    w,
                    h,
                    accentColor,
                    textColor,
                    subtextColor,
                    isDark,
                );
                break;
            case 11:
                // Epilogue & Colophon
                this.drawColophon(
                    ctx,
                    w,
                    h,
                    accentColor,
                    textColor,
                    subtextColor,
                    isDark,
                );
                break;
            default:
                break;
        }
    }

    drawFrontCover(ctx, w, h) {
        // Rich leather / cloth hardcover aesthetic (Navy / Obsidian / Burgundy)
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, "#1c2230");
        grad.addColorStop(0.5, "#121622");
        grad.addColorStop(1, "#0b0d14");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Embossed gold leaf ornamental border
        ctx.strokeStyle = "#c49b63";
        ctx.lineWidth = 4;
        ctx.strokeRect(50, 50, w - 100, h - 100);

        ctx.strokeStyle = "rgba(196, 155, 99, 0.4)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(62, 62, w - 124, h - 124);

        // Corner Ornaments
        this.drawCornerOrnaments(ctx, 50, 50, w - 100, h - 100, "#c49b63");

        // Spine border accent on left
        const spineGrad = ctx.createLinearGradient(0, 0, 40, 0);
        spineGrad.addColorStop(0, "rgba(0,0,0,0.6)");
        spineGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = spineGrad;
        ctx.fillRect(0, 0, 40, h);

        // Title Block
        ctx.textAlign = "center";

        // Top vignette ornament
        ctx.font = "32px serif";
        ctx.fillStyle = "#c49b63";
        ctx.fillText("❖  ◈  ❖", w / 2, 280);

        ctx.font = 'bold 54px "Georgia", serif';
        ctx.fillStyle = "#f8ecd5";
        ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
        ctx.shadowBlur = 15;
        ctx.fillText("THE ART OF", w / 2, 400);
        ctx.fillText("READING", w / 2, 470);

        // Gold divider
        ctx.strokeStyle = "#c49b63";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(w / 2 - 140, 520);
        ctx.lineTo(w / 2 + 140, 520);
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.font = 'italic 26px "Georgia", serif';
        ctx.fillStyle = "#d8be92";
        ctx.fillText("A Bibliophile's Compendium of", w / 2, 580);
        ctx.fillText("Typography, Memory & Marginalia", w / 2, 624);

        // Center emblem (book & star emblem)
        ctx.save();
        ctx.translate(w / 2, 850);
        ctx.strokeStyle = "#c49b63";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 90, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, 80, 0, Math.PI * 2);
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.font = "54px serif";
        ctx.fillStyle = "#c49b63";
        ctx.fillText("📖", 0, 18);
        ctx.restore();

        // Edition label at bottom
        ctx.font = 'bold 18px "Georgia", serif';
        ctx.fillStyle = "#ab8b5c";
        ctx.fillText("COLLECTOR’S FOLIO EDITION", w / 2, 1180);
        ctx.font = 'italic 16px "Georgia", serif';
        ctx.fillText("OXFORD & LONDON • MCMXXIV", w / 2, 1220);
    }

    drawBackCover(ctx, w, h) {
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, "#1c2230");
        grad.addColorStop(0.5, "#121622");
        grad.addColorStop(1, "#0b0d14");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = "#c49b63";
        ctx.lineWidth = 3;
        ctx.strokeRect(50, 50, w - 100, h - 100);

        this.drawCornerOrnaments(ctx, 50, 50, w - 100, h - 100, "#c49b63");

        ctx.textAlign = "center";
        ctx.font = 'italic 24px "Georgia", serif';
        ctx.fillStyle = "#d8be92";
        ctx.fillText(
            "“A book is a device to ignite the imagination.”",
            w / 2,
            600,
        );

        ctx.font = '16px "Georgia", serif';
        ctx.fillStyle = "#ab8b5c";
        ctx.fillText("— ALAN BENNETT", w / 2, 650);

        // Barcode & Emblem
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillRect(w / 2 - 100, 1050, 200, 70);
        ctx.fillStyle = "#111";
        for (let x = w / 2 - 90; x < w / 2 + 90; x += 6) {
            if (Math.sin(x * 12) > -0.2) {
                ctx.fillRect(x, 1060, x % 4 === 0 ? 3 : 1.5, 50);
            }
        }
    }

    drawCornerOrnaments(ctx, x, y, width, height, color) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        const len = 30;

        // Top-left
        ctx.strokeRect(x + 8, y + 8, len, len);
        // Top-right
        ctx.strokeRect(x + width - len - 8, y + 8, len, len);
        // Bottom-left
        ctx.strokeRect(x + 8, y + height - len - 8, len, len);
        // Bottom-right
        ctx.strokeRect(x + width - len - 8, y + height - len - 8, len, len);
        ctx.restore();
    }

    drawContentsPage(ctx, w, h, accent, text, subtext, isDark) {
        ctx.textAlign = "center";
        ctx.font = 'bold 36px "Georgia", serif';
        ctx.fillStyle = text;
        ctx.fillText("TABLE OF CONTENTS", w / 2, 220);

        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(w / 2 - 80, 250);
        ctx.lineTo(w / 2 + 80, 250);
        ctx.stroke();

        const chapters = [
            { num: "I", title: "The Architecture of Thought", page: "3" },
            {
                num: "—",
                title: "The Golden Proportions of Typography",
                page: "4",
            },
            {
                num: "II",
                title: "The Art of Marginalia & Reflection",
                page: "5",
            },
            { num: "—", title: "Cicero's Solitary Sanctuary", page: "6" },
            { num: "III", title: "The Physicality of the Page", page: "7" },
            { num: "—", title: "Celestial Harmonies of the Book", page: "8" },
            { num: "IV", title: "Memory and Spatial Typography", page: "9" },
            { num: "—", title: "Bibliophile's Study Practice", page: "10" },
            { num: "V", title: "Colophon & Type Notes", page: "11" },
        ];

        let startY = 340;
        ctx.font = '22px "Georgia", serif';

        chapters.forEach((c) => {
            ctx.textAlign = "left";
            ctx.fillStyle = accent;
            ctx.fillText(c.num, 140, startY);

            ctx.fillStyle = text;
            ctx.fillText(c.title, 190, startY);

            ctx.textAlign = "right";
            ctx.fillStyle = subtext;
            ctx.fillText(c.page, w - 140, startY);

            // Dotted leader line
            ctx.setLineDash([3, 7]);
            ctx.strokeStyle = isDark
                ? "rgba(255,255,255,0.1)"
                : "rgba(0,0,0,0.15)";
            ctx.beginPath();
            ctx.moveTo(560, startY - 6);
            ctx.lineTo(w - 170, startY - 6);
            ctx.stroke();
            ctx.setLineDash([]);

            startY += 75;
        });
    }

    drawChapterStart(
        ctx,
        w,
        h,
        label,
        title,
        dropCapLetter,
        firstParagraph,
        followingParagraphs,
        accent,
        text,
        subtext,
        isDark,
    ) {
        ctx.textAlign = "center";
        ctx.font = 'bold 18px "Georgia", serif';
        ctx.fillStyle = accent;
        ctx.letterSpacing = "0.2em";
        ctx.fillText(label, w / 2, 210);

        ctx.font = 'bold 40px "Georgia", serif';
        ctx.fillStyle = text;
        ctx.fillText(title, w / 2, 270);

        ctx.strokeStyle = accent;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(w / 2 - 60, 305);
        ctx.lineTo(w / 2 + 60, 305);
        ctx.stroke();

        // Drop Cap Letter
        ctx.textAlign = "left";
        ctx.font = 'bold 95px "Georgia", serif';
        ctx.fillStyle = accent;
        ctx.fillText(dropCapLetter, 120, 430);

        // First paragraph wrapping around drop cap
        ctx.font = '22px/36px "Georgia", serif';
        ctx.fillStyle = text;

        const wrapWidth = w - 240;
        this.wrapText(ctx, firstParagraph, 205, 375, wrapWidth - 85, 36);

        let curY = 480;
        followingParagraphs.forEach((para) => {
            curY =
                this.wrapText(ctx, "    " + para, 120, curY, wrapWidth, 38) +
                30;
        });

        // Decorative tailpiece
        ctx.textAlign = "center";
        ctx.font = "24px serif";
        ctx.fillStyle = accent;
        ctx.fillText("❦  ❦  ❦", w / 2, Math.min(curY + 40, h - 160));
    }

    drawDiagramPage(ctx, w, h, accent, text, subtext, isDark) {
        ctx.textAlign = "center";
        ctx.font = 'bold 30px "Georgia", serif';
        ctx.fillStyle = text;
        ctx.fillText("THE CANON OF PAGE PROPORTIONS", w / 2, 200);

        ctx.font = 'italic 18px "Georgia", serif';
        ctx.fillStyle = subtext;
        ctx.fillText(
            "Villard de Honnecourt & Jan Tschichold's Golden Division",
            w / 2,
            240,
        );

        // Draw Classical Geometric Diagram
        const boxX = 220;
        const boxY = 320;
        const boxW = 560;
        const boxH = 750;

        ctx.save();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        // Diagonals
        ctx.strokeStyle = isDark
            ? "rgba(212, 175, 55, 0.35)"
            : "rgba(155, 108, 53, 0.3)";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(boxX, boxY);
        ctx.lineTo(boxX + boxW, boxY + boxH);
        ctx.moveTo(boxX + boxW, boxY);
        ctx.lineTo(boxX, boxY + boxH);
        ctx.stroke();

        // Inner text block area (Golden rectangle)
        const innerX = boxX + boxW * 0.18;
        const innerY = boxY + boxH * 0.15;
        const innerW = boxW * 0.64;
        const innerH = boxH * 0.65;

        ctx.setLineDash([]);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 3;
        ctx.strokeRect(innerX, innerY, innerW, innerH);

        // Shading inside text block
        ctx.fillStyle = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)";
        ctx.fillRect(innerX, innerY, innerW, innerH);

        // Dimension labels
        ctx.font = '16px "Georgia", serif';
        ctx.fillStyle = text;
        ctx.textAlign = "center";
        ctx.fillText(
            "Type Area (Golden Proportion)",
            innerX + innerW / 2,
            innerY + innerH / 2,
        );
        ctx.fillStyle = subtext;
        ctx.fillText(
            "Ratio: 1 : 1.414 (√2)",
            innerX + innerW / 2,
            innerY + innerH / 2 + 30,
        );
        ctx.restore();

        // Explanatory Note
        ctx.font = '19px "Georgia", serif';
        ctx.fillStyle = text;
        ctx.textAlign = "left";
        this.wrapText(
            ctx,
            "The classical book opening harmonizes the outer and inner margins in a ratio of 2:3:4:6. The eye rests naturally in the upper quadrant, allowing effortless reading across long hours.",
            130,
            1140,
            w - 260,
            32,
        );
    }

    drawQuoteSpread(ctx, w, h, quote, author, accent, text, subtext, isDark) {
        ctx.textAlign = "center";

        // Large ornamental quotation mark
        ctx.font = 'bold 160px "Georgia", serif';
        ctx.fillStyle = accent;
        ctx.fillText("“", w / 2, 450);

        ctx.font = 'italic 34px "Georgia", serif';
        ctx.fillStyle = text;
        this.wrapText(ctx, quote, 180, 560, w - 360, 55, true);

        ctx.font = 'bold 20px "Georgia", serif';
        ctx.fillStyle = accent;
        ctx.fillText(author, w / 2, 780);

        // Floral Flourish
        ctx.font = "36px serif";
        ctx.fillStyle = subtext;
        ctx.fillText("❧  ❦  ☙", w / 2, 880);
    }

    drawEngravingPage(ctx, w, h, accent, text, subtext, isDark) {
        ctx.textAlign = "center";
        ctx.font = 'bold 28px "Georgia", serif';
        ctx.fillStyle = text;
        ctx.fillText("FIGURE III: CELESTIAL ALIGNMENT", w / 2, 200);

        // Engraving Artwork Simulation
        const cx = w / 2;
        const cy = 600;
        const r = 260;

        ctx.save();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5;

        // Concentric orbits
        for (let i = 40; i <= r; i += 35) {
            ctx.beginPath();
            ctx.arc(cx, cy, i, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Radial spokes
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * 35, cy + Math.sin(a) * 35);
            ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
            ctx.stroke();
        }

        // Center Sun emblem
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(cx, cy, 25, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        ctx.font = 'italic 18px "Georgia", serif';
        ctx.fillStyle = subtext;
        ctx.fillText(
            "Engraved after the Copernican System • Nuremberg, 1543",
            w / 2,
            940,
        );

        ctx.font = '19px "Georgia", serif';
        ctx.fillStyle = text;
        ctx.textAlign = "left";
        this.wrapText(
            ctx,
            "As planets orbit their luminous stellar core, so do words orbit the underlying truth of human experience. The book remains our greatest instrument for charting the vast cosmos within.",
            130,
            1030,
            w - 260,
            32,
        );
    }

    drawStudyPage(ctx, w, h, accent, text, subtext, isDark) {
        ctx.textAlign = "center";
        ctx.font = 'bold 32px "Georgia", serif';
        ctx.fillStyle = text;
        ctx.fillText("THE READER'S NOTEBOOK", w / 2, 210);

        ctx.font = 'italic 18px "Georgia", serif';
        ctx.fillStyle = subtext;
        ctx.fillText("Interactive Practice & Annotation Guide", w / 2, 250);

        const items = [
            "Use the Pen tool to underline striking metaphors.",
            "Employ the Highlighter to illuminate core theses.",
            "Draw Rectangles or Ellipses around key diagrams.",
            "Add Text Notes to question or synthesize ideas.",
            "Pinch or scroll to inspect fine details with clarity.",
            "Markings remain responsive throughout your reading session.",
        ];

        let startY = 360;
        ctx.textAlign = "left";

        items.forEach((item, idx) => {
            // Checkbox square
            ctx.strokeStyle = accent;
            ctx.lineWidth = 2;
            ctx.strokeRect(140, startY - 20, 24, 24);

            if (idx < 3) {
                ctx.fillStyle = accent;
                ctx.font = "bold 18px serif";
                ctx.fillText("✓", 144, startY - 2);
            }

            ctx.font = '22px "Georgia", serif';
            ctx.fillStyle = text;
            ctx.fillText(item, 185, startY);

            startY += 85;
        });

        // Elegant quote box at bottom
        ctx.fillStyle = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)";
        ctx.fillRect(120, 930, w - 240, 180);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1;
        ctx.strokeRect(120, 930, w - 240, 180);

        ctx.textAlign = "center";
        ctx.font = 'italic 20px "Georgia", serif';
        ctx.fillStyle = text;
        ctx.fillText("“We read to know we are not alone.”", w / 2, 1010);
        ctx.font = '16px "Georgia", serif';
        ctx.fillStyle = subtext;
        ctx.fillText("— C.S. LEWIS", w / 2, 1050);
    }

    drawColophon(ctx, w, h, accent, text, subtext, isDark) {
        ctx.textAlign = "center";
        ctx.font = 'bold 28px "Georgia", serif';
        ctx.fillStyle = text;
        ctx.fillText("COLOPHON", w / 2, 380);

        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(w / 2 - 50, 410);
        ctx.lineTo(w / 2 + 50, 410);
        ctx.stroke();

        ctx.font = '21px/36px "Georgia", serif';
        ctx.fillStyle = text;
        this.wrapText(
            ctx,
            "This digital volume was typeset in classical serifs inspired by the punches of Claude Garamont (Paris, 1530) and John Baskerville (Birmingham, 1757).",
            160,
            470,
            w - 320,
            36,
            true,
        );

        this.wrapText(
            ctx,
            "Crafted with HTML5 Canvas, responsive physics-driven page curls, real-time annotations, and lossless JSON memory persistence.",
            160,
            620,
            w - 320,
            36,
            true,
        );

        ctx.font = 'bold 18px "Georgia", serif';
        ctx.fillStyle = accent;
        ctx.fillText("FINIS", w / 2, 800);

        ctx.font = "32px serif";
        ctx.fillText("❦", w / 2, 850);
    }

    wrapText(ctx, text, x, y, maxWidth, lineHeight, center = false) {
        const words = text.split(" ");
        let line = "";
        let curY = y;

        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + " ";
            const metrics = ctx.measureText(testLine);
            const testWidth = metrics.width;
            if (testWidth > maxWidth && n > 0) {
                if (center) {
                    ctx.textAlign = "center";
                    ctx.fillText(line.trim(), x + maxWidth / 2, curY);
                } else {
                    ctx.fillText(line.trim(), x, curY);
                }
                line = words[n] + " ";
                curY += lineHeight;
            } else {
                line = testLine;
            }
        }
        if (center) {
            ctx.textAlign = "center";
            ctx.fillText(line.trim(), x + maxWidth / 2, curY);
        } else {
            ctx.fillText(line.trim(), x, curY);
        }
        return curY;
    }
}

window.DocumentProvider = DocumentProvider;

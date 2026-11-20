function invertLightnessKeepHue(ctx, width, height) {
    const imgData = ctx.getImageData(0, 0, width, height);
    const buf32 = new Uint32Array(imgData.data.buffer);
    const len = buf32.length;

    for (let i = 0; i < len; i++) {
        const pixel = buf32[i];
        const a = pixel & 0xff000000;
        if (a === 0) continue;
        const r = pixel & 0xff;
        const g = (pixel >>> 8) & 0xff;
        const b = (pixel >>> 16) & 0xff;
        const max = r > g ? (r > b ? r : b) : g > b ? g : b;
        const min = r < g ? (r < b ? r : b) : g < b ? g : b;
        const offset = 255 - (max + min);
        const nr = r + offset;
        const ng = g + offset;
        const nb = b + offset;
        buf32[i] = a | (nb << 16) | (ng << 8) | nr;
    }
    ctx.putImageData(imgData, 0, 0);
}

if (typeof window !== "undefined") {
    window.invertLightnessKeepHue = invertLightnessKeepHue;
    window.rgbToHsl = rgbToHsl;
    window.hslToRgb = hslToRgb;
}

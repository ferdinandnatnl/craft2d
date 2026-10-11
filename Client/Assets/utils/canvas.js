/** DOM canvas handles (no Camera — avoids import cycles with input). */
export const CANVAS = document.getElementById("canvas");
export const ctx = CANVAS ? CANVAS.getContext("2d") : null;
export var r = document.querySelector(":root");

if (CANVAS && ctx) {
    const resizeCanvas = () => {
        const { width, height } = CANVAS.getBoundingClientRect();
        if (!width || !height) return;

        // Preserve the game/UI scale and show more world in the extra space.
        const touchLayout = matchMedia("(pointer: coarse)").matches;
        const scale = touchLayout
            ? Math.max(720 / width, 760 / height)
            : Math.max(1920 / width, 1080 / height);
        const renderWidth = Math.round(width * scale);
        const renderHeight = Math.round(height * scale);
        if (CANVAS.width === renderWidth && CANVAS.height === renderHeight) return;

        CANVAS.width = renderWidth;
        CANVAS.height = renderHeight;
        ctx.imageSmoothingEnabled = false;
        ctx.webkitImageSmoothingEnabled = false;
        ctx.mozImageSmoothingEnabled = false;
    };

    resizeCanvas();
    new ResizeObserver(resizeCanvas).observe(CANVAS);
}

if (r) {
    r.style.setProperty("--drawMouse", "none");
}

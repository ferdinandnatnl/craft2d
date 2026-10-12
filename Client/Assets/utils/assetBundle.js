/** Keep asset paths relative so dev and built pages load only the files they use. */
export function resolveAssetUrl(path) {
    if (typeof path !== "string" || !path) return path;
    if (/^(?:blob:|data:|https?:\/\/)/.test(path)) return path;
    return path.replace(/^\/+/, "").replaceAll("\\", "/");
}

// Retained for existing page entry points. Static assets require no boot step.
export async function loadMediaBundle({ onProgress } = {}) {
    onProgress?.(1);
}

export function applyPackedMediaStyles() {}

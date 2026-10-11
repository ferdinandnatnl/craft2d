export const SHADER_MODES = Object.freeze([
    { id: "off", label: "Off" },
    { id: "photon", label: "Cinematic" },
]);

export function normalizeShaderMode(mode) {
    if (mode == null) return "photon";
    return SHADER_MODES.some((shader) => shader.id === mode) ? mode : "off";
}

export function getShaderModeLabel(mode) {
    const normalizedMode = normalizeShaderMode(mode);
    return SHADER_MODES.find((shader) => shader.id === normalizedMode).label;
}

export function nextShaderMode(mode) {
    const normalizedMode = normalizeShaderMode(mode);
    const currentIndex = SHADER_MODES.findIndex(
        (shader) => shader.id === normalizedMode,
    );
    return SHADER_MODES[(currentIndex + 1) % SHADER_MODES.length].id;
}

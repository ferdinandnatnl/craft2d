export function getHeadPitch(lookDirection = 0) {
    const angle = lookDirection * Math.PI / 180;
    // Fold left/right aiming into the same up/down pitch in model space.
    const pitch = Math.atan2(Math.sin(angle), Math.abs(Math.cos(angle)));
    return Math.max(-0.45, Math.min(0.45, pitch));
}

export function getLimbPitch(part, direction) {
    // Sprite angles include world-facing and background-limb mirroring.
    // The 3D model already turns as a whole, so undo those screen-space signs.
    const facing = direction < 0 ? -1 : 1;
    const side = part.zIndex < 0 ? -1 : 1;
    return part.rotation * Math.PI / 180 * facing * side;
}

export function blendSwimming(current, active, deltaTime) {
    const target = active ? 1 : 0;
    const blend = 1 - Math.exp(-10 * Math.max(0, Math.min(deltaTime, 0.1)));
    const amount = current + (target - current) * blend;
    return Math.abs(target - amount) < 0.001 ? target : amount;
}

export function getSwimPartPitch(name, phase) {
    if (name === "head") return -Math.PI / 2;
    if (name === "leftArm") return -Math.PI / 2 - Math.cos(phase) * 1.3;
    if (name === "rightArm") return -Math.PI / 2 + Math.cos(phase) * 1.3;
    if (name === "leftLeg") return Math.sin(phase * 2) * 0.3;
    if (name === "rightLeg") return -Math.sin(phase * 2) * 0.3;
    return 0;
}

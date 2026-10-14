import { BLOCK_SIZE } from "@2dcraft.com/shared/constants.js";

const SWORD_ARM_SWING = [
    [0, 0],
    [0.22, -0.55],
    [0.5, 1.1],
    [0.78, 0.4],
    [1, 0],
];
const SWORD_WEAPON_SWING = [
    [0, 0],
    [0.22, -0.35],
    [0.5, 0.85],
    [0.78, 0.25],
    [1, 0],
];

function sampleSwing(points, progress) {
    for (let index = 1; index < points.length; index++) {
        const [end, endValue] = points[index];
        if (progress > end) continue;

        const [start, startValue] = points[index - 1];
        const phase = Math.max(0, Math.min(1, (progress - start) / (end - start)));
        const eased = phase * phase * (3 - 2 * phase);
        return startValue + (endValue - startValue) * eased;
    }
    return 0;
}

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

export function getBoatPartPitch(name, phase) {
    if (name === "leftArm") return -0.75 + Math.sin(phase) * 0.55;
    if (name === "rightArm") return 0.75 - Math.sin(phase) * 0.55;
    if (name === "leftLeg" || name === "rightLeg") return 1.05;
    return 0;
}

export function getSwordSwingPose(swing, holdItem, seconds) {
    if (!swing || swing.weaponId !== holdItem?.itemId ||
        !Number.isFinite(swing.startedAt) ||
        !Number.isFinite(swing.duration) || swing.duration <= 0) return null;

    const age = seconds - swing.startedAt;
    if (age < 0 || age >= swing.duration) return null;

    const progress = age / swing.duration;
    return {
        direction: Math.sign(swing.aim?.x) || Math.sign(swing.facing) || 1,
        armAngle: sampleSwing(SWORD_ARM_SWING, progress),
        weaponAngle: sampleSwing(SWORD_WEAPON_SWING, progress),
    };
}

// Cosmetic mob pose. Movement, attacks, hitboxes, and saves remain authoritative.
export function updateBendPose(entity, seconds = 0) {
    const body = entity.body;
    if (!body?.parts?.leftArm || !body.parts.rightArm ||
        !body.parts.leftLeg || !body.parts.rightLeg || entity.isMutant) return null;

    const zombie = body.sprite.startsWith("zombie/");
    const skeleton = body.sprite.startsWith("skeleton/");
    if (!zombie && !skeleton) return null;

    const distance = Math.abs(entity.position.x - (body.bendLastX ?? entity.position.x));
    body.bendLastX = entity.position.x;
    if (entity.grounded && distance < BLOCK_SIZE / 2) {
        body.bendWalkPhase = (body.bendWalkPhase || 0) + distance / BLOCK_SIZE * 7;
    }
    const phase = body.bendWalkPhase || 0;
    const walk = entity.grounded
        ? Math.min(1, Math.abs(entity.velocity?.x || 0) / (BLOCK_SIZE * 2.5))
        : 0;
    const stride = Math.sin(phase) * walk * 0.65;
    const liftLeft = Math.max(0, Math.sin(phase)) * walk;
    const liftRight = Math.max(0, -Math.sin(phase)) * walk;
    const hit = Math.max(0, Math.min(1, ((entity.attackPoseUntil || 0) - seconds) / 0.28));
    const pose = {
        lean: zombie ? 0.08 + walk * 0.06 : 0,
        bob: Math.abs(Math.cos(phase)) * walk * 0.025,
        pitch: {
            leftArm: zombie ? -1.35 - stride * 0.2 - hit * 0.45 : -stride * 0.45 - hit * 1.35,
            rightArm: zombie ? -1.35 + stride * 0.2 - hit * 0.45 : stride * 0.45 - hit * 0.95,
            leftLeg: stride,
            rightLeg: -stride,
        },
        bend: {
            leftArm: zombie ? 0.3 + hit * 0.3 : 0.12 + hit * 0.5,
            rightArm: zombie ? 0.3 + hit * 0.3 : 0.12 + hit * 0.45,
            leftLeg: liftLeft * 0.6,
            rightLeg: liftRight * 0.6,
        },
    };
    body.bendPose = pose;
    return pose;
}

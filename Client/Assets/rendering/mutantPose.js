// Walk and attack poses are adapted from the model classes in Mutant Creatures Legacy:
// https://github.com/Elite-Modding-Team/MutantCreaturesLegacy/tree/e609923771f633b41c72e720f8159cae7db30883/src/main/java/chumbanotz/mutantbeasts/client/model
// Side-on arm angles keep the existing 2D models readable during attacks.
const ATTACK_PITCH = {
    MutantZombie: {
        melee: { leftArm: -2.1, rightArm: -2.1, leftForearm: 0.2, rightForearm: 0.2 },
        throw: { leftArm: -2.6, rightArm: -2.6, leftForearm: 0.2, rightForearm: 0.2 },
        roar: { leftArm: -1.2, rightArm: -1.2, leftForearm: -0.8, rightForearm: -0.8 },
    },
    MutantSkeleton: {
        melee: { leftArm: -1.4, leftForearm: -0.5, rightArm: -0.35 },
        shoot: { leftArm: -1.4, rightArm: -1.4, leftForearm: 0.25, rightForearm: -0.4 },
    },
    MutantEnderman: {
        melee: { upperRightArm: -1.3, foreRightArm: -0.5,
            upperLeftArm: -0.7, foreLeftArm: -0.35 },
        teleport: { upperRightArm: -0.9, upperLeftArm: -0.9,
            lowerRightArm: -0.9, lowerLeftArm: -0.9 },
    },
    MutantSnowGolem: {
        throw: { rightArm: -1.6, rightForearm: -0.6, leftArm: -0.3 },
    },
    SpiderPig: {
        bite: { head: -0.5 },
        melee: { frontLeftLeg: -0.35, frontRightLeg: -0.35 },
    },
};
const WALK_BOB = {
    MutantZombie: [0.4, 0.03],
    MutantSkeleton: [0.5, 0.045],
    MutantEnderman: [0.3, 0.04],
    MutantSnowGolem: [0.45, 0.05],
    SpiderPig: [0.9, 0.02],
};

export function mutantAttackAmount(type, remaining, duration) {
    if (remaining <= 0 || duration <= 0) return 0;
    const progress = Math.max(0, Math.min(1, 1 - remaining / duration));
    return type === "MutantCreeper"
        ? Math.sin(progress * Math.PI)
        : Math.cos(progress * Math.PI / 2);
}

function mutantWalkPitch(type, name, limbSwing, amount) {
    if (!amount) return 0;
    if (type === "MutantZombie" || type === "MutantSkeleton" ||
        type === "MutantSnowGolem") {
        const speed = type === "MutantSkeleton" ? 0.5 :
            type === "MutantSnowGolem" ? 0.45 : 0.4;
        const step = Math.sin(limbSwing * speed) * amount;
        const armSwing = type === "MutantSkeleton" ? 0.7 : 0.55;
        const legSwing = type === "MutantSnowGolem" ? 0.85 : 0.7;
        if (name === "leftArm") return -step * armSwing;
        if (name === "rightArm") return step * armSwing;
        if (name === "leftLeg") return step * legSwing;
        if (name === "rightLeg") return -step * legSwing;
        if (name === "leftFoot") return -step * legSwing * 0.35;
        if (name === "rightFoot") return step * legSwing * 0.35;
        if (name === "leftForearm") return -step * 0.15;
        if (name === "rightForearm") return step * 0.15;
        return 0;
    }
    if (type === "MutantEnderman") {
        const step = Math.sin(limbSwing * 0.3) * amount;
        if (name === "upperRightArm") return -step * 0.55;
        if (name === "upperLeftArm") return step * 0.55;
        if (name === "foreRightArm") return -step * 0.18;
        if (name === "foreLeftArm") return step * 0.18;
        if (name === "lowerRightArm") return -step * 0.28;
        if (name === "lowerLeftArm") return step * 0.28;
        if (name === "rightLeg") return step * 0.65;
        if (name === "leftLeg") return -step * 0.65;
        if (name === "rightForeleg") return -step * 0.2;
        if (name === "leftForeleg") return step * 0.2;
        return 0;
    }
    if (type === "SpiderPig") {
        const leg = /^(front|middle|back)(Left|Right)(Leg|Foot)$/.exec(name);
        if (leg) {
            const phase = leg[1] === "front" ? 0.3 :
                leg[1] === "middle" ? -0.3 : -0.9;
            const side = leg[2] === "Left" ? 0 : Math.PI;
            const swing = Math.sin(limbSwing * 0.9 + phase + side) * amount;
            const angle = swing * (leg[1] === "back" ? 0.3 : 0.45);
            return leg[3] === "Foot" ? -angle * 0.4 : angle;
        }
        if (name === "head") return Math.sin(limbSwing * 0.9) * amount * 0.08;
    }
    return 0;
}

export function mutantPartPitch(type, name, limbSwing, amount, attack, seconds,
    attackKind = "melee") {
    if (type !== "MutantCreeper") {
        return mutantWalkPitch(type, name, limbSwing, amount) +
            (ATTACK_PITCH[type]?.[attackKind]?.[name] ?? 0) * attack || 0;
    }

    const breathe = Math.sin(seconds * 1.5) * 0.02;
    const phase = limbSwing * Math.PI / 4;
    const frontRight = Math.max(0, Math.sin(phase) + 0.4) * amount;
    const frontLeft = Math.max(0, -Math.sin(phase) + 0.4) * amount;
    const backRight = Math.max(0, -Math.cos(phase) + 0.4) * amount;
    const backLeft = Math.max(0, Math.cos(phase) + 0.4) * amount;
    if (name === "pelvis") return -0.79;
    if (name === "body") return 0.94 + breathe + attack * 0.5;
    if (name === "neck") return 1.05 - attack * 0.35;
    if (name === "head") return 0.52;
    if (name === "frontRightLeg") return 0.31 - frontRight * 0.3;
    if (name === "frontLeftLeg") return 0.31 - frontLeft * 0.3;
    if (name === "backRightLeg") return 0.9 + backRight * 0.3;
    if (name === "backLeftLeg") return 0.9 + backLeft * 0.3;
    if (name.startsWith("front") && name.endsWith("Foot")) return -0.21;
    if (name.startsWith("back") && name.endsWith("Foot")) return 0.48;
    return 0;
}

export function mutantWalkBob(type, limbSwing, amount) {
    if (!amount) return 0;
    if (type === "MutantCreeper") {
        return Math.abs(Math.sin(limbSwing * 0.4)) * amount * 0.03;
    }
    const gait = WALK_BOB[type];
    return gait ? Math.abs(Math.sin(limbSwing * gait[0])) * amount * gait[1] : 0;
}

export function mutantPartParent(name) {
    const foot = /^(.*)Foot$/.exec(name);
    if (foot) return `${foot[1]}Leg`;
    const foreleg = /^(.*)Foreleg$/.exec(name);
    if (foreleg) return `${foreleg[1]}Leg`;
    const forearm = /^(left|right)Forearm$/.exec(name);
    if (forearm) return `${forearm[1]}Arm`;
    if (name.startsWith("lowerFore")) return name.replace("lowerFore", "lower");
    if (name.startsWith("fore")) return name.replace("fore", "upper");
    if (["headCore", "glowingEyes", "endermanEyes", "mouth", "snout"].includes(name)) return "head";
    return null;
}

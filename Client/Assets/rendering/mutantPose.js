// Walk cycles are adapted from the six model classes in Mutant Creatures Legacy:
// https://github.com/Elite-Modding-Team/MutantCreaturesLegacy/tree/e609923771f633b41c72e720f8159cae7db30883/src/main/java/chumbanotz/mutantbeasts/client/model
// limbSwing advances with distance traveled, as it does in the original mod.
export function mutantPartPitch(type, name, limbSwing, amount, attack, seconds) {
    const breathe = Math.sin(seconds * 1.5) * 0.02;
    const walk = Math.sin(limbSwing * 0.4) * amount;

    switch (type) {
        case "MutantZombie": {
            const leftStep = (Math.sin((limbSwing - 0.7) * 0.4) + 0.7) * amount;
            const rightStep = -(Math.sin((limbSwing + 0.7) * 0.4) - 0.7) * amount;
            if (name === "waist") return 0.2;
            if (name === "chest") return 0.52 + breathe + attack * 0.3;
            if (name === "head") return -0.72;
            if (name === "leftArm") return -0.33 - walk * 0.6 - attack * 1.5;
            if (name === "rightArm") return -0.33 + walk * 0.6 - attack * 1.5;
            if (name.endsWith("Forearm")) return -1.05 - attack * 0.5;
            if (name === "leftLeg") return -0.79 + leftStep * 0.9;
            if (name === "rightLeg") return -0.79 + rightStep * 0.9;
            if (name.endsWith("Foot")) return 0.79;
            return 0;
        }
        case "MutantSkeleton": {
            const step = Math.sin(limbSwing * 0.5) * amount;
            const knee = Math.sin(limbSwing * 0.5 - 1.1) * amount;
            if (name === "pelvis") return -0.31;
            if (name === "waist") return 0.22;
            if (name === "neck") return -0.13;
            if (name === "head") return -0.13 + breathe;
            if (name === "leftArm") return 0.52 - step * 0.9 - attack * 1.0;
            if (name === "rightArm") return 0.52 + step * 0.9 - attack * 1.0;
            if (name.endsWith("Forearm")) return -0.52 - attack * 0.5;
            if (name === "leftLeg") return -0.26 + (0.2 + step) * amount;
            if (name === "rightLeg") return -0.26 + (0.2 - step) * amount;
            if (name === "leftFoot") return 0.31 + knee * 0.6;
            if (name === "rightFoot") return 0.31 - knee * 0.6;
            return 0;
        }
        case "MutantCreeper": {
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
        case "MutantEnderman": {
            // This game's Enderman stays teleport-only as requested.
            if (name === "abdomen") return 0.31;
            if (name === "chest") return 0.39 + breathe;
            if (name === "neck") return 0.2;
            if (name === "head") return -0.79;
            if (name.includes("ForeRightArm") || name.includes("ForeLeftArm")) return -0.63;
            if (name.endsWith("Arm")) return -0.52 - attack * 0.8;
            if (name === "leftLeg" || name === "rightLeg") return -0.9;
            if (name.endsWith("Foreleg")) return 0.79;
            return 0;
        }
        case "MutantSnowGolem": {
            const step = Math.sin(limbSwing * 0.45) * amount;
            const leftStep = (Math.cos((limbSwing - 0.5) * 0.45) + 0.5) * amount;
            const rightStep = (Math.cos((limbSwing - 0.5 + Math.PI * 2) * 0.45) + 0.5) * amount;
            if (name === "chest" || name === "abdomen") return 0.13 - breathe;
            if (name === "head") return -0.26;
            if (name === "leftArm") return -0.31 - step * 0.6 - attack * 1.2;
            if (name === "rightArm") return -0.31 + step * 0.6 - attack * 1.2;
            if (name === "leftForearm") return -0.52 - step * 0.2;
            if (name === "rightForearm") return -0.52 + step * 0.2;
            if (name === "leftLeg") return -0.63 + leftStep * 1.1;
            if (name === "rightLeg") return -0.63 + rightStep * 1.1;
            if (name === "leftFoot") return 0.7 + step * 0.2;
            if (name === "rightFoot") return 0.7 - step * 0.2;
            return 0;
        }
        case "SpiderPig": {
            const phase = limbSwing * 0.9;
            if (name === "head") return -0.39 + Math.sin(phase) * amount * 0.15;
            if (name === "frontBody") return 0.39;
            if (name === "rearBody") return -0.05;
            const leg = /^(front|middle|back)(Left|Right)(Leg|Foot)$/.exec(name);
            if (!leg) return 0;
            const offset = { frontLeft: 0.3, frontRight: 0.9, middleLeft: -0.3,
                middleRight: -0.9, backLeft: -0.9, backRight: 0.3 }[leg[1] + leg[2]];
            const delay = leg[3] === "Foot" ? 0.5 : 0;
            const amplitude = leg[1] === "back" ? 0.63 : 0.52;
            return Math.sin(phase + offset + delay) * amount * amplitude;
        }
        default:
            return 0;
    }
}

export function mutantWalkBob(type, limbSwing, amount) {
    if (type === "MutantEnderman") return 0;
    const phase = type === "SpiderPig" ? limbSwing * 0.9 : limbSwing * 0.4;
    return Math.abs(Math.sin(phase)) * amount * (type === "MutantSnowGolem" ? 0.055 : 0.03);
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

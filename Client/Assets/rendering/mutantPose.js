// Walk cycles are adapted from the six model classes in Mutant Creatures Legacy:
// https://github.com/Elite-Modding-Team/MutantCreaturesLegacy/tree/e609923771f633b41c72e720f8159cae7db30883/src/main/java/chumbanotz/mutantbeasts/client/model
// limbSwing advances with distance traveled, as it does in the original mod.
export function mutantPartPitch(type, name, limbSwing, amount, attack, seconds) {
    // The creeper has its own connected mod rig. Other mutants stay in their
    // atlas pose until they have their own joints; bending loose cubes detaches them.
    if (type !== "MutantCreeper") return 0;

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
    if (type !== "MutantCreeper") return 0;
    return Math.abs(Math.sin(limbSwing * 0.4)) * amount * 0.03;
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

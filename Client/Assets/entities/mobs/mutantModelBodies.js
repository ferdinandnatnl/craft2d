import { Body, BodyPart } from "../../game/body.js";

// UVs and cuboid positions are translated from the corresponding model classes
// in Mutant Creatures Legacy. The pixels come from its original texture atlases.
const MODELS = {
    MutantZombie: {
        texture: "mutantbeasts/mutant_zombie",
        width: 1.1,
        cubes: [
            ["waist", 0, 44, -7, -6, 14, 16, 12, -1],
            ["chest", 0, 16, -12, -14, 24, 12, 16, 2],
            ["head", 0, 0, -4, -21, 8, 8, 8, 4, { eyes: true }],
            ["leftArm", 104, 0, -14, -10, 6, 16, 6, -2, { sways: true }],
            ["rightArm", 104, 0, 8, -10, 6, 16, 6, 3, { sways: true }],
            ["leftForearm", 104, 22, -14, 4, 6, 16, 6, -2],
            ["rightForearm", 104, 22, 8, 4, 6, 16, 6, 3],
            ["leftLeg", 80, 0, -8, 8, 6, 11, 6, -2, { sways: true }],
            ["rightLeg", 80, 0, 2, 8, 6, 11, 6, 2, { sways: true }],
            ["leftFoot", 80, 17, -8, 17.5, 6, 8, 6, -2, { sways: true }],
            ["rightFoot", 80, 17, 2, 17.5, 6, 8, 6, 2, { sways: true }],
        ],
    },
    MutantCreeper: {
        texture: "mutantbeasts/mutant_creeper",
        width: 1.35,
        cubes: [
            ["pelvis", 0, 0, -5, 0, 10, 14, 8, -2],
            ["body", 36, 0, -4.5, -12, 9, 16, 7, 2],
            ["neck", 68, 0, -4, -23, 8, 14, 6, 2],
            ["head", 0, 22, -5, -33, 10, 12, 10, 3, { eyes: true }],
            ["frontLeftLeg", 40, 24, 0, 10, 6, 4, 14, -2, { sways: true }],
            ["frontRightLeg", 40, 24, -6, 10, 6, 4, 14, -2, { sways: true }],
            ["frontLeftFoot", 96, 0, -0.5, 10, 7, 20, 8, 2, { sways: true }],
            ["frontRightFoot", 96, 0, -6.5, 10, 7, 20, 8, 2, { sways: true }],
            ["backLeftLeg", 0, 44, 0, 8, 4, 4, 14, -2, { sways: true }],
            ["backRightLeg", 0, 44, -4, 8, 4, 4, 14, -2, { sways: true }],
            ["backLeftFoot", 80, 28, -1, 8, 6, 18, 6, 2, { sways: true }],
            ["backRightFoot", 80, 28, -5, 8, 6, 18, 6, 2, { sways: true }],
        ],
    },
    MutantSkeleton: {
        texture: "mutantbeasts/mutant_skeleton",
        width: 1.2,
        cubes: [
            ["pelvis", 0, 16, -4, -3, 8, 6, 6, -1],
            ["waist", 32, 0, -2.5, -10, 5, 8, 4, -1],
            ["rib1", 50, 0, -2.5, -13, 5, 4, 4, 2],
            ["rib2", 50, 0, -2.5, -18, 5, 4, 4, 2],
            ["rib3", 50, 0, -2.5, -23, 5, 4, 4, 2],
            ["rib1Left", 32, 12, -9, -12, 6, 2, 2, -1],
            ["rib1Right", 32, 12, 3, -12, 6, 2, 2, 3],
            ["rib2Left", 32, 12, -15.5, -17, 6, 2, 2, -1],
            ["rib2Right", 32, 12, 9.5, -17, 6, 2, 2, 3],
            ["neck", 64, 0, -1.5, -27, 3, 4, 3, 2],
            ["head", 0, 0, -4, -35, 8, 8, 8, 4, { eyes: true }],
            ["jaw", 72, 0, -4, -30, 8, 3, 8, 5],
            ["leftShoulder", 28, 16, -11, -25, 8, 3, 6, -2],
            ["rightShoulder", 28, 16, 3, -25, 8, 3, 6, 3],
            ["leftArm", 0, 28, -10, -23, 4, 12, 4, -2, { sways: true }],
            ["rightArm", 0, 28, 6, -23, 4, 12, 4, 3, { sways: true }],
            ["leftForearm", 16, 28, -10, -12, 4, 14, 4, -2],
            ["rightForearm", 16, 28, 6, -12, 4, 14, 4, 3],
            ["leftLeg", 0, 28, -4.5, 0.5, 4, 12, 4, -2, { sways: true }],
            ["rightLeg", 0, 28, 0.5, 0.5, 4, 12, 4, 2, { sways: true }],
            ["leftFoot", 32, 28, -4.5, 12.5, 4, 12, 4, -2, { sways: true }],
            ["rightFoot", 32, 28, 0.5, 12.5, 4, 12, 4, 2, { sways: true }],
        ],
    },
    MutantEnderman: {
        texture: "mutantbeasts/mutant_enderman/mutant_enderman",
        width: 1.55,
        cubes: [
            ["abdomen", 32, 0, -4, -25.5, 8, 10, 4, 2],
            ["chest", 50, 8, -5, -39.5, 10, 16, 6, 2],
            ["neck", 32, 14, -1.5, -42.5, 3, 4, 3, 2],
            ["head", 0, 0, -4, -47.5, 8, 6, 8, 4, { eyes: true }],
            ["mouth", 0, 24, -4, -40.5, 8, 2, 8, 5],
            ["upperRightArm", 92, 0, -5.5, -37.5, 3, 22, 3, 3, { sways: true }],
            ["foreRightArm", 104, 0, -5.5, -16.5, 3, 18, 3, 3, { sways: true }],
            ["lowerRightArm", 92, 0, -5.5, -31.5, 3, 22, 3, -1, { sways: true }],
            ["lowerForeRightArm", 104, 0, -5.5, -10.5, 3, 18, 3, -1, { sways: true }],
            ["upperLeftArm", 92, 0, 2.5, -37.5, 3, 22, 3, 3, { sways: true }],
            ["foreLeftArm", 104, 0, 2.5, -16.5, 3, 18, 3, 3, { sways: true }],
            ["lowerLeftArm", 92, 0, 2.5, -31.5, 3, 22, 3, -1, { sways: true }],
            ["lowerForeLeftArm", 104, 0, 2.5, -10.5, 3, 18, 3, -1, { sways: true }],
            ["rightLeg", 0, 34, -3, -17.5, 3, 24, 3, -2, { sways: true }],
            ["rightForeleg", 12, 34, -3, 5.5, 3, 24, 3, -2, { sways: true }],
            ["leftLeg", 0, 34, 0, -17.5, 3, 24, 3, 2, { sways: true }],
            ["leftForeleg", 12, 34, 0, 5.5, 3, 24, 3, 2, { sways: true }],
            ["endermanEyes", 0, 0, -4, -47.5, 8, 6, 8, 6, {
                ownSpriteMap: "mutantbeasts/mutant_enderman/eyes",
            }],
        ],
    },
    MutantSnowGolem: {
        texture: "mutantbeasts/mutant_snow_golem/mutant_snow_golem",
        width: 1.2,
        cubes: [
            ["abdomen", 0, 32, -5, 5.5, 10, 8, 8, -1],
            ["chest", 24, 36, -8, -4.5, 16, 12, 12, 2],
            ["head", 0, 0, -4, -12.5, 8, 8, 8, 3, {
                ownSpriteMap: "mutantbeasts/mutant_snow_golem/pumpkin",
            }],
            ["headCore", 64, 0, -4, -12.5, 8, 8, 8, 4],
            ["glowingEyes", 64, 0, -4, -12.5, 8, 8, 8, 5, {
                ownSpriteMap: "mutantbeasts/mutant_snow_golem/glow",
            }],
            ["leftArm", 68, 16, -11.5, -3.5, 5, 10, 5, -1, { sways: true }],
            ["rightArm", 68, 16, 6.5, -3.5, 5, 10, 5, 3, { sways: true }],
            ["leftForearm", 96, 0, -12, 6.5, 6, 12, 6, -1],
            ["rightForearm", 96, 0, 6, 6.5, 6, 12, 6, 3],
            ["leftLeg", 88, 18, -7, 12.5, 6, 8, 6, -2, { sways: true }],
            ["rightLeg", 88, 18, 1, 12.5, 6, 8, 6, 2, { sways: true }],
            ["leftFoot", 88, 32, -8, 18.5, 6, 8, 6, -2, { sways: true }],
            ["rightFoot", 88, 32, 0, 18.5, 6, 8, 6, 2, { sways: true }],
        ],
    },
    SpiderPig: {
        texture: "mutantbeasts/spider_pig/spider_pig",
        width: 1.3,
        cubes: [
            ["abdomen", 32, 0, -3, 9.5, 6, 6, 10, -1],
            ["abdomenShell", 44, 16, -5, 9.5, 10, 8, 12, 2],
            ["frontBody", 64, 0, -3.5, 9.5, 7, 7, 9, 3],
            ["rearBody", 0, 16, -5, 10, 10, 9, 12, -1],
            ["head", 0, 0, -4, 10.5, 8, 8, 8, 4, { eyes: true }],
            ["snout", 24, 0, -2, 14.5, 4, 3, 1, 5],
            ["frontLeftLeg", 0, 37, -4.5, 14.5, 2, 12, 2, -2, { sways: true }],
            ["frontLeftFoot", 8, 37, -4.5, 26.5, 2, 16, 2, -2, { sways: true }],
            ["frontRightLeg", 0, 37, 1.5, 14.5, 2, 12, 2, 2, { sways: true }],
            ["frontRightFoot", 8, 37, 1.5, 26.5, 2, 16, 2, 2, { sways: true }],
            ["middleLeftLeg", 0, 37, -4.5, 14.5, 2, 12, 2, -2, { sways: true }],
            ["middleLeftFoot", 8, 37, -4.5, 26.5, 2, 16, 2, -2, { sways: true }],
            ["middleRightLeg", 0, 37, 1.5, 14.5, 2, 12, 2, 2, { sways: true }],
            ["middleRightFoot", 8, 37, 1.5, 26.5, 2, 16, 2, 2, { sways: true }],
            ["backLeftLeg", 16, 37, -4.5, 16.5, 4, 4, 4, -2, { sways: true }],
            ["backLeftFoot", 16, 45, -4.5, 19.5, 4, 4, 4, -2, { sways: true }],
            ["backRightLeg", 32, 37, 0.5, 16.5, 4, 4, 4, 2, { sways: true }],
            ["backRightFoot", 16, 45, 0.5, 19.5, 4, 4, 4, 2, { sways: true }],
        ],
    },
};

export function createMutantModelBody(entityTypeName) {
    const model = MODELS[entityTypeName];
    if (!model) throw new Error(`Unknown Mutant Creatures model: ${entityTypeName}`);

    const modelTop = Math.min(...model.cubes.map(([, , , , y]) => y));
    const parts = {};
    for (const cube of model.cubes) {
        const [name, u, v, x, y, width, height, depth, zIndex = 0, options = {}] = cube;
        const part = new BodyPart({
            spriteCrop: {
                x: u + depth,
                y: v + depth,
                width,
                height,
            },
            ownSpriteMap: options.ownSpriteMap,
            offset: {
                x: 4 * model.width + (x + width / 2) / 2,
                y: (y + height / 2 - modelTop) / 2,
            },
            zIndex,
            flip: true,
            eyes: options.eyes,
        });
        part.mutantCube = { u, v, width, height, depth };
        parts[name] = part;
    }

    const body = new Body({
        sprite: model.texture,
        renderScale: 8,
        parts,
    });
    body.mutantModelType = entityTypeName;
    return body;
}

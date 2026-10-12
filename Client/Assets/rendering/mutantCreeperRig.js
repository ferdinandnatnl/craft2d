// Joint positions and boxes from Mutant Creatures Legacy's MutantCreeperModel.
// Coordinates use the original model's pixels: Y points down and -Z is forward.
// https://github.com/Elite-Modding-Team/MutantCreaturesLegacy/blob/e609923771f633b41c72e720f8159cae7db30883/src/main/java/chumbanotz/mutantbeasts/client/model/MutantCreeperModel.java
export const MUTANT_CREEPER_RIG = [
    { name: "pelvis", pivot: [0, 14, -3], box: [0, -7, 0] },
    { name: "body", parent: "pelvis", pivot: [0, -12, 0], box: [0, -6, 0] },
    { name: "neck", parent: "body", pivot: [0, -11, 1], box: [0, -7, 0] },
    { name: "head", parent: "neck", pivot: [0, -12, 1], box: [0, -6, 0] },
    { name: "frontRightLeg", parent: "pelvis", pivot: [3, 0, 0], box: [0, -2, -7], yaw: -Math.PI / 4 },
    { name: "frontRightFoot", parent: "frontRightLeg", pivot: [0, -4, -14], box: [0, 10, 0], yaw: Math.PI / 8 },
    { name: "frontLeftLeg", parent: "pelvis", pivot: [-3, 0, 0], box: [0, -2, -7], yaw: Math.PI / 4 },
    { name: "frontLeftFoot", parent: "frontLeftLeg", pivot: [0, -4, -14], box: [0, 10, 0], yaw: -Math.PI / 8 },
    { name: "backRightLeg", parent: "pelvis", pivot: [2, -2, 4], box: [0, -2, 7], yaw: Math.PI / 5 },
    { name: "backRightFoot", parent: "backRightLeg", pivot: [0, -4, 14], box: [0, 9, 0] },
    { name: "backLeftLeg", parent: "pelvis", pivot: [-2, -2, 4], box: [0, -2, 7], yaw: -Math.PI / 5 },
    { name: "backLeftFoot", parent: "backLeftLeg", pivot: [0, -4, 14], box: [0, 9, 0] },
];

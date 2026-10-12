import * as THREE from "three";
import { getSpriteUrl } from "../utils/texturePackLoader.js";
import { skinBox } from "./entityGeometry.js";

const SIZE_NAMES = ["small", "medium", "large"];

/** Three.js translation of Alex's Mobs 1.22.9 Catfish model geometry. */
export function createAlexCatfishRig(image, size = 0) {
    const sizeName = SIZE_NAMES[clampCatfishSize(size)];
    const texture = createTexture(image);
    const spitImage = new Image();
    const spitTexture = createTexture(spitImage);
    spitImage.onload = () => { spitTexture.needsUpdate = true; };
    spitImage.src = getSpriteUrl(`entity/alexsmobs/catfish_${sizeName}_spit.png`);

    const material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.95,
        alphaTest: 0.1,
        side: THREE.DoubleSide,
    });
    const group = new THREE.Group();
    group.name = "alexsmobs-catfish";
    const model = new THREE.Group();
    model.name = `catfish-${sizeName}-model-root`;
    group.add(model);

    const pivots = {};
    const part = (parent, name, [x, y, z], rotation = [0, 0, 0]) => {
        const joint = new THREE.Group();
        joint.name = name;
        joint.position.set(x / 16, -y / 16, z / 16);
        joint.rotation.set(...rotation);
        parent.add(joint);
        pivots[name] = joint;
        return joint;
    };
    const box = (parent, name, { x, y, z, w, h, d, u, v, mirror = false }) => {
        const geometry = skinBox(
            Math.max(w, 0.025),
            Math.max(h, 0.025),
            Math.max(d, 0.025),
            u,
            v,
            image,
            mirror,
            [w, h, d],
        );
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = name;
        mesh.position.set(
            (x + w / 2) / 16,
            -(y + h / 2) / 16,
            (z + d / 2) / 16,
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
    };

    if (sizeName === "small") {
        const body = part(model, "body", [0, -3, 0]);
        box(body, "body-box", { x: -4, y: -3, z: -8, w: 8, h: 6, d: 14, u: 0, v: 0 });

        const leftBarbel = part(body, "leftBarbel", [4, 1, -6], [0, -0.6109, 0]);
        box(leftBarbel, "left-barbel", { x: 0, y: 0, z: 0, w: 6, h: 3, d: 0, u: 0, v: 10 });
        const rightBarbel = part(body, "rightBarbel", [-4, 1, -6], [0, 0.6109, 0]);
        box(rightBarbel, "right-barbel", { x: -6, y: 0, z: 0, w: 6, h: 3, d: 0, u: 0, v: 10, mirror: true });

        const dorsalFin = part(body, "dorsalFin", [0, -3, -2], [-0.1309, 0, 0]);
        box(dorsalFin, "dorsal-fin", { x: 0, y: -4, z: 0, w: 0, h: 4, d: 5, u: 0, v: 21 });
        const leftFin = part(body, "leftFin", [4, 2, -3], [0, 0, -0.9163]);
        box(leftFin, "left-fin", { x: 0, y: 0, z: -1, w: 0, h: 2, d: 4, u: 19, v: 21 });
        const rightFin = part(body, "rightFin", [-4, 2, -3], [0, 0, 0.9163]);
        box(rightFin, "right-fin", { x: 0, y: 0, z: -1, w: 0, h: 2, d: 4, u: 19, v: 21, mirror: true });

        const tail = part(body, "tail", [0, 0, 7]);
        box(tail, "tail", { x: -2, y: -3, z: -1, w: 4, h: 5, d: 10, u: 0, v: 21 });
        box(tail, "tail-upper-ridge", { x: 0, y: -4, z: 2, w: 0, h: 1, d: 2, u: 0, v: 0 });
        box(tail, "tail-lower-ridge", { x: 0, y: 2, z: -1, w: 0, h: 2, d: 6, u: 0, v: 0 });
        const tailFin = part(tail, "tailFin", [0, 2, 9]);
        box(tailFin, "tail-fin", { x: 0, y: -7, z: -2, w: 0, h: 9, d: 10, u: 19, v: 27 });
        return finishRig(image, texture, spitTexture, material, group, model, pivots, sizeName);
    }

    if (sizeName === "medium") {
        const body = part(model, "body", [0, -5, 0]);
        box(body, "body-box", { x: -7, y: -6, z: -10, w: 14, h: 11, d: 18, u: 0, v: 0 });
        const dorsalFin = part(body, "dorsalFin", [0, -6, 0]);
        box(dorsalFin, "dorsal-fin", { x: 0, y: -4, z: -1, w: 0, h: 4, d: 7, u: 0, v: 0 });
        const leftFin = part(body, "leftFin", [7, 3, -2], [0, 0, -0.7854]);
        box(leftFin, "left-fin", { x: 0, y: 0, z: -1, w: 0, h: 3, d: 5, u: 0, v: 30 });
        const rightFin = part(body, "rightFin", [-7, 3, -2], [0, 0, 0.7854]);
        box(rightFin, "right-fin", { x: 0, y: 0, z: -1, w: 0, h: 3, d: 5, u: 0, v: 30, mirror: true });

        const tail = part(body, "tail", [0, -2, 9]);
        box(tail, "tail", { x: -5, y: -4, z: -1, w: 10, h: 8, d: 19, u: 0, v: 30 });
        box(tail, "tail-lower-ridge", { x: 0, y: 4, z: 1, w: 0, h: 4, d: 12, u: 53, v: 18 });
        box(tail, "tail-upper-ridge", { x: 0, y: -6, z: 4, w: 0, h: 2, d: 4, u: 8, v: 0 });
        const tailFin = part(tail, "tailFin", [0, -4, 17]);
        box(tailFin, "tail-fin", { x: 0, y: -3, z: -6, w: 0, h: 13, d: 21, u: 38, v: 37 });

        const head = part(body, "head", [0, -1, -11]);
        box(head, "head", { x: -6, y: -5, z: -5, w: 12, h: 9, d: 6, u: 47, v: 0 });
        const leftBigWhisker = part(head, "leftBigWhisker", [6, 1, -2], [0, -0.5236, 0]);
        box(leftBigWhisker, "left-big-whisker", { x: 0, y: 0, z: 0, w: 8, h: 5, d: 0, u: 0, v: 12 });
        const rightBigWhisker = part(head, "rightBigWhisker", [-6, 1, -2], [0, 0.5236, 0]);
        box(rightBigWhisker, "right-big-whisker", { x: -8, y: 0, z: 0, w: 8, h: 5, d: 0, u: 0, v: 12, mirror: true });
        const leftSmallWhisker = part(head, "leftSmallWhisker", [6, 3, -2], [0, 0, 0.4363]);
        box(leftSmallWhisker, "left-small-whisker", { x: 0, y: 0, z: 0, w: 5, h: 3, d: 0, u: 6, v: 30 });
        const rightSmallWhisker = part(head, "rightSmallWhisker", [-6, 3, -2], [0, 0, -0.4363]);
        box(rightSmallWhisker, "right-small-whisker", { x: -5, y: 0, z: 0, w: 5, h: 3, d: 0, u: 6, v: 30, mirror: true });
        return finishRig(image, texture, spitTexture, material, group, model, pivots, sizeName);
    }

    const body = part(model, "body", [0, -8, 0]);
    box(body, "body-box", { x: -10, y: -7, z: -14, w: 20, h: 15, d: 26, u: 0, v: 0 });
    const leftFin = part(body, "leftFin", [10, 5, -5], [0, 0, 0.6981]);
    box(leftFin, "left-fin", { x: 0, y: 0, z: -2, w: 5, h: 0, d: 8, u: 0, v: 0 });
    const rightFin = part(body, "rightFin", [-10, 5, -5], [0, 0, -0.6981]);
    box(rightFin, "right-fin", { x: -5, y: 0, z: -2, w: 5, h: 0, d: 8, u: 0, v: 0, mirror: true });
    const dorsalFin = part(body, "dorsalFin", [0, -7, -5], [-0.0873, 0, 0]);
    box(dorsalFin, "dorsal-fin", { x: 0, y: -7, z: 0, w: 0, h: 7, d: 8, u: 0, v: 0 });

    const tail = part(body, "tail", [0, -2, 13]);
    box(tail, "tail", { x: -6, y: -5, z: -1, w: 12, h: 11, d: 20, u: 0, v: 41 });
    box(tail, "tail-lower-ridge", { x: 0, y: 6, z: -1, w: 0, h: 4, d: 16, u: 0, v: 56 });
    box(tail, "tail-upper-ridge", { x: 0, y: -7, z: 4, w: 0, h: 2, d: 5, u: 16, v: 18 });
    const tailFin = part(tail, "tailFin", [0, 0, 17]);
    box(tailFin, "tail-fin", { x: 0, y: -10, z: -5, w: 0, h: 17, d: 23, u: 44, v: 18 });

    const head = part(body, "head", [0, -5, -15]);
    box(head, "head", { x: -9.5, y: -2, z: -7, w: 19, h: 13, d: 8, u: 56, v: 64 });
    const leftBigWhisker = part(head, "leftBigWhisker", [9.5, 6, -5], [0, -0.4363, 0.2618]);
    box(leftBigWhisker, "left-big-whisker", { x: 0, y: 0, z: 0, w: 15, h: 8, d: 0, u: 66, v: 0 });
    const rightBigWhisker = part(head, "rightBigWhisker", [-9.5, 6, -5], [0, 0.4363, -0.2618]);
    box(rightBigWhisker, "right-big-whisker", { x: -15, y: 0, z: 0, w: 15, h: 8, d: 0, u: 66, v: 0, mirror: true });
    const leftSmallWhisker = part(head, "leftSmallWhisker", [9.5, 8, -6], [0, 0.0436, 0.3054]);
    box(leftSmallWhisker, "left-small-whisker", { x: 0, y: 0, z: 0, w: 7, h: 6, d: 0, u: 0, v: 15 });
    const rightSmallWhisker = part(head, "rightSmallWhisker", [-9.5, 8, -6], [0, -0.0436, -0.3054]);
    box(rightSmallWhisker, "right-small-whisker", { x: -7, y: 0, z: 0, w: 7, h: 6, d: 0, u: 0, v: 15, mirror: true });
    return finishRig(image, texture, spitTexture, material, group, model, pivots, sizeName);
}

export function updateAlexCatfishRig(rig, entity, seconds) {
    const { pivots, group, material, texture, spitTexture } = rig;
    const phase = entity.swimPhase || seconds * 5;
    const moving = Math.min(1, Math.hypot(entity.velocity?.x || 0, entity.velocity?.y || 0) / 120);

    group.rotation.y = entity.direction < 0 ? Math.PI / 2 : -Math.PI / 2;
    material.map = entity.spitTime > 0 ? spitTexture : texture;
    material.needsUpdate = true;

    const chain = [pivots.body, pivots.tail, pivots.tailFin].filter(Boolean);
    for (const [index, joint] of chain.entries()) {
        const wave = phase - index * (rig.sizeName === "small" ? 0.55 : 0.5);
        joint.rotation.y = Math.sin(wave) * (0.035 + moving * 0.2);
    }
    for (const [index, name] of ["leftFin", "rightFin"].entries()) {
        const joint = pivots[name];
        if (joint) joint.rotation.z += Math.sin(phase * 1.1 + index * Math.PI) * (0.04 + moving * 0.16);
    }
    pivots.body.position.y += Math.sin(phase * 2) * (0.006 + moving * 0.012);

    if (pivots.dorsalFin) pivots.dorsalFin.rotation.x += Math.sin(seconds * 1.1) * 0.025;
    for (const [index, name] of ["leftBarbel", "rightBarbel", "leftBigWhisker", "rightBigWhisker", "leftSmallWhisker", "rightSmallWhisker"].entries()) {
        if (pivots[name]) pivots[name].rotation.y += Math.sin(seconds * 0.8 + index) * 0.02;
    }
    if (pivots.head) pivots.head.rotation.y += Math.sin(phase) * (0.015 + moving * 0.045);
}

function finishRig(image, texture, spitTexture, material, group, model, pivots, sizeName) {
    return {
        group,
        model,
        pivots,
        material,
        materials: [material],
        texture,
        spitTexture,
        sizeName,
        catfishRig: true,
        source: image.src,
    };
}

function createTexture(image) {
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
}

function clampCatfishSize(size) {
    return Math.max(0, Math.min(2, Math.floor(Number(size) || 0)));
}

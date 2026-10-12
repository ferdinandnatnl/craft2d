import * as THREE from "three";
import { BLOCK_SIZE } from "../utils/globals.js";
import { getSpriteUrl } from "../utils/texturePackLoader.js";
import { skinBox } from "./entityGeometry.js";

/** Three.js translation of the Alex's Mobs 1.22.9 cave centipede model. */
export function createAlexCentipedeRig(image, segmentCount = 5) {
    const texture = createTexture(image);
    const material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.98,
        alphaTest: 0.05,
        side: THREE.DoubleSide,
    });
    const eyeImage = new Image();
    const eyeTexture = createTexture(eyeImage);
    eyeImage.onload = () => { eyeTexture.needsUpdate = true; };
    eyeImage.src = getSpriteUrl("entity/alexsmobs/cave_centipede_eyes.png");
    const eyeMaterial = new THREE.MeshStandardMaterial({
        map: eyeTexture,
        roughness: 0.9,
        transparent: true,
        depthWrite: false,
        emissive: 0xffffff,
        emissiveIntensity: 0.12,
        side: THREE.DoubleSide,
    });

    const group = new THREE.Group();
    group.name = "alexsmobs-centipede";
    const pieces = [];
    const segmentTotal = clampSegmentCount(segmentCount);

    pieces.push(createHead(image, material, eyeMaterial));
    for (let index = 1; index < segmentTotal; index++) {
        pieces.push(createBodySegment(image, material, index === segmentTotal - 1));
    }
    for (const piece of pieces) {
        group.add(piece);
    }

    return {
        group,
        pieces,
        material,
        eyeMaterial,
        texture,
        eyeTexture,
        materials: [material, eyeMaterial],
        source: image.src,
        centipedeRig: true,
    };
}

export function updateAlexCentipedeRig(rig, entity, seconds) {
    const centerX = entity.position.x + entity.hitbox.x / 2;
    const centerY = entity.position.y + entity.hitbox.y / 2;
    const heading = entity.direction < 0 ? Math.PI / 2 : -Math.PI / 2;
    rig.group.rotation.y = 0;
    rig.pieces[0].rotation.y = heading;

    const moving = Math.min(1,
        Math.hypot(entity.velocity?.x || 0, entity.velocity?.y || 0) / (BLOCK_SIZE * 2));
    const phase = entity.walkPhase || seconds * 4;
    for (let index = 1; index < rig.pieces.length; index++) {
        const point = entity.segmentPositions?.[index - 1];
        if (point) {
            rig.pieces[index].position.set(
                (point.x - centerX) / BLOCK_SIZE,
                -(point.y - centerY) / BLOCK_SIZE,
                0,
            );
            const curve = Number.isFinite(point.angle) ? -point.angle * 0.25 : 0;
            rig.pieces[index].rotation.y = heading;
            rig.pieces[index].rotation.z = curve +
                Math.sin(phase - index * 0.62) * moving * 0.09;
        }
        const bob = Math.sin(phase * 1.4 - index * 0.8) * moving * 0.025;
        rig.pieces[index].position.y += bob;
    }

    const headBob = Math.sin(phase * 1.4) * moving * 0.025;
    rig.pieces[0].position.y = headBob;
}

function createHead(image, material, eyeMaterial) {
    const root = new THREE.Group();
    root.userData.material = material;
    box(root, "head", 14, 7, 13, 0, 62, image, -7, -3.125, -5.375);
    const eyes = new THREE.Mesh(
        skinBox(14, 7, 13, 0, 62, { width: 128, height: 128 }, false, [14, 7, 13]),
        eyeMaterial,
    );
    eyes.position.set(0, 0, 0);
    eyes.scale.setScalar(1.006);
    eyes.name = "head-eyes";
    eyes.castShadow = false;
    eyes.receiveShadow = false;
    root.add(eyes);
    box(root, "mandibles", 4, 2, 2, 0, 0, image, -2, -0.5, -6.8);
    box(root, "fangs", 14, 1, 6, 62, 28, image, -7, 2, -11.8);
    box(root, "left-antenna", 12, 0.8, 3, 55, 17, image, 2, -5.2, -10.5);
    box(root, "right-antenna", 12, 0.8, 3, 55, 17, image, -14, -5.2, -10.5, true);
    return root;
}

function createBodySegment(image, material, tail = false) {
    const root = new THREE.Group();
    root.userData.material = material;
    const dimensions = tail
        ? { width: 14, height: 9, depth: 16, u: 0, v: 27, x: -7, y: -4.2, z: -8 }
        : { width: 16, height: 10, depth: 16, u: 0, v: 0, x: -8, y: -5.4, z: -8 };
    box(root, tail ? "tail" : "body", dimensions.width, dimensions.height,
        dimensions.depth, dimensions.u, dimensions.v, image,
        dimensions.x, dimensions.y, dimensions.z);

    for (const side of [-1, 1]) {
        for (const z of [-5, 5]) {
            const startX = side < 0 ? -16 : 8;
            box(root, `leg-${side}-${z}-upper`, 8, 2.5, 2,
                42, 62, image, startX, 2, z - 1, side < 0);
            box(root, `leg-${side}-${z}-lower`, 7, 1.8, 1.5,
                0, 53, image, side < 0 ? -22 : 15, 3.5, z - 0.75, side < 0);
        }
    }

    if (tail) {
        box(root, "tail-left", 2, 3, 12, 62, 35, image, 2, -1.1, 7);
        box(root, "tail-right", 2, 3, 12, 62, 35, image, -4, -1.1, 7, true);
        box(root, "tail-tip-left", 1, 6, 20, 38, 30, image, 2.5, -1.1, 17);
        box(root, "tail-tip-right", 1, 6, 20, 38, 30, image, -3.5, -1.1, 17, true);
    }
    return root;
}

function box(parent, name, width, height, depth, u, v, image, x, y, z, mirror = false) {
    const geometry = skinBox(
        Math.max(width, 0.15),
        Math.max(height, 0.15),
        Math.max(depth, 0.15),
        u,
        v,
        image,
        mirror,
        [width, height, depth],
    );
    const mesh = new THREE.Mesh(geometry, parent.userData.material);
    mesh.name = name;
    mesh.position.set(
        (x + width / 2) / 16,
        -(y + height / 2) / 16,
        (z + depth / 2) / 16,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
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

function clampSegmentCount(count) {
    return Math.max(5, Math.min(8, Math.floor(Number(count) || 5)));
}

import { BoxGeometry } from "three";

export function skinBox(w, h, d, u, v, image, mirror = false, uvSize = [w, h, d], sideSlice = null) {
    const geometry = new BoxGeometry(w / 16, h / 16, d / 16);
    const uv = geometry.attributes.uv;
    const [uvWidth, uvHeight, uvDepth] = uvSize;
    // Three.js orders faces +X, -X, +Y, -Y, +Z, -Z; the skin faces +Z.
    // Its left side belongs on +X so facial details meet the front edge.
    const rects = [
        [u + uvDepth + uvWidth, v + uvDepth, uvDepth, uvHeight],
        [u, v + uvDepth, uvDepth, uvHeight],
        [u + uvDepth, v, uvWidth, uvDepth],
        [u + uvDepth + uvWidth, v, uvWidth, uvDepth],
        [u + uvDepth, v + uvDepth, uvWidth, uvHeight],
        [u + 2 * uvDepth + uvWidth, v + uvDepth, uvWidth, uvHeight],
    ];
    const W = image.width, H = image.height;
    rects.forEach(([x, y, width, height], face) => {
        if (sideSlice && [0, 1, 4, 5].includes(face)) {
            y += sideSlice.start;
            height = sideSlice.height;
        }
        const coords = [[x, y], [x + width, y], [x, y + height], [x + width, y + height]];
        for (let i = 0; i < 4; i++) {
            const u = mirror ? x + width - (coords[i][0] - x) : coords[i][0];
            uv.setXY(face * 4 + i, u / W, 1 - coords[i][1] / H);
        }
    });
    return geometry;
}

// Keep each half of a bent limb on the corresponding pixels of the original skin.
export function skinLimbHalf(w, d, u, v, image, lower = false) {
    return skinBox(w, 6, d, u, v, image, false, [w, 12, d], {
        start: lower ? 6 : 0,
        height: 6,
    });
}

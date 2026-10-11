import { BoxGeometry } from "three";

export function skinBox(w, h, d, u, v, image) {
    const geometry = new BoxGeometry(w / 16, h / 16, d / 16);
    const uv = geometry.attributes.uv;
    // Three.js orders faces +X, -X, +Y, -Y, +Z, -Z; the skin faces +Z.
    // Its left side belongs on +X so facial details meet the front edge.
    const rects = [
        [u + d + w, v + d, d, h], [u, v + d, d, h],
        [u + d, v, w, d], [u + d + w, v, w, d],
        [u + d, v + d, w, h], [u + 2 * d + w, v + d, w, h],
    ];
    const W = image.width, H = image.height;
    rects.forEach(([x, y, width, height], face) => {
        const coords = [[x, y], [x + width, y], [x, y + height], [x + width, y + height]];
        for (let i = 0; i < 4; i++) uv.setXY(face * 4 + i, coords[i][0] / W, 1 - coords[i][1] / H);
    });
    return geometry;
}

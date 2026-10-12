// Every column uses the same unit grid. Emit each exposed vertical block face,
// including both slope directions, so steps share exact edges without cracks.
export function scenerySeed(seed) {
    let value = 0;
    for (const letter of String(seed ?? 0)) value = (value * 31 + letter.charCodeAt(0)) | 0;
    return (value >>> 0) % 10007;
}

// Approximate how much open sky a terrain tile sees. This is computed once
// when scenery geometry is built, so valleys gain depth without another pass.
export function terrainSkyExposure(x, depth, heightAt) {
    const height = heightAt(x, depth);
    let blocked = 0;
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        let horizon = 0;
        for (let distance = 1; distance <= 4; distance++) {
            horizon = Math.max(horizon,
                (heightAt(x + dx * distance, depth + dz * distance) - height) / distance);
        }
        blocked += Math.min(1.5, Math.max(0, horizon));
    }
    return Math.max(0.58, 1 - blocked * 0.12);
}

export function terrainColumnFaces(x, depth, heightAt, floor) {
    const y = heightAt(x, depth), z = -depth - 0.5;
    const faces = [{
        normal: [0, 1, 0], top: true,
        corners: [[x,y,z+1],[x+1,y,z+1],[x+1,y,z],[x,y,z]],
    }];
    const neighbors = [
        { height: heightAt(x, depth - 1), normal: [0,0,1], edge: [[x,z+1],[x+1,z+1]] },
        { height: heightAt(x, depth + 1), normal: [0,0,-1], edge: [[x+1,z],[x,z]] },
        { height: heightAt(x - 1, depth), normal: [-1,0,0], edge: [[x,z],[x,z+1]] },
        { height: heightAt(x + 1, depth), normal: [1,0,0], edge: [[x+1,z+1],[x+1,z]] },
    ];
    for (const { height, normal, edge: [a,b] } of neighbors) {
        for (let level = Math.max(floor, height); level < y; level++) {
            faces.push({ normal, top: false,
                corners: [[a[0],level,a[1]],[b[0],level,b[1]],[b[0],level+1,b[1]],[a[0],level+1,a[1]]] });
        }
    }
    return faces;
}

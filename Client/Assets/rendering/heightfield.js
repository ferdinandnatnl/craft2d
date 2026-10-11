// Every column uses the same unit grid. Emit each exposed vertical block face,
// including both slope directions, so steps share exact edges without cracks.
export function scenerySeed(seed) {
    let value = 0;
    for (const letter of String(seed ?? 0)) value = (value * 31 + letter.charCodeAt(0)) | 0;
    return (value >>> 0) % 10007;
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

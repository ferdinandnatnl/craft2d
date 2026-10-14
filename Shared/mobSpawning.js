// A bounded light query reads current blocks, including newly placed torches.
// It does not mistake the renderer's minimum brightness for gameplay light.
export function hasBlockLightAt(x, y, sample) {
    const queue = [[x, y, 0]];
    const seen = new Set([`${x},${y}`]);
    for (let index = 0; index < queue.length; index++) {
        const [cx, cy, distance] = queue[index];
        const block = sample(cx, cy);
        if (!block) continue;
        if (block.emission > distance) return true;
        if (distance >= 15 || block.opaque) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const key = `${cx + dx},${cy + dy}`;
            if (seen.has(key)) continue;
            seen.add(key);
            queue.push([cx + dx, cy + dy, distance + 1]);
        }
    }
    return false;
}

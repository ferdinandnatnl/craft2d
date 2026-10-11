/** Find an obsidian frame around the ignited cell. Coordinates are block cells. */
export function findNetherPortalFrame(x, y, blockAt, { air, fire, obsidian }) {
    if (blockAt(x, y) !== fire) return null;

    let left = x;
    let right = x;
    while (x - left <= 21 && blockAt(left, y) !== obsidian) left--;
    while (right - x <= 21 && blockAt(right, y) !== obsidian) right++;
    const width = right - left - 1;
    // In a side view, a one-block opening is wide enough for the player.
    if (width < 1 || width > 21 || blockAt(left, y) !== obsidian || blockAt(right, y) !== obsidian) return null;

    let top = y;
    let bottom = y;
    while (y - top <= 21 && blockAt(x, top) !== obsidian) top--;
    while (bottom - y <= 21 && blockAt(x, bottom) !== obsidian) bottom++;
    const height = bottom - top - 1;
    if (height < 3 || height > 21 || blockAt(x, top) !== obsidian || blockAt(x, bottom) !== obsidian) return null;

    // Corners may be empty, as in Minecraft's minimum ten-block frame.
    for (let column = left + 1; column < right; column++) {
        if (blockAt(column, top) !== obsidian || blockAt(column, bottom) !== obsidian) return null;
    }
    for (let row = top + 1; row < bottom; row++) {
        if (blockAt(left, row) !== obsidian || blockAt(right, row) !== obsidian) return null;
        for (let column = left + 1; column < right; column++) {
            const block = blockAt(column, row);
            if (block !== fire && !(Array.isArray(air) ? air.includes(block) : block === air)) return null;
        }
    }
    return { left, right, top, bottom };
}

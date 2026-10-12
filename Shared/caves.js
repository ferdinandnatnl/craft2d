import tooloud from "./tooloud.js";

// All coordinates are world blocks. The seeded noise has no chunk-local state,
// so a chamber and its passages have the same shape on either side of a seam.
const perlin = tooloud.Perlin.noise;
const CELL_WIDTH = 160;

function cavernForCell(index) {
    const centerX = index * CELL_WIDTH + CELL_WIDTH / 2 +
        perlin(index * 0.83 + 0.17, 17.37, 411.41) * 90;
    const centerY = 24 + perlin(index * 0.71 + 0.21, 29.31, 617.37) * 20;
    const radiusX = Math.max(34, 44 + perlin(index * 0.97 + 0.15, 41.43, 823.19) * 32);
    const radiusY = Math.max(12, 18 + perlin(index * 0.91 + 0.31, 53.29, 1031.43) * 16);
    const character = perlin(index * 0.77 + 0.41, 67.47, 1237.29);
    // Regular water lakes remain available while some deeper chambers get lava.
    const lava = index % 4 !== 0 && centerY - radiusY < 18 &&
        (index % 5 === 2 || character > 0.06) &&
        perlin(index * 0.89 + 0.33, 79.11, 1531.73) > -0.15;
    const lake = index % 4 === 0 || character > 0.06 || lava;
    return {
        cellIndex: index,
        centerX, centerY, radiusX, radiusY,
        waterLevel: Math.floor(centerY - radiusY * (lava ? 0.68 : 0.42)),
        lake,
        fluid: lava ? "lava" : "water",
        entrance: index % 3 === 0 || perlin(index * 0.69 + 0.23, 73.31, 1429.17) > 0.38,
        active: index % 3 === 0 || character > -0.25,
        style: character < -0.13 ? "moss" : character > 0.23 ? "glow" : "stone",
    };
}

export function caveColumnAt(worldX) {
    const cell = Math.floor(worldX / CELL_WIDTH);
    const rooms = Array.from({ length: 7 }, (_, offset) =>
        cavernForCell(cell + offset - 3)).filter(cavern => cavern.active);
    const caverns = rooms.filter(cavern =>
        Math.abs(worldX - cavern.centerX) < cavern.radiusX + 9);
    const left = rooms.filter(room => room.centerX <= worldX).at(-1);
    const right = rooms.find(room => room.centerX > worldX);
    let passage = null;
    if (left && right) {
        const t = (worldX - left.centerX) / (right.centerX - left.centerX);
        passage = {
            y: left.centerY + (right.centerY - left.centerY) * t +
                perlin(worldX * 0.021 + 0.13, 13.37, 3301.41) * 8,
            radius: 2.6 + perlin(worldX * 0.033 + 0.27, 21.19, 3491.31) * 1.5,
        };
    }
    return { caverns, passage };
}

export function caveCellAt(worldX, y, surface, column = caveColumnAt(worldX)) {
    if (y <= 1 || y > surface) return "solid";

    for (const cavern of column.caverns) {
        const dx = (worldX - cavern.centerX) / cavern.radiusX;
        const dy = (y - cavern.centerY) / cavern.radiusY;
        // Broad chambers with an uneven roof, shelves, and a sloped floor.
        const edge = perlin(worldX * 0.075, y * 0.095, 1613) * 0.15 +
            perlin(worldX * 0.029, y * 0.065, 1801) * 0.11;
        if (y <= surface - 8 && dx * dx + dy * dy < 1 + edge) {
            return cavern.lake && y <= cavern.waterLevel ? cavern.fluid : "air";
        }

        // Only some large caverns have a narrow, winding surface fissure.
        if (cavern.entrance && y >= cavern.centerY && y <= surface) {
            const bend = perlin(y * 0.065, cavern.centerX * 0.015, 1997) * 7;
            if (Math.abs(worldX - cavern.centerX - bend) < 1.7) return "air";
        }
    }

    if (y > surface - 8 || y < 4) return "solid";
    if (column.passage && Math.abs(y - column.passage.y) < column.passage.radius) {
        return "air";
    }

    // Two differently scaled ridge fields make winding passages. Their
    // intersections join chambers without placing tunnels per chunk.
    const warpX = worldX + perlin(worldX * 0.018, y * 0.02, 2203) * 9;
    const warpY = y + perlin(worldX * 0.021, y * 0.017, 2411) * 7;
    const winding = Math.abs(perlin(warpX * 0.044, warpY * 0.059, 2617));
    const branch = Math.abs(perlin(warpX * 0.027, warpY * 0.044, 2819));
    const width = 0.018 + Math.max(0, perlin(worldX * 0.014, y * 0.018, 3023)) * 0.018;
    return winding < width || branch < 0.018 ? "air" : "solid";
}

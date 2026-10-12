import { BLOCK_SIZE, CHUNK_HEIGHT } from "../../utils/globals.js";
import { getBlock, hasBlockCollision } from "../../world/block.js";
import { findAStarPath } from "./astar.js";
export { findAStarPath } from "./astar.js";

export function findMinionPath(world, dimension, start, goal, maxVisited = 2500) {
    const blockAt = (x, y) => world.getBlockAtWorldPosition(
        x * BLOCK_SIZE,
        y * BLOCK_SIZE,
        false,
        dimension,
    );
    const canStandAt = (node) => getMinionStandability(world, dimension, node);
    const neighbors = (node) => {
        const adjacent = [];
        for (const dx of [-1, 1]) {
            for (const dy of [-1, 0, 1, 2]) {
                const next = { x: node.x + dx, y: node.y + dy };
                const clearanceCost = canStandAt(next);
                if (clearanceCost === false) continue;
                adjacent.push({
                    node: next,
                    cost: 1 + (dy < 0 ? 1.5 : dy > 0 ? 1.15 : 0) + clearanceCost,
                });
            }
        }
        return adjacent;
    };

    return findAStarPath(start, goal, {
        neighbors,
        maxVisited,
    });
}

export function getMinionStandability(world, dimension, node) {
    if (!node || node.y <= 2 || node.y >= CHUNK_HEIGHT) return false;
    const blockAt = (x, y) => world.getBlockAtWorldPosition(
        x * BLOCK_SIZE,
        y * BLOCK_SIZE,
        false,
        dimension,
    );
    const floor = blockAt(node.x, node.y);
    if (!floor) return false;
    const floorDef = getBlock(floor.blockType);
    if (!floorDef || floorDef.air || floorDef.fluid ||
        !hasBlockCollision(floor)) return false;

    let clearanceCost = 0;
    for (const bodyY of [node.y - 1, node.y - 2]) {
        const bodyBlock = blockAt(node.x, bodyY);
        if (!bodyBlock) return false;
        const def = getBlock(bodyBlock.blockType);
        if (!def || def.air || def.fluid || !def.collision) continue;
        if (def.chunkProtection || def.hardness < 0) return false;
        clearanceCost += Math.max(2, Math.min(20, def.hardness || 1));
    }
    return clearanceCost;
}

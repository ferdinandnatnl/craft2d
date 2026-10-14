import { BLOCK_SIZE, CHUNK_HEIGHT } from "../../utils/globals.js";
import { EntityTypes } from "../../game/entity.js";
import { getBlock, hasBlockCollision } from "../../world/block.js";
import { findAStarPath } from "./astar.js";
export { findAStarPath } from "./astar.js";

export function findMinionPath(world, dimension, start, goal, maxVisited = 2500, mover = null) {
    const blockAt = (x, y) => world.getBlockAtWorldPosition(
        x * BLOCK_SIZE,
        y * BLOCK_SIZE,
        false,
        dimension,
    );
    const canStandAt = (node) => getMinionStandability(world, dimension, node);
    const occupiedNodes = new Set();
    for (const entity of world.entities || []) {
        if (entity === mover ||
            entity.type !== EntityTypes.Player ||
            entity.dimension !== dimension || entity.health <= 0 ||
            !entity.hitbox || !Number.isFinite(entity.position?.x) ||
            !Number.isFinite(entity.position?.y)) continue;
        const centerX = Math.floor((entity.position.x + entity.hitbox.x / 2) / BLOCK_SIZE);
        const footY = Math.round((entity.position.y + entity.hitbox.y) / BLOCK_SIZE);
        for (let x = centerX - 1; x <= centerX + 1; x++) {
            for (let y = footY - 1; y <= footY + 1; y++) {
                occupiedNodes.add(`${x},${y}`);
            }
        }
    }
    const neighbors = (node) => {
        const adjacent = [];
        for (const dx of [-1, 1]) {
            for (const dy of [-1, 0, 1, 2]) {
                const next = { x: node.x + dx, y: node.y + dy };
                const clearanceCost = canStandAt(next);
                if (clearanceCost === false) continue;
                adjacent.push({
                    node: next,
                    cost: 1 + (dy < 0 ? 1.5 : dy > 0 ? 1.15 : 0) +
                        clearanceCost + (occupiedNodes.has(`${next.x},${next.y}`) ? 20 : 0),
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
    for (const bodyY of [node.y - 1]) {
        const bodyBlock = blockAt(node.x, bodyY);
        if (!bodyBlock) return false;
        const def = getBlock(bodyBlock.blockType);
        if (!def || def.air || def.fluid || !def.collision) continue;
        if (def.chunkProtection || def.hardness < 0) return false;
        clearanceCost += Math.max(2, Math.min(20, def.hardness || 1));
    }
    return clearanceCost;
}

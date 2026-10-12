import { EntityTypes } from "../game/entity.js";
import { BLOCK_SIZE } from "../utils/globals.js";

export const MAX_MOBS_NEAR_PLAYER = 24;
const MOB_LIMIT_RADIUS = 36 * BLOCK_SIZE;

export function countMobsNearPlayer(world, dimension = world.player?.dimension) {
    const playerX = world.player?.position.x;
    if (!Number.isFinite(playerX)) return 0;

    let count = 0;
    for (const entity of world.entities) {
        if (
            entity.type !== EntityTypes.Mob ||
            entity.dimension !== dimension ||
            Math.abs(entity.position.x - playerX) > MOB_LIMIT_RADIUS
        ) continue;

        count++;
        if (count >= MAX_MOBS_NEAR_PLAYER) return count;
    }
    return count;
}

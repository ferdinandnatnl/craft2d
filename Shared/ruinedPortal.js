import { isRandomSpreadChunk } from "./randomSpread.js";

/** Stable, sparse ruined-portal locations for newly generated Overworld chunks. */
export function isRuinedPortalChunk(seed, chunkIndex) {
    return isRandomSpreadChunk(seed, chunkIndex, {
        spacing: 40,
        separation: 15,
        salt: 34222645,
    });
}

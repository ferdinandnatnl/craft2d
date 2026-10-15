import { Blocks } from "./blocks.js";

const SLABS = new Set([
    Blocks.TestSlab, Blocks.StoneSlab, Blocks.OakSlab, Blocks.SpruceSlab,
    Blocks.AcaciaSlab, Blocks.BirchSlab, Blocks.JungleSlab, Blocks.CobblestoneSlab,
    Blocks.SandstoneSlab, Blocks.StoneBrickSlab, Blocks.MossyCobblestoneSlab,
    Blocks.SmoothStoneSlab, Blocks.CherrySlab,
]);

export const isSlabBlock = blockId => SLABS.has(blockId);

export function slabHalfAt(worldY, blockY, blockSize) {
    return worldY - blockY < blockSize / 2 ? "top" : "bottom";
}

export const isUpperSlab = block =>
    isSlabBlock(block?.blockType) && block.metaData?.half === "top";

export function slabVerticalBounds(block) {
    if (!isSlabBlock(block?.blockType)) return null;
    return isUpperSlab(block)
        ? { top: 0, bottom: 0.5 }
        : { top: 0.5, bottom: 1 };
}

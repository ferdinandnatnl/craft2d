import test from "node:test";
import assert from "node:assert/strict";
import { Blocks } from "../../Shared/blocks.js";
import { isSlabBlock, slabHalfAt, slabVerticalBounds } from "../../Shared/slabs.js";

test("slabs select the upper or lower half of the targeted cell", () => {
    assert.equal(slabHalfAt(100, 100, 32), "top");
    assert.equal(slabHalfAt(115.99, 100, 32), "top");
    assert.equal(slabHalfAt(116, 100, 32), "bottom");
    assert.equal(slabHalfAt(131.99, 100, 32), "bottom");
});

test("upper slabs keep their own collision height while old slabs remain lower", () => {
    assert.equal(isSlabBlock(Blocks.OakSlab), true);
    assert.equal(isSlabBlock(Blocks.StoneSlab), true);
    assert.equal(isSlabBlock(Blocks.OakPlanks), false);
    assert.deepEqual(slabVerticalBounds({ blockType: Blocks.OakSlab,
        metaData: { half: "top" } }), { top: 0, bottom: 0.5 });
    assert.deepEqual(slabVerticalBounds({ blockType: Blocks.OakSlab }),
        { top: 0.5, bottom: 1 });
});

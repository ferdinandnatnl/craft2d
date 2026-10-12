import test from "node:test";
import assert from "node:assert/strict";
import {
    insertInventoryItem,
    transferInventoryToStorage,
} from "../Assets/entities/minions/inventory.js";

const empty = () => ({ blockId: null, itemId: null, count: 0, props: {} });
const stack = (itemId, count, props = {}) => ({
    blockId: null,
    itemId,
    count,
    props,
});

test("worker inventory stacks matching items, keeps properties separate, and reports overflow", () => {
    const slots = [stack(20, 60), empty()];
    const remainder = insertInventoryItem(slots, stack(20, 10), () => 64);

    assert.equal(remainder, 0);
    assert.deepEqual(slots.map((item) => item.count), [64, 6]);

    const fullSlots = [stack(20, 64, { wall: true })];
    const overflow = insertInventoryItem(fullSlots, stack(20, 5), () => 64);
    assert.equal(overflow, 5);
});

test("chest delivery moves only what fits and leaves the rest in the worker bag", () => {
    const inventory = [stack(20, 10), empty()];
    const storage = [[stack(20, 60), empty()]];

    const hasRemainder = transferInventoryToStorage(
        inventory,
        storage,
        () => 64,
    );

    assert.equal(hasRemainder, false);
    assert.equal(storage[0][0].count, 64);
    assert.equal(storage[0][1].count, 6);
    assert.equal(inventory[0].count, 0);
});

test("a full chest preserves undelivered items without duplicating them", () => {
    const inventory = [stack(20, 9)];
    const storage = [[stack(20, 64)]];
    const originalCount = inventory.reduce((total, item) => total + item.count, 0) +
        storage[0].reduce((total, item) => total + item.count, 0);

    assert.equal(transferInventoryToStorage(inventory, storage, () => 64), true);
    const finalCount = inventory.reduce((total, item) => total + item.count, 0) +
        storage[0].reduce((total, item) => total + item.count, 0);
    assert.equal(finalCount, originalCount);
    assert.equal(inventory[0].count, 9);
});

import test from "node:test";
import assert from "node:assert/strict";
import { findNetherPortalFrame } from "../../Shared/netherPortal.js";

const AIR = 0;
const FIRE = 1;
const OBSIDIAN = 2;

function frame() {
    const blocks = new Map();
    const set = (x, y, type) => blocks.set(`${x},${y}`, type);
    const get = (x, y) => blocks.get(`${x},${y}`) ?? AIR;
    for (let x = 1; x <= 2; x++) {
        set(x, 0, OBSIDIAN);
        set(x, 4, OBSIDIAN);
    }
    for (let y = 1; y <= 3; y++) {
        set(0, y, OBSIDIAN);
        set(3, y, OBSIDIAN);
    }
    set(1, 3, FIRE);
    return { set, get };
}

const types = { air: AIR, fire: FIRE, obsidian: OBSIDIAN };

test("a cornerless ten-obsidian frame lights from inside", () => {
    const { get } = frame();
    assert.deepEqual(findNetherPortalFrame(1, 3, get, types), {
        left: 0, right: 3, top: 0, bottom: 4,
    });
});

test("a missing frame block or blocked interior prevents lighting", () => {
    const broken = frame();
    broken.set(3, 2, AIR);
    assert.equal(findNetherPortalFrame(1, 3, broken.get, types), null);

    const blocked = frame();
    blocked.set(2, 2, OBSIDIAN);
    assert.equal(findNetherPortalFrame(1, 3, blocked.get, types), null);
});

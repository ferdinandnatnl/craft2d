import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Blocks, blockMap } from "../../Shared/blocks.js";

globalThis.window = { indexedDB: { open: () => ({}) } };
const { FaceBatch } = await import("../Assets/rendering/materials.js");

test("end portal frame uses its top and side textures, including when filled", () => {
    for (const id of [Blocks.EndPortalFrame, Blocks.EndPortalFrameFilled]) {
        const def = blockMap.get(id);
        assert.equal(def.faceSprites.top, "endframe_top");
        assert.equal(def.faceSprites.bottom, "end_stone");
        assert.equal(def.faceSprites.front || def.sprite, "endframe_side");
        assert.equal(def.faceSprites.side || def.sprite, "endframe_side");
        const calls = [];
        const batch = new FaceBatch({ get(sprite, options) {
            calls.push({ sprite, options });
            return { sprite, options };
        } });
        batch.box(def.sprite, {}, 0, 0, 0, 1, 13 / 16, 1, 1, {}, def.faceSprites);
        assert.deepEqual(calls.map(({ sprite }) => sprite), [
            "endframe_side", "endframe_side", "endframe_side", "endframe_top", "end_stone",
        ]);
        assert.equal(calls[3].options.top, false);
    }
});

test("registered face textures have matching built-in assets", () => {
    for (const def of blockMap.values()) {
        for (const sprite of Object.values(def.faceSprites || {})) {
            const path = fileURLToPath(new URL(`../Assets/sprites/blocks/${sprite}.png`, import.meta.url));
            assert.ok(existsSync(path), `${def.name}: missing ${sprite}`);
        }
    }
});

import test from "node:test";
import assert from "node:assert/strict";

const canvas = { getContext: () => null };
globalThis.window = {
    location: { href: "http://localhost/game.html" },
    indexedDB: { open: () => ({}) },
};
globalThis.document = {
    getElementById: () => canvas,
    querySelector: () => null,
    addEventListener: () => {},
};
globalThis.localStorage = { getItem: () => null };

const { InputHandler } = await import("../Assets/utils/input.js");

test("a short touch action remains available for one game frame", () => {
    const input = new InputHandler({ place: ["Mouse2"] });
    input.setTouchAction("place", true);
    input.setTouchAction("place", false);

    assert.equal(input.isActionDown("place"), true);
    assert.equal(input.isActionPressed("place"), true);

    input.resetKeysPressed();
    assert.equal(input.isActionDown("place"), false);
    assert.equal(input.isActionPressed("place"), false);
});

test("a quick mouse click remains available after release", () => {
    const input = new InputHandler({ attack: ["Mouse0"] });
    input._handleMouseDown({ button: 0, target: canvas });
    input._handleMouseUp({ button: 0 });

    assert.equal(input.isActionPressed("attack"), true);
    assert.equal(input.isActionPressed("attack"), false);
});

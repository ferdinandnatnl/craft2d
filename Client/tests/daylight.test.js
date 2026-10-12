import test from "node:test";
import assert from "node:assert/strict";
import { daylightFactor, twilightFactor } from "../Assets/utils/daylight.js";
import { classicLightTint, renderLightTint } from "../Assets/rendering/renderLight.js";

test("daylight moves smoothly through dusk, night, dawn, and the time wrap", () => {
    assert.equal(daylightFactor(1), 1);
    assert.equal(daylightFactor(4.5), 0);
    assert.equal(daylightFactor(7.5), daylightFactor(1));
    for (const [early, late] of [[2.9, 3.2], [3.2, 3.5]]) {
        assert.ok(daylightFactor(early) > daylightFactor(late));
    }
    for (const [early, late] of [[6.1, 6.4], [6.4, 6.7]]) {
        assert.ok(daylightFactor(early) < daylightFactor(late));
    }
    for (const boundary of [2.85, 3.65, 6, 6.8]) {
        assert.ok(Math.abs(daylightFactor(boundary - 0.0001) -
            daylightFactor(boundary + 0.0001)) < 0.001);
    }
    assert.equal(twilightFactor(4.5), 0);
    assert.ok(twilightFactor(3.25) > 0);
});

test("open sky uses scene lighting while sheltered blocks keep local light", () => {
    assert.equal(renderLightTint(1, true, true), 1);
    assert.equal(renderLightTint(1, false, true), 0.22);
    assert.equal(renderLightTint(1, 0.5, true), 0.61);
    assert.equal(renderLightTint(12, false, true), 0.8);
    assert.equal(renderLightTint(1, false, false), 1);
    assert.equal(classicLightTint(1, true, 4.5), 0.62);
    assert.equal(classicLightTint(1, true, 1), 1);
    assert.equal(classicLightTint(1, false, 4.5), 0.2);
});

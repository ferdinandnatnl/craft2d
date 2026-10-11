import test from "node:test";
import assert from "node:assert/strict";
import { VolumetricSky } from "../Assets/rendering/volumetricSky.js";

const options = {
    width: 1920, height: 1080, time: 1, seconds: 30,
    cameraX: 100, cameraY: 2000, surfaceY: 2500, fov: 72,
};

test("the sky bounds GPU allocation while preserving the viewport projection", () => {
    const sky = new VolumetricSky();
    const renderer = { getRenderTarget: () => null, setRenderTarget() {}, render() {} };
    try {
        for (const [width, height] of [[3840, 2160], [1920, 1080], [800, 1000], [390, 844], [844, 390]]) {
            const texture = sky.draw(renderer, { ...options, width, height });
            assert.equal(texture, sky.target.texture);
            assert.ok(sky.target.width <= 960 && sky.target.height <= 540);
            assert.ok(Math.abs(sky.target.width / sky.target.height - width / height) < 0.01);
            assert.equal(sky.material.uniforms.aspect.value, width / height);
        }
    } finally {
        sky.dispose();
    }
});

test("a failed sky render restores the caller's render target", () => {
    const sky = new VolumetricSky();
    const previous = { name: "world reflection" };
    let active = previous;
    const renderer = {
        getRenderTarget: () => active,
        setRenderTarget: (target) => { active = target; },
        render() {
            assert.equal(active, sky.target);
            throw new Error("render failed");
        },
    };
    try {
        assert.throws(() => sky.draw(renderer, options), /render failed/);
        assert.equal(active, previous);
    } finally {
        sky.dispose();
    }
});

test("disposing the sky releases its GPU resources", () => {
    const sky = new VolumetricSky();
    const disposed = new Set();
    for (const resource of [sky.noise, sky.target, sky.geometry, sky.material]) {
        resource.addEventListener("dispose", () => disposed.add(resource));
    }
    sky.dispose();
    assert.equal(disposed.size, 4);
});

import { Blocks } from "@2dcraft.com/shared/blocks.js";

export const FALLING_LEAVES_DEFAULTS = Object.freeze({
    enabled: true,
    leafSpawnRate: 20,
    coniferLeafSpawnRate: 0,
    leafSize: 5,
    leafLifespan: 200,
    maxParticles: 80,
    leavesOnBlockHit: true,
    windEnabled: true,
    leafSpawnRates: Object.freeze({}),
});

const BUILT_IN_LEAVES = new Map([
    [Blocks.OakLeaves, { sprite: "leaves_oak", kind: "regular", gravity: 82, wind: 0.8, spin: 2.5 }],
    [Blocks.BirchLeaves, { sprite: "leaves_birch", kind: "regular", gravity: 82, wind: 0.8, spin: 2.5 }],
    [Blocks.AcaciaLeaves, { sprite: "leaves_acacia", kind: "regular", gravity: 82, wind: 0.8, spin: 2.5 }],
    [Blocks.CherryLeaves, { sprite: "cherry_leaves", kind: "cherry", gravity: 20, wind: 0.45, spin: 1 }],
    [Blocks.SpruceLeaves, { sprite: "leaves_spruce", kind: "conifer", gravity: 82, wind: 0.8, spin: 2.5 }],
    [Blocks.JungleLeaves, { sprite: "leaves_jungle", kind: "large", gravity: 82, wind: 0.8, spin: 2.5 }],
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function normalizeFallingLeavesSettings(settings = {}) {
    const input = settings && typeof settings === "object" ? settings : {};
    return {
        ...FALLING_LEAVES_DEFAULTS,
        ...input,
        enabled: input.enabled !== false,
        leavesOnBlockHit: input.leavesOnBlockHit !== false,
        windEnabled: input.windEnabled !== false,
        leafSpawnRate: clamp(Number(input.leafSpawnRate ?? FALLING_LEAVES_DEFAULTS.leafSpawnRate) || 0, 0, 40),
        coniferLeafSpawnRate: clamp(Number(input.coniferLeafSpawnRate ?? FALLING_LEAVES_DEFAULTS.coniferLeafSpawnRate) || 0, 0, 40),
        leafSize: clamp(Number(input.leafSize ?? FALLING_LEAVES_DEFAULTS.leafSize) || 1, 1, 10),
        leafLifespan: clamp(Number(input.leafLifespan ?? FALLING_LEAVES_DEFAULTS.leafLifespan) || 100, 100, 600),
        maxParticles: clamp(Math.floor(Number(input.maxParticles ?? FALLING_LEAVES_DEFAULTS.maxParticles) || 1), 1, 256),
        leafSpawnRates: input.leafSpawnRates && typeof input.leafSpawnRates === "object"
            ? { ...input.leafSpawnRates }
            : {},
    };
}

export function getFallingLeafProfile(blockType, definition = null) {
    const builtIn = BUILT_IN_LEAVES.get(blockType);
    if (builtIn) return { ...builtIn, sprite: definition?.particleSprite ?? builtIn.sprite };

    const descriptor = `${definition?.name ?? ""} ${definition?.sprite ?? ""} ${definition?.iconSprite ?? ""}`.toLowerCase();
    if (!/(leaf|leaves|foliage)/.test(descriptor)) return null;

    const kind = /(spruce|pine|fir|cypress|conifer)/.test(descriptor)
        ? "conifer"
        : /(jungle|palm|shrub)/.test(descriptor)
            ? "large"
            : "regular";
    const particleSprite = definition?.particleSprite ?? definition?.iconSprite ?? definition?.sprite;
    if (!particleSprite) return null;

    return {
        sprite: particleSprite,
        kind,
        gravity: kind === "regular" ? 82 : 20,
        wind: kind === "regular" ? 0.8 : 0.45,
        spin: kind === "regular" ? 2.5 : 1,
    };
}

export function getFallingLeafSpawnChance(blockType, settings = FALLING_LEAVES_DEFAULTS, definition = null) {
    const config = settings && typeof settings === "object"
        ? settings
        : FALLING_LEAVES_DEFAULTS;
    const profile = getFallingLeafProfile(blockType, definition);
    if (!profile) return 0;

    const perBlockRate = config.leafSpawnRates?.[blockType];
    if (Number.isFinite(Number(perBlockRate))) {
        return clamp(Number(perBlockRate) / 20 * 0.01, 0, 0.1);
    }

    if (profile.kind === "large") return 0;
    const rate = profile.kind === "conifer"
        ? config.coniferLeafSpawnRate ?? FALLING_LEAVES_DEFAULTS.coniferLeafSpawnRate
        : config.leafSpawnRate ?? FALLING_LEAVES_DEFAULTS.leafSpawnRate;
    return clamp((Number(rate) || 0) / 20 * 0.01, 0, 0.1);
}

export function shouldSpawnFallingLeaf(blockType, roll, settings = FALLING_LEAVES_DEFAULTS, definition = null) {
    return Number(roll) < getFallingLeafSpawnChance(blockType, settings, definition);
}

export function advanceFallingLeafMotion(particle, deltaSeconds, windX = 0) {
    const dt = clamp(Number(deltaSeconds) || 0, 0, 0.25);
    let velocityX = particle.vx;
    let velocityY = particle.vy;

    if (!particle.grounded) {
        velocityX += (windX - velocityX) * (particle.windCoefficient ?? 0.8) * dt / 3;
        if (!particle.inWater) velocityY += (particle.gravity ?? 82) * dt;
    }

    return {
        x: particle.x + velocityX * dt,
        y: particle.y + velocityY * dt,
        vx: velocityX,
        vy: velocityY,
    };
}

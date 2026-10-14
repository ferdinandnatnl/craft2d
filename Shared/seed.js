const MIN_JAVA_SEED = -(1n << 63n);
const MAX_JAVA_SEED = (1n << 63n) - 1n;

/** Convert a seed the same way Minecraft Java Edition converts seed text. */
export function minecraftJavaSeed(seedInput) {
    const text = String(seedInput ?? 0).trim();

    if (/^[+-]?\d+$/.test(text)) {
        try {
            const value = BigInt(text);
            if (value >= MIN_JAVA_SEED && value <= MAX_JAVA_SEED) return value;
        } catch {
            // Fall through to Java's String.hashCode behavior.
        }
    }

    let hash = 0;
    for (let index = 0; index < text.length; index++) {
        hash = (Math.imul(hash, 31) + text.charCodeAt(index)) | 0;
    }
    return BigInt(hash);
}

/** Fold Minecraft's 64-bit seed into the 32-bit seed accepted by tooloud. */
export function perlinSeed(seedInput) {
    const seed = minecraftJavaSeed(seedInput);
    const low = Number(BigInt.asIntN(32, seed));
    const high = Number(BigInt.asIntN(32, seed >> 32n));
    if (high === 0) return low;
    return Math.imul(low ^ high, 0x9e3779b1) | 0;
}

/** Stable hash for a seed-scoped feature, independent of chunk load order. */
export function seedHash(seedInput, key = "") {
    const input = `${minecraftJavaSeed(seedInput)}:${key}`;
    let hash = 2166136261;
    for (let index = 0; index < input.length; index++) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

export function createSeededRandom(seedInput, key = "") {
    let state = seedHash(seedInput, key);
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

export function randomInt(random, min, max) {
    return min + Math.floor(random() * (max - min));
}

export function randomMinecraftSeed() {
    const words = new Uint32Array(2);
    if (globalThis.crypto?.getRandomValues) {
        globalThis.crypto.getRandomValues(words);
    } else {
        words[0] = Math.floor(Math.random() * 4294967296);
        words[1] = Math.floor(Math.random() * 4294967296);
    }
    const unsigned = (BigInt(words[0]) << 32n) | BigInt(words[1]);
    return BigInt.asIntN(64, unsigned).toString();
}

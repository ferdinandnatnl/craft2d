export const DEFAULT_MINION_CONFIG = Object.freeze({
    evilDeedXPCost: 2,
    minionsPerPlayer: 4,
    foodCostSmall: 1.5,
    foodCostBig: 20,
    automaticDespawnDelay: 300,
    minionFollowRange: 30,
    evilDeeds: Object.freeze([
        "Spawn Satanist Cult",
        "Hold dark Mess",
        "Aid Corporate Supremacy",
        "Manipulate Baseball League",
        "Destroy Cardboard boxes",
        "Play someone off",
        "Unspeakable Act of Lust",
        "Join the Republicans",
        "Desecrate a Grave",
        "Be Professional",
        "Cheat Death",
        "Mock Peace Nobel Prize",
        "Talk Demontongue",
        "Taunt the Liberals",
        "Spread Sun Tzu Teachings",
        "Jam Radio Frequencies",
        "Pass Gas in someones Face",
        "Insurance Fraud",
        "Supreme Hedonism",
        "Baby Seal Clubbing",
        "Nelson someone",
        "Support Fox News",
        "Make Dinner",
        "Disturb Burial Ceremony",
        "Become Pop Smash Star",
        "Corrupt Pure Nun Thoughts",
        "Mess up the plan",
    ]),
    treeBlockIds: Object.freeze([]),
    treeBlockNames: Object.freeze([
        "cactus",
        "brown mushroom block",
        "red mushroom block",
    ]),
    worthlessBlockIds: Object.freeze([]),
    worthlessBlockNames: Object.freeze(["torch", "snow", "chest"]),
});

function numberInRange(value, fallback, min, max) {
    return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function validStringList(value, maxLength = 128) {
    if (!Array.isArray(value)) return null;
    return value.slice(0, 128)
        .filter((entry) => typeof entry === "string" && entry.length <= maxLength)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function validIdList(value) {
    if (!Array.isArray(value)) return null;
    return value.slice(0, 512)
        .filter((entry) => Number.isInteger(entry) && entry >= 0);
}

let cachedConfig;

/** Read the browser equivalent of Minions' minions.cfg and Advanced.cfg. */
export function getMinionConfig() {
    if (cachedConfig) return cachedConfig;
    let custom = {};
    try {
        const saved = globalThis.localStorage?.getItem("minionConfig");
        const parsed = saved ? JSON.parse(saved) : null;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) custom = parsed;
    } catch {
        custom = {};
    }

    const deedCost = Number.isFinite(custom.evilDeedXPCost)
        ? Math.max(-1, Math.min(20, Math.floor(custom.evilDeedXPCost)))
        : DEFAULT_MINION_CONFIG.evilDeedXPCost;
    const deeds = validStringList(custom.evilDeeds, 160);
    cachedConfig = Object.freeze({
        evilDeedXPCost: deedCost,
        minionsPerPlayer: Math.max(1, Math.min(4,
            Math.floor(numberInRange(
                custom.minionsPerPlayer,
                DEFAULT_MINION_CONFIG.minionsPerPlayer,
                1,
                4,
            )),
        )),
        foodCostSmall: numberInRange(
            custom.foodCostSmall,
            DEFAULT_MINION_CONFIG.foodCostSmall,
            0,
            100,
        ),
        foodCostBig: numberInRange(
            custom.foodCostBig,
            DEFAULT_MINION_CONFIG.foodCostBig,
            0,
            100,
        ),
        automaticDespawnDelay: numberInRange(
            custom.automaticDespawnDelay,
            DEFAULT_MINION_CONFIG.automaticDespawnDelay,
            0,
            86_400,
        ),
        minionFollowRange: numberInRange(
            custom.minionFollowRange,
            DEFAULT_MINION_CONFIG.minionFollowRange,
            2,
            128,
        ),
        evilDeeds: Object.freeze(deeds ?? [...DEFAULT_MINION_CONFIG.evilDeeds]),
        treeBlockIds: validIdList(custom.treeBlockIds) ||
            [...DEFAULT_MINION_CONFIG.treeBlockIds],
        treeBlockNames: validStringList(custom.treeBlockNames) ||
            [...DEFAULT_MINION_CONFIG.treeBlockNames],
        worthlessBlockIds: validIdList(custom.worthlessBlockIds) ||
            [...DEFAULT_MINION_CONFIG.worthlessBlockIds],
        worthlessBlockNames: validStringList(custom.worthlessBlockNames) ||
            [...DEFAULT_MINION_CONFIG.worthlessBlockNames],
    });
    return cachedConfig;
}

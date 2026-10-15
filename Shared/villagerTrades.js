import { Blocks } from "./blocks.js";
import { Items } from "./items.js";

export const VILLAGER_PROFESSIONS = Object.freeze([
    "armorer",
    "butcher",
    "cartographer",
    "cleric",
    "farmer",
    "fisherman",
    "fletcher",
    "leatherworker",
    "librarian",
    "mason",
    "shepherd",
    "toolsmith",
    "weaponsmith",
    "nitwit",
    "unemployed",
]);

export const TRADING_VILLAGER_PROFESSIONS = Object.freeze(
    VILLAGER_PROFESSIONS.filter((profession) =>
        profession !== "nitwit" && profession !== "unemployed"
    ),
);

export const VILLAGER_PROFESSION_NAMES = Object.freeze({
    armorer: "Armorer",
    butcher: "Butcher",
    cartographer: "Cartographer",
    cleric: "Cleric",
    farmer: "Farmer",
    fisherman: "Fisherman",
    fletcher: "Fletcher",
    leatherworker: "Leatherworker",
    librarian: "Librarian",
    mason: "Mason",
    shepherd: "Shepherd",
    toolsmith: "Toolsmith",
    weaponsmith: "Weaponsmith",
    nitwit: "Nitwit",
    unemployed: "Unemployed",
});

const item = (itemId, count = 1) => ({ itemId, count });
const block = (blockId, count = 1) => ({ blockId, count });
const trade = (costs, result, maxUses = 16) => ({
    costs,
    result,
    maxUses,
});

const EMERALD = Items.Emerald;

const VILLAGER_TRADES = Object.freeze({
    armorer: [
        trade([item(Items.Coal, 15)], item(EMERALD)),
        trade([item(Items.IronIngot, 4)], item(EMERALD)),
        trade([item(EMERALD, 5)], item(Items.Shield)),
    ],
    butcher: [
        trade([item(Items.RawBeef, 15)], item(EMERALD)),
        trade([item(Items.RawPorkchop, 15)], item(EMERALD)),
        trade([item(EMERALD)], item(Items.CookedBeef, 5)),
    ],
    cartographer: [
        trade([item(Items.Paper, 24)], item(EMERALD)),
        trade([item(EMERALD, 7), item(Items.Compass)], item(Items.EmptyMap)),
        trade([item(EMERALD, 5)], item(Items.Compass)),
    ],
    cleric: [
        trade([item(Items.RottenFlesh, 32)], item(EMERALD)),
        trade([item(EMERALD, 2)], item(Items.RedstoneDust, 4)),
        trade([item(EMERALD, 4)], item(Items.EnderPearl)),
    ],
    farmer: [
        trade([item(Items.Wheat, 20)], item(EMERALD)),
        trade([item(Items.Carrot, 15)], item(EMERALD)),
        trade([item(EMERALD)], item(Items.Bread, 3)),
    ],
    fisherman: [
        trade([item(Items.RawCod, 15)], item(EMERALD)),
        trade([item(Items.RawSalmon, 13)], item(EMERALD)),
        trade([item(EMERALD, 2)], item(Items.FishingRod)),
    ],
    fletcher: [
        trade([item(Items.Stick, 32)], item(EMERALD)),
        trade([item(Items.Feather, 26)], item(EMERALD)),
        trade([item(EMERALD)], item(Items.Flint, 4)),
    ],
    leatherworker: [
        trade([item(Items.Leather, 6)], item(EMERALD)),
        trade([item(Items.RabbitHide, 9)], item(EMERALD)),
        trade([item(EMERALD, 2)], item(Items.Leather, 3)),
    ],
    librarian: [
        trade([item(Items.Paper, 24)], item(EMERALD)),
        trade([item(EMERALD, 3)], item(Items.Book)),
        trade([item(Items.Book), item(EMERALD)], item(Items.Paper, 4)),
    ],
    mason: [
        trade([block(Blocks.Stone, 16)], item(EMERALD)),
        trade([item(EMERALD)], block(Blocks.StoneBricks, 4)),
        trade([item(EMERALD)], block(Blocks.SandStone, 4)),
    ],
    shepherd: [
        trade([block(Blocks.WhiteWool, 18)], item(EMERALD)),
        trade([item(EMERALD)], block(Blocks.BlueWool, 4)),
        trade([item(EMERALD)], block(Blocks.WhiteWool, 4)),
    ],
    toolsmith: [
        trade([item(Items.Coal, 15)], item(EMERALD)),
        trade([item(Items.IronIngot, 4)], item(EMERALD)),
        trade([item(EMERALD, 7)], item(Items.IronPickaxe)),
    ],
    weaponsmith: [
        trade([item(Items.Coal, 15)], item(EMERALD)),
        trade([item(Items.IronIngot, 4)], item(EMERALD)),
        trade([item(EMERALD, 7)], item(Items.IronSword)),
    ],
});

export function isVillagerProfession(profession) {
    return VILLAGER_PROFESSIONS.includes(profession);
}
export function createVillagerTradeOffers(profession, uses = []) {
    const offers = VILLAGER_TRADES[profession] ?? [];
    return offers.map((offer, index) => ({
        costs: offer.costs.map((cost) => ({ ...cost })),
        result: { ...offer.result },
        maxUses: offer.maxUses,
        uses: Number.isInteger(uses[index])
            ? Math.max(0, Math.min(offer.maxUses, uses[index]))
            : 0,
    }));
}

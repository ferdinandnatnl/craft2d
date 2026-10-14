import { Items } from "@2dcraft.com/shared/items.js";

export const CREATIVE_TABS = [
    { id: "building", label: "Building Blocks", icon: { blockId: 4 } },
    { id: "decoration", label: "Decoration Blocks", icon: { blockId: 22 } },
    { id: "redstone", label: "Redstone", icon: { blockId: 89 } },
    { id: "tools", label: "Tools & Combat", icon: { itemId: 2 } },
    { id: "food", label: "Food & Materials", icon: { itemId: 1504 } },
    { id: "mobs", label: "Spawn Eggs", icon: { itemId: Items.PigSpawnEgg } },
    { id: "search", label: "Search Items", icon: { itemId: 2004 } },
    { id: "inventory", label: "Survival Inventory", icon: { blockId: 51 } },
];

export function canUseAsWallpaper(block) {
    return Boolean(block?.sprite && !block.air);
}

export function creativeCategory(key, definition, isBlock) {
    if (isBlock) {
        if (/Redstone|PressurePlate|Hopper|Lever|TNT|NoteBlock/.test(key))
            return "redstone";
    if (/Flower|Grass$|Fern|Bush|Leaves|Sapling|Vines|Cactus|Torch|Sign|Ladder|Spawner|Door/.test(key))
            return "decoration";
        return "building";
    }

    if (definition.spawnEntity) return "mobs";

    if (definition.foodValue > 0 || /Apple|Carrot|Potato|Beef|Porkchop|Mutton|Bread/.test(key))
        return "food";
    if (/Sword|Bow|Arrow|Armor|Helmet|Chestplate|Leggings|Boots|Shield|FlintAndSteel/.test(key))
        return "tools";
    if (definition.toolType || /Shears|Bucket|FishingRod|Hammer|Axe|Pickaxe|Shovel|Hoe/.test(key))
        return "tools";
    return "food";
}

export function creativeMatchesSearch(name, query) {
    return name.toLowerCase().includes(query.trim().toLowerCase());
}

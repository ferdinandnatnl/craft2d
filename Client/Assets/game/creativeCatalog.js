import { Items } from "@2dcraft.com/shared/items.js";
import { Blocks } from "@2dcraft.com/shared/blocks.js";

export const CREATIVE_TABS = [
    { id: "building", row: "top", label: "Building Blocks", icon: { blockId: Blocks.StoneBricks } },
    { id: "decoration", row: "top", label: "Decoration Blocks", icon: { blockId: Blocks.FlowerRose } },
    { id: "nature", row: "top", label: "Natural Blocks", icon: { blockId: Blocks.GrassBlock } },
    { id: "functional", row: "top", label: "Functional Blocks", icon: { blockId: Blocks.CraftingTable } },
    { id: "redstone", row: "top", label: "Redstone", icon: { itemId: Items.RedstoneDust } },
    { id: "transportation", row: "top", label: "Transportation", icon: { itemId: Items.Boat } },
    { id: "search", row: "top", label: "Search Items", icon: { itemId: Items.EyeOfEnder } },
    { id: "tools", row: "bottom", label: "Tools", icon: { itemId: Items.WoodPickaxe } },
    { id: "combat", row: "bottom", label: "Combat", icon: { itemId: Items.IronSword } },
    { id: "food", row: "bottom", label: "Food", icon: { itemId: Items.Apple } },
    { id: "materials", row: "bottom", label: "Materials", icon: { itemId: Items.IronIngot } },
    { id: "mobs", row: "bottom", label: "Spawn Eggs", icon: { itemId: Items.PigSpawnEgg } },
    { id: "miscellaneous", row: "bottom", label: "Miscellaneous", icon: { itemId: Items.EnderPearl } },
    { id: "inventory", row: "bottom", label: "Survival Inventory", icon: { blockId: Blocks.Chest } },
];

export function canUseAsWallpaper(block) {
    return Boolean(block?.sprite && !block.air);
}

export function creativeCategory(key, definition, isBlock) {
    if (isBlock) {
        if (/Redstone|PressurePlate|Hopper|Lever|TNT|NoteBlock/.test(key))
            return "redstone";
        if (/Rail|Minecart|Boat/.test(key)) return "transportation";
        if (/Chest|Furnace|CraftingTable|Converter|Jukebox|Torch|Sign|Ladder|Spawner|Door/.test(key))
            return "functional";
        if (/Flower|Torch|Sign|Ladder|Spawner|Door/.test(key))
            return "decoration";
        if (/Grass|Fern|Bush|Leaves|Sapling|Vines|Cactus|Log|Tree/.test(key))
            return "nature";
        return "building";
    }

    if (definition.spawnEntity) return "mobs";

    if (/Bed/.test(key)) return "decoration";
    if (definition.foodValue > 0 || /Apple|Carrot|Potato|Beef|Porkchop|Mutton|Bread/.test(key))
        return "food";
    if (/Bow|Arrow|Armor|Helmet|Chestplate|Leggings|Boots|Shield/.test(key))
        return "combat";
    if (/Boat|Minecart|Rail/.test(key)) return "transportation";
    if (/IronIngot|GoldIngot|GoldNugget|Coal|Charcoal|RedstoneDust|NetherQuartz|Lapis|Dye|Leather|Bone|Gunpowder|Feather|String|Slimeball|Sugar/.test(key))
        return "materials";
    if (/Sword|FlintAndSteel|Shears|Bucket|FishingRod|Hammer|Axe|Pickaxe|Shovel|Hoe/.test(key) || definition.toolType)
        return "tools";
    if (key === "Diamond") return "food";
    return "miscellaneous";
}

export function creativeMatchesSearch(name, query) {
    return name.toLowerCase().includes(query.trim().toLowerCase());
}

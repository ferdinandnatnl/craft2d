import { inventoryRegistry } from "./inventoryRegistry.js";

export class LootItem {
    constructor({
        blockId = null,
        itemId = null,
        maxCount = 1,
        subtract = 0,
    } = {}) {
        this.blockId = blockId;
        this.itemId = itemId;
        this.maxCount = maxCount;
        this.subtract = subtract;
    }
}

export class LootTable {
    constructor(items = []) {
        this.items = items;
    }

    getRandomLoot(random = Math.random) {
        const loot = [];
        if (this.items.length === 0) return loot;
        const InventoryItem = inventoryRegistry.InventoryItem;
        this.items.forEach((item) => {
            const min = item.maxCount - item.subtract;
            const count = min + Math.floor(random() * (item.maxCount + 1 - min));

            if (count > 0) {
                loot.push(
                    new InventoryItem({
                        blockId: item.blockId,
                        itemId: item.itemId,
                        count: count,
                    }),
                );
            }
        });

        return loot;
    }
}

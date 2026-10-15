import { runtime } from "../utils/runtime.js";
import { InventoryItem, InventorySlot } from "./inventoryItem.js";
import { getItem, getItemSpritePath } from "@2dcraft.com/shared/item.js";
import { Items } from "@2dcraft.com/shared/items.js";
import { RecipeType } from "@2dcraft.com/shared/recipe.js";
import { recipes } from "@2dcraft.com/shared/recipes.js";
import { drawSkinPreview } from "./skinPreview.js";
import {
    playPositionalSound,
    playRandomSoundFromArray,
    playSound,
    Sounds,
} from "./sounds.js";
import { Vector2, randomRange } from "../utils/classes.js";
import { BLOCK_SIZE, multiplayer } from "../utils/globals.js";
import { input } from "../utils/input.js";
import { CANVAS, ctx, drawImage, drawRect, drawText, mouseOverPosition } from "../utils/renderer.js";
import { getSpriteSize, getSpriteUrl, isEqualToOriginal } from "../utils/texturePackLoader.js";
import { getBlock } from "../world/block.js";
import { Blocks } from "@2dcraft.com/shared/blocks.js";
import { VILLAGER_PROFESSION_NAMES } from "@2dcraft.com/shared/villagerTrades.js";
import { CREATIVE_TABS, canUseAsWallpaper, creativeCategory, creativeMatchesSearch } from "./creativeCatalog.js";

const VANILLA_GUI_SCALE = 2;
const LEGACY_GUI_SCALE = 3.5;
const CREATIVE_ROW_SIZE = 9;
const CREATIVE_VISIBLE_ROWS = 5;
const CREATIVE_TAB_STEP = 24;
// The fourth row follows the four standard inventory rows in saved inventory grids.
const OFFHAND_ROW = 4;
// Vanilla player-inventory GUI coordinates, scaled to match the existing screen.
const OFFHAND_POSITION = { x: 77 * LEGACY_GUI_SCALE, y: 62 * LEGACY_GUI_SCALE };

function getVanillaGuiScale() {
    if (!CANVAS) return VANILLA_GUI_SCALE;
    const bounds = CANVAS.getBoundingClientRect();
    if (!bounds.width || !CANVAS.width) return VANILLA_GUI_SCALE;
    const displayedScale = Math.max(1, Math.floor(Math.min(
        VANILLA_GUI_SCALE,
        (bounds.width - 16) / 195,
        (bounds.height - 16) / 200,
    )));
    return displayedScale * CANVAS.width / bounds.width;
}

export class Inventory {
    constructor() {
        this.inventoryUI = { x: 492, y: 150 };
        this.lastVanillaLayoutScale = null;

        this.items = [];
        this.craftingSlots = null;
        this.creativeSlots = null;

        this.creativeTab = "building";
        this.creativeScrollRow = 0;
        this.creativeSearch = "";
        this.creativeSearchInput = null;

        this.storageSlots = null;

        this.creativeItems = [];
        this.inventoryText = null;

        this.showItems = true;

        this.craftingOutputPosition = {
            x: 508,
            y: 130,
        };
        this.craftingOutputSlot = new InventorySlot({
            position: {
                ...this.craftingOutputPosition,
            },
            item: new InventoryItem(),
        });

        this.craftingPosition = {
            x: 312,
            y: 95,
        };

        this.signText = ["", "", "", ""];
        this.signEditingLine = 0;
        this.signCursor = 0;
        this.signCursorBlink = 0;
        this.isEditingSign = false;

        this.selectedBlock = null;
        this.selectedItem = null;
        this.currentSlot = 0;

        this.craftingTable = false;
        this.craftingGuideOpen = false;
        this.craftingGuidePage = 0;
        this.craftingGuideSelectedIndex = 0;
        this.craftingTableOutputPosition = {
            x: 437,
            y: 127,
        };
        this.craftingTablePosition = {
            x: 109,
            y: 64,
        };

        this.furnace = false;

        this.openUIOffset = { x: 0, y: 0 };
        this.openUIImage = {
            url: "inventory",
            crop: { x: 0, y: 0, width: 176, height: 166 },
        };
        this.openUIImageOffset = { x: 0, y: 0 };

        this.interactedBlock = null;

        this.lastHoveredSlot = { x: null, y: null };

        this.updateStorage = false;

        this.buttons = [];

        this.hoverItem = null;
        this.hoverSlot = { x: null, y: null, array: null };

        this.holdingItem = null;

        this.storage = null;
        this.villagerTrade = null;
        this.villagerTradeSelected = 0;

        this.wasItemInConverterOutput = false;

        this.lastSyncedInventoryPayload = "";

        this.createItemArray();

        this.populateCreativeInventory();
    }

    getGuiScale() {
        return this.openUIImage.url === "inventory" ||
            this.openUIImage.url === "villager" ||
            this.openUIImage.url.startsWith("creative_inventory/")
            ? getVanillaGuiScale()
            : LEGACY_GUI_SCALE;
    }

    usesVanillaInventoryLayout() {
        return this.openUIImage.url === "inventory" ||
            this.openUIImage.url === "villager" ||
            this.openUIImage.url.startsWith("creative_inventory/");
    }

    serializeInventoryForMultiplayer() {
        return Array.isArray(this.items)
            ? this.items.map((row) =>
                  Array.isArray(row)
                      ? row.map((slot) => {
                            const item = slot?.item ?? slot;
                            return {
                                blockId: item?.blockId || null,
                                itemId: item?.itemId || null,
                                count: item?.count || 0,
                                props: item?.props || {},
                            };
                        })
                      : [],
              )
            : [];
    }

    syncInventoryMultiplayer() {
        if (!multiplayer || !runtime.server || !runtime.world.player) return;
        if (runtime.world.player.inventory !== this) return;

        const inventoryPayload = this.serializeInventoryForMultiplayer();
        const payloadString = JSON.stringify(inventoryPayload);

        if (payloadString === this.lastSyncedInventoryPayload) return;

        this.lastSyncedInventoryPayload = payloadString;

        runtime.server.send({
            type: "playerInventory",
            sender: runtime.world.player.UUID,
            message: {
                inventory: inventoryPayload,
            },
        });
    }

    createItemArray() {
        for (let y = 0; y < 4; y++) {
            this.items[y] = [];
            for (let x = 0; x < 9; x++) {
                const position = {
                    x: 32 + x * 63,
                    y: y !== 3 ? 298 + y * 63 : 501,
                };

                this.items[y][x] = new InventorySlot({
                    position: position,
                    item: new InventoryItem(),
                });
            }
        }

        this.items[OFFHAND_ROW] = [
            new InventorySlot({
                position: { ...OFFHAND_POSITION },
                item: new InventoryItem(),
            }),
        ];

        this.createCraftingArray();
    }

    createCraftingArray(range = 2) {
        this.craftingSlots = [];
        for (let y = 0; y < range; y++) {
            this.craftingSlots[y] = [];
            for (let x = 0; x < range; x++) {
                this.craftingSlots[y][x] = new InventorySlot({
                    position: { x: 0, y: 0 },
                    item: new InventoryItem(),
                });
            }
        }
        this.positionCraftingSlots();
    }

    positionCraftingSlots() {
        const scale = this.getGuiScale();
        const basePosition = this.craftingTable
            ? { x: 30 * scale, y: 17 * scale }
            : { x: 88 * scale, y: 26 * scale };
        this.craftingOutputPosition = this.craftingTable
            ? { x: 125 * scale, y: 36 * scale }
            : { x: 143 * scale, y: 36 * scale };
        this.craftingOutputSlot.position = { ...this.craftingOutputPosition };

        for (let y = 0; y < this.craftingSlots.length; y++) {
            for (let x = 0; x < this.craftingSlots[y].length; x++) {
                this.craftingSlots[y][x].position = {
                    x: basePosition.x + x * 18 * scale,
                    y: basePosition.y + y * 18 * scale,
                };
            }
        }
    }

    dropAll(position) {
        for (let y = 0; y < this.items.length; y++) {
            for (let x = 0; x < this.items[y].length; x++) {
                const item = this.items[y][x].item;

                if (!item.blockId && (!item.itemId || item.itemId === 0))
                    continue;

                runtime.world.spawnDrop(
                    new Vector2(
                        position.x + randomRange(-BLOCK_SIZE, BLOCK_SIZE),
                        position.y,
                    ),
                    {
                        blockId: item.blockId,
                        itemId: item.itemId,
                        count: item.count,
                    },
                );
            }
        }

        this.createItemArray();
    }

    isSlotHovered(x, y) {
        const slotSize = this.usesVanillaInventoryLayout()
            ? 18 * this.getGuiScale()
            : 16 * 3;
        return mouseOverPosition(
            this.inventoryUI.x + x + this.openUIOffset.x,
            this.inventoryUI.y + y + this.openUIOffset.y,
            slotSize,
            slotSize,
        );
    }

    handleRightClickSpread(item, x, y, array) {
        if (array[y][x].onlyTake) return;
        if (
            input.isRightMouseDown() &&
            (this.lastHoveredSlot.x !== x || this.lastHoveredSlot.y !== y)
        ) {
            this.rightClickMovingLogic(item);
            this.lastHoveredSlot = { x, y };

            // Reverse sync if modifying storageSlots
            if (array === this.storageSlots) {
                this.reverseSync();
            }
        }
    }

    closeInventory() {
        this.removeCreativeSearchInput();
        let leftOver = [];

        for (let y = 0; y < this.craftingSlots.length; y++) {
            for (let x = 0; x < this.craftingSlots[y].length; x++) {
                const item = this.craftingSlots[y][x].item;

                if ((item.blockId || item.itemId != null) && item.count > 0) {
                    let leftOverCount = 0;
                    leftOverCount = this.addItem(item);
                    if (leftOverCount > 0) {
                        leftOver.push(
                            new InventoryItem({
                                blockId: item.blockId,
                                itemId: item.itemId,
                                count: leftOverCount,
                            }),
                        );
                    }
                }
            }
        }

        if (this.isEditingSign && this.interactedBlock) {
            // Save sign text
            if (!this.interactedBlock.metaData)
                this.interactedBlock.metaData = {};
            this.interactedBlock.metaData.text = [...this.signText];
            this.interactedBlock.syncMetaData();
        }

        this.isEditingSign = false;
        this.signText = ["", "", "", ""];
        this.signCursor = 0;
        this.inventoryText = null;

        this.inventoryText = null;

        this.wasItemInConverterOutput = false;

        this.openUIImageOffset = { x: 0, y: 0 };

        this.openUIOffset = { x: 0, y: 0 };

        this.openUIImage = {
            url: "inventory",
            crop: { x: 0, y: 0, width: 176, height: 166 },
        };

        this.positionPlayerInventorySlots(false);
        this.createCraftingArray();

        this.clearButtons();

        this.creativeSlots = null;
        this.creativeTab = "building";
        this.creativeScrollRow = 0;
        this.creativeSearch = "";

        this.storageSlots = null;

        this.storage = null;

        this.updateStorage = false;
        this.villagerTrade = null;
        this.villagerTradeSelected = 0;

        this.showItems = true;

        return leftOver.length > 0 ? leftOver : null;
    }

    addItemToArray(newItem, array) {
        let remaining = newItem.count;

        // First, try to add to existing stacks.
        for (let y = 0; y < array.length; y++) {
            for (let x = 0; x < array[y].length; x++) {
                let slot = array[y][x];
                if (this.isOffhandSlot(array, y, x)) continue;
                if (
                    !slot.isEmpty() &&
                    slot.item.blockId === newItem.blockId &&
                    slot.item.itemId === newItem.itemId &&
                    this.arePropsEqual(slot.item.props, newItem.props) && // Check props equality
                    slot.item.count < this.getStackSize(slot.item)
                ) {
                    if (slot.onlyTake) continue;

                    const available =
                        this.getStackSize(slot.item) - slot.item.count;
                    const toAdd = Math.min(remaining, available);
                    slot.item.count += toAdd;
                    remaining -= toAdd;
                    if (remaining === 0) return 0;
                }
            }
        }

        // Then, try to place into empty slots.
        for (let y = 0; y < array.length; y++) {
            for (let x = 0; x < array[y].length; x++) {
                let slot = array[y][x];
                if (this.isOffhandSlot(array, y, x)) continue;
                if (slot.isEmpty()) {
                    if (slot.onlyTake) continue;

                    // Place as many as possible in this slot.
                    const stackSize = this.getStackSize(newItem);
                    slot.item = this.cloneItem(newItem);
                    slot.item.count = Math.min(remaining, stackSize);
                    remaining -= slot.item.count;
                    if (remaining === 0) return 0;
                }
            }
        }
        return remaining;
    }

    cloneItem(item) {
        return new InventoryItem({
            blockId: item.blockId,
            itemId: item.itemId,
            count: item.count,
            props: structuredClone(item.props || {}),
        });
    }

    isOffhandSlot(array, y, x) {
        return array === this.items && y === OFFHAND_ROW && x === 0;
    }

    getOffhandItem() {
        return this.items[OFFHAND_ROW]?.[0]?.item ?? null;
    }

    removeOffhandItem(count = 1) {
        this.removeItem(OFFHAND_ROW, 0, count);
    }

    handleShiftClick(slot, array) {
        if (!input.shiftPressed || !array || slot.isEmpty()) return false;

        let targetArrays = null;
        if (array === this.items && this.storageSlots) {
            targetArrays = [this.storageSlots]; // Shift-clicking from inventory to hopper/chest
        } else if (array === this.storageSlots && this.items) {
            // Fill the main inventory before the hotbar when moving items out of storage.
            targetArrays = [this.items.slice(0, 3), this.items.slice(3, 4)];
        } else {
            if (this.creativeSlots && !slot.infiniteTake) {
                this.clearSlot(slot);
            }
            return false;
        }

        if (slot.onlyTake) return false;

        // Check whether any destination has slots that can accept items.
        const hasValidTarget = targetArrays.some((targetArray) =>
            targetArray.some((row) => row.some((targetSlot) => !targetSlot.onlyTake)),
        );
        if (!hasValidTarget) return false; // No valid slots to transfer into

        let itemToTransfer = this.cloneItem(slot.item);
        let originalCount = itemToTransfer.count;

        // Process each destination in order so hotbar stacks do not take items before
        // the main inventory has had a chance to accept them.
        let remaining = originalCount;
        for (const targetArray of targetArrays) {
            if (remaining <= 0) break;
            itemToTransfer.count = remaining;
            remaining = this.addItemToArray(itemToTransfer, targetArray);
        }
        let moved = originalCount - remaining;

        // Deduct the moved amount from the source slot
        if (moved > 0) {
            slot.item.count -= moved;
            if (slot.item.count <= 0) {
                this.clearSlot(slot);
            }

            // If transferring TO storageSlots (e.g., hopper), sync this.storage with the updated storageSlots
            if (targetArrays.includes(this.storageSlots)) {
                for (let i = 0; i < this.storageSlots.length; i++) {
                    for (let j = 0; j < this.storageSlots[i].length; j++) {
                        this.storage[i][j] = this.cloneItem(
                            this.storageSlots[i][j].item,
                        );
                    }
                }
            }

            // If transferring FROM storageSlots, sync this.storage with the updated storageSlots
            if (array === this.storageSlots) {
                for (let i = 0; i < this.storageSlots.length; i++) {
                    for (let j = 0; j < this.storageSlots[i].length; j++) {
                        this.storage[i][j] = this.cloneItem(
                            this.storageSlots[i][j].item,
                        );
                    }
                }
            }
        }

        return moved > 0; // Return true only if items were actually moved
    }

    syncStorageSlots() {
        if (!this.storageSlots || !this.storage) return;

        for (let i = 0; i < this.storageSlots.length; i++) {
            for (let j = 0; j < this.storageSlots[i].length; j++) {
                this.storageSlots[i][j].item = this.cloneItem(
                    this.storage[i][j],
                );
            }
        }

        // console.log("sync storage slots", this.storageSlots);
    }

    openConverter(storage) {
        this.storage = storage;

        let slots = [];

        this.openUIImage = {
            url: "converter",
            crop: { x: 0, y: 0, width: 176, height: 166 },
        };
        this.positionPlayerInventorySlots(false);

        slots = [
            [
                new InventorySlot({
                    position: { x: 193, y: 123 },
                    item: this.storage[0][0],
                }),
                new InventorySlot({
                    position: { x: 410, y: 126 },
                    onlyTake: true,
                }),
            ],
        ];

        this.storageSlots = slots;
    }

    reloadStorageSlots() {
        if (!this.storage || !this.storageSlots) return;

        console.log("Reloading storage slots...");

        if (this.interactedBlock) {
            this.storage =
                this.interactedBlock.metaData?.storage || this.storage;
        }

        // Determine the type of storage (chest, hopper, furnace, converter) based on openUIImage.url
        const storageType = this.openUIImage.url;

        if (storageType === "single_chest") {
            // Reload chest slots
            this.createChestSlots();
        } else if (storageType === "hopper") {
            // Reload hopper slots
            this.openHopper(this.storage);
        } else if (storageType === "furnace") {
            // Reload furnace slots
            this.createFurnaceSlots();
        } else if (storageType === "converter") {
            // Reload converter slots
            this.openConverter(this.storage);
        }

        // Ensure the storageSlots are synchronized with the storage
        this.syncStorageSlots();
    }

    openVillagerTrade(villager) {
        this.villagerTrade = villager;
        this.villagerTradeSelected = 0;
        this.openUIImage = {
            url: "villager",
            crop: { x: 0, y: 0, width: 176, height: 166 },
        };
        this.positionPlayerInventorySlots(false);
        this.craftingSlots = [];
        this.craftingTable = false;
        this.clearSlot(this.craftingOutputSlot);
        this.storage = null;
        this.storageSlots = [];
        this.updateStorage = false;
        this.clearButtons();
        this.showItems = true;
        this.interactedBlock = null;
    }

    getVillagerTradeRowBounds(index) {
        const scale = this.getGuiScale();
        return {
            x: this.inventoryUI.x + 6 * scale,
            y: this.inventoryUI.y + (7 + index * 20) * scale,
            width: 24 * scale,
            height: 18 * scale,
        };
    }

    getVillagerTradeOutputBounds() {
        const scale = this.getGuiScale();
        return {
            x: this.inventoryUI.x + 114 * scale,
            y: this.inventoryUI.y + 49 * scale,
            width: 20 * scale,
            height: 20 * scale,
        };
    }

    updateVillagerTrade() {
        const villager = this.villagerTrade;
        const player = runtime.world?.player;
        if (!villager || !player || villager.health <= 0 || villager.isSleeping ||
            villager.dimension !== player.dimension) {
            player?.closeInventory();
            return;
        }

        villager.checkTradeRestock?.();
        this.hoverItem = null;
        this.hoverSlot = { x: null, y: null, array: null };
        const mouse = input.getMousePosition();
        const offers = villager.tradeOffers ?? [];
        const rowIndex = offers.findIndex((_, index) => {
            const bounds = this.getVillagerTradeRowBounds(index);
            return mouseOverPosition(
                bounds.x,
                bounds.y,
                bounds.width,
                bounds.height,
            );
        });
        if (rowIndex !== -1) {
            if (input.isLeftMouseButtonPressed()) {
                this.villagerTradeSelected = rowIndex;
            }
            return;
        }

        const outputBounds = this.getVillagerTradeOutputBounds();
        if (mouseOverPosition(
            outputBounds.x,
            outputBounds.y,
            outputBounds.width,
            outputBounds.height,
        )) {
            if (input.isLeftMouseButtonPressed()) {
                this.completeVillagerTrade(this.villagerTradeSelected);
            }
            return;
        }

        this.mouseHoverOverSlotsLogic();
        if (!input.isRightMouseDown()) this.resetLastHoveredSlot();
    }

    getVillagerTradeCostPlan(offer) {
        if (!Array.isArray(offer?.costs) || offer.costs.length === 0) return null;

        const requirements = new Map();
        for (const cost of offer.costs) {
            const isItem = cost?.itemId !== undefined;
            const id = isItem ? cost.itemId : cost?.blockId;
            if (id === null || id === undefined ||
                !Number.isInteger(cost?.count) || cost.count <= 0) {
                return null;
            }

            const key = `${isItem ? "item" : "block"}:${id}`;
            const requirement = requirements.get(key);
            if (requirement) requirement.count += cost.count;
            else requirements.set(key, { isItem, id, count: cost.count });
        }

        const plan = [];
        for (const requirement of requirements.values()) {
            let remaining = requirement.count;
            for (let y = 0; y < this.items.length && remaining > 0; y++) {
                if (y === OFFHAND_ROW) continue;
                for (let x = 0; x < this.items[y].length && remaining > 0; x++) {
                    const current = this.items[y][x].item;
                    const matches = requirement.isItem
                        ? current.itemId === requirement.id && current.blockId == null
                        : current.blockId === requirement.id && current.itemId === null;
                    if (!matches || current.count <= 0) continue;

                    const count = Math.min(current.count, remaining);
                    plan.push({ y, x, count });
                    remaining -= count;
                }
            }
            if (remaining > 0) return null;
        }
        return plan;
    }

    villagerTradeHasResources(offer) {
        return this.getVillagerTradeCostPlan(offer) !== null;
    }

    completeVillagerTrade(index) {
        const villager = this.villagerTrade;
        const player = runtime.world?.player;
        const offer = villager?.tradeOffers?.[index];
        if (!villager || !player || villager.health <= 0 || villager.isSleeping ||
            villager.dimension !== player.dimension || !offer) return false;

        const costPlan = this.getVillagerTradeCostPlan(offer);
        if (offer.uses >= offer.maxUses || !costPlan) {
            playRandomSoundFromArray({
                array: Sounds.Villager_No,
                positional: true,
                origin: villager.position,
                range: 8,
            });
            return false;
        }

        for (const { y, x, count } of costPlan) this.removeItem(y, x, count);
        const output = new InventoryItem({ ...offer.result });
        const overflow = this.addItem(output);
        if (overflow > 0) {
            player.drop(new InventoryItem({ ...offer.result, count: overflow }), overflow);
        }
        offer.uses++;
        villager.tradeCount = Math.min(1_000_000, (villager.tradeCount || 0) + 1);
        villager.refreshTradeRank?.();
        playRandomSoundFromArray({
            array: Sounds.Villager_Yes,
            positional: true,
            origin: villager.position,
            range: 8,
        });
        return true;
    }

    drawVillagerTrades() {
        const villager = this.villagerTrade;
        if (!villager) return;
        const scale = this.getGuiScale();
        const offers = villager.tradeOffers ?? [];
        const profession = VILLAGER_PROFESSION_NAMES[villager.profession] ?? "Villager";
        const ranks = ["", "Novice", "Apprentice", "Journeyman", "Expert", "Master"];
        drawText({
            text: profession,
            x: this.inventoryUI.x + 137 * scale,
            y: this.inventoryUI.y + 14 * scale,
            size: 9 * scale,
            textAlign: "center",
            shadow: true,
        });
        drawText({
            text: ranks[villager.professionLevel] ?? "Novice",
            x: this.inventoryUI.x + 137 * scale,
            y: this.inventoryUI.y + 30 * scale,
            size: 8 * scale,
            textAlign: "center",
            color: "#e7dca4",
            shadow: true,
        });

        const drawTradeItem = (tradeItem, x, y) => {
            if (!tradeItem) return;
            const slot = new InventorySlot({
                position: { x, y },
                item: new InventoryItem({ ...tradeItem }),
            });
            slot.draw(
                this.inventoryUI.x + this.openUIOffset.x,
                this.inventoryUI.y + this.openUIOffset.y,
                null,
                scale / 3,
            );
        };

        drawRect({
            x: this.inventoryUI.x + 31 * scale,
            y: this.inventoryUI.y + 6 * scale,
            width: scale,
            height: 65 * scale,
            color: "rgba(0,0,0,0.22)",
        });

        for (let index = 0; index < offers.length; index++) {
            const offer = offers[index];
            const bounds = this.getVillagerTradeRowBounds(index);
            if (index === this.villagerTradeSelected) {
                drawRect({
                    ...bounds,
                    color: "rgba(255,255,255,0.35)",
                });
            }
            drawTradeItem(offer.costs?.[0], 8 * scale, (8 + index * 20) * scale);
        }

        const selected = offers[this.villagerTradeSelected];
        if (!selected) return;
        const available = this.villagerTradeHasResources(selected) &&
            selected.uses < selected.maxUses;
        for (let index = 0; index < selected.costs.length; index++) {
            drawTradeItem(selected.costs[index], (35 + index * 24) * scale, 51 * scale);
        }
        drawTradeItem(selected.result, 116 * scale, 51 * scale);
        if (!available) {
            drawRect({
                x: this.inventoryUI.x + 114 * scale,
                y: this.inventoryUI.y + 49 * scale,
                width: 20 * scale,
                height: 20 * scale,
                color: "rgba(0,0,0,0.45)",
            });
        }
        drawText({
            text: `${Math.max(0, selected.maxUses - selected.uses)}/${selected.maxUses}`,
            x: this.inventoryUI.x + 126 * scale,
            y: this.inventoryUI.y + 77 * scale,
            size: 7 * scale,
            textAlign: "center",
            shadow: true,
        });
    }

    openHopper(storage) {
        this.storage = storage;

        let slots = [[]];

        this.updateStorage = true;

        this.openUIImage = {
            url: "hopper",
            crop: { x: 0, y: 0, width: 176, height: 133 },
        };
        this.positionPlayerInventorySlots(false);

        for (let x = 0; x < this.storage[0].length; x++) {
            slots[0].push(
                new InventorySlot({
                    position: { x: 158 + x * 63, y: 189 },
                    item: this.storage[0][x],
                }),
            );
        }

        this.openUIOffset.y = -115;

        this.storageSlots = slots;
    }

    openSign(text) {
        this.openUIImage = {
            url: "sign",
            crop: { x: 0, y: 0, width: 88, height: 55 },
        };
        this.openUIImageOffset.y = 100;
        this.showItems = false;

        this.isEditingSign = true;
        this.signEditingLine = 0;
        this.signCursor = 0;

        // Initialize text from block metadata or provided text
        if (text) {
            this.signText = [...text];
            while (this.signText.length < 4) this.signText.push("");
        } else {
            this.signText = ["", "", "", ""];
        }

        this.inventoryText = new TextElement({
            position: { x: 300, y: -152 },
            text: "Edit Sign",
            size: 27,
        });
    }

    handleSignTyping() {
        if (!this.isEditingSign) return;

        const upPressed = input.isActionPressed("chatHistoryUp");
        const downPressed = input.isActionPressed("chatHistoryDown");
        const leftPressed = input.isActionPressed("signCursorLeft");
        const rightPressed = input.isActionPressed("signCursorRight");
        const submitPressed = input.isActionPressed("signSubmit");
        const deletePressed = input.isActionPressed("signDelete");
        const pressedKey = input.getLastPressedKey();

        if (upPressed) {
            this.signEditingLine = Math.max(this.signEditingLine - 1, 0);
            this.signCursor = Math.min(
                this.signCursor,
                this.signText[this.signEditingLine].length,
            );
        } else if (downPressed) {
            this.signEditingLine = Math.min(this.signEditingLine + 1, 3);
            this.signCursor = Math.min(
                this.signCursor,
                this.signText[this.signEditingLine].length,
            );
        } else if (leftPressed) {
            this.signCursor = Math.max(this.signCursor - 1, 0);
        } else if (rightPressed) {
            this.signCursor = Math.min(
                this.signCursor + 1,
                this.signText[this.signEditingLine].length,
            );
        } else if (submitPressed) {
            this.signEditingLine = Math.min(this.signEditingLine + 1, 3);
            this.signCursor = Math.min(
                this.signCursor,
                this.signText[this.signEditingLine].length,
            );
        } else if (deletePressed) {
            const currentLine = this.signText[this.signEditingLine];
            if (this.signCursor > 0) {
                this.signText[this.signEditingLine] =
                    currentLine.slice(0, this.signCursor - 1) +
                    currentLine.slice(this.signCursor);
                this.signCursor = Math.max(this.signCursor - 1, 0);
            } else if (this.signEditingLine > 0) {
                this.signEditingLine--;
                this.signCursor = this.signText[this.signEditingLine].length;
            }
        } else if (pressedKey && pressedKey.length === 1) {
            if (this.signText[this.signEditingLine].length < 10) {
                const currentLine = this.signText[this.signEditingLine];
                this.signText[this.signEditingLine] =
                    currentLine.slice(0, this.signCursor) +
                    pressedKey +
                    currentLine.slice(this.signCursor);
                this.signCursor = Math.min(
                    this.signCursor + 1,
                    this.signText[this.signEditingLine].length,
                );
            }
        }

        // Live sync to block
        if (this.interactedBlock) {
            if (!this.interactedBlock.metaData)
                this.interactedBlock.metaData = {};
            this.interactedBlock.metaData.text = [...this.signText];
            this.interactedBlock.syncMetaData?.();
        }
    }

    updateConverter() {
        // Ensure we're in converter mode
        if (!this.storageSlots) return;

        const leftSlot = this.storageSlots[0][0];
        const rightSlot = this.storageSlots[0][1];

        if (leftSlot.isEmpty()) {
            this.wasItemInConverterOutput = false;
            rightSlot.clear();
            return;
        }

        const leftItem = this.getSlotItem(leftSlot.item);

        if (!leftItem) {
            this.wasItemInConverterOutput = false;
            rightSlot.clear();
            return;
        }

        // Any textured block can become inert background wallpaper.
        const blockId = leftSlot.item.blockId || leftItem.placeBlock;
        const wallpaperBlock = blockId ? getBlock(blockId) : null;
        if (!canUseAsWallpaper(wallpaperBlock)) {
            this.wasItemInConverterOutput = false;
            rightSlot.clear();
            return;
        }

        if (
            this.wasItemInConverterOutput &&
            !this.getSlotItem(rightSlot.item)
        ) {
            this.wasItemInConverterOutput = false;
            leftSlot.clear();
            rightSlot.clear();

            this.reverseSync();

            playPositionalSound(runtime.world.player.position, "blocks/anvil_use.ogg");
            return;
        }

        // Set the right slot to the converted item
        rightSlot.item = this.cloneItem(leftSlot.item); // Use leftSlot.item directly since it’s already an InventoryItem

        // Determine if the output becomes a wall (toggle based on input)
        const becomesWall = !(
            leftSlot.item.props && leftSlot.item.props.wall === true
        );

        rightSlot.item.props = { ...leftSlot.item.props };
        if (becomesWall) rightSlot.item.props.wall = true;
        else delete rightSlot.item.props.wall;
        rightSlot.item.count = leftSlot.item.count;

        this.wasItemInConverterOutput = true;
    }

    openFurnace(storage) {
        this.furnace = true;
        this.storage = storage;

        this.updateStorage = true;

        this.openUIImage = {
            url: "furnace",
            crop: { x: 0, y: 0, width: 176, height: 166 },
        };
        this.positionPlayerInventorySlots(false);

        this.createFurnaceSlots();
    }

    openCreativeInventory() {
        this.removeCreativeSearchInput();
        this.creativeTab = "building";
        this.creativeScrollRow = 0;
        this.creativeSearch = "";
        this.openUIOffset = { x: 0, y: 0 };
        this.openUIImageOffset = { x: 0, y: 0 };
        this.setCreativeBackground();
        this.positionPlayerInventorySlots(true);
        this.clearButtons();
        this.createCreativeSlots();
        this.inventoryText = null;
    }

    setCreativeBackground() {
        const image = this.creativeTab === "inventory"
            ? "tab_inventory"
            : this.creativeTab === "search"
              ? "tab_item_search"
              : "tab_items";
        this.openUIImage = {
            url: `creative_inventory/${image}`,
            crop: { x: 0, y: 0, width: 195, height: 136 },
        };
    }

    selectCreativeTab(tab) {
        if (this.creativeTab === tab) return;
        this.removeCreativeSearchInput();
        this.creativeTab = tab;
        this.creativeScrollRow = 0;
        this.setCreativeBackground();
        this.positionPlayerInventorySlots(true);
        this.createCreativeSlots();
        if (tab === "search") this.createCreativeSearchInput();
    }

    createCreativeSearchInput() {
        const field = document.createElement("input");
        field.className = "creative-search-input";
        field.type = "text";
        field.setAttribute("aria-label", "Search creative items");
        field.placeholder = "Search Items";
        field.maxLength = 32;
        field.value = this.creativeSearch;
        field.addEventListener("input", () => {
            this.creativeSearch = field.value;
            this.creativeScrollRow = 0;
            this.createCreativeSlots();
        });
        field.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                runtime.world.player.closeInventory();
            }
        });
        document.body.append(field);
        this.creativeSearchInput = field;
        this.positionCreativeSearchInput();
        field.focus();
    }

    removeCreativeSearchInput() {
        this.creativeSearchInput?.remove();
        this.creativeSearchInput = null;
    }

    positionCreativeSearchInput() {
        if (!this.creativeSearchInput) return;
        const rect = CANVAS.getBoundingClientRect();
        const scaleX = rect.width / CANVAS.width;
        const scaleY = rect.height / CANVAS.height;
        const scale = getVanillaGuiScale();
        this.creativeSearchInput.style.left = `${rect.left +
            (this.inventoryUI.x + 5 * scale) * scaleX}px`;
        this.creativeSearchInput.style.top = `${rect.top +
            (this.inventoryUI.y + 4 * scale) * scaleY}px`;
        this.creativeSearchInput.style.width = `${166 * scale * scaleX}px`;
        this.creativeSearchInput.style.height = `${Math.max(20,
            10 * scale * scaleY)}px`;
        this.creativeSearchInput.style.fontSize = `${Math.max(16,
            10 * scale * scaleX)}px`;
    }

    positionPlayerInventorySlots(creative) {
        const scale = this.getGuiScale();
        const slotStep = 18 * scale;
        for (let y = 0; y < this.items.length; y++) {
            for (let x = 0; x < this.items[y].length; x++) {
                if (y === OFFHAND_ROW) {
                    this.items[y][x].position = {
                        x: (creative ? 34 : 77) * scale,
                        y: (creative ? 19 : 62) * scale,
                    };
                } else if (creative) {
                    this.items[y][x].position = {
                        x: 8 * scale + x * slotStep,
                        y: (y === 3 ? 112 : 54 + y * 18) * scale,
                    };
                } else {
                    this.items[y][x].position = {
                        x: 8 * scale + x * slotStep,
                        y: (y === 3 ? 142 : 84 + y * 18) * scale,
                    };
                }
            }
        }
        this.lastVanillaLayoutScale = scale;
    }

    getVisibleCreativeItems() {
        if (this.creativeTab === "search") {
            return this.creativeItems.filter(({ name }) =>
                creativeMatchesSearch(name, this.creativeSearch),
            );
        }
        const isCombatItem = ({ name }) =>
            /sword|bow|arrow|armor|helmet|chestplate|leggings|boots|shield/i.test(name);
        const isMaterial = ({ name }) =>
            /ingot|diamond|emerald|coal|charcoal|redstone|quartz|lapis|nugget|dye|leather|bone|gunpowder|feather|string|slime|sugar/i.test(name);

        if (this.creativeTab === "tools") {
            return this.creativeItems.filter((item) =>
                item.category === "tools" && !isCombatItem(item),
            );
        }
        if (this.creativeTab === "combat") {
            return this.creativeItems.filter((item) =>
                item.category === "combat" ||
                item.category === "tools" && isCombatItem(item),
            );
        }
        if (this.creativeTab === "food") {
            return this.creativeItems.filter((item) =>
                item.category === "food" && !isMaterial(item),
            );
        }
        if (this.creativeTab === "materials") {
            return this.creativeItems.filter((item) =>
                item.category === "materials" ||
                item.category === "food" && isMaterial(item),
            );
        }
        return this.creativeItems.filter(
            ({ category }) => category === this.creativeTab,
        );
    }

    scrollCreative(rows) {
        if (this.creativeTab === "inventory") return;
        const maxRow = Math.max(
            0,
            Math.ceil(this.getVisibleCreativeItems().length / CREATIVE_ROW_SIZE) -
                CREATIVE_VISIBLE_ROWS,
        );
        const nextRow = Math.max(0, Math.min(maxRow, this.creativeScrollRow + rows));
        if (nextRow === this.creativeScrollRow) return;
        this.creativeScrollRow = nextRow;
        this.createCreativeSlots();
    }

    getCreativeTabBounds(index) {
        const tab = typeof index === "number" ? CREATIVE_TABS[index] : index;
        const rowTabs = CREATIVE_TABS.filter(({ row }) => row === tab.row);
        const column = rowTabs.findIndex(({ id }) => id === tab.id);
        const scale = this.getGuiScale();
        return {
            x: this.inventoryUI.x + column * CREATIVE_TAB_STEP * scale,
            y: tab.row === "bottom"
                ? this.inventoryUI.y + 136 * scale
                : this.inventoryUI.y - 32 * scale,
            width: 26 * scale,
            height: 32 * scale,
        };
    }

    updateCreativeMenu() {
        const { deltaY } = input.getScrollDelta();
        if (deltaY) this.scrollCreative(Math.sign(deltaY));

        for (let i = 0; i < CREATIVE_TABS.length; i++) {
            const bounds = this.getCreativeTabBounds(i);
            if (mouseOverPosition(bounds.x, bounds.y, bounds.width, bounds.height) &&
                input.isLeftMouseButtonPressed()) {
                this.selectCreativeTab(CREATIVE_TABS[i].id);
                return;
            }
        }

        if (this.creativeTab === "inventory") {
            const scale = this.getGuiScale();
            if (mouseOverPosition(this.inventoryUI.x + 173 * scale,
                this.inventoryUI.y + 111 * scale,
                18 * scale, 18 * scale) &&
                input.isLeftMouseButtonPressed()) this.holdingItem = null;
            return;
        }

        const scale = this.getGuiScale();
        const trackX = this.inventoryUI.x + 174 * scale;
        const trackY = this.inventoryUI.y + 18 * scale;
        if (mouseOverPosition(trackX, trackY, 15 * scale,
            90 * scale) && input.isLeftMouseDown()) {
            const maxRow = Math.max(0,
                Math.ceil(this.getVisibleCreativeItems().length / CREATIVE_ROW_SIZE) -
                CREATIVE_VISIBLE_ROWS);
            const mouseY = input.getMousePosition().y;
            const ratio = Math.max(0, Math.min(1,
                (mouseY - trackY) / (90 * scale)));
            const nextRow = Math.round(ratio * maxRow);
            this.scrollCreative(nextRow - this.creativeScrollRow);
            input.isLeftMouseButtonPressed();
        }
    }

    createCreativeSlots() {
        if (this.creativeTab === "inventory") {
            this.creativeSlots = null;
            return;
        }
        const slots = [];
        const visibleItems = this.getVisibleCreativeItems();
        const startIndex = this.creativeScrollRow * CREATIVE_ROW_SIZE;
        const scale = this.getGuiScale();
        const slotStep = 18 * scale;

        for (let y = 0; y < CREATIVE_VISIBLE_ROWS; y++) {
            slots[y] = [];
            for (let x = 0; x < CREATIVE_ROW_SIZE; x++) {
                const entry = visibleItems[startIndex + y * CREATIVE_ROW_SIZE + x];
                slots[y][x] = new InventorySlot({
                    position: { x: 8 * scale + x * slotStep,
                        y: 18 * scale + y * slotStep },
                    item: entry?.item ?? new InventoryItem(),
                    infiniteTake: true,
                });
            }
        }

        this.creativeSlots = slots;
    }

    addButton({
        position,
        size,
        text = "",
        callback,
        image = null,
        hoverImage = null,
        spriteScale = 1,
    }) {
        const button = new Button({
            position,
            size,
            text,
            callback,
            image,
            hoverImage,
            spriteScale,
        });
        this.buttons.push(button);
    }

    clearButtons() {
        this.buttons = [];
    }

    handleButtonInteractions() {
        for (let button of this.buttons) {
            if (
                button.isHovered(this.inventoryUI, this.openUIOffset) &&
                input.isLeftMouseButtonPressed()
            ) {
                button.onClick();
            }
        }
    }

    populateCreativeInventory() {
        // Get all blocks
        const seenWallpapers = new Set();
        for (const [key, id] of Object.entries(Blocks)) {
            const block = getBlock(id);
            if (!block) continue;
            if (!block.excludeFromCreativeInventory) {
                this.creativeItems.push(
                    { item: new InventoryItem({ blockId: id, count: 1 }),
                        name: block.name, category: creativeCategory(key, block, true) },
                );
            }
            if (canUseAsWallpaper(block) && !seenWallpapers.has(id)) {
                seenWallpapers.add(id);
                this.creativeItems.push({
                    item: new InventoryItem({ blockId: id, count: 1, props: { wall: true } }),
                    name: `${block.name} Wallpaper`, category: "building",
                });
            }
        }

        for (const [key, id] of Object.entries(Items)) {
            const item = getItem(id);
            if (!item || item.excludeFromCreativeInventory) continue;
            this.creativeItems.push(
                { item: new InventoryItem({ itemId: id, count: 1 }),
                    name: item.name, category: creativeCategory(key, item, false) },
            );
        }
    }

    openSingleChest(storage) {
        this.storage = storage;

        this.updateStorage = true;

        this.openUIImage = {
            url: "single_chest",
            crop: { x: 0, y: 0, width: 176, height: 166 },
        };
        this.positionPlayerInventorySlots(false);

        this.createChestSlots();
    }

    createChestSlots() {
        let slots = [];

        for (let y = 0; y < this.storage.length; y++) {
            slots[y] = [];
            for (let x = 0; x < this.storage[y].length; x++) {
                let position = { x: 32 + x * 63, y: 70 + y * 63 };

                let slot = new InventorySlot({
                    position: position,
                    item: this.storage[y][x],
                });
                slots[y][x] = slot;
            }
        }

        this.storageSlots = slots;
    }

    createFurnaceSlots() {
        let slots = [];

        for (let y = 0; y < this.storage.length; y++) {
            slots[y] = [];
            for (let x = 0; x < this.storage[y].length; x++) {
                let position = { x: 0, y: 0 };

                // Input
                if (y === 0 && x === 0) position = { x: 200, y: 64 };
                // Fuel
                if (y === 0 && x === 1) position = { x: 200, y: 190 };
                // Output
                if (y === 1 && x === 0) position = { x: 410, y: 126 };

                let slot = new InventorySlot({
                    position: position,
                    item: this.cloneItem(this.storage[y][x]), // Ensure proper cloning
                });
                slots[y][x] = slot;
            }
        }

        // Set output slot to onlyTake
        slots[1][0].onlyTake = true;

        this.storageSlots = slots;
    }

    refreshInventory() {
        if (this.furnace || this.storageSlots ||
            this.openUIImage.url.startsWith("creative_inventory/")) {
            this.craftingSlots = [];
            return;
        }

        if (!this.craftingTable) {
            this.craftingGuideOpen = false;
            this.craftingGuidePage = 0;
            this.craftingGuideSelectedIndex = 0;
        }

        this.craftingOutputSlot.position = this.craftingOutputPosition;
        if (this.craftingTable) {
            this.craftingOutputSlot.position = this.craftingTableOutputPosition;

            this.openUIImage = {
                url: "crafting_table",
                crop: { x: 0, y: 0, width: 176, height: 166 },
            };
            this.positionPlayerInventorySlots(false);
        }

        this.createCraftingArray(this.craftingTable ? 3 : 2);
    }

    reverseSync() {
        if (!this.storageSlots || !this.storage) return;

        for (let i = 0; i < this.storageSlots.length; i++) {
            for (let j = 0; j < this.storageSlots[i].length; j++) {
                this.storage[i][j] = this.cloneItem(
                    this.storageSlots[i][j].item,
                );
            }
        }

        if (!this.interactedBlock) return;

        this.interactedBlock.syncMetaData();
    }

    handleRightClickGetHalf(item, x, y, array) {
        if (
            input.isRightMouseDown() &&
            !this.holdingItem &&
            (item.blockId || item.itemId != null)
        ) {
            this.getHalf(item, x, y, array);

            // Reverse sync if modifying storageSlots
            if (array === this.storageSlots) {
                this.reverseSync();
            }
            return true;
        }
        return false;
    }

    // Logic for picking up or moving items
    handleLeftClickItemInteraction(item, x, y, array) {
        if (!input.isLeftMouseButtonPressed()) return;

        if (input.shiftPressed) {
            if (array) if (this.handleShiftClick(array[y][x], array)) return;
        }

        // Handle crafting output slot
        if (item === this.craftingOutputSlot.item) {
            if (input.shiftPressed) {
                this.handleCraftingOutputShiftClick();
                return;
            }

            const maxStackSize = this.getStackSize(item);
            const isSameType =
                this.holdingItem &&
                this.holdingItem.blockId === item.blockId &&
                this.holdingItem.itemId === item.itemId &&
                this.arePropsEqual(this.holdingItem.props, item.props);

            const combinedCount = isSameType
                ? this.holdingItem.count + this.craftingOutputSlot.item.count
                : this.craftingOutputSlot.item.count;

            if (item.itemId === null && item.blockId === null) return;

            if (
                this.holdingItem &&
                isSameType &&
                combinedCount <= maxStackSize
            ) {
                this.holdingItem.count = combinedCount;
                this.clearItem(item);
                this.craftingComplete();
            } else if (!this.holdingItem) {
                this.holdingItem = this.cloneItem(item);
                console.log(this.holdingItem);
                this.clearItem(item);
                this.craftingComplete();
            }
            return;
        }

        // Handle placing an item from cursor into a slot
        if (this.holdingItem && array) {
            const slot = array[y][x];
            if (slot.onlyTake || slot.infiniteTake) {
                // Add infiniteTake check
                // Delete the item
                this.holdingItem = null;
                return; // Do not allow placing items in onlyTake or infiniteTake slots
            }

            this.movingLogic(item);
            this.reverseSync();
            return;
        }

        // Handle picking up an item from a slot
        if (item.count <= 0 || (!item.blockId && item.itemId === null)) return;

        if (array) {
            const slot = array[y][x];
            if (slot.infiniteTake) {
                // Infinite take: copy item without removing from slot
                this.holdingItem = this.cloneItem(item);
                this.holdingItem.count = this.getStackSize(item);
            } else {
                // Normal take: remove item from slot
                this.holdingItem = this.cloneItem(item);
                this.removeItem(y, x, item.count, array);
            }
            this.reverseSync();
            return;
        }

        // Handle combining items when cursor already holds an item (not array-based)
        if (!this.holdingItem) {
            this.holdingItem = this.cloneItem(item);
        } else if (
            this.holdingItem.blockId === item.blockId &&
            this.holdingItem.itemId === item.itemId
        ) {
            const maxStackSize = this.getStackSize(item);
            const combinedCount = this.holdingItem.count + item.count;

            if (combinedCount <= maxStackSize) {
                this.holdingItem.count = combinedCount;
                this.clearItem(item);
            } else {
                this.holdingItem.count = maxStackSize;
                item.count = combinedCount - maxStackSize;
            }
        }
    }

    getStackSize(item) {
        return item.itemId ? getItem(item.itemId).stackSize : 64;
    }

    handleCraftingOutputShiftClick() {
        if (
            !this.craftingOutputSlot.item ||
            this.craftingOutputSlot.item.count <= 0
        )
            return;

        const outputTemplate = this.cloneItem(this.craftingOutputSlot.item);

        while (this.craftingOutputSlot.item.count > 0) {
            const transferItem = this.cloneItem(outputTemplate);
            const remaining = this.addItemToArray(transferItem, this.items);
            const moved = transferItem.count - remaining;

            if (moved <= 0) {
                // No inventory space for any of this craft output.
                return;
            }

            this.craftingComplete();

            if (remaining > 0) {
                // If only part of the stack fit, keep the remainder in the output slot.
                this.craftingOutputSlot.item.count = remaining;
                return;
            }

            // Full output stack moved, recalculate output for additional crafts.
            this.craftingLogic();
            if (this.craftingOutputSlot.item.count <= 0) return;
        }
    }

    craftingComplete() {
        for (let y = 0; y < this.craftingSlots.length; y++) {
            for (let x = 0; x < this.craftingSlots[y].length; x++) {
                const item = this.craftingSlots[y][x].item;

                if (item.count > 0) {
                    item.count--;
                }

                if (item.count <= 0) this.clearSlot(this.craftingSlots[y][x]);
            }
        }
    }

    removeItem(y, x, count = 1, array = this.items) {
        const item = array[y] && array[y][x].item;
        if (!item) return;

        item.count -= count;
        if (item.count <= 0) this.clearItem(item);
    }

    clearItem(item) {
        item.blockId = null;
        item.itemId = null;
        item.count = 0;
        item.props = {};
    }

    addItem(newItem) {
        let remainingCount = newItem.count;

        remainingCount = this.addToExistingStack(newItem, remainingCount);

        if (remainingCount > 0) {
            remainingCount = this.addToEmptySlot(newItem, remainingCount);
        }

        return remainingCount;
    }

    getAllItems() {
        let items = [];

        for (let y = 0; y < this.items.length; y++) {
            for (let x = 0; x < this.items[y].length; x++) {
                const item = this.items[y][x].item;

                if (item.count > 0) {
                    items.push(this.cloneItem(item));
                }
            }
        }

        return items;
    }

    addToExistingStack(newItem, remainingCount) {
        for (let rowIndex = 0; rowIndex < this.items.length; rowIndex++) {
            if (rowIndex === OFFHAND_ROW) continue;
            const row = this.items[rowIndex];
            for (let slot of row) {
                const item = slot.item;
                if (
                    item.blockId === newItem.blockId &&
                    item.itemId === newItem.itemId &&
                    item.count < this.getStackSize(item) &&
                    this.arePropsEqual(item.props, newItem.props)
                ) {
                    const availableSpace = this.getStackSize(item) - item.count;
                    const toAdd = Math.min(remainingCount, availableSpace);
                    item.count += toAdd;
                    remainingCount -= toAdd;

                    if (remainingCount === 0) return 0;
                }
            }
        }
        return remainingCount;
    }

    addToEmptySlot(newItem, remainingCount) {
        if (remainingCount === 0) return 0;

        // First, try to place the item in row 3
        if (this.items[3]) {
            for (let slot of this.items[3]) {
                const item = slot.item;
                if (item.blockId === null && item.itemId === null) {
                    item.blockId = newItem.blockId;
                    item.itemId = newItem.itemId;
                    item.count = remainingCount;
                    item.props = newItem.props;
                    return 0;
                }
            }
        }

        // If no slot was found in row 3, proceed to check from row 0 onwards
        for (let rowIndex = 0; rowIndex < this.items.length; rowIndex++) {
            if (rowIndex === 3 || rowIndex === OFFHAND_ROW) continue;
            for (let slot of this.items[rowIndex]) {
                const item = slot.item;
                if (item.blockId === null && item.itemId === null) {
                    item.blockId = newItem.blockId;
                    item.itemId = newItem.itemId;
                    item.count = remainingCount;
                    item.props = newItem.props;
                    return 0;
                }
            }
        }

        // If no empty slot is found, return the remaining count
        return remainingCount;
    }

    update() {
        if (this.villagerTrade) {
            this.updateVillagerTrade();
            this.handleHotbarAssignment();
            this.handleButtonInteractions();
            this.syncInventoryMultiplayer();
            return;
        }
        if (this.openUIImage.url.startsWith("creative_inventory/")) {
            this.updateCreativeMenu();
        }
        if (this.showItems) {
            this.mouseHoverOverSlotsLogic();

            if (!input.isRightMouseDown()) this.resetLastHoveredSlot();

            this.craftingLogic();

            if (this.craftingTable) {
                this.handleCraftingGuideInteractions();
            }

            if (this.openUIImage.url === "converter") {
                this.updateConverter();
            }

            if (this.updateStorage) this.syncStorageSlots();

            this.handleHotbarAssignment();
        } else if (this.isEditingSign) {
            this.handleSignTyping();
            this.signCursorBlink = (this.signCursorBlink + 1) % 50;
        }

        this.handleButtonInteractions();
        this.syncInventoryMultiplayer();
    }

    handleHotbarAssignment() {
        // Only proceed if an item is hovered and the inventory UI is open
        if (!this.hoverItem || !runtime.world.player.windowOpen) return;
        if (this.openUIImage.url.startsWith("creative_inventory/") &&
            this.creativeTab === "search") return;

        // Map number keys to hotbar slots
        for (let i = 1; i <= 9; i++) {
            if (input.isActionPressed("hotbar" + i)) {
                const hotbarIndex = i - 1; // Convert to 0-based index (Digit1 -> slot 0, Digit2 -> slot 1, etc.)
                this.assignToHotbarSlot(hotbarIndex);
                break; // Exit loop after handling the first key press
            }
        }
    }

    assignToHotbarSlot(slotIndex) {
        const hotbarSlot = this.items[3][slotIndex]; // Hotbar is row 3
        const hoveredSlot = this.hoverSlot.array
            ? this.hoverSlot.array[this.hoverSlot.y][this.hoverSlot.x]
            : null;

        if (!this.hoverItem) return; // No hovered item, exit early

        // If the hovered item is already in the hotbar slot, do nothing
        if (
            hoveredSlot &&
            hoveredSlot === hotbarSlot &&
            this.hoverSlot.array === this.items
        ) {
            return;
        }

        // Clone the items to avoid reference issues
        const hoveredItem = this.cloneItem(this.hoverItem);
        const hotbarItem = this.cloneItem(hotbarSlot.item);

        // If the hovered item is from the crafting output slot
        if (
            !this.hoverSlot.array &&
            this.hoverItem === this.craftingOutputSlot.item
        ) {
            if (hotbarSlot.isEmpty() && !hoveredItem.isEmpty()) {
                // Place the crafting output directly into the hotbar slot
                hotbarSlot.item = this.cloneItem(hoveredItem);
                this.clearSlot(this.craftingOutputSlot);
                this.craftingComplete();
            }
            return;
        }

        // Handle swapping or placing from another slot (inventory, crafting, storage, etc.)
        if (hoveredSlot) {
            if (hoveredSlot.onlyTake) return; // Don't allow taking from onlyTake slots
            if (hoveredSlot.infiniteTake) {
                // Infinite take: copy item without removing from slot
                hotbarSlot.item = this.cloneItem(hoveredItem);
                return;
            }

            if (hotbarSlot.isEmpty()) {
                // Move hovered item to empty hotbar slot
                hotbarSlot.item = this.cloneItem(hoveredItem);
                hoveredSlot.clear();
            } else {
                // Swap items between hovered slot and hotbar slot
                hotbarSlot.item = this.cloneItem(hoveredItem);
                hoveredSlot.item = this.cloneItem(hotbarItem);
            }

            // Sync storage if modifying storageSlots
            if (
                this.hoverSlot.array === this.storageSlots ||
                this.storageSlots
            ) {
                this.reverseSync();
            }
        }
    }

    resetLastHoveredSlot() {
        this.lastHoveredSlot = { x: null, y: null };
    }

    mouseHoverOverSlotsLogic() {
        this.hoverItem = null;
        this.hoverSlot = { x: null, y: null, array: null };

        this.mouseOverCheck(this.items);
        this.mouseOverCheck(this.craftingSlots);
        this.mouseOverCheck(this.creativeSlots);
        this.mouseOverCheck(this.storageSlots);

        if (
            !this.villagerTrade &&
            !this.openUIImage.url.startsWith("creative_inventory/") &&
            this.isSlotHovered(
                this.craftingOutputSlot.position.x,
                this.craftingOutputSlot.position.y,
            )
        ) {
            this.mouseOverSlot(0, 0, null, this.craftingOutputSlot.item);
        }
    }

    mouseOverCheck(array) {
        if (!array) return;
        for (let y = 0; y < array.length; y++) {
            if (array === this.items && y === OFFHAND_ROW &&
                this.openUIImage.url !== "inventory" &&
                !(this.openUIImage.url.startsWith("creative_inventory/") &&
                    this.creativeTab === "inventory")) continue;
            if (array === this.items &&
                this.openUIImage.url.startsWith("creative_inventory/") &&
                this.creativeTab !== "inventory" && y !== 3) continue;
            for (let x = 0; x < array[y].length; x++) {
                const item = array[y][x];
                if (this.isSlotHovered(item.position.x, item.position.y)) {
                    this.mouseOverSlot(x, y, array);
                    break;
                }
            }
        }
    }

    craftingLogic() {
        this.clearSlot(this.craftingOutputSlot);

        if (this.areAllCraftingSlotsEmpty()) return;

        // Iterate over each recipe to check if it matches the crafting slots
        for (const recipe of recipes) {
            if (this.isRecipeMatch(recipe)) {
                // Crafting match found, output the result
                this.createOutput(recipe.output);
                return;
            }
        }
    }

    isRecipeMatch(recipe) {
        switch (recipe.type) {
            case RecipeType.Shapeless:
                return this.isShapelessMatch(recipe.input);
            case RecipeType.Shaped:
                return this.isShapedMatch(recipe.input);
            case RecipeType.Filled:
                return this.isFilledMatch(recipe.input);
        }
        return false;
    }

    isFilledMatch(inputItem) {
        if (this.craftingSlots.length < 3) return false;
        for (let y = 0; y < 3; y++) {
            for (let x = 0; x < 3; x++) {
                if (!this.isMatch(this.craftingSlots[y][x].item, inputItem)) {
                    return false;
                }
            }
        }

        return true;
    }

    isShapelessMatch(inputItem) {
        const slots = this.craftingSlots.flat();
        const nonEmptySlots = slots.filter((slot) => slot.item.count > 0);

        // If inputItem is an array, handle multiple items in a shapeless recipe
        const recipeItems = Array.isArray(inputItem) ? inputItem : [inputItem];

        // Ensure the number of non-empty slots matches the number of recipe items
        if (nonEmptySlots.length !== recipeItems.length) return false;

        // Check if each recipe item has a matching slot item
        return recipeItems.every((recipeItem) =>
            nonEmptySlots.some((slot) => this.isMatch(slot.item, recipeItem)),
        );
    }

    isMatch(slotItem, patternItem) {
        // Retrieve the category of slotItem using GetBlock if it has a blockId
        const slotCategory = slotItem.blockId
            ? getBlock(slotItem.blockId).category
            : null;

        if (slotItem.count == 0 && patternItem.count == 0) return true;

        return (
            (patternItem.blockId && slotItem.blockId === patternItem.blockId) ||
            (patternItem.itemId !== null &&
                slotItem.itemId === patternItem.itemId) ||
            (patternItem.blockCategory &&
                slotCategory &&
                slotCategory === patternItem.blockCategory)
        );
    }

    isShapedMatch(inputPattern) {
        const rows = this.craftingSlots.length;
        const cols = this.craftingSlots[0].length;

        const patternRows = inputPattern.length;
        const patternCols = inputPattern[0].length;

        for (let startRow = 0; startRow <= rows - patternRows; startRow++) {
            for (let startCol = 0; startCol <= cols - patternCols; startCol++) {
                let isMatch = true;

                // Check if the items in the pattern match the crafting grid from startRow, startCol
                for (let row = 0; row < patternRows; row++) {
                    for (let col = 0; col < patternCols; col++) {
                        const patternItem = inputPattern[row][col];
                        const slot =
                            this.craftingSlots[startRow + row][startCol + col];

                        // If the slot doesn't match the pattern, mark as non-matching
                        if (!this.isMatch(slot.item, patternItem)) {
                            isMatch = false;
                            break;
                        }
                    }
                    if (!isMatch) break;
                }

                // Ensure all other slots outside the pattern area are empty
                if (
                    isMatch &&
                    this.areAllOtherSlotsEmpty(
                        startRow,
                        startCol,
                        patternRows,
                        patternCols,
                    )
                ) {
                    return true;
                }
            }
        }

        return false;
    }

    areAllOtherSlotsEmpty(startRow, startCol, patternRows, patternCols) {
        for (let row = 0; row < this.craftingSlots.length; row++) {
            for (let col = 0; col < this.craftingSlots[row].length; col++) {
                const isInPatternArea =
                    row >= startRow &&
                    row < startRow + patternRows &&
                    col >= startCol &&
                    col < startCol + patternCols;

                const slot = this.craftingSlots[row][col];

                // Check if any slot outside the pattern area contains an item
                if (
                    !isInPatternArea &&
                    (slot.item.blockId || slot.item.itemId != null)
                ) {
                    return false;
                }
            }
        }
        return true;
    }

    isSlotMatch(slot, patternItem) {
        // If both patternItem and slot item are empty, consider it a match
        if (!patternItem && !slot.item) return true;

        // If pattern expects an empty slot (count 0), ensure the slot is empty
        if (patternItem.count === 0) return slot.item.count === 0;

        // If pattern item has a count but slot item is empty, return false
        if (slot.item.count === 0) return false;

        console.log(patternItem);
        console.log(slot.item);

        // Direct match based on blockId, itemId, or blockCategory
        return (
            (patternItem.blockId &&
                slot.item.blockId === patternItem.blockId) ||
            (patternItem.itemId != null &&
                slot.item.itemId === patternItem.itemId) ||
            (patternItem.blockCategory &&
                slot.item.blockCategory ===
                    getBlock(patternItem.blockId).category)
        );
    }

    clearSlot(slot) {
        slot.item.blockId = null;
        slot.item.itemId = null;
        slot.item.count = 0;
        slot.item.props = {};
    }

    createOutput(output) {
        // console.log(`Crafted: ${output.count} of ${output.blockId}`);
        if (this.craftingOutputSlot.item.count > 0) return;

        this.craftingOutputSlot.item.blockId = output.blockId;
        this.craftingOutputSlot.item.itemId = output.itemId;
        this.craftingOutputSlot.item.count = output.count;
    }

    areAllCraftingSlotsEmpty() {
        return this.craftingSlots.flat().every((slot) => slot.isEmpty());
    }

    mouseOverSlot(x, y, array, overWriteItem = null) {
        const item = !overWriteItem ? array[y][x].item : overWriteItem;

        this.hoverItem = item;

        if (overWriteItem) {
            this.handleLeftClickItemInteraction(overWriteItem, 0, 0, null);
            return;
        }

        this.hoverSlot = { x: x, y: y, array: array };

        const slot = array[y][x];
        if (!slot.onlyTake && !slot.infiniteTake) {
            // Add infiniteTake check
            this.handleRightClickSpread(item, x, y, array);
        }

        if (!slot.onlyTake)
            if (this.handleRightClickGetHalf(item, x, y, array)) return;

        this.handleLeftClickItemInteraction(item, x, y, array);
    }

    getHalf(item, x, y, array) {
        const slot = array[y][x];
        this.holdingItem = this.cloneItem(item);
        if (slot.infiniteTake) {
            this.holdingItem.count = 1;
        } else {
            // Normal take: reduce slot count by half
            const half = Math.round(item.count / 2);
            this.holdingItem.count = half;
            this.removeItem(y, x, half, array);
        }
    }

    getSlotFromInventory(item) {
        for (let y = 0; y < this.items.length; y++) {
            for (let x = 0; x < this.items[y].length; x++) {
                const slot = this.items[y][x];
                if (
                    (slot.item.blockId && slot.item.blockId === item.blockId) ||
                    (slot.item.itemId !== null &&
                        slot.item.itemId === item.itemId)
                )
                    return slot;
            }
        }
    }

    rightClickMovingLogic(item) {
        if (
            this.holdingItem &&
            this.holdingItem.count > 0 &&
            item.count < this.getStackSize(item) &&
            ((item.blockId === null && item.itemId == null) ||
                (item.blockId === this.holdingItem.blockId &&
                    item.itemId === this.holdingItem.itemId &&
                    this.arePropsEqual(item.props, this.holdingItem.props)))
        ) {
            item.count += 1;
            this.holdingItem.count -= 1;

            if (item.count === 1) {
                item.blockId = this.holdingItem.blockId;
                item.itemId = this.holdingItem.itemId;
                item.props = structuredClone(this.holdingItem.props || {});
            }

            if (this.holdingItem.count === 0) {
                this.holdingItem = null;
            }
        }
    }

    movingLogic(slotItem) {
        if (
            slotItem.count <= 0 ||
            (!slotItem.blockId && slotItem.itemId == null)
        ) {
            slotItem.count = this.holdingItem.count;
            slotItem.blockId = this.holdingItem.blockId;
            slotItem.itemId = this.holdingItem.itemId;
            slotItem.props = structuredClone(this.holdingItem.props || {});
            this.holdingItem = null;
            return;
        }

        if (
            slotItem.blockId !== this.holdingItem.blockId ||
            slotItem.itemId !== this.holdingItem.itemId ||
            !this.arePropsEqual(slotItem.props, this.holdingItem.props)
        ) {
            let oldItem = this.cloneItem(slotItem);
            slotItem.blockId = this.holdingItem.blockId;
            slotItem.itemId = this.holdingItem.itemId;
            slotItem.count = this.holdingItem.count;
            slotItem.props = structuredClone(this.holdingItem.props || {});
            this.holdingItem = oldItem;
            return;
        }

        if (
            slotItem.blockId === this.holdingItem.blockId &&
            slotItem.itemId === this.holdingItem.itemId &&
            this.arePropsEqual(slotItem.props, this.holdingItem.props)
        ) {
            const maxStackSize = this.getStackSize(slotItem);
            const totalCount = slotItem.count + this.holdingItem.count;

            slotItem.count = Math.min(totalCount, maxStackSize);
            this.holdingItem.count =
                totalCount > maxStackSize ? totalCount - maxStackSize : 0;

            if (this.holdingItem.count === 0) {
                this.holdingItem = null;
            }
        }
    }

    arePropsEqual(a, b) {
        // Treat null/undefined as equal
        if (!a && !b) return true;
        if ((a && !b) || (!a && b)) return false;
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        if (aKeys.length !== bKeys.length) return false;
        for (let key of aKeys) {
            if (a[key] !== b[key]) return false;
        }
        return true;
    }

    draw(ctx) {
        // Black Background
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);

        if (this.isEditingSign) {
            this.drawSign(ctx);
            return;
        }

        if (this.usesVanillaInventoryLayout()) {
            const scale = this.getGuiScale();
            if (scale !== this.lastVanillaLayoutScale) {
                const creative = this.openUIImage.url.startsWith("creative_inventory/");
                this.positionPlayerInventorySlots(creative);
                if (creative) this.createCreativeSlots();
                else this.positionCraftingSlots();
            }
        }

        let path = "inventory";
        let crop = null;

        if (this.openUIImage.url !== "") {
            path = this.openUIImage.url;
            if (this.openUIImage.crop) {
                crop = this.openUIImage.crop;
            }
        }

        const spritePath = "gui/container/" + path;
        const spriteUrl = getSpriteUrl(
            spritePath,
            isEqualToOriginal(spritePath),
        );

        const drawParams = {
            url: spriteUrl,
            x: CANVAS.width / 2 + this.openUIImageOffset.x,
            y: path.startsWith("creative_inventory/")
                ? (CANVAS.height - 200 * this.getGuiScale()) / 2 +
                    32 * this.getGuiScale()
                : path === "inventory"
                    ? (CANVAS.height - 166 * this.getGuiScale()) / 2
                    : CANVAS.height / 6 + this.openUIImageOffset.y,
            scale: this.getGuiScale(),
        };

        if (crop) {
            drawParams.crop = crop;
        }

        this.inventoryUI = drawImage(drawParams);

        if (path.startsWith("creative_inventory/")) {
            this.drawCreativeTabs();
            this.drawCreativeSearchField(ctx);
            this.positionCreativeSearchInput();
            this.drawCreativeScrollbar(ctx);
        }

        if (this.showItems) {
            this.drawItems();
            this.drawVillagerTrades();
            if (this.openUIImage.url === "inventory" ||
                this.creativeTab === "inventory" && path.startsWith("creative_inventory/")) {
                this.drawPlayerSkin(ctx);
            }
            this.drawHoldItem();
            this.drawButtons(ctx);
            this.drawHoverTitle();
        }

        if (
            this.inventoryText &&
            typeof this.inventoryText.draw === "function"
        ) {
            this.inventoryText.draw(this.inventoryUI, this.openUIOffset);
        }
    }

    drawSign(ctx) {
        const drawParams = {
            url: getSpriteUrl("gui/container/sign"),
            x: CANVAS.width / 2 + this.openUIImageOffset.x,
            y: CANVAS.height / 6 + this.openUIImageOffset.y,
            scale: 3.5,
        };

        this.inventoryUI = drawImage(drawParams);

        const signCenterX = this.inventoryUI.x + 154;
        const baseY = this.inventoryUI.y + 48;
        const lineHeight = 40;

        ctx.save();
        ctx.font = "42px pixel";
        ctx.fillStyle = "black";
        ctx.textAlign = "center";

        for (let i = 0; i < 4; i++) {
            let text = this.signText[i] || "";
            let displayText = text;

            if (i === this.signEditingLine) {
                const cursorPos = Math.min(this.signCursor, text.length);
                if (Math.floor(this.signCursorBlink / 25) % 2 === 0) {
                    displayText =
                        text.slice(0, cursorPos) + "|" + text.slice(cursorPos);
                }
            }

            ctx.fillText(displayText, signCenterX, baseY + i * lineHeight);
        }
        ctx.restore();

        this.signCursorBlink = (this.signCursorBlink + 1) % 50;
    }

    drawPlayerSkin(ctx) {
        if (
            !runtime.world.player?.body?.image?.complete ||
            typeof drawSkinPreview !== "function"
        )
            return;

        const scale = this.getGuiScale();
        const creativeInventoryTab = this.openUIImage.url.startsWith(
            "creative_inventory/",
        );
        const previewOffset = creativeInventoryTab
            ? { x: 78 * scale, y: 5 * scale }
            : { x: 36 * scale, y: 12 * scale };
        const previewScale = (creativeInventoryTab ? 1.35 : 2) * scale;
        const baseX = this.inventoryUI.x + previewOffset.x + this.openUIOffset.x;
        const baseY = this.inventoryUI.y + previewOffset.y + this.openUIOffset.y;
        if (creativeInventoryTab) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(
                this.inventoryUI.x + 72 * scale + this.openUIOffset.x,
                this.inventoryUI.y + 5 * scale + this.openUIOffset.y,
                34 * scale,
                45 * scale,
            );
            ctx.clip();
        }
        drawSkinPreview(
            ctx,
            runtime.world.player.body.image,
            baseX,
            baseY,
            previewScale,
            runtime.world.player.skinModel ||
                localStorage.getItem("playerSkinModel") ||
                "steve",
        );
        if (creativeInventoryTab) ctx.restore();
    }

    drawButtons(ctx) {
        for (let button of this.buttons) {
            button.draw(ctx, this.inventoryUI, this.openUIOffset);
        }
    }

    drawCreativeTabs() {
        const scale = this.getGuiScale();
        for (const tab of CREATIVE_TABS) {
            const rowTabs = CREATIVE_TABS.filter(({ row }) => row === tab.row);
            const column = rowTabs.findIndex(({ id }) => id === tab.id);
            const bounds = this.getCreativeTabBounds(tab);
            const selected = this.creativeTab === tab.id;
            const spritePath = `gui/sprites/container/creative_inventory/tab_${tab.row}_${
                selected ? "selected" : "unselected"
            }_${column + 1}`;
            drawImage({
                url: getSpriteUrl(spritePath),
                x: bounds.x,
                y: bounds.y,
                scale,
                centerX: false,
            });
            const icon = new InventorySlot({
                position: { x: bounds.x + 6 * scale, y: bounds.y + 8 * scale },
                item: new InventoryItem({ ...tab.icon, count: 1 }),
            });
            icon.draw(0, 0, null, scale / 3);
            if (mouseOverPosition(bounds.x, bounds.y, bounds.width, bounds.height)) {
                const mouse = input.getMousePosition();
                drawText({ text: tab.label, x: mouse.x + 12, y: mouse.y - 8,
                    size: 20, textAlign: "left" });
            }
        }
    }

    drawCreativeSearchField(ctx) {
        if (this.creativeTab !== "search") return;

        const scale = this.getGuiScale();
        const x = this.inventoryUI.x + 2 * scale;
        const y = this.inventoryUI.y + 3 * scale;
        const width = 172 * scale;
        const height = 12 * scale;

        ctx.fillStyle = "#373737";
        ctx.fillRect(x, y, width, height);
        ctx.fillStyle = "#f0f0f0";
        ctx.fillRect(x + scale, y + scale, width - 2 * scale, height - 2 * scale);
        ctx.fillStyle = "#8b8b8b";
        ctx.fillRect(x + 2 * scale, y + 2 * scale, width - 4 * scale, height - 4 * scale);
    }

    drawCreativeScrollbar(ctx) {
        if (this.creativeTab === "inventory") return;
        const maxRow = Math.max(0,
            Math.ceil(this.getVisibleCreativeItems().length / CREATIVE_ROW_SIZE) -
            CREATIVE_VISIBLE_ROWS);
        const scale = this.getGuiScale();
        const x = this.inventoryUI.x + 175 * scale;
        const y = this.inventoryUI.y + (18 +
            (maxRow ? (this.creativeScrollRow / maxRow) * 75 : 0)) * scale;
        const scroller = maxRow ? "scroller" : "scroller_disabled";
        drawImage({
            url: getSpriteUrl(`gui/sprites/container/creative_inventory/${scroller}`),
            x,
            y,
            scale,
            centerX: false,
        });
    }

    drawItems() {
        this.drawHoverSlot();
        if (this.openUIImage.url === "inventory") {
            this.drawOffhandSlotBackground();
        }
        if (this.openUIImage.url.startsWith("creative_inventory/") &&
            this.creativeTab !== "inventory") {
            this.drawSlots([this.items[3]]);
        } else if (this.villagerTrade) {
            this.drawSlots(this.items.slice(0, OFFHAND_ROW));
        } else {
            this.drawSlots(this.items);
        }

        if (this.craftingTable) {
            this.drawCraftingGuide();
        }
        if (!this.villagerTrade &&
            !this.openUIImage.url.startsWith("creative_inventory/"))
            this.drawCraftingSlots();
        this.drawSlots(this.creativeSlots);
        this.drawSlots(this.storageSlots);
        this.drawFurnaceExtras();
    }

    drawOffhandSlotBackground() {
        const slot = this.items[OFFHAND_ROW]?.[0];
        if (!slot) return;

        const spritePath = "gui/container/inventory";
        // Reuse the existing Minecraft inventory slot texture.
        drawImage({
            url: getSpriteUrl(spritePath, isEqualToOriginal(spritePath)),
            x: this.inventoryUI.x + slot.position.x + this.openUIOffset.x,
            y: this.inventoryUI.y + slot.position.y + this.openUIOffset.y,
            scale: this.getGuiScale(),
            centerX: false,
            crop: { x: 7, y: 83, width: 18, height: 18 },
        });
    }

    getCraftingGuideRecipes() {
        return recipes;
    }

    getCraftingGuideLayout() {
        const buttonScale = 3.5;
        const buttonSize = { x: 20 * buttonScale, y: 18 * buttonScale };
        const buttonPosition = {
            x: this.craftingTablePosition.x - buttonSize.x - 18,
            y: this.craftingTablePosition.y + 55,
        };

        const panelWidth = 168;
        const panelHeight = 234;
        const panelX = Math.max(
            10,
            this.inventoryUI.x +
                this.openUIOffset.x +
                buttonPosition.x -
                panelWidth -
                10,
        );
        const panelY =
            this.inventoryUI.y + this.openUIOffset.y + buttonPosition.y;

        return {
            button: {
                x: this.inventoryUI.x +
                    this.openUIOffset.x +
                    buttonPosition.x,
                y: this.inventoryUI.y +
                    this.openUIOffset.y +
                    buttonPosition.y,
                width: buttonSize.x,
                height: buttonSize.y,
                crop: { x: 0, y: 168, width: 20, height: 18 },
                hoverCrop: { x: 0, y: 187, width: 20, height: 18 },
                scale: buttonScale,
            },
            panel: {
                x: panelX,
                y: panelY,
                width: panelWidth,
                height: panelHeight,
            },
            grid: {
                cols: 4,
                rows: 5,
                cellSize: 36,
                padding: 10,
                iconScale: 0.6,
            },
        };
    }

    getBlockIdForCategory(category) {
        const blocks = Object.values(Blocks);
        for (let i = 0; i < blocks.length; i++) {
            const blockId = blocks[i];
            const block = getBlock(blockId);
            if (block && block.category === category) return blockId;
        }
        return null;
    }

    getRecipePreviewItem(recipeItem) {
        if (!recipeItem || recipeItem.count === 0) return null;
        if (recipeItem.blockId) {
            return new InventoryItem({
                blockId: recipeItem.blockId,
                count: recipeItem.count || 1,
            });
        }
        if (recipeItem.itemId !== null) {
            return new InventoryItem({
                itemId: recipeItem.itemId,
                count: recipeItem.count || 1,
            });
        }
        if (recipeItem.blockCategory) {
            const blockId = this.getBlockIdForCategory(
                recipeItem.blockCategory,
            );
            if (blockId !== null) {
                return new InventoryItem({
                    blockId: blockId,
                    count: recipeItem.count || 1,
                });
            }
        }
        return null;
    }

    getRecipePreviewGrid(recipe) {
        const grid = [
            [null, null, null],
            [null, null, null],
            [null, null, null],
        ];

        if (!recipe) return grid;

        if (recipe.type === RecipeType.Shaped) {
            for (let y = 0; y < recipe.input.length; y++) {
                for (let x = 0; x < recipe.input[y].length; x++) {
                    const previewItem = this.getRecipePreviewItem(
                        recipe.input[y][x],
                    );
                    if (previewItem) grid[y][x] = previewItem;
                }
            }
            return grid;
        }

        if (recipe.type === RecipeType.Filled) {
            const previewItem = this.getRecipePreviewItem(recipe.input);
            for (let y = 0; y < 3; y++) {
                for (let x = 0; x < 3; x++) {
                    grid[y][x] = previewItem;
                }
            }
            return grid;
        }

        const inputs = Array.isArray(recipe.input)
            ? recipe.input
            : [recipe.input];
        let index = 0;
        for (let y = 0; y < 3; y++) {
            for (let x = 0; x < 3; x++) {
                if (index >= inputs.length) return grid;
                const previewItem = this.getRecipePreviewItem(inputs[index]);
                if (previewItem) grid[y][x] = previewItem;
                index++;
            }
        }
        return grid;
    }

    handleCraftingGuideInteractions() {
        const layout = this.getCraftingGuideLayout();

        if (
            mouseOverPosition(
                layout.button.x,
                layout.button.y,
                layout.button.width,
                layout.button.height,
            ) &&
            input.isLeftMouseButtonPressed()
        ) {
            this.craftingGuideOpen = !this.craftingGuideOpen;
            return;
        }

        if (!this.craftingGuideOpen) return;

        const recipesList = this.getCraftingGuideRecipes();
        const perPage = layout.grid.cols * layout.grid.rows;
        const maxPages = Math.max(1, Math.ceil(recipesList.length / perPage));
        const panel = layout.panel;

        const upButton = {
            x: panel.x + panel.width - 28,
            y: panel.y + 8,
            width: 20,
            height: 20,
        };
        const downButton = {
            x: panel.x + panel.width - 28,
            y: panel.y + panel.height - 28,
            width: 20,
            height: 20,
        };

        if (
            mouseOverPosition(
                upButton.x,
                upButton.y,
                upButton.width,
                upButton.height,
            ) &&
            input.isLeftMouseButtonPressed()
        ) {
            this.craftingGuidePage =
                (this.craftingGuidePage - 1 + maxPages) % maxPages;
            return;
        }

        if (
            mouseOverPosition(
                downButton.x,
                downButton.y,
                downButton.width,
                downButton.height,
            ) &&
            input.isLeftMouseButtonPressed()
        ) {
            this.craftingGuidePage =
                (this.craftingGuidePage + 1) % maxPages;
            return;
        }

        const gridStartX = panel.x + layout.grid.padding;
        const gridStartY = panel.y + layout.grid.padding + 18;

        for (let i = 0; i < perPage; i++) {
            const recipeIndex = this.craftingGuidePage * perPage + i;
            if (recipeIndex >= recipesList.length) break;
            const col = i % layout.grid.cols;
            const row = Math.floor(i / layout.grid.cols);
            const cellX = gridStartX + col * layout.grid.cellSize;
            const cellY = gridStartY + row * layout.grid.cellSize;
            if (
                mouseOverPosition(
                    cellX,
                    cellY,
                    layout.grid.cellSize,
                    layout.grid.cellSize,
                ) &&
                input.isLeftMouseButtonPressed()
            ) {
                this.craftingGuideSelectedIndex = recipeIndex;
                return;
            }
        }
    }

    drawCraftingGuide() {
        const layout = this.getCraftingGuideLayout();

        const buttonHovered = mouseOverPosition(
            layout.button.x,
            layout.button.y,
            layout.button.width,
            layout.button.height,
        );

        drawImage({
            url: getSpriteUrl("gui/container/crafting_table"),
            x: layout.button.x,
            y: layout.button.y,
            centerX: false,
            centerY: false,
            scale: layout.button.scale,
            crop: buttonHovered ? layout.button.hoverCrop : layout.button.crop,
        });

        if (!this.craftingGuideOpen) return;

        const panel = layout.panel;

        drawRect({
            x: panel.x,
            y: panel.y,
            width: panel.width,
            height: panel.height,
            color: "rgba(60, 60, 60, 0.9)",
        });
        drawRect({
            x: panel.x,
            y: panel.y,
            width: panel.width,
            height: panel.height,
            color: "rgba(20, 20, 20, 0.9)",
            stroke: true,
            lineWidth: 2,
        });

        const recipesList = this.getCraftingGuideRecipes();
        const perPage = layout.grid.cols * layout.grid.rows;
        const maxPages = Math.max(1, Math.ceil(recipesList.length / perPage));
        this.craftingGuidePage = Math.min(
            this.craftingGuidePage,
            maxPages - 1,
        );

        const pageText = `${this.craftingGuidePage + 1}/${maxPages}`;
        drawText({
            text: pageText,
            x: panel.x + panel.width / 2,
            y: panel.y + 20,
            size: 18,
            textAlign: "center",
        });

        const gridStartX = panel.x + layout.grid.padding;
        const gridStartY = panel.y + layout.grid.padding + 18;
        const iconSize = layout.grid.iconScale;

        for (let i = 0; i < perPage; i++) {
            const recipeIndex = this.craftingGuidePage * perPage + i;
            if (recipeIndex >= recipesList.length) break;
            const col = i % layout.grid.cols;
            const row = Math.floor(i / layout.grid.cols);
            const cellX = gridStartX + col * layout.grid.cellSize;
            const cellY = gridStartY + row * layout.grid.cellSize;

            const isSelected =
                recipeIndex === this.craftingGuideSelectedIndex;

            if (isSelected) {
                drawRect({
                    x: cellX - 2,
                    y: cellY - 2,
                    width: layout.grid.cellSize,
                    height: layout.grid.cellSize,
                    color: "rgba(255, 255, 255, 0.15)",
                });
            }

            const outputItem = this.cloneItem(recipesList[recipeIndex].output);
            const slot = new InventorySlot({
                position: { x: cellX, y: cellY },
                item: outputItem,
            });
            slot.draw(0, 0, null, iconSize);
        }

        const upButton = {
            x: panel.x + panel.width - 28,
            y: panel.y + 8,
            width: 20,
            height: 20,
        };
        const downButton = {
            x: panel.x + panel.width - 28,
            y: panel.y + panel.height - 28,
            width: 20,
            height: 20,
        };

        drawText({
            text: "^",
            x: upButton.x + upButton.width / 2,
            y: upButton.y + 16,
            size: 20,
            textAlign: "center",
        });
        drawText({
            text: "v",
            x: downButton.x + downButton.width / 2,
            y: downButton.y + 16,
            size: 20,
            textAlign: "center",
        });

        const selectedRecipe = recipesList[this.craftingGuideSelectedIndex];
        if (!selectedRecipe) return;

        const previewGrid = this.getRecipePreviewGrid(selectedRecipe);
        const baseX =
            this.inventoryUI.x +
            this.openUIOffset.x +
            this.craftingTablePosition.x;
        const baseY =
            this.inventoryUI.y +
            this.openUIOffset.y +
            this.craftingTablePosition.y;

        ctx.save();
        const ghostAlpha = 0.35;
        const ghostTint = "rgba(150, 150, 150, 0.35)";
        const ghostSize = 48;
        ctx.globalAlpha = ghostAlpha;
        for (let y = 0; y < 3; y++) {
            for (let x = 0; x < 3; x++) {
                const previewItem = previewGrid[y][x];
                if (!previewItem) continue;
                const slot = new InventorySlot({
                    position: {
                        x: baseX + x * 63,
                        y: baseY + y * 63,
                    },
                    item: previewItem,
                });
                slot.draw(0, 0, null, 1);
                drawRect({
                    x: slot.position.x,
                    y: slot.position.y,
                    width: ghostSize,
                    height: ghostSize,
                    color: ghostTint,
                });
            }
        }
        if (this.craftingOutputSlot.item.count <= 0) {
            const outputSlot = new InventorySlot({
                position: {
                    x:
                        this.inventoryUI.x +
                        this.openUIOffset.x +
                        this.craftingTableOutputPosition.x,
                    y:
                        this.inventoryUI.y +
                        this.openUIOffset.y +
                        this.craftingTableOutputPosition.y,
                },
                item: this.cloneItem(selectedRecipe.output),
            });
            outputSlot.draw(0, 0, null, 1);
            drawRect({
                x: outputSlot.position.x,
                y: outputSlot.position.y,
                width: ghostSize,
                height: ghostSize,
                color: ghostTint,
            });
        }
        ctx.restore();
    }

    drawHoverSlot() {
        if (!this.hoverSlot.array) return;

        const slot = this.hoverSlot.array[this.hoverSlot.y][this.hoverSlot.x];

        if (!slot) return;
        if (slot.onlyTake) return;

        const scale = this.usesVanillaInventoryLayout()
            ? this.getGuiScale()
            : LEGACY_GUI_SCALE;
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = "white";
        ctx.fillRect(
            slot.position.x + this.inventoryUI.x - scale + this.openUIOffset.x,
            slot.position.y + this.inventoryUI.y - scale + this.openUIOffset.y,
            18.5 * scale,
            18.5 * scale,
        );
        ctx.globalAlpha = 1;
    }

    drawFurnaceExtras() {
        if (!this.furnace) return;
        const furnaceData = this.interactedBlock.metaData;
        if (!furnaceData) return;
        if (!furnaceData.isActive) return;

        const fuelMax = furnaceData.burningFuelTime;
        const fuelProgress = furnaceData.fuelProgression;

        if (fuelProgress < 0 || fuelProgress > fuelMax) return;

        // Calculate the frame for the flame
        const flameFrame = Math.ceil(14 - (fuelProgress / fuelMax) * 14);

        // Flame
        drawImage({
            url: getSpriteUrl("gui/container/furnace"),
            x: this.inventoryUI.x + 196,
            y: this.inventoryUI.y + 126 + (14 - flameFrame) * 3.5, // Offset y downward
            scale: 3.5,
            centerX: false,
            crop: { x: 176, y: 14 - flameFrame, width: 14, height: flameFrame },
        });

        const arrowProgression = furnaceData.progression;
        if (arrowProgression < 0 || arrowProgression > 10) return;

        const arrowFrame = Math.ceil((arrowProgression / 10) * 25);

        // Arrow
        drawImage({
            url: getSpriteUrl("gui/container/furnace"),
            x: this.inventoryUI.x + 277,
            y: this.inventoryUI.y + 120,
            scale: 3.5,
            centerX: false,
            sizeX: arrowFrame,
            crop: { x: 176, y: 14, width: 24, height: 17 },
        });
    }

    getSlotItem(item) {
        return item.blockId ? getBlock(item.blockId) : getItem(item.itemId);
    }

    drawSlots(array) {
        if (!array) return;
        for (let y = 0; y < array.length; y++) {
            for (let x = 0; x < array[y].length; x++) {
                this.drawSlot(array[y][x]);
            }
        }
    }

    drawHoverTitle() {
        if (!runtime.world.player.windowOpen) return;
        if (!this.hoverItem) return;
        if (!this.hoverItem.blockId && this.hoverItem.itemId == null) return;

        const mousePos = input.getMousePosition();

        const hoverInventoryItem = this.hoverItem;

        let title = hoverInventoryItem.blockId
            ? getBlock(hoverInventoryItem.blockId).name
            : getItem(hoverInventoryItem.itemId).name;

        let text = title;
        // if (Object.keys(hoverInventoryItem.props).length > 0)
        //     text += ` (${JSON.stringify(hoverInventoryItem.props)})`;
        if (hoverInventoryItem.props.wall) text += " Wallpaper";

        drawText({
            text: text,
            x: mousePos.x + 20,
            y: mousePos.y - 5,
            size: 25,
            shadow: true,
            textAlign: "left",
        });
    }

    drawHoldItem() {
        if (!runtime.world.player.windowOpen) return;
        const holdingItem = this.holdingItem;
        if (!holdingItem) return;
        const mousePos = input.getMousePosition();

        const isItem = holdingItem.itemId !== null;

        const path = isItem
            ? "items/" + getItemSpritePath(holdingItem.itemId)
            : "blocks/" + getBlock(holdingItem.blockId).iconSprite;

        const spritePath = getSpriteUrl(path);
        const spriteSize = getSpriteSize(path);
        const actualWidth = spriteSize.width || 16;
        const actualHeight = spriteSize.height || 16;

        let cutoff = 0;
        if (holdingItem.blockId) {
            cutoff = getBlock(holdingItem.blockId).defaultCutoff || 0;
        }

        const drawHeight = actualHeight - cutoff * actualHeight; // Height after cutoff
        const targetHeight = this.usesVanillaInventoryLayout()
            ? 16 * this.getGuiScale()
            : 40;
        const scale = targetHeight / Math.max(actualWidth, actualHeight);

        const cropY = cutoff * actualHeight; // Crop from the top by the cutoff amount

        const image = drawImage({
            url: spritePath,
            x: mousePos.x,
            y: mousePos.y,
            scale: scale,
            centerX: false,
            dark: holdingItem.props.wall === true,
            fixAnimation: cutoff === 0 && actualHeight >= actualWidth,
            crop: {
                x: 0,
                y: cropY, // Start cropping from the top by the cutoff value
                width: actualWidth,
                height: drawHeight, // Draw only the remaining height
            },
        });

        if (holdingItem.count <= 1) return;

        drawText({
            text: holdingItem.count,
            x: image.x + image.sizeX + 5,
            y: mousePos.y + 45,
        });
    }

    drawCraftingSlots() {
        for (let y = 0; y < this.craftingSlots.length; y++) {
            for (let x = 0; x < this.craftingSlots[y].length; x++) {
                this.drawSlot(this.craftingSlots[y][x]);
            }
        }

        // Draw Output
        const outputSlot = this.craftingOutputSlot;
        this.drawSlot(outputSlot);
    }

    drawSlot(slot) {
        slot.draw(
            this.inventoryUI.x + this.openUIOffset.x,
            this.inventoryUI.y + this.openUIOffset.y,
            null,
            this.usesVanillaInventoryLayout() ? this.getGuiScale() / 3 : 1,
        );
    }
}

export class Button {
    constructor({
        position = { x: 0, y: 0 },
        size = { x: 50, y: 20 },
        text = "",
        callback = () => {},
        image = null, // Default image
        hoverImage = null, // Hover image
        spriteScale = 1,
    }) {
        this.position = position;
        this.size = size;
        this.text = text;
        this.callback = callback;
        this.image = image;
        this.hoverImage = hoverImage;
        this.spriteScale = spriteScale;
    }

    isHovered(inventoryUI, openUIOffset) {
        const x = inventoryUI.x + this.position.x + openUIOffset.x;
        const y = inventoryUI.y + this.position.y + openUIOffset.y;
        return mouseOverPosition(x, y, this.size.x, this.size.y);
    }

    onClick() {
        playSound("ui/click.ogg");

        this.callback();
    }

    draw(ctx, inventoryUI, openUIOffset) {
        const x = inventoryUI.x + this.position.x + openUIOffset.x;
        const y = inventoryUI.y + this.position.y + openUIOffset.y;
        const isHovered = this.isHovered(inventoryUI, openUIOffset);

        if (this.image) {
            // Draw image-based button
            const imageToDraw =
                isHovered && this.hoverImage ? this.hoverImage : this.image;

            drawImage({
                url: getSpriteUrl("gui/" + imageToDraw),
                x: x,
                y: y,
                width: this.size.x,
                height: this.size.y,
                centerX: false,
                centerY: false,
                scale: this.spriteScale,
            });

            // Draw hitbox
            // ctx.fillStyle = "rgba(255, 0, 0, .5)";
            // ctx.fillRect(x, y, this.size.x, this.size.y);
        } else {
            // Draw text-based button with background
            ctx.fillStyle = isHovered ? "lightgray" : "gray";
            ctx.fillRect(x, y, this.size.width, this.size.height);

            ctx.strokeStyle = "black";
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, this.size.width, this.size.height);

            if (this.text) {
                drawText({
                    text: this.text,
                    x: x + this.size.width / 2,
                    y: y + this.size.height / 2,
                    size: 20,
                    color: "black",
                    textAlign: "center",
                });
            }
        }
    }
}

export class TextElement {
    constructor({
        text = "",
        position = { x: 0, y: 0 },
        size = 20,
        textAlign = "center",
    }) {
        this.text = text;
        this.position = position;
        this.size = size;
        this.textAlign = textAlign;
    }

    draw(inventoryUI, openUIOffset) {
        const x = inventoryUI.x + this.position.x + openUIOffset.x;
        const y = inventoryUI.y + this.position.y + openUIOffset.y;

        drawText({
            text: this.text,
            x: x,
            y: y,
            size: this.size,
            textAlign: this.textAlign,
        });
    }
}

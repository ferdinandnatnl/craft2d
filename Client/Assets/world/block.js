import { runtime } from "../utils/runtime.js";
import { entityRegistry } from "../entities/entityRegistry.js";
import { inventoryRegistry } from "@2dcraft.com/shared/inventoryRegistry.js";
import { getItem } from "@2dcraft.com/shared/item.js";
import { Items } from "@2dcraft.com/shared/items.js";
import { filledEndFrameStart } from "@2dcraft.com/shared/endProgression.js";
import { Sounds, playMessySound, playPositionalSound, playRandomSoundFromArray, removeAudio, stopMessySound } from "../game/sounds.js";
import { Square, Transform, Vector2, arePropsEqual, randomRange } from "../utils/classes.js";
import { BLOCK_SIZE, CHUNK_HEIGHT, TICK_SPEED, ToolType, multiplayer, updatingBlocks } from "../utils/globals.js";
import { getSpriteAverageColor, getSpriteSize, getSpriteUrl } from "../utils/texturePackLoader.js";
import { blockRegistry } from "@2dcraft.com/shared/blockRegistry.js";
import { doorBlockPairs } from "@2dcraft.com/shared/blocks.js";
import {
    activeDimension,
    getDimension,
    getDimensionChunks,
} from "./dimensionState.js";
import { createParticleEmitter } from "./particleEmitter.js";
import { treesRegistry } from "@2dcraft.com/shared/treesRegistry.js";
import { classicLightTint } from "../rendering/renderLight.js";

function Blocks() {
    return blockRegistry.Blocks;
}
function blockMap() {
    return blockRegistry.blockMap;
}
function InventoryItem(...args) {
    return new inventoryRegistry.InventoryItem(...args);
}

import {
    BlockType,
    SpecialType,
    BlockCategory,
} from "@2dcraft.com/shared/blockType.js";
export { BlockType, SpecialType, BlockCategory };

export function normalizeMetaDataObject(metaData) {
    if (!metaData || typeof metaData !== "object") return null;

    if (metaData.props && typeof metaData.props === "object") {
        const { props, ...rest } = metaData;
        return { ...rest, ...props };
    }

    return metaData;
}

export class Metadata {
    constructor(metaData = null) {
        const normalized = normalizeMetaDataObject(metaData);
        if (normalized) {
            Object.assign(this, structuredClone(normalized));
        }
    }
}

export function checkDissipation(block, worldPos) {
    // For non‑source water blocks, check neighbors (above, left, right)
    // to see if any have a higher water level.
    let neighborHasHigher = false;
    const neighborOffsets = [
        { dx: 0, dy: -BLOCK_SIZE },
        { dx: -BLOCK_SIZE, dy: 0 },
        { dx: BLOCK_SIZE, dy: 0 },
    ];

    neighborOffsets.forEach((offset) => {
        const neighbor = runtime.world.getBlockAtWorldPosition(
            worldPos.x + offset.dx,
            worldPos.y + offset.dy,
        );
        if (
            neighbor &&
            neighbor.blockType === block.blockType &&
            neighbor.metaData.waterLevel < block.metaData.waterLevel
        ) {
            neighborHasHigher = true;
        }
    });
    if (!neighborHasHigher) {
        block.metaData.waterLevel += 0.25;
        block.cutoff = block.metaData.waterLevel;
        if (block.metaData.waterLevel >= 0.85) {
            runtime.world.setBlockType(block, Blocks().Air);
            return true;
        }
    }
    return false;
}

export function flowDownward(block, worldPos) {
    let below = runtime.world.getBlockAtWorldPosition(
        worldPos.x,
        worldPos.y + BLOCK_SIZE,
    );
    if (
        (below && getBlock(below.blockType).air) ||
        (below && getBlock(below.blockType).breakByFluid)
    ) {
        if (getBlock(below.blockType).breakByFluid) {
            below.breakBlock(getBlock(below.blockType).dropWithoutTool);
        }
        below.setBlockType(block.blockType);

        below.metaData.isSource = false;
        below.metaData.waterLevel = 0;
        below.cutoff = below.metaData.waterLevel;
    }
    return below;
}

export function verticalCheckAbove(block, worldPos) {
    let above = runtime.world.getBlockAtWorldPosition(
        worldPos.x,
        worldPos.y - BLOCK_SIZE,
    );
    if (above) {
        if (above.blockType === block.blockType) {
            block.metaData.waterLevel = 0;
            block.cutoff = block.metaData.waterLevel;
        } else if (getBlock(above.blockType).air && block.metaData.isSource) {
            block.metaData.waterLevel = 0; // As per original code.
            block.cutoff = block.metaData.waterLevel + 0.1;
        }
    }
}

export function flowSideways(block, worldPos, direction) {
    let target = runtime.world.getBlockAtWorldPosition(
        worldPos.x + direction.dx,
        worldPos.y + direction.dy,
    );
    // Check if the target is air or can be broken by fluid.
    if (
        target &&
        (getBlock(target.blockType).air ||
            getBlock(target.blockType).breakByFluid)
    ) {
        if (getBlock(target.blockType).breakByFluid) {
            target.breakBlock(getBlock(target.blockType).dropWithoutTool);
        }
        if (
            target.blockType === Blocks().Lava &&
            block.blockType === Blocks().Water
        ) {
            if (target.metaData.isSource) target.setBlockType(Blocks().Obsidian);
            else target.setBlockType(Blocks().Cobblestone);
        }
        target.setBlockType(block.blockType);
        target.metaData.isSource = false;
        // sideLevel is determined below.
        return target;
    } else if (
        target &&
        target.blockType === block.blockType &&
        target.metaData.waterLevel >
            (block.metaData.isSource ? 0.2 : block.metaData.waterLevel + 0.1) &&
        !target.metaData.isSource
    ) {
        return target;
    }
    return null;
}

export class Block extends Square {
    constructor(
        world,
        x = 0,
        y = 0,
        blockType = Blocks().Air,
        chunkX = 0,
        wall = false,
    ) {
        super(
            new Transform(new Vector2(), new Vector2()),
            1,
            getBlock(blockType).sprite
                ? getSpriteUrl("blocks/" + getBlock(blockType).sprite)
                : null,
            BLOCK_SIZE / 16,
            wall,
        );
        this.world = world;
        this.wall = wall;
        this.x = x;
        this.y = y;
        this.chunkX = chunkX;
        this.dimensionIndex = activeDimension;
        this.blockType = blockType;
        this.lightSourceLevel = 0;
        this.redstoneOutput = 0;
        this.powered = false;
        this.linkedBlocks = [];
        this.onAWall = false;

        this.ambientSound = null;

        this.updateSprite();
    }

    power() {
        if (!this.powered) {
            this.powered = true;
        } else {
            return;
        }

        switch (getBlock(this.blockType).specialType) {
            case SpecialType.Door:
                this.setDoorOpen(true);
                break;
            case SpecialType.RedstoneLamp:
                this.lightSourceLevel = 8;
                this.setState(1);
                break;
            case SpecialType.NoteBlock:
                this.playNote();
                break;
            case SpecialType.TNT:
                this.explode();
                break;
        }
    }

    explode(shortFuse = false) {
        const tntEntity = this.world.summonEntity(
            entityRegistry.TNT,
            this.world.getBlockWorldPosition(this),
        );
        if (shortFuse) {
            tntEntity.fuse = 10;
        }
        this.breakBlock(false);
    }

    unpower() {
        if (this.powered) {
            this.powered = false;
        } else {
            return;
        }

        switch (getBlock(this.blockType).specialType) {
            case SpecialType.Door:
                this.setDoorOpen(false);
                break;
            case SpecialType.RedstoneLamp:
                this.lightSourceLevel = 0;
                this.setState(0);
                break;
        }
    }

    setMetaData() {
        const block = getBlock(this.blockType);

        let props = {};
        let storage = [];

        if (block.blockId === Blocks().Farmland) {
            this.metaData = new Metadata({ moisture: 0, moistureDecayTicks: 0 });
            return;
        }

        if ([Blocks().CrocodileEgg, Blocks().CaimanEgg].includes(block.blockId)) {
            this.metaData = new Metadata({
                hatch: 0,
                eggs: 1,
                hatchTicks: 0,
                wasDawn: false,
            });
            return;
        }

        if (block.blockId === Blocks().SeaPickle) {
            this.metaData = new Metadata({ waterlogged: true, pickles: 1 });
            this.updateSeaPickleLightLevel();
            return;
        }

        // Fluid
        if (block.fluid) {
            props.isSource = true;
            props.waterLevel = 0;
            this.metaData = new Metadata(props);
            return;
        }

        // Redstone output
        if (block.baseRedstoneOutput > 0) {
            props.power = block.baseRedstoneOutput;
            this.metaData = new Metadata(props);
        }

        // Mob spawner
        if (block.spawnerType !== null) {
            props.spawnDelay = randomRange(100, 300);
            props.spawnTimer = 0;
            props.spawnLimit = 3;
            props.spawnedMobs = [];
            this.metaData = new Metadata(props);

            return;
        }

        // Initialize crop metadata
        if (block.cropOutcome) {
            props.growth = 0;
            props.stage = 0; // Current growth stage
            this.metaData = new Metadata(props);
            return;
        }

        // Sapling
        if (block.saplingOutcome) {
            props.growth = 0;
            this.metaData = new Metadata(props);
        }

        if (!block.specialType) return;

        const specialType = block.specialType;

        if (specialType === SpecialType.CraftingTable) return;
        if (specialType === SpecialType.RedstoneLamp) return;

        switch (specialType) {
            case SpecialType.Furnace:
                storage = [
                    [
                        InventoryItem(), // input
                        InventoryItem(), // fuel
                    ],
                    [InventoryItem()], // output
                ];
                props.burningFuelTime = 0;
                props.fuelProgression = 0;
                props.progression = 0;
                break;
            case SpecialType.SingleChest:
                for (let y = 0; y < 3; y++) {
                    storage[y] = [];
                    for (let x = 0; x < 9; x++) {
                        storage[y][x] = InventoryItem();
                    }
                }
                break;
            case SpecialType.Jukebox:
                storage = [[InventoryItem()]];
                props.myAudio = null;
                break;
            case SpecialType.Converter:
                storage = [[InventoryItem(), InventoryItem()]];
                break;
            case SpecialType.NoteBlock:
                props.note = 0;
                break;
            case SpecialType.RedstoneDust:
                return;
            case SpecialType.PressurePlate:
                return;
            case SpecialType.Hopper:
                storage = [
                    [
                        InventoryItem(),
                        InventoryItem(),
                        InventoryItem(),
                        InventoryItem(),
                        InventoryItem(),
                    ],
                ];
                break;
            case SpecialType.Sign:
                props.text = ["", "", "", ""];
                break;
        }

        if (storage.length > 0) {
            props.storage = storage;
        }
        this.metaData = new Metadata(props);
    }

    syncMetaData(uploadChunk = true) {
        if (!multiplayer) return;
        if (!this.metaData) return;

        runtime.server.send({
            type: "syncMetaData",
            sender: this.world.player.UUID,
            message: {
                x: this.x,
                y: this.y,
                chunkX: this.chunkX,
                dimensionIndex: this.dimensionIndex,
                blockType: this.blockType,
                metaData: this.metaData,
            },
        });

        if (uploadChunk) {
            this.world.uploadChunkToServer(this.chunkX, this.dimensionIndex);
        }
    }

    recieveSyncMetaData(metaData) {
        const previousOpen = this.metaData?.open;
        this.metaData = new Metadata(metaData);
        if (this.blockType === Blocks().SeaPickle) {
            this.updateSeaPickleLightLevel(true);
        }
        this.updateStateFromMetaData();

        if (this.metaData.storage) {
            const storage = this.metaData.storage.map((row) =>
                row.map((item) => InventoryItem(item)),
            );

            this.metaData.storage = storage;
        }

        if (previousOpen !== this.metaData?.open) this.markChunkDirty();

        if (this.world.player?.inventory.interactedBlock === this) {
            this.world.player.inventory.reloadStorageSlots();
        }
    }

    setBlockMetaData(metaData) {
        const previousOpen = this.metaData?.open;
        this.metaData = new Metadata(metaData);

        if (this.blockType === Blocks().SeaPickle) {
            this.updateSeaPickleLightLevel(true);
        }
        this.updateStateFromMetaData();

        if (this.metaData.storage) {
            // Create a deep copy of the storage array and create new InventoryItem instances with the copied data
            const storage = this.metaData.storage.map((row) =>
                row.map((item) => InventoryItem(item)),
            );

            this.metaData.storage = storage;
        }

        if (previousOpen !== this.metaData?.open) this.markChunkDirty();
    }

    updateSeaPickleLightLevel(markDirty = false) {
        if (this.blockType !== Blocks().SeaPickle) return;

        if (!this.metaData) {
            this.metaData = new Metadata({ waterlogged: true, pickles: 1 });
        }
        if (typeof this.metaData.waterlogged !== "boolean") {
            this.metaData.waterlogged = true;
        }

        const count = Number(this.metaData.pickles);
        this.metaData.pickles = Number.isFinite(count)
            ? Math.max(1, Math.min(4, Math.trunc(count)))
            : 1;

        const previousLight = this.lightSourceLevel;
        this.lightSourceLevel = this.wall || !this.metaData.waterlogged
            ? 0
            : 6 + 3 * (this.metaData.pickles - 1);
        if (markDirty && previousLight !== this.lightSourceLevel) {
            this.markChunkDirty();
        }
    }

    addSeaPickle() {
        if (this.blockType !== Blocks().SeaPickle ||
            this.metaData?.waterlogged !== true) return false;

        const count = Number(this.metaData.pickles) || 1;
        if (count >= 4) return false;

        this.setBlockMetaData({
            ...this.metaData,
            pickles: count + 1,
        });
        this.syncMetaData(false);
        return true;
    }

    updateStateFromMetaData() {
        if (!this.metaData) return;
        if (this.blockType === Blocks().Farmland &&
            Number.isFinite(this.metaData.moisture)) {
            this.setState(this.metaData.moisture > 0 ? 1 : 0);
        }
        const blockDef = getBlock(this.blockType);
        if (blockDef.cropOutcome && Number.isInteger(this.metaData.stage)) {
            this.setState(Math.max(0, Math.min(
                blockDef.states.length - 1,
                this.metaData.stage,
            )));
        }
        if ([Blocks().CrocodileEgg, Blocks().CaimanEgg].includes(this.blockType) &&
            Number.isInteger(this.metaData.hatch)) {
            this.setState(Math.max(0, Math.min(2, this.metaData.hatch)));
        }
    }

    setBlockType(blockType, override = false) {
        if (this.blockType === blockType && !override) return;

        const myChunk = getDimensionChunks(this.dimensionIndex).has(this.chunkX)
            ? getDimensionChunks(this.dimensionIndex).get(this.chunkX)
            : null;

        this.dark = false;

        const existingIndex = updatingBlocks.indexOf(this);
        if (existingIndex !== -1) updatingBlocks.splice(existingIndex, 1);

        this.blockType = blockType;
        const block = getBlock(blockType);

        this.lightSourceLevel = this.wall ? 0 : block.lightLevel;

        this.powered = false;

        if (myChunk) {
            if (!this.wall && block.chunkUpdate) {
                if (!myChunk.update.includes(this)) {
                    myChunk.update.push(this);
                }
            } else {
                const index = myChunk.update.indexOf(this);
                if (index !== -1) {
                    myChunk.update.splice(index, 1);
                }
            }
        }

        this.metaData = undefined;
        if (!this.wall) this.setMetaData();

        if (!this.wall && block.updateSpeed > 0 && !block.chunkUpdate)
            updatingBlocks.push(this);

        this.drawOffset = !this.wall && block.grassOffset ? randomRange(-2, 2) : 0;

        this.cutoff = 0;

        this.frameCount = 0;
        this.filterBrightness = 100;

        if (!this.wall && block.defaultCutoff > 0) {
            this.cutoff = block.defaultCutoff;
        }

        if (!this.wall && block.fluid) {
            this.cutoff = this.metaData.waterLevel;
        }

        if (this.ambientSound) {
            stopMessySound(this.ambientSound);
            this.ambientSound = null;
        }

        if (!this.wall && block.ambientSound) {
            this.ambientSound = playMessySound(
                this.world.getBlockWorldPosition(this),
                block.ambientSound + ".ogg",
                10,
                0.4,
            );
        }

        this.onAWall = false;
        // Wall logic
        if (!this.wall && block.canBePlacedOnWall) {
            const wall = this.getWallBehind();
            if (wall && !getBlock(wall.blockType).air) {
                this.onAWall = true;
            }
        }

        this.redstoneOutput = this.wall ? 0 : block.baseRedstoneOutput;

        this.updateSprite();
        this.markChunkDirty();
    }

    update() {
        if (this.wall) return;
        const blockDef = getBlock(this.blockType);

        if (blockDef.fluid) {
            this.updateSprite();
            this.simulateWaterFlow();
        }

        if (blockDef.blockId === Blocks().Farmland) {
            this.handleFarmlandMoisture();
            return;
        }

        if (blockDef.spawnerType) this.handleSpawner();

        switch (blockDef.specialType) {
            case SpecialType.Hopper:
                this.hopperLogic();
                break;
            case SpecialType.Furnace:
                this.furnaceLogic();
                break;
        }

        if (!this.metaData) return;

        if ([Blocks().CrocodileEgg, Blocks().CaimanEgg].includes(blockDef.blockId)) {
            this.reptileEggLogic();
            return;
        }

        // Handle crop growth
        if (blockDef.cropOutcome) {
            this.handleCropGrowth(blockDef);
            return; // Exit early to avoid other updates interfering
        }

        // Existing sapling logic
        if (this.metaData.growth !== undefined && blockDef.saplingOutcome) {
            this.metaData.growth++;

            if (this.metaData.growth >= 2400) {
                this.saplingGrow();
                return;
            }
        }

        if (
            this.metaData.isActive === undefined ||
            this.metaData.progression === undefined
        )
            return;

        if (!this.metaData.isActive) {
            this.resetProgression();
            return;
        }

        this.metaData.progression += 1 / TICK_SPEED;
    }

    hopperLogic() {
        const props = this.metaData;
        if (!props.storage) return;
        if (this.powered) return;

        const storage = props.storage;

        // Check for item drops above the hopper
        let transferredFromDrop = false;
        const dropEntities = this.getItemDropsAbove(); // Placeholder function

        if (dropEntities && dropEntities.length > 0) {
            for (const drop of dropEntities) {
                const dropItem = drop;
                if (
                    !dropItem ||
                    dropItem.count <= 0 ||
                    (dropItem.itemId === null && !dropItem.blockId)
                ) {
                    continue;
                }

                // Try to add to hopper's storage
                for (let y = 0; y < storage.length; y++) {
                    for (let x = 0; x < storage[y].length; x++) {
                        const hopperItem = storage[y][x];

                        // Empty slot in hopper
                        if (hopperItem.itemId === null && !hopperItem.blockId) {
                            hopperItem.itemId = dropItem.itemId;
                            hopperItem.blockId = dropItem.blockId;
                            hopperItem.props = structuredClone(
                                dropItem.props || {},
                            );
                            hopperItem.count = 1;

                            dropItem.count--;
                            if (dropItem.count <= 0) {
                                this.world.removeEntity(drop);
                            }

                            transferredFromDrop = true;
                            break;
                        }

                        // Stackable slot in hopper
                        if (
                            hopperItem.itemId === dropItem.itemId &&
                            hopperItem.blockId === dropItem.blockId &&
                            arePropsEqual(hopperItem.props, dropItem.props)
                        ) {
                            const stackSize =
                                this.getSlotItem(hopperItem)?.stackSize || 64;
                            if (hopperItem.count < stackSize) {
                                hopperItem.count++;
                                dropItem.count--;

                                if (dropItem.count <= 0) {
                                    this.world.removeEntity(drop);
                                }

                                transferredFromDrop = true;
                                break;
                            }
                        }
                    }
                    if (transferredFromDrop) break;
                }
                if (transferredFromDrop) {
                    // Sync with player's inventory if this hopper's UI is open
                    if (
                        this.world.player.windowOpen &&
                        this.world.player.inventory.interactedBlock === this
                    ) {
                        this.world.player.inventory.syncStorageSlots();
                    }
                    break; // Only process one drop per tick to avoid overloading
                }
            }
        }

        // Check block above for storage (pulling items)
        const above = this.world.getBlockAtWorldPosition(
            this.transform.position.x,
            this.transform.position.y - BLOCK_SIZE,
        );
        let transferredFromAbove = false;

        if (
            above &&
            above.metaData &&
            above.metaData.storage &&
            getBlock(above.blockType).specialType !== SpecialType.Hopper // Skip if above is a hopper
        ) {
            const aboveStorage = above.metaData.storage;

            for (let ay = 0; ay < aboveStorage.length; ay++) {
                for (let ax = 0; ax < aboveStorage[ay].length; ax++) {
                    const aboveItem = aboveStorage[ay][ax];
                    if (
                        !aboveItem ||
                        aboveItem.count <= 0 ||
                        (aboveItem.itemId === null && !aboveItem.blockId)
                    ) {
                        continue;
                    }

                    for (let y = 0; y < storage.length; y++) {
                        for (let x = 0; x < storage[y].length; x++) {
                            const hopperItem = storage[y][x];

                            if (
                                hopperItem.itemId === null &&
                                !hopperItem.blockId
                            ) {
                                hopperItem.itemId = aboveItem.itemId;
                                hopperItem.blockId = aboveItem.blockId;
                                hopperItem.props = structuredClone(
                                    aboveItem.props || {},
                                );
                                hopperItem.count = 1;

                                aboveItem.count--;
                                if (aboveItem.count <= 0) {
                                    aboveItem.itemId = null;
                                    aboveItem.blockId = null;
                                    aboveItem.props = null;
                                }

                                transferredFromAbove = true;
                                break;
                            }

                            if (
                                hopperItem.itemId === aboveItem.itemId &&
                                hopperItem.blockId === aboveItem.blockId &&
                                arePropsEqual(hopperItem.props, aboveItem.props)
                            ) {
                                const stackSize =
                                    this.getSlotItem(hopperItem)?.stackSize ||
                                    64;
                                if (hopperItem.count < stackSize) {
                                    hopperItem.count++;
                                    aboveItem.count--;

                                    if (aboveItem.count <= 0) {
                                        aboveItem.itemId = null;
                                        aboveItem.blockId = null;
                                        aboveItem.props = null;
                                    }

                                    transferredFromAbove = true;
                                    break;
                                }
                            }
                        }
                        if (transferredFromAbove) break;
                    }
                    if (transferredFromAbove) {
                        if (
                            this.world.player.windowOpen &&
                            this.world.player.inventory.interactedBlock === this
                        ) {
                            this.world.player.inventory.syncStorageSlots();
                        }
                        break;
                    }
                }
                if (transferredFromAbove) break;
            }
        }

        // Check block below for storage (pushing items)
        const below = this.world.getBlockAtWorldPosition(
            this.transform.position.x,
            this.transform.position.y + BLOCK_SIZE,
        );

        if (!below || !below.metaData || !below.metaData.storage) {
            return; // No valid container below
        }

        const belowStorage = below.metaData.storage;

        if (
            !props.lastScannedSlot ||
            props.lastScannedSlot.y >= storage.length ||
            props.lastScannedSlot.x >= storage[props.lastScannedSlot.y]?.length
        ) {
            props.lastScannedSlot = { y: 0, x: 0 };
        }

        let transferredBelow = false;
        let scannedAll = true;

        for (let y = 0; y < storage.length; y++) {
            const startX =
                y === props.lastScannedSlot.y ? props.lastScannedSlot.x : 0;
            for (let x = startX; x < storage[y].length; x++) {
                const item = storage[y][x];
                if (
                    !item ||
                    item.count <= 0 ||
                    (item.itemId === null && !item.blockId)
                ) {
                    continue;
                }

                scannedAll = false;

                for (let by = 0; by < belowStorage.length; by++) {
                    for (let bx = 0; bx < belowStorage[by].length; bx++) {
                        const belowItem = belowStorage[by][bx];

                        if (belowItem.itemId === null && !belowItem.blockId) {
                            belowItem.itemId = item.itemId;
                            belowItem.blockId = item.blockId;
                            belowItem.props = structuredClone(item.props || {});
                            belowItem.count = 1;

                            item.count--;
                            if (item.count <= 0) {
                                item.itemId = null;
                                item.blockId = null;
                                item.props = null;
                            }

                            props.lastScannedSlot = {
                                y,
                                x: (x + 1) % storage[y].length,
                            };
                            transferredBelow = true;
                            break;
                        }

                        if (
                            belowItem.itemId === item.itemId &&
                            belowItem.blockId === item.blockId &&
                            arePropsEqual(belowItem.props, item.props)
                        ) {
                            const stackSize =
                                this.getSlotItem(belowItem)?.stackSize || 64;
                            if (belowItem.count < stackSize) {
                                belowItem.count++;
                                item.count--;

                                if (item.count <= 0) {
                                    item.itemId = null;
                                    item.blockId = null;
                                    item.props = null;
                                }

                                props.lastScannedSlot = {
                                    y,
                                    x: (x + 1) % storage[y].length,
                                };
                                transferredBelow = true;
                                break;
                            }
                        }
                    }
                    if (transferredBelow) break;
                }
                if (transferredBelow) {
                    if (
                        this.world.player.windowOpen &&
                        this.world.player.inventory.interactedBlock === this
                    ) {
                        this.world.player.inventory.syncStorageSlots();
                    }
                    break;
                }
            }
            if (transferredBelow) break;
        }

        if (!transferredBelow && scannedAll) {
            props.lastScannedSlot = { y: 0, x: 0 };
        }
    }

    getItemDropsAbove() {
        const entitiesOnBlock = this.checkCollisionWithEntity({
            x: 0,
            y: -BLOCK_SIZE / 2,
        });
        return entitiesOnBlock.filter(
            (entity) => entity.type === entityRegistry.EntityTypes.Drop,
        );
    }

    checkCollisionWithEntity(offset = { x: 0, y: 0 }) {
        const blockPos = this.world.getBlockWorldPosition(this);
        const blockRect = {
            x: blockPos.x + offset.x,
            y: blockPos.y + offset.y,
            width: BLOCK_SIZE,
            height: BLOCK_SIZE,
        };

        const collidingEntities = this.world.entities.filter((entity) => {
            const entityRect = {
                x: entity.position.x,
                y: entity.position.y,
                width: entity.hitbox.x,
                height: entity.hitbox.y,
            };

            return (
                blockRect.x < entityRect.x + entityRect.width &&
                blockRect.x + blockRect.width > entityRect.x &&
                blockRect.y < entityRect.y + entityRect.height &&
                blockRect.y + blockRect.height > entityRect.y
            );
        });

        return collidingEntities;
    }

    handleSpawner() {
        if (multiplayer && !this.world.isWorldAuthority) return;
        if (activeDimension !== this.dimensionIndex) return;

        const props = this.metaData;
        const blockDef = getBlock(this.blockType);

        // Clean up despawned or dead mobs from the tracking array
        props.spawnedMobs = props.spawnedMobs.filter(
            (mob) => mob && this.world.getEntityByUUID(mob)?.health > 0,
        );

        // Check if we can spawn more entities
        if (props.spawnedMobs.length >= props.spawnLimit) return;

        props.spawnTimer++;

        // Check if it's time to spawn
        if (props.spawnTimer >= props.spawnDelay) {
            let spawnCount = props.spawnLimit - props.spawnedMobs.length;

            if (spawnCount <= 0) return;

            for (let i = 0; i < spawnCount; i++)
                this.spawnEntity(blockDef.spawnerType);
            props.spawnTimer = 0;
            props.spawnDelay = randomRange(100, 300);
        }
    }

    spawnEntity(entityTypeName) {
        const spawnPos = this.world.getBlockWorldPosition(this);

        const entityType = entityRegistry.Entities[entityTypeName];

        if (!entityType) return;

        // Respect global gamerule
        if (!runtime.GAMERULES.doMobSpawning) return;

        const entity = this.world.summonEntity(
            entityType,
            new Vector2(spawnPos.x, spawnPos.y),
        );

        if (!entity) return;

        // On peaceful difficulty skip hostile mobs (instance flag)
        if (
            this.world &&
            this.world.difficulty === "peaceful" &&
            entity.isHostile
        ) {
            try {
                // remove the entity that was just spawned and do not track it
                this.world.removeEntity(entity);
            } catch (e) {}
            return;
        }

        this.metaData.spawnedMobs.push(entity.UUID);
    }

    handleCropGrowth(blockDef) {
        // Initialize crop growth properties if not set
        if (this.metaData.growth === undefined) {
            this.metaData.growth = 0;
            this.metaData.stage = 0;
        }

        const farmland = this.world.getBlockAtWorldPosition(
            this.transform.position.x,
            this.transform.position.y + BLOCK_SIZE,
            false,
            this.dimensionIndex,
        );
        const growthRate = farmland?.blockType === Blocks().Farmland &&
            (farmland.metaData?.moisture ?? 0) > 0
            ? 1
            : 0.25;
        if (this.lightLevel > 8) this.metaData.growth += growthRate;

        // Calculate total stages from states array
        const totalStages = blockDef.states.length;
        const ticksPerStage = blockDef.cropSpeed; // Number of ticks per growth stage

        // Calculate current stage based on growth progress
        const currentStage = Math.min(
            Math.floor(this.metaData.growth / ticksPerStage),
            totalStages - 1,
        );

        // Update sprite if stage has changed
        if (this.metaData.stage !== currentStage) {
            this.metaData.stage = currentStage;
            this.setState(currentStage);
        }

    }

    handleFarmlandMoisture() {
        if (!this.metaData) this.metaData = new Metadata({ moisture: 0, moistureDecayTicks: 0 });
        const wasMoist = this.metaData.moisture > 0;
        if (this.isWaterNearby()) {
            this.metaData.moisture = 7;
            this.metaData.moistureDecayTicks = 0;
        } else if (this.metaData.moisture > 0) {
            this.metaData.moistureDecayTicks =
                (this.metaData.moistureDecayTicks || 0) + 1;
            if (this.metaData.moistureDecayTicks >= TICK_SPEED * 30) {
                this.metaData.moisture--;
                this.metaData.moistureDecayTicks = 0;
            }
        }

        const isMoist = this.metaData.moisture > 0;
        if (wasMoist !== isMoist) {
            this.setState(isMoist ? 1 : 0);
            this.syncMetaData(false);
        }
    }

    isWaterNearby() {
        for (let x = -4; x <= 4; x++) {
            for (let y = -1; y <= 0; y++) {
                const nearby = this.world.getBlockAtWorldPosition(
                    this.transform.position.x + x * BLOCK_SIZE,
                    this.transform.position.y + y * BLOCK_SIZE,
                    false,
                    this.dimensionIndex,
                );
                if (nearby?.blockType === Blocks().Water) return true;
            }
        }
        return false;
    }

    applyBoneMeal() {
        const blockDef = getBlock(this.blockType);
        if (blockDef.cropOutcome) {
            const maxStage = blockDef.states.length - 1;
            if ((this.metaData?.stage ?? 0) >= maxStage) return false;
            this.metaData.growth = Math.min(
                maxStage * blockDef.cropSpeed,
                (this.metaData.growth || 0) + randomRange(2, 4) * blockDef.cropSpeed,
            );
            this.handleCropGrowth(blockDef);
            this.syncMetaData();
            return true;
        }

        if (!blockDef.saplingOutcome || !this.metaData) return false;
        this.metaData.growth = (this.metaData.growth || 0) + randomRange(600, 1_200);
        if (this.metaData.growth >= 2_400) this.saplingGrow();
        else this.syncMetaData();
        return true;
    }

    saplingGrow() {
        const outcome = getBlock(this.blockType).saplingOutcome;

        if (!outcome) return;

        // Get tree type using Trees enum
        const treeType = treesRegistry.Trees[outcome];

        if (!treeType) return;

        const randomVariant =
            treeType.variants[randomRange(0, treeType.variants.length)];

        this.world
            .getChunkForX(this.chunkX)
            .spawnTreeAt(randomVariant, this.x, this.getUserLocalY());
    }

    getUserLocalY() {
        const chunk = this.world.getChunkForX(this.chunkX, this.dimensionIndex);
        if (!chunk) return CHUNK_HEIGHT - this.y - 1;
        return chunk.localYToUserY(this.y);
    }

    entityCollision(entity) {
        if (![Blocks().CrocodileEgg, Blocks().CaimanEgg].includes(this.blockType) ||
            !this.canTrampleReptileEgg(entity)) return;

        const ticksPerSecond = Math.max(0, runtime.deltaTime || 0) * 20;
        const chance = entity.fallDistance >= 3
            ? Math.min(1, ticksPerSecond / 3)
            : Math.min(1, ticksPerSecond / 100);
        if (Math.random() < chance) this.crushReptileEgg(entity);
    }

    canTrampleReptileEgg(entity) {
        const typeName = entity?.entityTypeName || entity?.name;
        if (["Crocodile", "Caiman", "Platypus", "Bat"].includes(typeName)) return false;
        if (entity?.type === 1) return true;
        return entity?.type === 3 && runtime.GAMERULES.doMobGriefing;
    }

    crushReptileEgg(trampler) {
        const blockPosition = this.world.getBlockWorldPosition(this);
        this.playBreakSound();
        this.playBreakParticles();
        this.world.setBlockTypeAtPosition(
            blockPosition.x,
            blockPosition.y,
            Blocks().Air,
            false,
            this.dimensionIndex,
            null,
            false,
            false,
        );

        const isCaimanEgg = this.blockType === Blocks().CaimanEgg;
        for (const reptile of this.world.entities) {
            if (
                !(isCaimanEgg ? reptile.isCaiman : reptile.isCrocodile) ||
                reptile.dimension !== this.dimensionIndex ||
                reptile.health <= 0 ||
                reptile.tamed ||
                Vector2.Distance(
                    new Vector2(
                        reptile.position.x + reptile.hitbox.x / 2,
                        reptile.position.y + reptile.hitbox.y / 2,
                    ),
                    blockPosition,
                ) > BLOCK_SIZE * 25
            ) continue;
            reptile.currentTarget = trampler;
            reptile.retaliationTarget = trampler;
            reptile.retaliationUntil = runtime.passedTime + 8;
        }
    }

    reptileEggLogic() {
        const state = this.metaData;
        const ground = this.world.getBlockAtWorldPosition(
            this.transform.position.x,
            this.transform.position.y + BLOCK_SIZE,
            false,
            this.dimensionIndex,
        );
        if (!ground || !isReptileEggGround(ground.blockType)) return;

        const isDawn = runtime.day === true &&
            runtime.time >= 6.5 &&
            runtime.time < 6.75;
        const dawnCrack = isDawn && !state.wasDawn;
        state.wasDawn = isDawn;
        state.hatchTicks = (state.hatchTicks || 0) + 1;
        if (!dawnCrack && Math.random() >= 1 / 120) return;

        if (state.hatch < 2) {
            state.hatch++;
            this.setState(state.hatch);
            this.syncMetaData(false);
            return;
        }

        const count = Math.max(1, state.eggs || 1);
        if (this.blockType === Blocks().CaimanEgg) this.hatchCaimanEggs(count);
        else this.hatchCrocodileEggs(count);
    }

    crocodileEggLogic() {
        this.reptileEggLogic();
    }

    hatchCrocodileEggs(count) {
        this.hatchReptileEggs(count, "Crocodile");
    }

    hatchCaimanEggs(count) {
        this.hatchReptileEggs(count, "Caiman");
    }

    hatchReptileEggs(count, entityName) {
        const spawnType = entityRegistry.Entities?.[entityName];
        if (!spawnType || typeof this.world?.summonEntity !== "function") return;

        const eggPosition = this.world.getBlockWorldPosition(this);
        const players = (this.world.entities || []).filter(entity =>
            entity.type === 1 &&
            entity.dimension === this.dimensionIndex &&
            entity.abilities?.hasHealth,
        );
        const closestPlayer = players
            .map(player => ({
                player,
                distance: Vector2.Distance(
                    new Vector2(
                        player.position.x + player.hitbox.x / 2,
                        player.position.y + player.hitbox.y / 2,
                    ),
                    eggPosition,
                ),
            }))
            .filter(({ distance }) => distance <= BLOCK_SIZE * 20)
            .sort((a, b) => a.distance - b.distance)[0]?.player;

        this.world.setBlockTypeAtPosition(
            eggPosition.x,
            eggPosition.y,
            Blocks().Air,
            false,
            this.dimensionIndex,
            null,
            false,
            false,
        );

        for (let index = 0; index < count; index++) {
            const position = new Vector2(
                eggPosition.x + BLOCK_SIZE * (0.2 + index * 0.2),
                eggPosition.y - spawnType.spawnSize.height * BLOCK_SIZE,
            );
            const hatchling = this.world.summonEntity(
                spawnType,
                position,
                {
                    myChunkX: this.chunkX,
                    tamed: Boolean(closestPlayer),
                    ownerUUID: closestPlayer?.UUID ?? null,
                    sitting: Boolean(closestPlayer),
                    command: closestPlayer ? 2 : 0,
                    babyAgeTicks: 24_000,
                },
            );
            hatchling.dimension = this.dimensionIndex;
            const chunk = this.world.getChunkForX(
                position.x,
                this.dimensionIndex,
            );
            if (chunk && !chunk.entities.includes(hatchling)) {
                chunk.entities.push(hatchling);
            }
        }
    }

    // Callbacks for entities
    endEntityCollision(entity) {
        switch (getBlock(this.blockType).specialType) {
            case SpecialType.PressurePlate:
                this.endPressurePlateLogic();
                break;
        }
    }

    startEntityCollision(entity) {
        switch (getBlock(this.blockType).specialType) {
            case SpecialType.PressurePlate:
                this.pressurePlateLogic();
                break;
        }
    }

    pressurePlateLogic() {
        this.cutoff = 0.95;

        this.redstoneOutput = 16;

        playPositionalSound(
            this.world.getBlockWorldPosition(this),
            Sounds.Wood_Click,
            10,
            0.4,
        );
    }

    endPressurePlateLogic() {
        this.cutoff = getBlock(this.blockType).defaultCutoff;

        this.redstoneOutput = 0;
    }

    setState(index) {
        const sprite = getBlock(this.blockType).states[index];
        if (sprite !== this.spriteName) this.markChunkDirty();
        this.spriteName = sprite;
        this.setSprite(getSpriteUrl("blocks/" + sprite));
    }

    markChunkDirty() {
        const chunk = getDimensionChunks(this.dimensionIndex).get(this.chunkX);
        if (!chunk) return;
        chunk.revision = (chunk.revision || 0) + 1;
    }

    furnaceLogic() {
        if (!this.metaData.storage) return;

        const storage = this.metaData.storage;
        const input = this.getSlotItem(storage[0][0]);
        const fuel = this.getSlotItem(storage[0][1]);
        const output = this.getSlotItem(storage[1][0]);
        const outputItem =
            input && input.smeltOutput
                ? this.getSlotItem(input.smeltOutput)
                : null;

        // Determine if furnace should be visually "on" based on fuel availability
        if (this.metaData.burningFuelTime > 0) {
            this.setState(1);
            this.metaData.isActive = true;
            if (!input) this.resetProgression();
        } else {
            this.setState(0);
            this.metaData.isActive = false;
            this.resetProgression();
        }

        // Only start burning fuel if there's an input item with a smeltable output
        if (!this.metaData.burningFuelTime && input && input.smeltOutput) {
            if (fuel && fuel.fuelTime) {
                this.metaData.burningFuelTime = fuel.fuelTime;
                this.removeOneFromStack(storage[0][1]);
            } else {
                this.metaData.isActive = false;
                return;
            }
        }

        // If burning fuel time is active, increment fuel progression
        if (this.metaData.burningFuelTime > 0) {
            this.metaData.fuelProgression += runtime.deltaTime;
        }

        // Reset burning fuel time if it has been used up
        if (this.metaData.fuelProgression >= this.metaData.burningFuelTime) {
            this.metaData.fuelProgression = 0;
            this.metaData.burningFuelTime = 0;

            if (fuel && input && fuel.fuelTime && input.smeltOutput) {
                this.metaData.burningFuelTime = fuel.fuelTime;
                this.removeOneFromStack(storage[0][1]);
            }
        }

        // Only progress smelting if input and output conditions are met
        if (
            !(
                input &&
                input.smeltOutput &&
                (!output ||
                    (((output.blockId !== undefined &&
                        output.blockId === outputItem.blockId) ||
                        output.itemId === outputItem.itemId) &&
                        storage[1][0].count + 1 <=
                            (outputItem.stackSize || 64)))
            )
        ) {
            this.resetProgression();
        }

        // Complete smelting process if progression threshold is met
        if (this.metaData.progression >= 10) {
            this.removeOneFromStack(storage[0][0]);

            storage[1][0].itemId = outputItem
                ? outputItem.itemId
                    ? outputItem.itemId
                    : null
                : null;
            storage[1][0].blockId = outputItem
                ? outputItem.blockId
                    ? outputItem.blockId
                    : null
                : null;
            storage[1][0].count++;

            this.resetProgression();
        }
    }

    clicked(player) {
        switch (getBlock(this.blockType).specialType) {
            case SpecialType.NoteBlock:
                this.playNote();
                break;
        }
    }

    playNote() {
        const sound = `notes/${this.getSoundBasedOfBlockBelow()}.ogg`;

        const pitch = Math.pow(2, this.metaData.note / 12);

        playPositionalSound(
            this.world.getBlockWorldPosition(this),
            sound,
            13,
            1,
            pitch,
        );
    }

    getSoundBasedOfBlockBelow() {
        const blockBelow = this.world.getBlockAtWorldPosition(
            this.transform.position.x,
            this.transform.position.y + BLOCK_SIZE,
        );

        if (!blockBelow) return "harp";

        if (getBlock(blockBelow.blockType).noteBlockSound) {
            return getBlock(blockBelow.blockType).noteBlockSound;
        }

        return "harp";
    }

    interact(player) {
        const itemInHand = player.getSelectedSlotItem();

        const block = getBlock(this.blockType);

        if (
            this.blockType === Blocks().Pumpkin &&
            itemInHand?.itemId === Items.Shears
        ) {
            this.world.setBlockType(this, Blocks().CarvedPumpkin);
            this.world.serverPlaceBlock(
                this.chunkX,
                this.x,
                this.y,
                Blocks().CarvedPumpkin,
                false,
                activeDimension,
            );
            player.reduceDurability();
            player.playerSwing();

            if (runtime.GAMERULES.doTileDrops) {
                this.world.spawnDrop(
                    new Vector2(
                        this.transform.position.x + BLOCK_SIZE / 2,
                        this.transform.position.y,
                    ),
                    { itemId: Items.PumpkinSeeds, count: 4 },
                );
            }

            player.tryCreateGolem(this);
            return;
        }

        switch (block.specialType) {
            case SpecialType.Jukebox:
                this.jukeBoxInteraction(getItem(itemInHand.itemId), player);
                break;
            case SpecialType.NoteBlock:
                this.noteBlockInteraction();
                break;
            case SpecialType.Lever:
                this.leverInteraction();
                break;
            case SpecialType.Sign:
                player.openSign(this);
                break;
            case SpecialType.EndPortalFrame:
                this.insertEnderEye(player);
                break;
            case SpecialType.Door: {
                const door = getDoorPair(this.blockType);
                if (door?.wooden) this.setDoorOpen(!this.metaData?.open);
                break;
            }
        }
    }

    setDoorOpen(open) {
        const door = getDoorPair(this.blockType);
        if (!door) return false;

        const isUpper = this.blockType === door.upper;
        const lower = isUpper
            ? this.world.getBlockAtWorldPosition(
                  this.transform.position.x,
                  this.transform.position.y + BLOCK_SIZE,
                  false,
                  this.dimensionIndex,
              )
            : this;
        const upper = isUpper
            ? this
            : this.world.getBlockAtWorldPosition(
                  this.transform.position.x,
                  this.transform.position.y - BLOCK_SIZE,
                  false,
                  this.dimensionIndex,
              );
        if (lower?.blockType !== door.lower || upper?.blockType !== door.upper) {
            return false;
        }

        const nextState = Boolean(open);
        if (
            Boolean(lower.metaData?.open) === nextState &&
            Boolean(upper.metaData?.open) === nextState
        ) {
            return false;
        }

        const metadata = {
            ...(normalizeMetaDataObject(lower.metaData) || {}),
            open: nextState,
        };
        lower.setBlockMetaData(metadata);
        upper.setBlockMetaData(metadata);

        if (door.wooden) {
            playPositionalSound(
                this.world.getBlockWorldPosition(this),
                Sounds.Wood_Click,
                10,
                nextState ? 0.8 : 0.65,
            );
        }

        lower.syncMetaData(false);
        upper.syncMetaData(false);
        if (multiplayer) {
            this.world.uploadChunkToServer(lower.chunkX, lower.dimensionIndex);
        }
        return true;
    }

    insertEnderEye(player) {
        if (activeDimension !== 0 || this.blockType !== Blocks().EndPortalFrame ||
            player.getSelectedSlotItem()?.itemId !== Items.EyeOfEnder) return;

        const worldX = this.transform.position.x;
        const worldY = this.transform.position.y;
        this.world.setBlockType(this, Blocks().EndPortalFrameFilled);
        this.world.serverPlaceBlock(this.chunkX, this.x, this.y,
            Blocks().EndPortalFrameFilled, false, activeDimension);
        if (!player.abilities.instaBuild) player.removeFromCurrentSlot();

        // Any run of three filled frames activates its center as the portal.
        const frameX = filledEndFrameStart(worldX, worldY, BLOCK_SIZE,
            (x, y) => this.world.getBlockAtWorldPosition(x, y)
                ?.blockType === Blocks().EndPortalFrameFilled);
        if (frameX !== null) {
            const portalX = frameX + BLOCK_SIZE;
            const portalY = worldY - BLOCK_SIZE;
            const above = this.world.getBlockAtWorldPosition(portalX, portalY);
            if (above?.blockType !== Blocks().Air) return;
            this.world.setBlockTypeAtPosition(portalX, portalY, Blocks().EndPortal,
                false, activeDimension, null, false);
            const portal = this.world.getBlockAtWorldPosition(portalX, portalY);
            if (portal) this.world.serverPlaceBlock(portal.chunkX, portal.x,
                portal.y, Blocks().EndPortal, false, activeDimension);
            playPositionalSound(new Vector2(portalX, portalY), "portal/trigger.ogg");
        }
    }

    leverInteraction() {
        if (this.redstoneOutput === 0) {
            this.redstoneOutput = 15;
            this.setState(1);
        } else {
            this.redstoneOutput = 0;
            this.setState(0);
        }

        playPositionalSound(
            this.world.getBlockWorldPosition(this),
            Sounds.Wood_Click,
            10,
            0.4,
        );
    }

    redstoneDustUpdateState() {
        // Only run if this block is redstone dust.
        const def = getBlock(this.blockType);
        if (def.specialType !== SpecialType.RedstoneDust) return;

        let connection = 1;

        // Use the block's global position.
        const pos = this.transform.position;
        const bx = pos.x;
        const by = pos.y;

        const north = this.world.getBlockAtWorldPosition(bx, by - BLOCK_SIZE);

        // For diagonal connections, we want to only consider them if the adjacent cardinal blocks are not blocking.
        const northWest = this.world.getBlockAtWorldPosition(
            bx - BLOCK_SIZE,
            by - BLOCK_SIZE,
        );
        const northEast = this.world.getBlockAtWorldPosition(
            bx + BLOCK_SIZE,
            by - BLOCK_SIZE,
        );

        // Helper function that returns true if a block is redstone dust.
        const isRedstoneDust = (block) => {
            return (
                block &&
                getBlock(block.blockType).specialType ===
                    SpecialType.RedstoneDust
            );
        };

        if (
            isRedstoneDust(northEast) &&
            (north ? getBlock(north.blockType).air : true)
        ) {
            connection = 3;
        }
        if (
            isRedstoneDust(northWest) &&
            (north ? getBlock(north.blockType).air : true)
        )
            connection = 2;
        if (
            isRedstoneDust(northEast) &&
            isRedstoneDust(northWest) &&
            (north ? getBlock(north.blockType).air : true)
        )
            connection = 4;

        // 0 power = 0% brightness, 15 power = 100% brightness.
        this.filterBrightness = (this.redstoneOutput * 100) / 15;

        this.lightSourceLevel = this.redstoneOutput / 5;

        this.setState(connection);
    }

    noteBlockInteraction() {
        this.metaData.note++;
        if (this.metaData.note > 24) this.metaData.note = 0;

        runtime.game.chat.message("Playing note: " + this.metaData.note);

        this.playNote();
    }

    jukeBoxInteraction(item, player) {
        if (!item || this.metaData.storage[0][0].itemId !== null) {
            // Remove disc from jukebox'
            if (this.metaData.storage[0][0].itemId !== null) {
                this.world.spawnDrop(runtime.world.getBlockWorldPosition(this), {
                    itemId: this.metaData.storage[0][0].itemId,
                    blockId: null,
                    count: 1,
                });

                removeAudio(this.metaData.myAudio);

                this.metaData.storage[0][0] = InventoryItem();
            }

            this.syncMetaData();

            return;
        }

        if (item.playMusicInJukebox) {
            this.metaData.storage[0][0].itemId = item.itemId;
            this.metaData.storage[0][0].blockId = null;
            this.metaData.storage[0][0].count = 1;

            this.metaData.myAudio = playPositionalSound(
                this.world.getBlockWorldPosition(this),
                "../music/" + item.playMusicInJukebox,
                20,
                1,
            );

            player.removeFromCurrentSlot();
        }

        this.syncMetaData();
    }

    checkLavaWaterInteraction(pos) {
        // Check for lava-water interaction.
        // Check for blocks surrounding this block
        const left = this.world.getBlockAtWorldPosition(
            pos.x - BLOCK_SIZE,
            pos.y,
        );
        const right = this.world.getBlockAtWorldPosition(
            pos.x + BLOCK_SIZE,
            pos.y,
        );
        const above = this.world.getBlockAtWorldPosition(
            pos.x,
            pos.y - BLOCK_SIZE,
        );
        const below = this.world.getBlockAtWorldPosition(
            pos.x,
            pos.y + BLOCK_SIZE,
        );

        let lavaBlocksNear = [];

        // If there isnt lava in any of these blocks, return
        for (let block of [left, right, above, below]) {
            if (block && block.blockType === Blocks().Lava) {
                lavaBlocksNear.push(block);
            }
        }

        if (lavaBlocksNear.length === 0) return;

        // Loop thru all lava blocks
        for (let lavaBlock of lavaBlocksNear) {
            if (lavaBlock.metaData.isSource) {
                lavaBlock.setBlockType(Blocks().Obsidian);
                return;
            }

            lavaBlock.setBlockType(Blocks().Cobblestone);
        }

        playPositionalSound(
            this.world.getBlockWorldPosition(this),
            Sounds.Fizz,
            10,
            0.5,
        );
    }

    simulateWaterFlow() {
        if (this.dimensionIndex !== activeDimension) return;

        if (getDimension(activeDimension).fastLava) {
            blockMap().get(Blocks().Lava).updateSpeed = 0.15;
        } else {
            blockMap().get(Blocks().Lava).updateSpeed = 0.05;
        }

        // Only process if this block is fluid.
        if (!getBlock(this.blockType).fluid) return;

        // Initialize water properties if undefined.
        if (
            this.metaData.waterLevel === undefined ||
            this.metaData.isSource === undefined
        ) {
            this.metaData.waterLevel = 0;
            this.metaData.isSource = true;
            this.cutoff = this.metaData.waterLevel;
        } else {
            this.cutoff = this.metaData.waterLevel;
        }

        const worldPos = this.world.getBlockWorldPosition(this);

        if (this.blockType === Blocks().Water)
            this.checkLavaWaterInteraction(worldPos);

        // Dissipation (only for non-source blocks).
        if (!this.metaData.isSource) {
            if (checkDissipation(this, worldPos)) return;
        }

        // Downward Flow.
        const below = flowDownward(this, worldPos);

        // Vertical Check Above.
        verticalCheckAbove(this, worldPos);

        // Sideways Flow.
        if (this.metaData.waterLevel > 0.85) return;
        const sideLevel = this.metaData.isSource
            ? 0.2
            : this.metaData.waterLevel + 0.1;
        // Left Flow.
        if (
            this.metaData.isSource ||
            (below && below.blockType !== this.blockType)
        ) {
            let left = flowSideways(this, worldPos, { dx: -BLOCK_SIZE, dy: 0 });
            if (left) {
                if (
                    left.blockType === this.blockType &&
                    left.metaData.waterLevel > sideLevel &&
                    !left.metaData.isSource
                ) {
                    left.metaData.waterLevel = sideLevel;
                    left.cutoff = sideLevel;
                } else {
                    left.metaData.isSource = false;
                    left.metaData.waterLevel = sideLevel;
                    left.cutoff = sideLevel;
                }
            }
        }
        // Right Flow.
        if (
            this.metaData.isSource ||
            (below && below.blockType !== this.blockType)
        ) {
            let right = flowSideways(this, worldPos, { dx: BLOCK_SIZE, dy: 0 });
            if (right) {
                if (
                    right.blockType === this.blockType &&
                    right.metaData.waterLevel > sideLevel &&
                    !right.metaData.isSource
                ) {
                    right.metaData.waterLevel = sideLevel;
                    right.cutoff = sideLevel;
                } else {
                    right.metaData.isSource = false;
                    right.metaData.waterLevel = sideLevel;
                    right.cutoff = sideLevel;
                }
            }
        }
    }

    removeOneFromStack(item) {
        item.count--;

        if (item.count <= 0) {
            item.itemId = null;
            item.blockId = null;
        }
    }

    getSlotItem(item) {
        return item.blockId ? getBlock(item.blockId) : getItem(item.itemId);
    }

    resetProgression() {
        this.metaData.progression = 0;
    }

    blockUpdate() {
        if (this.wall) return;
        const blockDef = getBlock(this.blockType);

        // Check for blocks that should break if they don't have a solid block underneath
        if (blockDef.breakWithoutBlockUnderneath || blockDef.fall) {
            const blockBelow = this.world.getBlockAtWorldPosition(
                this.transform.position.x,
                this.transform.position.y + BLOCK_SIZE,
            );

            // No block below
            if (!blockBelow || getBlock(blockBelow.blockType).air) {
                if (blockDef.canBePlacedOnWall && this.onAWall) {
                    // If there is a wall behind this block, don't break it
                    const wall = this.getWallBehind();

                    if (!getBlock(wall.blockType).air) return;
                }

                if (blockDef.fall) {
                    this.gravityBlock();
                } else {
                    this.breakBlock(blockDef.dropWithoutTool, true);
                }
            }
        }
    }

    getWallBehind() {
        const blockBehind = this.world.getBlockAtWorldPosition(
            this.transform.position.x,
            this.transform.position.y,
            true,
        );

        return blockBehind;
    }

    getBlockFront() {
        const blockFront = this.world.getBlockAtWorldPosition(
            this.transform.position.x,
            this.transform.position.y,
            false,
        );

        return blockFront;
    }

    breakBlock(
        drop = false,
        wall = false,
        skipDrops = false,
        skipLink = false,
    ) {
        if (getBlock(this.blockType).air) return;

        const chunk = getDimensionChunks(this.dimensionIndex).get(this.chunkX);

        if (!chunk) return;

        const blockDef = getBlock(this.blockType);

        if (wall) {
            let blockFront = this.getBlockFront();

            if (blockFront?.onAWall) {
                blockFront.breakBlock(
                    getBlock(blockFront.blockType).dropWithoutTool,
                    false,
                    false,
                    false,
                );
            }
        }

        // Handle crop loot when fully grown
        if (!skipDrops) {
            if (!wall && blockDef.cropOutcome) {
                if (this.metaData?.stage === blockDef.states.length - 1)
                    this.dropCropLoot(blockDef);
                else this.dropBlock();
            } else if (drop) {
                this.dropBlock();
            }
        }

        if (this.linkedBlocks && this.linkedBlocks.length > 1 && !skipLink) {
            for (let block of this.linkedBlocks) {
                const blockAtPos = this.world.getBlockAtWorldPosition(
                    block.x,
                    block.y,
                    wall,
                    this.dimensionIndex,
                );

                if (blockAtPos && blockAtPos !== this) {
                    if (blockAtPos.blockType === block.blockType)
                        blockAtPos.breakBlock(drop, wall, true, true);
                }
            }
        }

        if (!wall && !skipDrops && blockDef.dropTable) this.dropTable();

        this.playBreakSound();

        this.playBreakParticles();

        if (this.metaData) {
            if (!skipDrops && this.metaData.storage) {
                this.dropStorage();
            }

            if (this.metaData.myAudio) {
                removeAudio(this.metaData.myAudio);
            }
        }

        if (!wall && blockDef.changeToBlockWhenBroken) {
            this.world.setBlockType(this, blockDef.changeToBlockWhenBroken);
        } else {
            this.world.setBlockType(this, Blocks().Air);
        }
    }

    playBreakParticles() {
        const blockDef = getBlock(this.blockType);

        this.world.fallingLeavesEmitter?.spawnFromBlock(this);

        if (!blockDef.iconSprite) return;

        const averageColor = getSpriteAverageColor(
            "blocks/" + blockDef.iconSprite,
        );

        if (!averageColor) return;

        const particleEmitter = createParticleEmitter({
            x: this.transform.position.x + BLOCK_SIZE / 2,
            y: this.transform.position.y + BLOCK_SIZE / 2,
            maxParticles: 20,
            fadeOutTime: 300,
            gravity: 300,
            radius: 1,
            randomScale: true,
            range: BLOCK_SIZE / 2,
            speed: 40,
            lighting: true,
            color: averageColor,
        });

        particleEmitter.emitAndDie();
    }

    dropCropLoot(blockDef) {
        const loot = blockDef.cropOutcome.getRandomLoot();

        loot.forEach((item) => {
            this.world.spawnDrop(
                new Vector2(
                    this.transform.position.x + randomRange(0, BLOCK_SIZE / 3),
                    this.transform.position.y + BLOCK_SIZE / 4,
                ),
                {
                    blockId: item.blockId,
                    itemId: item.itemId,
                    count: item.count,
                },
                this.dimensionIndex,
            );
        });
    }

    gravityBlock() {
        let fallEntity = entityRegistry.Entities.Sand;

        this.world.summonEntity(
            fallEntity,
            this.world.getBlockWorldPosition(this),
            {
                blockType: this.blockType,
            },
        );

        this.world.setBlockType(this, Blocks().Air);
    }

    playBreakSound() {
        const soundArray = getBlock(this.blockType).breakSound;

        if (!soundArray) return;

        playRandomSoundFromArray({
            array: soundArray,
            positional: true,
            origin: this.world.getBlockWorldPosition(this),
        });
    }

    dropTable() {
        const block = getBlock(this.blockType);

        const loot = block.dropTable.getRandomLoot();

        loot.forEach((item) => {
            this.world.spawnDrop(
                new Vector2(
                    this.transform.position.x + randomRange(0, BLOCK_SIZE / 3),
                    this.transform.position.y + BLOCK_SIZE / 4,
                ),
                {
                    blockId: item.blockId,
                    itemId: item.itemId,
                    count: item.count,
                },
                this.dimensionIndex,
            );
        });
    }

    dropBlock() {
        if (!runtime.GAMERULES.doTileDrops) return;

        const block = getBlock(this.blockType);

        if (!block.dropItem && !block.dropBlock) return;

        let props = {};
        if (this.wall) {
            props.wall = true;
        }

        this.world.spawnDrop(
            new Vector2(
                this.transform.position.x + randomRange(0, BLOCK_SIZE / 3),
                this.transform.position.y + BLOCK_SIZE / 4,
            ),
            {
                blockId: block.dropItem == null ? block.dropBlock : null,
                itemId: block.dropItem != null ? block.dropItem : null,
                props: props,
            },
            this.dimensionIndex,
        );
    }

    dropStorage() {
        const storage = this.metaData.storage;

        for (let y = 0; y < storage.length; y++) {
            for (let x = 0; x < storage[y].length; x++) {
                const item = storage[y][x];
                if (!item.blockId && item.itemId === null) continue;
                this.world.spawnDrop(
                    new Vector2(
                        this.transform.position.x +
                            randomRange(0, BLOCK_SIZE / 3),
                        this.transform.position.y + BLOCK_SIZE / 4,
                    ),
                    {
                        blockId: item.blockId,
                        itemId: item.itemId,
                        count: item.count,
                        props: structuredClone(item.props || {}),
                    },
                    this.dimensionIndex,
                );
            }
        }
    }

    getBrightness() {
        if (runtime.game?.settings?.lighting === false) return 1;
        const exposureBlock = this.wall
            ? this.world?.getBlockAtWorldPosition(
                this.transform.position.x, this.transform.position.y, false)
            : this;
        const skyExposure = exposureBlock?.skyExposure ??
            (exposureBlock?.sunLight ? 1 : 0);
        return classicLightTint(this.lightLevel, skyExposure, runtime.time);
    }

    draw(ctx, camera) {
        if (
            !this.wall &&
            getBlock(this.blockType).specialType === SpecialType.Door &&
            this.metaData?.open &&
            this.img?.complete
        ) {
            const width = Math.max(2, Math.round(BLOCK_SIZE * 0.12));
            const blockX = this.transform.position.x;
            const x = Math.round(
                (this.metaData.hinge === "left" ? blockX : blockX + BLOCK_SIZE - width) -
                    camera.x,
            );
            const y = Math.round(this.transform.position.y - camera.y);
            ctx.save();
            ctx.globalAlpha = this.alpha;
            if (this.filterBrightness < 100) {
                ctx.filter = `brightness(${this.filterBrightness}%)`;
            }
            ctx.drawImage(this.img, x, y, width, BLOCK_SIZE);
            ctx.filter = "none";
            if (this.dark) {
                ctx.globalAlpha = 0.5;
                ctx.fillStyle = "black";
                ctx.fillRect(x, y, width, BLOCK_SIZE);
            }
            if (this.lightLevel < 15) {
                ctx.globalAlpha = 1 - this.getBrightness();
                ctx.fillStyle = "black";
                ctx.fillRect(x, y, width, BLOCK_SIZE);
            }
            ctx.restore();
        } else {
            super.draw(ctx, camera);
        }

        this.drawSignText(ctx, camera);
    }

    drawSignText(ctx, camera) {
        if (this.wall) return;
        if (getBlock(this.blockType).specialType !== SpecialType.Sign) return;
        if (!this.metaData || !this.metaData.text) return;

        const textLines = Array.isArray(this.metaData.text)
            ? this.metaData.text
            : [this.metaData.text];

        const worldPos = this.world.getBlockWorldPosition(this);

        // Center of the block
        const centerX = worldPos.x + BLOCK_SIZE / 2 - camera.x;
        const startY = worldPos.y + 8 - camera.y;
        const lineHeight = 8;

        ctx.save();
        ctx.font = "9px pixel"; // match your UI font/size
        ctx.fillStyle = "black"; // dark text color (classic sign look)
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        for (let i = 0; i < Math.min(4, textLines.length); i++) {
            const line = textLines[i] || "";
            if (line === "") continue;

            ctx.fillText(line, centerX, startY + i * lineHeight);
        }

        ctx.restore();
    }

    updateSprite() {
        const block = getBlock(this.blockType);

        if (block.air) {
            this.alpha = 0;
            this.img = null;
            return;
        }

        this.alpha = 1;

        this.frameRate = block.animationSpeed;

        let blockSprite = block.sprite;

        if (this.onAWall) {
            blockSprite = block.wallSprite ? block.wallSprite : block.sprite;
        }

        const sprite = getSpriteUrl("blocks/" + blockSprite);
        this.spriteName = blockSprite;

        this.spriteSize = getSpriteSize("blocks/" + blockSprite).width;

        this.spriteScale = BLOCK_SIZE / this.spriteSize;

        this.setSprite(sprite);
    }
}

export function getBlock(blockId) {
    return blockMap().has(blockId) ? blockMap().get(blockId) : 0;
}

function isReptileEggGround(blockType) {
    const blocks = Blocks();
    return [
        blocks.Dirt,
        blocks.GrassBlock,
        blocks.Podzol,
        blocks.Sand,
        blocks.SandStone,
        blocks.Gravel,
        blocks.Stone,
    ].includes(blockType);
}

export function getDoorPair(blockType) {
    return (
        doorBlockPairs.find(
            (door) => door.lower === blockType || door.upper === blockType,
        ) || null
    );
}

export function hasBlockCollision(block) {
    if (!block) return false;
    const def = getBlock(block.blockType);
    if (!def?.collision) return false;
    return !(def.specialType === SpecialType.Door && block.metaData?.open);
}

runtime.getBlock = getBlock;

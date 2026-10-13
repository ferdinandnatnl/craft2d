import { runtime } from "../utils/runtime.js";
import { Entities } from "./entities.js";
import { Body, BodyPart } from "../game/body.js";
import { Colors } from "../game/chat.js";
import { showDeathScreen } from "../game/deathScreen.js";
import { Entity, EntityTypes } from "../game/entity.js";
import { FishingBobber } from "./fishingBobber.js";
import { Inventory } from "../game/inventory.js";
import { InventoryItem } from "../game/inventoryItem.js";
import { getItem } from "@2dcraft.com/shared/item.js";
import { Items } from "@2dcraft.com/shared/items.js";
import { isLegacySkin } from "../game/skinPreview.js";
import { Sounds, playPositionalSound, playRandomSoundFromArray, playSound } from "../game/sounds.js";
import { Vector2, calculateDirection, lerp, randomRange, uuidv4 } from "../utils/classes.js";
import { BLOCK_SIZE, CHUNK_HEIGHT, INTERACT_DISTANCE, ToolType, multiplayer } from "../utils/globals.js";
import { input } from "../utils/input.js";
import { camera, drawText, isColliding, mouseOverPosition } from "../utils/renderer.js";
import { SpecialType, getBlock, hasBlockCollision } from "../world/block.js";
import { Blocks } from "@2dcraft.com/shared/blocks.js";
import { activeDimension, getDimensionChunks, gotoDimension } from "../world/dimension.js";
import { nearestEndShrineX } from "@2dcraft.com/shared/endProgression.js";
import { createParticleEmitter } from "../world/particleEmitter.js";
import { countMobsNearPlayer, MAX_MOBS_NEAR_PLAYER } from "../world/mobLimits.js";
import { handleMasterStaffAttack, handleMasterStaffInput, toggleMinionMenu } from "./minions/commands.js";

export class Player extends Entity {
    constructor(
        world,
        {
            name = "Player",
            UUID = uuidv4(),
            position = new Vector2(),
            health = 20,
            abilities = {
                flying: false,
                instaBuild: false,
                mayBuild: true,
                mayFly: false,
                walkSpeed: 6,
                jumpForce: 8.5,
                hasHealth: true,
            },
            gamemode = 0,
            foodExhaustionLevel = 0,
            foodLevel = 20,
            foodSaturationLevel = 5,
            foodTickTimer = 0,
            score = 0,
            xpLevel = 0,

            eating = false,
            eatTimer = 0,
            eatTime = 1,

            inventory = new Inventory(),
            entities,
        },
    ) {
        super(world, {
            UUID: UUID,
            name: name,
            position: position,
            hitbox: new Vector2(0.4 * BLOCK_SIZE, 1.8 * BLOCK_SIZE),
            type: EntityTypes.Player,
            body: createPlayerBody(),
            fallDamage: true,
            despawn: false,
        });

        this.skinModel =
            localStorage.getItem("playerSkinModel") === "alex"
                ? "alex"
                : "steve";

        this.footstepEmitter = createParticleEmitter({
            x: this.position.x,
            y: this.position.y + this.hitbox.y,
            radius: 0.5,
            maxParticles: 100,
            speed: 1,
            direction: 180,
            gravity: 200,
            initialVelocity: new Vector2(0, -40),
            fadeOutTime: 500,
            color: Colors.Green,
            randomScale: true,
            scale: 10,
            lighting: true,
        });

        this.health = health;
        this.maxHealth = health;
        this.abilities = abilities;

        this.foodExhaustionLevel = foodExhaustionLevel;
        this.foodLevel = foodLevel;
        this.maxFoodLevel = foodLevel;
        this.foodSaturationLevel = foodSaturationLevel;
        this.foodTickTimer = foodTickTimer;

        this.score = score;
        this.xpLevel = xpLevel;
        this.minionProgress = { evilDeeds: 0, unlocked: false };
        this.minionMenuOpen = false;

        this.gamemode = gamemode;

        this.eating = eating;
        this.eatTimer = eatTimer;
        this.eatTime = eatTime;

        this.inventory = inventory;

        this.windowOpen = false;

        this.wasSwimming = false;
        this.fishingBobber = null;
        this.boat = null;
        this.boatUUID = null;
        this.boatPhysics = null;

        this.canMove = true;
        this.isDead = false;
        this.deathCause = "";
        this.spawnPoint = null;

        this.breakingStage = 0;
        this.breakingTime = 0;
        this.lastBreakSoundTime = 0;

        this.breakingTarget = null;
        this.breakingTargetBlockType = null;
        this.breakingTargetIsWall = false;
        this.shieldBlocking = false;
        this.hoverBlock = null;
        this.oldHoverBlock = null;

        this.climbing = false;

        this.hoverWall = null;

        this.entities = entities;

        this.portalSound = playSound("portal/travel.ogg", 0, 1, true);

        this.pressedSpace = false;

        this.clampFoodStats();

        // this.setGamemode(1);
    }

    clampFoodStats() {
        this.foodLevel = Math.max(
            0,
            Math.min(this.foodLevel, this.maxFoodLevel),
        );
        this.foodSaturationLevel = Math.max(
            0,
            Math.min(this.foodSaturationLevel, this.foodLevel),
        );
        this.foodExhaustionLevel = Math.max(0, this.foodExhaustionLevel);
        this.foodTickTimer = Math.max(0, this.foodTickTimer);
    }

    resetFoodStats() {
        this.foodLevel = this.maxFoodLevel;
        this.foodSaturationLevel = 5;
        this.foodExhaustionLevel = 0;
        this.foodTickTimer = 0;
        this.clampFoodStats();
    }

    addFoodExhaustion(amount = 0) {
        if (!this.abilities.hasHealth) return;
        if (amount <= 0) return;

        // No exhaustion on peaceful
        if (this.world && this.world.difficulty === "peaceful") return;

        this.foodExhaustionLevel += amount;
    }

    processFoodExhaustion() {
        // No hunger changes on peaceful
        if (this.world && this.world.difficulty === "peaceful") return;

        while (this.foodExhaustionLevel >= 4) {
            this.foodExhaustionLevel -= 4;

            if (this.foodSaturationLevel > 0) {
                this.foodSaturationLevel = Math.max(
                    0,
                    this.foodSaturationLevel - 1,
                );
                continue;
            }

            if (this.foodLevel > 0) {
                this.foodLevel -= 1;
            }
        }

        this.clampFoodStats();
    }

    addFood(foodValue, saturationValue = 0) {
        this.foodLevel = Math.min(
            this.maxFoodLevel,
            this.foodLevel + foodValue,
        );
        this.foodSaturationLevel = Math.min(
            this.foodLevel,
            this.foodSaturationLevel + saturationValue,
        );
        this.foodTickTimer = 0;
        this.clampFoodStats();
    }

    canEatFood(item = getItem(this.holdItem?.itemId)) {
        if (!this.abilities.hasHealth) return false;
        if (!item) return false;

        return item.foodValue > 0 && this.foodLevel < this.maxFoodLevel;
    }

    trackMovementExhaustion() {
        if (!this.abilities.hasHealth) return;
        if (this.abilities.flying) return;

        const isMovingHorizontally =
            (input.isActionDown("moveLeft") ||
                input.isActionDown("moveRight")) &&
            this.velocity.x !== 0;
        const isPressingUp =
            (input.isActionDown("jump") || input.isActionDown("moveUp")) &&
            this.velocity.y !== 0;

        if (this.swimming && (isMovingHorizontally || isPressingUp)) {
            this.addFoodExhaustion(0.02);
            return;
        }

        if (this.grounded && isMovingHorizontally) {
            this.addFoodExhaustion(input.isActionDown("sprint") ? 0.02 : 0.08);
        }
    }

    updateFoodTick() {
        if (!this.abilities.hasHealth) return;

        this.trackMovementExhaustion();
        this.processFoodExhaustion();

        const canQuickRegen =
            this.foodLevel === this.maxFoodLevel &&
            this.foodSaturationLevel > 0 &&
            this.health < this.maxHealth;
        const canRegen = this.foodLevel > 17 && this.health < this.maxHealth;
        const starving = this.foodLevel === 0;

        if (canQuickRegen) {
            this.foodTickTimer += 1;

            if (this.foodTickTimer >= 10) {
                const healAmount = Math.ceil(
                    Math.min(2, this.foodSaturationLevel / 3),
                );
                this.addHealth(healAmount);
                this.addFoodExhaustion(Math.ceil(6 * (healAmount / 2)));
                this.foodTickTimer = 0;
            }

            return;
        }

        if (canRegen || starving) {
            this.foodTickTimer += 1;

            if (this.foodTickTimer >= 80) {
                this.foodTickTimer = 0;

                if (canRegen) {
                    this.addHealth(1);
                    this.addFoodExhaustion(6);
                } else {
                    this.forceDamage(1);
                    playRandomSoundFromArray({
                        array: Sounds.Player_Hurt,
                        positional: true,
                        origin: this.position,
                    });
                }
            }

            return;
        }

        this.foodTickTimer = 0;
    }

    update() {
        if (!this.isLocal()) return;

        if (this.isDead) {
            this.shieldBlocking = false;
            return;
        }

        this.shieldBlocking = this.isShieldRaised();

        if (!this.windowOpen && input.isActionPressed("minionMenu")) {
            toggleMinionMenu(this);
        }
        if (this.minionMenuOpen) {
            this.updateEntity();
            this.collisionLogic();
            this.hurtCooldownLogic();
            return;
        }

        this.interactLogic();
        this.climbingCollisingLogic();
        this.movementLogic();
        this.hoverBlockLogic();
        if (!handleMasterStaffAttack(this)) this.breakingAndPlacingLogic();
        this.updateEntity();
        this.updateSwimmingAnimation();
        this.flyingToggleLogic();
        this.collisionLogic();
        this.toggleLogic();
        this.dropLogic();
        this.setHoldItem();
        this.hurtCooldownLogic();
        this.processEating();

        this.portalSoundLogic();

        this.mutliplayerSyncPlayerState();

        this.applyLimbTextures();

        if (this.windowOpen) this.inventory.update();
    }

    drawOverride() {
        this.drawNameTag();
    }

    drawNameTag() {
        if (!multiplayer) return;

        const nameTagOffset = 0.3 * BLOCK_SIZE;
        const nameTagPosition = new Vector2(
            this.position.x + this.hitbox.x / 2 - camera.x,
            this.position.y - nameTagOffset - camera.y,
        );

        drawText({
            text: this.name,
            x: nameTagPosition.x,
            y: nameTagPosition.y,
            color: "white",
            size: 18,
            textAlign: "center",
            background: true,
            shadow: false,
        });
    }

    portalSoundLogic() {
        if (this.portalCooldown >= this.maxPortalCooldown) {
            this.portalSound.currentTime = 0;
            this.portalSound.volume = 0;
            return;
        }

        this.portalSound.volume = lerp(
            this.portalSound.volume,
            0.5,
            runtime.deltaTime / 3,
        );
    }

    setSkin(skin, model = "steve") {
        this.skinModel = model === "alex" ? "alex" : "steve";
        this.body.setSprite(skin);
        this.applyLimbTextures();
    }

    isFacingLeft() {
        return this.direction < 0;
    }

    isLegacySkin() {
        const image = this.body?.image;
        if (!image) return false;
        if (typeof isLegacySkin === "function") {
            return isLegacySkin(image);
        }
        const width = image.naturalWidth || image.width || 0;
        const height = image.naturalHeight || image.height || 0;
        return height > 0 && width >= height * 2;
    }

    applyLimbTextures() {
        if (!this.body?.parts) return;
        const facingLeft = this.isFacingLeft();
        const crops = getPlayerLimbCrops(
            this.skinModel,
            facingLeft,
            this.isLegacySkin(),
        );
        for (const partName of ["leftArm", "rightArm", "leftLeg", "rightLeg"]) {
            if (this.body.parts[partName] && crops[partName]) {
                this.body.parts[partName].spriteCrop = crops[partName];
            }
        }

        // Head uses the real left/right side faces instead of mirroring one side
        if (this.body.parts.head) {
            this.body.parts.head.spriteCrop = facingLeft
                ? { x: 16, y: 8, width: 8, height: 8 }
                : { x: 0, y: 8, width: 8, height: 8 };
        }
    }

    applyArmModel() {
        this.applyLimbTextures();
    }

    multiplayerReceivePlayerState(data) {
        const movementX = data.position.x - this.position.x;
        if (movementX !== 0) this.direction = Math.sign(movementX);
        this.position = data.position;

        this.holdItem = new InventoryItem(data.holdItem);
        this.shieldBlocking = data.shieldBlocking === true;

        if (this.body && data.bodyParts) {
            Object.values(this.body.parts).forEach((part) => {
                const syncPart = data.bodyParts.find((p) => p.id === part.id);

                if (!syncPart) return;

                part.rotation = syncPart.rotation;
                part.direction = syncPart.direction;
            });

            this.lookDirection = data.lookDirection;
            if (Number.isFinite(data.swimAmount)) {
                this.body.swimAmount = Math.max(0, Math.min(1, data.swimAmount));
            }
            if (Number.isFinite(data.swimPhase)) {
                this.body.swimPhase = data.swimPhase % (Math.PI * 2);
            }
            if (Number.isFinite(data.boatAmount)) {
                this.body.boatAmount = Math.max(0, Math.min(1, data.boatAmount));
            }
            if (Number.isFinite(data.boatPhase)) {
                this.body.boatPhase = data.boatPhase % (Math.PI * 2);
            }
            this.applyLimbTextures();
        }

        if (Object.hasOwn(data, "boatUUID")) {
            this.boatUUID = data.boatUUID;
            if (this.boat && this.boat.UUID !== this.boatUUID) {
                if (this.boat.passenger === this) this.boat.passenger = null;
                this.boat = null;
            }
            const boat = this.world?.entities?.find((entity) =>
                entity.UUID === this.boatUUID && entity.isBoat,
            );
            let syncedBoat = boat;
            if (
                !syncedBoat &&
                typeof this.boatUUID === "string" &&
                Number.isFinite(data.boatPosition?.x) &&
                Number.isFinite(data.boatPosition?.y)
            ) {
                syncedBoat = runtime.world.summonEntity(
                    Entities.Boat,
                    new Vector2(data.boatPosition.x, data.boatPosition.y),
                    {
                        surfaceY: data.boatSurfaceY,
                        dimension: this.dimension,
                    },
                    false,
                    this.boatUUID,
                );
                syncedBoat.dimension = this.dimension;
            }
            if (syncedBoat) {
                this.boat = syncedBoat;
                syncedBoat.passenger = this;
            }
        }
    }

    mutliplayerSyncPlayerState() {
        if (!multiplayer) return;
        if (!this.isLocal()) return;

        let data = {
            position: this.position,
            holdItem: this.holdItem,
            shieldBlocking: this.shieldBlocking,

            bodyParts: [],

            health: this.health,
            food: this.foodLevel,
            gamemode: this.gamemode,
            xpLevel: this.xpLevel,
            minionProgress: this.minionProgress,
        };

        if (this.body) {
            Object.values(this.body.parts).forEach((part) => {
                data.bodyParts.push({
                    id: part.id,
                    rotation: part.rotation,
                    direction: part.direction,
                });
            });
            data.lookDirection = this.lookDirection;
            data.swimAmount = this.body.swimAmount;
            data.swimPhase = this.body.swimPhase;
            data.boatAmount = this.body.boatAmount;
            data.boatPhase = this.body.boatPhase;
        }
        data.boatUUID = this.boat?.UUID ?? null;
        if (this.boat) {
            data.boatPosition = this.boat.position;
            data.boatSurfaceY = this.boat.surfaceY;
        }

        runtime.server.send({
            type: "playerUpdate",
            sender: this.UUID,
            message: data,
        });
    }

    isLocal() {
        return this.world?.player === this;
    }

    setGamemode(mode = this.gamemode) {
        this.gamemode = mode;

        switch (mode) {
            case 0:
                this.abilities.mayFly = false;
                this.abilities.flying = false;
                this.abilities.instaBuild = false;
                this.abilities.mayBuild = true;
                this.noCollision = false;
                this.opacity = 1;

                this.abilities.hasHealth = true;
                this.health = 20;
                return;

            // Creative
            case 1:
                this.abilities.mayFly = true;
                this.abilities.instaBuild = true;
                this.abilities.mayBuild = true;
                this.noCollision = false;
                this.opacity = 1;

                this.abilities.hasHealth = false;
                this.health = 20;
                return;

            // Adventure
            case 2:
                this.abilities.mayFly = false;
                this.abilities.flying = false;
                this.abilities.instaBuild = false;
                this.abilities.mayBuild = false;
                this.noCollision = false;
                this.opacity = 1;

                this.abilities.hasHealth = true;
                this.health = 20;
                return;

            case 3:
                this.abilities.mayFly = false;
                this.abilities.flying = true;
                this.abilities.mayBuild = false;
                this.noCollision = true;
                this.opacity = 0.5;

                this.abilities.hasHealth = false;
                this.health = 20;
                return;
        }
    }

    hit(damage, hitfromX = 0, kb = 0, cause = null, attacker = null) {
        console.log(cause);
        if (!damage) return;
        if (!this.health) return;
        if (!this.abilities.hasHealth) return;
        if (this.hurtCooldown) return;
        if (this.canBlockDamage(hitfromX, attacker, cause)) {
            this.hurtCooldown = 0.3;
            this.shieldBlocking = true;
            this.holdItem = this.getSelectedSlotItem();
            this.reduceDurability();
            this.inventory.syncInventoryMultiplayer();
            return;
        }
        if (cause) this.deathCause = cause;
        if (!this.damage(damage, attacker)) return;
        if (this.invulnerable) return;
        this.knockBack(hitfromX, kb);

        console.log(
            `Player hit for ${damage} damage. Health is now ${this.health}. Cause: ${this.deathCause}`,
        );

        playRandomSoundFromArray({
            array: Sounds.Player_Hurt,
            positional: true,
            origin: this.position,
        });
    }

    isShieldRaised() {
        if (
            this.windowOpen ||
            this.isDead ||
            runtime.game?.pauseMenu?.getActive?.() ||
            !input.isActionDown("place")
        ) return false;

        const selectedItem = this.inventory?.items?.[3]?.[
            this.inventory.currentSlot
        ]?.item;
        return selectedItem?.itemId === Items.Shield && selectedItem.count > 0;
    }

    canBlockDamage(hitfromX, attacker, cause) {
        if (!this.isShieldRaised() || attacker === this) return false;
        if (
            cause === "Drowned" ||
            cause === "Burned to death" ||
            cause === "Fell out of the world" ||
            cause === "Fell from a high place"
        ) return false;

        const sourceX = Number.isFinite(attacker?.position?.x)
            ? attacker.position.x + (attacker.hitbox?.x ?? 0) / 2
            : Number.isFinite(hitfromX) && hitfromX !== 0
              ? hitfromX
              : null;
        if (!Number.isFinite(sourceX)) return false;

        const playerCenterX = this.position.x + this.hitbox.x / 2;
        const incomingDirection = Math.sign(sourceX - playerCenterX);
        const shieldDirection = this.lookDirection > -90 && this.lookDirection < 90
            ? 1
            : -1;
        return incomingDirection !== 0 && incomingDirection === shieldDirection;
    }

    respawn() {
        this.velocity = new Vector2();
        this.shouldAddForce = new Vector2();
        this.resetFoodStats();
        this.canMove = true;
        this.isDead = false;
        this.deathCause = "";
        const respawnPosition = this.spawnPoint
            ? this.spawnPoint
            : new Vector2(0, (CHUNK_HEIGHT / 2) * BLOCK_SIZE);
        if (this.isLocal()) gotoDimension(0);
        this.teleport(respawnPosition);
        this.setOnGround();
        this.setGamemode();
    }

    useItemInHand() {
        if (!this.holdItem.itemId) return;

        const item = getItem(this.holdItem.itemId);

        if (!item) return;

        if (item.spawnEntity) {
            this.spawnEntityFromEgg(item.spawnEntity);
            return;
        }

        if (item.toolType === ToolType.FishingRod) {
            this.useFishingRod();
            return;
        }

        if (item.itemId === Items.Boat) {
            this.placeBoat();
            return;
        }

        if ([
            Items.SmallCatfishBucket,
            Items.MediumCatfishBucket,
            Items.LargeCatfishBucket,
        ].includes(item.itemId)) {
            this.useCatfishBucket();
            return;
        }

        if (item.itemId === Items.EyeOfEnder) {
            if (this.hoverBlock?.blockType === Blocks.EndPortalFrame) return;
            if (activeDimension !== 0) return;
            const currentX = Math.floor(this.position.x / BLOCK_SIZE);
            const shrineX = nearestEndShrineX(currentX, (x) => {
                const chunk = getDimensionChunks(0).get(x * BLOCK_SIZE);
                return chunk && !chunk.getAllBlocks(Blocks.EndPortalFrame).length &&
                    !chunk.getAllBlocks(Blocks.EndPortalFrameFilled).length;
            });
            const distance = shrineX - currentX;
            const direction = distance > 0 ? "east" : distance < 0 ? "west" : "here";
            runtime.game.chat.message(`The Eye points ${direction} toward the stronghold (${Math.abs(distance)} blocks).`);
            return;
        }

        if (item.projectile) {
            this.throwProjectile(item);
            return;
        }

        if (item.toolType === ToolType.Hoe) {
            this.useHoe();
            return;
        }

        if (item.toolType === ToolType.Flame) {
            this.useFlame();
            return;
        }

        if (item.foodValue > 0) {
            this.eatFoodInHand();
            return;
        }

        if (
            item.itemId === Items.Bucket ||
            item.itemId === Items.WaterBucket ||
            item.itemId === Items.LavaBucket
        ) {
            this.useBucket();
            return;
        }
    }

    spawnEntityFromEgg(entityTypeName) {
        const EntityType = Entities[entityTypeName];
        const groundBlock = this.hoverBlock;
        const catfishSize = entityTypeName === "Catfish"
            ? Entities.Catfish.randomSpawnSize("Swamp")
            : null;
        const spawnSize = entityTypeName === "Catfish"
            ? Entities.Catfish.spawnSizeFor(catfishSize)
            : EntityType?.spawnSize;
        if (!EntityType || !groundBlock || !spawnSize) return;

        const groundDefinition = getBlock(groundBlock.blockType);
        const spawnInWater = EntityType.spawnInWater === true;
        if (spawnInWater) {
            if (groundBlock.blockType !== Blocks.Water) return;
        } else if (!hasBlockCollision(groundBlock) || groundDefinition.fluid) return;

        if (countMobsNearPlayer(this.world, activeDimension) >= MAX_MOBS_NEAR_PLAYER) {
            const now = runtime.passedTime || 0;
            if (now - (this.mobSpawnLimitNoticeTime ?? -Infinity) >= 2) {
                runtime.game.chat.message(
                    `There are already ${MAX_MOBS_NEAR_PLAYER} mobs nearby. Move away before spawning more.`,
                );
                this.mobSpawnLimitNoticeTime = now;
            }
            return;
        }

        const width = spawnSize.width * BLOCK_SIZE;
        const height = spawnSize.height * BLOCK_SIZE;
        const position = new Vector2(
            groundBlock.transform.position.x + (BLOCK_SIZE - width) / 2,
            spawnInWater
                ? groundBlock.transform.position.y + (BLOCK_SIZE - height) / 2
                : groundBlock.transform.position.y - height,
        );
        if (position.y < 0) return;

        const firstX = Math.floor(position.x / BLOCK_SIZE);
        const lastX = Math.floor((position.x + width - 1) / BLOCK_SIZE);
        const firstY = Math.floor(position.y / BLOCK_SIZE);
        const lastY = Math.floor((position.y + height - 1) / BLOCK_SIZE);
        for (let x = firstX; x <= lastX; x++) {
            for (let y = firstY; y <= lastY; y++) {
                const block = this.world.getBlockAtWorldPosition(
                    x * BLOCK_SIZE,
                    y * BLOCK_SIZE,
                    false,
                    activeDimension,
                );
                if (!block) return;
                const definition = getBlock(block.blockType);
                if (spawnInWater) {
                    if (block.blockType !== Blocks.Water) return;
                } else if (hasBlockCollision(block) && !definition.fluid) return;
            }
        }

        const chunk = this.world.getChunkForX(position.x, activeDimension);
        if (!chunk) return;

        const entity = this.world.summonEntity(
            EntityType,
            position,
            {
                myChunkX: chunk.x,
                dimension: activeDimension,
                ...(entityTypeName === "Catfish" ? { catfishSize } : {}),
            },
            multiplayer,
        );
        if (!entity) return;
        chunk.entities.push(entity);
        this.playerSwing();
        if (!this.abilities.instaBuild) this.removeFromCurrentSlot();
        this.inventory.syncInventoryMultiplayer();
    }

    useFishingRod() {
        const activeBobber = this.fishingBobber;
        if (activeBobber?.active) {
            if (activeBobber.dimension !== this.dimension) {
                activeBobber.remove();
            } else {
                const caught = activeBobber.getCatch();
                activeBobber.remove();
                this.playerSwing();
                if (!caught) return;

                const leftOver = this.inventory.addItem(
                    new InventoryItem({
                        itemId: caught.itemId,
                        count: caught.count,
                    }),
                );
                if (leftOver > 0) {
                    this.world.spawnDrop(
                        new Vector2(activeBobber.position.x, activeBobber.position.y),
                        { itemId: caught.itemId, count: leftOver },
                    );
                }
                this.reduceDurability();
                this.inventory.syncInventoryMultiplayer();
                playPositionalSound(this.position, "misc/pop.ogg", 8);
                runtime.game.chat.message(`Caught ${getItem(caught.itemId).name}.`);
                return;
            }
        }

        const waterBlock = this.findFishingWater();
        if (!waterBlock) {
            runtime.game.chat.message("Aim the fishing rod at open water.");
            return;
        }

        this.playerSwing();
        this.fishingBobber = this.world.summonEntity(
            FishingBobber,
            new Vector2(
                waterBlock.transform.position.x + BLOCK_SIZE / 2,
                waterBlock.transform.position.y + BLOCK_SIZE * 0.08,
            ),
            { owner: this },
        );
        this.fishingBobber.dimension = this.dimension;
        playRandomSoundFromArray({
            array: Sounds.Water_Enter,
            positional: true,
            origin: this.fishingBobber.position,
            volume: 0.35,
        });
    }

    findFishingWater() {
        const mouse = input.getMouseWorldPosition();
        const origin = new Vector2(
            this.position.x + this.hitbox.x / 2,
            this.position.y + this.hitbox.y * 0.35,
        );
        const deltaX = mouse.x - origin.x;
        const deltaY = mouse.y - origin.y;
        const distance = Math.hypot(deltaX, deltaY);
        if (distance < 1) return null;

        const reach = Math.min(distance, BLOCK_SIZE * 12);
        const step = BLOCK_SIZE / 8;
        for (let travelled = step; travelled <= reach; travelled += step) {
            const x = origin.x + (deltaX / distance) * travelled;
            const y = origin.y + (deltaY / distance) * travelled;
            const block = this.world.getBlockAtWorldPosition(
                x,
                y,
                false,
                this.dimension,
            );
            if (!block) return null;
            if (block.blockType === Blocks.Water) return block;
            const definition = getBlock(block.blockType);
            if (!definition.air && !definition.fluid) return null;
        }
        return null;
    }

    isPositionInInteractionRange(position) {
        if (!position) return false;

        const playerCenter = new Vector2(
            this.position.x + this.hitbox.x / 2,
            this.position.y + this.hitbox.y / 2,
        );
        return (
            Vector2.Distance(playerCenter, position) <=
            BLOCK_SIZE * INTERACT_DISTANCE
        );
    }

    isBlockInInteractionRange(block) {
        if (!block?.transform?.position) return false;

        return this.isPositionInInteractionRange(
            new Vector2(
                block.transform.position.x + BLOCK_SIZE / 2,
                block.transform.position.y + BLOCK_SIZE / 2,
            ),
        );
    }

    isEntityInInteractionRange(entity) {
        return (
            Boolean(entity) &&
            this.isPositionInInteractionRange(input.getMouseWorldPosition())
        );
    }

    placeBoat() {
        const water = this.hoverBlock;
        if (!water || water.blockType !== Blocks.Water || this.boat) return;
        if (!this.isBlockInInteractionRange(water)) return;

        const surfaceY = water.transform.position.y +
            (Number.isFinite(water.cutoff) ? water.cutoff : 0) * BLOCK_SIZE;
        const position = new Vector2(
            water.transform.position.x + BLOCK_SIZE / 2 - BLOCK_SIZE * 0.9,
            surfaceY - BLOCK_SIZE * 0.25,
        );
        const boat = runtime.world.summonEntity(
            Entities.Boat,
            position,
            { surfaceY, dimension: activeDimension },
            multiplayer,
        );
        if (!boat) return;

        boat.mount(this);
        this.playerSwing();
        if (!this.abilities.instaBuild) this.removeFromCurrentSlot();
    }

    mountBoat(boat) {
        if (!this.isLocal() || !boat?.isBoat || this.boat) return;
        this.boat = boat;
        this.boatUUID = boat.UUID;
        this.boatPhysics = {
            noGravity: this.noGravity,
            noCollision: this.noCollision,
        };
        boat.passenger = this;
        this.noGravity = true;
        this.noCollision = true;
        this.velocity = new Vector2();
        this.targetVelocity = new Vector2();
        this.swimming = false;
        this.wasSwimming = false;
        this.grounded = false;
        this.boat.ride(this, 0, false, 0);
        runtime.game.chat.message("Use left/right to row. Jump to leave the boat.");
    }

    dismountBoat(boat, jump = false) {
        if (this.boat !== boat) return;
        this.boat = null;
        this.boatUUID = null;
        this.noGravity = this.boatPhysics?.noGravity ?? false;
        this.noCollision = this.boatPhysics?.noCollision ?? false;
        this.boatPhysics = null;
        this.position.x = boat.position.x +
            (boat.hitbox.x - this.hitbox.x) / 2;
        this.position.y = boat.surfaceY - this.hitbox.y + BLOCK_SIZE * 0.35;
        this.velocity = new Vector2(
            boat.velocity.x,
            jump ? -this.abilities.jumpForce * BLOCK_SIZE : 0,
        );
        this.targetVelocity = new Vector2();
        this.swimming = false;
        this.wasSwimming = false;
    }

    useFlame() {
        if (!this.hoverBlock) return;

        const block = getBlock(this.hoverBlock.blockType);

        if (this.hoverBlock.blockType === Blocks.TNT) {
            this.hoverBlock.explode();
            playPositionalSound(this.position, "items/ignite.ogg", 10);
            return;
        }

        // A frame lit before it was completed can be activated by clicking
        // the existing fire again, without breaking it first.
        if (this.hoverBlock.blockType === Blocks.Fire) {
            getDimensionChunks(activeDimension)
                .get(this.hoverBlock.chunkX)
                ?.checkForPortal(this.hoverBlock.x, this.hoverBlock.y);
            return;
        }

        // Check if block is placeable
        if (!this.checkBlockForPlacing(getBlock(Blocks.Fire))) return;

        // Check if block is air
        if (!block.air) return;

        // Check if block is fluid
        if (block.fluid) return;

        playPositionalSound(this.position, "items/ignite.ogg", 10);

        runtime.world.serverPlaceBlock(
            runtime.world.getChunkXForWorldX(this.hoverBlock.transform.position.x),
            this.hoverBlock.x,
            this.hoverBlock.y,
            Blocks.Fire,
            false,
            activeDimension,
        );

        this.world.setBlockType(this.hoverBlock, Blocks.Fire);
    }

    playerSwing() {
        this.swing();

        if (this.isLocal() && multiplayer)
            runtime.server.entityRPC(this.UUID, "playerSwing");
    }

    useHoe() {
        if (!this.hoverBlock) return;

        const block = getBlock(this.hoverBlock.blockType);

        if (!block.hoeAble) return;

        const blockAbove = runtime.world.getBlockAtWorldPosition(
            this.hoverBlock.transform.position.x,
            this.hoverBlock.transform.position.y - BLOCK_SIZE,
        );

        if (blockAbove && !getBlock(blockAbove.blockType).air) return;

        this.playerSwing();

        playRandomSoundFromArray({
            array: Sounds.Break_Gravel,
            positional: true,
            origin: this.position,
        });

        runtime.world.serverPlaceBlock(
            runtime.world.getChunkXForWorldX(this.hoverBlock.transform.position.x),
            this.hoverBlock.x,
            this.hoverBlock.y,
            Blocks.Farmland,
            false,
            activeDimension,
        );

        this.reduceDurability();

        this.world.setBlockType(this.hoverBlock, Blocks.Farmland);
    }

    throwProjectile(item) {
        const projectile = Entities[item.projectile];

        if (!projectile) return;

        this.playerSwing();

        const mousePos = input.getMouseWorldPosition();

        const direction = calculateDirection(this.position, mousePos);

        this.world.summonEntity(projectile, structuredClone(this.position), {
            velocity: new Vector2(
                direction.x * item.throwPower * BLOCK_SIZE,
                direction.y * item.throwPower * BLOCK_SIZE,
            ),
        });

        if (this.abilities.instaBuild) return;

        this.removeFromCurrentSlot();
    }

    useBucket() {
        if (!this.hoverBlock) return;
        const block = getBlock(this.hoverBlock.blockType);

        // Placing
        if (block.air || block.fluid) {
            if (this.holdItem.itemId === Items.WaterBucket) {
                if (!this.checkBlockForPlacing(getBlock(Blocks.Water))) return;

                this.removeFromCurrentSlot();
                this.inventory.addItem(
                    new InventoryItem({ itemId: Items.Bucket, count: 1 }),
                );
                this.hoverBlock.setBlockType(Blocks.Water, true);
                //this.world.setBlockType(this.hoverBlock, Blocks.Water);

                runtime.world.serverPlaceBlock(
                    runtime.world.getChunkXForWorldX(
                        this.hoverBlock.transform.position.x,
                    ),
                    this.hoverBlock.x,
                    this.hoverBlock.y,
                    Blocks.Water,
                    false,
                    activeDimension,
                );

                this.hoverBlock.updateSprite();
                return;
            }
            if (this.holdItem.itemId === Items.LavaBucket) {
                if (!this.checkBlockForPlacing(Blocks.Lava)) return;

                this.removeFromCurrentSlot();
                this.inventory.addItem(
                    new InventoryItem({ itemId: Items.Bucket, count: 1 }),
                );
                this.hoverBlock.setBlockType(Blocks.Lava, true);

                runtime.world.serverPlaceBlock(
                    runtime.world.getChunkXForWorldX(
                        this.hoverBlock.transform.position.x,
                    ),
                    this.hoverBlock.x,
                    this.hoverBlock.y,
                    Blocks.Lava,
                    false,
                    activeDimension,
                );

                //this.world.setBlockType(this.hoverBlock, Blocks.Lava);

                this.hoverBlock.updateSprite();
                return;
            }
        }

        // Picking up
        if (block.fluid) {
            // Water
            if (
                this.hoverBlock.blockType === Blocks.Lava &&
                this.hoverBlock.metaData.isSource
            ) {
                this.removeFromCurrentSlot();
                this.inventory.addItem(
                    new InventoryItem({ itemId: Items.LavaBucket, count: 1 }),
                );

                const chunk = getDimensionChunks(activeDimension).get(
                    this.hoverBlock.chunkX,
                );

                if (!chunk) return;

                runtime.world.serverPlaceBlock(
                    chunk.x,
                    this.hoverBlock.x,
                    this.hoverBlock.y,
                    Blocks.Air,
                    false,
                    activeDimension,
                );

                chunk.setBlockTypeLocal(
                    this.hoverBlock.x,
                    this.hoverBlock.y,
                    Blocks.Air,
                    false,
                    null,
                );
            }

            // Lava
            if (
                this.hoverBlock.blockType === Blocks.Water &&
                this.hoverBlock.metaData.isSource
            ) {
                this.removeFromCurrentSlot();
                this.inventory.addItem(
                    new InventoryItem({ itemId: Items.WaterBucket, count: 1 }),
                );

                const chunk = getDimensionChunks(activeDimension).get(
                    this.hoverBlock.chunkX,
                );

                if (!chunk) return;

                runtime.world.serverPlaceBlock(
                    chunk.x,
                    this.hoverBlock.x,
                    this.hoverBlock.y,
                    Blocks.Air,
                    false,
                    activeDimension,
                );

                chunk.setBlockTypeLocal(
                    this.hoverBlock.x,
                    this.hoverBlock.y,
                    Blocks.Air,
                    false,
                    null,
                );
            }
            // playPositionalSound(this.position, "items/bucket_fill.ogg");
        }
    }

    useCatfishBucket() {
        const block = this.hoverBlock;
        if (!block || block.blockType !== Blocks.Water) return false;
        const sizeByBucket = new Map([
            [Items.SmallCatfishBucket, 0],
            [Items.MediumCatfishBucket, 1],
            [Items.LargeCatfishBucket, 2],
        ]);
        const size = sizeByBucket.get(this.holdItem.itemId);
        if (size === undefined ||
            countMobsNearPlayer(this.world, activeDimension) >= MAX_MOBS_NEAR_PLAYER) {
            return false;
        }

        const spawnSize = Entities.Catfish.spawnSizeFor(size);
        const width = spawnSize.width * BLOCK_SIZE;
        const height = spawnSize.height * BLOCK_SIZE;
        const position = new Vector2(
            block.transform.position.x + (BLOCK_SIZE - width) / 2,
            block.transform.position.y + (BLOCK_SIZE - height) / 2,
        );
        const chunk = this.world.getChunkForX(position.x, activeDimension);
        if (!chunk) return false;

        const bucketData = this.holdItem.props || {};
        const catfish = this.world.summonEntity(
            Entities.Catfish,
            position,
            {
                catfishSize: size,
                health: Number.isFinite(bucketData.health) ? bucketData.health : undefined,
                stomachItems: Array.isArray(bucketData.stomachItems)
                    ? bucketData.stomachItems : [],
                swallowedEntity: bucketData.swallowedEntity ?? null,
                fromBucket: true,
                myChunkX: chunk.x,
                dimension: activeDimension,
            },
            multiplayer,
        );
        if (!catfish) return false;
        if (!chunk.entities.includes(catfish)) chunk.entities.push(catfish);
        this.playerSwing();
        if (!this.abilities.instaBuild) {
            this.removeFromCurrentSlot();
            this.inventory.addItem(new InventoryItem({ itemId: Items.Bucket, count: 1 }));
        }
        return true;
    }

    processEating() {
        if (!this.eating) return;

        const item = getItem(this.holdItem.itemId);
        if (!this.canEatFood(item)) {
            this.eating = false;
            this.eatTimer = 0;
            return;
        }

        if (!input.isActionDown("place")) {
            this.eating = false;
            this.eatTimer = 0;
            return;
        }

        this.eatTimer += runtime.deltaTime;

        if (this.eatTimer % 0.2 < runtime.deltaTime) {
            playRandomSoundFromArray({
                array: Sounds.Player_Eat,
                positional: true,
                origin: this.position,
                volume: 0.5,
            });
        }

        // Check if eating is complete
        if (this.eatTimer >= this.eatTime) {
            this.finishEating(item);
        }
    }

    finishEating(item) {
        this.addFood(item.foodValue, item.foodSaturation);
        if (item.itemId === Items.Pufferfish) {
            this.deathCause = "Pufferfish poisoning";
            this.forceDamage(2);
        }
        this.eating = false;
        this.eatTimer = 0;

        // Play eating sound
        playPositionalSound(this.position, "player/burp.ogg");

        if (!this.abilities.instaBuild) {
            this.removeFromCurrentSlot();
        }
    }

    eatFoodInHand() {
        // This method is no longer needed directly but keeping it for compatibility
        const item = getItem(this.holdItem.itemId);
        if (!this.canEatFood(item)) return;
        this.eating = true;
        this.eatTimer = 0;
    }

    dropAllItems() {
        this.closeInventory();

        this.inventory.dropAll(this.position);
    }

    footstepEmitterLogic() {
        if (this.isLocal() && !input.isActionDown("sprint")) return;
        super.footstepEmitterLogic();
    }

    tickUpdate() {
        super.entityTickUpdate();

        if (this.isLocal()) this.updateFoodTick();
    }

    dieEvent() {
        if (this.boat) this.boat.dismount(this);
        if (!this.deathCause) {
            this.deathCause = `${this.name || "Player"} was killed`;
        }

        runtime.game.chat.message("Player has died.");

        playRandomSoundFromArray({
            array: Sounds.Player_Hurt,
            positional: true,
            origin: this.position,
        });

        this.abilities.mayFly = false;
        this.abilities.flying = false;
        this.abilities.instaBuild = false;
        this.abilities.mayBuild = false;
        this.canMove = false;
        this.isDead = true;

        if (!runtime.GAMERULES.keepInventory) this.dropAllItems();

        if (typeof showDeathScreen === "function") showDeathScreen();
    }

    setHoldItem() {
        this.holdItem =
            this.inventory.items[3][this.inventory.currentSlot].item;
    }

    teleport(position) {
        this.position = new Vector2(position.x, position.y);
    }

    interactLogic() {
        if (this.windowOpen) return;
        if (runtime.game.pauseMenu?.getActive()) return;

        if (handleMasterStaffInput(this)) return;

        this.shieldBlocking = this.isShieldRaised();

        const usePressed = input.isActionPressed("place");

        if (usePressed && this.checkForEntityOnMouse()?.isBoat) {
            this.tryEntityInteract();
            return;
        }

        if (usePressed && !this.shieldBlocking) this.useItemInHand();

        // Placing a boat boards the player immediately. Do not treat the same
        // click as a second interaction with the newly created boat.
        if (usePressed && this.boat) return;

        if (usePressed) this.tryEntityInteract();

        if (!this.hoverBlock) return;

        const block = getBlock(this.hoverBlock.blockType);

        if (input.isActionPressed("pickBlock")) {
            this.handleQuickBlockSelect(block);
        }

        if (!usePressed) return;

        this.hoverBlock.interact(this);

        if (block.specialType !== null) this.playerSwing();

        switch (block.specialType) {
            case SpecialType.CraftingTable:
                this.openCraftingTable();
                break;
            case SpecialType.Furnace:
                this.openFurnace();
                break;
            case SpecialType.SingleChest:
                this.openSingleChest();
                break;
            case SpecialType.Converter:
                this.openConverter();
                break;
            case SpecialType.Hopper:
                this.openHopper();
                break;
        }
    }

    tryEntityInteract() {
        const entity = this.checkForEntityOnMouse();

        if (!entity) return;
        if (!this.isEntityInInteractionRange(entity)) return;

        if (typeof entity.interact !== "function") return;

        entity.interact(this, this.holdItem);
    }

    interact(player, item) {
        if (player === this) return;
    }

    handleQuickBlockSelect(block) {
        if (!block) return;

        const inventoryItems = this.inventory.getAllItems();

        const blockIndex = inventoryItems.findIndex(
            (item) => item.blockId === block.blockId,
        );

        if (blockIndex === -1) {
            if (this.gamemode === 1) {
                this.inventory.addItem(
                    new InventoryItem({
                        blockId: block.blockId,
                        count: 1,
                    }),
                );
            }
            return;
        }

        // WIP

        // If the block is already in the inventory, select it
        // const item = this.inventory.getSlotFromInventory(block);

        // console.log(item);
    }

    //#region Block Interaction UIs
    openSingleChest() {
        const chestStorage = this.hoverBlock.metaData.storage;

        playPositionalSound(this.position, "blocks/chestopen.ogg");

        this.inventory.openSingleChest(chestStorage);
        this.inventory.interactedBlock = this.hoverBlock;
        this.openInventory();
    }

    openConverter() {
        const storage = this.hoverBlock.metaData.storage;

        this.inventory.openConverter(storage);
        this.inventory.interactedBlock = this.hoverBlock;
        this.openInventory();
    }

    openHopper() {
        const storage = this.hoverBlock.metaData.storage;

        this.inventory.openHopper(storage);
        this.inventory.interactedBlock = this.hoverBlock;
        this.openInventory();
    }

    openFurnace() {
        const furnaceData = this.hoverBlock.metaData.storage;

        this.inventory.openFurnace(furnaceData);
        this.inventory.interactedBlock = this.hoverBlock;
        this.openInventory();
    }

    openCraftingTable() {
        this.inventory.craftingTable = true;
        this.inventory.interactedBlock = null;
        this.openInventory();
    }

    openSign(sign) {
        const signData = sign.metaData;

        this.windowOpen = true;
        this.canMove = false;

        this.inventory.interactedBlock = sign;

        this.inventory.openSign(signData.text);
    }

    //#endregion

    hoverBlockLogic() {
        if (this.oldHoverBlock !== this.hoverBlock) {
            this.oldHoverBlock = this.hoverBlock;
            this.resetBreaking();
        }
    }

    toggleLogic() {
        if (runtime.game.chat.inChat) return;
        if (this.windowOpen && input.isActionPressed("pause")) {
            this.closeInventory();
            input._pauseConsumedByUI = true;
            return;
        }
        if (input.isActionPressed("use") && !this.inventory.isEditingSign) {
            if (this.windowOpen) this.closeInventory();
            else {
                if (this.gamemode === 1) {
                    this.inventory.openCreativeInventory();
                }

                this.inventory.interactedBlock = null;
                this.openInventory();
            }
        }
    }

    openInventory() {
        this.windowOpen = true;
        this.canMove = false;

        this.inventory.refreshInventory();
    }

    closeInventory() {
        this.windowOpen = false;
        this.canMove = true;

        if (this.inventory.holdingItem) this.dropCurrentInventoryHolding();

        if (
            this.inventory.interactedBlock &&
            this.inventory.interactedBlock.metaData
        ) {
            switch (
                getBlock(this.inventory.interactedBlock.blockType).specialType
            ) {
                case SpecialType.SingleChest:
                    playPositionalSound(
                        this.position,
                        "blocks/chestclosed.ogg",
                    );
                    break;
            }
        }

        const leftOver = this.inventory.closeInventory();

        if (leftOver) {
            leftOver.forEach((item) => {
                this.drop(item);
            });
        }

        this.inventory.clearSlot(this.inventory.craftingOutputSlot);

        this.inventory.craftingTable = false;
        this.inventory.furnace = false;
    }

    collisionLogic() {
        const drop = this.entityCollision(EntityTypes.Drop);
        if (drop) this.pickupDrop(drop);
    }

    pickupDrop(drop) {
        if (!drop.isReady) return;
        if ((drop.pickupDelayUntil || 0) > (runtime.passedTime || 0)) return;

        let left = 0;

        // Add Block to Inventory
        left += this.inventory.addItem(
            new InventoryItem({
                blockId: drop.blockId,
                itemId: drop.itemId,
                count: drop.count,
                props: drop.props,
            }),
        );

        if (left != drop.count) playSound("misc/pop.ogg");

        if (left > 0) {
            drop.count = left;
            return;
        }

        runtime.world.removeEntity(drop, multiplayer);
    }

    climbingCollisingLogic() {
        // Get the blocks using types
        const blockTypes = this.collidingWithBlocks;

        const climableBlocks = this.filterBlocksByProperty(
            blockTypes,
            "climable",
        );

        // Add Sounds

        if (climableBlocks.length === 0) {
            this.climbing = false;
            return;
        }

        this.climbing = true;

        this.fallDistance = 0;
    }

    drop(item, count = item.count) {
        this.world.spawnDrop(
            new Vector2(
                this.position.x + randomRange(0, BLOCK_SIZE / 3),
                this.position.y,
            ),
            {
                blockId: item.blockId,
                itemId: item.itemId,
                count: count,
                props: item.props,
            },
        );
    }

    dropCurrentInventoryHolding() {
        const item = this.inventory.holdingItem;
        this.drop(item);

        this.inventory.holdingItem = null;
    }

    flyingToggleLogic() {
        if (!this.abilities.mayFly) return;

        if (input.isActionPressed("jump")) {
            if (!this.pressedSpace) {
                this.pressedSpace = true;

                setTimeout(() => {
                    this.pressedSpace = false;
                }, 200);

                return;
            }
        } else {
            return;
        }

        this.abilities.flying = !this.abilities.flying;
    }

    breakingAndPlacingLogic() {
        if (this.windowOpen || runtime.game.pauseMenu?.getActive()) {
            this.resetBreaking();
            return;
        }

        if (this.isShieldRaised()) {
            this.shieldBlocking = true;
            this.resetBreaking();
            return;
        }

        if (input.isActionPressed("attack")) {
            this.playerSwing();
            this.tryHit();
        }

        if (!this.hoverBlock) {
            this.resetBreaking();
            return;
        }

        if (input.isActionDown("attack")) {
            if (
                this.inventory.selectedItem &&
                this.inventory.selectedItem.toolType === ToolType.Hammer
            ) {
                this.breakingLogic(this.hoverWall, true);
            } else {
                this.breakingLogic(this.hoverBlock);
            }
        } else {
            this.resetBreaking();
        }
        if (input.isActionDown("place")) this.placingLogic();
    }

    checkForEntityOnMouse() {
        return (
            this.entities.find((entity) => {
                if (entity.dimension !== activeDimension) return false;
                const worldX = entity.position.x + (entity.offset?.x ?? 0);
                const worldY = entity.position.y + (entity.offset?.y ?? 0);
                return mouseOverPosition(
                    worldX,
                    worldY,
                    entity.hitbox.x,
                    entity.hitbox.y,
                    true,
                );
            }) ?? null
        );
    }

    tryHit() {
        const entity = this.checkForEntityOnMouse();
        runtime.cursorInRange = entity
            ? this.isEntityInInteractionRange(entity)
            : this.isBlockInInteractionRange(this.hoverBlock);
        if (!runtime.cursorInRange) return;

        this.hitEntity(entity);
    }

    hitEntity(entity) {
        if (!entity) return;

        // console.log(entity);
        if (entity === this) return;
        if (!this.isEntityInInteractionRange(entity)) return;

        const previousHealth = entity.health;
        entity.hit(this.calculateDamage(), this.position.x, 4);
        if (previousHealth > 0 && entity.health <= 0) this.gainExperienceLevel(1);

        if (entity.health) {
            let reduceDurabilityBy = 1;

            switch (getItem(this.holdItem.itemId)?.toolType) {
                case ToolType.Axe:
                    reduceDurabilityBy = 2;
                    break;
                case ToolType.Pickaxe:
                    reduceDurabilityBy = 2;
                    break;
                case ToolType.Shovel:
                    reduceDurabilityBy = 2;
                    break;
                case ToolType.Hoe:
                    reduceDurabilityBy = 2;
                    break;
                case ToolType.Hammer:
                    reduceDurabilityBy = 2;
                    break;
                case ToolType.Shears:
                    reduceDurabilityBy = 0;
                    break;
            }

            this.reduceDurability();
        }
    }

    gainExperienceLevel(amount = 1) {
        if (!Number.isFinite(amount) || amount <= 0) return this.xpLevel;
        this.xpLevel = Math.max(0, Math.min(9999, this.xpLevel + Math.floor(amount)));
        return this.xpLevel;
    }

    calculateDamage() {
        let damage = 1;

        if (this.holdItem.itemId) {
            damage += getItem(this.holdItem.itemId).baseDamage;
        }

        return damage;
    }

    checkWallForPlacing() {
        if (!this.hoverBlock || !this.hoverWall) return false;
        const chunk = getDimensionChunks(activeDimension).get(
            this.hoverBlock.chunkX,
        );

        if (!chunk) return;

        if (!getBlock(this.hoverWall.blockType).air) return false;

        const mousePos = new Vector2(
            input.getMousePositionOnBlockGrid().x,
            input.getMousePositionOnBlockGrid().y,
        );

        let isAdjacentToBlock =
            runtime.world.checkAdjacentBlocks(mousePos, true) ||
            runtime.world.checkAdjacentBlocks(mousePos);

        return this.abilities.instaBuild ||
            !getBlock(this.hoverBlock.blockType).air || isAdjacentToBlock;
    }

    placingLogic() {
        if (!this.abilities.mayBuild) return;
        if (!this.isBlockInInteractionRange(this.hoverBlock)) return;

        // Check if holding either a block or an item with placeBlock property
        if (
            !this.inventory.selectedBlock &&
            (!this.inventory.selectedItem ||
                !this.inventory.selectedItem.placeBlock)
        ) {
            return;
        }

        // Get the selected item or block
        const selectedItem =
            this.inventory.selectedItem || this.inventory.selectedBlock;

        // Determine what block to place based on what's held
        const blockToPlace = selectedItem.placeBlock
            ? getBlock(selectedItem.placeBlock)
            : selectedItem;

        const placingSeaPickle = blockToPlace.blockId === Blocks.SeaPickle;
        const placingSeaLanternInWater =
            blockToPlace.blockId === Blocks.SeaLantern &&
            this.hoverBlock.blockType === Blocks.Water;
        if (placingSeaPickle && this.checkForEntityOnMouse()?.isCatfish) return;

        if (placingSeaPickle &&
            this.hoverBlock.blockType === Blocks.SeaPickle) {
            if (!this.hoverBlock.addSeaPickle()) return;
            this.playerSwing();
            if (!this.abilities.instaBuild) this.removeFromCurrentSlot();
            this.inventory.syncInventoryMultiplayer();
            return;
        }

        // Check if it's a wall item/block
        const isWall = this.getSelectedSlotItem().props?.wall;

        // Validate placement based on wall or regular block
        if (!isWall) {
            if (placingSeaPickle && this.hoverBlock.blockType !== Blocks.Water) return;
            if (!placingSeaPickle && !placingSeaLanternInWater &&
                !this.checkBlockForPlacing(blockToPlace)) {
                return;
            }
        } else {
            if (!this.checkWallForPlacing()) {
                return;
            }
        }

        // Get the target chunk
        const chunk = getDimensionChunks(activeDimension).get(
            this.hoverBlock.chunkX,
        );

        // Place the block
        const placementMetaData =
            !isWall && placingSeaPickle
                ? { waterlogged: true, pickles: 1 }
                : !isWall && blockToPlace.specialType === SpecialType.Door
                  ? { open: false } : null;
        const newBlock = chunk.setBlockTypeLocal(
            this.hoverBlock.x,
            this.hoverBlock.y,
            blockToPlace.blockId,
            isWall,
            placementMetaData,
            true,
        );

        if (!newBlock) return;

        // Sign UI
        if (!isWall && blockToPlace.specialType === SpecialType.Sign) {
            this.openSign(newBlock);
        }

        runtime.world.serverPlaceBlock(
            chunk.x,
            this.hoverBlock.x,
            this.hoverBlock.y,
            blockToPlace.blockId,
            isWall,
            activeDimension,
        );
        if (placingSeaPickle) newBlock.syncMetaData(false);

        // Play appropriate break sound
        if (!isWall) {
            this.hoverBlock.playBreakSound();
        } else {
            this.hoverWall.playBreakSound();
        }

        this.playerSwing();

        if (!isWall && blockToPlace.blockId === Blocks.CarvedPumpkin) {
            this.tryCreateGolem(newBlock);
        }

        // Early return for walls
        if (isWall) {
            if (!this.abilities.instaBuild) {
                this.removeFromCurrentSlot();
            }
            return;
        }

        // Remove from inventory if not in insta-build mode
        if (!this.abilities.instaBuild) {
            this.removeFromCurrentSlot();
        }
    }

    tryCreateGolem(pumpkinBlock) {
        if (!pumpkinBlock || pumpkinBlock.blockType !== Blocks.CarvedPumpkin)
            return false;

        const originX = pumpkinBlock.transform.position.x;
        const originY = pumpkinBlock.transform.position.y;
        const getAt = (x, y) =>
            this.world.getBlockAtWorldPosition(
                originX + x * BLOCK_SIZE,
                originY + y * BLOCK_SIZE,
                false,
                activeDimension,
            );

        const center = getAt(0, 1);
        const lowerCenter = getAt(0, 2);
        const leftArm = getAt(-1, 1);
        const rightArm = getAt(1, 1);
        const ironPattern =
            center?.blockType === Blocks.IronBlock &&
            lowerCenter?.blockType === Blocks.IronBlock &&
            leftArm?.blockType === Blocks.IronBlock &&
            rightArm?.blockType === Blocks.IronBlock;
        const snowPattern =
            center?.blockType === Blocks.SnowBlock &&
            lowerCenter?.blockType === Blocks.SnowBlock;

        if (!ironPattern && !snowPattern) return false;

        const entityType = ironPattern ? Entities.IronGolem : Entities.SnowGolem;
        const hitboxWidth = (ironPattern ? 1.4 : 0.8) * BLOCK_SIZE;
        const spawnPosition = new Vector2(
            originX + (BLOCK_SIZE - hitboxWidth) / 2,
            originY,
        );
        const spawnChunkX = this.world.getChunkXForWorldX(spawnPosition.x);
        const spawnChunk = getDimensionChunks(activeDimension).get(spawnChunkX);
        if (!spawnChunk) return false;

        const consumedBlocks = ironPattern
            ? [pumpkinBlock, center, lowerCenter, leftArm, rightArm]
            : [pumpkinBlock, center, lowerCenter];
        const affectedChunks = new Set();
        const adjacentBlocks = new Set();
        for (const block of consumedBlocks) {
            this.world.setBlockType(block, Blocks.Air, false);
            affectedChunks.add(block.chunkX);
            this.world.serverPlaceBlock(
                block.chunkX,
                block.x,
                block.y,
                Blocks.Air,
                false,
                activeDimension,
                false,
            );

            const { x, y } = block.transform.position;
            for (const [dx, dy] of [[0, -BLOCK_SIZE], [0, BLOCK_SIZE], [-BLOCK_SIZE, 0], [BLOCK_SIZE, 0]]) {
                const adjacent = this.world.getBlockAtWorldPosition(
                    x + dx,
                    y + dy,
                    false,
                    activeDimension,
                );
                if (adjacent && !consumedBlocks.includes(adjacent)) {
                    adjacentBlocks.add(adjacent);
                }
            }
        }
        for (const adjacent of adjacentBlocks) adjacent.blockUpdate();
        for (const chunkX of affectedChunks) {
            this.world.uploadChunkToServer(chunkX, activeDimension);
        }

        const golem = this.world.summonEntity(
            entityType,
            spawnPosition,
            { myChunkX: spawnChunkX, dimension: activeDimension },
            multiplayer,
        );
        spawnChunk.entities.push(golem);
        return true;
    }

    removeFromCurrentSlot(count = 1) {
        this.inventory.removeItem(3, this.inventory.currentSlot, count);
    }

    getSelectedSlotItem() {
        return this.inventory.items[3][this.inventory.currentSlot].item;
    }

    checkBlockForPlacing(block) {
        const isAir = getBlock(this.hoverBlock.blockType).air;
        const isFluid = getBlock(this.hoverBlock.blockType).fluid;

        const mousePos = new Vector2(
            input.getMousePositionOnBlockGrid().x,
            input.getMousePositionOnBlockGrid().y,
        );

        if (mousePos.y <= -1) {
            runtime.game.chat.message(
                "Can't place here! World height: " + CHUNK_HEIGHT,
                "",
                "red",
            );
            return;
        }

        let collidingWithEntity = false;
        const collisionCells = block.collision
            ? [new Vector2(mousePos.x, mousePos.y)]
            : [];
        for (const extended of block.extendedBlock || []) {
            if (!getBlock(extended.blockId).collision) continue;
            collisionCells.push(
                new Vector2(
                    mousePos.x + extended.offset.x * BLOCK_SIZE,
                    mousePos.y - extended.offset.y * BLOCK_SIZE,
                ),
            );
        }

        if (collisionCells.length > 0) {
            for (let i = 0; i < this.entities.length; i++) {
                const entity = this.entities[i];
                if (entity.type === 0) continue;
                if (collisionCells.some((position) =>
                    isColliding(
                        new Vector2(entity.position.x, entity.position.y),
                        new Vector2(entity.hitbox.x, entity.hitbox.y),
                        position,
                        new Vector2(BLOCK_SIZE, BLOCK_SIZE),
                    )
                )) {
                    collidingWithEntity = true;
                    break;
                }
            }
        }

        const isAdjacentToBlock = runtime.world.checkAdjacentBlocks(mousePos);

        const blockBeneath = runtime.world.getBlockAtWorldPosition(
            this.hoverBlock.transform.position.x,
            this.hoverBlock.transform.position.y + BLOCK_SIZE,
        );

        if (
            block.specialType === SpecialType.Door &&
            (!blockBeneath ||
                !hasBlockCollision(blockBeneath) ||
                getBlock(blockBeneath.blockType).fluid)
        ) {
            return false;
        }

        // Check if block can be placed without block underneath
        if (block.breakWithoutBlockUnderneath) {
            if (!blockBeneath) return false;

            const blockBeneathDef = getBlock(blockBeneath.blockType);

            let wallCheck = false;

            if (
                block.canBePlacedOnSelf &&
                blockBeneath.blockType === block.blockId &&
                !blockBeneath.onAWall
            )
                return true;

            if (
                !hasBlockCollision(blockBeneath) &&
                block.onlyPlacableOn === null &&
                blockBeneathDef.transparent
            )
                wallCheck = true;

            if (blockBeneathDef.fluid) wallCheck = true;

            if (
                blockBeneathDef.defaultCutoff > 0 &&
                block.onlyPlacableOn === null
            )
                wallCheck = true;

            if (wallCheck) {
                // If block can be placed on wall, check for wall behind
                if (block.canBePlacedOnWall) {
                    let wallBehind = runtime.world.getBlockAtWorldPosition(
                        this.hoverBlock.transform.position.x,
                        this.hoverBlock.transform.position.y,
                        true,
                    );

                    return !getBlock(wallBehind.blockType).air;
                } else {
                    return false;
                }
            }
        }

        // Check if block can only be placed on specific blocks
        if (block.onlyPlacableOn?.length > 0) {
            if (!blockBeneath) return false;

            if (!block.onlyPlacableOn.includes(blockBeneath.blockType))
                return false;
        }

        return (isAir || isFluid) && !collidingWithEntity && isAdjacentToBlock;
    }

    dropLogic() {
        if (!this.canMove) return;
        if (!input.isActionPressed("drop")) return;

        if (this.windowOpen) {
            if (this.inventory.holdingItem) {
                this.drop(this.inventory.holdingItem);
                this.inventory.holdingItem = null;
            } else {
                if (this.inventory.hoverItem) {
                    this.drop(this.inventory.hoverItem, 1);
                    this.inventory.removeItem(
                        this.inventory.hoverSlot.y,
                        this.inventory.hoverSlot.x,
                        1,
                        this.inventory.hoverSlot.array,
                    );
                }
            }
            return;
        }

        if (
            !this.inventory.selectedBlock &&
            this.inventory.selectedItem == null
        )
            return;

        if (input.isActionDown("sprint")) {
            this.drop(
                this.getSelectedSlotItem(),
                this.getSelectedSlotItem().count,
            );
            this.inventory.removeItem(
                3,
                this.inventory.currentSlot,
                this.getSelectedSlotItem().count,
                this.inventory.items,
            );
            return;
        }

        this.drop(this.getSelectedSlotItem(), 1);

        this.inventory.removeItem(
            3,
            this.inventory.currentSlot,
            1,
            this.inventory.items,
        );
    }

    resetBreaking() {
        this.breakingTime = 0;
        this.breakingStage = 0;
        this.lastBreakSoundTime = 0;
        this.breakingTarget = null;
        this.breakingTargetBlockType = null;
        this.breakingTargetIsWall = false;
    }

    breakingLogic(hover, wall = false) {
        if (!hover) {
            this.resetBreaking();
            return;
        }

        if (this.breakingTarget !== hover ||
            this.breakingTargetBlockType !== hover.blockType ||
            this.breakingTargetIsWall !== wall) {
            this.resetBreaking();
            this.breakingTarget = hover;
            this.breakingTargetBlockType = hover.blockType;
            this.breakingTargetIsWall = wall;
        }

        if (!this.isBlockInInteractionRange(hover)) {
            this.resetBreaking();
            return;
        }

        let block = getBlock(hover.blockType);

        if (block.air || block.fluid) {
            this.resetBreaking();
            return;
        }

        if (
            !this.abilities.mayBuild ||
            (getBlock(hover.blockType).hardness < 0 && this.gamemode != 1)
        ) {
            this.resetBreaking();
            return;
        }

        if (this.abilities.instaBuild) {
            hover.breakBlock(false, wall);
            this.playerSwing();

            runtime.world.serverBreakBlock(
                hover.chunkX,
                hover.x,
                hover.y,
                Blocks.Air,
                wall,
                false,
                activeDimension,
            );
            this.resetBreaking();
            return;
        }

        let currentBlockHardness = block.hardness;
        const originalBlockHardness = block.hardness;

        const selectedTool = this.inventory.selectedItem?.toolType;

        let isWall = false;

        if (selectedTool === ToolType.Hammer) {
            isWall = true;
        }

        // set hardness to tooltype
        if (
            !isWall &&
            selectedTool &&
            block.toolType === this.inventory.selectedItem.toolType
        ) {
            // is correct tool
            currentBlockHardness -= this.inventory.selectedItem.toolLevel / 2;
            if (currentBlockHardness < 0) currentBlockHardness = 0;
        }

        if (isWall)
            currentBlockHardness = 2 - this.inventory.selectedItem.toolLevel;

        if (this.breakingTime === 0) {
            this.hoverBlock.clicked(this);
        }

        const soundInterval = 0.2;
        this.breakingTime += this.grounded ? runtime.deltaTime : runtime.deltaTime / 3;

        if (this.breakingTime >= this.lastBreakSoundTime + soundInterval) {
            this.lastBreakSoundTime = this.breakingTime;
            playRandomSoundFromArray({
                array: block.breakingSound,
                volume: 0.2,
                positional: true,
                origin: runtime.world.getBlockWorldPosition(this.hoverBlock),
            });

            this.playerSwing();
        }

        this.breakingStage = Math.floor(
            Math.min(10, (this.breakingTime / currentBlockHardness) * 10),
        );

        // Check if block should be broken
        if (this.breakingTime >= currentBlockHardness) {
            let shouldDrop = block.dropWithoutTool
                ? true
                : selectedTool
                  ? selectedTool === block.toolType
                  : false;
            if (
                this.inventory.selectedItem &&
                this.inventory.selectedItem.toolLevel < block.requiredToolLevel
            )
                shouldDrop = false;
            if (isWall) shouldDrop = true;
            hover.breakBlock(shouldDrop, isWall);

            if (multiplayer) {
                runtime.world.serverBreakBlock(
                    hover.chunkX,
                    hover.x,
                    hover.y,
                    Blocks.Air,
                    isWall,
                    shouldDrop,
                    activeDimension,
                );
            }

            let reduceDurabilityBy = 1;

            if (getItem(this.holdItem.itemId)?.toolType === ToolType.Sword)
                reduceDurabilityBy = 2;

            if (originalBlockHardness <= 0) reduceDurabilityBy = 0;

            this.reduceDurability();

            this.resetBreaking();
            this.playerSwing();
        }
    }

    reduceDurability(amount = 1) {
        if (this.gamemode === 1) return;

        if (this.holdItem.hasProp("durability")) {
            this.holdItem.setProp(
                "durability",
                this.holdItem.getProp("durability") - amount,
            );

            if (this.holdItem.getProp("durability") <= 0) {
                this.inventory.removeItem(3, this.inventory.currentSlot, 1);

                playPositionalSound(
                    this.position,
                    "items/break.ogg",
                    10,
                    1,
                    randomRange(0.8, 1.2),
                );
            }
        }
    }

    movementLogic() {
        if (this.windowOpen) return;

        if (this.boat) {
            if (!this.canMove || runtime.game.pauseMenu?.getActive()) return;
            if (
                input.isActionPressed("jump") ||
                input.isActionPressed("moveUp")
            ) {
                this.boat.dismount(this, true);
            }
            if (this.boat) {
                const direction = Number(input.isActionDown("moveRight")) -
                    Number(input.isActionDown("moveLeft"));
                this.boat.ride(
                    this,
                    direction,
                    input.isActionDown("sprint"),
                    runtime.deltaTime,
                );
                this.lookAtCursor();
                return;
            }
        }

        this.handleSwimming();
        if (!this.canMove) return;
        this.handleHorizontalMovement();
        this.handleJump();
        this.handleClimbing();
        this.handleFlying();
        this.lookAtCursor();

        // this.applyDeltaTime();
    }

    voidLogic() {
        if (this.position.y > CHUNK_HEIGHT * BLOCK_SIZE) {
            if (this.gamemode === 1) {
                this.deathCause = "Fell out of the world";
                this.die();
            } else {
                this.hit(2, this.position.x, 0, "Fell out of the world");
            }
        }
    }

    handleClimbing() {
        // Climbing logic
        if (!this.climbing) return;

        if (input.isActionDown("moveUp"))
            this.velocity.y = (-this.abilities.walkSpeed / 2) * BLOCK_SIZE;
        else this.velocity.y = (this.abilities.walkSpeed / 4) * BLOCK_SIZE;
    }

    lookAtCursor() {
        const mousePosition = input.getMousePosition();

        const partX = this.position.x + this.offset.x - camera.x;
        const partY = this.position.y + this.offset.y - camera.y;

        const rotation = this.rotateToPoint(mousePosition, {
            x: partX,
            y: partY,
        });

        this.lookDirection = rotation;
    }

    handleHorizontalMovement() {
        const isSprinting = input.isActionDown("sprint");
        let speed = isSprinting
            ? this.abilities.walkSpeed * BLOCK_SIZE * 1.3
            : this.abilities.walkSpeed * BLOCK_SIZE;

        // Reduce speed if swimming
        if (this.swimming) {
            speed /= 2;
        }

        // Reduce speed if eating
        if (this.eating) {
            speed /= 2;
        }

        // Return if no movement keys are pressed
        if (!input.isActionDown("moveRight") && !input.isActionDown("moveLeft"))
            return;

        // Move right or left based on key pressed
        this.targetVelocity.x = input.isActionDown("moveRight")
            ? speed
            : -speed;
    }

    handleJump() {
        if (this.swimming || !this.grounded) return; // Only jump if grounded and not swimming
        if (!(input.isActionDown("jump") || input.isActionDown("moveUp")))
            return;

        // Apply jump force
        this.velocity.y = -this.abilities.jumpForce * BLOCK_SIZE;
        this.grounded = false;

        this.addFoodExhaustion(input.isActionDown("sprint") ? 0.4 : 0.2);
    }

    updateSwimmingAnimation() {
        if (this.boat) {
            this.body.updateSwimming(false);
            this.body.updateBoating(
                true,
                Math.abs(this.boat.velocity.x) > 5,
            );
            return;
        }

        this.body.updateBoating(false);
        const torsoY = this.position.y + this.hitbox.y / 2;
        const inWater = this.swimming && this.collidingWithBlocks.some((block) =>
            block.blockType === Blocks.Water && block.transform.position.y <= torsoY,
        );
        const moving = Math.abs(this.velocity.x) > 5 || this.velocity.y < -5;
        this.body.updateSwimming(inWater && moving && !this.abilities.flying);
    }

    handleSwimming() {
        if (this.wasSwimming && !this.swimming) {
            // Exited Fluid
            if (this.velocity.y < 0) this.addForce(0, -5);
            this.wasSwimming = false;
        }

        if (!this.wasSwimming && this.swimming) {
            // Entered Water
            this.velocity.x = 0;
        }

        if (!this.swimming) return;

        this.wasSwimming = true;

        // Swim upwards or sink slowly

        const isPressingUp =
            input.isActionDown("jump") || input.isActionDown("moveUp");

        if (!this.grounded)
            this.velocity.y =
                isPressingUp && this.canMove
                    ? -1.5 * BLOCK_SIZE
                    : 0.8 * BLOCK_SIZE;
    }

    handleFlying() {
        if (!this.abilities.flying) {
            this.noGravity = false;
            return;
        }

        this.isGettingKnockback = false;

        const isSprinting = input.isActionDown("sprint");
        let speed = isSprinting
            ? this.abilities.walkSpeed * 1.3 * BLOCK_SIZE
            : this.abilities.walkSpeed * BLOCK_SIZE;

        this.noGravity = true;

        this.velocity.y = 0;

        if (input.isActionDown("moveUp") || input.isActionDown("jump"))
            this.velocity.y = -4.7 * BLOCK_SIZE;
        else if (input.isActionDown("moveDown"))
            this.velocity.y = 4.7 * BLOCK_SIZE;

        if (!input.isActionDown("moveRight") && !input.isActionDown("moveLeft"))
            return;

        this.targetVelocity.x = input.isActionDown("moveRight")
            ? speed * 2.52
            : -speed * 2.52;
    }

    applyDeltaTime() {
        this.velocity.x *= runtime.deltaTime;
        this.velocity.y *= runtime.deltaTime;
    }
}

export const skinData = localStorage.getItem("playerSkin");
export const skinModel =
    localStorage.getItem("playerSkinModel") === "alex" ? "alex" : "steve";

// Foreground limb = OUTER face of the camera-facing side
// Background limb = INNER face of the far side
// Note: on the left limbs, west=inner and east=outer (mirrored vs the right limbs)
export function getPlayerLimbCrops(model, facingLeft = false, legacy = false) {
    const slim = model === "alex" && !legacy;

    const rightArmOuter = { x: 40, y: 20, width: 4, height: 12 };
    const rightArmInner = {
        x: slim ? 47 : 48,
        y: 20,
        width: 4,
        height: 12,
    };
    const leftArmInner = { x: 32, y: 52, width: 4, height: 12 };
    const leftArmOuter = {
        x: slim ? 39 : 40,
        y: 52,
        width: 4,
        height: 12,
    };

    const rightLegOuter = { x: 0, y: 20, width: 4, height: 12 };
    const rightLegInner = { x: 8, y: 20, width: 4, height: 12 };
    const leftLegInner = { x: 16, y: 52, width: 4, height: 12 };
    const leftLegOuter = { x: 24, y: 52, width: 4, height: 12 };

    // Legacy 64x32 skins only have the right-limb region
    if (legacy) {
        return {
            leftArm: rightArmOuter,
            rightArm: rightArmInner,
            leftLeg: rightLegOuter,
            rightLeg: rightLegInner,
        };
    }

    if (facingLeft) {
        return {
            leftArm: leftArmOuter,
            rightArm: rightArmInner,
            leftLeg: leftLegOuter,
            rightLeg: rightLegInner,
        };
    }

    return {
        leftArm: rightArmOuter,
        rightArm: leftArmInner,
        leftLeg: rightLegOuter,
        rightLeg: leftLegInner,
    };
}

export function getPlayerArmCrops(model) {
    const crops = getPlayerLimbCrops(model, false, false);
    return { leftArm: crops.leftArm, rightArm: crops.rightArm };
}

export function createPlayerBody() {
    const limbs = getPlayerLimbCrops(skinModel);
    return new Body({
        sprite: skinData || "player/steve",
        parts: {
            head: new BodyPart({
                spriteCrop: { x: 0, y: 8, width: 8, height: 8 },
                offset: { x: -6, y: 0 },
                rotationOrigin: { x: 12, y: 32 },
                zIndex: 1,
                eyes: true,
                skipLookFlip: true,
            }),
            torso: new BodyPart({
                spriteCrop: { x: 16, y: 20, width: 4, height: 12 },
                offset: { x: 0, y: 34 },
            }),
            leftArm: new BodyPart({
                offset: { x: 0, y: 34 },
                spriteCrop: limbs.leftArm,
                zIndex: 2,
                rotationOrigin: { x: 5, y: 4 },
                sways: true,
                mainArm: true,
                swayPhase: Math.PI,
                holdOrigin: { x: 6, y: 35 },
            }),
            rightArm: new BodyPart({
                spriteCrop: limbs.rightArm,
                offset: { x: 0, y: 34 },
                rotationOrigin: { x: 5, y: 4 },
                zIndex: -2,
                sways: true,
                swayPhase: Math.PI,
            }),
            leftLeg: new BodyPart({
                spriteCrop: limbs.leftLeg,
                offset: { x: 0, y: 74 },
                rotationOrigin: { x: 5, y: 0 },
                zIndex: 1,
                sways: true,
            }),
            rightLeg: new BodyPart({
                spriteCrop: limbs.rightLeg,
                offset: { x: 0, y: 74 },
                rotationOrigin: { x: 5, y: 0 },
                zIndex: -1,
                sways: true,
            }),
        },
    });
}

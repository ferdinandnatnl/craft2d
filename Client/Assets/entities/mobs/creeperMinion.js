import { Entity, EntityTypes } from "../../game/entity.js";
import { Body, BodyPart } from "../../game/body.js";
import { Creeper, createCreeperBody } from "./creeper.js";
import { Vector2 } from "../../utils/classes.js";
import { BLOCK_SIZE, TICK_SPEED, dayNightSpeed, multiplayer } from "../../utils/globals.js";
import { runtime } from "../../utils/runtime.js";
import { playPositionalSound } from "../../game/sounds.js";

// dayNightCycle runs from 1 to 7.5: 3.5 daylight units at half speed and
// 3 night units at full speed. The egg takes four complete in-game days.
const HATCH_SECONDS = 4 * (3.5 / (dayNightSpeed / 2) +
    3 / dayNightSpeed) / TICK_SPEED;

export class CreeperMinion extends Creeper {
    static spawnSize = Object.freeze({ width: 0.45, height: 0.9 });

    constructor(world, options = {}) {
        const body = options.body ?? createCreeperBody();
        body.setSprite("mutantbeasts/creeper_minion");
        body.renderScale = 0.6;
        super(world, { ...options, health: options.health ?? 8, body });
        this.name = "Creeper Minion";
        this.entityTypeName = "CreeperMinion";
        this.isCreeperMinion = true;
        this.hitbox = new Vector2(0.45 * BLOCK_SIZE, 0.9 * BLOCK_SIZE);
        this.ownerUUID = options.ownerUUID ?? null;
        this.powered = options.powered ?? false;
        this.tamed = options.tamed ?? false;
        this.sitting = options.sitting ?? false;
        this.isHostile = !this.tamed;
        this.despawn = !this.tamed;
        this.speed = 1.2;
        this.target = null;
    }

    update() {
        if (!this.tamed) return super.update();
        this.updateEntity();
        this.attackCooldownLogic();
        if (this.primed) return;
        if (this.sitting) {
            this.targetVelocity.x = 0;
            return;
        }
        const owner = this.world.entities.find(entity => entity.UUID === this.ownerUUID);
        let target = null;
        let nearest = 8 * BLOCK_SIZE;
        for (const entity of this.world.entities) {
            if (entity === this || entity.dimension !== this.dimension ||
                entity.type !== EntityTypes.Mob || !entity.isHostile ||
                entity.health <= 0) continue;
            const distance = Vector2.Distance(this.position, entity.position);
            if (distance >= nearest) continue;
            target = entity;
            nearest = distance;
        }
        this.target = target;
        const destination = target || owner;
        if (!destination) return;
        const dx = destination.position.x - this.position.x;
        if (Math.abs(dx) > BLOCK_SIZE) {
            this.direction = Math.sign(dx);
            this.targetVelocity.x = this.direction * this.speed * BLOCK_SIZE;
            if (this.grounded && this.velocity.x === 0) this.jump();
        } else this.targetVelocity.x = 0;
        if (target && nearest < 1.5 * BLOCK_SIZE) {
            this.primed = true;
            this.fuse = this.fuseMax;
        }
    }

    explode() {
        const owner = this.world.entities.find(entity => entity.UUID === this.ownerUUID);
        this.world.createExplosion(new Vector2(
            this.position.x + this.hitbox.x / 2,
            this.position.y + this.hitbox.y / 2,
        ), {
            radius: (this.powered ? 3.5 : 2.5) * BLOCK_SIZE,
            damage: this.powered ? 16 : 10,
            power: this.powered ? 16 : 10,
            excludeEntity: this,
            protectedEntity: this.tamed ? owner : null,
            sourceEntity: this,
            destroyTerrain: runtime.GAMERULES.doMobGriefing && !this.tamed,
        });
    }

    interact(player) {
        if (this.tamed && player.UUID === this.ownerUUID) {
            this.sitting = !this.sitting;
            this.targetVelocity.x = 0;
        }
    }
}

export class CreeperMinionEgg extends Entity {
    constructor(world, options = {}) {
        super(world, {
            ...options,
            name: "Creeper Minion Egg",
            hitbox: new Vector2(0.55 * BLOCK_SIZE, 0.65 * BLOCK_SIZE),
            body: new Body({
                sprite: "mutantbeasts/creeper_minion_egg",
                parts: {
                    shell: new BodyPart({
                        spriteCrop: { x: 6, y: 6, width: 8, height: 8 },
                        offset: { x: 0, y: 0 },
                    }),
                },
            }),
            canBurn: false,
            canDrown: false,
            despawn: false,
        });
        this.entityTypeName = "CreeperMinionEgg";
        this.isCreeperEgg = true;
        this.ownerUUID = options.ownerUUID ?? null;
        this.carriedByUUID = options.carriedByUUID ?? null;
        this.hatchAge = options.hatchAge ?? 0;
        this.powered = options.powered ?? false;
    }

    update() {
        const carrier = this.world.entities.find(entity => entity.UUID === this.carriedByUUID);
        if (carrier && carrier.dimension === this.dimension) {
            this.position.x = carrier.position.x +
                (carrier.hitbox.x - this.hitbox.x) / 2;
            this.position.y = carrier.position.y - this.hitbox.y * 0.8;
            this.velocity.x = this.velocity.y = 0;
        } else {
            this.carriedByUUID = null;
            this.updateEntity();
        }
        this.hatchAge += runtime.deltaTime;
        if (this.hatchAge < HATCH_SECONDS) return;
        const chunk = this.world.getChunkForX(this.position.x, this.dimension);
        const minion = this.world.summonEntity(CreeperMinion,
            new Vector2(this.position.x, this.position.y - 0.25 * BLOCK_SIZE),
            { ownerUUID: this.ownerUUID, tamed: true, powered: this.powered,
                myChunkX: chunk?.x ?? null },
            multiplayer);
        minion.dimension = this.dimension;
        if (chunk && !chunk.entities.includes(minion)) chunk.entities.push(minion);
        playPositionalSound(this.position, "mobs/mutant_creeper/egg_hatch.ogg");
        this.world.removeEntity(this, multiplayer);
    }

    tickUpdate() { this.entityTickUpdate(); }

    interact(player) {
        if (this.ownerUUID && player.UUID !== this.ownerUUID) return;
        if (!this.ownerUUID) this.ownerUUID = player.UUID;
        this.carriedByUUID = this.carriedByUUID === player.UUID ? null : player.UUID;
    }

    hitByExplosion(damage) {
        this.hatchAge += Math.max(0, damage) * 4;
        return true;
    }
}

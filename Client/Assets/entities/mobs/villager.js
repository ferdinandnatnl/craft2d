import { AI, Mob } from "../mob.js";
import { Body, BodyPart } from "../../game/body.js";
import { runtime } from "../../utils/runtime.js";
import { Vector2 } from "../../utils/classes.js";
import { BLOCK_SIZE } from "../../utils/globals.js";

export class Villager extends Mob {
    static spawnSize = Object.freeze({ width: 0.6, height: 1.95 });

    constructor(world, {
        UUID,
        health = 20,
        noAi = false,
        position = new Vector2(),
        invulnerable = false,
        myChunkX = 0,
        homeX = position.x,
        body = createVillagerBody(),
    } = {}) {
        super(world, {
            UUID,
            name: "Villager",
            health,
            noAi,
            position,
            invulnerable,
            myChunkX,
            body,
            hitbox: new Vector2(0.6 * BLOCK_SIZE, 1.95 * BLOCK_SIZE),
            ai: AI.PassiveSimple,
            speed: 1,
            stepSize: 0.4,
            despawn: false,
        });
        this.homeX = homeX;
    }

    update() {
        this.updateEntity();
        if (!this.noAi) this.aiUpdate();
    }

    tickUpdate() {
        this.entityTickUpdate();
    }

    moveToRandomX() {
        super.moveToRandomX();
        if (Math.abs(this.position.x + this.direction * BLOCK_SIZE - this.homeX) >
            1.7 * BLOCK_SIZE) {
            this.direction = this.position.x < this.homeX ? 1 : -1;
        }
    }

    passiveWander() {
        this.timeLastMoved += runtime.deltaTime;
        if (this.timeLastMoved >= this.randomMoveTime) {
            if (!this.moving) this.moveToRandomX();
            else {
                this.moving = false;
                this.resetMoveTime();
            }
        }

        const distance = Math.abs(this.position.x - this.homeX);
        const nextDistance = Math.abs(
            this.position.x + this.direction * BLOCK_SIZE * 0.25 - this.homeX,
        );
        if (this.moving && (
            (nextDistance > 1.7 * BLOCK_SIZE && nextDistance > distance) ||
            (this.timeLastMoved > 0.2 && this.velocity.x === 0)
        )) {
            this.moving = false;
            this.resetMoveTime();
        }
        this.targetVelocity.x = this.moving && this.grounded
            ? this.direction * this.speed * BLOCK_SIZE : 0;
    }

    hit(damage, hitfromX = 0, kb = 0) {
        if (!this.health || !this.damage(damage)) return;
        this.knockBack(hitfromX, kb);
    }

    dieEvent() {
        this.world.removeEntity(this);
    }

    interact(player, item) {}
}

export function createVillagerBody() {
    return new Body({
        sprite: "villager/farmer",
        parts: {
            leftLeg: new BodyPart({
                spriteCrop: { x: 4, y: 26, width: 4, height: 12 },
                offset: { x: 0, y: 80 },
                zIndex: -1,
                sways: true,
                swayPhase: Math.PI,
            }),
            rightLeg: new BodyPart({
                spriteCrop: { x: 4, y: 26, width: 4, height: 12 },
                offset: { x: 16, y: 80 },
                zIndex: -1,
                sways: true,
            }),
            torso: new BodyPart({
                spriteCrop: { x: 6, y: 44, width: 8, height: 18 },
                offset: { x: 0, y: 39 },
            }),
            arms: new BodyPart({
                spriteCrop: { x: 44, y: 42, width: 8, height: 4 },
                offset: { x: 0, y: 54 },
                zIndex: 2,
            }),
            head: new BodyPart({
                spriteCrop: { x: 8, y: 8, width: 8, height: 10 },
                offset: { x: -6, y: 0 },
                zIndex: 3,
            }),
            nose: new BodyPart({
                spriteCrop: { x: 26, y: 2, width: 2, height: 4 },
                offset: { x: 3, y: 17 },
                zIndex: 4,
            }),
        },
    });
}

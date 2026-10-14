import { Blocks } from "@2dcraft.com/shared/blocks.js";
import { Entity, EntityTypes } from "../game/entity.js";
import { Vector2, uuidv4 } from "../utils/classes.js";
import { BLOCK_SIZE } from "../utils/globals.js";
import { runtime } from "../utils/runtime.js";
import { getSpriteUrl } from "../utils/texturePackLoader.js";

const BOAT_WIDTH = 1.8;
const BOAT_HEIGHT = 0.55;
let boatSpriteSource = null;
let boatSprite = null;

function getBoatSprite() {
    const source = getSpriteUrl("items/boat");
    if (source !== boatSpriteSource) {
        boatSpriteSource = source;
        boatSprite = new Image();
        boatSprite.src = source;
    }
    return boatSprite;
}

export class Boat extends Entity {
    constructor(
        world,
        {
            UUID = uuidv4(),
            position = new Vector2(),
            surfaceY = position.y + BLOCK_SIZE * 0.25,
            dimension,
            direction = 1,
        } = {},
    ) {
        super(world, {
            UUID,
            name: "Boat",
            position,
            hitbox: new Vector2(BOAT_WIDTH * BLOCK_SIZE, BOAT_HEIGHT * BLOCK_SIZE),
            type: EntityTypes.Entity,
            noGravity: true,
            despawn: false,
            canSwim: false,
            direction,
        });

        this.isBoat = true;
        this.surfaceY = surfaceY;
        if (Number.isInteger(dimension)) this.dimension = dimension;
        this.passenger = null;
        this.paddlePhase = 0;
        this.bobPhase = 0;
        this.maxSpeed = BLOCK_SIZE * 8;
    }

    getWaterSurfaceAt(worldX, nearY = this.surfaceY) {
        if (!this.world || !Number.isFinite(worldX) || !Number.isFinite(nearY)) {
            return null;
        }

        const baseY = Math.floor(nearY / BLOCK_SIZE) * BLOCK_SIZE;
        let nearestSurface = null;
        let nearestDistance = Infinity;

        for (let row = -1; row <= 1; row++) {
            const block = this.world.getBlockAtWorldPosition(
                worldX,
                baseY + row * BLOCK_SIZE,
                false,
                this.dimension,
            );
            if (!block || block.blockType !== Blocks.Water) continue;

            const surface = block.transform.position.y +
                (Number.isFinite(block.cutoff) ? block.cutoff : 0) * BLOCK_SIZE;
            const distance = Math.abs(surface - nearY);
            if (distance < nearestDistance) {
                nearestSurface = surface;
                nearestDistance = distance;
            }
        }

        return nearestDistance <= BLOCK_SIZE * 1.1 ? nearestSurface : null;
    }

    getWaterSurfacesAt(x, nearY = this.surfaceY) {
        const inset = BLOCK_SIZE * 0.12;
        const sampleX = [
            x + inset,
            x + this.hitbox.x / 2,
            x + this.hitbox.x - inset,
        ];
        const surfaces = sampleX.map((worldX) =>
            this.getWaterSurfaceAt(worldX, nearY),
        );

        if (surfaces.some((surface) => surface === null)) return null;
        if (Math.max(...surfaces) - Math.min(...surfaces) > BLOCK_SIZE * 0.6) {
            return null;
        }

        return surfaces;
    }

    alignToWater(surfaces = this.getWaterSurfacesAt(this.position.x)) {
        if (!surfaces) return false;
        this.surfaceY = surfaces.reduce((sum, surface) => sum + surface, 0) /
            surfaces.length;
        this.position.y = this.surfaceY - BLOCK_SIZE * 0.25;
        return true;
    }

    ride(player, direction, sprint, deltaTime) {
        if (player !== this.passenger || !player.isLocal()) return;
        deltaTime = Math.max(0, Math.min(deltaTime, 0.1));

        const targetSpeed = direction * this.maxSpeed * (sprint ? 1.15 : 1);
        const blend = 1 - Math.exp(-5 * Math.max(0, deltaTime));
        this.velocity.x += (targetSpeed - this.velocity.x) * blend;

        const nextX = this.position.x + this.velocity.x * deltaTime;
        const nextSurfaces = this.getWaterSurfacesAt(nextX);
        if (nextSurfaces) {
            this.position.x = nextX;
            this.alignToWater(nextSurfaces);
        } else {
            this.velocity.x = 0;
        }

        if (Math.abs(this.velocity.x) > 1) {
            this.direction = Math.sign(this.velocity.x);
            player.direction = this.direction;
        }

        this.paddlePhase = (this.paddlePhase + deltaTime *
            (Math.abs(this.velocity.x) > 5 ? 8 : 1.5)) % (Math.PI * 2);
        this.bobPhase = (this.bobPhase + deltaTime * 2) % (Math.PI * 2);
        player.velocity = new Vector2();
        player.targetVelocity = new Vector2();
        player.position.x = this.position.x + (this.hitbox.x - player.hitbox.x) / 2;
        player.position.y = this.surfaceY - player.hitbox.y + BLOCK_SIZE * 0.35;
    }

    mount(player) {
        if (!player?.isLocal() || (this.passenger && this.passenger !== player)) return;
        player.mountBoat(this);
    }

    dismount(player, jump = false) {
        if (this.passenger !== player) return;
        this.passenger = null;
        player.dismountBoat(this, jump);
    }

    interact(player) {
        if (!player?.isLocal()) return;
        if (this.passenger === player) {
            this.dismount(player);
            return;
        }

        if (this.passenger) return;
        const distance = Vector2.Distance(
            new Vector2(player.position.x + player.hitbox.x / 2, player.position.y + player.hitbox.y / 2),
            new Vector2(this.position.x + this.hitbox.x / 2, this.position.y + this.hitbox.y / 2),
        );
        if (distance > BLOCK_SIZE * 6) return;
        this.mount(player);
    }

    update() {
        if (!this.passenger) {
            const rider = this.world?.entities?.find((entity) =>
                entity.boatUUID === this.UUID,
            );
            if (rider) {
                this.passenger = rider;
                rider.boat = this;
            }
        }

        if (this.passenger?.isLocal()) return;

        if (this.passenger) {
            const passenger = this.passenger;
            const oldX = this.position.x;
            this.position.x = passenger.position.x +
                passenger.hitbox.x / 2 - this.hitbox.x / 2;
            this.surfaceY = passenger.position.y + passenger.hitbox.y -
                BLOCK_SIZE * 0.35;
            this.position.y = this.surfaceY - BLOCK_SIZE * 0.25;
            const deltaX = this.position.x - oldX;
            if (deltaX !== 0) this.direction = Math.sign(deltaX);
            this.velocity.x = deltaX / Math.max(runtimeDeltaTime(), 0.001);
        } else {
            const deltaTime = runtimeDeltaTime();
            this.velocity.x *= Math.exp(-5 * deltaTime);
            if (Math.abs(this.velocity.x) < 1) this.velocity.x = 0;
            const nextX = this.position.x + this.velocity.x * deltaTime;
            const surfaces = this.getWaterSurfacesAt(nextX);
            if (surfaces) {
                this.position.x = nextX;
                this.alignToWater(surfaces);
            } else {
                this.velocity.x = 0;
                this.alignToWater();
            }
        }

        const deltaTime = runtimeDeltaTime();
        this.bobPhase = (this.bobPhase + deltaTime * 2) % (Math.PI * 2);
        this.paddlePhase = (this.paddlePhase + deltaTime *
            (Math.abs(this.velocity.x) > 5 ? 8 : 1.5)) % (Math.PI * 2);
    }

    hit() {}

    draw(ctx, viewCamera = { x: 0, y: 0 }) {
        const unit = BLOCK_SIZE;
        const width = Math.min(this.hitbox.x, unit * 1.8);
        const height = unit * 0.45;
        const x = this.position.x - (viewCamera?.x || 0) +
            (this.hitbox.x - width) / 2;
        const y = this.position.y + unit * 0.05 - (viewCamera?.y || 0) +
            Math.sin(this.bobPhase) * unit * 0.025;
        const sprite = getBoatSprite();
        if (!sprite?.complete || !sprite.naturalWidth) return;

        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sprite, Math.round(x), Math.round(y), width, height);
        ctx.restore();
    }
}

function runtimeDeltaTime() {
    return Math.max(0, Math.min(runtime.deltaTime || 0, 0.1));
}

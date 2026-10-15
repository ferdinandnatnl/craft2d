import { getItemSpritePath } from "@2dcraft.com/shared/item.js";
import { EntityTypes } from "../../game/entity.js";
import { BLOCK_SIZE, multiplayer } from "../../utils/globals.js";
import { Vector2 } from "../../utils/classes.js";
import { runtime } from "../../utils/runtime.js";
import { getSpriteUrl } from "../../utils/texturePackLoader.js";
import { Sounds, playRandomSoundFromArray } from "../../game/sounds.js";
import { Projectile } from "../projectile.js";

function crossesTarget(projectile, target, previous) {
    const currentX = projectile.position.x + projectile.hitbox.x / 2;
    const currentY = projectile.position.y + projectile.hitbox.y / 2;
    const dx = currentX - previous.x;
    const dy = currentY - previous.y;
    const distance = Math.max(Math.abs(dx), Math.abs(dy));
    const steps = Math.max(1, Math.min(64, Math.ceil(distance / (BLOCK_SIZE / 4))));
    const reach = Math.max(projectile.hitbox.x, projectile.hitbox.y) / 2;

    for (let step = 0; step <= steps; step++) {
        const x = previous.x + dx * step / steps;
        const y = previous.y + dy * step / steps;
        if (
            x + reach >= target.position.x &&
            x - reach <= target.position.x + target.hitbox.x &&
            y + reach >= target.position.y &&
            y - reach <= target.position.y + target.hitbox.y
        ) return true;
    }
    return false;
}

export class SpearProjectile extends Projectile {
    constructor(world, {
        position = new Vector2(),
        velocity = new Vector2(),
        damage = 2,
        ownerUUID = null,
        itemId = null,
        recoveryItemId = null,
        itemProps = {},
        maxRange = null,
        dimension,
    } = {}) {
        const spritePath = itemId == null
            ? "items/spear_iron.svg"
            : `items/${getItemSpritePath(itemId)}`;
        super(world, {
            position,
            sprite: getSpriteUrl(spritePath),
            scale: 1,
            velocity,
            drag: 0,
            damage,
            hitbox: new Vector2(BLOCK_SIZE * 1.5, BLOCK_SIZE * 0.25),
            props: { noGravity: false, canDrown: false, dimension },
        });

        this.entityTypeName = "SpearProjectile";
        this.isSpearProjectile = true;
        this.itemId = itemId;
        this.recoveryItemId = recoveryItemId;
        this.itemProps = itemProps;
        this.ownerUUID = ownerUUID;
        this.origin = new Vector2(
            position.x + this.hitbox.x / 2,
            position.y + this.hitbox.y / 2,
        );
        this.maxRange = Number.isFinite(maxRange)
            ? Math.max(BLOCK_SIZE, maxRange)
            : 5 * BLOCK_SIZE;
        this.expiresAt = (runtime.passedTime || 0) + 1.5;
        this.reelSpeed = Math.max(BLOCK_SIZE * 8, Math.hypot(velocity.x, velocity.y));
        this.flightAngle = 0;
        this.rotation = 0;
        this.retracting = false;
        this.finished = false;
        this.harpoonedTarget = null;
        this.harpoonOffset = null;
        this.harpoonDamage = null;
        this.harpoonHitFromX = null;
    }

    draw(ctx, viewCamera = { x: 0, y: 0 }) {
        const cameraX = viewCamera?.x ?? 0;
        const cameraY = viewCamera?.y ?? 0;
        const centerX = this.position.x + this.hitbox.x / 2 - cameraX;
        const centerY = this.position.y + this.hitbox.y / 2 - cameraY;
        const angle = this.rotation * Math.PI / 180;
        const tailX = centerX - Math.cos(angle) * this.hitbox.x * 0.48;
        const tailY = centerY - Math.sin(angle) * this.hitbox.x * 0.48;
        const owner = this.world.entities.find((entity) =>
            entity.UUID === this.ownerUUID,
        );

        if (owner && owner.dimension === this.dimension) {
            const direction = owner.direction || 1;
            const startX = owner.position.x + owner.hitbox.x / 2 +
                direction * BLOCK_SIZE * 0.18 - cameraX;
            const startY = owner.position.y + owner.hitbox.y * 0.52 - cameraY;
            const sway = this.retracting
                ? 0
                : Math.sin((runtime.passedTime || 0) * 11) * BLOCK_SIZE * 0.025;
            const sag = this.retracting
                ? 0
                : Math.min(BLOCK_SIZE * 0.18,
                    Math.hypot(tailX - startX, tailY - startY) * 0.08);

            ctx.save();
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.quadraticCurveTo(
                (startX + tailX) / 2 + sway,
                (startY + tailY) / 2 + sag,
                tailX,
                tailY,
            );
            ctx.strokeStyle = "#241d16";
            ctx.lineWidth = 2.4;
            ctx.stroke();
            ctx.strokeStyle = "#b39a70";
            ctx.lineWidth = 0.9;
            ctx.stroke();
            ctx.restore();
        }

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(angle);
        if (this.img?.complete && this.img.naturalWidth) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(
                this.img,
                -this.hitbox.x / 2,
                -this.hitbox.y / 2,
                this.hitbox.x,
                this.hitbox.y,
            );
        } else {
            const length = this.hitbox.x;
            const thickness = Math.max(2, this.hitbox.y * 0.24);
            ctx.fillStyle = "#765235";
            ctx.fillRect(-length * 0.48, -thickness / 2, length * 0.78, thickness);
            ctx.fillStyle = "#c5cdd0";
            ctx.beginPath();
            ctx.moveTo(length * 0.5, 0);
            ctx.lineTo(length * 0.28, -this.hitbox.y * 0.45);
            ctx.lineTo(length * 0.2, 0);
            ctx.lineTo(length * 0.28, this.hitbox.y * 0.45);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    update() {
        const owner = this.world.entities.find((entity) =>
            entity.UUID === this.ownerUUID,
        );
        if (this.retracting) {
            this.retractToOwner(owner);
            return;
        }

        const previous = {
            x: this.position.x + this.hitbox.x / 2,
            y: this.position.y + this.hitbox.y / 2,
        };
        this.updateEntity();
        this.flightAngle = Math.atan2(-this.velocity.y, this.velocity.x);
        this.rotation = -this.flightAngle * 180 / Math.PI;

        const target = this.world.entities.find((entity) => {
            const remoteTargetInRange = !multiplayer || this.world.isWorldAuthority ||
                !entity.multiplayerWorldEntity || (owner && Math.hypot(
                    owner.position.x + owner.hitbox.x / 2 -
                        (entity.position.x + entity.hitbox.x / 2),
                    owner.position.y + owner.hitbox.y / 2 -
                        (entity.position.y + entity.hitbox.y / 2),
                ) <= this.maxRange);
            return entity !== this &&
                entity.UUID !== this.ownerUUID &&
                entity.dimension === this.dimension &&
                entity.type === EntityTypes.Mob &&
                entity.isAquatic && entity.name !== "Squid" &&
                Number.isFinite(entity.health) &&
                entity.health > 0 &&
                remoteTargetInRange &&
                crossesTarget(this, entity, previous);
        });

        if (target) {
            const hitfromX = this.position.x + this.hitbox.x / 2;
            playRandomSoundFromArray({
                array: Sounds.Water_Enter,
                positional: true,
                origin: target.position,
                range: 10,
                volume: 0.55,
            });
            if (multiplayer && target.multiplayerWorldEntity && !this.world.isWorldAuthority) {
                runtime.server?.send({
                    type: "mobHit",
                    sender: this.ownerUUID,
                    message: {
                        targetUUID: target.UUID,
                        damage: this.damage,
                        hitfromX,
                        knockback: 2,
                        weaponItemId: this.itemId,
                    },
                });
            } else if (!target.invulnerable) {
                this.beginRetraction(target);
                return;
            }
            this.beginRetraction();
            return;
        }

        const traveled = Math.hypot(
            this.position.x + this.hitbox.x / 2 - this.origin.x,
            this.position.y + this.hitbox.y / 2 - this.origin.y,
        );
        if (
            this.wasColliding ||
            traveled >= this.maxRange ||
            runtime.passedTime >= this.expiresAt
        ) {
            this.beginRetraction();
        }
    }

    beginRetraction(target = null) {
        if (this.retracting) return;
        this.retracting = true;
        this.harpoonedTarget = target;
        this.harpoonOffset = target
            ? {
                x: target.position.x - this.position.x,
                y: target.position.y - this.position.y,
            }
            : null;
        if (target) {
            this.harpoonDamage = this.damage;
            this.harpoonHitFromX = this.position.x + this.hitbox.x / 2;
            target.isBeingHarpooned = true;
            target.velocity.x = 0;
            target.velocity.y = 0;
        }
        this.velocity.x = 0;
        this.velocity.y = 0;
        this.wasColliding = false;
    }

    retractToOwner(owner) {
        if (!owner || owner.isDead || owner.dimension !== this.dimension) {
            if (this.harpoonedTarget) this.harpoonedTarget.isBeingHarpooned = false;
            this.dieEvent();
            return;
        }

        const direction = owner.direction || 1;
        const handX = owner.position.x + owner.hitbox.x / 2 +
            direction * BLOCK_SIZE * 0.18;
        const handY = owner.position.y + owner.hitbox.y * 0.52;
        const centerX = this.position.x + this.hitbox.x / 2;
        const centerY = this.position.y + this.hitbox.y / 2;
        const dx = handX - centerX;
        const dy = handY - centerY;
        const distance = Math.hypot(dx, dy);
        const target = this.harpoonedTarget;

        if (distance <= BLOCK_SIZE * 0.35) {
            this.position.x = handX - this.hitbox.x / 2;
            this.position.y = handY - this.hitbox.y / 2;
            if (target && target.health > 0) {
                target.position.x = this.position.x + this.harpoonOffset.x;
                target.position.y = this.position.y + this.harpoonOffset.y;
                target.isBeingHarpooned = false;
                const previousHealth = target.health;
                target.hit(
                    this.harpoonDamage,
                    this.harpoonHitFromX,
                    2,
                    undefined,
                    owner,
                );
                if (previousHealth > 0 && target.health <= 0 && owner.isLocal?.()) {
                    owner.gainExperienceLevel?.(1);
                }
            }
            this.dieEvent();
            return;
        }

        const deltaTime = Math.min(runtime.deltaTime || 0.05, 0.1);
        const step = Math.min(distance, this.reelSpeed * deltaTime);
        this.position.x += dx / distance * step;
        this.position.y += dy / distance * step;
        if (target && target.health > 0) {
            target.position.x = this.position.x + this.harpoonOffset.x;
            target.position.y = this.position.y + this.harpoonOffset.y;
            target.velocity.x = 0;
            target.velocity.y = 0;
        }
        this.rotation = Math.atan2(dy, dx) * 180 / Math.PI;
    }

    tickUpdate() {
        this.entityTickUpdate();
    }

    dieEvent() {
        if (this.finished) return;
        this.finished = true;
        if (this.harpoonedTarget && this.harpoonedTarget.health > 0) {
            this.harpoonedTarget.isBeingHarpooned = false;
        }
        if (this.recoveryItemId != null) {
            this.world.spawnDrop(
                new Vector2(
                    this.position.x + this.hitbox.x / 2,
                    this.position.y + this.hitbox.y / 2,
                ),
                { itemId: this.recoveryItemId, count: 1, props: this.itemProps },
                this.dimension,
            );
        }
        this.world.removeEntity(this);
    }
}

import { runtime } from "../utils/runtime.js";
import { getItem, getItemSpritePath } from "@2dcraft.com/shared/item.js";
import { Items } from "@2dcraft.com/shared/items.js";
import { BLOCK_SIZE, ToolType } from "../utils/globals.js";
import { drawImage } from "../utils/renderer.js";
import { getSpriteSize, getSpriteUrl, isEqualToOriginal } from "../utils/texturePackLoader.js";
import { getBlock } from "../world/block.js";
import {
    blendSwimming,
    getBoatPartPitch,
    getSwimPartPitch,
} from "../rendering/entityPose.js";
import { mutantPartPitch } from "../rendering/mutantPose.js";

export class Body {
    constructor({
        position = { x: 0, y: 0 },
        parts = [],
        flipCorrection = 0,
        sprite = "",
        renderScale = 1,
    }) {
        this.position = position;
        this.flipCorrection = flipCorrection;
        this.renderScale = renderScale;
        this.parts = parts;
        this.opacity = 1;
        this.swimAmount = 0;
        this.swimPhase = 0;
        this.boatAmount = 0;
        this.boatPhase = 0;

        this.flashingColor = null;

        this.brightness = 1;

        this.image = new Image();
        this.setSprite(sprite);

        this.sprite = sprite;

        this.initParts();
    }

    setSprite(sprite) {
        this.sprite = sprite;

        this.image.onerror = () => {
            // Missing player skin file — fall back to Steve (ignore mob/other sprites)
            if (!this.sprite.startsWith("player/") || this.sprite === "player/steve") {
                return;
            }
            this.sprite = "player/steve";
            this.image.src = getSpriteUrl(
                "entity/player/steve",
                isEqualToOriginal("entity/player/steve"),
            );
            if (typeof localStorage !== "undefined") {
                localStorage.setItem("playerSkinId", "steve");
                localStorage.removeItem("playerSkin");
                localStorage.setItem("playerSkinModel", "steve");
            }
        };

        const spritePath = "entity/" + sprite;
        this.image.src = getSpriteUrl(
            spritePath,
            isEqualToOriginal(spritePath),
        );
    }

    initParts() {
        // Set the id's of the parts
        for (const partName in this.parts) {
            this.parts[partName].id = partName;
        }
    }

    updatePosition(newPosition) {
        this.position = newPosition;
        for (const partName in this.parts) {
            const part = this.parts[partName];

            // Apply position offset from body position

            // POTENTIAL FIX FOR BLOCK SCALING
            part.position = {
                x: newPosition.x + part.offset.x,
                y: newPosition.y + part.offset.y,
            };
        }
    }

    updateBody(speed, grounded, lookDirection) {
        for (const partName in this.parts) {
            const part = this.parts[partName];

            if (part.sways) {
                part.rotation = part.getSwayRotation(speed, grounded);
            }

            if (part.mainArm) {
                part.updateDirection(lookDirection);
                part.updateSwing();
            }

            if (part.eyes) {
                // Adjust the look direction based on the body and direction
                let adjustedLookDirection = lookDirection;

                // Adjust for flipping logic based on body direction or eyes flip
                if (
                    (!part.skipLookFlip && part.flip) ||
                    lookDirection < -90 ||
                    lookDirection > 90
                ) {
                    adjustedLookDirection = 180 + lookDirection;
                }

                // Normalize adjustedLookDirection to range [-180, 180]
                if (adjustedLookDirection > 180) {
                    adjustedLookDirection -= 360; // Adjust to wrap around
                } else if (adjustedLookDirection < -180) {
                    adjustedLookDirection += 360; // Adjust to wrap around
                }

                // Clamp the adjustedLookDirection to be between -90 and 90 degrees
                let targetRotation = Math.max(
                    -90,
                    Math.min(90, adjustedLookDirection),
                );

                // Smoothly interpolate between current rotation and the adjusted look direction
                const rotationSpeed = 1000 * runtime.deltaTime; // You can adjust this speed to make it smoother or faster

                // Update the rotation towards the target rotation
                part.rotation +=
                    Math.sign(targetRotation - part.rotation) * rotationSpeed;

                // When it's close enough to the target rotation, lock it in
                if (Math.abs(targetRotation - part.rotation) < rotationSpeed) {
                    part.rotation = targetRotation;
                }
            }
        }
    }

    flashColor(color, duration) {
        this.flashingColor = color;
        setTimeout(() => {
            this.flashingColor = null;
        }, duration * 1000);
    }

    updateSwimming(active) {
        const deltaTime = Math.max(0, Math.min(runtime.deltaTime || 0, 0.1));
        this.swimAmount = blendSwimming(this.swimAmount, active, deltaTime);
        if (this.swimAmount > 0) this.swimPhase = (this.swimPhase + deltaTime * 6) % (Math.PI * 2);
    }

    updateBoating(active, moving = false) {
        const deltaTime = Math.max(0, Math.min(runtime.deltaTime || 0, 0.1));
        this.boatAmount = blendSwimming(this.boatAmount, active, deltaTime);
        if (this.boatAmount > 0) {
            this.boatPhase = (this.boatPhase + deltaTime *
                (moving ? 8 : 1.5)) % (Math.PI * 2);
        }
    }

    draw(ctx, direction, lookDirection, holdItem, shieldBlocking = false) {
        const sortedParts = Object.values(this.parts).sort(
            (a, b) => a.zIndex - b.zIndex,
        );

        ctx.save();
        ctx.globalAlpha = this.opacity;
        if (this.renderScale !== 1) {
            ctx.translate(this.position.x, this.position.y);
            ctx.scale(this.renderScale, this.renderScale);
            ctx.translate(-this.position.x, -this.position.y);
        }
        if (this.swimAmount > 0) {
            const centerX = this.position.x + BLOCK_SIZE * 0.2;
            const centerY = this.position.y + BLOCK_SIZE * 0.9;
            ctx.translate(centerX, centerY);
            ctx.rotate(direction * Math.PI / 2 * this.swimAmount);
            ctx.translate(-centerX, -centerY);
        }
        const bendPose = this.bendPose;
        const attackRemaining = (this.mutantAttackPoseUntil || 0) - runtime.passedTime;
        const attackProgress = attackRemaining > 0
            ? 1 - attackRemaining / (this.mutantAttackPoseDuration || 0.4)
            : 0;
        const mutantAttack = attackProgress > 0
            ? Math.sin(Math.min(1, attackProgress) * Math.PI)
            : 0;
        if (bendPose?.lean) {
            const hipX = this.position.x + BLOCK_SIZE * 0.2;
            const hipY = this.position.y + BLOCK_SIZE * 1.1;
            ctx.translate(hipX, hipY);
            ctx.rotate(direction * bendPose.lean);
            ctx.translate(-hipX, -hipY);
        }

        for (const part of sortedParts) {
            part.position = {
                x:
                    this.position.x +
                    (direction < 0
                        ? this.flipCorrection * (BLOCK_SIZE / 64)
                        : 0) +
                    BLOCK_SIZE * (part.offset.x / 64),
                y: this.position.y + BLOCK_SIZE * (part.offset.y / 64),
            };
            let rotation = part.rotation;
            if (this.swimAmount > 0 && !part.isSwinging) {
                const side = part.zIndex < 0 ? -1 : 1;
                const swimRotation = getSwimPartPitch(part.id, this.swimPhase) * 180 / Math.PI * direction * side;
                rotation += (swimRotation - rotation) * this.swimAmount;
            }
            if (this.boatAmount > 0 && !part.isSwinging) {
                const side = part.zIndex < 0 ? -1 : 1;
                const boatRotation = getBoatPartPitch(part.id, this.boatPhase) *
                    180 / Math.PI * direction * side;
                rotation += (boatRotation - rotation) * this.boatAmount;
            }
            const side = part.zIndex < 0 ? -1 : 1;
            if (this.mutantModelType) {
                rotation = mutantPartPitch(
                    this.mutantModelType, part.id, this.mutantWalkPhase || 0,
                    (this.mutantWalkAmount || 0) * (1 - mutantAttack),
                    mutantAttack, runtime.passedTime,
                ) * 180 / Math.PI * direction;
            }
            if (bendPose?.pitch[part.id] != null) {
                rotation = bendPose.pitch[part.id] * 180 / Math.PI * direction * side;
            }
            part.shieldBlocking = shieldBlocking;
            part.draw(
                ctx,
                lookDirection,
                holdItem,
                this.flashingColor,
                this.brightness,
                this.image,
                direction,
                rotation,
                bendPose?.bend[part.id] * direction * side || 0,
            );
        }

        ctx.restore();
    }

    swing() {
        for (const partName in this.parts) {
            const part = this.parts[partName];

            if (!part.mainArm) continue;

            part.swing();

            return;
        }
    }
}

export class BodyPart {
    constructor({
        spriteCrop = { x: 0, y: 0, width: 16, height: 16 },
        spriteRotation = 0,
        ownSpriteMap = "",
        id = 0,

        position,
        offset = { x: 0, y: 0 },
        zIndex = 0,
        rotationOrigin = { x: 0, y: 0 },
        flipOrigin = { x: 0, y: 0 },
        eyes = false,
        sways = false,
        rotation = 0,
        swaySpeed = 90,
        swayIntensity = 1,
        swayPhase = 0,
        maxSwayAngle = 90,
        mainArm = false,
        holdOrigin = { x: 0, y: 0 },
        flip = false,
        skipLookFlip = false,
    }) {
        this.id = id;
        this.spriteCrop = spriteCrop;
        this.spriteRotation = spriteRotation;
        this.ownSpriteMap = ownSpriteMap;

        this.position = position;
        this.offset = offset;
        this.zIndex = zIndex;

        this.flip = flip;
        this.skipLookFlip = skipLookFlip;
        this.flipOrigin = {
            x: flipOrigin.x * (BLOCK_SIZE / 64),
            y: flipOrigin.y * (BLOCK_SIZE / 64),
        };

        this.rotationOrigin = {
            x: rotationOrigin.x * (BLOCK_SIZE / 64),
            y: rotationOrigin.y * (BLOCK_SIZE / 64),
        };

        this.eyes = eyes;
        this.sways = sways;
        this.rotation = rotation;

        this.swaySpeed = swaySpeed;
        this.swayIntensity = swayIntensity;
        this.swayPhase = swayPhase;
        this.maxSwayAngle = maxSwayAngle;

        this.direction = -1;

        this.mainArm = mainArm;
        this.holdOrigin = holdOrigin;

        this.isSwinging = false;
        this.swingProgress = 0;
        this.swingSpeed = 10;
        this.swingAmplitude = 50;

        this._cropCanvas = null;
        this._cropImage = null;
        this._cropSrc = "";
        this._cropRect = null;
        this._ownSpriteImage = null;
        this._ownSpriteSrc = "";
    }

    getCroppedSprite(image) {
        // Never cache from an unloaded image, or the blank result sticks
        if (!image?.complete || !image.naturalWidth) return null;

        const { x, y, width, height } = this.spriteCrop;
        if (!width || !height) return null;

        const rect = this._cropRect;
        if (
            this._cropCanvas &&
            this._cropImage === image &&
            this._cropSrc === image.src &&
            rect &&
            rect.x === x &&
            rect.y === y &&
            rect.width === width &&
            rect.height === height
        ) {
            return this._cropCanvas;
        }

        if (!this._cropCanvas) {
            this._cropCanvas = document.createElement("canvas");
        }
        this._cropCanvas.width = width;
        this._cropCanvas.height = height;
        this._cropImage = image;
        this._cropSrc = image.src;
        this._cropRect = { x, y, width, height };

        const cropCtx = this._cropCanvas.getContext("2d");
        cropCtx.imageSmoothingEnabled = false;
        cropCtx.clearRect(0, 0, width, height);
        cropCtx.drawImage(image, x, y, width, height, 0, 0, width, height);
        return this._cropCanvas;
    }

    getSwayRotation(speed, grounded) {
        const oscillation = Math.sin(
            Date.now() / (grounded ? this.swaySpeed : this.swaySpeed * 5) +
                this.swayPhase,
        );
        const effectiveSwayAngle = Math.abs(speed / 1000) * this.maxSwayAngle;
        const output =
            oscillation *
            Math.min(effectiveSwayAngle, this.maxSwayAngle) *
            Math.sign(speed);
        return output * this.swayIntensity;
    }

    draw(
        ctx,
        lookDirection,
        holdItem,
        flashingColor,
        brightness = 1,
        image,
        direction,
        rotation = this.rotation,
        bendRotation = 0,
    ) {
        const img = this.loadSprite(image);

        if (!img?.complete || !img.naturalWidth) {
            return;
        }

        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.filter = `brightness(${brightness})`;

        // Step 1: Translate to the initial position
        this.applyTranslation(ctx);

        // Step 2: Apply flip
        let shouldFlip = false;
        // Use exact same flipping logic as before
        if (this.eyes) {
            shouldFlip =
                !this.skipLookFlip &&
                (lookDirection < -90 || lookDirection > 90);
        } else {
            shouldFlip = direction < 0;
        }

        const finalRotation = rotation;

        // Apply the rotation and flipping
        this.applyRotationAndFlip(ctx, finalRotation, shouldFlip);

        // Step 3: Apply spriteRotation around the rotation origin
        ctx.translate(this.rotationOrigin.x, this.rotationOrigin.y);
        ctx.rotate((this.spriteRotation * Math.PI) / 180);
        ctx.translate(-this.rotationOrigin.x, -this.rotationOrigin.y);

        // Render held item and sprite
        this.renderHeldItem(ctx, holdItem, this.direction);

        const spriteSize = getSpriteSize(
            this.ownSpriteMap ? `entity/${this.ownSpriteMap}` : this.sprite,
        );
        const baseSize = spriteSize.width || 16;
        const scaleFactor = BLOCK_SIZE / baseSize;
        const destWidth = Math.round(this.spriteCrop.width * scaleFactor);
        const destHeight = Math.round(this.spriteCrop.height * scaleFactor);
        const destX = Math.round(-destWidth / (scaleFactor * 2));
        const destY = Math.round(-destHeight / (scaleFactor * 2));

        // Draw from a pre-cropped canvas so rotation can't bleed adjacent atlas pixels
        // (e.g. left head face sits under the head-bottom face on the skin sheet).
        const cropped = this.getCroppedSprite(img);
        if (cropped && bendRotation) {
            const tint = (x, y, width, height) => {
                ctx.save();
                if (this.zIndex < 0) {
                    ctx.globalAlpha = 0.3;
                    ctx.fillStyle = "black";
                    ctx.fillRect(x, y, width, height);
                }
                if (flashingColor) {
                    ctx.globalAlpha = 0.4;
                    ctx.fillStyle = flashingColor;
                    ctx.fillRect(x, y, width, height);
                }
                ctx.restore();
            };
            const halfSource = this.spriteCrop.height / 2;
            const halfHeight = destHeight / 2;
            ctx.drawImage(cropped, 0, 0, this.spriteCrop.width, halfSource,
                destX, destY, destWidth, halfHeight);
            tint(destX, destY, destWidth, halfHeight);
            ctx.save();
            ctx.translate(destX + destWidth / 2, destY + halfHeight);
            ctx.rotate(bendRotation);
            ctx.drawImage(cropped, 0, halfSource, this.spriteCrop.width, halfSource,
                -destWidth / 2, 0, destWidth, halfHeight);
            tint(-destWidth / 2, 0, destWidth, halfHeight);
            ctx.restore();
        } else if (cropped) {
            ctx.drawImage(cropped, destX, destY, destWidth, destHeight);
        } else {
            ctx.drawImage(
                img,
                this.spriteCrop.x,
                this.spriteCrop.y,
                this.spriteCrop.width,
                this.spriteCrop.height,
                destX,
                destY,
                destWidth,
                destHeight,
            );
        }

        if (!bendRotation || !cropped) {
            if (this.zIndex < 0) {
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = "black";
                ctx.fillRect(destX, destY, destWidth, destHeight);
            }
            if (flashingColor) {
                ctx.globalAlpha = 0.4;
                ctx.fillStyle = flashingColor;
                ctx.fillRect(destX, destY, destWidth, destHeight);
                ctx.globalAlpha = 1;
            }
        }

        ctx.restore();
    }

    swing() {
        this.isSwinging = true;
        this.swingProgress = 0;
    }

    updateSwing() {
        if (!this.isSwinging) return;

        // Continue with swing logic
        this.swingProgress += this.swingSpeed * runtime.deltaTime;

        let angle =
            Math.sin(this.swingProgress * Math.PI) * this.swingAmplitude;

        angle *= -this.direction;

        this.rotation = angle;

        if (this.swingProgress >= 1) {
            this.isSwinging = false;
            this.rotation = 0;
        }
    }

    updateDirection(lookDirection) {
        if (lookDirection < 90 && lookDirection > -90) {
            this.direction = 1; // Left
        } else {
            this.direction = -1; // Right
        }
    }

    applyRotationAndFlip(ctx, finalRotation, shouldFlip) {
        // Determine if we need to flip the sprite based on 'shouldFlip' and the 'eyes' flag
        const willFlip = shouldFlip && (this.eyes || this.flip);

        if (willFlip || this.zIndex < 0) {
            ctx.scale(willFlip ? -1 : 1, 1);
            // Invert the final rotation if we are flipping
            finalRotation = -finalRotation;
        }

        // Apply rotation
        ctx.rotate((finalRotation * Math.PI) / 180);

        // Set the origin of rotation to either flipOrigin or rotationOrigin
        const origin =
            this.flip && shouldFlip ? this.flipOrigin : this.rotationOrigin;
        ctx.translate(-origin.x, -origin.y);
    }

    loadSprite(image) {
        if (!this.ownSpriteMap) return image;

        const spritePath = `entity/${this.ownSpriteMap}`;
        const spriteUrl = getSpriteUrl(
            spritePath,
            isEqualToOriginal(spritePath),
        );
        if (!this._ownSpriteImage || this._ownSpriteSrc !== spriteUrl) {
            this._ownSpriteImage = new Image();
            this._ownSpriteImage.src = spriteUrl;
            this._ownSpriteSrc = spriteUrl;
        }
        return this._ownSpriteImage;
    }

    applyTranslation(ctx) {
        ctx.translate(this.position.x, this.position.y);
        ctx.translate(this.rotationOrigin.x, this.rotationOrigin.y); // Use precomputed origin
    }

    renderHeldItem(ctx, holdItem, direction) {
        if (!this.mainArm || !holdItem) return;

        const spritePath = this.getHeldItemSpritePath(holdItem);

        if (!spritePath) return;

        const spriteSize = getSpriteSize(spritePath).width;

        const sprite = getSpriteUrl(spritePath);

        const isTool = this.isTool(holdItem);
        const isShield = holdItem.itemId === Items.Shield;
        const blockingShield = isShield && this.shieldBlocking;

        if (!sprite) return;

        ctx.save();

        ctx.translate(this.holdOrigin.x, this.holdOrigin.y);

        ctx.scale(!isTool ? direction : -direction, 1);

        if (blockingShield) {
            ctx.translate(18, -10);
        } else {
            ctx.translate(!isTool ? 10 : -20, 0);
        }

        const rotationAngle = Math.PI / (isTool ? -1.35 : 2);
        ctx.rotate(blockingShield ? 0 : rotationAngle);

        const scale = blockingShield
            ? 1
            : isTool
              ? 0.8
              : isShield
                ? 0.65
                : 0.5;

        let cutoff = 0;
        // If it is a block, get the default draw cutoff
        if (holdItem.blockId) {
            cutoff = getBlock(holdItem.blockId).defaultCutoff;
        }

        drawImage({
            url: sprite,
            x: (-spriteSize * scale * (BLOCK_SIZE / spriteSize)) / 2,
            y: (-spriteSize * scale * (BLOCK_SIZE / spriteSize)) / 2,
            scale: (BLOCK_SIZE / spriteSize) * scale,
            centerX: false,
            sizeY: spriteSize - cutoff * spriteSize,
            crop: {
                x: 0,
                y: 0,
                width: spriteSize,
                height: spriteSize,
            },
        });

        ctx.restore();
    }

    isTool(item) {
        if (item.itemId) {
            if (getItem(item.itemId).toolType != ToolType.Nothing) return true;
        }
        return false;
    }

    getHeldItemSpritePath(holdItem) {
        if (holdItem.blockId) {
            return "blocks/" + getBlock(holdItem.blockId).iconSprite;
        }
        if (holdItem.itemId != null) {
            return "items/" + getItemSpritePath(holdItem.itemId);
        }
        return null;
    }
}

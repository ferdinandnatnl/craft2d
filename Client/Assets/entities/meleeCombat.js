import { ToolType } from "@2dcraft.com/shared/constants.js";

// 1.20.1 presets: data/bettercombat/weapon_attributes/{sword,axe,pickaxe,
// hammer,fist}.json. Hit shapes are projected onto the game's 2D play plane.
const ATTACKS = Object.freeze({
    sword: [
        { hitbox: "HORIZONTAL_PLANE", angle: 120, upswing: 0.5 },
        { hitbox: "HORIZONTAL_PLANE", angle: 120, upswing: 0.5 },
        { hitbox: "FORWARD_BOX", angle: 0, upswing: 0.5 },
    ],
    axe: [
        { hitbox: "HORIZONTAL_PLANE", angle: 90, upswing: 0.5 },
        { hitbox: "HORIZONTAL_PLANE", angle: 90, upswing: 0.5 },
    ],
    pickaxe: [{ hitbox: "VERTICAL_PLANE", angle: 90, upswing: 0.5 }],
    hammer: [{ hitbox: "FORWARD_BOX", angle: 0, upswing: 0.5 }],
    fist: [{ hitbox: "FORWARD_BOX", angle: 0, upswing: 0.5 }],
});

function getAttackSpeed(item) {
    if (Number.isFinite(item?.attackSpeed) && item.attackSpeed > 0) {
        return item.attackSpeed;
    }

    switch (item?.toolType) {
        case ToolType.Sword:
            return 1.6;
        case ToolType.Axe:
            if (item.toolLevel >= 3.5) return 1;
            if (item.toolLevel >= 3) return 0.9;
            return 0.8;
        case ToolType.Pickaxe:
            return 1.2;
        case ToolType.Shovel:
            return 1;
        case ToolType.Hoe:
            return Math.max(1, item.toolLevel || 1);
        case ToolType.Hammer:
            return 0.8;
        default:
            return 4;
    }
}

export function getMeleeWeaponProfile(item) {
    let category = "fist";
    switch (item?.toolType) {
        case ToolType.Sword:
            category = "sword";
            break;
        case ToolType.Axe:
            category = "axe";
            break;
        case ToolType.Pickaxe:
            category = "pickaxe";
            break;
        case ToolType.Hammer:
            category = "hammer";
            break;
        default:
            break;
    }

    const attackRange = {
        fist: 2,
        sword: 2.5,
        axe: 2.5,
        pickaxe: 2.5,
        hammer: 2.75,
    }[category];

    return {
        category,
        attackRange,
        attackSpeed: getAttackSpeed(item),
        attacks: ATTACKS[category],
    };
}

export function getMeleeWeaponKey(item) {
    if (item?.itemId != null) return `item:${item.itemId}`;
    if (item?.blockId != null) return `block:${item.blockId}`;
    return "fist";
}

export function getMeleeAim(origin, target, fallbackDirection = 1) {
    const x = target.x - origin.x;
    const y = target.y - origin.y;
    const length = Math.hypot(x, y);
    if (length <= Number.EPSILON) {
        return { x: fallbackDirection < 0 ? -1 : 1, y: 0 };
    }
    return { x: x / length, y: y / length };
}

function targetBounds(entity, blockSize) {
    const position = entity?.position;
    if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return null;

    const width = Number.isFinite(entity.hitbox?.x) && entity.hitbox.x > 0
        ? entity.hitbox.x
        : blockSize * 0.5;
    const height = Number.isFinite(entity.hitbox?.y) && entity.hitbox.y > 0
        ? entity.hitbox.y
        : blockSize;
    return {
        left: position.x,
        right: position.x + width,
        top: position.y,
        bottom: position.y + height,
    };
}

function normalizeAim(aim) {
    const length = Math.hypot(aim?.x || 0, aim?.y || 0);
    if (length <= Number.EPSILON) return { x: 1, y: 0 };
    return { x: aim.x / length, y: aim.y / length };
}

export function isEntityInMeleeHitbox(
    entity,
    origin,
    aim,
    attack,
    range,
    blockSize,
) {
    const bounds = targetBounds(entity, blockSize);
    if (!bounds || !Number.isFinite(range) || range <= 0) return false;

    const direction = normalizeAim(aim);
    const reach = range * (attack.rangeMultiplier || 1);
    if (attack.hitbox === "FORWARD_BOX") {
        const perpendicular = { x: -direction.y, y: direction.x };
        const halfWidth = blockSize * 0.45;
        const halfLength = reach / 2;
        const attackCenter = {
            x: origin.x + direction.x * halfLength,
            y: origin.y + direction.y * halfLength,
        };
        const targetCenter = {
            x: (bounds.left + bounds.right) / 2,
            y: (bounds.top + bounds.bottom) / 2,
        };
        const centerDelta = {
            x: targetCenter.x - attackCenter.x,
            y: targetCenter.y - attackCenter.y,
        };
        const targetHalfWidth = (bounds.right - bounds.left) / 2;
        const targetHalfHeight = (bounds.bottom - bounds.top) / 2;
        const axes = [
            { x: 1, y: 0 },
            { x: 0, y: 1 },
            direction,
            perpendicular,
        ];

        for (const axis of axes) {
            const distance = Math.abs(
                centerDelta.x * axis.x + centerDelta.y * axis.y,
            );
            const targetRadius = targetHalfWidth * Math.abs(axis.x) +
                targetHalfHeight * Math.abs(axis.y);
            const attackRadius = halfLength * Math.abs(
                direction.x * axis.x + direction.y * axis.y,
            ) + halfWidth * Math.abs(
                perpendicular.x * axis.x + perpendicular.y * axis.y,
            );
            if (distance > targetRadius + attackRadius) return false;
        }
        return true;
    }

    const nearestX = Math.max(bounds.left, Math.min(origin.x, bounds.right));
    const nearestY = Math.max(bounds.top, Math.min(origin.y, bounds.bottom));
    if (Math.hypot(nearestX - origin.x, nearestY - origin.y) > reach) return false;

    const centerX = (bounds.left + bounds.right) / 2;
    const centerY = (bounds.top + bounds.bottom) / 2;
    const dx = centerX - origin.x;
    const dy = centerY - origin.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= Number.EPSILON) return true;

    const radius = Math.hypot(bounds.right - bounds.left, bounds.bottom - bounds.top) / 2;
    const targetAngularRadius = Math.asin(Math.min(1, radius / distance));
    const directionAngle = Math.atan2(direction.y, direction.x);
    const targetAngle = Math.atan2(dy, dx);
    const angleDifference = Math.abs(
        ((targetAngle - directionAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI,
    );
    const halfAngle = (Math.max(0, attack.angle || 0) * Math.PI) / 360;
    return angleDifference <= halfAngle + targetAngularRadius;
}

export function getMeleeTargets({
    attacker,
    entities = [],
    origin,
    aim,
    profile,
    attack,
    blockSize,
    dimension,
}) {
    return entities
        .filter((entity) => {
            if (entity === attacker || entity.dimension !== dimension) return false;
            if (typeof entity.hit !== "function" ||
                !Number.isFinite(entity.health) || entity.health <= 0) return false;
            if (entity.isDead || entity.dyingTime > 0) return false;
            return isEntityInMeleeHitbox(
                entity,
                origin,
                aim,
                attack,
                profile.attackRange * blockSize,
                blockSize,
            );
        })
        .map((entity) => {
            const bounds = targetBounds(entity, blockSize);
            return {
                entity,
                distance: Math.hypot(
                    (bounds.left + bounds.right) / 2 - origin.x,
                    (bounds.top + bounds.bottom) / 2 - origin.y,
                ),
            };
        })
        .sort((a, b) => a.distance - b.distance ||
            String(a.entity.UUID).localeCompare(String(b.entity.UUID)))
        .map(({ entity }) => entity);
}

export class MeleeAttackClock {
    constructor() {
        this.cooldownRemaining = 0;
        this.activeAttack = null;
        this.comboIndex = 0;
        this.weaponKey = null;
    }

    canStart() {
        return this.activeAttack === null && this.cooldownRemaining <= 0;
    }

    peek(profile, weaponKey) {
        const comboIndex = this.weaponKey === weaponKey ? this.comboIndex : 0;
        return profile.attacks[comboIndex % profile.attacks.length];
    }

    start(profile, weaponKey, aim, damage, weaponItem) {
        if (!this.canStart()) return null;
        if (this.weaponKey !== weaponKey) this.comboIndex = 0;

        const attackIndex = this.comboIndex % profile.attacks.length;
        const attack = profile.attacks[attackIndex];
        const cooldown = 1 / Math.max(0.1, profile.attackSpeed);
        this.cooldownRemaining = cooldown;
        this.activeAttack = {
            ...attack,
            aim: { ...normalizeAim(aim) },
            attackRange: profile.attackRange,
            damage,
            weaponKey,
            weaponItem,
            windupRemaining: cooldown * attack.upswing,
        };
        this.weaponKey = weaponKey;
        this.comboIndex = (attackIndex + 1) % profile.attacks.length;
        return this.activeAttack;
    }

    update(deltaTime = 0) {
        const elapsed = Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0;
        this.cooldownRemaining = Math.max(0, this.cooldownRemaining - elapsed);
        if (!this.activeAttack) return null;

        this.activeAttack.windupRemaining -= elapsed;
        if (this.activeAttack.windupRemaining > 0) return null;

        const attack = this.activeAttack;
        this.activeAttack = null;
        return attack;
    }
}

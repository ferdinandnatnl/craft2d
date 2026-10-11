import { entityRegistry } from "./entityRegistry.js";
import { FallingBlock } from "./fallingBlock.js";
import { Cow } from "./mobs/cow.js";
import { Creeper } from "./mobs/creeper.js";
import { Pig } from "./mobs/pig.js";
import { Sheep } from "./mobs/sheep.js";
import { WitherSkeleton } from "./mobs/wither_skeleton.js";
import { Enderman } from "./mobs/enderman.js";
import { Blaze } from "./mobs/blaze.js";
import { Zombie } from "./mobs/zombie.js";
import { Snowball } from "./projectiles/snowBall.js";
import { EnderDragon } from "./mobs/ender_dragon.js";

export const Entities = Object.freeze({
    Pig: Pig,
    Cow: Cow,
    Zombie: Zombie,
    Creeper: Creeper,
    Sand: FallingBlock,
    Snowball: Snowball,
    Sheep: Sheep,
    WitherSkeleton: WitherSkeleton,
    EnderDragon: EnderDragon,
    Enderman: Enderman,
    Blaze: Blaze,
});
entityRegistry.Entities = Entities;

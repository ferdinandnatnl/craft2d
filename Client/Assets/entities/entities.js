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
import { Villager } from "./mobs/villager.js";
import { IronGolem, SnowGolem } from "./mobs/golem.js";
import { Skeleton, Husk, Drowned } from "./mobs/variants.js";
import { Cod, Salmon, Pufferfish, TropicalFish, Squid } from "./mobs/aquatic.js";
import { Boat } from "./boat.js";
import { Warden } from "./mobs/warden.js";
import { Minecart } from "./minecart.js";
import {
    MutantCreeper,
    MutantEnderman,
    MutantSkeleton,
    MutantSnowGolem,
    MutantZombie,
    SpiderPig,
} from "./mobs/mutants.js";
import { ChemicalX } from "./projectiles/chemicalX.js";
import { MutantBoneArrow, MutantIceShard } from "./projectiles/mutantProjectiles.js";
import { CreeperMinion, CreeperMinionEgg } from "./mobs/creeperMinion.js";
import { Catfish } from "./mobs/catfish.js";

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
    Villager: Villager,
    IronGolem: IronGolem,
    SnowGolem: SnowGolem,
    Skeleton: Skeleton,
    Husk: Husk,
    Drowned: Drowned,
    Cod: Cod,
    Salmon: Salmon,
    Pufferfish: Pufferfish,
    TropicalFish: TropicalFish,
    Squid: Squid,
    Boat: Boat,
    Warden: Warden,
    Minecart: Minecart,
    MutantZombie: MutantZombie,
    MutantCreeper: MutantCreeper,
    CreeperMinion: CreeperMinion,
    CreeperMinionEgg: CreeperMinionEgg,
    Catfish: Catfish,
    MutantSkeleton: MutantSkeleton,
    MutantEnderman: MutantEnderman,
    MutantSnowGolem: MutantSnowGolem,
    SpiderPig: SpiderPig,
    ChemicalX: ChemicalX,
    MutantBoneArrow: MutantBoneArrow,
    MutantIceShard: MutantIceShard,
});
entityRegistry.Entities = Entities;

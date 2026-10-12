import { WitherSkeleton, createWitherSkeletonBody } from "./wither_skeleton.js";
import { Zombie, createZombieBody } from "./zombie.js";
import { LootItem, LootTable } from "@2dcraft.com/shared/lootTable.js";
import { Items } from "@2dcraft.com/shared/items.js";

export class Skeleton extends WitherSkeleton {
    constructor(world, options = {}) {
        super(world, { ...options, body: options.body ?? createWitherSkeletonBody() });
        this.name = "Skeleton";
        this.body.setSprite("skeleton/skeleton");
        this.burnInSunlight = true;
        this.lootTable = new LootTable([
            new LootItem({ itemId: Items.Bone, maxCount: 2, subtract: 1 }),
        ]);
    }
}

export class Husk extends Zombie {
    constructor(world, options = {}) {
        super(world, { ...options, body: options.body ?? createZombieBody() });
        this.name = "Husk";
        this.body.setSprite("zombie/husk");
        this.burnInSunlight = false;
    }
}

export class Drowned extends Zombie {
    constructor(world, options = {}) {
        super(world, { ...options, body: options.body ?? createZombieBody() });
        this.name = "Drowned";
        this.body.setSprite("zombie/drowned");
        this.burnInSunlight = false;
    }
}

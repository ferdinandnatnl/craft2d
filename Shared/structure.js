import { Dimensions } from "./dimensions.js";

export class Structure {
    constructor({
        blocks = [[]],
        walls = null,
        biome = null,
        underground = false,
        shift = { x: 0, y: 1 },
        dimension = Dimensions.Overworld,
        villageGround = null,
        villagePath = null,
        villageFoundation = null,
        villageEntrances = null,
        villageCanopy = null,
        villageTimber = null,
    }) {
        this.blocks = blocks;
        this.walls = walls;
        this.biome = biome;
        this.underground = underground;
        this.shift = shift;
        this.dimension = dimension;
        this.villageGround = villageGround;
        this.villagePath = villagePath;
        this.villageFoundation = villageFoundation;
        this.villageEntrances = villageEntrances;
        this.villageCanopy = villageCanopy;
        this.villageTimber = villageTimber;
    }
}

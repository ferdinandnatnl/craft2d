function biomeFamily(biome) {
    const name = String(biome?.name || "").toLowerCase();
    if (/jungle|rainforest|tropical/.test(name)) return "jungle";
    if (/swamp|marsh|bog|mangrove/.test(name)) return "swamp";
    if (/desert|mesa|badlands|arid/.test(name)) return "desert";
    if (/snow|frozen|ice|tundra|glacier|cold/.test(name)) return "snow";
    if (/peak|mountain|highland|windswept|alpine/.test(name)) return "highland";
    if (/ocean|beach|river/.test(name)) return "water";
    if (/savanna/.test(name)) return "savanna";
    if (/forest|grove|taiga|wood/.test(name)) return "forest";
    return "plains";
}

function layer(id, sound, volume) {
    return { id: `${id}:${sound}`, sound, volume };
}

export function getAmbientLayers(context) {
    if (!context) return [];
    const rainLevel = Number.isFinite(context.rainLevel)
        ? Math.max(0, Math.min(1, context.rainLevel))
        : context.raining ? 1 : 0;
    const thunderLevel = Number.isFinite(context.thunderLevel)
        ? Math.max(0, Math.min(1, context.thunderLevel))
        : context.thundering ? 1 : 0;

    if (context.dimension === "Nether") {
        return [layer("dimension", "suspense/nether.ogg", 0.13)];
    }
    if (context.dimension === "End" || context.dimension === "The End") {
        return [layer("dimension", "suspense/end.ogg", 0.12)];
    }
    if (context.underwater) {
        return [layer(
            "water",
            context.deepWater
                ? "water/underwater-deep.ogg"
                : "water/underwater.ogg",
            context.deepWater ? 0.2 : 0.16,
        )];
    }
    if (context.underground) {
        const caveSound = context.deepCave
            ? "cave/cave-deep1.ogg"
            : context.nearWater
                ? "cave/cave-water1.ogg"
                : "cave/cave1.ogg";
        const layers = [layer("cave", caveSound, context.deepCave ? 0.14 : 0.12)];
        if (context.thundering && !context.cold) {
            layers.push(layer(
                "storm-away",
                "weather/storm-away.ogg",
                0.08 * thunderLevel,
            ));
        }
        return layers;
    }

    const family = biomeFamily(context.biome);
    const layers = [];

    // Bird and cricket ambience is omitted; Minecraft's soundtrack plays separately.
    if (family === "water") {
        const biomeName = String(context.biome?.name || "").toLowerCase();
        layers.push(layer(
            "shore",
            /ocean|sea/.test(biomeName) ? "water/ocean.ogg" : "water/beach.ogg",
            0.12,
        ));
    } else if (family === "swamp") {
        layers.push(layer("frogs", "animals/frog/frog1.ogg", 0.1));
    } else if (family === "desert") {
        layers.push(layer("insects", "animals/cicadas/cicadas-desert1.ogg", 0.1));
        layers.push(layer("wind", "wind/light-wind.ogg", 0.07));
    } else if (family === "snow") {
        layers.push(layer("wind", "wind/light-wind.ogg", 0.1));
    } else if (family === "highland") {
        layers.push(layer("wind", "wind/heavy-wind2.ogg", 0.1));
    } else if (family === "forest") {
        layers.push(layer("leaves", "wind/wind-in-leaves.ogg", 0.045));
    }

    if (context.nearWater && family !== "water") {
        layers.push(layer("shore", "water/beach.ogg", 0.07));
    }

    if (context.raining && context.openSky && !context.cold) {
        const rainSound = context.rainSound === "rain2"
            ? "weather/rain2.ogg"
            : "weather/rain1.ogg";
        layers.push(layer("rain", rainSound, 0.14 * rainLevel));
    }

    if (context.thundering && !context.cold) {
        const stormAway = context.inAir || !context.openSky;
        layers.push(layer(
            stormAway ? "storm-away" : "storm-close",
            stormAway ? "weather/storm-away.ogg" : "weather/storm-close.ogg",
            (stormAway ? 0.08 : 0.14) * thunderLevel,
        ));
    }

    if (context.inAir && family !== "highland" && family !== "snow") {
        layers.push(layer("height-wind", "wind/heavy-wind2.ogg", 0.055));
    }

    return layers;
}

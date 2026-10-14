import { Blocks } from "@2dcraft.com/shared/blocks.js";
import { Dimensions } from "@2dcraft.com/shared/dimensions.js";

export function isColdWeatherBiome(biome) {
    if (!biome) return false;
    const name = String(biome.name || "").toLowerCase();
    return biome.topLayer === Blocks.SnowedGrassBlock ||
        (Number.isFinite(biome.maxTemp) && biome.maxTemp <= 0.25) ||
        /snow|frozen|ice|tundra|glacier|arctic/.test(name);
}

export function getWeatherConditions(world, player = world?.player, biome = null) {
    if (!world || !player) {
        return {
            rainLevel: 0,
            thunderLevel: 0,
            raining: false,
            thundering: false,
            snowing: false,
            cold: false,
        };
    }

    const overworld = player.dimension === Dimensions.Overworld;
    const weather = overworld ? world.weather : null;
    const rainLevel = Number.isFinite(weather?.rainLevel)
        ? Math.max(0, Math.min(1, weather.rainLevel))
        : 0;
    const thunderLevel = Number.isFinite(weather?.thunderLevel)
        ? Math.max(0, Math.min(1, weather.thunderLevel))
        : 0;
    const cold = isColdWeatherBiome(biome);
    const raining = rainLevel > 0.01;
    const thundering = thunderLevel > 0.01;

    return {
        rainLevel,
        thunderLevel,
        raining,
        thundering,
        cold,
        snowing: raining && cold,
    };
}

export function getPrecipitationKind(conditions, dimension, openSky) {
    if (dimension !== Dimensions.Overworld || openSky !== true) return null;
    if (conditions?.snowing) return "snow";
    if (conditions?.raining) return "rain";
    return null;
}

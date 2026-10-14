import { seedHash } from "./seed.js";

// Minecraft Java 1.20.1 weather duration ranges (game ticks).
export const WEATHER_DURATION_RANGES = Object.freeze({
    clearRain: Object.freeze([12000, 180000]),
    rain: Object.freeze([12000, 24000]),
    clearThunder: Object.freeze([12000, 180000]),
    thunder: Object.freeze([3600, 15600]),
});

const MAX_WEATHER_TICKS = 180000;
const WEATHER_RAMP_PER_TICK = 0.01;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const approach = (value, target, amount) => target > value
    ? Math.min(target, value + amount)
    : Math.max(target, value - amount);

export class WeatherCycle {
    constructor(seed = 0, state = null) {
        this.seed = String(seed ?? 0);
        this.durationSequence = 0;
        this.reset();
        if (state) this.loadState(state, this.seed);
    }

    setSeed(seed) {
        const nextSeed = String(seed ?? 0);
        if (nextSeed === this.seed) return;
        this.seed = nextSeed;
        this.reset();
    }

    sampleDuration(kind) {
        const range = WEATHER_DURATION_RANGES[kind];
        if (!range) throw new Error(`Unknown weather duration: ${kind}`);
        const [min, max] = range;
        const hash = seedHash(this.seed, `weather:${kind}:${this.durationSequence}`);
        this.durationSequence++;
        return min + hash % (max - min + 1);
    }

    reset() {
        this.durationSequence = 0;
        this.raining = false;
        this.thundering = false;
        this.rainLevel = 0;
        this.thunderLevel = 0;
        this.rainTime = this.sampleDuration("clearRain");
        this.thunderTime = this.sampleDuration("clearThunder");
    }

    tick({ advanceCycle = true } = {}) {
        const previousRaining = this.raining;
        const previousThundering = this.thundering;

        if (advanceCycle) {
            if (this.thunderTime > 0) this.thunderTime--;
            if (this.thunderTime <= 0) {
                if (this.raining) {
                    this.thundering = !this.thundering;
                    this.thunderTime = this.sampleDuration(
                        this.thundering ? "thunder" : "clearThunder",
                    );
                } else {
                    this.thundering = false;
                    this.thunderTime = this.sampleDuration("clearThunder");
                }
            }

            if (this.rainTime > 0) this.rainTime--;
            if (this.rainTime <= 0) {
                this.raining = !this.raining;
                this.rainTime = this.sampleDuration(this.raining ? "rain" : "clearRain");
                if (!this.raining && this.thundering) {
                    this.thundering = false;
                    this.thunderTime = this.sampleDuration("clearThunder");
                }
            }
        }

        this.rainLevel = approach(
            this.rainLevel,
            this.raining ? 1 : 0,
            WEATHER_RAMP_PER_TICK,
        );
        this.thunderLevel = approach(
            this.thunderLevel,
            this.thundering ? 1 : 0,
            WEATHER_RAMP_PER_TICK,
        );

        return {
            flagsChanged: previousRaining !== this.raining ||
                previousThundering !== this.thundering,
            state: this.getState(),
        };
    }

    setWeather(type, duration = null) {
        if (!new Set(["clear", "rain", "thunder"]).has(type)) return false;

        const fixedDuration = Number.isInteger(duration) && duration > 0
            ? clamp(duration, 1, MAX_WEATHER_TICKS)
            : null;
        this.raining = type !== "clear";
        this.thundering = type === "thunder";
        this.rainTime = fixedDuration ?? this.sampleDuration(
            this.raining ? "rain" : "clearRain",
        );
        this.thunderTime = type === "thunder"
            ? fixedDuration ?? this.sampleDuration("thunder")
            : this.sampleDuration("clearThunder");
        return true;
    }

    getState() {
        return {
            version: 1,
            seed: this.seed,
            durationSequence: this.durationSequence,
            raining: this.raining,
            thundering: this.thundering,
            rainTime: this.rainTime,
            thunderTime: this.thunderTime,
            rainLevel: this.rainLevel,
            thunderLevel: this.thunderLevel,
        };
    }

    loadState(state, fallbackSeed = this.seed) {
        if (!state || typeof state !== "object" || state.version !== 1) {
            this.seed = String(fallbackSeed ?? 0);
            this.reset();
            return false;
        }

        this.seed = String(state.seed ?? fallbackSeed ?? 0);
        this.durationSequence = Number.isSafeInteger(state.durationSequence) &&
            state.durationSequence >= 0
            ? state.durationSequence
            : 0;
        this.raining = state.raining === true;
        this.thundering = this.raining && state.thundering === true;
        this.rainTime = Number.isInteger(state.rainTime) && state.rainTime > 0
            ? clamp(state.rainTime, 1, MAX_WEATHER_TICKS)
            : this.sampleDuration(this.raining ? "rain" : "clearRain");
        this.thunderTime = Number.isInteger(state.thunderTime) && state.thunderTime > 0
            ? clamp(state.thunderTime, 1, MAX_WEATHER_TICKS)
            : this.sampleDuration(this.thundering ? "thunder" : "clearThunder");
        this.rainLevel = Number.isFinite(state.rainLevel)
            ? clamp(state.rainLevel, 0, 1)
            : 0;
        this.thunderLevel = this.thundering && Number.isFinite(state.thunderLevel)
            ? clamp(state.thunderLevel, 0, 1)
            : 0;
        return true;
    }
}

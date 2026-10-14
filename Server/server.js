import { uuidv4, Vector2 } from "./Classes/helper.js";
import { Player } from "./Classes/player.js";
import { WebSocketServer } from "ws";
import { World } from "./Classes/world.js";
import { createInterface } from "readline";
import fs from "fs";
import { BLOCK_SIZE, CHUNK_HEIGHT, TICK_SPEED } from "@2dcraft.com/shared/constants.js";
import { randomMinecraftSeed } from "@2dcraft.com/shared/seed.js";

const propertiesFile = "server.properties";
const lanMode = process.argv.includes("--lan");
const userCacheFile = "usercache.json";
const bannedIPsFile = "banned-ips.json";
const serverLogFile = "server.log";
const iconPaths = [
    { path: "server-icon.png", mime: "image/png" },
    { path: "server-icon.gif", mime: "image/gif" },
];
const maxIconSize = 1 * 1024 * 1024; // 1 MB

let serverIcon = null;
let userCache = [];
let bannedIPs = [];
let players = [];
const minionOwners = new Map();
let worldAuthorityUUID = null;
let lastWorldSnapshot = null;

const syncedMobFields = new Set([
    "babyAgeTicks", "loveTicks", "breedingCooldown", "breedingOwnerUUID",
    "hasWool", "woolTimer", "layEggTimer", "catfishSize", "swimPhase",
    "tamed", "ownerUUID", "sitting", "command", "hasEgg", "variant",
    "attackPoseKind", "attackPoseDuration", "attackPoseUntil", "powered",
    "fuseTimer", "chargeTicks", "state", "moving", "attackCooldown",
    "attackCooldownMax", "flightTime", "fire", "air", "poisonTicks", "poisonAmplifier",
    "poisonDamageTicks",
]);

const properties = {};

const defaultProperties = {
    serverIp: "",
    levelSeed: "",
    gamemode: 0,
    serverPort: 25565,
    allowNether: true,
    levelName: "world",
    motd: "A craft2d.com Server",
    maxPlayers: 20,
};

const world = new World();

const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
});

function loadProperties() {
    if (!fs.existsSync(propertiesFile)) {
        fs.writeFileSync(
            propertiesFile,
            Object.entries(defaultProperties)
                .map(([key, value]) => `${key}=${value}`)
                .join("\n")
        );
    }
    const data = fs.readFileSync(propertiesFile, "utf8");
    const lines = data.split("\n");
    for (const line of lines) {
        const [key, value] = line.split("=");
        if (key && value) {
            properties[key.trim()] = value.trim();
        }
    }
    for (const key in defaultProperties) {
        if (!properties[key]) {
            properties[key] = defaultProperties[key];
        }
    }
    properties.serverPort = parseInt(properties.serverPort);
    properties.gamemode = parseInt(properties.gamemode);
    properties.allowNether = properties.allowNether === "true";
    properties.maxPlayers = parseInt(properties.maxPlayers);
    properties.levelSeed = properties.levelSeed.trim();
    if (properties.levelSeed === "") {
        properties.levelSeed = randomMinecraftSeed();
    }

    properties.motd = parseMotd(properties.motd);
    properties.serverIp = lanMode ? "" : properties.serverIp.trim();

    world.setSeed(properties.levelSeed);

    serverIcon = loadServerIcon();
}

function loadUserCache() {
    try {
        if (fs.existsSync(userCacheFile)) {
            const stats = fs.statSync(userCacheFile);
            if (stats.isDirectory()) {
                console.error(
                    `Error: ${userCacheFile} is a directory, expected a file.`
                );
                userCache = [];
                return;
            }
            const fileContent = fs.readFileSync(userCacheFile, "utf8");
            if (!fileContent) {
                console.error(`Error: ${userCacheFile} is empty.`);
                userCache = [];
                return;
            }
            userCache = JSON.parse(fileContent);
            if (!Array.isArray(userCache)) {
                console.error(
                    `Error: ${userCacheFile} contains invalid data, expected an array.`
                );
                userCache = [];
            }
        } else {
            userCache = [];
            saveUserCache();
        }
    } catch (error) {
        console.error(
            `Error loading user cache from ${userCacheFile}: ${error.message}`
        );
        userCache = [];
    }
}

function saveUserCache() {
    try {
        fs.writeFileSync(userCacheFile, JSON.stringify(userCache, null, 2));
    } catch (error) {
        console.error(
            `Error saving user cache to ${userCacheFile}: ${error.message}`
        );
    }
}

function updateUserCache(username, ip) {
    userCache = userCache.filter((entry) => entry.ip !== ip);
    userCache.push({ username, ip });
    saveUserCache();
}

function loadBannedIPs() {
    try {
        if (fs.existsSync(bannedIPsFile)) {
            const stats = fs.statSync(bannedIPsFile);
            if (stats.isDirectory()) {
                console.error(
                    `Error: ${bannedIPsFile} is a directory, expected a file.`
                );
                bannedIPs = [];
                return;
            }
            const fileContent = fs.readFileSync(bannedIPsFile, "utf8");
            if (!fileContent) {
                console.error(`Error: ${bannedIPsFile} is empty.`);
                bannedIPs = [];
                return;
            }
            bannedIPs = JSON.parse(fileContent);
            if (!Array.isArray(bannedIPs)) {
                console.error(
                    `Error: ${bannedIPsFile} contains invalid data, expected an array.`
                );
                bannedIPs = [];
            }
        } else {
            bannedIPs = [];
            fs.writeFileSync(bannedIPsFile, JSON.stringify(bannedIPs, null, 2));
        }
    } catch (error) {
        console.error(
            `Error loading banned IPs from ${bannedIPsFile}: ${error.message}`
        );
        bannedIPs = [];
    }
}

function beforeInit() {
    serverLog("Welcome to the craft2d.com server panel!");
    loadProperties();
    loadUserCache();
    loadBannedIPs();
    if (loadWorldFromDir()) {
        serverLog("World loaded successfully!");
    } else {
        serverLog("No world save found. Creating a new world!");
    }
    serverLog(
        `Server started at "${properties.serverIp || "0.0.0.0"}:${
            properties.serverPort
        }". Press Ctrl+C to stop the server.`
    );

    setInterval(() => {
        if (players.length > 0) saveWorldToDir();
    }, 1000);
}

function parseMotd(motd) {
    const validCodes = /[§][0-9a-fklmnor]/gi;
    motd = motd.replace(/§[^0-9a-fklmnor]/gi, "");
    return motd.substring(0, 50); // Limit to 50 characters
}

beforeInit();

const wss = new WebSocketServer({
    host: properties.serverIp || "0.0.0.0",
    port: properties.serverPort,
});

setInterval(() => {
    if (players.length === 0) return;
    const result = world.weather.tick();
    if (result.flagsChanged) {
        broadcast({ type: "weatherState", message: result.state });
    }
}, 1000 / TICK_SPEED);

wss.on("connection", (ws) => {
    const connectionTimeout = setTimeout(() => {
        ws.close();
    }, 5000);

    ws.on("message", (message) => {
        clearTimeout(connectionTimeout);
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            ws.close();
            return;
        }

        if (!players.some((p) => p.ws === ws)) {
            if (data.type === "status") {
                ws.send(
                    JSON.stringify({
                        type: "statusResponse",
                        message: {
                            motd: properties.motd,
                            maxPlayers: properties.maxPlayers,
                            onlinePlayers: players.length,
                            version: "craft2d.com 1.0",
                            icon: serverIcon,
                            requestId: data.message?.requestId || null,
                        },
                    })
                );
                return;
            } else {
                if (players.length >= properties.maxPlayers) {
                    ws.send(
                        JSON.stringify({
                            type: "serverFull",
                            message: "Server is full.",
                        })
                    );
                    ws.close();
                    return;
                }

                playerJoined(ws, data.message);
            }
        }

        processMessage(message, ws);
    });

    ws.on("close", () => {
        clearTimeout(connectionTimeout);
        const player = players.find((p) => p.ws === ws);
        if (player) {
            playerLeft(player);
        }
    });
});

function broadcast(data, exclude = []) {
    players.forEach((player) => {
        if (!exclude.includes(player.UUID)) {
            const message = JSON.stringify(data);
            player.ws.send(message);
        }
    });
}

function getSafeIp(ip) {
    // Sanitize IP address for use as a filename (replace : with _ for IPv6)
    return ip.replace(/[^0-9a-fA-F.]/g, "_");
}

function getPlayerIpFromSocket(ws) {
    const remoteAddress = ws?._socket?.remoteAddress;
    if (typeof remoteAddress !== "string" || remoteAddress.length === 0) {
        return "127.0.0.1";
    }

    return remoteAddress.replace(/^::ffff:/, "");
}

function createEmptyInventoryGrid(rows = 4, columns = 9) {
    return Array.from({ length: rows }, () =>
        Array.from({ length: columns }, () => ({
            blockId: null,
            itemId: null,
            count: 0,
            props: {},
        }))
    );
}

function normalizeInventoryItem(item) {
    return {
        blockId: item?.blockId || null,
        itemId: item?.itemId || null,
        count: Number.isFinite(item?.count) ? item.count : 0,
        props: item?.props && typeof item.props === "object" ? item.props : {},
    };
}

function normalizeInventoryGrid(inventory, rows = 4, columns = 9) {
    if (!Array.isArray(inventory)) {
        return createEmptyInventoryGrid(rows, columns);
    }

    const normalized = inventory.map((row) =>
        Array.isArray(row)
            ? row.map((item) => normalizeInventoryItem(item))
            : []
    );

    if (normalized.length === 0) {
        return createEmptyInventoryGrid(rows, columns);
    }

    return normalized;
}

function getPlayerInventoryItems(player) {
    if (Array.isArray(player?.inventory?.items)) {
        return player.inventory.items;
    }

    if (Array.isArray(player?.inventory)) {
        return player.inventory;
    }

    return createEmptyInventoryGrid();
}

function getDefaultPlayerPosition() {
    return new Vector2(0, (CHUNK_HEIGHT / 2) * BLOCK_SIZE);
}

function normalizeSavedMinion(data, ownerUUID, previousOwnerUUID = null) {
    if (!data || typeof data.UUID !== "string" || data.UUID.length > 64 ||
        !Number.isFinite(data.position?.x) || !Number.isFinite(data.position?.y) ||
        Math.abs(data.position.x) > 1_000_000_000 || data.position.y < 0 ||
        data.position.y >= CHUNK_HEIGHT * BLOCK_SIZE ||
        !Number.isFinite(data.health) || data.health <= 0) return null;
    const dimension = Number.isInteger(data.dimension) ? data.dimension : 0;
    if (dimension < 0 || dimension > 2) return null;
    if (data.carriedEntityUUID != null &&
        (typeof data.carriedEntityUUID !== "string" ||
            data.carriedEntityUUID.length > 64)) return null;
    const sourceInventory = Array.isArray(data.inventory) ? data.inventory : [];
    if (sourceInventory.length > 24) return null;
    const inventory = sourceInventory.map((item) => {
        if (!item || !Number.isInteger(item.count) || item.count < 0 || item.count > 64 ||
            (item.blockId != null && !Number.isInteger(item.blockId)) ||
            (item.itemId != null && !Number.isInteger(item.itemId)) ||
            (item.blockId != null && item.itemId != null)) return null;
        const props = item.props && typeof item.props === "object" && !Array.isArray(item.props)
            ? item.props : {};
        if (JSON.stringify(props).length > 1024) return null;
        return { blockId: item.blockId ?? null, itemId: item.itemId ?? null,
            count: item.count, props };
    });
    if (inventory.some((item) => !item)) return null;
    let job = data.job && typeof data.job === "object" ? data.job : null;
    if (job && JSON.stringify(job).length > 20_000) return null;
    if (job?.type === "carry" && job.targetUUID === previousOwnerUUID) {
        job = { ...job, targetUUID: ownerUUID };
    }
    const destination = data.deliveryDestination &&
        Number.isInteger(data.deliveryDestination.x) &&
        Number.isInteger(data.deliveryDestination.y) &&
        Number.isInteger(data.deliveryDestination.dimension) &&
        data.deliveryDestination.y >= 0 && data.deliveryDestination.y < CHUNK_HEIGHT &&
        data.deliveryDestination.dimension >= 0 && data.deliveryDestination.dimension <= 2
        ? data.deliveryDestination
        : null;
    return {
        UUID: data.UUID,
        ownerUUID,
        position: { x: data.position.x, y: data.position.y },
        health: Math.min(20, data.health),
        dimension,
        direction: data.direction < 0 ? -1 : 1,
        job,
        inventory,
        deliveryDestination: destination,
        carriedEntityUUID: data.carriedEntityUUID === previousOwnerUUID
            ? ownerUUID
            : typeof data.carriedEntityUUID === "string"
                ? data.carriedEntityUUID
                : null,
        deliveryActive: data.deliveryActive === true,
    };
}

function savePlayerData(player, ip) {
    if (!player || !ip || !player.position) {
        serverLog(`Cannot save player data: Invalid player object or IP`);
        return;
    }

    const playerDir = `./${properties.levelName}/players`;
    const safeIp = getSafeIp(ip);
    const playerFile = `${playerDir}/${safeIp}.json`;
    const inventoryItems = normalizeInventoryGrid(
        getPlayerInventoryItems(player)
    );

    try {
        fs.mkdirSync(playerDir, { recursive: true });
        const playerData = {
            position: {
                x: player.position.x || 0,
                y: player.position.y || 0,
            },
            dimension:
                typeof player.dimension === "number" ? player.dimension : 0,
            inventory: inventoryItems,
            gamemode:
                player.gamemode !== undefined
                    ? player.gamemode
                    : properties.gamemode,
            health: Number.isFinite(player.health) ? player.health : 20,
            food: Number.isFinite(player.food) ? player.food : 20,
            xpLevel: Number.isFinite(player.xpLevel) ? player.xpLevel : 0,
            minionProgress: player.minionProgress || { evilDeeds: 0, unlocked: false },
            minions: Array.isArray(player.minions) ? player.minions.slice(0, 4) : [],
        };
        fs.writeFileSync(playerFile, JSON.stringify(playerData, null, 2));
    } catch (error) {
        console.error(
            `Error saving player data for ${player.name} to ${playerFile}: ${error.message}`
        );
    }
}

function loadPlayerData(player, ip) {
    if (!player || !ip) {
        serverLog(`Cannot load player data: Invalid player object or IP`);
        return;
    }

    const playerDir = `./${properties.levelName}/players`;
    const safeIp = getSafeIp(ip);
    const playerFile = `${playerDir}/${safeIp}.json`;
    try {
        if (fs.existsSync(playerFile)) {
            const stats = fs.statSync(playerFile);
            if (stats.isDirectory()) {
                console.error(
                    `Error: ${playerFile} is a directory, expected a file.`
                );
                return;
            }
            const fileContent = fs.readFileSync(playerFile, "utf8");
            if (!fileContent) {
                console.error(`Error: ${playerFile} is empty.`);
                return;
            }
            const playerData = JSON.parse(fileContent);

            // Load position
            if (
                playerData.position &&
                typeof playerData.position.x === "number" &&
                typeof playerData.position.y === "number"
            ) {
                player.position = new Vector2(
                    playerData.position.x,
                    playerData.position.y
                );
            } else {
                player.position = getDefaultPlayerPosition();
            }

            // Load inventory
            player.inventory = player.inventory || {};
            player.inventory.items = normalizeInventoryGrid(
                playerData.inventory
            );

            if (typeof playerData.dimension === "number") {
                player.dimension = playerData.dimension;
            } else {
                player.dimension = 0;
            }

            // Load gamemode
            if (typeof playerData.gamemode === "number") {
                player.gamemode = playerData.gamemode;
            } else {
                player.gamemode = properties.gamemode;
            }

            player.health =
                typeof playerData.health === "number" ? playerData.health : 20;
            player.food =
                typeof playerData.food === "number" ? playerData.food : 20;
            player.xpLevel = Number.isFinite(playerData.xpLevel)
                ? Math.max(0, Math.min(9999, Math.floor(playerData.xpLevel))) : 0;
            const progress = playerData.minionProgress;
            player.minionProgress = progress && typeof progress === "object"
                ? {
                    evilDeeds: Number.isFinite(progress.evilDeeds)
                        ? Math.max(0, Math.min(4, Math.floor(progress.evilDeeds))) : 0,
                    unlocked: progress.unlocked === true,
                }
                : { evilDeeds: 0, unlocked: false };
            const previousOwnerUUID = Array.isArray(playerData.minions)
                ? playerData.minions[0]?.ownerUUID
                : null;
            player.minions = (Array.isArray(playerData.minions) ? playerData.minions : [])
                .slice(0, 4)
                .map((minion) => normalizeSavedMinion(
                    minion,
                    player.UUID,
                    previousOwnerUUID,
                ))
                .filter(Boolean);
            for (const minion of player.minions) {
                minionOwners.set(minion.UUID, player.UUID);
            }
        } else {
            // Set default values for new players
            player.position = getDefaultPlayerPosition();
            player.inventory = player.inventory || {};
            player.inventory.items = createEmptyInventoryGrid();
            player.dimension = 0;
            player.gamemode = properties.gamemode;
            player.health = 20;
            player.food = 20;
            player.xpLevel = 0;
            player.minionProgress = { evilDeeds: 0, unlocked: false };
            player.minions = [];
        }
    } catch (error) {
        console.error(
            `Error loading player data for ${player.name} from ${playerFile}: ${error.message}`
        );
        // Fallback to defaults
        player.position = getDefaultPlayerPosition();
        player.inventory = player.inventory || {};
        player.inventory.items = createEmptyInventoryGrid();
        player.dimension = 0;
        player.gamemode = properties.gamemode;
        player.health = 20;
        player.food = 20;
        player.xpLevel = 0;
        player.minionProgress = { evilDeeds: 0, unlocked: false };
        player.minions = [];
    }
}

function sendToPlayer(UUID, data) {
    const player = players.find((p) => p.UUID === UUID);
    if (player) {
        const message = JSON.stringify(data);
        player.ws.send(message);
    }
}

function publishWorldAuthority() {
    worldAuthorityUUID = players[0]?.UUID ?? null;
    broadcast({
        type: "worldAuthority",
        message: { UUID: worldAuthorityUUID },
    });
}

function normalizeWorldSnapshot(snapshot) {
    if (
        !snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) ||
        !Number.isFinite(snapshot.time) || snapshot.time < 0 || snapshot.time > 8 ||
        !Array.isArray(snapshot.mobs) || snapshot.mobs.length > 512
    ) return null;

    const mobs = [];
    const seen = new Set();
    for (const mob of snapshot.mobs) {
        if (
            !mob || typeof mob !== "object" || Array.isArray(mob) ||
            typeof mob.UUID !== "string" || mob.UUID.length === 0 || mob.UUID.length > 64 ||
            seen.has(mob.UUID) || typeof mob.entity !== "string" ||
            !/^[A-Za-z]{1,40}$/.test(mob.entity) ||
            !Number.isFinite(mob.position?.x) || !Number.isFinite(mob.position?.y) ||
            Math.abs(mob.position.x) > 1_000_000_000 ||
            Math.abs(mob.position.y) > 1_000_000_000 ||
            !Number.isInteger(mob.dimension) || mob.dimension < 0 || mob.dimension > 2 ||
            !Number.isFinite(mob.health) || mob.health <= 0 || mob.health > 10_000 ||
            ![-1, 1].includes(mob.direction) ||
            !Number.isFinite(mob.velocity?.x) || !Number.isFinite(mob.velocity?.y) ||
            Math.abs(mob.velocity.x) > 100_000 || Math.abs(mob.velocity.y) > 100_000 ||
            !Number.isFinite(mob.myChunkX) ||
            (mob.fields !== undefined &&
                (!mob.fields || typeof mob.fields !== "object" || Array.isArray(mob.fields)))
        ) return null;

        const fields = {};
        for (const [key, value] of Object.entries(mob.fields || {})) {
            if (!syncedMobFields.has(key)) continue;
            if (typeof value === "boolean" ||
                (typeof value === "number" && Number.isFinite(value)) ||
                (typeof value === "string" && value.length <= 64)) {
                fields[key] = value;
            }
        }

        seen.add(mob.UUID);
        mobs.push({
            UUID: mob.UUID,
            entity: mob.entity,
            position: { x: mob.position.x, y: mob.position.y },
            dimension: mob.dimension,
            health: mob.health,
            direction: mob.direction,
            velocity: { x: mob.velocity.x, y: mob.velocity.y },
            myChunkX: mob.myChunkX,
            fields,
        });
    }

    return { time: snapshot.time, mobs };
}

function playerJoined(ws, playerData) {
    const ip = getPlayerIpFromSocket(ws);
    if (bannedIPs.includes(ip)) {
        ws.send(
            JSON.stringify({
                type: "disconnect",
                message: "You are banned from this server.",
            })
        );
        serverLog(`Banned IP ${ip} attempted to join.`);
        ws.close();
        return;
    }

    const newPlayer = new Player({
        UUID: uuidv4(),
        name: playerData?.name || `Player ${players.length + 1}`,
        ws: ws,
        skin: playerData?.skin || null,
        model: playerData?.model === "alex" ? "alex" : "steve",
    });

    players.push(newPlayer);
    publishWorldAuthority();

    // Load player data (position, inventory, gamemode)
    loadPlayerData(newPlayer, ip);

    updateUserCache(newPlayer.name, ip);

    sendToPlayer(newPlayer.UUID, {
        type: "youJoined",
        message: {
            player: newPlayer,
            existingPlayers: players.filter((p) => p.UUID !== newPlayer.UUID),
            gamemode: newPlayer.gamemode || properties.gamemode,
        },
    });

    sendToPlayer(newPlayer.UUID, {
        type: "playerDataFromFile",
        message: {
            UUID: newPlayer.UUID,
            position: newPlayer.position,
            dimension: newPlayer.dimension,
            inventory: getPlayerInventoryItems(newPlayer),
            gamemode: newPlayer.gamemode,
            health: newPlayer.health,
            food: newPlayer.food,
            xpLevel: newPlayer.xpLevel,
            minionProgress: newPlayer.minionProgress,
            minions: newPlayer.minions,
        },
    });

    sendToPlayer(newPlayer.UUID, {
        type: "seed",
        message: world.seed,
    });

    sendToPlayer(newPlayer.UUID, {
        type: "weatherState",
        message: world.weather.getState(),
    });

    sendToPlayer(newPlayer.UUID, {
        type: "worldTime",
        message: { time: world.time },
    });

    if (lastWorldSnapshot) {
        sendToPlayer(newPlayer.UUID, {
            type: "worldSnapshot",
            sender: worldAuthorityUUID,
            message: lastWorldSnapshot,
        });
    }

    broadcast(
        {
            type: "playerJoined",
            message: { player: newPlayer },
        },
        [newPlayer.UUID]
    );
}

function playerLeft(player) {
    if (!player) return;
    for (const [UUID, ownerUUID] of minionOwners) {
        if (ownerUUID !== player.UUID) continue;
        minionOwners.delete(UUID);
        broadcast({ type: "removeEntity", message: { UUID } }, [player.UUID]);
    }
    // Save player data before removing
    const ip = getPlayerIpFromSocket(player.ws);
    savePlayerData(player, ip);
    players = players.filter((p) => p.UUID !== player.UUID);
    serverLog(player.name + " left the game!", ip);
    broadcast({
        type: "playerLeft",
        message: player.UUID,
    });
    publishWorldAuthority();
}

function loadServerIcon() {
    for (const { path, mime } of iconPaths) {
        if (fs.existsSync(path)) {
            try {
                const stats = fs.statSync(path);
                if (stats.size > maxIconSize) {
                    console.error(
                        `Server icon ${path} exceeds maximum size of ${
                            maxIconSize / (1024 * 1024)
                        } MB (actual size: ${(
                            stats.size /
                            (1024 * 1024)
                        ).toFixed(2)} MB)`
                    );
                    continue;
                }

                const iconBuffer = fs.readFileSync(path);
                const base64Icon = iconBuffer.toString("base64");
                if (!base64Icon) {
                    console.error(`Empty base64 data for server icon ${path}`);
                    continue;
                }
                return `data:${mime};base64,${base64Icon}`;
            } catch (error) {
                console.error(
                    `Error loading server icon ${path}:`,
                    error.message
                );
                continue;
            }
        }
    }
    return null;
}

function processMessage(message, ws) {
    let data;
    try {
        data = JSON.parse(message);
    } catch (e) {
        return;
    }

    switch (data.type) {
        case "playerUpdate":
            {
                const player = getPlayerByUUID(data.sender);
                const message = data.message || {};
                if (!player || player.ws !== ws) break;
                if (player) {
                    if (
                        message.position &&
                        Number.isFinite(message.position.x) &&
                        Number.isFinite(message.position.y) &&
                        Math.abs(message.position.x) <= 1_000_000_000 &&
                        Math.abs(message.position.y) <= 1_000_000_000
                    ) {
                        player.position = {
                            x: message.position.x,
                            y: message.position.y,
                        };
                    }

                    if (Number.isInteger(message.gamemode) &&
                        message.gamemode >= 0 && message.gamemode <= 3) {
                        player.gamemode = message.gamemode;
                    }

                    if (Number.isFinite(message.health)) {
                        player.health = Math.max(0, Math.min(20, message.health));
                    }

                    if (Number.isFinite(message.food)) {
                        player.food = Math.max(0, Math.min(20, message.food));
                    }
                    if (Number.isFinite(message.xpLevel)) {
                        player.xpLevel = Math.max(0,
                            Math.min(9999, Math.floor(message.xpLevel)));
                    }
                    if (message.minionProgress && typeof message.minionProgress === "object") {
                        player.minionProgress = {
                            evilDeeds: Number.isFinite(message.minionProgress.evilDeeds)
                                ? Math.max(0, Math.min(4, Math.floor(message.minionProgress.evilDeeds)))
                                : 0,
                            unlocked: message.minionProgress.unlocked === true,
                        };
                    }
                }
            }
            broadcast(data, [data.sender]);
            break;

        case "worldSnapshot": {
            const sender = getPlayerByUUID(data.sender);
            const snapshot = normalizeWorldSnapshot(data.message);
            if (
                sender?.ws === ws && data.sender === worldAuthorityUUID && snapshot
            ) {
                lastWorldSnapshot = snapshot;
                world.time = snapshot.time;
                broadcast({
                    type: "worldSnapshot",
                    sender: data.sender,
                    message: snapshot,
                }, [data.sender]);
            }
            break;
        }

        case "weatherCommand": {
            const sender = getPlayerByUUID(data.sender);
            const type = data.message?.type;
            const duration = data.message?.duration;
            const validDuration = duration === null ||
                (Number.isInteger(duration) && duration >= 1 && duration <= 180000);
            if (
                sender?.ws === ws && data.sender === worldAuthorityUUID &&
                ["clear", "rain", "thunder"].includes(type) && validDuration &&
                world.weather.setWeather(type, duration)
            ) {
                broadcast({
                    type: "weatherState",
                    message: world.weather.getState(),
                });
            }
            break;
        }

        // Weather state comes from the server. Ignore client attempts to
        // broadcast a forged state; authorized changes use weatherCommand.
        case "weatherState":
            break;

        case "playerHit": {
            const attacker = getPlayerByUUID(data.sender);
            const targetUUID = data.message?.targetUUID;
            const target = getPlayerByUUID(targetUUID);
            const hit = data.message || {};
            if (
                attacker?.ws !== ws || !target || target === attacker ||
                attacker.health <= 0 || target.health <= 0 ||
                attacker.gamemode === 3 || target.gamemode === 3 ||
                attacker.dimension !== target.dimension ||
                !Number.isFinite(hit.damage) || hit.damage <= 0 || hit.damage > 100 ||
                !Number.isFinite(hit.hitfromX) || Math.abs(hit.hitfromX) > 1_000_000_000 ||
                !Number.isFinite(hit.knockback) || hit.knockback < 0 || hit.knockback > 20 ||
                !Number.isFinite(attacker.position?.x) ||
                !Number.isFinite(attacker.position?.y) ||
                !Number.isFinite(target.position?.x) ||
                !Number.isFinite(target.position?.y)
            ) break;

            const sourceMob = typeof hit.sourceMobUUID === "string"
                ? lastWorldSnapshot?.mobs?.find((entry) =>
                    entry.UUID === hit.sourceMobUUID)
                : null;
            if (hit.sourceMobUUID !== undefined && (
                attacker.UUID !== worldAuthorityUUID || !sourceMob ||
                sourceMob.dimension !== target.dimension
            )) break;

            const hitSource = sourceMob || attacker;
            const distance = Math.hypot(
                hitSource.position.x - target.position.x,
                hitSource.position.y - target.position.y,
            );
            if (distance > 5 * BLOCK_SIZE) break;

            sendToPlayer(target.UUID, {
                type: "playerHit",
                sender: attacker.UUID,
                message: {
                    targetUUID: target.UUID,
                    damage: hit.damage,
                    hitfromX: hit.hitfromX,
                    knockback: hit.knockback,
                    cause: typeof hit.cause === "string" ? hit.cause.slice(0, 80) : null,
                    ...(sourceMob ? { sourceMobUUID: sourceMob.UUID } : {}),
                },
            });
            break;
        }

        case "mobHit": {
            const attacker = getPlayerByUUID(data.sender);
            const hit = data.message || {};
            const mob = lastWorldSnapshot?.mobs?.find(
                (entry) => entry.UUID === hit.targetUUID,
            );
            if (
                attacker?.ws !== ws || !worldAuthorityUUID || !mob ||
                attacker.health <= 0 || attacker.gamemode === 3 ||
                attacker.dimension !== mob.dimension ||
                !Number.isFinite(hit.damage) || hit.damage <= 0 || hit.damage > 100 ||
                !Number.isFinite(hit.hitfromX) || Math.abs(hit.hitfromX) > 1_000_000_000 ||
                !Number.isFinite(hit.knockback) || hit.knockback < 0 || hit.knockback > 20 ||
                !Number.isFinite(attacker.position?.x) ||
                !Number.isFinite(attacker.position?.y)
            ) break;

            const distance = Math.hypot(
                attacker.position.x - mob.position.x,
                attacker.position.y - mob.position.y,
            );
            if (distance > 5 * BLOCK_SIZE) break;

            sendToPlayer(worldAuthorityUUID, {
                type: "mobHit",
                sender: attacker.UUID,
                message: {
                    targetUUID: mob.UUID,
                    damage: hit.damage,
                    hitfromX: hit.hitfromX,
                    knockback: hit.knockback,
                },
            });
            break;
        }

        case "mobHitResult": {
            const sender = getPlayerByUUID(data.sender);
            const targetUUID = data.message?.attackerUUID;
            if (
                sender?.ws === ws && data.sender === worldAuthorityUUID &&
                typeof targetUUID === "string" && getPlayerByUUID(targetUUID) &&
                typeof data.message?.targetUUID === "string" &&
                typeof data.message?.killed === "boolean"
            ) {
                sendToPlayer(targetUUID, {
                    type: "mobHitResult",
                    sender: data.sender,
                    message: {
                        attackerUUID: targetUUID,
                        targetUUID: data.message.targetUUID,
                        killed: data.message.killed,
                    },
                });
            }
            break;
        }

        case "playerData": {
            const player = getPlayerByUUID(data.message.UUID);
            if (player) {
                const oldName = player.name;
                player.skin = data.message.skin;
                player.model =
                    data.message.model === "alex" ? "alex" : "steve";
                player.name = data.message.name;
                broadcast(data, [data.sender]);

                const ip =
                    ws._socket.remoteAddress.replace(/^::ffff:/, "") ||
                    "127.0.0.1";

                updateUserCache(player.name, ip);

                serverLog(`${player.name} joined the game!`, ip);
            }
            break;
        }

        case "playerInventory": {
            const player = getPlayerByUUID(data.sender);
            if (player) {
                player.inventory = player.inventory || {};
                player.inventory.items = normalizeInventoryGrid(
                    data.message?.inventory
                );
            }
            break;
        }

        case "playerSyncOnLeave": {
            const player = getPlayerByUUID(data.sender);

            if (!player) {
                break;
            }

            const message = data.message || {};

            if (
                message.position &&
                typeof message.position.x === "number" &&
                typeof message.position.y === "number"
            ) {
                player.position = {
                    x: message.position.x,
                    y: message.position.y,
                };
            }

            if (typeof message.dimension === "number") {
                player.dimension = message.dimension;
            }

            if (typeof message.gamemode === "number") {
                player.gamemode = message.gamemode;
            }

            if (typeof message.health === "number") {
                player.health = message.health;
            }

            if (typeof message.food === "number") {
                player.food = message.food;
            }

            if (Array.isArray(message.inventory)) {
                player.inventory = player.inventory || {};
                player.inventory.items = normalizeInventoryGrid(
                    message.inventory
                );
            }

            if (Number.isFinite(message.xpLevel)) {
                player.xpLevel = Math.max(0, Math.min(9999, Math.floor(message.xpLevel)));
            }
            if (message.minionProgress && typeof message.minionProgress === "object") {
                player.minionProgress = {
                    evilDeeds: Number.isFinite(message.minionProgress.evilDeeds)
                        ? Math.max(0, Math.min(4, Math.floor(message.minionProgress.evilDeeds)))
                        : 0,
                    unlocked: message.minionProgress.unlocked === true,
                };
            }
            if (Array.isArray(message.minions) && message.minions.length <= 4) {
                const minions = message.minions.map((entry) =>
                    minionOwners.get(entry?.UUID) === player.UUID
                        ? normalizeSavedMinion(entry, player.UUID, player.UUID)
                        : null,
                );
                if (!minions.some((entry) => !entry)) player.minions = minions;
            }

            savePlayerData(player, getPlayerIpFromSocket(ws));

            break;
        }

        case "chat": {
            const player = getPlayerByUUID(data.sender);
            serverLog(
                player.name + ": " + data.message,
                getPlayerIpFromSocket(ws)
            );
            broadcast(
                {
                    type: "chat",
                    message: data.message,
                    sender: player.name,
                },
                [data.sender]
            );
            break;
        }

        case "entityRPC":
            broadcast(data, [data.sender]);
            break;

        case "minionState": {
            const sender = getPlayerByUUID(data.sender);
            const state = data.message || {};
            const validPosition = Number.isFinite(state.position?.x) &&
                Number.isFinite(state.position?.y) &&
                Math.abs(state.position.x) <= 1_000_000_000 &&
                state.position.y >= 0 && state.position.y < CHUNK_HEIGHT * BLOCK_SIZE;
            const validState = new Set([
                "idle", "following-owner", "moving-to-target", "searching-resources",
                "mining", "woodcutting", "excavating", "collecting-items",
                "carrying-entity", "delivering-resources", "returning-to-owner",
                "unreachable",
            ]).has(state.state);
            const validCarriedEntity = state.carriedEntityUUID == null ||
                (typeof state.carriedEntityUUID === "string" &&
                    state.carriedEntityUUID.length <= 64);
            if (sender?.ws === ws && minionOwners.get(state.UUID) === data.sender &&
                validPosition && validState && [-1, 1].includes(state.direction) &&
                Number.isInteger(state.dimension) && state.dimension === sender.dimension &&
                validCarriedEntity) {
                broadcast(data, [data.sender]);
                const persisted = sender.minions.find((minion) => minion.UUID === state.UUID);
                if (persisted) {
                    persisted.position = state.position;
                    persisted.direction = state.direction;
                    persisted.dimension = state.dimension;
                    persisted.carriedEntityUUID = state.carriedEntityUUID ?? null;
                }
            }
            break;
        }

        case "minionPersist": {
            const sender = getPlayerByUUID(data.sender);
            const state = data.message || {};
            if (sender?.ws !== ws || !Array.isArray(state.minions) || state.minions.length > 4) {
                break;
            }
            const minions = state.minions.map((entry) => {
                if (minionOwners.get(entry?.UUID) !== data.sender) return null;
                return normalizeSavedMinion(entry, data.sender, data.sender);
            });
            if (minions.some((entry) => !entry)) break;
            sender.minions = minions;
            if (Number.isFinite(state.xpLevel)) {
                sender.xpLevel = Math.max(0, Math.min(9999, Math.floor(state.xpLevel)));
            }
            if (state.minionProgress && typeof state.minionProgress === "object") {
                sender.minionProgress = {
                    evilDeeds: Number.isFinite(state.minionProgress.evilDeeds)
                        ? Math.max(0, Math.min(4, Math.floor(state.minionProgress.evilDeeds)))
                        : 0,
                    unlocked: state.minionProgress.unlocked === true,
                };
            }
            savePlayerData(sender, getPlayerIpFromSocket(ws));
            break;
        }

        case "removeEntity": {
            const UUID = data.message?.UUID;
            const sender = getPlayerByUUID(data.sender);
            if (sender?.ws !== ws || typeof UUID !== "string") break;
            if (
                lastWorldSnapshot?.mobs?.some((mob) => mob.UUID === UUID) &&
                data.sender !== worldAuthorityUUID
            ) break;
            if (minionOwners.has(UUID)) {
                if (minionOwners.get(UUID) !== data.sender) break;
                minionOwners.delete(UUID);
            }
            broadcast(data, [sender.UUID]);
            break;
        }

        case "summonEntity":
            {
                const sender = getPlayerByUUID(data.sender);
                const summon = data.message || {};
                const allowedEntities = new Set([
                    "Boat",
                    "Minion",
                    "IronGolem",
                    "SnowGolem",
                    "Chicken",
                    "Cow",
                    "Pig",
                    "Sheep",
                ]);
                const validPosition =
                    Number.isFinite(summon.position?.x) &&
                    Number.isFinite(summon.position?.y);
                const validIdentity =
                    typeof summon.UUID === "string" &&
                    summon.UUID.length > 0 &&
                    summon.UUID.length <= 64;
                const props = summon.props ?? {};
                const animalEntities = new Set(["Chicken", "Cow", "Pig", "Sheep"]);
                const validAnimalProps =
                    animalEntities.has(summon.entity) &&
                    props !== null &&
                    typeof props === "object" &&
                    !Array.isArray(props) &&
                    Object.keys(props).every((key) =>
                        ["myChunkX", "babyAgeTicks", "dimension", "layEggTimer"].includes(key),
                    ) &&
                    (props.myChunkX === undefined || Number.isFinite(props.myChunkX)) &&
                    (props.babyAgeTicks === undefined ||
                        (Number.isInteger(props.babyAgeTicks) &&
                            props.babyAgeTicks >= 0 && props.babyAgeTicks <= 24_000)) &&
                    (props.dimension === undefined ||
                        (Number.isInteger(props.dimension) &&
                            props.dimension >= 0 && props.dimension <= 2)) &&
                    (props.layEggTimer === undefined ||
                        (summon.entity === "Chicken" &&
                            Number.isInteger(props.layEggTimer) &&
                            props.layEggTimer >= 0 && props.layEggTimer <= 12_000));
                const validProps =
                    props !== null &&
                    typeof props === "object" &&
                    !Array.isArray(props) &&
                    (animalEntities.has(summon.entity)
                        ? validAnimalProps
                        : summon.entity === "Boat"
                        ? Object.keys(props).every((key) =>
                              ["surfaceY", "dimension"].includes(key),
                          ) && Number.isFinite(props.surfaceY) &&
                          Number.isInteger(props.dimension)
                        : summon.entity === "Minion"
                        ? Object.keys(props).every((key) =>
                              ["ownerUUID", "myChunkX", "dimension", "direction"].includes(key),
                          ) && props.ownerUUID === data.sender &&
                          Number.isFinite(props.myChunkX) &&
                          Number.isInteger(props.dimension) &&
                          props.dimension >= 0 && props.dimension <= 2 &&
                          [-1, 1].includes(props.direction)
                        : Object.keys(props).every((key) => key === "myChunkX") &&
                          (props.myChunkX === undefined || Number.isFinite(props.myChunkX)));

                if (
                    sender?.ws === ws &&
                    allowedEntities.has(summon.entity) &&
                    validPosition &&
                    validIdentity &&
                    validProps &&
                    (summon.entity !== "Minion" ||
                        (minionOwners.get(summon.UUID) === data.sender ||
                            (!minionOwners.has(summon.UUID) &&
                                [...minionOwners.values()].filter((ownerUUID) =>
                                    ownerUUID === data.sender,
                                ).length < 4)))
                ) {
                    if (summon.entity === "Minion") {
                        minionOwners.set(summon.UUID, data.sender);
                    }
                    broadcast(data, [data.sender]);
                }
            }
            break;

        case "getChunk":
            const chunk = world
                .getDimension(data.message.data.dimensionIndex)
                .getChunk(data.message.data.x);
            ws.send(
                JSON.stringify({
                    type: "response",
                    message: {
                        chunk: chunk,
                        requestId: data.message.requestId,
                    },
                })
            );
            break;

        case "getSeed":
            ws.send(
                JSON.stringify({
                    type: "response",
                    message: {
                        seed: world.seed,
                        requestId: data.message.requestId,
                    },
                })
            );
            break;

        case "uploadChunk": {
            const minionUUID = data.message?.minionUUID;
            if (minionUUID !== undefined &&
                (typeof minionUUID !== "string" ||
                    minionOwners.get(minionUUID) !== data.sender ||
                    getPlayerByUUID(data.sender)?.ws !== ws)) {
                break;
            }
            world
                .getDimension(data.message.dimensionIndex)
                .uploadChunk(data.message.chunk, data.message.x);
            break;
        }

        case "placeBlock":
            broadcast(data, [data.sender]);
            break;

        case "breakBlock": {
            const minionUUID = data.message?.minionUUID;
            if (minionUUID !== undefined &&
                (typeof minionUUID !== "string" ||
                    minionOwners.get(minionUUID) !== data.sender ||
                    getPlayerByUUID(data.sender)?.ws !== ws)) {
                break;
            }
            broadcast(data, [data.sender]);
            break;
        }

        case "playerDimension": {
            const player = getPlayerByUUID(data.message?.player);
            if (
                player?.ws === ws &&
                Number.isInteger(data.message.dimension) &&
                data.message.dimension >= 0 && data.message.dimension <= 2
            ) {
                player.dimension = data.message.dimension;
                broadcast(data, [player.UUID]);
            }
            break;
        }

        default:
            broadcast(data, [data.sender]);
            break;
    }
}

function getPlayerByUUID(UUID) {
    return players.find((player) => player.UUID === UUID);
}

function loadWorldFromDir() {
    const worldDir = `./${properties.levelName}`;
    const worldFile = `${worldDir}/world.save`;
    try {
        if (fs.existsSync(worldFile)) {
            const stats = fs.statSync(worldFile);
            if (stats.isDirectory()) {
                console.error(
                    `Error: ${worldFile} is a directory, expected a file.`
                );
                return false;
            }
            const fileContent = fs.readFileSync(worldFile, "utf8");
            if (!fileContent) {
                console.error(`Error: ${worldFile} is empty.`);
                return false;
            }
            const worldData = JSON.parse(fileContent);
            const success = world.loadWorld(worldData);
            if (success) {
                return true;
            } else {
                console.error("Failed to load world data from", worldFile);
                return false;
            }
        } else {
            saveWorldToDir();
            return false;
        }
    } catch (error) {
        console.error(
            "Error loading world from",
            worldFile,
            ":",
            error.message
        );
        return false;
    }
}

function serverLog(log = "", ip = null) {
    if (!log) return;

    const date = new Date();

    date.setHours(date.getHours() + 2);

    const formattedDate = date
        .toISOString()
        .replace(/T/, " ")
        .replace(/\..+/, "");

    const formattedLog = `[${formattedDate}] ${ip ? `[${ip}] ` : ""}${log}`;

    console.log(formattedLog);

    try {
        fs.appendFileSync(serverLogFile, `${formattedLog}\n`, "utf8");
    } catch (error) {
        console.error(`Failed to write to ${serverLogFile}: ${error.message}`);
    }
}

function saveWorldToDir() {
    const worldDir = `./${properties.levelName}`;
    const worldFile = `${worldDir}/world.save`;
    const worldSave = world.saveWorld();
    try {
        if (fs.existsSync(worldFile)) {
            const stats = fs.statSync(worldFile);
            if (stats.isDirectory()) {
                console.error(
                    `Error: ${worldFile} is a directory, cannot save world.`
                );
                return false;
            }
        }
        fs.mkdirSync(worldDir, { recursive: true });
        fs.writeFileSync(worldFile, JSON.stringify(worldSave, null));

        // Save all player data during autosave
        if (Array.isArray(players)) {
            players.forEach((player) => {
                const ip = getPlayerIpFromSocket(player.ws);
                savePlayerData(player, ip);
            });
        } else {
            serverLog(
                "Warning: players array is not initialized, skipping player data save"
            );
        }

        return true;
    } catch (error) {
        console.error(`Error saving world to ${worldFile}: ${error.message}`);
        return false;
    }
}

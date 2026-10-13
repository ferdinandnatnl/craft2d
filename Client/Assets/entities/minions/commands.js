import { BlockCategory, SpecialType } from "@2dcraft.com/shared/blockType.js";
import { InventoryItem } from "@2dcraft.com/shared/inventoryItem.js";
import { getBlock } from "../../world/block.js";
import { Items } from "@2dcraft.com/shared/items.js";
import { BLOCK_SIZE, CHUNK_WIDTH, multiplayer } from "../../utils/globals.js";
import { Vector2 } from "../../utils/classes.js";
import { runtime } from "../../utils/runtime.js";
import { input } from "../../utils/input.js";
import { activeDimension } from "../../world/dimension.js";
import { EntityTypes } from "../../game/entity.js";
import { Colors } from "../../game/chat.js";
import { playPositionalSound, playSound } from "../../game/sounds.js";
import { Minion } from "../mobs/minion.js";
import { getMinionConfig } from "./config.js";

const MAX_MINIONS = getMinionConfig().minionsPerPlayer;
const EVIL_DEEDS_TO_UNLOCK = 4;
const CHARGE_MILLISECONDS = 1000;
const activeCharges = new WeakMap();
let activeMenu = null;

const EVIL_DEED_SOUNDS = Object.freeze({
    "Spawn Satanist Cult": ["spawnsatanistcult", 3],
    "Hold dark Mess": ["gong", 1],
    "Aid Corporate Supremacy": ["corporatesupremacy", 4],
    "Manipulate Baseball League": ["BaseBallBatJingle", 3],
    "Destroy Cardboard boxes": ["FFF", 8],
    "Play someone off": ["keyboardcat", 3],
    "Unspeakable Act of Lust": ["romance", 7],
    "Join the Republicans": ["republicans", 4],
    "Desecrate a Grave": ["graveyard", 8],
    "Be Professional": ["boomheadshot", 2],
    "Cheat Death": ["denied", 1],
    "Mock Peace Nobel Prize": ["boo", 1],
    "Talk Demontongue": ["cornholio", 3],
    "Taunt the Liberals": ["crysomemore", 3],
    "Spread Sun Tzu Teachings": ["evillaugh", 3],
    "Jam Radio Frequencies": ["radios", 3],
    "Pass Gas in someones Face": ["pfft", 2],
    "Insurance Fraud": ["nooo", 3],
    "Supreme Hedonism": ["ohyeah", 8],
    "Baby Seal Clubbing": ["babysealclubbing", 6],
    "Nelson someone": ["haha", 1],
    "Support Fox News": ["march", 5],
    "Make Dinner": ["chicken", 2],
    "Disturb Burial Ceremony": ["laughter2", 3],
    "Become Pop Smash Star": ["superstarme", 5],
    "Corrupt Pure Nun Thoughts": ["teabagnuns", 5],
    "Mess up the plan": ["leeroy", 5],
});

function message(text, color = Colors.White) {
    runtime.game?.chat?.message(text, "", color);
}

function playMinionSound(sound, origin = runtime.world?.player?.position) {
    if (!origin) return;
    playPositionalSound(origin, `minions/${sound}.ogg`, 16, 0.8);
}

function playRandomMinionSound(prefix, count, origin) {
    const index = Math.floor(Math.random() * count) + 1;
    playMinionSound(`${prefix}${index}`, origin);
}

function selectedItem(player) {
    return player.inventory.items[3]?.[player.inventory.currentSlot]?.item ?? null;
}

function hasStaff(player) {
    return selectedItem(player)?.itemId === Items.MasterStaff;
}

function ownerMinions(player) {
    return runtime.world?.entities?.filter((entity) =>
        entity.isMinion && entity.ownerUUID === player.UUID && entity.health > 0,
    ) ?? [];
}

function hasWillPower(player) {
    return player.gamemode === 1 || player.foodLevel > 3;
}

function payBigOrderCost(player) {
    if (!hasWillPower(player)) {
        message("The staff needs your willpower. Eat before giving this order.", Colors.Red);
        return false;
    }
    if (player.gamemode !== 1) {
        player.addFoodExhaustion?.(getMinionConfig().foodCostBig);
    }
    return true;
}

function readClickTarget(player, storedPoint = null) {
    const position = storedPoint || input.getMousePositionOnBlockGrid();
    const tile = {
        x: Math.floor(position.x / BLOCK_SIZE),
        y: Math.floor(position.y / BLOCK_SIZE),
    };
    const block = runtime.world.getBlockAtWorldPosition(
        tile.x * BLOCK_SIZE,
        tile.y * BLOCK_SIZE,
        false,
        player.dimension ?? activeDimension,
    );
    return { tile, block };
}

function spawnMinion(player) {
    const workers = ownerMinions(player);
    if (workers.length >= MAX_MINIONS) {
        message("You can command up to four minions.", Colors.Red);
        return null;
    }
    if (!payBigOrderCost(player)) return null;
    const index = workers.length;
    const offset = (index % 2 === 0 ? -1 : 1) *
        Math.ceil((index + 1) / 2) * 0.62 * BLOCK_SIZE;
    const minion = runtime.world.summonEntity(
        Minion,
        new Vector2(
            player.position.x + offset,
            player.position.y + player.hitbox.y - 1.35 * BLOCK_SIZE,
        ),
        {
            ownerUUID: player.UUID,
            myChunkX: Math.floor(player.position.x / (CHUNK_WIDTH * BLOCK_SIZE)) * CHUNK_WIDTH * BLOCK_SIZE,
            dimension: player.dimension ?? activeDimension,
            direction: player.direction,
        },
        multiplayer,
    );
    minion.setJob({ type: "follow" });
    playMinionSound("minionspawn", minion.position);
    message(`Minion summoned (${workers.length + 1}/${MAX_MINIONS}).`, Colors.Green);
    return minion;
}

function commandWorkers(player, task) {
    const workers = ownerMinions(player);
    if (!workers.length) {
        message("Summon a minion first.", Colors.Red);
        return false;
    }
    if (["woodcut", "excavate", "mineshaft", "stripmine"].includes(task.type) &&
        !payBigOrderCost(player)) return false;
    const moveTargets = task.type === "move"
        ? getMoveFormationTargets(workers, task.target)
        : [];
    workers.forEach((worker, index) => {
        const assigned = structuredClone(task);
        if (assigned.type === "move") {
            if (!moveTargets[index]) {
                worker.setJob(null);
                worker.targetVelocity.x = 0;
                worker.velocity.x = 0;
                return;
            }
            assigned.target = moveTargets[index];
        }
        if (["mineshaft", "stripmine"].includes(assigned.type)) {
            const lane = index - (workers.length - 1) / 2;
            assigned.target.x += Math.round(lane);
            assigned.direction = assigned.direction < 0 ? -1 : 1;
        }
        worker.setJob(assigned);
    });
    const firstWorker = workers[0];
    if (task.type === "follow") playMinionSound("orderfollowplayer", firstWorker.position);
    else if (task.type === "woodcut") playRandomMinionSound("ordertreecutting", 4, firstWorker.position);
    else if (task.type === "mineshaft") playRandomMinionSound("ordermineshaft", 3, firstWorker.position);
    else playRandomMinionSound("randomorder", 5, firstWorker.position);
    return true;
}

function getMoveFormationTargets(workers, target) {
    const lead = workers[0];
    if (!lead || !target) return [];
    const distanceToTarget = (node) =>
        Math.abs(node.x - target.x) + Math.abs(node.y - target.y);
    const candidates = lead.stanceCandidatesNear(target, 4, 3)
        .sort((a, b) =>
            distanceToTarget(a) - distanceToTarget(b) ||
            Math.abs(a.x - target.x) - Math.abs(b.x - target.x) ||
            a.x - b.x || a.y - b.y);
    const slots = [];
    const maxWorkersAtDestination = Math.min(workers.length, 2);
    for (const candidate of candidates) {
        const overlaps = slots.some((slot) =>
            Math.abs(slot.x - candidate.x) < 1 &&
            Math.abs(slot.y - candidate.y) < 2,
        );
        if (overlaps) continue;
        slots.push({ x: candidate.x, y: candidate.y });
        if (slots.length >= maxWorkersAtDestination) break;
    }
    return slots;
}

function setPending(player, order) {
    player.pendingMinionOrder = order;
    closeMinionMenu(player);
    message(order.type === "excavate"
        ? "Right click the first corner of the excavation area."
        : order.type === "destination"
            ? "Right click a chest or other storage block."
            : `Right click the location for ${order.type}.`, Colors.Yellow);
}

function startAreaSelection(player, tile) {
    if (!player.pendingMinionOrder?.firstCorner) {
        player.pendingMinionOrder = { type: "excavate", firstCorner: tile };
        message("Now right click the opposite corner.", Colors.Yellow);
        return true;
    }
    const first = player.pendingMinionOrder.firstCorner;
    const bounds = {
        minX: Math.min(first.x, tile.x),
        maxX: Math.max(first.x, tile.x),
        minY: Math.min(first.y, tile.y),
        maxY: Math.max(first.y, tile.y),
    };
    player.pendingMinionOrder = null;
    if (bounds.maxX - bounds.minX + 1 > 64 || bounds.maxY - bounds.minY + 1 > 64) {
        message("Excavation areas must fit inside 64 by 64 blocks.", Colors.Red);
        return false;
    }
    const assigned = commandWorkers(player, { type: "excavate", bounds });
    if (assigned) message("Minions are excavating the selected area.", Colors.Green);
    return assigned;
}

function setDeliveryDestination(player, tile, block) {
    if (!Array.isArray(block?.metaData?.storage) || block.metaData.storage.flat().length <= 23) {
        message("That block does not have enough storage for minion deliveries.", Colors.Red);
        return false;
    }
    const destination = { ...tile, dimension: player.dimension ?? activeDimension };
    const workers = ownerMinions(player);
    if (!workers.length) {
        message("Summon a minion first.", Colors.Red);
        return false;
    }
    workers.forEach((worker) => worker.setDeliveryDestination(destination));
    player.pendingMinionOrder = null;
    message("Delivery chest assigned.", Colors.Green);
    return true;
}

function isWood(block) {
    const def = getBlock(block?.blockType);
    if (!def) return false;
    return def.category === BlockCategory.Logs ||
        /leaves|leaf|foliage/i.test(def.name) ||
        (/\b(log|wood|stem)\b/i.test(def.name) && !/planks/i.test(def.name));
}

function isOre(block) {
    return /ore/i.test(getBlock(block?.blockType)?.name || "");
}

function isPlayerNearTile(player, tile) {
    const x = Math.floor((player.position.x + player.hitbox.x / 2) / BLOCK_SIZE);
    const footY = Math.round((player.position.y + player.hitbox.y) / BLOCK_SIZE);
    return Math.abs(x - tile.x) <= 1 && tile.y >= footY - 1 && tile.y <= footY + 1;
}

function orderCarry(player, target) {
    const workers = ownerMinions(player);
    if (!workers.length) return message("Summon a minion first.", Colors.Red);
    const worker = workers.sort((a, b) =>
        Math.abs(a.position.x - target.position.x) -
        Math.abs(b.position.x - target.position.x),
    )[0];
    worker.setJob({ type: "carry", targetUUID: target.UUID });
    playMinionSound("grabanimalorder", worker.position);
    message(target === player
        ? "A minion will carry you. Right click the minion to get down."
        : "A minion is going to pick up that entity.", Colors.Green);
}

function handleContextOrder(player, point = null) {
    const { tile, block } = readClickTarget(player, point);
    const pending = player.pendingMinionOrder;
    if (pending?.type === "excavate") return startAreaSelection(player, tile);
    if (pending?.type === "destination") return setDeliveryDestination(player, tile, block);
    if (pending?.type === "mineshaft" || pending?.type === "stripmine") {
        const type = pending.type;
        player.pendingMinionOrder = null;
        const assigned = commandWorkers(player, {
            type,
            target: tile,
            direction: player.direction,
        });
        if (assigned) message(type === "mineshaft"
            ? "Minions are digging a stairwell here."
            : "Minions are starting a strip mine here.", Colors.Green);
        return assigned;
    }
    if (pending?.type === "move") {
        player.pendingMinionOrder = null;
        const assigned = commandWorkers(player, { type: "move", target: tile });
        if (assigned) message("Minions are moving to that location.", Colors.Green);
        return assigned;
    }

    if (!ownerMinions(player).length) {
        spawnMinion(player);
        return true;
    }

    const pointedEntity = player.checkForEntityOnMouse();
    if (pointedEntity?.isMinion && pointedEntity.ownerUUID === player.UUID) {
        if (pointedEntity.carriedEntityUUID) pointedEntity.releaseCarriedEntity();
        pointedEntity.dropInventory();
        pointedEntity.setJob({ type: "follow" });
        playRandomMinionSound("foryou", 4, pointedEntity.position);
        message("Minion released its cargo and will follow you.", Colors.Green);
        return true;
    }
    if (block?.metaData?.storage && Array.isArray(block.metaData.storage)) {
        return setDeliveryDestination(player, tile, block);
    }
    if (pointedEntity === player) {
        orderCarry(player, player);
        return true;
    }
    if (pointedEntity && pointedEntity !== player &&
        pointedEntity.type !== EntityTypes.Drop && pointedEntity.health > 0) {
        orderCarry(player, pointedEntity);
        return true;
    }
    if (isPlayerNearTile(player, tile) && ownerMinions(player).length < MAX_MINIONS) {
        spawnMinion(player);
        return true;
    }
    if (isWood(block)) {
        const assigned = commandWorkers(player, { type: "woodcut", target: tile });
        if (assigned) message("Minions are harvesting nearby trees.", Colors.Green);
        return assigned;
    }
    if (isOre(block)) {
        const assigned = commandWorkers(player, {
            type: "mine-vein",
            target: tile,
            blockType: block.blockType,
        });
        if (assigned) message("Minions are mining the connected vein.", Colors.Green);
        return assigned;
    }
    const assigned = commandWorkers(player, { type: "move", target: tile });
    if (assigned) message("Minions are moving to that location.", Colors.Green);
    return assigned;
}

export function handleMasterStaffInput(player) {
    if (!hasStaff(player)) return false;
    const pressed = input.isActionPressed("place");
    const down = input.isActionDown("place");
    let charge = activeCharges.get(player);
    if (down) {
        if (!charge) {
            charge = {
                startedAt: Date.now(),
                point: input.getMousePositionOnBlockGrid(),
            };
            activeCharges.set(player, charge);
        }
        return true;
    }
    if (charge) {
        activeCharges.delete(player);
        if (Date.now() - charge.startedAt >= CHARGE_MILLISECONDS) {
            const assigned = commandWorkers(player, { type: "follow" });
            if (assigned) message("Minions will follow you.", Colors.Green);
        } else {
            handleContextOrder(player, charge.point);
        }
        return true;
    }
    if (pressed) {
        handleContextOrder(player);
        return true;
    }
    return false;
}

export function handleMasterStaffAttack(player) {
    if (!hasStaff(player)) return false;
    const entity = player.checkForEntityOnMouse();
    if (!entity?.isMinion || entity.ownerUUID !== player.UUID) return false;
    if (!input.isActionPressed("attack")) return false;
    if (!hasWillPower(player)) {
        message("You are too hungry to encourage the minion.", Colors.Red);
        return true;
    }
    entity.encourage();
    if (player.gamemode !== 1) {
        player.addFoodExhaustion?.(getMinionConfig().foodCostSmall);
    }
    message("The minion is working faster.", Colors.Green);
    return true;
}

export function toggleMinionMenu(player) {
    if (activeMenu?.player === player) {
        closeMinionMenu(player);
        return;
    }
    closeMinionMenu(activeMenu?.player);
    player.minionMenuOpen = true;
    const root = document.createElement("div");
    root.className = "minion-menu-backdrop";
    root.setAttribute("role", "presentation");
    const panel = document.createElement("section");
    panel.className = "minion-menu-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "minion-menu-title");
    const config = getMinionConfig();
    const progress = player.minionProgress || { evilDeeds: 0, unlocked: false };
    player.minionProgress = {
        evilDeeds: Math.max(0, Math.min(4, Math.floor(progress.evilDeeds || 0))),
        unlocked: progress.unlocked === true,
    };
    const title = document.createElement("h2");
    title.id = "minion-menu-title";
    title.textContent = player.minionProgress.unlocked
        ? "Master's Staff"
        : player.minionMenuPage === "evil-deeds" ? "Choose your part" : "Evil Deeds";
    panel.append(title);
    if (!player.minionProgress.unlocked) {
        if (player.minionMenuPage === "evil-deeds") {
            const status = document.createElement("p");
            status.textContent = `Choose an evil deed · costs ${config.evilDeedXPCost} experience levels`;
            panel.append(status);
            for (const deed of player.pendingEvilDeedOptions || []) {
                addButton(panel, deed, () => performEvilDeed(player, deed));
            }
            addButton(panel, "Back", () => {
                closeMinionMenu(player);
                toggleMinionMenu(player);
            });
        } else {
            const status = document.createElement("p");
            status.textContent = `Experience level ${player.xpLevel}/8 · Evil deeds ${player.minionProgress.evilDeeds}/${EVIL_DEEDS_TO_UNLOCK}`;
            panel.append(status);
            if (config.evilDeedXPCost === -1) {
                const note = document.createElement("p");
                note.textContent = "Evil deeds are disabled by configuration.";
                panel.append(note);
            } else if (!config.evilDeeds.length) {
                const note = document.createElement("p");
                note.textContent = "No evil deeds are configured.";
                panel.append(note);
            } else {
                addButton(panel,
                    `Commit to evil · spend ${config.evilDeedXPCost} levels`,
                    () => openEvilDeedSelection(player),
                    player.xpLevel < config.evilDeedXPCost,
                );
            }
        }
    } else {
        const count = document.createElement("p");
        count.textContent = `Minions ${ownerMinions(player).length}/${MAX_MINIONS}`;
        panel.append(count);
        addButton(panel, "Summon a minion", () => spawnMinion(player),
            ownerMinions(player).length >= MAX_MINIONS);
        addButton(panel, "Follow me", () => {
            commandWorkers(player, { type: "follow" });
            closeMinionMenu(player);
        });
        addButton(panel, "Recall and deliver cargo", () => {
            commandWorkers(player, { type: "return" });
            closeMinionMenu(player);
        });
        addButton(panel, "Set delivery chest", () => setPending(player, { type: "destination" }));
        addButton(panel, "Dig a mineshaft", () => setPending(player, { type: "mineshaft" }));
        addButton(panel, "Strip mine", () => setPending(player, { type: "stripmine" }));
        addButton(panel, "Excavate an area", () => setPending(player, { type: "excavate" }));
        addButton(panel, "Move to a location", () => setPending(player, { type: "move" }));
    }
    addButton(panel, "Close", () => closeMinionMenu(player));
    root.append(panel);
    root.addEventListener("click", (event) => {
        if (event.target === root) closeMinionMenu(player);
    });
    const escapeHandler = (event) => {
        if (event.code === "Escape") {
            event.preventDefault();
            event.stopImmediatePropagation();
            closeMinionMenu(player);
            return;
        }
        if (event.key !== "Tab") return;
        const buttons = [...panel.querySelectorAll("button:not(:disabled)")];
        if (!buttons.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };
    document.addEventListener("keydown", escapeHandler, true);
    ensureMenuStyles();
    document.body.append(root);
    activeMenu = {
        player,
        root,
        escapeHandler,
        returnFocus: document.activeElement,
    };
    panel.querySelector("button")?.focus();
}

function addButton(panel, label, action, disabled = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.disabled = Boolean(disabled);
    button.addEventListener("click", () => action());
    panel.append(button);
}

function openEvilDeedSelection(player) {
    const deeds = [...getMinionConfig().evilDeeds];
    const selected = [];
    while (selected.length < 3 && deeds.length) {
        const index = Math.floor(Math.random() * deeds.length);
        selected.push(deeds.splice(index, 1)[0]);
    }
    closeMinionMenu(player);
    player.minionMenuPage = "evil-deeds";
    player.pendingEvilDeedOptions = selected;
    toggleMinionMenu(player);
}

function performEvilDeed(player, deed) {
    const cost = getMinionConfig().evilDeedXPCost;
    const progress = player.minionProgress;
    if (cost < 0 || progress.unlocked || player.xpLevel < cost) return;
    const [sound, duration] = EVIL_DEED_SOUNDS[deed] || ["randomorder1", 1];
    player.xpLevel -= cost;
    progress.evilDeeds++;
    player.minionBlindnessStartedAt = runtime.passedTime;
    player.minionBlindnessUntil = runtime.passedTime + duration * 1.5;
    playSound(`minions/${sound}.ogg`, 0.85);
    if (progress.evilDeeds >= EVIL_DEEDS_TO_UNLOCK) {
        progress.evilDeeds = EVIL_DEEDS_TO_UNLOCK;
        progress.unlocked = true;
        const staff = new InventoryItem({ itemId: Items.MasterStaff, count: 1 });
        const leftover = player.inventory.addItem(staff);
        if (leftover > 0) {
            runtime.world.spawnDrop(new Vector2(player.position.x, player.position.y), {
                itemId: Items.MasterStaff,
                count: leftover,
            });
        }
        if (multiplayer) player.inventory.syncInventoryMultiplayer();
        setTimeout(() => playSound("minions/thegodshaverewardedyouroffering.ogg", 0.9), duration * 1000);
        message(`${deed} accepted. The dark gods grant you the Master's Staff.`, Colors.Green);
    } else {
        setTimeout(() => playSound("minions/thegodsarepleaseedwithyoursacrifice.ogg", 0.85), duration * 1000);
        message(`${deed} accepted (${progress.evilDeeds}/${EVIL_DEEDS_TO_UNLOCK}).`, Colors.Green);
    }
    closeMinionMenu(player);
}

export function closeMinionMenu(player = activeMenu?.player) {
    if (!player) return;
    player.minionMenuOpen = false;
    player.minionMenuPage = null;
    player.pendingEvilDeedOptions = null;
    if (activeMenu?.player === player) {
        const returnFocus = activeMenu.returnFocus;
        document.removeEventListener("keydown", activeMenu.escapeHandler, true);
        activeMenu.root.remove();
        activeMenu = null;
        returnFocus?.focus?.({ preventScroll: true });
    }
}

function ensureMenuStyles() {
    if (document.getElementById("minion-menu-styles")) return;
    const style = document.createElement("style");
    style.id = "minion-menu-styles";
    style.textContent = `
      .minion-menu-backdrop { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: 16px; background: rgba(0,0,0,.62); }
      .minion-menu-panel { box-sizing: border-box; display: grid; gap: 8px; width: min(380px, calc(100vw - 32px)); max-height: 90dvh; overflow-y: auto; padding: 18px; border: 4px solid #373737; outline: 2px solid #dedede; background: #c6c6c6; color: #202020; box-shadow: 0 8px 0 rgba(0,0,0,.42); font: 16px/1.4 Minecraftia, monospace; text-shadow: 1px 1px #fff; }
      .minion-menu-panel h2 { margin: 0 0 4px; font-size: 18px; text-align: center; }
      .minion-menu-panel p { margin: 0 0 8px; }
      .minion-menu-panel button { min-height: 44px; padding: 8px 10px; border: 2px solid #373737; background: #777; color: #fff; font: inherit; text-shadow: 1px 1px #222; cursor: pointer; touch-action: manipulation; }
      .minion-menu-panel button:focus-visible { outline: 3px solid #222; outline-offset: 2px; }
      .minion-menu-panel button:disabled { color: #ddd; opacity: .65; cursor: not-allowed; }
      @media (hover: hover) and (pointer: fine) { .minion-menu-panel button:hover:not(:disabled) { background: #858585; } }
    `;
    document.head.append(style);
}

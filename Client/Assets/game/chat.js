import { runtime } from "../utils/runtime.js";
import { Entities } from "../entities/entities.js";
import { InventoryItem } from "./inventoryItem.js";
import { getItem } from "@2dcraft.com/shared/item.js";
import { Items } from "@2dcraft.com/shared/items.js";
import { Vector2 } from "../utils/classes.js";
import { BLOCK_SIZE, CHUNK_WIDTH, multiplayer } from "../utils/globals.js";
import { CANVAS, drawText } from "../utils/renderer.js";
import { screenshotNearestChunks } from "../utils/screenshotChunks.js";
import { AllBiomes } from "@2dcraft.com/shared/biome.js";
import { getBlock } from "../world/block.js";
import { Blocks } from "@2dcraft.com/shared/blocks.js";
import { Dimensions, activeDimension, enterEnd, gotoDimension } from "../world/dimension.js";
import { currentSave, saveWorld } from "../world/saving.js";
import { Structures } from "@2dcraft.com/shared/structures.js";

export class Chat {
    constructor() {
        this.inChat = false;

        this.messages = [];
        this.chatLog = [];
        this.tempMessages = [];

        this.currentMessage = "";
        this.cursorPosition = 0;
        this.selectionStart = 0;
        this.selectionEnd = 0;

        this.cursorBlinkTime = 0;
        this.showCursor = true;

        this.maxLength = 50;
        this.messageDuration = 8000;

        this.historyIndex = 0;
        this.viewHistory = 25;

        this.suggestions = [];
        this.suggestionIndex = -1;
        this.originalInput = "";
        this.completionStart = 0;
        this.completionEnd = 0;

        this.loadLog();
        this._boundKeyHandler = this._handleChatKeyDown.bind(this);
    }

    openChat() {
        this.historyIndex = 0;
        this.inChat = true;
        this.clearSelection();
        if (runtime.world.player) runtime.world.player.canMove = false;
        document.addEventListener("keydown", this._boundKeyHandler, {
            capture: true,
        });
    }

    closeChat() {
        this.inChat = false;
        if (runtime.world.player) runtime.world.player.canMove = true;
        document.removeEventListener("keydown", this._boundKeyHandler, {
            capture: true,
        });
        this.currentMessage = "";
        this.cursorPosition = 0;
        this.clearSelection();
        this.resetAutocomplete();
    }

    _handleChatKeyDown(event) {
        event.preventDefault();
        const key = event.key;

        if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === "a") {
            this.resetAutocomplete();
            this.selectionStart = 0;
            this.selectionEnd = this.currentMessage.length;
            this.cursorPosition = this.currentMessage.length;
            return;
        }

        if (key === "Escape") {
            this.closeChat();
            event.stopPropagation();
            return;
        }
        if (key === "Enter") {
            this.send();
            return;
        }
        if (key === "Tab") {
            this.autocomplete();
            return;
        }
        if (key === "Backspace") {
            this.resetAutocomplete();
            if (this.hasSelection()) {
                const start = Math.min(this.selectionStart, this.selectionEnd);
                const end = Math.max(this.selectionStart, this.selectionEnd);
                this.currentMessage =
                    this.currentMessage.slice(0, start) +
                    this.currentMessage.slice(end);
                this.cursorPosition = start;
            } else if (this.cursorPosition > 0) {
                this.currentMessage =
                    this.currentMessage.slice(0, this.cursorPosition - 1) +
                    this.currentMessage.slice(this.cursorPosition);
                this.cursorPosition--;
            }
            this.clearSelection();
            return;
        }
        if (key === "Delete") {
            this.resetAutocomplete();
            if (this.hasSelection()) {
                const start = Math.min(this.selectionStart, this.selectionEnd);
                const end = Math.max(this.selectionStart, this.selectionEnd);
                this.currentMessage =
                    this.currentMessage.slice(0, start) +
                    this.currentMessage.slice(end);
                this.cursorPosition = start;
            } else if (this.cursorPosition < this.currentMessage.length) {
                this.currentMessage =
                    this.currentMessage.slice(0, this.cursorPosition) +
                    this.currentMessage.slice(this.cursorPosition + 1);
            }
            this.clearSelection();
            return;
        }
        if (key === "ArrowLeft") {
            this.resetAutocomplete();
            this.cursorPosition = this.hasSelection()
                ? Math.min(this.selectionStart, this.selectionEnd)
                : Math.max(0, this.cursorPosition - 1);
            this.clearSelection();
            return;
        }
        if (key === "ArrowRight") {
            this.resetAutocomplete();
            this.cursorPosition = this.hasSelection()
                ? Math.max(this.selectionStart, this.selectionEnd)
                : Math.min(
                      this.currentMessage.length,
                      this.cursorPosition + 1,
                  );
            this.clearSelection();
            return;
        }
        if (key === "ArrowUp") {
            this.resetAutocomplete();
            this.clearSelection();
            if (
                this.chatLog.length > 0 &&
                this.historyIndex < this.chatLog.length
            ) {
                if (this.historyIndex === -1) this.historyIndex = 0;
                this.historyIndex++;
                this.currentMessage =
                    this.chatLog[this.chatLog.length - this.historyIndex];
                this.cursorPosition = this.currentMessage.length;
            }
            return;
        }
        if (key === "ArrowDown") {
            this.resetAutocomplete();
            this.clearSelection();
            if (this.historyIndex > 1) {
                this.historyIndex--;
                this.currentMessage =
                    this.chatLog[this.chatLog.length - this.historyIndex];
                this.cursorPosition = this.currentMessage.length;
            } else if (this.historyIndex === 1) {
                this.historyIndex = -1;
                this.currentMessage = "";
                this.cursorPosition = 0;
            }
            return;
        }

        if (
            event.key.length === 1 &&
            event.key.charCodeAt(0) >= 32 &&
            !event.ctrlKey &&
            !event.altKey &&
            !event.metaKey
        ) {
            const start = this.hasSelection()
                ? Math.min(this.selectionStart, this.selectionEnd)
                : this.cursorPosition;
            const end = this.hasSelection()
                ? Math.max(this.selectionStart, this.selectionEnd)
                : this.cursorPosition;
            if (this.currentMessage.length - (end - start) >= this.maxLength)
                return;
            if (event.repeat) return;
            this.resetAutocomplete();
            this.currentMessage =
                this.currentMessage.slice(0, start) +
                key +
                this.currentMessage.slice(end);
            this.cursorPosition = start + key.length;
            this.clearSelection();
        }
    }

    send() {
        let message = this.currentMessage;

        if (!this.isValidText(message)) {
            this.closeChat();
            return;
        }

        this.addToLog(this.currentMessage);

        let color = Colors.White; // Default color for regular messages
        if (this.currentMessage.startsWith("/", 0)) {
            this.doCheat(
                this.currentMessage.slice(1, this.currentMessage.length),
            );
            message = "";
            color = Colors.Yellow; // Cheat commands use yellow
        }

        if (multiplayer && this.isValidText(message)) {
            runtime.server.send({
                type: "chat",
                message: message,
                sender: runtime.world.player.UUID,
                color,
            });
        }

        if (message) {
            this.message(message, runtime.world.player.name, color);
        }

        this.closeChat();
    }

    welcomeMessage() {
        this.message(
            "------------------------------------------------------",
            "",
            Colors.Green,
            true,
        );
        this.message(
            "Welcome to craft2d.com! Type /progress for an adventure guide.",
            "",
            Colors.Green,
        );
        this.message(
            "This is a 2D Minecraft experience built with JavaScript.",
            "",
            Colors.Green,
        );
        this.message(
            "Follow @ferdinandnatnl on Twitter.",
            "",
            Colors.Green,
        );
        this.message(
            "------------------------------------------------------",
            "",
            Colors.Green,
            true,
        );
    }

    getCommandSuggestions() {
        return [
            { name: "give", args: ["category.item", "count"] },
            { name: "clear", args: [] },
            { name: "clearlog", args: [] },
            { name: "gamemode", args: ["mode"] },
            { name: "tp", args: ["playerOrX", "y"], usage: "<player> | <x> <y>" },
            { name: "teleport", args: ["playerOrX", "y"], usage: "<player> | <x> <y>" },
            { name: "spawnpoint", args: ["x", "y"] },
            { name: "summon", args: ["entity", "x", "y", "count"] },
            { name: "kill", args: [] },
            {
                name: "time",
                args: ["time"],
                usage: "set <day|noon|night|midnight> | <1 - 7.5> | query",
            },
            { name: "help", args: ["command"], usage: "[command]" },
            { name: "progress", args: [] },
            { name: "structure", args: ["structure"] },
            { name: "locate", args: ["structure"] },
            { name: "locatebiome", args: ["biome"] },
            { name: "seed", args: [] },
            { name: "hit", args: ["damage"] },
            { name: "gamerule", args: ["rule", "value"] },
            { name: "dim", args: ["dimension"] },
            { name: "dimension", args: ["dimension"] },
            { name: "setblock", args: ["block", "x", "y"] },
            { name: "fill", args: ["block", "x", "y", "x", "y"] },
            { name: "difficulty", args: ["difficulty"] },
            { name: "screenshot", args: ["count", "lighting"] },
            {
                name: "weather",
                args: ["weather", "duration"],
                usage: "<clear|rain|thunder|query> [durationSeconds]",
            },
            { name: "heal", args: ["amount"], usage: "[amount]" },
            { name: "feed", args: ["amount"], usage: "[amount]" },
            { name: "xp", args: ["xpAction", "amount"], usage: "<add|set> <levels>" },
            { name: "experience", args: ["xpAction", "amount"], usage: "<add|set> <levels>" },
            { name: "spawn", args: [] },
            { name: "position", args: [] },
            { name: "where", args: [] },
            { name: "fly", args: ["toggle"], usage: "[on|off]" },
            { name: "list", args: [] },
            { name: "save", args: [] },
        ];
    }

    resetAutocomplete() {
        this.suggestions = [];
        this.suggestionIndex = -1;
        this.originalInput = "";
        this.completionStart = 0;
        this.completionEnd = 0;
    }

    hasSelection() {
        return this.selectionStart !== this.selectionEnd;
    }

    clearSelection() {
        this.selectionStart = this.cursorPosition;
        this.selectionEnd = this.cursorPosition;
    }

    getCompletionContext() {
        if (!this.currentMessage.startsWith("/")) return null;

        const beforeCursor = this.currentMessage.slice(0, this.cursorPosition);
        const token = beforeCursor.match(/\S+$/)?.[0] ?? "";
        const start = this.cursorPosition - token.length;
        const end = this.currentMessage.slice(this.cursorPosition).match(/^\S*/)[0]
            .length + this.cursorPosition;
        const argIndex = beforeCursor.slice(0, start).trim().split(/\s+/)
            .filter(Boolean).length;

        return { start, end, argIndex, prefix: token };
    }

    getAvailableSuggestions(context) {
        return this.generateSuggestions(
            this.currentMessage.slice(0, this.cursorPosition),
            context.argIndex,
            context.prefix,
        ).filter((suggestion) =>
            this.currentMessage.length - (context.end - context.start) +
                suggestion.length + (context.argIndex === 0 ? 1 : 0) <=
            this.maxLength,
        );
    }

    generateSuggestions(input, argIndex, currentPrefix = "") {
        const commands = this.getCommandSuggestions();
        const parts = input.trim().split(/\s+/);
        const isCommand = input.startsWith("/") && argIndex === 0;

        if (isCommand) {
            const prefix = parts[0].slice(1).toLowerCase();
            const suggestions = commands
                .filter((cmd) => cmd.name.toLowerCase().startsWith(prefix))
                .map((cmd) => cmd.name);
            return suggestions;
        } else {
            const commandName = parts[0].slice(1).toLowerCase();
            const command = commands.find(
                (cmd) => cmd.name.toLowerCase() === commandName,
            );
            if (!command) {
                return [];
            }

            const argType = command.args[argIndex - 1];
            const prefix = currentPrefix.toLowerCase();

            if (
                commandName === "time" &&
                argIndex === 2 &&
                parts[1]?.toLowerCase() === "set"
            ) {
                return ["day", "noon", "night", "midnight"].filter((time) => time.startsWith(prefix));
            }

            let suggestions;
            switch (argType) {
                case "category.item":
                    const blockItems = Object.keys(Blocks).map(
                        (name) => `Blocks.${name}`,
                    );
                    const items = Object.keys(Items).map(
                        (name) => `Items.${name}`,
                    );
                    const itemSuggestions = [...blockItems, ...items].filter(
                        (item) => item.toLowerCase().startsWith(prefix),
                    );
                    suggestions = itemSuggestions;
                    break;
                case "count":
                case "damage":
                    suggestions = ["1", "64"];
                    break;
                case "amount":
                    suggestions = commandName === "xp" || commandName === "experience"
                        ? ["1", "5", "10", "100", "9999"]
                        : ["1", "5", "10", "20"];
                    break;
                case "xpAction":
                    suggestions = ["add", "set"];
                    break;
                case "toggle":
                    suggestions = ["on", "off"];
                    break;
                case "weather":
                    suggestions = ["clear", "rain", "thunder", "query"];
                    break;
                case "duration":
                    suggestions = ["30", "300", "600"];
                    break;
                case "command":
                    suggestions = commands.map((cmd) => cmd.name);
                    break;
                case "mode":
                    suggestions = [
                        "survival",
                        "creative",
                        "adventure",
                        "spectator",
                        "0",
                        "1",
                        "2",
                        "3",
                    ];
                    break;

                case "x":
                case "y":
                    suggestions = [
                        "~",
                        "0",
                        runtime.world.player
                            ? runtime.world.worldToBlocks(
                                  runtime.world.player.position,
                              )[argType].toString()
                            : "0",
                    ];
                    break;

                case "playerOrX": {
                    const currentX = runtime.world?.player
                        ? runtime.world.worldToBlocks(runtime.world.player.position).x.toString()
                        : "0";
                    suggestions = [
                        "~",
                        "0",
                        currentX,
                        ...this.getOnlinePlayers().map((player) => player.name),
                    ];
                    break;
                }

                case "entity":
                    const entitySuggestions = Object.keys(Entities).filter(
                        (entity) => entity.toLowerCase().startsWith(prefix),
                    );
                    suggestions = entitySuggestions;
                    break;
                case "structure":
                    const structureSuggestions = Object.keys(Structures).filter(
                        (structure) =>
                            structure.toLowerCase().startsWith(prefix),
                    );
                    suggestions = structureSuggestions;
                    break;
                case "biome":
                    const biomeSuggestions = Object.keys(AllBiomes).filter(
                        (biome) => biome.toLowerCase().startsWith(prefix),
                    );
                    suggestions = biomeSuggestions;
                    break;
                case "rule":
                    const ruleSuggestions = [
                        ...Object.keys(runtime.GAMERULES),
                        "list",
                    ].filter((rule) => rule.toLowerCase().startsWith(prefix));
                    suggestions = ruleSuggestions;
                    break;
                case "value":
                    suggestions = ["true", "false"];
                    break;
                case "dimension":
                    suggestions = ["overworld", "nether", "end", "0", "1", "2"];
                    break;
                case "time":
                    suggestions = ["set", "query", "1", "3", "5", "7.5"];
                    break;
                case "block":
                    const blockSuggestions = Object.keys(Blocks).filter(
                        (block) => block.toLowerCase().startsWith(prefix),
                    );
                    suggestions = blockSuggestions;
                    break;
                case "difficulty":
                    suggestions = ["peaceful", "easy"];
                    break;
                case "lighting":
                    suggestions = ["true", "false"];
                    break;
                default:
                    return [];
            }
            return [...new Set(suggestions)].filter((suggestion) =>
                suggestion.toLowerCase().startsWith(prefix),
            );
        }
    }

    difficulty(messageArray) {
        if (!messageArray[1]) {
            this.invalidCommand("/difficulty <difficulty>");
            return;
        }

        const difficulty = messageArray[1].toLowerCase();

        switch (difficulty) {
            case "peaceful":
                runtime.world.setDifficulty("peaceful");
                break;
            case "easy":
                runtime.world.setDifficulty("easy");
                break;
            default:
                this.invalidCommand("/difficulty <difficulty>");
                return;
        }

        this.cheatMessage(`Difficulty set to ${difficulty}.`);
    }

    autocomplete() {
        if (!this.inChat) return;
        this.clearSelection();

        if (this.suggestionIndex === -1) {
            const context = this.getCompletionContext();
            if (!context) return;
            this.originalInput = this.currentMessage;
            this.completionStart = context.start;
            this.completionEnd = context.end;
            this.suggestions = this.getAvailableSuggestions(context);
        }

        if (this.suggestions.length === 0) return;

        this.suggestionIndex =
            (this.suggestionIndex + 1) % this.suggestions.length;
        const suggestion = this.suggestions[this.suggestionIndex];
        const replacement = this.completionStart === 0 ? `/${suggestion}` : suggestion;
        this.currentMessage =
            this.originalInput.slice(0, this.completionStart) +
            replacement +
            this.originalInput.slice(this.completionEnd);
        this.cursorPosition = this.completionStart + replacement.length;
    }

    addToLog(message) {
        if (this.chatLog[this.chatLog.length - 1] == message) return;
        this.chatLog.push(message);

        this.saveLog();
    }

    saveLog() {
        localStorage.setItem("log", JSON.stringify(this.chatLog));
    }

    loadLog() {
        const loadedLog = JSON.parse(localStorage.getItem("log"));
        if (loadedLog) this.chatLog = loadedLog;
    }

    locateBiome(messageArray) {
        if (!messageArray[1]) {
            this.invalidCommand("/locatebiome <BiomeName>");
            return;
        }

        const biomeName = messageArray[1];
        const biome = AllBiomes[biomeName];

        if (biome) {
            const biomeChunkX = runtime.world.generator.locateBiome(biome);

            if (!biomeChunkX) {
                this.message("Biome not found.", "", Colors.Red);
                return;
            }
            const chunkPos = biomeChunkX * CHUNK_WIDTH;
            this.message(
                `Biome ${biomeName} found at ${chunkPos}.`,
                "",
                Colors.Green,
            );
        } else {
            this.message("Biome not found.", "", Colors.Red);
        }
    }

    locate(messageArray) {
        if (messageArray[1]?.toLowerCase() !== "village") {
            this.invalidCommand("/locate village");
            return;
        }

        const village = runtime.world.generator.locateVillage();
        if (!village) {
            this.message("No village found in this world.", "", Colors.Red);
            return;
        }

        const playerX = Math.floor(runtime.world.player.position.x / BLOCK_SIZE);
        const distance = village.x - playerX;
        const direction = distance > 0 ? "east" : distance < 0 ? "west" : "here";
        this.message(
            `Nearest village: x ${village.x}, y ${village.y} (${Math.abs(distance)} blocks ${direction}; Overworld).`,
            "",
            Colors.Green,
        );
    }

    clearLog() {
        this.chatLog = [];
        this.saveLog();
        this.message("Cleared chat history", "", Colors.Green);
    }

    isValidText(text) {
        return text != null && text.trim().length > 0;
    }

    doCheat(message) {
        const messageArray = message.trim().split(/\s+/);
        const cheat = messageArray[0]?.toLowerCase();

        switch (cheat) {
            case "give":
                this.give(messageArray);
                break;
            case "clear":
                this.clear();
                break;
            case "clearlog":
                this.clearLog();
                break;
            case "gamemode":
                this.gamemode(messageArray);
                break;
            case "tp":
            case "teleport":
                this.teleport(messageArray);
                break;
            case "summon":
                this.summon(messageArray);
                break;
            case "kill":
                if (!runtime.world.player) break;
                runtime.world.player.dieEvent();
                break;
            case "time":
                this.setTime(messageArray);
                break;
            case "help":
                this.printHelp(messageArray);
                break;
            case "progress":
                this.printProgress();
                break;
            case "structure":
                this.structure(messageArray);
                break;
            case "locatebiome":
                this.locateBiome(messageArray);
                break;
            case "locate":
                this.locate(messageArray);
                break;
            case "seed":
                this.message(`Seed: ${runtime.world.seed}`);

                if (!navigator?.clipboard) {
                    this.message(
                        "Clipboard API not available. Unable to copy seed.",
                        "",
                        Colors.Red,
                    );
                } else {
                    navigator.clipboard.writeText(runtime.world.seed);
                }
                this.message("Seed copied to clipboard.", "", Colors.Green);
                break;
            case "hit":
                if (!runtime.world.player) break;
                this.hitPlayer(messageArray);
                break;
            case "spawnpoint":
                this.spawnpoint(messageArray);
                break;
            case "gamerule":
                this.gameRule(messageArray);
                break;
            case "dim":
            case "dimension":
                this.dimension(messageArray);
                break;
            case "setblock":
                this.setBlock(messageArray);
                break;
            case "fill":
                this.fill(messageArray);
                break;
            case "difficulty":
                this.difficulty(messageArray);
                break;
            case "screenshot":
                this.screenshot(messageArray);
                break;
            case "weather":
                this.weather(messageArray);
                break;
            case "heal":
                this.heal(messageArray);
                break;
            case "feed":
                this.feed(messageArray);
                break;
            case "xp":
            case "experience":
                this.experience(messageArray);
                break;
            case "spawn":
                this.spawn();
                break;
            case "position":
            case "where":
                this.position();
                break;
            case "fly":
                this.fly(messageArray);
                break;
            case "list":
                this.listPlayers();
                break;
            case "save":
                this.save();
                break;
            default:
                this.message("Invalid Command!", "", Colors.Red);
                break;
        }

        this.closeChat();
    }

    screenshot(messageArray) {
        const chunkCount = messageArray[1] ? parseInt(messageArray[1]) : 10;
        // True or false (default true)
        const lighting = messageArray[2]
            ? messageArray[2].toLowerCase() === "true"
            : false;

        if (isNaN(chunkCount) || chunkCount <= 0) {
            this.invalidCommand("/screenshot <chunkCount> <lighting>");
            return;
        }

        const filename = `screenshot_${runtime.world.name}_${Date.now()}.png`;

        this.cheatMessage(
            `Capturing screenshot of nearest ${chunkCount} chunks...`,
        );

        screenshotNearestChunks(chunkCount, lighting, filename);
    }

    fill(messageArray) {
        // Use the fill function
        if (!messageArray[1]) {
            this.invalidCommand("/fill <block> <x1> <y1> <x2> <y2>");
            return;
        }

        const blockName = messageArray[1];

        const x1 = messageArray[2] !== "~" ? parseInt(messageArray[2]) : "~";
        const y1 = messageArray[3] !== "~" ? parseInt(messageArray[3]) : "~";
        const x2 = messageArray[4] !== "~" ? parseInt(messageArray[4]) : "~";
        const y2 = messageArray[5] !== "~" ? parseInt(messageArray[5]) : "~";

        const position1 = this.getWorldPosition(new Vector2(x1, y1));
        const position2 = this.getWorldPosition(new Vector2(x2, y2));

        if (
            x1 === null ||
            y1 === null ||
            x2 === null ||
            y2 === null ||
            position1 === null ||
            position2 === null
        ) {
            this.invalidCommand("/fill <block> <x1> <y1> <x2> <y2>");
            return;
        }

        const blockType = Blocks[blockName];

        if (!blockType) {
            this.message(`Block ${blockName} not found.`, "", Colors.Red);
            return;
        }

        runtime.world.generator.fill(
            position1.x,
            position1.y,
            position2.x,
            position2.y,
            blockType,
        );

        this.cheatMessage(
            `Filled area from (${runtime.world.worldToBlocks(position1).x}, ${
                runtime.world.worldToBlocks(position1).y
            }) to (${runtime.world.worldToBlocks(position2).x}, ${
                runtime.world.worldToBlocks(position2).y
            }) with ${blockName}.`,
            "",
            Colors.Green,
        );
    }

    setBlock(messageArray) {
        if (!messageArray[1]) {
            this.invalidCommand("/setblock <block> <x> <y>");
            return;
        }

        const blockName = messageArray[1];
        const x = messageArray[2] !== "~" ? parseInt(messageArray[2]) : "~";
        const y = messageArray[3] !== "~" ? parseInt(messageArray[3]) : "~";

        const position = this.getWorldPosition(new Vector2(x, y));

        if (!position) {
            this.invalidCommand("/setblock <block> <x> <y>");
            return;
        }

        const block = Blocks[blockName];

        if (block) {
            const userBlockPos = new Vector2(
                Math.floor(position.x / BLOCK_SIZE),
                runtime.world.worldToUserBlockY(position.y),
            );

            const placed = runtime.world.setBlockTypeAtUserBlockPosition(
                userBlockPos.x,
                userBlockPos.y,
                block,
                false,
                activeDimension,
                null,
                true,
            );

            if (placed) {
                runtime.world.serverPlaceBlock(
                    runtime.world.getChunkXForWorldX(position.x),
                    runtime.world.worldToLocal(position.x, position.y).x,
                    runtime.world.worldToLocal(position.x, position.y).y,
                    block,
                );
            }

            if (!placed) {
                this.message("Could not place block here.", "", Colors.Red);
                return;
            }

            this.cheatMessage(
                `Set block ${blockName} at ${userBlockPos.x}, ${userBlockPos.y}`,
            );
        } else {
            this.message("Block not found.", "", Colors.Red);
        }
    }

    dimension(messageArray) {
        if (!messageArray[1]) {
            this.invalidCommand("/dim <dimension>");
            return;
        }

        const dimension = messageArray[1].toLowerCase();

        if (dimension === "overworld" || dimension === "0") {
            gotoDimension(0);
        } else if (dimension === "nether" || dimension === "1") {
            gotoDimension(1);
        } else if (dimension === "end" || dimension === "2") {
            enterEnd().catch(() => {
                this.message("Could not enter the End.", "", Colors.Red);
            });
        } else {
            this.message("Invalid dimension.");
        }
    }

    gameRule(messageArray) {
        // /gamerule <rule> <value>
        if (!messageArray[1]) {
            this.invalidCommand("/gamerule <rule> <value>");
            return;
        }

        const rule = messageArray[1];
        const value = messageArray[2];

        if (rule === "list") {
            for (const key in runtime.GAMERULES) {
                this.message(`${key}: ${runtime.GAMERULES[key]}`);
            }
            return;
        }

        if (runtime.GAMERULES[rule] === undefined) {
            this.message("Invalid rule.");
            return;
        }

        if (value === "true") {
            runtime.GAMERULES[rule] = true;
            this.cheatMessage(`${rule} set to true.`);
        } else if (value === "false") {
            runtime.GAMERULES[rule] = false;
            this.cheatMessage(`${rule} set to false.`);
        } else {
            this.message("Invalid value. Use true or false.");
        }
    }

    hitPlayer(messageArray) {
        if (!runtime.world.player) return;

        if (!messageArray[1]) {
            this.invalidCommand("/hit <damage>");
            return;
        }

        const damage = parseInt(messageArray[1]);

        if (isNaN(damage)) {
            this.invalidCommand("/hit <damage>");
            return;
        }

        runtime.world.player.hit(damage);
    }

    setTime(messageArray) {
        if (!messageArray[1]) {
            this.invalidCommand("/time set <day|noon|night|midnight> or /time <1 - 7.5>");
            return;
        }

        if (messageArray[1].toLowerCase() === "set") {
            const timeOfDay = {
                day: 1,
                noon: 3,
                night: 5,
                midnight: 5.5,
            }[messageArray[2]?.toLowerCase()];
            if (timeOfDay === undefined) {
                this.invalidCommand("/time set <day|noon|night|midnight>");
                return;
            }

            runtime.time = timeOfDay;
            runtime.day = timeOfDay < 3.5 || timeOfDay >= 6.5;
            this.cheatMessage(`Time set to ${messageArray[2].toLowerCase()}.`);
            return;
        }

        if (messageArray[1].toLowerCase() === "query") {
            const time = Number(runtime.time);
            this.message(
                `Time: ${Number.isFinite(time) ? time.toFixed(2) : "unknown"} (${runtime.day ? "day" : "night"}).`,
                "",
                Colors.Green,
            );
            return;
        }

        const newTime = Number(messageArray[1]);

        if (!Number.isFinite(newTime) || newTime < 1 || newTime > 7.5) {
            this.invalidCommand("/time set <day|noon|night|midnight> or /time <1 - 7.5>");
            return;
        }

        this.cheatMessage(`Time set to ${newTime}`);

        runtime.time = newTime;
        runtime.day = !(newTime > 3.5 && newTime < 6.5);
    }

    weather(messageArray) {
        const type = messageArray[1]?.toLowerCase();
        const weather = runtime.world?.weather;
        if (!weather) {
            this.message("Weather is unavailable.", "", Colors.Red);
            return;
        }

        if (type === "query") {
            const state = weather.thundering
                ? "thunder"
                : weather.raining
                  ? "rain"
                  : "clear";
            this.message(`Weather: ${state}.`, "", Colors.Green);
            return;
        }

        if (!["clear", "rain", "thunder"].includes(type)) {
            this.invalidCommand("/weather <clear|rain|thunder|query> [durationSeconds]");
            return;
        }

        let durationTicks = null;
        if (messageArray[2] !== undefined) {
            const durationSeconds = Number(messageArray[2]);
            if (!Number.isSafeInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 9000) {
                this.invalidCommand("/weather <clear|rain|thunder> [durationSeconds (1 - 9000)]");
                return;
            }
            durationTicks = durationSeconds * 20;
        }

        if (multiplayer && !runtime.world.isWorldAuthority) {
            this.message("Only the world host can change multiplayer weather.", "", Colors.Red);
            return;
        }

        weather.setWeather(type, durationTicks);
        if (multiplayer) {
            runtime.server?.send({
                type: "weatherCommand",
                message: { type, duration: durationTicks },
                sender: runtime.world.player?.UUID,
            });
        }
        this.cheatMessage(`Weather set to ${type}.`);
    }

    heal(messageArray) {
        const player = runtime.world?.player;
        if (!player || player.isDead || !player.abilities?.hasHealth) {
            this.message("You cannot be healed right now.", "", Colors.Red);
            return;
        }

        const amount = messageArray[1] === undefined
            ? player.maxHealth - player.health
            : Number(messageArray[1]);
        if (!Number.isSafeInteger(amount) || amount <= 0) {
            if (messageArray[1] === undefined && player.health >= player.maxHealth) {
                this.message("Health is already full.", "", Colors.Green);
                return;
            }
            this.invalidCommand("/heal [amount]");
            return;
        }

        const before = player.health;
        player.addHealth(Math.min(amount, player.maxHealth - player.health));
        player.mutliplayerSyncPlayerState?.();
        this.cheatMessage(`Healed ${player.health - before} health.`);
    }

    feed(messageArray) {
        const player = runtime.world?.player;
        if (!player) {
            this.message("No player found.", "", Colors.Red);
            return;
        }

        if (messageArray[1] === undefined) {
            player.resetFoodStats();
        } else {
            const amount = Number(messageArray[1]);
            if (!Number.isSafeInteger(amount) || amount < 1 || amount > 20) {
                this.invalidCommand("/feed [amount (1 - 20)]");
                return;
            }
            player.addFood(amount, 0);
        }
        player.mutliplayerSyncPlayerState?.();
        this.cheatMessage(`Food level is now ${player.foodLevel}.`);
    }

    experience(messageArray) {
        const player = runtime.world?.player;
        const action = messageArray[1]?.toLowerCase();
        const amount = Number(messageArray[2]);
        if (!player || !["add", "set"].includes(action) ||
            !Number.isSafeInteger(amount) || amount < 0 || amount > 9999 ||
            (action === "add" && amount === 0)) {
            this.invalidCommand("/xp <add|set> <levels (0 - 9999)>");
            return;
        }

        if (action === "add") player.gainExperienceLevel(amount);
        else player.xpLevel = amount;
        player.mutliplayerSyncPlayerState?.();
        this.cheatMessage(`Experience level is now ${player.xpLevel}.`);
    }

    spawn() {
        const player = runtime.world?.player;
        if (!player) {
            this.message("No player found.", "", Colors.Red);
            return;
        }

        const targetPosition = player.spawnPoint || runtime.world.getDefaultSpawnPosition();
        if (!targetPosition) {
            this.message("No spawn point is available.", "", Colors.Red);
            return;
        }
        gotoDimension(Dimensions.Overworld);
        player.teleport(targetPosition);
        player.mutliplayerSyncPlayerState?.();
        this.cheatMessage("Teleported to spawn.");
    }

    position() {
        const player = runtime.world?.player;
        if (!player) {
            this.message("No player found.", "", Colors.Red);
            return;
        }

        const coordinates = runtime.world.worldToBlocks(player.position);
        const dimensions = ["Overworld", "Nether", "The End"];
        const biome = runtime.world.getChunkForX(player.position.x, player.dimension)?.biome?.name;
        this.message(
            `Position: x ${coordinates.x}, y ${coordinates.y} (${dimensions[player.dimension] ?? "Unknown"}${biome ? `, ${biome}` : ""}).`,
            "",
            Colors.Green,
        );
    }

    fly(messageArray) {
        const player = runtime.world?.player;
        if (!player || !player.abilities?.mayFly) {
            this.message("Flight is available in Creative mode.", "", Colors.Red);
            return;
        }

        const requested = messageArray[1]?.toLowerCase();
        if (requested && !["on", "off"].includes(requested)) {
            this.invalidCommand("/fly [on|off]");
            return;
        }
        player.abilities.flying = requested === undefined
            ? !player.abilities.flying
            : requested === "on";
        this.cheatMessage(`Flight ${player.abilities.flying ? "enabled" : "disabled"}.`);
    }

    listPlayers() {
        const uniquePlayers = this.getOnlinePlayers();
        this.message(
            `Players online (${uniquePlayers.length}): ${uniquePlayers.map((player) => player.name).join(", ") || "none"}`,
            "",
            Colors.Green,
        );
    }

    save() {
        if (multiplayer) {
            this.message("Multiplayer worlds save automatically.", "", Colors.Green);
            return;
        }
        saveWorld(false);
        this.cheatMessage("World saved.");
    }

    structure(messageArray) {
        if (!messageArray[1]) {
            this.invalidCommand("/structure <StructureName>");
            return;
        }

        const structureName = messageArray[1];

        if (Structures[structureName] !== undefined) {
            const playerUserPos = runtime.world.worldToBlocks(runtime.world.player.position);
            runtime.world.generator.generateStructure(
                structureName,
                runtime.world.player.position.x,
                playerUserPos.y * BLOCK_SIZE,
            );

            this.cheatMessage(
                `Structure ${structureName} generated at ${playerUserPos.x}, ${playerUserPos.y}`,
            );
        } else {
            this.message(
                `Structure ${structureName} not found.`,
                "",
                Colors.Red,
            );
        }
    }

    summon(messageArray) {
        if (!messageArray[1] || !messageArray[2] || !messageArray[3]) {
            this.invalidCommand("/summon <Entity> <x> <y> <count>");
            return;
        }

        const itemName = messageArray[1];

        const x = messageArray[2] !== "~" ? parseInt(messageArray[2]) : "~";
        const y = messageArray[3] !== "~" ? parseInt(messageArray[3]) : "~";

        const position = this.getWorldPosition(new Vector2(x, y));

        let count = parseInt(messageArray[4]);

        if (!count || isNaN(count) || count < 1) count = 1;

        if (!position) {
            this.invalidCommand("/summon <Entity> <x> <y>");
            return;
        }

        if (Entities[itemName] != null) {
            const entity = Entities[itemName];
            const userPosition = runtime.world.worldToBlocks(position);

            for (let i = 0; i < count; i++) {
                runtime.world.summonEntity(entity, structuredClone(position));
            }

            this.cheatMessage(
                `Summoned ${count} ${entity.name} at ${userPosition.x}, ${userPosition.y}`,
            );
        } else {
            this.message("Entity not found.", "", Colors.Red);
        }
    }

    getWorldPosition(position) {
        if (position.x === "~")
            position.x = runtime.world.player.position.x / BLOCK_SIZE;
        if (position.y === "~")
            position.y = runtime.world.worldToBlocks(runtime.world.player.position).y;

        if (isNaN(position.x) || isNaN(position.y)) return null;

        return runtime.world.userBlocksToWorldPosition(position.x, position.y);
    }

    teleport(messageArray) {
        if (!runtime.world.player) {
            this.message("No player found.");
            return;
        }

        if (messageArray[1] && !messageArray[2]) {
            const targetName = messageArray[1];
            const matches = this.getOnlinePlayers().filter(
                (player) => player.name.toLowerCase() === targetName.toLowerCase(),
            );
            if (matches.length > 1) {
                this.message(`More than one player is named ${targetName}.`, "", Colors.Red);
                return;
            }
            if (matches.length === 1) {
                const target = matches[0];
                if (
                    !Number.isInteger(target.dimension) || target.dimension < 0 ||
                    target.dimension > 2 || !Number.isFinite(target.position?.x) ||
                    !Number.isFinite(target.position?.y)
                ) {
                    this.message("That player's position is unavailable.", "", Colors.Red);
                    return;
                }

                gotoDimension(target.dimension);
                runtime.world.player.teleport(target.position);
                runtime.world.player.mutliplayerSyncPlayerState?.();
                this.cheatMessage(`Teleported to ${target.name}.`);
                return;
            }

            if (targetName !== "~" && !Number.isFinite(Number(targetName))) {
                this.message(`Player ${targetName} is not online.`, "", Colors.Red);
                return;
            }
        }

        // Check if x and y coordinates are provided
        if (!messageArray[1] || !messageArray[2]) {
            this.invalidCommand("/tp <player> or /tp <x> <y>");
            return;
        }

        const x = messageArray[1] !== "~" ? parseInt(messageArray[1]) : "~";
        const y = messageArray[2] !== "~" ? parseInt(messageArray[2]) : "~";

        const targetPosition = this.getWorldPosition(new Vector2(x, y));

        if (!targetPosition) {
            this.invalidCommand("/tp <player> or /tp <x> <y>");
            return;
        }

        runtime.world.player.teleport(targetPosition);
        runtime.world.player.mutliplayerSyncPlayerState?.();

        this.cheatMessage(`Teleported player to x: ${x} y: ${y}`);
    }

    getOnlinePlayers() {
        const players = [runtime.world?.player, ...(runtime.world?.entities ?? [])]
            .filter((entity) => entity && Number.isInteger(entity.gamemode) &&
                typeof entity.name === "string");
        return [...new Map(players.map((player) => [player.UUID, player])).values()];
    }

    spawnpoint(messageArray) {
        if (!runtime.world.player) return;

        let targetPosition;
        const hasX = typeof messageArray[1] !== "undefined";
        const hasY = typeof messageArray[2] !== "undefined";

        if (!hasX && !hasY) {
            targetPosition = new Vector2(
                runtime.world.player.position.x,
                runtime.world.player.position.y,
            );
        } else if (hasX && hasY) {
            const x = messageArray[1] !== "~" ? parseInt(messageArray[1]) : "~";
            const y = messageArray[2] !== "~" ? parseInt(messageArray[2]) : "~";
            targetPosition = this.getWorldPosition(new Vector2(x, y));
            if (!targetPosition) {
                this.invalidCommand("/spawnpoint [x] [y]");
                return;
            }
        } else {
            this.invalidCommand("/spawnpoint [x] [y]");
            return;
        }

        runtime.world.player.spawnPoint = new Vector2(
            targetPosition.x,
            targetPosition.y,
        );
        currentSave.spawnPoint = JSON.stringify(runtime.world.player.spawnPoint);
        saveWorld(false);

        const spawnBlockPos = runtime.world.worldToBlocks(targetPosition);
        this.cheatMessage(
            `Spawnpoint set to x: ${spawnBlockPos.x} y: ${spawnBlockPos.y}`,
        );
    }

    gamemode(messageArray) {
        if (!messageArray[1]) {
            this.invalidCommand("/gamemode <Gamemode>");
            return;
        }

        if (!runtime.world.player) {
            this.message("No player found.");
            return;
        }

        const gamemodeMap = {
            survival: 0,
            creative: 1,
            adventure: 2,
            spectator: 3,
        };

        const input = messageArray[1].toLowerCase();

        // Determine the gamemode number
        let gamemode;
        if (isNaN(input)) {
            gamemode = gamemodeMap[input];
        } else {
            gamemode = parseInt(input);
        }

        if (gamemode === undefined || gamemode < 0 || gamemode > 3) {
            this.message(
                "Invalid gamemode. Valid gamemodes are: " +
                    "0 (Survival) 1 (Creative) 2 (Adventure) 3 (Spectator)",
            );
            return;
        }

        runtime.world.player.setGamemode(gamemode);

        const gamemodeNames = [
            "Survival",
            "Creative",
            "Adventure",
            "Spectator",
        ];

        this.cheatMessage("Gamemode set to " + gamemodeNames[gamemode] + ".");
    }

    cheatMessage(message) {
        if (multiplayer) {
            runtime.server.send({
                type: "chat",
                message: message,
                sender: runtime.world.player.UUID,
            });
        }

        this.message(message);

        this.closeChat();
    }

    invalidCommand(usage) {
        this.message("Usage: " + usage, "", Colors.Red);
    }

    printHelp(messageArray = []) {
        const commands = this.getCommandSuggestions();
        const requestedName = messageArray[1]?.toLowerCase();

        if (requestedName) {
            const command = commands.find(({ name }) => name === requestedName);
            if (!command) {
                this.message(`Unknown command: ${requestedName}.`, "", Colors.Red);
                return;
            }
            const args = command.usage ?? command.args.map((arg) => `<${arg}>`).join(" ");
            this.message(`/${command.name} ${args}`.trim(), "", Colors.Aqua);
            return;
        }

        this.message("Available commands (use /help <command> for usage):", "", Colors.LightPurple);
        let line = "";
        for (const command of commands) {
            const args = command.usage ?? command.args.map((arg) => `<${arg}>`).join(" ");
            const entry = `/${command.name}${args ? ` ${args}` : ""}`;
            if (line && line.length + entry.length + 2 > 72) {
                this.message(line, "", Colors.Aqua);
                line = "";
            }
            line = line ? `${line}, ${entry}` : entry;
        }
        if (line) this.message(line, "", Colors.Aqua);
    }

    printProgress() {
        this.message("Adventure guide:", "", Colors.LightPurple);
        if (activeDimension === Dimensions.End) {
            const dragonAlive = runtime.world.entities.some(
                entity => entity.name === "Ender Dragon" && entity.dimension === Dimensions.End,
            );
            this.message(dragonAlive
                ? "Defeat the dragon to open the center exit."
                : "The center exit leads home.", "", Colors.Aqua);
            this.message("Bridge to outer islands for outpost loot.", "", Colors.Aqua);
            return;
        }
        if (activeDimension === Dimensions.Nether) {
            this.message("Defeat blazes for rods; craft blaze powder.", "", Colors.Aqua);
            this.message("Return home for ender pearls and the End shrine.", "", Colors.Aqua);
            return;
        }
        this.message("1. Frame a 1 x 3 gap with 8 obsidian (or wider).", "", Colors.Aqua);
        this.message("2. Ignite the bottom inside block; walk in.", "", Colors.Aqua);
        this.message("3. Nether: defeat blazes for rods.", "", Colors.Aqua);
        this.message("4. Craft blaze powder; hunt endermen for pearls.", "", Colors.Aqua);
        this.message("5. Craft eyes. Use one to find the End shrine.", "", Colors.Aqua);
        this.message("6. Fill its three frames; enter the End.", "", Colors.Aqua);
        this.message("7. Defeat the dragon.", "", Colors.Aqua);
        this.message("Farm: hoe grass or dirt; plant seeds, carrots, or potatoes.", "", Colors.Aqua);
        this.message("Keep water within 4 blocks; use bone meal to speed crops.", "", Colors.Aqua);
        this.message("Breed cows/sheep with wheat, pigs with carrots/potatoes, chickens with seeds.", "", Colors.Aqua);
        this.message("Feed babies to help them grow. Chickens lay eggs; thrown eggs can hatch chicks.", "", Colors.Aqua);
        this.message("Use /locate village to find the nearest village.", "", Colors.Aqua);
        this.message("Shear a pumpkin and place it last to build a golem.", "", Colors.Aqua);
        this.message("Snow golem: 2 snow blocks below the pumpkin.", "", Colors.Aqua);
        this.message("Iron golem: an iron T (4 blocks) below it.", "", Colors.Aqua);
    }

    message(message, sender = "", color = Colors.White, force = false) {
        if (!this.isValidText(message) && !force) return;

        let finalMessage = sender ? `[${sender}] ${message}` : message;

        // Store in messages array (for persistent history)
        this.messages.push({ text: finalMessage, color });

        // Store in tempMessages with timestamp for temporary display
        this.tempMessages.push({
            text: finalMessage,
            timestamp: Date.now(),
            color,
        });

        // Trim messages to respect viewHistory limit
        if (this.messages.length > this.viewHistory) {
            this.messages.shift();
        }
    }

    give(messageArray) {
        if (!runtime.world.player) return;

        if (messageArray.length < 2) {
            this.invalidCommand("/give <Category.ItemName>");
            return;
        }

        const itemPath = messageArray[1].split(".");
        const category = itemPath[0];
        const itemName = itemPath[1];
        const count = messageArray[2] ? parseInt(messageArray[2]) : 1;

        const collections = {
            Blocks,
            Items,
        };

        if (collections[category] && collections[category][itemName] != null) {
            const item = collections[category][itemName];

            const inventoryItem =
                category === "Blocks"
                    ? new InventoryItem({
                          blockId: item,
                          count: count,
                      })
                    : new InventoryItem({
                          itemId: item,
                          count: count,
                      });

            if (inventoryItem.air) return;

            runtime.world.player.inventory.addItem(inventoryItem);

            this.cheatMessage(
                `Gave ${count} ${
                    category === "Blocks"
                        ? getBlock(item).name
                        : getItem(item).name
                } to the player.`,
            );
        } else {
            this.message(`Item ${messageArray[1]} not found.`, "", Colors.Red);
        }
    }

    clear() {
        this.cheatMessage("Cleared Inventory");
        runtime.world.player.inventory.createItemArray();
    }

    draw(ctx) {
        if (!this.inChat) {
            const maxMessages = Math.min(
                this.viewHistory,
                this.tempMessages.length,
            );
            for (let i = 0; i < maxMessages; i++) {
                const msg = this.tempMessages[this.tempMessages.length - 1 - i];
                drawText({
                    text: msg.text,
                    x: 17,
                    y: CANVAS.height - 60 - i * 30,
                    size: 30,
                    color: msg.color, // Use stored color
                    shadow: true,
                    textAlign: "left",
                });
            }
            return;
        }

        ctx.fillStyle = "rgb(0, 0, 0, .6)";
        ctx.fillRect(10, CANVAS.height - 50, 1000, 40);

        const beforeCursor = this.currentMessage.slice(0, this.cursorPosition);
        const cursorX = 17 + this.measureTextWidth(beforeCursor, 30);

        if (this.hasSelection()) {
            const start = Math.min(this.selectionStart, this.selectionEnd);
            const end = Math.max(this.selectionStart, this.selectionEnd);
            const selectionX = 17 + this.measureTextWidth(
                this.currentMessage.slice(0, start),
                30,
            );
            const selectionWidth = this.measureTextWidth(
                this.currentMessage.slice(start, end),
                30,
            );
            ctx.fillStyle = "rgba(70, 130, 255, .65)";
            ctx.fillRect(selectionX, CANVAS.height - 45, selectionWidth, 30);
        }

        drawText({
            text: this.currentMessage,
            x: 17,
            y: CANVAS.height - 20,
            size: 30,
            color: "white", // Current message remains white for simplicity
            shadow: false,
            textAlign: "left",
        });

        if (this.showCursor && !this.hasSelection()) {
            ctx.fillStyle = "white";
            ctx.fillRect(cursorX, CANVAS.height - 22, 13, 4); // Draw cursor
        }

        for (let i = 0; i < this.viewHistory; i++) {
            const messageIndex = this.messages.length - 1 - i;
            if (!this.messages[messageIndex]) continue;

            const msg = this.messages[messageIndex];
            drawText({
                text: msg.text,
                x: 17,
                y: CANVAS.height - 60 - i * 30,
                size: 30,
                color: msg.color, // Use stored color
                shadow: true,
                textAlign: "left",
            });
        }

        const context = this.getCompletionContext();
        if (!context) return;
        const suggestions = this.suggestionIndex >= 0
            ? this.suggestions
            : this.getAvailableSuggestions(context);
        const firstVisible = Math.max(0, this.suggestionIndex - 4);
        const visible = suggestions.slice(firstVisible, firstVisible + 5);
        if (visible.length === 0) return;

        const top = CANVAS.height - 50 - visible.length * 30 - 28;
        const width = Math.min(1000, CANVAS.width - 20);
        ctx.fillStyle = "rgb(0, 0, 0, .7)";
        ctx.fillRect(10, top, width, visible.length * 30 + 28);
        drawText({
            text: `Tab to cycle (${suggestions.length})`,
            x: 17,
            y: top + 20,
            size: 18,
            color: Colors.Gray,
            shadow: false,
            textAlign: "left",
        });
        visible.forEach((suggestion, index) => {
            if (firstVisible + index === this.suggestionIndex) {
                ctx.fillStyle = "rgb(255, 255, 255, .2)";
                ctx.fillRect(10, top + index * 30 + 28, width, 30);
            }
            drawText({
                text: context.argIndex === 0 ? `/${suggestion}` : suggestion,
                x: 17,
                y: top + index * 30 + 52,
                size: 25,
                color: firstVisible + index === this.suggestionIndex
                    ? Colors.Yellow : Colors.White,
                shadow: false,
                textAlign: "left",
            });
        });
    }

    measureTextWidth(text, fontSize) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        ctx.font = `${fontSize}px Pixel`; // Use the same font as your chat
        return ctx.measureText(text).width;
    }

    update() {
        if (!this.inChat) {
            // check message duration and hide if elapsed
            const now = Date.now();
            this.tempMessages = this.tempMessages.filter(
                (msg) => now - msg.timestamp < this.messageDuration,
            );
        } else {
            this.cursorPosition = Math.max(
                0,
                Math.min(this.currentMessage.length, this.cursorPosition),
            );

            this.cursorBlinkTime += runtime.deltaTime;

            if (this.cursorBlinkTime >= 0.5) {
                this.showCursor = !this.showCursor;
                this.cursorBlinkTime = 0;
            }
        }
    }
}

export const Colors = Object.freeze({
    Red: "#FF5555",
    DarkRed: "#AA0000",
    Green: "#55FF55",
    DarkGreen: "#00AA00",
    Blue: "#5555FF",
    DarkBlue: "#0000AA",
    Yellow: "#FFFF55",
    LightPurple: "#FF55FF",
    DarkPurple: "#AA00AA",
    Aqua: "#55FFFF",
    White: "#FFFFFF",
    Black: "#000000",
    Gray: "#AAAAAA",
    DarkGray: "#555555",
});

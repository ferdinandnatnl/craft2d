import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const clientDirectory = path.resolve(serverDirectory, "../Client");
const viteCli = path.join(clientDirectory, "node_modules/vite/bin/vite.js");
const previewPort = 4173;

if (!existsSync(viteCli)) {
    console.error("Vite is missing. Install the Client dependencies first.");
    process.exit(1);
}

const build = spawnSync(process.execPath, [viteCli, "build"], {
    cwd: clientDirectory,
    stdio: "inherit",
});

if (build.error) {
    console.error(`Could not build the client: ${build.error.message}`);
    process.exit(1);
}
if (build.status !== 0) process.exit(build.status ?? 1);

const serverPropertiesPath = path.join(serverDirectory, "server.properties");
let serverPort = 25565;
if (existsSync(serverPropertiesPath)) {
    const properties = readFileSync(serverPropertiesPath, "utf8");
    const configuredPort = properties.match(/^\s*serverPort\s*=\s*(\d+)\s*$/m);
    if (configuredPort) serverPort = Number(configuredPort[1]) || serverPort;
}

const addresses = Object.entries(networkInterfaces()).flatMap(
    ([interfaceName, entries]) =>
        (entries ?? [])
            .filter(
                (entry) =>
                    !entry.internal &&
                    (entry.family === "IPv4" || entry.family === 4),
            )
            .map((entry) => ({ interfaceName, address: entry.address })),
);

console.log("LAN multiplayer is starting.");
if (addresses.length > 0) {
    for (const { interfaceName, address } of addresses) {
        console.log(`  Game (${interfaceName}):   http://${address}:${previewPort}/worlds.html`);
        console.log(`  Server (${interfaceName}): ${address}:${serverPort}`);
    }
} else {
    console.log(`  Game:   http://<host-ip>:${previewPort}/worlds.html`);
    console.log(`  Server: <host-ip>:${serverPort}`);
}
console.log("Share these addresses with people on the same Wi-Fi.");
console.log(
    `For internet play without renting a server, forward TCP ports ${previewPort} and ${serverPort} from your router to this computer. Friends can then open http://<your-public-ip>:${previewPort}/worlds.html and connect to <your-public-ip>:${serverPort}. This requires a public IP; port forwarding will not work behind carrier-grade NAT.`,
);
console.log("Press Ctrl+C to stop hosting.");

const children = [
    spawn(process.execPath, [path.join(serverDirectory, "server.js"), "--lan"], {
        cwd: serverDirectory,
        stdio: "inherit",
    }),
    spawn(
        process.execPath,
        [viteCli, "preview", "--host", "0.0.0.0", "--port", String(previewPort), "--strictPort"],
        {
            cwd: clientDirectory,
            stdio: "inherit",
            env: {
                ...process.env,
                VITE_LAN_SERVER_PORT: String(serverPort),
            },
        },
    ),
];

let shuttingDown = false;
function stop(exitCode = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    process.exitCode = exitCode;
    for (const child of children) {
        if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
    }
}

for (const [index, child] of children.entries()) {
    const name = index === 0 ? "game server" : "LAN web server";
    child.on("error", (error) => {
        console.error(`Could not start the ${name}: ${error.message}`);
        stop(1);
    });
    child.on("exit", (code, signal) => {
        if (shuttingDown) return;
        console.error(
            `The ${name} stopped${signal ? ` (${signal})` : ` (exit ${code})`}.`,
        );
        stop(code ?? 1);
    });
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

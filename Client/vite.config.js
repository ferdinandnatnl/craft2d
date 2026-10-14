import { defineConfig } from "vite";
import { resolve, join } from "path";
import {
    existsSync,
    mkdirSync,
    cpSync,
} from "fs";

const MEDIA_DIRS = ["sprites", "audio", "fonts"];

function copyMedia() {
    return {
        name: "copy-media",
        closeBundle() {
            const dist = resolve(__dirname, "dist");
            const assetsRoot = resolve(__dirname, "Assets");
            mkdirSync(dist, { recursive: true });

            for (const sub of MEDIA_DIRS) {
                const dir = join(assetsRoot, sub);
                if (!existsSync(dir)) continue;
                cpSync(dir, join(dist, "Assets", sub), { recursive: true });
            }

            const photonLicense = resolve(
                __dirname,
                "Assets/utils/PHOTON-LICENSE.txt",
            );
            if (existsSync(photonLicense)) {
                cpSync(photonLicense, join(dist, "PHOTON-LICENSE.txt"));
            }
        },
    };
}

export default defineConfig({
    root: ".",
    publicDir: false,
    base: "./",
    plugins: [copyMedia()],
    resolve: {
        alias: {
            "@2dcraft.com/shared": resolve(__dirname, "../Shared"),
        },
    },
    build: {
        outDir: "dist",
        emptyOutDir: true,
        // Avoid clashing with source `Assets/` — this is only hashed JS/CSS/images
        assetsDir: "bundle",
        rollupOptions: {
            input: {
                main: resolve(__dirname, "index.html"),
                game: resolve(__dirname, "game.html"),
                worlds: resolve(__dirname, "worlds.html"),
                structureCreator: resolve(__dirname, "structureCreator.html"),
            },
        },
    },
    server: {
        port: 3000,
        open: false,
        fs: {
            allow: [resolve(__dirname, "..")],
        },
    },
    preview: {
        proxy: {
            "/multiplayer": {
                target: `ws://127.0.0.1:${Number(process.env.VITE_LAN_SERVER_PORT) || 25565}`,
                ws: true,
            },
        },
    },
    optimizeDeps: {
        include: ["jszip", "tooloud"],
    },
});

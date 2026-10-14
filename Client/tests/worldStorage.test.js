import test from "node:test";
import assert from "node:assert/strict";
import {
    deleteWorldSnapshot, isStoredWorldPointer, readWorldSnapshot,
    writeWorldSnapshot,
} from "../Assets/world/worldStorage.js";

function memoryDatabase() {
    const values = new Map();
    const database = {
        objectStoreNames: { contains: () => true },
        close() {},
        transaction() {
            const transaction = {
                objectStore() {
                    const request = operation => {
                        const result = {};
                        queueMicrotask(() => {
                            result.result = operation();
                            transaction.oncomplete?.();
                        });
                        return result;
                    };
                    return {
                        put(value, key) { return request(() => values.set(key, value)); },
                        get(key) { return request(() => values.get(key)); },
                        delete(key) { return request(() => values.delete(key)); },
                    };
                },
            };
            return transaction;
        },
    };
    return { open() {
        const request = {};
        queueMicrotask(() => {
            request.result = database;
            request.onsuccess();
        });
        return request;
    } };
}

test("large world snapshot storage keeps data and backup keys separate", async () => {
    const original = globalThis.indexedDB;
    globalThis.indexedDB = memoryDatabase();
    try {
        await writeWorldSnapshot(123, "new-world");
        await writeWorldSnapshot("legacy-backup:123", "original-world");
        assert.equal(await readWorldSnapshot(123), "new-world");
        assert.equal(await readWorldSnapshot("legacy-backup:123"), "original-world");
        await deleteWorldSnapshot(123);
        assert.equal(await readWorldSnapshot(123), null);
        assert.equal(await readWorldSnapshot("legacy-backup:123"), "original-world");
    } finally {
        globalThis.indexedDB = original;
    }
});

test("only the exact world pointer triggers IndexedDB loading", () => {
    assert.equal(isStoredWorldPointer('{"storage":"indexeddb-v1","bytes":42}'), true);
    assert.equal(isStoredWorldPointer('{"storage":"something-else"}'), false);
    assert.equal(isStoredWorldPointer('{"seed":1847}'), false);
    assert.equal(isStoredWorldPointer('{bad json'), false);
});

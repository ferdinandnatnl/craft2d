const DATABASE = "minecraft-worlds";
const STORE = "snapshots";

export function isStoredWorldPointer(value) {
    if (typeof value !== "string") return false;
    try {
        return JSON.parse(value)?.storage === "indexeddb-v1";
    } catch {
        return false;
    }
}

function openWorldDatabase() {
    return new Promise((resolve, reject) => {
        const request = globalThis.indexedDB.open(DATABASE, 1);
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(STORE)) {
                request.result.createObjectStore(STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
    });
}

async function transact(id, mode, operation) {
    const database = await openWorldDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE, mode);
        const request = operation(transaction.objectStore(STORE), String(id));
        request.onerror = () => reject(request.error);
        transaction.onerror = () => {
            database.close();
            reject(transaction.error);
        };
        transaction.oncomplete = () => {
            resolve(request.result ?? null);
            database.close();
        };
    });
}

export function writeWorldSnapshot(id, data) {
    return transact(id, "readwrite", (store, key) => store.put(data, key));
}

export function readWorldSnapshot(id) {
    return transact(id, "readonly", (store, key) => store.get(key));
}

export function deleteWorldSnapshot(id) {
    return transact(id, "readwrite", (store, key) => store.delete(key));
}

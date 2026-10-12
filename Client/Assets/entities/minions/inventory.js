function sameStack(left, right) {
    return left.blockId === right.blockId && left.itemId === right.itemId &&
        JSON.stringify(left.props || {}) === JSON.stringify(right.props || {});
}

function clearStack(item) {
    item.blockId = null;
    item.itemId = null;
    item.count = 0;
    item.props = {};
}

/** Insert into fixed worker slots and return the amount that did not fit. */
export function insertInventoryItem(slots, source, stackLimit) {
    if (!Array.isArray(slots) || !source || source.count <= 0) return source?.count || 0;
    let remaining = source.count;
    for (const slot of slots) {
        if (slot.count <= 0 || !sameStack(slot, source)) continue;
        const added = Math.min(remaining, stackLimit(slot) - slot.count);
        if (added <= 0) continue;
        slot.count += added;
        remaining -= added;
        if (remaining === 0) return 0;
    }
    for (const slot of slots) {
        if (slot.count > 0) continue;
        const added = Math.min(remaining, stackLimit(source));
        slot.blockId = source.blockId;
        slot.itemId = source.itemId;
        slot.count = added;
        slot.props = structuredClone(source.props || {});
        remaining -= added;
        if (remaining === 0) return 0;
    }
    return remaining;
}

/** Transfer worker slots into nested chest slots without losing overflow. */
export function transferInventoryToStorage(inventory, storage, stackLimit) {
    let hasRemainder = false;
    for (const source of inventory) {
        if (source.count <= 0) continue;
        let remaining = source.count;
        for (const row of storage) {
            for (const slot of row) {
                if (remaining <= 0) break;
                if (slot.count > 0 && !sameStack(slot, source)) continue;
                if (slot.count <= 0) {
                    slot.blockId = source.blockId;
                    slot.itemId = source.itemId;
                    slot.props = structuredClone(source.props || {});
                    slot.count = 0;
                }
                const added = Math.min(remaining, stackLimit(source) - slot.count);
                if (added <= 0) continue;
                slot.count += added;
                remaining -= added;
            }
            if (remaining <= 0) break;
        }
        source.count = remaining;
        if (remaining <= 0) clearStack(source);
        else hasRemainder = true;
    }
    return hasRemainder;
}

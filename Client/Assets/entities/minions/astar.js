class MinHeap {
    constructor() {
        this.values = [];
    }

    push(value) {
        this.values.push(value);
        let index = this.values.length - 1;
        while (index > 0) {
            const parent = Math.floor((index - 1) / 2);
            if (this.values[parent].priority <= value.priority) break;
            this.values[index] = this.values[parent];
            index = parent;
        }
        this.values[index] = value;
    }

    pop() {
        if (this.values.length === 0) return null;
        const first = this.values[0];
        const last = this.values.pop();
        if (this.values.length > 0) {
            let index = 0;
            while (true) {
                const left = index * 2 + 1;
                const right = left + 1;
                if (left >= this.values.length) break;
                let smallest = left;
                if (right < this.values.length &&
                    this.values[right].priority < this.values[smallest].priority) {
                    smallest = right;
                }
                if (this.values[smallest].priority >= last.priority) break;
                [this.values[index], this.values[smallest]] =
                    [this.values[smallest], this.values[index]];
                index = smallest;
            }
            this.values[index] = last;
        }
        return first;
    }

    get size() {
        return this.values.length;
    }
}

/** Bounded A* for small worker routes. Nodes are plain objects. */
export function findAStarPath(start, goal, {
    key = (node) => `${node.x},${node.y}`,
    neighbors,
    heuristic = (node, target) =>
        Math.abs(node.x - target.x) + Math.abs(node.y - target.y),
    maxVisited = 4096,
} = {}) {
    if (!start || !goal || typeof neighbors !== "function") return null;
    const startKey = key(start);
    const goalKey = key(goal);
    if (startKey === goalKey) return [start];

    const frontier = new MinHeap();
    const cameFrom = new Map();
    const nodes = new Map([[startKey, start]]);
    const costs = new Map([[startKey, 0]]);
    const visited = new Set();
    frontier.push({ node: start, key: startKey, priority: heuristic(start, goal) });

    while (frontier.size && visited.size < maxVisited) {
        const current = frontier.pop();
        if (!current || visited.has(current.key)) continue;
        if (current.key === goalKey) {
            const path = [];
            let cursor = current.key;
            while (cursor !== undefined) {
                path.push(nodes.get(cursor));
                if (cursor === startKey) break;
                cursor = cameFrom.get(cursor);
            }
            path.reverse();
            return path;
        }
        visited.add(current.key);

        for (const entry of neighbors(current.node) || []) {
            const next = entry?.node ?? entry;
            if (!next) continue;
            const nextKey = key(next);
            if (visited.has(nextKey)) continue;
            const stepCost = Number.isFinite(entry?.cost) ? entry.cost : 1;
            if (stepCost < 0) continue;
            const tentative = costs.get(current.key) + stepCost;
            if (tentative >= (costs.get(nextKey) ?? Infinity)) continue;
            costs.set(nextKey, tentative);
            cameFrom.set(nextKey, current.key);
            nodes.set(nextKey, next);
            frontier.push({
                node: next,
                key: nextKey,
                priority: tentative + heuristic(next, goal),
            });
        }
    }

    return null;
}

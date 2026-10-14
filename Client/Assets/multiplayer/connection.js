export function isLanMultiplayerHost(host) {
    const normalizedHost = String(host).trim().toLowerCase();
    if (normalizedHost.endsWith(".local")) return true;

    const octets = normalizedHost.split(".").map(Number);
    if (
        octets.length !== 4 ||
        octets.some(
            (octet) => !Number.isInteger(octet) || octet < 0 || octet > 255,
        )
    ) {
        return false;
    }

    const [first, second] = octets;
    return (
        first === 10 ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        (first === 169 && second === 254)
    );
}

export function getMultiplayerWebSocketUrl(host, port) {
    const normalizedHost = String(host).trim();
    if (isLanMultiplayerHost(normalizedHost)) {
        return `ws://${normalizedHost}:4173/multiplayer`;
    }

    return `ws://${normalizedHost}:${port}`;
}

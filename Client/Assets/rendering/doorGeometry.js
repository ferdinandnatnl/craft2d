// Slightly widen door panels so their texture remains legible against nearby
// blocks, including when the panel is viewed edge-on.
export const CLOSED_DOOR_WIDTH = 1.2;
export const OPEN_DOOR_WIDTH = 0.24;

export function getDoorPanelBounds(blockX, metaData) {
    const isOpen = Boolean(metaData?.open);
    const width = isOpen ? OPEN_DOOR_WIDTH : CLOSED_DOOR_WIDTH;
    const left = isOpen
        ? (metaData?.hinge === "left" ? blockX : blockX + 1 - width)
        : blockX + (1 - width) / 2;

    return { left, width };
}

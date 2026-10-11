// Keep the playable front face (z=0.5) on the existing interaction grid.
// Perspective affects the sides and scenery without changing collision units.
export function syncSliceCamera(perspective, camera, width, height, blockSize) {
    const distance = height / blockSize / (2 * Math.tan(perspective.fov * Math.PI / 360));
    perspective.position.set((camera.x + width / 2) / blockSize,
        -(camera.y + height / 2) / blockSize, distance + 0.5);
    perspective.rotation.set(0, 0, 0);
    perspective.aspect = width / height;
    perspective.updateProjectionMatrix();
    perspective.updateMatrixWorld();
}

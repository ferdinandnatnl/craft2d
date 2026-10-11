import * as THREE from "three";

const vertexShader = `
    in vec3 position;
    out vec2 uv;
    void main() {
        uv = position.xy * 0.5 + 0.5;
        gl_Position = vec4(position.xy, 0.0, 1.0);
    }
`;

const fragmentShader = `
    precision highp float;
    precision highp sampler3D;
    uniform sampler3D noiseVolume;
    uniform float seconds;
    uniform float time;
    uniform float aspect;
    uniform float tanHalfFov;
    uniform vec2 cameraPosition;
    in vec2 uv;
    out vec4 outColor;

    float noise3(vec3 p) {
        // Smooth the hardware-interpolated volume at cell boundaries.
        vec3 cell = floor(p), f = fract(p);
        return texture(noiseVolume, (cell + f * f * (3.0 - 2.0 * f) + 0.5) / 32.0).r;
    }

    float density(vec3 p, bool detailed) {
        // Wind moves across AND into the scene. The smaller billows evolve
        // independently, so this is a changing volume, not a moving sky image.
        vec3 q = p + vec3(seconds * 5.0, 0.0, seconds * 3.2);
        float h = (p.y - 420.0) / 310.0;
        float profile = smoothstep(0.0, 0.13, h) * (1.0 - smoothstep(0.45, 1.0, h));
        if (profile <= 0.0) return 0.0;
        float weather = noise3(vec3(q.x * 0.0017, 8.3, q.z * 0.0017));
        float body = noise3(q * 0.008);
        float shape = weather * 0.2 + body * 0.5
            + noise3(q * 0.016) * 0.2 + noise3(q * 0.032) * 0.1;
        float coverage = smoothstep(0.40, 0.65, weather);
        float cloud = smoothstep(0.58, 0.77, shape) * profile * coverage;
        if (cloud <= 0.0 || !detailed) return cloud;
        vec3 detail = q * 0.024 + vec3(0.0, seconds * 0.025, -seconds * 0.012);
        float erosion = noise3(detail) * 0.65 + noise3(detail * 2.7) * 0.35;
        return max(0.0, cloud - (1.0 - erosion) * 0.24) * 1.65;
    }

    vec3 atmosphere(vec3 ray, vec3 sun, float day, float dusk) {
        float altitude = max(0.0, ray.y);
        vec3 zenith = mix(vec3(0.018, 0.032, 0.072), vec3(0.15, 0.39, 0.71), day);
        vec3 horizon = mix(vec3(0.055, 0.081, 0.13), vec3(0.64, 0.79, 0.90), day);
        float facing = pow(max(0.0, dot(ray, normalize(vec3(sun.x, 0.12, sun.z)))), 4.0);
        horizon = mix(horizon, vec3(0.98, 0.64, 0.39), dusk * (0.3 + facing * 0.7));
        vec3 color = mix(horizon, zenith, 1.0 - exp(-altitude * 4.4));
        float towardSun = max(0.0, dot(ray, sun));
        float visibility = smoothstep(-0.09, 0.06, sun.y);
        color += vec3(1.0, 0.88, 0.65) * pow(towardSun, 8.0) * 0.13 * visibility;
        color += vec3(1.0, 0.86, 0.62) * pow(towardSun, 180.0) * 0.24 * visibility;
        color = mix(color, vec3(1.0, 0.97, 0.86), smoothstep(0.99980, 0.99994, towardSun) * visibility);

        vec3 moon = -sun;
        // Bring both bodies through the visible sky during their own half-cycle.
        moon.z = sun.z;
        float towardMoon = max(0.0, dot(ray, moon));
        float moonlight = smoothstep(-0.05, 0.12, moon.y) * (1.0 - day);
        color += vec3(0.18, 0.24, 0.4) * pow(towardMoon, 120.0) * moonlight;
        color = mix(color, vec3(0.78, 0.84, 0.94), smoothstep(0.99965, 0.99985, towardMoon) * moonlight);

        vec2 starCell = floor(ray.xz / max(0.15, ray.y + 0.6) * 420.0);
        float star = fract(sin(dot(starCell, vec2(127.1, 311.7))) * 43758.5453);
        color += vec3(0.56, 0.64, 0.8) * smoothstep(0.9985, 1.0, star)
            * (1.0 - smoothstep(0.0, 0.45, day)) * smoothstep(0.0, 0.3, ray.y);
        return color;
    }

    void main() {
        vec3 ray = normalize(vec3((uv.x * 2.0 - 1.0) * aspect * tanHalfFov,
            (uv.y * 2.0 - 1.0) * tanHalfFov, -1.0));
        vec3 sun = normalize(vec3(-cos(time), sin(time), -0.85));
        float day = smoothstep(-0.25, 0.10, sin(time));
        float dusk = (1.0 - smoothstep(0.0, 0.42, abs(sin(time) - 0.04))) * day;
        vec3 sky = atmosphere(ray, sun, day, dusk);
        vec3 color = sky;

        if (ray.y > 0.018) {
            vec3 origin = vec3(cameraPosition.x, cameraPosition.y, 0.0);
            float start = max(0.0, (420.0 - origin.y) / ray.y);
            float end = min(18000.0, (730.0 - origin.y) / ray.y);
            // Bounded work: the volume is rendered at reduced resolution, then
            // linearly upsampled. No per-frame CPU ray marching or readbacks.
            float stepLength = min(190.0, max(0.0, end - start) / 36.0);
            float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
            float distance = start + stepLength * jitter;
            vec3 accumulated = vec3(0.0);
            float transmission = 1.0;
            vec3 lightDirection = normalize(vec3(mix(-sun.x, sun.x, day), max(0.18, abs(sun.y)), sun.z));
            vec3 sunlight = mix(vec3(1.0, 0.97, 0.90), vec3(1.0, 0.71, 0.46), dusk * 0.7);
            for (int i = 0; i < 36; i++) {
                if (distance >= end || transmission < 0.015) break;
                vec3 p = origin + ray * distance;
                float fog = density(p, true);
                if (fog > 0.005) {
                    float shadow = density(p + lightDirection * 28.0, false) * 0.7
                        + density(p + lightDirection * 75.0, false) * 1.1
                        + density(p + lightDirection * 155.0, false) * 1.5;
                    float direct = exp(-shadow * 1.6);
                    float topLight = smoothstep(420.0, 690.0, p.y);
                    vec3 ambient = mix(vec3(0.62, 0.65, 0.69), vec3(0.76, 0.77, 0.78), topLight);
                    vec3 lit = ambient + sunlight * (0.08 + direct * 0.20);
                    lit *= mix(vec3(1.0), vec3(1.0, 0.83, 0.67), dusk * 0.55);
                    // A thin sun-facing edge transmits more warm light.
                    lit += sunlight * pow(max(0.0, dot(ray, sun)), 12.0) * direct * 0.08;
                    lit = mix(lit * vec3(0.16, 0.21, 0.32), lit, day);
                    lit = mix(lit, sky, 1.0 - exp(-distance * 0.000085));
                    float opacity = 1.0 - exp(-fog * stepLength * 0.028);
                    accumulated += lit * opacity * transmission;
                    transmission *= 1.0 - opacity;
                }
                distance += stepLength;
            }
            color = accumulated + sky * transmission;
            color = mix(sky, color, smoothstep(0.025, 0.11, ray.y));
        }
        // The sRGB render target encodes linear output; the background samples
        // it once without applying the terrain's tone mapping a second time.
        color = clamp(color, 0.0, 1.0);
        outColor = vec4(mix(color / 12.92, pow((color + 0.055) / 1.055, vec3(2.4)),
            step(vec3(0.04045), color)), 1.0);
    }
`;

export class VolumetricSky {
    constructor() {
        // A small, repeatable 3D noise lattice; texture filtering supplies the
        // interpolation already supported by the existing WebGL2 renderer.
        const data = new Uint8Array(32 ** 3);
        let seed = 7429;
        for (let i = 0; i < data.length; i++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            data[i] = seed >>> 24;
        }
        this.noise = new THREE.Data3DTexture(data, 32, 32, 32);
        this.noise.format = THREE.RedFormat;
        this.noise.minFilter = this.noise.magFilter = THREE.LinearFilter;
        this.noise.wrapS = this.noise.wrapT = this.noise.wrapR = THREE.RepeatWrapping;
        this.noise.needsUpdate = true;
        this.target = new THREE.WebGLRenderTarget(1, 1, {
            depthBuffer: false, stencilBuffer: false, colorSpace: THREE.SRGBColorSpace,
        });
        this.material = new THREE.RawShaderMaterial({
            glslVersion: THREE.GLSL3, vertexShader, fragmentShader,
            depthTest: false, depthWrite: false,
            uniforms: {
                noiseVolume: { value: this.noise }, seconds: { value: 0 }, time: { value: 1 },
                aspect: { value: 1 }, tanHalfFov: { value: Math.tan(Math.PI / 5) },
                cameraPosition: { value: new THREE.Vector2() },
            },
        });
        this.geometry = new THREE.PlaneGeometry(2, 2);
        this.scene = new THREE.Scene();
        const mesh = new THREE.Mesh(this.geometry, this.material);
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        this.camera = new THREE.Camera();
    }

    draw(renderer, { width, height, time, seconds, cameraX, cameraY, surfaceY, fov }) {
        const scale = Math.min(0.5, 960 / width, 540 / height);
        const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
        if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);
        const uniforms = this.material.uniforms;
        uniforms.seconds.value = seconds;
        uniforms.time.value = time;
        uniforms.aspect.value = width / height;
        uniforms.tanHalfFov.value = Math.tan(fov * Math.PI / 360);
        uniforms.cameraPosition.value.set(cameraX * 0.12, (surfaceY - cameraY - height / 2) * 0.12);
        const previousTarget = renderer.getRenderTarget();
        try {
            renderer.setRenderTarget(this.target);
            renderer.render(this.scene, this.camera);
        } finally {
            renderer.setRenderTarget(previousTarget);
        }
        return this.target.texture;
    }

    dispose() {
        this.noise.dispose(); this.target.dispose();
        this.geometry.dispose(); this.material.dispose();
    }
}

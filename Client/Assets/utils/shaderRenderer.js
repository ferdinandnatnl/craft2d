import { normalizeShaderMode } from "./shaderModes.js";

const VERTEX_SHADER = `
    attribute vec2 aPosition;
    attribute vec2 aTexCoord;
    varying vec2 vTexCoord;

    void main() {
        gl_Position = vec4(aPosition, 0.0, 1.0);
        vTexCoord = aTexCoord;
    }
`;

// Adapted from Photon Shaders v1.2a by SixthSurge:
// program/c14_color_grading.fsh, c12_bloom_gaussian_0.fsh, and
// c13_bloom_gaussian_1.fsh. Photon license: PHOTON-LICENSE.txt.
const FRAGMENT_SHADER = `
    precision mediump float;

    uniform sampler2D uScene;
    uniform sampler2D uInput;
    uniform sampler2D uBloom;
    uniform vec2 uTexelSize;
    uniform vec2 uBlurDirection;
    uniform int uPass;
    varying vec2 vTexCoord;

    // Photon v1.2a's Rec. 709 / Rec. 2020 working-space matrices.
    const mat3 xyzToRec709 = mat3(
         3.2406, -0.9689,  0.0557,
        -1.5372,  1.8758, -0.2040,
        -0.4986,  0.0415,  1.0570
    );
    const mat3 rec709ToXyz = mat3(
        0.4124, 0.2126, 0.0193,
        0.3576, 0.7152, 0.1192,
        0.1805, 0.0722, 0.9505
    );
    const mat3 xyzToRec2020 = mat3(
         1.7166084, -0.6666829,  0.0176422,
        -0.3556621,  1.6164776, -0.0427763,
        -0.2533601,  0.0157685,  0.94222867
    );
    const mat3 rec2020ToXyz = mat3(
        0.6369736, 0.2627066, 0.0000000,
        0.1446172, 0.6779996, 0.0280728,
        0.1688585, 0.0592938, 1.0608437
    );
    const mat3 rec709ToRec2020 = xyzToRec2020 * rec709ToXyz;
    const mat3 rec2020ToRec709 = xyzToRec709 * rec2020ToXyz;

    vec3 gradeInput(vec3 color) {
        color *= 0.83;
        const float logMidpoint = -2.473931188;
        color = log2(color + vec3(0.000001));
        color = color - logMidpoint;
        color = exp2(color + logMidpoint);
        color = max(color - vec3(0.000001), vec3(0.0));
        float luminance = dot(color, vec3(0.2627, 0.6780, 0.0593));
        return max(mix(vec3(luminance), color, 0.98), vec3(0.0));
    }

    vec3 tonemapLottes(vec3 color) {
        const vec3 a = vec3(1.5);
        const vec3 d = vec3(0.91);
        const vec3 hdrMax = vec3(8.0);
        const vec3 midIn = vec3(0.26);
        const vec3 midOut = vec3(0.32);
        const vec3 b =
            (-pow(midIn, a) + pow(hdrMax, a) * midOut) /
            ((pow(hdrMax, a * d) - pow(midIn, a * d)) * midOut);
        const vec3 c =
            (pow(hdrMax, a * d) * pow(midIn, a)
                - pow(hdrMax, a) * pow(midIn, a * d) * midOut) /
            ((pow(hdrMax, a * d) - pow(midIn, a * d)) * midOut);
        return pow(max(color, vec3(0.0)), a) /
            (pow(max(color, vec3(0.0)), a * d) * b + c);
    }

    vec3 rgbToHsl(vec3 color) {
        const vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
        vec4 p = mix(
            vec4(color.bg, K.wz),
            vec4(color.gb, K.xy),
            step(color.b, color.g)
        );
        vec4 q = mix(
            vec4(p.xyw, color.r),
            vec4(color.r, p.yzx),
            step(p.x, color.r)
        );
        float delta = q.x - min(q.w, q.y);
        float epsilon = 1e-6;
        return vec3(
            abs(q.z + (q.w - q.y) / (6.0 * delta + epsilon)),
            delta / (q.x + epsilon),
            q.x
        );
    }

    vec3 hslToRgb(vec3 color) {
        const vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        color.yz = clamp(color.yz, 0.0, 1.0);
        vec3 p = abs(fract(color.xxx + K.xyz) * 6.0 - K.www);
        return color.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), color.y);
    }

    float isolateHue(float hue, float center, float width) {
        float distance = mod(hue - center + 180.0, 360.0) - 180.0;
        float t = abs(distance) / width;
        return t >= 1.0 ? 0.0 : 1.0 - t * t * (3.0 - 2.0 * t);
    }

    // Photon color grading: HSL teal boost and the gain curve from c19.
    vec3 gain(vec3 color, float strength) {
        vec3 lower = 0.5 * pow(
            2.0 * min(color, 1.0 - color),
            vec3(strength)
        );
        return mix(lower, 1.0 - lower, step(0.5, color));
    }

    vec3 photonGrade(vec3 color) {
        color = sqrt(max(color, vec3(0.0)));
        vec3 hsl = rgbToHsl(color);
        float foliage = isolateHue(hsl.x * 360.0, 110.0, 55.0);
        hsl.y *= 1.0 - 0.22 * foliage;
        float teal = isolateHue(hsl.x * 360.0, 210.0, 20.0);
        hsl.y *= 1.0 + 0.10 * teal;
        color = hslToRgb(hsl);
        color = gain(color, 1.05);
        return color * color;
    }

    vec3 gaussianBlur(vec2 uv) {
        // Photon uses these binomial weights in its separable 9-tap blur.
        const float w0 = 0.2734375;
        const float w1 = 0.21875;
        const float w2 = 0.109375;
        const float w3 = 0.03125;
        const float w4 = 0.00390625;
        vec2 stepUv = uBlurDirection * uTexelSize;
        vec3 color = texture2D(uInput, uv).rgb * w0;
        color += texture2D(uInput, uv + stepUv).rgb * w1;
        color += texture2D(uInput, uv - stepUv).rgb * w1;
        color += texture2D(uInput, uv + stepUv * 2.0).rgb * w2;
        color += texture2D(uInput, uv - stepUv * 2.0).rgb * w2;
        color += texture2D(uInput, uv + stepUv * 3.0).rgb * w3;
        color += texture2D(uInput, uv - stepUv * 3.0).rgb * w3;
        color += texture2D(uInput, uv + stepUv * 4.0).rgb * w4;
        color += texture2D(uInput, uv - stepUv * 4.0).rgb * w4;
        return color;
    }

    float vignette(vec2 uv) {
        // Photon v1.2a c14 vignette with the default intensity of 0.08.
        float value = 16.0 * (uv.x * uv.y - uv.x) * (uv.x * uv.y - uv.y);
        return pow(max(value, 0.0001), 0.08);
    }

    void main() {
        if (uPass == 0) {
            vec3 scene = rec709ToRec2020 * pow(
                max(texture2D(uScene, vTexCoord).rgb, vec3(0.0)),
                vec3(2.2)
            );
            float brightness = dot(scene, vec3(0.2627, 0.6780, 0.0593));
            float brightPart = smoothstep(0.72, 0.96, brightness);
            gl_FragColor = vec4(scene * brightPart, 1.0);
            return;
        }

        if (uPass == 1 || uPass == 2) {
            gl_FragColor = vec4(gaussianBlur(vTexCoord), 1.0);
            return;
        }

        vec3 scene = rec709ToRec2020 * pow(
            max(texture2D(uScene, vTexCoord).rgb, vec3(0.0)),
            vec3(2.2)
        );
        vec3 bloom = texture2D(uBloom, vTexCoord).rgb;
        scene += bloom * 0.12;
        scene *= vignette(vTexCoord);
        scene = gradeInput(scene);
        scene = tonemapLottes(scene);
        scene = clamp(rec2020ToRec709 * scene, 0.0, 1.0);
        scene = photonGrade(scene);
        scene = pow(max(scene, vec3(0.0)), vec3(1.0 / 2.2));
        gl_FragColor = vec4(clamp(scene, 0.0, 1.0), 1.0);
    }
`;

const FALLBACK_FILTERS = {
    off: "",
    photon: "saturate(1.04) contrast(1.04)",
};

function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Could not create a WebGL shader.");

    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader) || "Unknown shader error.";
        gl.deleteShader(shader);
        throw new Error(message);
    }

    return shader;
}

function createTexture(gl, width, height, filter) {
    const texture = gl.createTexture();
    if (!texture) throw new Error("Could not allocate a WebGL texture.");

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
    );
    return texture;
}

function createRenderTarget(gl, width, height) {
    const target = {
        width,
        height,
        texture: createTexture(gl, width, height, gl.LINEAR),
        framebuffer: gl.createFramebuffer(),
    };
    if (!target.framebuffer) throw new Error("Could not allocate a WebGL framebuffer.");

    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        target.texture,
        0,
    );
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error("The WebGL bloom framebuffer is incomplete.");
    }
    return target;
}

function resizeRenderTarget(gl, target, width, height) {
    if (target.width === width && target.height === height) return;
    target.width = width;
    target.height = height;
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
    );
}

export class ShaderRenderer {
    constructor(sourceCanvas, outputCanvas) {
        this.sourceCanvas = sourceCanvas;
        this.outputCanvas = outputCanvas;
        this.mode = "off";
        this.gl = null;
        this.program = null;
        this.texture = null;
        this.bloomTarget = null;
        this.blurTarget = null;
        this.vertexBuffer = null;
        this.positionLocation = -1;
        this.texCoordLocation = -1;
        this.passLocation = null;
        this.texelSizeLocation = null;
        this.blurDirectionLocation = null;
        this.sceneLocation = null;
        this.inputLocation = null;
        this.bloomLocation = null;
        this.supported = false;
        this.initialized = false;
        this.contextLost = false;
        this.didWarn = false;

        if (this.outputCanvas) {
            this.outputCanvas.addEventListener("webglcontextlost", (event) => {
                event.preventDefault();
                this.contextLost = true;
                this.supported = false;
                this._applyMode();
            });
            this.outputCanvas.addEventListener("webglcontextrestored", () => {
                this.contextLost = false;
                this.initialized = false;
                this._initialize();
                this._applyMode();
            });
        }

        this._applyMode();
    }

    _initialize() {
        if (
            !this.sourceCanvas ||
            !this.outputCanvas ||
            this.initialized ||
            this.contextLost
        ) {
            return;
        }
        this.initialized = true;

        try {
            this.outputCanvas.width = this.sourceCanvas.width;
            this.outputCanvas.height = this.sourceCanvas.height;
            const gl = this.outputCanvas.getContext("webgl", {
                alpha: false,
                antialias: false,
                depth: false,
                stencil: false,
                preserveDrawingBuffer: false,
            });
            if (!gl) return;

            const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
            const fragmentShader = compileShader(
                gl,
                gl.FRAGMENT_SHADER,
                FRAGMENT_SHADER,
            );
            const program = gl.createProgram();
            if (!program) throw new Error("Could not create a WebGL program.");

            gl.attachShader(program, vertexShader);
            gl.attachShader(program, fragmentShader);
            gl.linkProgram(program);
            gl.deleteShader(vertexShader);
            gl.deleteShader(fragmentShader);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                const message = gl.getProgramInfoLog(program) || "Unknown program error.";
                gl.deleteProgram(program);
                throw new Error(message);
            }

            const positionLocation = gl.getAttribLocation(program, "aPosition");
            const texCoordLocation = gl.getAttribLocation(program, "aTexCoord");
            if (positionLocation < 0 || texCoordLocation < 0) {
                gl.deleteProgram(program);
                throw new Error("The WebGL shader is missing a vertex attribute.");
            }

            const vertexBuffer = gl.createBuffer();
            if (!vertexBuffer) {
                gl.deleteProgram(program);
                throw new Error("Could not allocate a WebGL vertex buffer.");
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
            gl.bufferData(
                gl.ARRAY_BUFFER,
                new Float32Array([
                    -1, -1, 0, 0,
                    1, -1, 1, 0,
                    -1, 1, 0, 1,
                    -1, 1, 0, 1,
                    1, -1, 1, 0,
                    1, 1, 1, 1,
                ]),
                gl.STATIC_DRAW,
            );

            const width = Math.max(1, this.sourceCanvas.width);
            const height = Math.max(1, this.sourceCanvas.height);
            const texture = createTexture(gl, width, height, gl.NEAREST);
            const targetWidth = Math.max(1, Math.ceil(width / 2));
            const targetHeight = Math.max(1, Math.ceil(height / 2));
            const bloomTarget = createRenderTarget(gl, targetWidth, targetHeight);
            const blurTarget = createRenderTarget(gl, targetWidth, targetHeight);

            gl.useProgram(program);
            const sceneLocation = gl.getUniformLocation(program, "uScene");
            const inputLocation = gl.getUniformLocation(program, "uInput");
            const bloomLocation = gl.getUniformLocation(program, "uBloom");
            gl.uniform1i(sceneLocation, 0);
            gl.uniform1i(inputLocation, 1);
            gl.uniform1i(bloomLocation, 2);

            this.gl = gl;
            this.program = program;
            this.texture = texture;
            this.bloomTarget = bloomTarget;
            this.blurTarget = blurTarget;
            this.vertexBuffer = vertexBuffer;
            this.positionLocation = positionLocation;
            this.texCoordLocation = texCoordLocation;
            this.sceneLocation = sceneLocation;
            this.inputLocation = inputLocation;
            this.bloomLocation = bloomLocation;
            this.passLocation = gl.getUniformLocation(program, "uPass");
            this.texelSizeLocation = gl.getUniformLocation(program, "uTexelSize");
            this.blurDirectionLocation = gl.getUniformLocation(
                program,
                "uBlurDirection",
            );
            this.supported = true;
        } catch (error) {
            this._warn(error);
            this.supported = false;
        }
    }

    _warn(error) {
        if (this.didWarn) return;
        this.didWarn = true;
        console.warn("Shaders are unavailable; using the 2D canvas fallback.", error);
    }

    _applyMode() {
        const useWebGL = this.mode !== "off" && this.supported;
        document.body.classList.toggle("shaders-active", useWebGL);
        if (this.sourceCanvas) {
            this.sourceCanvas.style.filter =
                this.mode !== "off" && !this.supported
                    ? FALLBACK_FILTERS[this.mode]
                    : "";
        }
    }

    setMode(mode) {
        this.mode = normalizeShaderMode(mode);
        if (this.mode !== "off") this._initialize();
        this._applyMode();
        return this.mode;
    }

    _bindFullscreenGeometry(gl) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.enableVertexAttribArray(this.positionLocation);
        gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(this.texCoordLocation);
        gl.vertexAttribPointer(this.texCoordLocation, 2, gl.FLOAT, false, 16, 8);
    }

    _bindTexture(gl, unit, texture, location) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(location, unit);
    }

    _drawPass(gl, pass, framebuffer, width, height) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.viewport(0, 0, width, height);
        gl.uniform1i(this.passLocation, pass);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    render() {
        if (this.mode === "off" || !this.supported || !this.gl) return;

        const gl = this.gl;
        if (gl.isContextLost()) {
            this.supported = false;
            this._applyMode();
            return;
        }

        try {
            const width = Math.max(1, this.sourceCanvas.width);
            const height = Math.max(1, this.sourceCanvas.height);
            if (this.outputCanvas.width !== width || this.outputCanvas.height !== height) {
                this.outputCanvas.width = width;
                this.outputCanvas.height = height;
                gl.bindTexture(gl.TEXTURE_2D, this.texture);
                gl.texImage2D(
                    gl.TEXTURE_2D,
                    0,
                    gl.RGBA,
                    width,
                    height,
                    0,
                    gl.RGBA,
                    gl.UNSIGNED_BYTE,
                    null,
                );
                const targetWidth = Math.max(1, Math.ceil(width / 2));
                const targetHeight = Math.max(1, Math.ceil(height / 2));
                resizeRenderTarget(gl, this.bloomTarget, targetWidth, targetHeight);
                resizeRenderTarget(gl, this.blurTarget, targetWidth, targetHeight);
                for (const target of [this.bloomTarget, this.blurTarget]) {
                    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
                    gl.framebufferTexture2D(
                        gl.FRAMEBUFFER,
                        gl.COLOR_ATTACHMENT0,
                        gl.TEXTURE_2D,
                        target.texture,
                        0,
                    );
                }
            }

            gl.useProgram(this.program);
            this._bindFullscreenGeometry(gl);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.texSubImage2D(
                gl.TEXTURE_2D,
                0,
                0,
                0,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                this.sourceCanvas,
            );
            const bloomWidth = this.bloomTarget.width;
            const bloomHeight = this.bloomTarget.height;
            this._bindTexture(gl, 0, this.texture, this.sceneLocation);
            // All active samplers must avoid the current render target, even
            // when their branch is unused in this pass (including next frame).
            this._bindTexture(gl, 1, this.texture, this.inputLocation);
            this._bindTexture(gl, 2, this.texture, this.bloomLocation);
            this._drawPass(
                gl,
                0,
                this.bloomTarget.framebuffer,
                bloomWidth,
                bloomHeight,
            );

            gl.uniform2f(this.texelSizeLocation, 1 / bloomWidth, 1 / bloomHeight);
            this._bindTexture(gl, 1, this.bloomTarget.texture, this.inputLocation);
            gl.uniform2f(this.blurDirectionLocation, 1, 0);
            this._drawPass(
                gl,
                1,
                this.blurTarget.framebuffer,
                bloomWidth,
                bloomHeight,
            );

            this._bindTexture(gl, 1, this.blurTarget.texture, this.inputLocation);
            gl.uniform2f(this.blurDirectionLocation, 0, 1);
            this._drawPass(
                gl,
                2,
                this.bloomTarget.framebuffer,
                bloomWidth,
                bloomHeight,
            );

            this._bindTexture(gl, 0, this.texture, this.sceneLocation);
            this._bindTexture(gl, 2, this.bloomTarget.texture, this.bloomLocation);
            this._drawPass(gl, 3, null, width, height);
        } catch (error) {
            this._warn(error);
            this.supported = false;
            this._applyMode();
        }
    }
}

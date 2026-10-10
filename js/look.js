/* WareTrack – the lifelike look: physically based materials, a real-world palette, procedural surface detail
   (grass, asphalt, concrete slabs, gravel, rippling water), a sky dome with sun and haze, and the image-based
   lighting that the sky casts onto every surface. Loaded right after three.js, before any model is built. */
(function () {
  const T = THREE;
  T.ColorManagement.legacyMode = false; // hex colours are sRGB; lighting runs in linear space

  const L = (WT.LOOK = {});

  /* ---------- real-world palette ---------- */
  // The park's semantic surface colours (W.COL and friends) map to what they are made of.
  // kind: 0 object · 1 grass · 2 asphalt · 3 concrete · 4 water · 5 gravel · 6 paint · 7 sand
  L.SURF = {
    0xe8ebfa: { c: 0x4c6930, kind: 1 },  // ground → grass
    0xcdd3f0: { c: 0x47494d, kind: 2 },  // road → asphalt
    0xbfc5e2: { c: 0x3e4044, kind: 2 },  // runway, courier lanes
    0x8e95b8: { c: 0x55575b, kind: 2 },  // bay lanes
    0x9aa2c6: { c: 0x8a8a86, kind: 3 },  // shed floors
    0xdde1f5: { c: 0x8e8d87, kind: 3 },  // apron
    0xd8ddf2: { c: 0x86857f, kind: 3 },  // concrete
    0xdfe3f5: { c: 0x82817b, kind: 3 },  // plot pad
    0xadc9f3: { c: 0x1f4a63, kind: 4 },  // water
    0xc9c6d6: { c: 0x6e6961, kind: 5 },  // ballast
    0xdfe2f2: { c: 0xc4b48a, kind: 7 },  // shoreline → sand
    0xa49c90: { c: 0x7d756b, kind: 5 },  // sleepers
    0xf8f9ff: { c: 0xe6e6e0, kind: 6 },  // road markings
    0xffffff: { c: 0xecece6, kind: 6 },
    0xf1c66b: { c: 0xdcae36, kind: 6 },  // yellow lines
    0xf0b429: { c: 0xdca52a, kind: 6 },
  };
  // the old pastel style tinted every neutral lavender; real paint, steel and concrete are neutral
  const _c = new T.Color(), _hsl = {};
  const realCache = new Map();
  L.real = (hex) => {
    if (typeof hex !== 'number') return hex;
    let r = realCache.get(hex);
    if (r !== undefined) return r;
    _c.setHex(hex);
    _c.getHSL(_hsl);
    const hue = _hsl.h * 360;
    if (_hsl.s < 0.32 && hue > 195 && hue < 270) _c.setHSL(_hsl.h, _hsl.s * 0.12, _hsl.l * 0.97);
    else if (_hsl.s > 0.5) _c.setHSL(_hsl.h, _hsl.s * 0.86, _hsl.l * 0.96); // factory paint, not candy
    r = _c.getHex();
    realCache.set(hex, r);
    return r;
  };

  /* ---------- the surface shader: every MeshStandardMaterial is patched ---------- */
  // Per material: userData.kind (see above, default 0) and userData.auto (derive roughness / metalness from the
  // colour: steel greys are metal, dark blue tints are glass, greens and browns are matte, the rest is paint).
  L.time = { value: 0 };
  L.night = { value: 0 }; // 0 day … 1 night: lamps, headlights and office windows light up
  L.puffShade = 1;
  const NOISE = `
    varying vec3 vWPos;
    uniform float uKind, uAuto, uTime, uNight;
    float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
    }
    float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
  `;
  function patch(shader) {
    const u = this.userData;
    shader.uniforms.uKind = { value: u.kind || 0 };
    shader.uniforms.uAuto = { value: u.auto === false ? 0 : 1 };
    shader.uniforms.uTime = L.time;
    shader.uniforms.uNight = L.night;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 wp_ = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp_ = instanceMatrix * wp_;
        #endif
        vWPos = (modelMatrix * wp_).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NOISE)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float kind_ = uKind, rough_ = -1.0, metal_ = 0.0, glow_ = 0.0;
        vec2 xz_ = vWPos.xz;
        if (kind_ < 0.5) {
          // objects: a little grime, and contact shadow where they meet the ground
          diffuseColor.rgb *= 0.94 + 0.12 * vnoise(vWPos.xz * 1.7 + vWPos.y * 1.3);
          diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 1.1, vWPos.y));
          if (uAuto > 0.5) {
            vec3 c_ = diffuseColor.rgb;
            float mx_ = max(c_.r, max(c_.g, c_.b)), mn_ = min(c_.r, min(c_.g, c_.b));
            float sat_ = mx_ > 0.001 ? (mx_ - mn_) / mx_ : 0.0, lum_ = dot(c_, vec3(0.2126, 0.7152, 0.0722));
            if (sat_ < 0.14 && lum_ > 0.035 && lum_ < 0.42) { metal_ = 0.65; rough_ = 0.38; }        // steel
            else if (lum_ < 0.025 && sat_ < 0.45) { rough_ = 0.88; }                                   // rubber, soot
            else if (c_.b > c_.r * 1.5 && lum_ < 0.06 && sat_ > 0.35) {                                // glass
              metal_ = 0.4; rough_ = 0.06;
              // offices above the ground floor keep some lights on after dark
              if (vWPos.y > 4.5 && h21(floor(vWPos.xz * 0.45) + floor(vWPos.y * 0.33) * 7.0) > 0.45) glow_ = 0.5;
            }
            else if (c_.g >= c_.r && c_.g > c_.b * 1.15 && sat_ > 0.2) { rough_ = 0.85; }             // foliage
            else if (c_.r > c_.g && c_.g > c_.b && sat_ < 0.62) { rough_ = 0.78; }                     // wood, card, earth
            else { rough_ = 0.42; }                                                                   // paint
            // warm white lenses: street lamps, headlights
            if (c_.r > 0.9 && lum_ > 0.75 && sat_ > 0.25 && sat_ < 0.62 && c_.b < c_.g) glow_ = 3.0;
          }
        } else if (kind_ < 1.5) {
          // grass: big patches of lush and dry, mown stripes of tufts
          float big_ = fbm(xz_ * 0.012), mid_ = fbm(xz_ * 0.09 + 3.0), fine_ = vnoise(xz_ * 1.9);
          vec3 dry_ = vec3(0.30, 0.27, 0.10), lush_ = vec3(0.07, 0.16, 0.035);
          diffuseColor.rgb = mix(diffuseColor.rgb, lush_, smoothstep(0.45, 0.75, big_) * 0.7);
          diffuseColor.rgb = mix(diffuseColor.rgb, dry_, smoothstep(0.5, 0.8, mid_) * 0.45);
          diffuseColor.rgb *= 0.82 + 0.3 * fine_;
          diffuseColor.rgb *= 0.9 + 0.2 * h21(floor(xz_ * 9.0));
          rough_ = 0.95;
        } else if (kind_ < 2.5) {
          // asphalt: aggregate speckle, patched and worn areas
          float s_ = h21(floor(xz_ * 14.0)), w_ = fbm(xz_ * 0.05);
          diffuseColor.rgb *= 0.88 + 0.2 * s_;
          diffuseColor.rgb *= 0.85 + 0.3 * w_;
          rough_ = 0.82 - 0.1 * w_;
        } else if (kind_ < 3.5) {
          // concrete: 6 m slabs with joints, each slab its own shade, stains
          vec2 g_ = xz_ / 6.0, f_ = abs(fract(g_) - 0.5);
          float joint_ = smoothstep(0.485, 0.5, max(f_.x, f_.y));
          diffuseColor.rgb *= 0.92 + 0.12 * h21(floor(g_) + 7.0);
          diffuseColor.rgb *= 0.88 + 0.22 * fbm(xz_ * 0.15);
          diffuseColor.rgb *= 1.0 - joint_ * 0.35;
          rough_ = 0.9;
        } else if (kind_ < 4.5) {
          rough_ = 0.04;
          diffuseColor.rgb *= 0.85 + 0.25 * fbm(xz_ * 0.004);
        } else if (kind_ < 5.5) {
          // gravel: coarse stones
          float st_ = h21(floor(xz_ * 5.0)), st2_ = h21(floor(xz_ * 11.0) + 3.0);
          diffuseColor.rgb *= 0.7 + 0.35 * st_ * 0.6 + 0.35 * st2_ * 0.6;
          rough_ = 0.95;
        } else if (kind_ < 6.5) {
          // worn road paint
          diffuseColor.rgb *= 0.8 + 0.25 * fbm(xz_ * 0.7);
          rough_ = 0.7;
        } else {
          diffuseColor.rgb *= 0.86 + 0.24 * fbm(xz_ * 0.6) + 0.06 * h21(floor(xz_ * 20.0));
          rough_ = 0.97;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        if (rough_ >= 0.0) roughnessFactor = rough_;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        if (rough_ >= 0.0) metalnessFactor = metal_;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += (glow_ > 2.0 ? diffuseColor.rgb : vec3(1.0, 0.78, 0.45) * 0.6) * glow_ * uNight;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (uKind > 3.5 && uKind < 4.5) {
          // water: two wave trains drifting, perturbing the normal so the sky and sun glitter on it
          vec2 p1_ = vWPos.xz * 0.16 + vec2(uTime * 0.25, uTime * 0.11), p2_ = vWPos.xz * 0.43 + vec2(-uTime * 0.31, uTime * 0.2);
          float e_ = 0.35;
          float gx_ = (vnoise(p1_ + vec2(e_, 0)) - vnoise(p1_ - vec2(e_, 0))) + 0.5 * (vnoise(p2_ + vec2(e_, 0)) - vnoise(p2_ - vec2(e_, 0)));
          float gz_ = (vnoise(p1_ + vec2(0, e_)) - vnoise(p1_ - vec2(0, e_))) + 0.5 * (vnoise(p2_ + vec2(0, e_)) - vnoise(p2_ - vec2(0, e_)));
          normal = normalize(normal + (viewMatrix * vec4(-gx_, 0.0, -gz_, 0.0)).xyz * 0.45);
        }`);
  }
  T.MeshStandardMaterial.prototype.onBeforeCompile = patch;

  /* ---------- sky dome ---------- */
  L.SKY = {
    day: { zenith: 0x3d76c9, horizon: 0xc9dcec, ground: 0x6b6c5e, sun: 0xfff3dc, sunSize: 1, haze: 0xc5d6e4 },
    night: { zenith: 0x02050d, horizon: 0x1a2436, ground: 0x0b0d10, sun: 0xc8d6ff, sunSize: 0.6, haze: 0x161f2e },
  };
  L.skyMaterial = () => new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: {
      zenith: { value: new T.Color() }, horizon: { value: new T.Color() }, ground: { value: new T.Color() },
      sunCol: { value: new T.Color() }, sunDir: { value: new T.Vector3(0, 1, 0) }, sunSize: { value: 1 }, uTime: L.time,
    },
    vertexShader: `varying vec3 vDir;
      void main() { vDir = (modelMatrix * vec4(position, 0.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vDir;
      uniform vec3 zenith, horizon, ground, sunCol, sunDir; uniform float sunSize, uTime;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0 ? mix(horizon, zenith, pow(min(1.0, h * 1.6), 0.55)) : mix(horizon, ground, smoothstep(0.0, 0.12, -h));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        col += sunCol * (pow(s, 6.0) * 0.18 + pow(s, 60.0) * 0.5 * sunSize) ;
        col = mix(col, sunCol * 18.0 * sunSize, smoothstep(0.99955, 0.9997, s));
        // soft cumulus band above the horizon
        if (h > 0.0) {
          vec2 uv = d.xz / (h + 0.18) * 2.2 + vec2(uTime * 0.004, 0.0);
          float c = vn(uv) * 0.55 + vn(uv * 2.3) * 0.3 + vn(uv * 5.1) * 0.15;
          c = smoothstep(0.55, 0.85, c) * smoothstep(0.0, 0.12, h);
          col = mix(col, mix(horizon, sunCol, 0.55) * 1.05, c * 0.75);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`,
  });
  L.setSky = (mat, look, sunDir) => {
    const u = mat.uniforms;
    u.zenith.value.setHex(look.zenith); u.horizon.value.setHex(look.horizon); u.ground.value.setHex(look.ground);
    u.sunCol.value.setHex(look.sun); u.sunDir.value.copy(sunDir); u.sunSize.value = look.sunSize;
  };
})();

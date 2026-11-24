const TAU = Math.PI * 2;
const IGNITION = 0.449;
const EXPANSION_END = 0.66;
const PERSPECTIVE = 0.092;
const WORK_MARKS = ["bhutan", "founder", "amazon", "random", "tax", "capital"];
const MARK_WIDTH = 3.85;
const MARK_HEIGHT = 2.65;
const SCATTER_RADIUS = 0.76;
const KNOT = {
  ringRadius: 1.13, radialWave: 0.43, depthWave: 0.57, turns: 2, lobes: 3,
  width: 1.2, height: 0.95, tilt: -0.43, coreRadius: 0.16, surfaceRadius: 0.372,
};
const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const mix = (from, to, amount) => from + (to - from) * amount;

function smooth(start, end, value) {
  const t = clamp((value - start) / (end - start));
  return t * t * (3 - 2 * t);
}

function randomSource(seed) {
  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function turn([x, y, z], angle) {
  return [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle), z];
}

function knot(t, tubeX, tubeY) {
  const ring = KNOT.ringRadius + KNOT.radialWave * Math.cos(KNOT.lobes * t) + tubeX;
  return turn([
    ring * Math.cos(KNOT.turns * t) * KNOT.width,
    ring * Math.sin(KNOT.turns * t) * KNOT.height,
    KNOT.depthWave * Math.sin(KNOT.lobes * t) + tubeY,
  ], KNOT.tilt);
}

const forms = {
  cloud(t, band, distance, height, seed) {
    const strand = Math.floor(seed * 6);
    const spread = (height - 0.5) * (0.12 + 0.36 * distance);
    let radius = 0.38 + Math.pow(distance, 0.76) * 2.08;
    let angle = t + radius * 0.9 + strand * 0.21;
    if (seed < 0.77) {
      radius = 0.45 + strand * 0.28 + Math.sin(t * 1.4 + strand) * 0.32 + spread;
      angle = t + radius * 0.68 + strand * 0.38;
    }
    return turn([
      Math.cos(angle) * radius,
      Math.sin(angle) * radius * 0.62 + spread,
      Math.sin(angle) * radius * 0.58 + (Math.sin(band) * 0.42 + height - 0.5) * 0.7,
    ], 0.50);
  },

  stream(t, band, distance, height, seed) {
    const strand = Math.floor(seed * 5);
    const radius = 0.25 + distance * 2.12;
    const angle = t * 0.53 + radius * 1.5 + strand * TAU / 5 + (height - 0.5) * 0.28;
    return turn([
      radius * Math.cos(angle),
      radius * Math.sin(angle) * 0.76,
      Math.sin(band) * 0.46 + Math.sin(radius * 2.8 + strand) * 0.5,
    ], -0.14);
  },

  bloom(t, band, distance, height, seed) {
    const side = t < Math.PI ? -1 : 1;
    const jet = Math.floor((t % Math.PI) / Math.PI * 4);
    const scatter = smooth(0.79, 1, seed);
    const reach = 2.45 + 0.35 * Math.cos(jet * 1.8 + side) + 1.28 * scatter;
    const radius = Math.pow(distance, 0.74) * reach;
    const spread = 0.089 + radius * 0.055 + 0.48 * scatter;
    const axis = side < 0 ? (jet - 1.35) * 0.32 : (jet - 1.62) * 0.26;
    const angle = axis + Math.sin(band) * spread + Math.sin(radius * 2.3 + jet) * 0.075;
    return [
      side * Math.cos(angle) * radius * 1.19,
      Math.sin(angle) * radius + (height - 0.5) * radius * 0.12,
      (height - 0.5) * radius * 0.82 + Math.cos(band + jet) * radius * 0.18,
    ];
  },

  contact(t, band, distance) {
    const wave = Math.sin(t * 2);
    const width = (distance - 0.5) * 0.43;
    return turn([
      Math.cos(t) * (1.77 + Math.cos(band) * width),
      wave * 0.58 + Math.sin(band) * width,
      Math.sin(t) * 0.72 + Math.cos(band) * width,
    ], 0.53);
  },
};

function makeParticles(count) {
  const random = randomSource(61872);
  const generators = Object.entries(forms);
  const qualities = new Float32Array(count * 4);
  const knotTube = new Float32Array(count * 3);
  const shapes = { center: new Float32Array(count * 3), now: new Float32Array(count * 3) };
  for (const name of Object.keys(forms)) shapes[name] = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const t = random() * TAU;
    const band = random() * TAU;
    const distance = random();
    const height = random();
    const seed = random();
    const size = 0.0046 + Math.pow(random(), 4.0) * 0.030;
    qualities.set([seed, size, t, random()], i * 4);
    // One in five particles follows the current at every particle budget.
    const inCore = i % 5 === 0;
    const shellIndex = i - Math.ceil(i / 5);
    // Space the sheath evenly around the tube, with a small jitter to soften the pattern.
    const knotT = inCore ? t : TAU * ((shellIndex * 0.754877666 + height * 0.003) % 1);
    const section = inCore ? band : TAU * ((shellIndex * 0.569840291 + seed * 0.009) % 1);
    const radius = inCore ? mix(0.02, 0.155, Math.sqrt(distance)) : KNOT.surfaceRadius + (distance - 0.5) * 0.036;
    const tubeX = radius * Math.cos(section);
    const tubeY = radius * Math.sin(section);
    knotTube.set([tubeX, tubeY, knotT], i * 3);
    shapes.now.set(knot(knotT, tubeX, tubeY), i * 3);
    for (const [name, create] of generators) {
      shapes[name].set(create(t, band, distance, height, seed), i * 3);
    }
  }
  return { qualities, knotTube, shapes };
}

async function loadWorkMark(name, count) {
  const image = new Image();
  image.src = new URL(`../assets/work/${name}.png`, import.meta.url);
  await image.decode();
  const { naturalWidth: width, naturalHeight: height } = image;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, width, height);
  const opaque = [];
  for (let i = 0; i < width * height; i++) {
    if (data[i * 4 + 3] > 127) opaque.push(i);
  }
  if (!opaque.length) throw new Error("The artwork has no visible pixels.");

  const random = randomSource(61872);
  const positions = new Float32Array(count * 3);
  const colors = new Uint8Array(count * 4);
  const scale = Math.min(MARK_WIDTH / width, MARK_HEIGHT / height);
  for (let i = 0; i < count; i++) {
    const pixel = opaque[Math.floor(random() * opaque.length)];
    positions[i * 3] = (pixel % width + random() - width / 2) * scale;
    positions[i * 3 + 1] = (height / 2 - Math.floor(pixel / width) - random()) * scale;
    colors[i * 4] = data[pixel * 4];
    colors[i * 4 + 1] = data[pixel * 4 + 1];
    colors[i * 4 + 2] = data[pixel * 4 + 2];
    colors[i * 4 + 3] = 255;
  }
  return { positions, colors };
}

function advanceScatter(offsets, velocities, positions, qualities, pointerX, pointerY, count, delta) {
  const dt = Math.min(delta, 32) * 0.001;
  const damping = Math.exp(-14 * dt);
  const radiusSquared = SCATTER_RADIUS * SCATTER_RADIUS;
  let moving = false;
  for (let i = 0; i < count * 3; i += 3) {
    const x = positions[i] - pointerX;
    const y = positions[i + 1] - pointerY;
    const distanceSquared = x * x + y * y;
    let targetX = 0;
    let targetY = 0;
    if (distanceSquared < radiusSquared) {
      const falloff = 1 - distanceSquared / radiusSquared;
      const seed = qualities[i / 3 * 4 + 3];
      const push = mix(0.12, 0.78, seed) * falloff * falloff / Math.max(0.06, Math.sqrt(distanceSquared));
      const sideways = push * (seed - 0.5) * 0.55;
      targetX = x * push - y * sideways;
      targetY = y * push + x * sideways;
    }
    for (let axis = 0; axis < 2; axis++) {
      const index = i + axis;
      const target = axis === 0 ? targetX : targetY;
      const spring = target - offsets[index];
      if (Math.abs(spring) < 0.001 && Math.abs(velocities[index]) < 0.006) {
        offsets[index] = target;
        velocities[index] = 0;
      } else {
        velocities[index] = velocities[index] * damping + spring * 76 * dt;
        offsets[index] += velocities[index] * dt;
        moving = true;
      }
    }
  }
  return moving;
}

function advanceDisplacements(offsets, velocities, from, to, blend, light, lightVelocity, count, delta) {
  const dt = Math.min(delta, 34) * 0.001;
  const airDrag = 1 - Math.exp(-dt * 8.8);
  const shieldRadius = 0.46;
  const influenceRadiusSquared = 2.15;
  const [lightX, lightY, lightZ] = light;
  const [vx, vy, vz] = lightVelocity;

  for (let i = 0; i < count * 3; i += 3) {
    const x = mix(from[i], to[i], blend) + offsets[i] - lightX;
    const y = mix(from[i + 1], to[i + 1], blend) + offsets[i + 1] - lightY;
    const z = mix(from[i + 2], to[i + 2], blend) + offsets[i + 2] - lightZ;
    const distanceSquared = x * x + y * y + z * z;
    let airX = 0;
    let airY = 0;
    let airZ = 0;
    let forceX = 0;
    let forceY = 0;
    let forceZ = 0;
    let stiffness = 20;

    if (distanceSquared < influenceRadiusSquared) {
      const distance = Math.max(0.001, Math.sqrt(distanceSquared));
      const nx = x / distance;
      const ny = y / distance;
      const nz = z / distance;
      const proximity = 1 - distanceSquared / influenceRadiusSquared;
      const innerFade = Math.min(1, distance / shieldRadius);
      // Flow around a moving sphere slips along its sides and closes in its wake.
      const wake = 0.68 * Math.pow(shieldRadius / Math.max(distance, shieldRadius), 3) * proximity;
      const along = 3 * (vx * nx + vy * ny + vz * nz);
      // Circulation follows a tilted axis so nearer and deeper paths differ.
      const swirl = 2.9 * proximity * innerFade;
      airX = wake * (along * nx - vx) + swirl * (0.20 * nz - 0.92 * ny);
      airY = wake * (along * ny - vy) + swirl * (0.92 * nx - 0.34 * nz);
      airZ = wake * (along * nz - vz) + swirl * (0.34 * ny - 0.20 * nx);
      const radial = 94 * Math.max(0, shieldRadius - distance) - 7.4 * proximity * innerFade;
      forceX = radial * nx;
      forceY = radial * ny;
      forceZ = radial * nz;
      stiffness = mix(stiffness, 2.8, proximity);
    }

    velocities[i] = mix(velocities[i], airX, airDrag) + (forceX - stiffness * offsets[i]) * dt;
    velocities[i + 1] = mix(velocities[i + 1], airY, airDrag) + (forceY - stiffness * offsets[i + 1]) * dt;
    velocities[i + 2] = mix(velocities[i + 2], airZ, airDrag) + (forceZ - stiffness * offsets[i + 2]) * dt;
    offsets[i] += velocities[i] * dt;
    offsets[i + 1] += velocities[i + 1] * dt;
    offsets[i + 2] += velocities[i + 2] * dt;
  }
}

function facetedSphere() {
  const g = (1 + Math.sqrt(5)) / 2;
  const points = [
    [-1, g, 0], [1, g, 0], [-1, -g, 0], [1, -g, 0],
    [0, -1, g], [0, 1, g], [0, -1, -g], [0, 1, -g],
    [g, 0, -1], [g, 0, 1], [-g, 0, -1], [-g, 0, 1],
  ].map((v) => v.map((component) => component / Math.hypot(...v)));
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  return new Float32Array(faces.flatMap((face) => {
    const [a, b, c] = face.map((index) => points[index]);
    const direction = a.map((value, index) => value + b[index] + c[index]);
    const normal = direction.map((value) => value / Math.hypot(...direction));
    return [a, b, c].flatMap((point) => [...point, ...normal]);
  }));
}

const sceneTransform = `
uniform vec2 uCenter;
uniform float uAspect, uScale, uOrbit, uRoll;
mat2 turn(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

vec3 orient(vec3 p) {
  p.xz = turn(uOrbit) * p.xz;
  p.xy = turn(uRoll) * p.xy;
  return p;
}

vec3 viewFrom(vec3 p) {
  return vec3(-p.xy, 1.0 / ${PERSPECTIVE} - p.z);
}

vec4 project(vec3 p, vec3 offset) {
  float depth = 1.0 - p.z * ${PERSPECTIVE};
  vec2 projection = vec2(uScale / uAspect, uScale);
  return vec4(uCenter * depth + (p.xy + offset.xy) * projection, (-p.z - offset.z) * 0.17, depth);
}`;

const vertexSource = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aVertex;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec4 aQuality;
layout(location = 3) in vec3 aFrom;
layout(location = 4) in vec3 aTo;
layout(location = 5) in vec3 aDisplacement;
layout(location = 6) in vec4 aFromInk;
layout(location = 7) in vec4 aToInk;
layout(location = 8) in vec3 aKnotTube;
uniform vec3 uLight;
uniform bool uCurvedBurst;
uniform int uKnotSide;
uniform float uTime, uBlend, uColor, uMagnet, uOpacity, uPalette, uBloom;
uniform float uField, uMotion, uStreak, uDensityScale;
out vec3 vNormal;
out vec3 vLight;
out vec3 vView;
out vec4 vInk;
out float vNear, vSeed, vHue, vDepth, vKnotBlend, vKnotFlow, vTrail;
${sceneTransform}

vec3 knot(float t, vec2 tube) {
  float azimuth = ${KNOT.turns.toFixed(1)} * t;
  float lobe = ${KNOT.lobes.toFixed(1)} * t;
  float ring = ${KNOT.ringRadius} + ${KNOT.radialWave} * cos(lobe) + tube.x;
  vec2 xy = ring * vec2(cos(azimuth), sin(azimuth)) * vec2(${KNOT.width}, ${KNOT.height});
  return vec3(turn(${KNOT.tilt}) * xy, ${KNOT.depthWave} * sin(lobe) + tube.y);
}

void main() {
  vec3 p = mix(aFrom, aTo, uBlend);
  vInk = mix(aFromInk, aToInk, uBlend);
  vKnotBlend = 0.0;
  vKnotFlow = 0.0;
  vTrail = 0.0;
  vec3 tail = vec3(0.0);
  if (uKnotSide != 0) {
    vKnotBlend = uKnotSide == 1 ? 1.0 - uBlend : uBlend;
    if (vKnotBlend > 0.0) {
      vec2 tube = aKnotTube.xy;
      float phase = aKnotTube.z;
      vec3 rest = uKnotSide == 1 ? aFrom : aTo;
      float radius = length(tube);
      bool inCore = radius < ${KNOT.coreRadius};
      if (inCore) {
        // Advance through the closed loop at a fixed place in the cross-section.
        phase += uTime * mix(0.72, 0.40, radius / ${KNOT.coreRadius});
        vKnotFlow = vKnotBlend;
      } else {
        // Two counter-rotating groups wrap around the tube, with a small drift along it.
        float direction = (gl_InstanceID & 1) == 0 ? -1.0 : 1.0;
        tube = turn(direction * uTime * mix(0.19, 0.25, aQuality.w)) * tube;
        float driftPhase = aQuality.z;
        float driftSpeed = mix(0.18, 0.28, aQuality.x);
        phase += mix(0.014, 0.032, aQuality.w) * (sin(driftPhase + uTime * driftSpeed) - sin(driftPhase));
      }
      vec3 moving = knot(phase, tube);
      p += (moving - rest) * vKnotBlend;
      if (inCore && aQuality.w > 0.86) {
        float trailLength = mix(0.008, 0.023, smoothstep(0.86, 0.99, aQuality.w));
        tail = orient(knot(phase - trailLength, tube) - moving) * vKnotFlow;
      }
    }
  }
  vec3 trajectory = aTo;
  if (uCurvedBurst) {
    // Start horizontally, then lift into the particle's final height and depth.
    float delayedLift = mix(0.18, 0.54, aQuality.x);
    float lift = uBlend * uBlend * mix(1.0, uBlend, delayedLift);
    p.yz = aTo.yz * lift;
    trajectory.yz *= uBlend * mix(2.0, 3.0 * uBlend, delayedLift);
  }
  p = orient(p + aDisplacement * uField);
  float drift = uMotion * (0.02 + aQuality.w * 0.038) * (1.0 - vKnotBlend + 0.30 * vKnotFlow);
  p += vec3(sin(uTime * 0.52 + aQuality.z), cos(uTime * 0.38 + aQuality.z * 2.0), sin(uTime * 0.3 + aQuality.x * 15.0)) * drift;
  vLight = uLight - p;
  vView = viewFrom(p);
  vNear = length(vLight * vec3(1.0, 1.0, 0.6));
  vDepth = p.z;
  vSeed = aQuality.w;
  float side = step(3.14159, aQuality.z);
  float jet = fract(aQuality.z / 3.14159);
  float burstHue = mix(mix(0.33, 1.07, jet), mix(0.29, 0.03, jet), side);
  burstHue += (aQuality.w - 0.5) * 0.20;
  vHue = mix(uPalette + aQuality.x * 0.33 - 0.165 + p.y * 0.12, burstHue, uBloom);
  vec3 vertex = aVertex;
  vNormal = aNormal;
  mat2 spinFacet = turn(aQuality.z + sin(uTime * 0.35 + aQuality.x) * 0.63 * uMotion);
  vertex.xy = spinFacet * vertex.xy;
  vNormal.xy = spinFacet * vNormal.xy;
  mat2 tiltFacet = turn(aQuality.x * 8.0 + sin(uTime * 0.14) * 0.39 * uMotion);
  vertex.xz = tiltFacet * vertex.xz;
  vNormal.xz = tiltFacet * vNormal.xz;
  float foregroundFacet = pow(aQuality.w, 8.0) * smoothstep(0.0, 1.3, p.z);
  float size = aQuality.y * mix(0.88, 0.84, uColor) * (1.0 + uMagnet * 0.25);
  size *= 1.0 + foregroundFacet * 0.48 * (1.0 - uColor);
  float sheathSize = mix(0.0058, 0.014, pow(aQuality.w, 2.6)) * mix(1.0, uDensityScale, 0.40);
  float coreSize = mix(0.006, 0.020, pow(aQuality.w, 3.0)) * uDensityScale;
  size = mix(size, vKnotFlow > 0.0 ? coreSize : sheathSize, vKnotBlend);
  size = mix(size, uDensityScale * mix(0.0085, 0.018, pow(aQuality.w, 2.2)), vInk.a);
  if (uCurvedBurst) size *= mix(0.45, 1.0, smoothstep(0.0, 1.0, uBlend));
  if (uStreak > 0.0) {
    vec3 ray = trajectory / max(0.001, length(trajectory));
    float streak = uStreak * smoothstep(0.68, 2.9, length(aTo)) * smoothstep(0.42, 0.9, aQuality.w);
    vertex += ray * dot(vertex, ray) * streak;
    vNormal -= ray * dot(vNormal, ray) * (streak / (1.0 + streak));
  }
  float tailReach = max(dot(vertex, tail / max(length(tail), 0.0001)), 0.0);
  vTrail = tailReach * vKnotFlow;
  gl_Position = project(p, vertex * size + tail * tailReach * tailReach);
}`;

const fragmentSource = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vLight;
in vec3 vView;
in vec4 vInk;
in float vNear, vSeed, vHue, vDepth, vKnotBlend, vKnotFlow, vTrail;
uniform float uColor, uMagnet, uOpacity, uBloom;
out vec4 color;

vec3 hue(float t) {
  vec3 amber = vec3(1.0, 0.51, 0.21);
  vec3 rose = vec3(0.94, 0.22, 0.38);
  vec3 violet = vec3(0.51, 0.26, 0.83);
  vec3 blue = vec3(0.10, 0.48, 0.91);
  vec3 cyan = vec3(0.12, 0.72, 0.81);
  vec3 pigment = mix(amber, rose, smoothstep(0.04, 0.35, t));
  pigment = mix(pigment, violet, smoothstep(0.32, 0.62, t));
  pigment = mix(pigment, blue, smoothstep(0.59, 0.84, t));
  return mix(pigment, cyan, smoothstep(0.82, 1.0, t));
}

// Evaluate a rectangular light in reflection space. Roughness softens its edges.
float reflectedPanel(vec3 ray, vec3 axis, vec2 size, float roughness) {
  vec3 direction = normalize(axis);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), direction));
  vec3 up = cross(direction, right);
  float facing = dot(ray, direction);
  vec2 uv = abs(vec2(dot(ray, right), dot(ray, up))) / max(0.25, facing);
  vec2 edge = 1.0 - smoothstep(size - roughness, size + roughness, uv);
  return edge.x * edge.y * smoothstep(0.25, 0.65, facing);
}

vec3 studioReflection(vec3 ray, float roughness) {
  vec3 room = mix(vec3(0.044, 0.049, 0.061), vec3(0.18, 0.19, 0.21), smoothstep(-0.35, 0.95, ray.y));
  float key = reflectedPanel(ray, vec3(-0.54, 0.48, 0.72), vec2(0.55, 0.36), roughness);
  float cool = reflectedPanel(ray, vec3(0.92, 0.17, 0.47), vec2(0.13, 0.54), roughness);
  float warm = reflectedPanel(ray, vec3(-0.52, -0.59, 0.58), vec2(0.28, 0.15), roughness);
  return room + key * vec3(0.93, 0.91, 0.86)
    + cool * vec3(0.31, 0.57, 0.66) + warm * vec3(0.52, 0.31, 0.34);
}

void main() {
  vec3 normal = normalize(vNormal);
  vec3 light = vLight / max(length(vLight), 0.001);
  vec3 view = normalize(vView);
  float diffuse = max(dot(normal, light), 0.0);
  float softbox = max(dot(normal, normalize(vec3(-0.8, 0.6, 0.7))), 0.0);
  float nearGlow = (1.0 - uColor) * (1.0 - smoothstep(0.18, 1.55, vNear));
  float intensity = (1.0 + nearGlow * 0.68) / (0.65 + vNear * vNear);
  float rim = pow(1.0 - max(normal.z, 0.0), 2.0);

  float metalness = smoothstep(0.12, 0.30, vSeed);
  float gloss = fract(vSeed * 19.39);
  float roughness = mix(0.10, 0.028, gloss);
  float halfAngle = max(dot(normal, normalize(light + view)), 0.0);
  float glint = pow(halfAngle, mix(27.0, 170.0, gloss)) * intensity;
  float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 5.0);
  vec3 reflection = studioReflection(reflect(-view, normal), roughness);
  vec3 chrome = reflection * mix(0.90, 1.12, fresnel);
  chrome += vec3(0.31, 0.28, 0.24) * diffuse * intensity;
  chrome += vec3(2.20, 1.92, 1.57) * glint * mix(0.75, 1.25, gloss);
  vec3 graphite = vec3(0.095, 0.105, 0.12) + softbox * vec3(0.25, 0.26, 0.29);
  graphite += vec3(0.38, 0.35, 0.31) * diffuse * intensity;
  vec3 silver = mix(graphite, chrome, metalness);
  silver = min(vec3(1.0), silver / (0.68 + silver * 0.33));

  float specular = pow(halfAngle, 14.0);
  vec3 sheathPigment = mix(vec3(1.0, 0.18, 0.32), vec3(1.0, 0.56, 0.09), smoothstep(0.07, 0.42, vHue));
  vec3 corePigment = mix(vec3(0.42, 0.12, 0.97), vec3(0.13, 0.39, 1.0), vSeed);
  vec3 pigment = mix(hue(vHue), vKnotFlow > 0.0 ? corePigment : sheathPigment, vKnotBlend);
  vec3 jewel = mix(pigment * 0.52, pigment, diffuse * 0.45 + softbox * 0.31);
  jewel += specular * 0.54 + rim * 0.14;
  jewel += pigment * (0.12 * vKnotBlend + 0.10 * smoothstep(0.66, 0.98, vSeed) * vKnotFlow);
  vec3 plume = pigment * (0.68 + diffuse * 0.19 + softbox * 0.16 + specular * 0.15);
  jewel = mix(jewel, plume, uBloom);
  vec3 shaded = mix(silver, jewel, uColor);
  float alpha = uOpacity * clamp(0.64 + vDepth * 0.10 + vSeed * 0.19 + uColor * 0.08 + uMagnet * 0.15 + uBloom * 0.16, 0.37, 1.0);
  alpha *= mix(1.0, 0.76, vKnotBlend - vKnotFlow) * (1.0 - 0.67 * vTrail);
  vec3 ink = vInk.rgb / max(vInk.a, 0.001);
  ink = ink * (0.96 + 0.04 * softbox) + 0.025 * softbox;
  alpha = mix(alpha, uOpacity, vInk.a);
  color = vec4(clamp(mix(shaded, ink, vInk.a), 0.0, 1.0) * alpha, alpha);
}`;

const surfaceVertexSource = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
out vec3 vNormal, vView;
${sceneTransform}

void main() {
  vec3 p = orient(aPosition);
  vNormal = orient(aNormal);
  vView = viewFrom(p);
  gl_Position = project(p, vec3(0.0));
}`;

const surfaceFragmentSource = `#version 300 es
precision highp float;
in vec3 vNormal, vView;
uniform float uOpacity;
out vec4 color;

void main() {
  vec3 normal = normalize(vNormal);
  float facing = clamp(dot(normal, normalize(vView)), 0.0, 1.0);
  float rim = pow(1.0 - facing, 2.4);
  float light = max(0.0, dot(normal, normalize(vec3(-0.7, 0.8, 0.9))));
  float gloss = pow(light, 15.0);
  vec3 tint = mix(vec3(0.96, 0.40, 0.39), vec3(1.0, 0.89, 0.76), gloss * 0.85);
  float alpha = (0.052 + 0.046 * (1.0 - light) + 0.25 * rim + 0.12 * gloss) * uOpacity;
  color = vec4(tint * alpha, alpha);
}`;

function compileProgram(gl, vertex, fragment) {
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  return program;
}

function uniformLocations(gl, program, names) {
  return Object.fromEntries(names.map((name) => [name, gl.getUniformLocation(program, "u" + name)]));
}

function setTransform(gl, locations, frame, aspect, roll) {
  gl.uniform2f(locations.Center, frame.x, frame.y);
  gl.uniform1f(locations.Aspect, aspect);
  gl.uniform1f(locations.Scale, frame.scale);
  gl.uniform1f(locations.Orbit, frame.orbit);
  gl.uniform1f(locations.Roll, roll);
}

function makeKnotSurface(gl) {
  const segments = 144;
  const sides = 24;
  const sample = (t, band) => knot(t, KNOT.surfaceRadius * Math.cos(band), KNOT.surfaceRadius * Math.sin(band));
  const points = Array.from({ length: segments * sides }, (_, index) =>
    sample(Math.floor(index / sides) / segments * TAU, index % sides / sides * TAU));
  const vertices = new Float32Array(points.length * 6);
  const indices = new Uint16Array(points.length * 6);
  const subtract = (a, b) => a.map((value, axis) => value - b[axis]);

  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    const previous = (i + segments - 1) % segments;
    for (let j = 0; j < sides; j++) {
      const index = i * sides + j;
      const nextSide = (j + 1) % sides;
      const previousSide = (j + sides - 1) % sides;
      const tangent = subtract(points[next * sides + j], points[previous * sides + j]);
      const across = subtract(points[i * sides + nextSide], points[i * sides + previousSide]);
      const normal = [
        tangent[1] * across[2] - tangent[2] * across[1],
        tangent[2] * across[0] - tangent[0] * across[2],
        tangent[0] * across[1] - tangent[1] * across[0],
      ];
      const length = Math.hypot(...normal);
      vertices.set([...points[index], ...normal.map((value) => value / length)], index * 6);
      const b = next * sides + j;
      const c = i * sides + nextSide;
      const d = next * sides + nextSide;
      indices.set([index, b, c, b, d, c], index * 6);
    }
  }

  const program = compileProgram(gl, surfaceVertexSource, surfaceFragmentSource);
  const locations = uniformLocations(gl, program, ["Center", "Aspect", "Scale", "Orbit", "Roll", "Opacity"]);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  for (const [location, offset] of [[0, 0], [1, 12]]) {
    gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 24, offset);
    gl.enableVertexAttribArray(location);
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  return (frame, aspect, roll, opacity) => {
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    setTransform(gl, locations, frame, aspect, roll);
    gl.uniform1f(locations.Opacity, opacity);
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  };
}

function makeRenderer(canvas, compact, queue) {
  const gl = canvas.getContext("webgl2", {
    alpha: true, premultipliedAlpha: true, antialias: !compact, powerPreference: "low-power",
  });
  if (!gl) return null;

  const program = compileProgram(gl, vertexSource, fragmentSource);
  const locations = uniformLocations(gl, program, [
    "Center", "Light", "CurvedBurst", "Time", "Aspect", "Scale", "Blend", "Color", "Magnet",
    "Opacity", "Palette", "Bloom", "Orbit", "Roll", "Field", "Motion", "Streak", "DensityScale", "KnotSide",
  ]);
  const drawKnotSurface = makeKnotSurface(gl);
  const mesh = facetedSphere();
  const desktopCount = 17600;
  const limit = compact ? 4600 : desktopCount;
  const coarse = compact ? 1200 : 4800;
  const { qualities, knotTube, shapes } = makeParticles(limit);
  const markColors = new Map();
  const clearInk = new Uint8Array(limit * 4);
  const offsets = new Float32Array(limit * 3);
  const velocities = new Float32Array(limit * 3);
  const fieldLight = new Float32Array(3);
  const fieldVelocity = new Float32Array(3);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const geometry = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, geometry);
  gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.STATIC_DRAW);
  for (const [i, offset] of [[0, 0], [1, 12]]) {
    gl.vertexAttribPointer(i, 3, gl.FLOAT, false, 24, offset);
    gl.enableVertexAttribArray(i);
  }
  const attributes = [
    [qualities, 4, gl.FLOAT],
    [shapes.cloud, 3, gl.FLOAT],
    [shapes.stream, 3, gl.FLOAT],
    [offsets, 3, gl.FLOAT],
    [clearInk, 4, gl.UNSIGNED_BYTE],
    [clearInk, 4, gl.UNSIGNED_BYTE],
    [knotTube, 3, gl.FLOAT],
  ].map(([array, size, type], index) => {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, array, index === 3 ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    const location = index + 2;
    gl.vertexAttribPointer(location, size, type, type === gl.UNSIGNED_BYTE, 0, 0);
    gl.vertexAttribDivisor(location, 1);
    gl.enableVertexAttribArray(location);
    return buffer;
  });

  gl.useProgram(program);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);
  let from = "cloud";
  let to = "stream";
  let count = limit;
  let ratio = Math.min(window.devicePixelRatio, compact ? 1.45 : 1.75);
  let width = 0;
  let height = 0;
  let slowFrames = 0;
  let fieldActive = false;
  let scatterActive = false;
  let scatterMoving = false;

  for (const name of WORK_MARKS) {
    loadWorkMark(name, limit).then(({ positions, colors }) => {
      shapes[name] = positions;
      markColors.set(name, colors);
      if (from === name) from = null;
      if (to === name) to = null;
      queue();
    }).catch((error) => console.warn(`Could not load Selected Work artwork for ${name}.`, error));
  }

  function resize(nextWidth, nextHeight) {
    width = nextWidth;
    height = nextHeight;
    const pixelWidth = Math.max(1, Math.round(width * ratio));
    const pixelHeight = Math.max(1, Math.round(height * ratio));
    if (canvas.width === pixelWidth && canvas.height === pixelHeight) return;
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function upload(slot, array, length = array.length) {
    gl.bindBuffer(gl.ARRAY_BUFFER, attributes[slot]);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, array, 0, length);
  }

  function updateField(frame, delta, lampX, lampY, aspect) {
    scatterMoving = false;
    if ((fieldActive && frame.field === 0) || (scatterActive && !frame.workMark)) {
      offsets.fill(0);
      velocities.fill(0);
      fieldActive = false;
      scatterActive = false;
    }
    if (frame.workMark && markColors.has(to)) {
      const pointerX = (frame.cursorX - frame.x) * aspect / frame.scale;
      const pointerY = (frame.cursorY - frame.y) / frame.scale;
      const inRange = Math.abs(pointerX) < MARK_WIDTH / 2 + SCATTER_RADIUS
        && Math.abs(pointerY) < MARK_HEIGHT / 2 + SCATTER_RADIUS;
      if (inRange || scatterActive) {
        scatterMoving = advanceScatter(offsets, velocities, shapes[to], qualities, pointerX, pointerY, count, delta);
        scatterActive = inRange || scatterMoving;
        upload(3, offsets, count * 3);
      }
      return Number(scatterActive);
    }
    if (frame.field > 0) {
      // Put the light in the same unrotated space as the resting positions.
      const cos = Math.cos(frame.orbit);
      const sin = Math.sin(frame.orbit);
      const x = cos * lampX + sin * frame.lightZ;
      const z = -sin * lampX + cos * frame.lightZ;
      const dx = x - fieldLight[0];
      const dy = lampY - fieldLight[1];
      const dz = z - fieldLight[2];
      const velocityScale = fieldActive ? Math.min(1000 / Math.max(delta, 1), 4.5 / Math.max(0.001, Math.hypot(dx, dy, dz))) : 0;
      fieldLight[0] = x;
      fieldLight[1] = lampY;
      fieldLight[2] = z;
      fieldVelocity[0] = dx * velocityScale;
      fieldVelocity[1] = dy * velocityScale;
      fieldVelocity[2] = dz * velocityScale;
      advanceDisplacements(offsets, velocities, shapes[from], shapes[to], frame.blend, fieldLight, fieldVelocity, count, delta);
      upload(3, offsets, count * 3);
      fieldActive = true;
    }
    return frame.field;
  }

  function render(frame, delta) {
    slowFrames = delta > 28 ? slowFrames + 1 : Math.max(0, slowFrames - 2);
    if (slowFrames > 34 && count > coarse) {
      count = Math.max(coarse, Math.round(count * 0.74));
      ratio = Math.max(1, ratio * 0.81);
      resize(width, height);
      slowFrames = 0;
    }

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const aspect = width / height;
    const lightDepth = 1 - frame.lightZ * PERSPECTIVE;
    const lampX = (frame.lightX - frame.x) * lightDepth * aspect / frame.scale;
    const lampY = (frame.lightY - frame.y) * lightDepth / frame.scale;
    if (frame.opacity < 0.01) return false;
    if (from !== frame.from) {
      from = frame.from;
      upload(1, shapes[from] ?? shapes.now);
      upload(4, markColors.get(from) ?? clearInk);
    }
    if (to !== frame.to) {
      to = frame.to;
      upload(2, shapes[to] ?? shapes.now);
      upload(5, markColors.get(to) ?? clearInk);
    }
    const field = updateField(frame, delta * frame.motionRate, lampX, lampY, aspect);
    const knotSide = from === "now" ? 1 : to === "now" ? 2 : 0;
    const roll = Math.sin(frame.time * 0.047) * 0.11 * frame.color * frame.motion;
    setTransform(gl, locations, frame, aspect, roll);
    gl.uniform3f(locations.Light, lampX, lampY, frame.lightZ);
    gl.uniform1i(locations.CurvedBurst, Number(frame.bursting));
    gl.uniform1i(locations.KnotSide, knotSide);
    gl.uniform1f(locations.Time, frame.time);
    gl.uniform1f(locations.Blend, frame.blend);
    gl.uniform1f(locations.Color, frame.color);
    gl.uniform1f(locations.Magnet, frame.magnet);
    gl.uniform1f(locations.Opacity, frame.opacity);
    gl.uniform1f(locations.Palette, frame.palette);
    gl.uniform1f(locations.Bloom, frame.bloom);
    gl.uniform1f(locations.Field, field);
    gl.uniform1f(locations.Motion, frame.motion);
    gl.uniform1f(locations.Streak, frame.streak);
    gl.uniform1f(locations.DensityScale, Math.min(1.85, Math.pow(desktopCount / count, 0.32)));
    gl.drawArraysInstanced(gl.TRIANGLES, 0, mesh.length / 6, count);
    const knotBlend = knotSide === 1 ? 1 - frame.blend : knotSide === 2 ? frame.blend : 0;
    const surfaceOpacity = frame.opacity * smooth(0.62, 1, knotBlend);
    if (surfaceOpacity > 0.001) {
      drawKnotSurface(frame, aspect, roll, surfaceOpacity);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
    }
    return scatterMoving;
  }

  return { resize, render };
}

export function startScene() {
  const root = document.documentElement;
  const canvas = document.querySelector("#particles");
  const header = document.querySelector(".site-header");
  const about = document.querySelector("#about");
  const aboutCopy = about.querySelector(".section-copy");
  const now = document.querySelector("#now");
  const work = document.querySelector("#work");
  const workInner = work.querySelector(".work-inner");
  const workHeading = work.querySelector(".work-heading");
  const workList = work.querySelector(".work-list");
  const contact = document.querySelector("#contact");
  const footer = contact.querySelector(".site-footer");
  const nav = [...document.querySelectorAll(".site-nav a")];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const narrow = matchMedia("(max-width: 640px)");
  const touch = matchMedia("(pointer: coarse)");
  const css = new Map();
  let renderer;
  let webgl = false;
  let raf = 0;
  let needsMeasurement = true;
  let landmarks;
  let width = 1;
  let height = 1;
  let time = 0;
  let lastFrame = 0;
  let activeSection;
  let detailOpen = false;
  let zoom = 0;
  let form = WORK_MARKS[0];
  let previousForm = form;
  let morph = 1;
  const pointer = { x: 0, y: 0, present: false };
  const light = { x: 0.46, y: 0.04, z: 0.35 };

  function cssValue(prop, value) {
    if (css.get(prop) === value) return;
    css.set(prop, value);
    root.style.setProperty(prop, value);
  }

  function measure() {
    width = document.documentElement.clientWidth;
    height = window.innerHeight;
    const scroll = window.scrollY;
    const top = (element) => element.getBoundingClientRect().top + scroll;
    const aboutBounds = aboutCopy.getBoundingClientRect();
    const workBounds = workHeading.getBoundingClientRect();
    const workMargin = parseFloat(getComputedStyle(work).scrollMarginTop);
    const headingBottom = workMargin + parseFloat(getComputedStyle(workInner).paddingBlockStart) + workBounds.height;
    landmarks = {
      about: top(about),
      gatheringStart: Math.max(height * 0.1, aboutBounds.top + scroll - height * 0.75),
      aboutExit: aboutBounds.bottom + scroll - header.getBoundingClientRect().bottom,
      now: top(now),
      work: top(work),
      workEnd: top(work) - workMargin - 2,
      workArt: top(workList) - 108,
      workCenterX: (workBounds.left + workBounds.width / 2) / width * 2 - 1,
      workSpaceTop: Math.min(headingBottom + 22, height * 0.80),
      workWidth: workBounds.width,
      contact: top(contact),
      contactArt: top(footer) - 146,
    };
    if (webgl) renderer.resize(width, height);
    needsMeasurement = false;
  }

  function setCurrentSection(scroll, day) {
    const tone = day >= 0.47 ? "light" : "dark";
    if (root.dataset.tone !== tone) root.dataset.tone = tone;
    const y = scroll + height * 0.36;
    const section = ["contact", "work", "now", "about"].find((name) => y >= landmarks[name]);
    if (section === activeSection) return;
    activeSection = section;
    for (const link of nav) {
      if (link.hash === "#" + section) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  }

  function selectForm(next) {
    if (!next || next === form) return;
    previousForm = morph < 0.5 ? previousForm : form;
    form = next;
    morph = 0;
    queue();
  }

  function renderFrame(stamp) {
    raf = 0;
    if (needsMeasurement) measure();
    const delta = lastFrame ? Math.min(50, stamp - lastFrame) : 16;
    const easing = 1 - Math.exp(-delta / 170);
    lastFrame = stamp;
    zoom = mix(zoom, Number(detailOpen), easing * 0.6);
    if (!detailOpen && zoom < 0.001) zoom = 0;
    morph = Math.min(1, morph + delta / 570);
    const scroll = window.scrollY;
    const mobile = narrow.matches;
    const portrait = width / height < 0.82;
    const gatheringStart = landmarks.gatheringStart;
    const ignitionScroll = Math.max(gatheringStart + 1, landmarks.aboutExit);
    const settlingEnd = landmarks.now - height * 0.20;
    const gathering = clamp((scroll - gatheringStart) / (ignitionScroll - gatheringStart));
    const settling = clamp((scroll - ignitionScroll) / Math.max(1, settlingEnd - ignitionScroll));
    const progress = webgl
      ? IGNITION * gathering + (1 - IGNITION) * settling
      : smooth(landmarks.now - height * 0.7, landmarks.now - height * 0.23, scroll);
    const day = webgl ? smooth(IGNITION + 0.004, 0.53, progress) : progress;
    const blackout = webgl ? smooth(0.426, 0.442, progress) * (1 - smooth(0.444, IGNITION, progress)) : 0;
    const bursting = progress >= IGNITION && progress < EXPANSION_END;
    const blast = clamp((progress - IGNITION) / (EXPANSION_END - IGNITION));
    const travel = 1 - Math.pow(1 - blast, 2.45);
    const burstGlow = webgl && progress >= IGNITION
      ? mix(0.68, 1, smooth(IGNITION, 0.48, progress)) * (1 - smooth(0.54, 0.75, progress))
      : 0;
    const converge = 0.68 * clamp(progress / 0.32) + 0.32 * smooth(0.22, 0.426, progress);
    const aboutBlend = smooth(0.08 * height, gatheringStart, scroll);
    const workBlend = smooth(landmarks.work - height * 0.54, landmarks.workEnd, scroll);
    const contactBlend = mobile
      ? smooth(landmarks.contact - height * 0.55, landmarks.contact + height * 0.10, scroll)
      : smooth(landmarks.contact - height * 0.77, landmarks.contact - height * 0.31, scroll);
    const workToContact = mix(workBlend, 0, contactBlend);
    const workMark = progress === 1 && workBlend === 1 && contactBlend === 0;
    const focus = smooth(EXPANSION_END, 1, progress);
    const introRate = mix(0.82, 0.16, clamp(scroll / gatheringStart));
    const motionRate = mix(introRate, 1, focus) * (detailOpen ? 0.25 : 1);
    time += delta * motionRate * 0.001;
    const anchorY = (pageY) => clamp(1 - (pageY - scroll) / height * 2, -1.45, 1.45);

    const darkX = mobile ? 0.14 : 0.48;
    const darkY = mobile ? -0.42 : -0.03;
    const headingTravel = !mobile && workToContact > 0
      ? Math.max(0, landmarks.workSpaceTop - workHeading.getBoundingClientRect().bottom - 22)
      : 0;
    const workCenterY = Math.max(height * 0.69, (landmarks.workSpaceTop + height - 24) / 2 - headingTravel);
    const brightX = mobile ? 0.05 : mix(mix(-0.47, landmarks.workCenterX, workToContact), 0.49, contactBlend);
    const brightY = mobile
      ? mix(mix(anchorY(landmarks.now + 170), anchorY(landmarks.workArt), workBlend), anchorY(landmarks.contactArt), contactBlend)
      : mix(mix(-0.01, 1 - workCenterY / height * 2, workToContact), -0.02, contactBlend);
    const x = mix(darkX * (1 - converge), brightX, focus);
    const y = mix(darkY * (1 - converge), brightY, focus);
    const centerScale = portrait ? Math.min(0.245, width / height * 0.40) : 0.356;
    const artHeight = mobile ? 171 : height - 24 - landmarks.workSpaceTop;
    const markScale = Math.min(centerScale * 0.74, (landmarks.workWidth - 16) * 2 / (height * MARK_WIDTH),
      artHeight * 2 / (height * MARK_HEIGHT));
    const dayScale = mix(0.91, markScale / centerScale, workToContact);
    const fitBurst = portrait ? mix(1, 0.79, smooth(IGNITION, 0.51, progress) * (1 - focus)) : 1;
    const scale = centerScale * mix(1, dayScale, focus) * fitBurst * (1 + zoom * 0.17);
    const cursorX = pointer.x / width * 2 - 1;
    const cursorY = 1 - pointer.y / height * 2;
    const pointerX = (cursorX - darkX) * width / height / centerScale;
    const pointerY = (cursorY - darkY) / centerScale;
    // Match the tilted footprint of the particle cloud.
    const alongCloud = 0.878 * pointerX + 0.479 * pointerY;
    const acrossCloud = -0.479 * pointerX + 0.878 * pointerY;
    const pointerDistance = Math.hypot(alongCloud / 2.60, acrossCloud / 1.80);
    const cursorInViewport = Math.abs(cursorX) <= 1 && Math.abs(cursorY) <= 1;
    const steering = webgl && scroll <= 0 && pointer.present && cursorInViewport && pointerDistance <= 1.02;
    const idleX = darkX + Math.sin(time * 0.43) * 0.15;
    const idleY = darkY + Math.cos(time * 0.52) * 0.10;
    const idleZ = 0.35 + Math.sin(time * 0.49) * 0.62;
    light.x = mix(light.x, steering ? cursorX : idleX, easing);
    light.y = mix(light.y, steering ? cursorY : idleY, easing);
    light.z = mix(light.z, steering ? 0.35 : idleZ, easing);
    const beaconX = light.x * (1 - converge);
    const beaconY = light.y * (1 - converge);

    let from = "cloud";
    let to = "stream";
    let blend = aboutBlend;
    let palette = 0.24;
    if (progress > 0 && progress < IGNITION) {
      from = "stream";
      to = "center";
      blend = smooth(0, 0.426, progress);
    } else if (bursting) {
      from = "center";
      to = "bloom";
      blend = travel;
    } else if (progress >= EXPANSION_END && progress < 1) {
      from = "bloom";
      to = "now";
      blend = smooth(EXPANSION_END, 1, progress);
    } else if (progress === 1) {
      from = "now";
      to = form;
      blend = workBlend;
      if (workMark) {
        from = previousForm;
        blend = smooth(0, 1, morph);
      }
      if (contactBlend > 0) {
        from = form;
        to = "contact";
        blend = contactBlend;
        palette = mix(0.24, 0.18, contactBlend);
      }
    }

    const collapse = progress < IGNITION ? smooth(0.02, 0.42, progress) : 0;
    const color = Number(progress >= IGNITION);
    const field = 1 - smooth(0.02, 0.25, progress);
    const motion = (1 - workToContact) * (1 - smooth(0.27, 0.41, progress) * (1 - smooth(0.70, 0.96, progress)));
    const orbit = Math.sin(time * 0.075) * (0.16 + color * 0.28) * motion;
    const bloom = color * (1 - smooth(EXPANSION_END, 0.96, progress));
    const streak = 2.5 * smooth(IGNITION, 0.473, progress) * (1 - smooth(0.51, EXPANSION_END, progress));
    const mobileFade = mobile ? smooth(0.87, 1.30, Math.abs(y)) : 0;
    const collapseFade = progress < IGNITION ? smooth(0.422, 0.442, progress) : 0;
    const scatter = workMark && morph === 1 && !detailOpen && pointer.present && cursorInViewport;
    const scatterMoving = webgl && renderer.render({
      x, y, scale, from, to, blend, palette, bloom, time, motionRate, orbit, field, motion, streak, color, bursting, workMark,
      cursorX: scatter ? cursorX : Infinity,
      cursorY: scatter ? cursorY : Infinity,
      lightX: mix(beaconX, x, focus), lightY: mix(beaconY, y + 0.35, focus),
      lightZ: mix(light.z * (1 - converge), 1.8, day),
      magnet: collapse,
      opacity: (1 - mobileFade) * (1 - collapseFade),
    }, delta);

    cssValue("--day", day.toFixed(3));
    cssValue("--blackout", blackout.toFixed(3));
    cssValue("--burst-glow", burstGlow.toFixed(3));
    cssValue("--burst-spread", mix(0.36, 1, travel).toFixed(3));
    cssValue("--art-x", ((x + 1) * 50).toFixed(2) + "%");
    cssValue("--art-y", ((1 - y) * 50).toFixed(2) + "%");
    cssValue("--glow-x", ((beaconX + 1) * 50).toFixed(2) + "%");
    cssValue("--glow-y", ((1 - beaconY) * 50).toFixed(2) + "%");
    cssValue("--orbit-opacity", ((1 - converge) * (1 - day) * 0.72).toFixed(3));
    cssValue("--beacon", ((1 - smooth(0.40, 0.442, progress)) * (1 - day)).toFixed(3));
    cssValue("--beacon-size", (1 + collapse * 0.78).toFixed(3));
    setCurrentSection(scroll, day);
    if (webgl && (!workMark || morph < 1 || detailOpen || zoom > 0 || scatterMoving)) queue();
    else lastFrame = 0;
  }

  function queue() {
    if (!raf) raf = requestAnimationFrame(renderFrame);
  }

  function setMotion() {
    const animate = !reducedMotion.matches;
    if (animate && !renderer) {
      try {
        renderer = makeRenderer(canvas, narrow.matches || touch.matches, queue);
      } catch (error) {
        console.warn("Particle rendering is unavailable.", error);
      }
    }
    webgl = Boolean(renderer && animate);
    root.classList.toggle("has-webgl", webgl);
    canvas.hidden = !webgl;
    needsMeasurement = true;
    queue();
  }

  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", () => {
    needsMeasurement = true;
    queue();
  }, { passive: true });
  new ResizeObserver(() => {
    needsMeasurement = true;
    queue();
  }).observe(document.querySelector("main"));
  window.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.present = true;
    if (webgl) queue();
  }, { passive: true });
  function releasePointer() {
    pointer.present = false;
    if (webgl) queue();
  }
  root.addEventListener("pointerleave", releasePointer);
  window.addEventListener("blur", releasePointer);
  reducedMotion.addEventListener("change", setMotion);
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    renderer = null;
    webgl = false;
    canvas.hidden = true;
    root.classList.remove("has-webgl");
    needsMeasurement = true;
    queue();
  });
  canvas.addEventListener("webglcontextrestored", setMotion);

  root.classList.add("has-timeline");
  setMotion();
  return { selectForm, setDetail: (open) => { detailOpen = open; queue(); } };
}

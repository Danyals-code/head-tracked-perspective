import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { createTracker, IRIS_A, IRIS_B } from "./tracker.js";

// ---------- DOM ----------
const canvas         = document.getElementById("scene");
const video          = document.getElementById("cam");
const startOverlay   = document.getElementById("startOverlay");
const startBtn       = document.getElementById("startBtn");
const loaderText     = document.getElementById("loaderText");
const errorOverlay   = document.getElementById("errorOverlay");
const errMessage     = document.getElementById("errMessage");
const errRetryBtn    = document.getElementById("errRetryBtn");
const hud            = document.getElementById("hud");
const uiToggle       = document.getElementById("uiToggle");
const fsBtn          = document.getElementById("fsBtn");
const recenterBtnHud = document.getElementById("recenterBtnHud");
const recenterBtn    = document.getElementById("recenterBtn");
const panel          = document.getElementById("panel");
const closePanel     = document.getElementById("closePanel");
const resetBtn       = document.getElementById("resetBtn");
const macModelSel    = document.getElementById("macModel");
const trackDot       = document.getElementById("trackDot");
const trackLabel     = trackDot.querySelector(".label");
const statState      = document.getElementById("statState");
const statEye        = document.getElementById("statEye");
const statFps        = document.getElementById("statFps");

// ---------- MacBook presets (physical display glass, in mm, and typical FOV) ----------
const MAC_PRESETS = {
  air13: { w: 290, h: 188, fov: 62 },
  air15: { w: 326, h: 211, fov: 68 },
  pro14: { w: 302, h: 196, fov: 68 },
  pro16: { w: 346, h: 223, fov: 68 },
};

// ---------- Params (mm unless noted) ----------
const DEFAULTS = {
  model: "pro14",
  monW: MAC_PRESETS.pro14.w,
  monH: MAC_PRESETS.pro14.h,
  depth: 400,
  fov: MAC_PRESETS.pro14.fov,
  ipd: 63,
  smooth: 0.80,
  sensitivity: 0.55,
  viewY: 0.00,     // eye vertical bias as fraction of monH; 0 = symmetric view (face-centered = scene-centered)
  showCam: true, flipX: true,
};
const p = { ...DEFAULTS };

const sliderIds = ["depth", "fov", "ipd", "smooth", "sensitivity", "viewY"];
const roomKeys  = new Set(["depth"]);
const scaleKeys = new Set(["fov", "ipd"]);

function bindSliders() {
  sliderIds.forEach((id) => {
    const el = document.getElementById(id);
    const label = document.getElementById(id + "v");
    el.value = p[id];
    label.textContent = formatValue(id, p[id]);
    el.addEventListener("input", () => {
      p[id] = parseFloat(el.value);
      label.textContent = formatValue(id, p[id]);
      if (roomKeys.has(id)) rebuildRoom();
      if (scaleKeys.has(id)) scaleRefreshRequested = true;
    });
  });
}
function formatValue(id, v) {
  if (id === "smooth" || id === "sensitivity" || id === "viewY") return v.toFixed(2);
  return String(v);
}

function bindSwitches() {
  const showCam = document.getElementById("showCam");
  const flipX   = document.getElementById("flipX");
  showCam.checked = p.showCam;
  flipX.checked   = p.flipX;
  showCam.addEventListener("change", (e) => {
    p.showCam = e.target.checked;
    video.classList.toggle("hidden-preview", !p.showCam);
  });
  flipX.addEventListener("change", (e) => { p.flipX = e.target.checked; });
}

function applyMacPreset(key) {
  const preset = MAC_PRESETS[key];
  if (!preset) return;
  p.model = key;
  p.monW = preset.w;
  p.monH = preset.h;
  p.fov  = preset.fov;
  // Reflect new FOV in the slider
  const fovEl = document.getElementById("fov");
  const fovLabel = document.getElementById("fovv");
  if (fovEl) fovEl.value = p.fov;
  if (fovLabel) fovLabel.textContent = formatValue("fov", p.fov);
  rebuildRoom();
  scaleRefreshRequested = true;
}
macModelSel.addEventListener("change", (e) => applyMacPreset(e.target.value));

function resetToDefaults() {
  Object.assign(p, DEFAULTS);
  sliderIds.forEach((id) => {
    const el = document.getElementById(id);
    const label = document.getElementById(id + "v");
    el.value = p[id];
    label.textContent = formatValue(id, p[id]);
  });
  document.getElementById("showCam").checked = p.showCam;
  document.getElementById("flipX").checked   = p.flipX;
  macModelSel.value = p.model;
  video.classList.toggle("hidden-preview", !p.showCam);
  rebuildRoom();
  recenterRequested = true;
}

bindSliders();
bindSwitches();
macModelSel.value = p.model;
resetBtn.addEventListener("click", resetToDefaults);

// ---------- UI panel ----------
function openPanel()    { panel.classList.remove("hidden"); uiToggle.setAttribute("aria-expanded", "true"); }
function closePanelFn() { panel.classList.add("hidden");    uiToggle.setAttribute("aria-expanded", "false"); }
uiToggle.addEventListener("click", () => panel.classList.contains("hidden") ? openPanel() : closePanelFn());
closePanel.addEventListener("click", closePanelFn);

fsBtn.addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
});

function requestRecenter() {
  recenterRequested = true;
  flashRecenter();
}
recenterBtn.addEventListener("click", requestRecenter);
recenterBtnHud.addEventListener("click", requestRecenter);

function flashRecenter() {
  [recenterBtn, recenterBtnHud].forEach((b) => {
    if (!b) return;
    b.classList.add("flash");
    setTimeout(() => b.classList.remove("flash"), 320);
  });
}

window.addEventListener("keydown", (e) => {
  if (e.target && e.target.tagName === "INPUT") return;
  if (e.key === "f" || e.key === "F") fsBtn.click();
  else if (e.key === "s" || e.key === "S") uiToggle.click();
  else if (e.key === "r" || e.key === "R") requestRecenter();
  else if (e.key === "Escape" && !panel.classList.contains("hidden")) closePanelFn();
});

// ---------- Three.js scene ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setClearColor(0x03050a);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 10, 6000);

// Image-based lighting for subtle reflections and indirect
const pmremGen = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGen.fromScene(new RoomEnvironment(), 0.04).texture;
pmremGen.dispose();

const roomGroup = new THREE.Group();
scene.add(roomGroup);

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.30));

const keyLight = new THREE.DirectionalLight(0xfff0d4, 1.35);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 10;
keyLight.shadow.camera.far  = 3000;
keyLight.shadow.bias        = -0.00025;
keyLight.shadow.normalBias  = 1.0;
scene.add(keyLight);
scene.add(keyLight.target);

const fillLight = new THREE.DirectionalLight(0xa8c4ff, 0.45);
scene.add(fillLight);
scene.add(fillLight.target);

const interiorLight = new THREE.PointLight(0xffddaa, 0.55, 2000, 1.5);
scene.add(interiorLight);

function disposeGroup(group) {
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    }
  });
  group.clear();
}

function rebuildRoom() {
  disposeGroup(roomGroup);
  const w = p.monW, h = p.monH, d = p.depth;

  // Palette — muted interior against warm floor. Metallic objects will pick up the env map.
  const wallMat  = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.92, metalness: 0.0 });
  const backMat  = new THREE.MeshStandardMaterial({ color: 0x1f2532, roughness: 0.95, metalness: 0.0 });
  const ceilMat  = new THREE.MeshStandardMaterial({ color: 0x30343f, roughness: 0.94, metalness: 0.0 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x4b3822, roughness: 0.75, metalness: 0.0 });

  // Back
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), backMat);
  back.position.set(0, 0, -d);
  back.receiveShadow = true;
  roomGroup.add(back);

  // Left
  const left = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wallMat);
  left.position.set(-w / 2, 0, -d / 2);
  left.rotation.y = Math.PI / 2;
  left.receiveShadow = true;
  roomGroup.add(left);

  // Right
  const right = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wallMat);
  right.position.set(w / 2, 0, -d / 2);
  right.rotation.y = -Math.PI / 2;
  right.receiveShadow = true;
  roomGroup.add(right);

  // Floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
  floor.position.set(0, -h / 2, -d / 2);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  roomGroup.add(floor);

  // Ceiling
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilMat);
  ceil.position.set(0, h / 2, -d / 2);
  ceil.rotation.x = Math.PI / 2;
  ceil.receiveShadow = true;
  roomGroup.add(ceil);

  placeObjects();

  // Position lights relative to the room so they scale with the box
  keyLight.position.set( w * 0.28, h * 0.55, -d * 0.05);
  keyLight.target.position.set(-w * 0.05, -h * 0.35, -d * 0.65);
  keyLight.target.updateMatrixWorld();

  const s = Math.max(w, h, d) * 1.4;
  keyLight.shadow.camera.left   = -s;
  keyLight.shadow.camera.right  =  s;
  keyLight.shadow.camera.top    =  s;
  keyLight.shadow.camera.bottom = -s;
  keyLight.shadow.camera.updateProjectionMatrix();

  fillLight.position.set(-w * 0.45, h * 0.2, -d * 0.05);
  fillLight.target.position.set(w * 0.1, -h * 0.2, -d * 0.7);
  fillLight.target.updateMatrixWorld();

  interiorLight.position.set(0, h * 0.35, -d * 0.35);
  interiorLight.distance = Math.max(w, h, d) * 3.5;
}

function placeObjects() {
  const w = p.monW, h = p.monH, d = p.depth;
  const floorY = -h / 2;
  const s = Math.min(w, h) * 0.14;    // base scale unit — bigger than before

  const items = [
    { kind: "sphere",   r: s * 1.35,                x: -w * 0.05, z: -d * 0.52,
      color: 0xd94a2a, roughness: 0.42, metalness: 0.10 },
    { kind: "cube",     side: s * 2.05,             x: -w * 0.26, z: -d * 0.72,
      color: 0xdde2eb, roughness: 0.18, metalness: 0.92 },
    { kind: "cylinder", r: s * 0.92, hh: s * 2.75,  x:  w * 0.12, z: -d * 0.78,
      color: 0xdba54a, roughness: 0.28, metalness: 0.85 },
    { kind: "torus",    R: s * 1.15, r: s * 0.34,   x:  w * 0.22, z: -d * 0.5,
      color: 0x2f9a8a, roughness: 0.40, metalness: 0.15 },
  ];

  items.forEach((it) => {
    let geom, restH, rotX = 0;
    if (it.kind === "sphere")        { geom = new THREE.SphereGeometry(it.r, 48, 32); restH = it.r; }
    else if (it.kind === "cube")     { geom = new THREE.BoxGeometry(it.side, it.side, it.side); restH = it.side / 2; }
    else if (it.kind === "cylinder") { geom = new THREE.CylinderGeometry(it.r, it.r, it.hh, 48); restH = it.hh / 2; }
    else /* torus */                 { geom = new THREE.TorusGeometry(it.R, it.r, 24, 56); restH = it.r; rotX = Math.PI / 2; }
    const mat = new THREE.MeshStandardMaterial({
      color: it.color,
      roughness: it.roughness,
      metalness: it.metalness,
      envMapIntensity: 1.0,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = rotX;
    mesh.position.set(it.x, floorY + restH, it.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    roomGroup.add(mesh);
  });
}

rebuildRoom();

// ---------- Off-axis projection ----------
function setOffAxisProjection(cam, ex, ey, ez, screenW, screenH, near, far) {
  const z = Math.max(ez, 30);
  const l = (-screenW / 2 - ex) * near / z;
  const r = ( screenW / 2 - ex) * near / z;
  const b = (-screenH / 2 - ey) * near / z;
  const t = ( screenH / 2 - ey) * near / z;
  cam.projectionMatrix.makePerspective(l, r, t, b, near, far);
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  cam.position.set(ex, ey, z);
  cam.quaternion.identity();
  cam.updateMatrixWorld(true);
}

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
});

// ---------- Face tracking (matrix-based) ----------
let tracker = null;
let lastVideoTime = -1;

let scaleFactor = 1;
let scaleRefreshRequested = true;
let recenterRequested     = true;
let hasCalibrated         = false;

const offset = { x: 0, y: 0, z: 500 };   // Z is the reference distance at calibration
const raw    = { x: 0, y: 0, z: 500 };
const eye    = new THREE.Vector3(0, 0, 500);
const target = new THREE.Vector3(0, 0, 500);
let framesSinceDetection = 999;

function computeScale(matData, landmarks, vw, vh) {
  const A = landmarks[IRIS_A];
  const B = landmarks[IRIS_B];
  if (!A || !B) return null;
  const dx = (B.x - A.x) * vw;
  const dy = (B.y - A.y) * vh;
  const ipdPx = Math.hypot(dx, dy);
  if (ipdPx < 4) return null;

  const fovRad = p.fov * Math.PI / 180;
  const fPx = vw / (2 * Math.tan(fovRad / 2));
  const zMm = fPx * p.ipd / ipdPx;

  const rawZ = -matData[14];
  if (Math.abs(rawZ) < 0.05) return null;
  return zMm / rawZ;
}

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
}

function showError(message) {
  errMessage.textContent = message;
  startOverlay.classList.add("hidden");
  errorOverlay.classList.remove("hidden");
  startBtn.classList.remove("is-loading");
}
function humanizeError(e) {
  if (!e) return "Unknown error.";
  const name = e.name || "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Camera permission was denied. Grant access in the address bar, then retry.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "No webcam was found on this device.";
  if (name === "NotReadableError")
    return "Another app is using the camera. Close it and retry.";
  return e.message || String(e);
}

async function start() {
  startBtn.classList.add("is-loading");
  loaderText.textContent = "Requesting camera…";
  try {
    await startCamera();
    loaderText.textContent = "Loading face tracker…";
    tracker = await createTracker();
    loaderText.textContent = "Ready";
    await new Promise((r) => setTimeout(r, 200));
    startOverlay.classList.add("hidden");
    errorOverlay.classList.add("hidden");
    hud.classList.remove("hidden");
    startBtn.classList.remove("is-loading");
    if (!rafRunning) { rafRunning = true; requestAnimationFrame(loop); }
  } catch (e) {
    console.error(e);
    showError(humanizeError(e));
  }
}
startBtn.addEventListener("click", start);
errRetryBtn.addEventListener("click", () => {
  errorOverlay.classList.add("hidden");
  startOverlay.classList.remove("hidden");
});

// ---------- Track / render loop ----------
let rafRunning = false;
let fpsFrames = 0;
let fpsLast = performance.now();

function setTrackState(state, label) {
  trackDot.dataset.state = state;
  trackLabel.textContent = label;
  statState.textContent = label.toLowerCase();
}

function loop() {
  let detected = false;

  if (tracker && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = tracker.detectForVideo(video, performance.now());
    const matrices = result.facialTransformationMatrixes;
    const faces = result.faceLandmarks;

    if (matrices && matrices.length > 0 && faces && faces.length > 0) {
      const mat = matrices[0].data;
      const landmarks = faces[0];
      const vw = video.videoWidth, vh = video.videoHeight;

      if (scaleRefreshRequested || recenterRequested || !hasCalibrated) {
        const s = computeScale(mat, landmarks, vw, vh);
        if (s && s > 0 && isFinite(s)) {
          const ratio = s / scaleFactor;
          scaleFactor = s;
          if (hasCalibrated && !recenterRequested) {
            offset.x *= ratio;
            offset.y *= ratio;
            offset.z *= ratio;
          }
        }
        scaleRefreshRequested = false;
      }

      const rawX = (p.flipX ? -mat[12] : mat[12]) * scaleFactor;
      const rawY =  mat[13] * scaleFactor;
      const rawZ = -mat[14] * scaleFactor;
      raw.x = rawX; raw.y = rawY; raw.z = rawZ;

      if (recenterRequested) {
        offset.x = rawX;
        offset.y = rawY;
        offset.z = rawZ;
        recenterRequested = false;
        hasCalibrated = true;
        target.set(0, p.viewY * p.monH, offset.z);
        eye.copy(target);
      } else {
        // Apply sensitivity: 0 freezes at calibration pose, 1 = true window physics.
        // Vertical view bias renders the natural pose as "looking down into the box"
        // so the floor extends toward the viewer and lines up with the physical keyboard.
        const k = p.sensitivity;
        const yBias = p.viewY * p.monH;
        target.set(
          (rawX - offset.x) * k,
          (rawY - offset.y) * k + yBias,
           offset.z + (rawZ - offset.z) * k,
        );
        eye.lerp(target, 1 - p.smooth);
      }
      detected = true;
      framesSinceDetection = 0;
    }
  }
  if (!detected) framesSinceDetection++;

  setOffAxisProjection(camera, eye.x, eye.y, eye.z, p.monW, p.monH, 10, 6000);
  renderer.render(scene, camera);

  if (!hasCalibrated)                 setTrackState("waiting", "Waiting for face");
  else if (framesSinceDetection > 30) setTrackState("lost",    "Face lost");
  else                                setTrackState("tracking", "Tracking");

  fpsFrames++;
  const now = performance.now();
  if (now - fpsLast >= 500) {
    const fps = Math.round(fpsFrames * 1000 / (now - fpsLast));
    fpsFrames = 0;
    fpsLast = now;
    statFps.textContent = String(fps);
  }
  statEye.textContent = `${eye.x.toFixed(0)}, ${eye.y.toFixed(0)}, ${eye.z.toFixed(0)} mm`;

  requestAnimationFrame(loop);
}

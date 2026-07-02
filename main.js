import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { createTracker, IRIS_A, IRIS_B } from "./tracker.js";

// ---------- DOM ----------
const canvas       = document.getElementById("scene");
const video        = document.getElementById("cam");
const startOverlay = document.getElementById("startOverlay");
const startBtn     = document.getElementById("startBtn");
const loaderText   = document.getElementById("loaderText");
const errorOverlay = document.getElementById("errorOverlay");
const errMessage   = document.getElementById("errMessage");
const errRetryBtn  = document.getElementById("errRetryBtn");
const hud          = document.getElementById("hud");
const uiToggle     = document.getElementById("uiToggle");
const fsBtn        = document.getElementById("fsBtn");
const panel        = document.getElementById("panel");
const closePanel   = document.getElementById("closePanel");
const resetBtn     = document.getElementById("resetBtn");
const trackDot     = document.getElementById("trackDot");
const trackLabel   = trackDot.querySelector(".label");
const statState    = document.getElementById("statState");
const statEye      = document.getElementById("statEye");
const statFps      = document.getElementById("statFps");

// ---------- Params (all mm unless noted) ----------
const DEFAULTS = {
  monW: 500, monH: 300, depth: 450,
  fov: 60, ipd: 63, smooth: 0.75,
  camY: 15,
  showCam: true, flipX: true,
};
const p = { ...DEFAULTS };

const sliderIds = ["monW", "monH", "depth", "fov", "ipd", "smooth", "camY"];
const roomKeys  = new Set(["monW", "monH", "depth"]);

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
    });
  });
}
function formatValue(id, v) {
  if (id === "smooth") return v.toFixed(2);
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
  video.classList.toggle("hidden-preview", !p.showCam);
  rebuildRoom();
}

bindSliders();
bindSwitches();
resetBtn.addEventListener("click", resetToDefaults);

// ---------- UI panel ----------
function openPanel() {
  panel.classList.remove("hidden");
  uiToggle.setAttribute("aria-expanded", "true");
}
function closePanelFn() {
  panel.classList.add("hidden");
  uiToggle.setAttribute("aria-expanded", "false");
}
uiToggle.addEventListener("click", () => {
  panel.classList.contains("hidden") ? openPanel() : closePanelFn();
});
closePanel.addEventListener("click", closePanelFn);

fsBtn.addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
});
window.addEventListener("keydown", (e) => {
  if (e.target && (e.target.tagName === "INPUT")) return;
  if (e.key === "f" || e.key === "F") fsBtn.click();
  else if (e.key === "s" || e.key === "S") uiToggle.click();
  else if (e.key === "Escape" && !panel.classList.contains("hidden")) closePanelFn();
});

// ---------- Three.js scene ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setClearColor(0x05070b);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 10, 6000);

const roomGroup = new THREE.Group();
scene.add(roomGroup);

// Lights (module scope so they persist across room rebuilds)
scene.add(new THREE.AmbientLight(0xffffff, 0.32));
const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
keyLight.position.set(220, 420, 550);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x8ab4ff, 0.38);
fillLight.position.set(-320, 120, 320);
scene.add(fillLight);
const interiorLight = new THREE.PointLight(0xffd9a8, 0.6, 2000, 2);
scene.add(interiorLight);

function disposeGroup(group) {
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => m.dispose());
    }
  });
  group.clear();
}

function rebuildRoom() {
  disposeGroup(roomGroup);
  const w = p.monW, h = p.monH, d = p.depth;

  const wallMat  = new THREE.MeshStandardMaterial({ color: 0x2a303c, roughness: 0.92 });
  const backMat  = new THREE.MeshStandardMaterial({ color: 0x1a2030, roughness: 0.95 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x3a2f22, roughness: 0.85 });
  const shelfMat = new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.6 });

  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), backMat);
  back.position.set(0, 0, -d);
  roomGroup.add(back);

  const left = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wallMat);
  left.position.set(-w / 2, 0, -d / 2);
  left.rotation.y = Math.PI / 2;
  roomGroup.add(left);

  const right = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wallMat);
  right.position.set(w / 2, 0, -d / 2);
  right.rotation.y = -Math.PI / 2;
  roomGroup.add(right);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
  floor.position.set(0, -h / 2, -d / 2);
  floor.rotation.x = -Math.PI / 2;
  roomGroup.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), wallMat);
  ceil.position.set(0, h / 2, -d / 2);
  ceil.rotation.x = Math.PI / 2;
  roomGroup.add(ceil);

  const shelfT = 8;
  const shelfYs = [];
  const shelfCount = 2;
  for (let i = 1; i <= shelfCount; i++) {
    const y = -h / 2 + (h * i / (shelfCount + 1));
    shelfYs.push(y);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(w - 20, shelfT, d - 20), shelfMat);
    plank.position.set(0, y, -d / 2);
    roomGroup.add(plank);
  }

  placeObjects(-h / 2, 0);
  shelfYs.forEach((y, i) => placeObjects(y + shelfT / 2, i + 1));

  interiorLight.position.set(0, h * 0.32, -d * 0.25);
  interiorLight.distance = Math.max(w, h, d) * 3.5;
}

function placeObjects(baseY, tier) {
  const w = p.monW, d = p.depth;
  const s = 22 + tier * 4;
  const items = [
    { x: -w * 0.32, z: -d * 0.55, kind: "sphere", color: 0xe14b5a },
    { x:  w * 0.02, z: -d * 0.75, kind: "cube",   color: 0x4a8ef2 },
    { x:  w * 0.34, z: -d * 0.60, kind: "torus",  color: 0x38c17a },
  ];
  items.forEach((it) => {
    let geom, restH;
    if (it.kind === "sphere")     { geom = new THREE.SphereGeometry(s, 32, 24); restH = s; }
    else if (it.kind === "cube")  { geom = new THREE.BoxGeometry(s * 1.5, s * 1.5, s * 1.5); restH = s * 0.75; }
    else                          { geom = new THREE.TorusGeometry(s, s * 0.32, 20, 40); restH = s * 0.32; }
    const mat = new THREE.MeshStandardMaterial({ color: it.color, roughness: 0.4, metalness: 0.12 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(it.x, baseY + restH, it.z);
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

// ---------- Face tracking ----------
let tracker = null;
let lastVideoTime = -1;
let firstDetection = true;
let framesSinceDetection = 999;
const eye = new THREE.Vector3(0, 0, 500);
const rawEye = new THREE.Vector3(0, 0, 500);

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
    // brief hold so users see "Ready"
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

function estimateEyeFromLandmarks(landmarks, vw, vh) {
  const A = landmarks[IRIS_A];
  const B = landmarks[IRIS_B];
  if (!A || !B) return null;

  const ax = A.x * vw, ay = A.y * vh;
  const bx = B.x * vw, by = B.y * vh;
  const midX = (ax + bx) / 2;
  const midY = (ay + by) / 2;
  const dx = bx - ax, dy = by - ay;
  const ipdPx = Math.hypot(dx, dy);
  if (ipdPx < 4) return null;

  const fovRad = p.fov * Math.PI / 180;
  const fPx = vw / (2 * Math.tan(fovRad / 2));

  const z  = fPx * p.ipd / ipdPx;
  const cx = (midX - vw / 2) * z / fPx;
  const cy = (vh / 2 - midY) * z / fPx;

  return {
    x: p.flipX ? -cx : cx,
    y: cy + p.monH / 2 + p.camY,
    z,
  };
}

// ---------- Track / render loop ----------
let rafRunning = false;
let fpsFrames = 0;
let fpsLast = performance.now();
let fpsValue = 0;

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
    if (result.faceLandmarks && result.faceLandmarks.length > 0) {
      const est = estimateEyeFromLandmarks(result.faceLandmarks[0], video.videoWidth, video.videoHeight);
      if (est) {
        rawEye.set(est.x, est.y, est.z);
        if (firstDetection) {
          eye.copy(rawEye);
          firstDetection = false;
        } else {
          eye.lerp(rawEye, 1 - p.smooth);
        }
        detected = true;
        framesSinceDetection = 0;
      }
    }
  }
  if (!detected) framesSinceDetection++;

  setOffAxisProjection(camera, eye.x, eye.y, eye.z, p.monW, p.monH, 10, 6000);
  renderer.render(scene, camera);

  // Track state
  if (firstDetection)          setTrackState("waiting", "Waiting for face");
  else if (framesSinceDetection > 30) setTrackState("lost", "Face lost");
  else                         setTrackState("tracking", "Tracking");

  // Stats
  fpsFrames++;
  const now = performance.now();
  if (now - fpsLast >= 500) {
    fpsValue = Math.round(fpsFrames * 1000 / (now - fpsLast));
    fpsFrames = 0;
    fpsLast = now;
    statFps.textContent = String(fpsValue);
  }
  statEye.textContent = `${eye.x.toFixed(0)}, ${eye.y.toFixed(0)}, ${eye.z.toFixed(0)} mm`;

  requestAnimationFrame(loop);
}

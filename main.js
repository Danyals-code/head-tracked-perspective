import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
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
const trackDot       = document.getElementById("trackDot");
const trackLabel     = trackDot.querySelector(".label");
const statState      = document.getElementById("statState");
const statEye        = document.getElementById("statEye");
const statFps        = document.getElementById("statFps");

// ---------- Params (all mm unless noted) ----------
const DEFAULTS = {
  monW: 500, monH: 300, depth: 450,
  fov: 60, ipd: 63, smooth: 0.80,
  showCam: true, flipX: true,
};
const p = { ...DEFAULTS };

const sliderIds = ["monW", "monH", "depth", "fov", "ipd", "smooth"];
const roomKeys  = new Set(["monW", "monH", "depth"]);
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
  recenterRequested = true;
}

bindSliders();
bindSwitches();
resetBtn.addEventListener("click", resetToDefaults);

// ---------- UI panel ----------
function openPanel()  { panel.classList.remove("hidden"); uiToggle.setAttribute("aria-expanded", "true"); }
function closePanelFn() { panel.classList.add("hidden");  uiToggle.setAttribute("aria-expanded", "false"); }
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
    setTimeout(() => b.classList.remove("flash"), 300);
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
renderer.setClearColor(0x05070b);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 10, 6000);

const roomGroup = new THREE.Group();
scene.add(roomGroup);

scene.add(new THREE.AmbientLight(0xffffff, 0.32));
const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
keyLight.position.set(220, 420, 550);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x8ab4ff, 0.38);
fillLight.position.set(-320, 120, 320);
scene.add(fillLight);
const interiorLight = new THREE.PointLight(0xffd9a8, 0.7, 2500, 2);
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

// A subtle grid texture so back-wall parallax is visible even from small head shifts.
function makeGridTexture(cellMm, majorEvery, hue) {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = hue;
  ctx.fillRect(0, 0, size, size);
  const step = size / 8; // 8 cells per texture tile
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    const v = Math.round(i * step) + 0.5;
    ctx.beginPath(); ctx.moveTo(v, 0); ctx.lineTo(v, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, v); ctx.lineTo(size, v); ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 8; i += majorEvery) {
    const v = Math.round(i * step) + 0.5;
    ctx.beginPath(); ctx.moveTo(v, 0); ctx.lineTo(v, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, v); ctx.lineTo(size, v); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const cellsPerRepeat = 8;
  const repeat = 1 / (cellsPerRepeat * cellMm);
  return { tex, repeatPerMm: repeat };
}

function rebuildRoom() {
  disposeGroup(roomGroup);
  const w = p.monW, h = p.monH, d = p.depth;

  const backGrid  = makeGridTexture(30, 4, "#1a2030");
  const wallGrid  = makeGridTexture(60, 4, "#242a36");
  const floorGrid = makeGridTexture(50, 4, "#2f2820");

  backGrid.tex.repeat.set(w * backGrid.repeatPerMm, h * backGrid.repeatPerMm);
  const wallTexL = wallGrid.tex.clone(); wallTexL.needsUpdate = true; wallTexL.repeat.set(d * wallGrid.repeatPerMm, h * wallGrid.repeatPerMm);
  const wallTexR = wallGrid.tex.clone(); wallTexR.needsUpdate = true; wallTexR.repeat.set(d * wallGrid.repeatPerMm, h * wallGrid.repeatPerMm);
  const ceilTex  = wallGrid.tex.clone(); ceilTex.needsUpdate  = true; ceilTex.repeat.set(w * wallGrid.repeatPerMm,  d * wallGrid.repeatPerMm);
  floorGrid.tex.repeat.set(w * floorGrid.repeatPerMm, d * floorGrid.repeatPerMm);

  const wallMat  = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, map: wallTexL });
  const wallMatR = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, map: wallTexR });
  const backMat  = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, map: backGrid.tex });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, map: floorGrid.tex });
  const ceilMat  = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, map: ceilTex });

  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), backMat);
  back.position.set(0, 0, -d);
  roomGroup.add(back);

  const left = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wallMat);
  left.position.set(-w / 2, 0, -d / 2);
  left.rotation.y = Math.PI / 2;
  roomGroup.add(left);

  const right = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wallMatR);
  right.position.set(w / 2, 0, -d / 2);
  right.rotation.y = -Math.PI / 2;
  roomGroup.add(right);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
  floor.position.set(0, -h / 2, -d / 2);
  floor.rotation.x = -Math.PI / 2;
  roomGroup.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilMat);
  ceil.position.set(0, h / 2, -d / 2);
  ceil.rotation.x = Math.PI / 2;
  roomGroup.add(ceil);

  placeObjects();

  interiorLight.position.set(0, h * 0.32, -d * 0.35);
  interiorLight.distance = Math.max(w, h, d) * 3.5;
}

function placeObjects() {
  const w = p.monW, h = p.monH, d = p.depth;
  const floorY = -h / 2;

  // Cluster of 4 objects on the floor, close together, staggered in depth.
  // Sizes scale a little with monitor size so they read at any dimension.
  const s = Math.min(w, h) * 0.09;

  const items = [
    { kind: "sphere",   r: s * 1.05,           x: -w * 0.12, z: -d * 0.55, color: 0xe14b3c },
    { kind: "cube",     side: s * 1.6,         x:  w * 0.10, z: -d * 0.68, color: 0x4a8ef2 },
    { kind: "cylinder", r: s * 0.7, hh: s * 1.9, x: -w * 0.02, z: -d * 0.80, color: 0xe6b34a },
    { kind: "torus",    R: s * 0.9, r: s * 0.28, x:  w * 0.22, z: -d * 0.58, color: 0x38c17a },
  ];

  items.forEach((it) => {
    let geom, restH, rotX = 0;
    if (it.kind === "sphere")        { geom = new THREE.SphereGeometry(it.r, 40, 28); restH = it.r; }
    else if (it.kind === "cube")     { geom = new THREE.BoxGeometry(it.side, it.side, it.side); restH = it.side / 2; }
    else if (it.kind === "cylinder") { geom = new THREE.CylinderGeometry(it.r, it.r, it.hh, 40); restH = it.hh / 2; }
    else /* torus */                 { geom = new THREE.TorusGeometry(it.R, it.r, 20, 44); restH = it.r; rotX = Math.PI / 2; }
    const mat = new THREE.MeshStandardMaterial({ color: it.color, roughness: 0.4, metalness: 0.18 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = rotX;
    mesh.position.set(it.x, floorY + restH, it.z);
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

// Scale converts MediaPipe canonical head-pose units to physical millimetres.
// Auto-calibrated from your IPD on first detection and whenever FOV/IPD changes.
let scaleFactor = 1;
let scaleRefreshRequested = true;
let recenterRequested     = true;   // triggers on first detection too
let hasCalibrated         = false;

const offset = { x: 0, y: 0 };
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
  const zMm = fPx * p.ipd / ipdPx;    // physical distance from camera to eye plane

  const rawZ = -matData[14];          // MediaPipe: camera looks down -Z, head is at negative Z
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
          // Preserve calibration when scale changes: offsets are in scaled units.
          if (hasCalibrated && !recenterRequested) {
            offset.x *= ratio;
            offset.y *= ratio;
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
        recenterRequested = false;
        hasCalibrated = true;
        // snap current eye so smoothing doesn't drag from a stale pose
        target.set(0, 0, rawZ);
        eye.copy(target);
      } else {
        target.set(rawX - offset.x, rawY - offset.y, rawZ);
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

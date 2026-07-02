import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/vision_bundle.mjs";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export async function createTracker() {
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  const opts = {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: true,
    runningMode: "VIDEO",
    numFaces: 1,
  };
  try {
    return await FaceLandmarker.createFromOptions(fileset, opts);
  } catch (e) {
    console.warn("GPU delegate failed, falling back to CPU:", e);
    opts.baseOptions.delegate = "CPU";
    return await FaceLandmarker.createFromOptions(fileset, opts);
  }
}

// Iris landmark indices in the 478-point FaceLandmarker mesh.
export const IRIS_A = 468;
export const IRIS_B = 473;

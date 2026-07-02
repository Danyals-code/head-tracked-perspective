# 3D Shelf — Head-Tracked Perspective

A single-page web experiment: your monitor becomes a window looking into a
shallow cuboid room. As you move your head in front of the webcam, the scene
re-projects with off-axis perspective so the box appears fixed in physical
space behind the glass.

Runs 100% client-side. Video and face landmarks never leave the browser.

## Try it locally

The browser blocks `getUserMedia` on `file://`, so serve the folder over
`http://localhost`. Pick whichever is convenient:

```sh
# Python 3
python -m http.server 8000

# Node
npx --yes http-server -p 8000 -c-1

# PowerShell + Node
npx --yes serve -l 8000
```

Then open <http://localhost:8000> and click **Start**.

## Deploy to GitHub Pages

1. Create a new GitHub repo and push this folder to it.

    ```sh
    git init
    git add .
    git commit -m "Initial: head-tracked 3D shelf"
    git branch -M main
    git remote add origin https://github.com/<you>/<repo>.git
    git push -u origin main
    ```

2. On GitHub: **Settings → Pages**. Source: *Deploy from a branch*.
   Branch: `main`, folder: `/ (root)`. Save.
3. Wait ~1 min. Your site is live at `https://<you>.github.io/<repo>/`.
   HTTPS is on by default, which the camera API requires.

## Deploy to Vercel

1. Import the repo at <https://vercel.com/new>.
2. Framework Preset: **Other**. No build command, no output directory.
3. Deploy. That's it — free tier covers this comfortably (static hosting only,
   no serverless functions, no bandwidth surprises).

## Calibration

The illusion depends on realistic dimensions. Open **Settings** and set:

| Setting                        | What to do                                         |
|--------------------------------|----------------------------------------------------|
| Monitor width / height         | Physical size of your screen's glass, in mm.       |
| Box depth                      | How deep the virtual shelf should be.              |
| Camera FOV                     | Most webcams: 55–70°. Adjust if depth feels off.   |
| Your IPD                       | Inter-pupillary distance. 63 mm is a good default. |
| Cam above screen top           | Distance from webcam lens to top of screen glass.  |
| Flip head X                    | Toggle if the parallax appears reversed.           |

Press **F** or click **Fullscreen** — the off-axis math assumes the canvas
fills the physical monitor. Sit 30–80 cm away, move your head slowly, and the
shelves should feel anchored behind the screen.

## How it works

- **Face landmarks:** MediaPipe FaceLandmarker (478-point mesh with iris)
  runs in the browser via WebAssembly/GPU.
- **Real-world eye position:** apparent iris-to-iris distance and an assumed
  webcam horizontal FOV give distance via a pinhole model; image position
  gives lateral/vertical offset in millimetres.
- **Rendering:** [three.js](https://threejs.org/) with a manually built
  asymmetric perspective frustum ("off-axis projection"). The four screen
  corners become the frustum's four side planes, so points at z = 0 always
  project to the same pixels — only depth parallaxes.

## File layout

```
index.html      — markup, overlay, controls
styles.css      — dark UI
main.js         — three.js scene, off-axis camera, main loop
tracker.js      — MediaPipe FaceLandmarker wrapper
.nojekyll       — tell GitHub Pages not to Jekyll-process the site
```

No build step, no dependencies to install. Three.js and MediaPipe are loaded
as ES modules from a CDN.

# head-tracked-perspective

A browser demonstration of **head-coupled off-axis perspective**: the monitor
becomes a fixed window into a small three-dimensional room. As you move your
head in front of the webcam, the rendering updates in real time so the room
appears anchored in physical space behind the glass — you look into it from
different vantage points as you would through a real window.

Everything runs client-side. Camera video and face landmarks never leave the
browser.

**Live:** <https://danyals-code.github.io/head-tracked-perspective/>

---

## The technique

This effect goes by several names in the literature, and is well-studied.

- **Fish-tank virtual reality (FTVR)** — Ware, Arthur & Booth, *"Fish Tank
  Virtual Reality"*, INTERACT '93 & CHI '93 (1993). The foundational paper.
  They compared monoscopic, stereoscopic, and head-tracked displays for a
  depth-judgment task and found that adding head coupling — even without
  stereo — produced substantial improvement in perceived structure.
- **Head-coupled perspective / head-tracked display** — the more descriptive
  modern names.
- **Motion-parallax display** — emphasises the specific depth cue being
  synthesised.

**Selected papers**

- Deering, M. (1992). *"High resolution virtual reality."* SIGGRAPH '92.
  Derives the corrected perspective for a head-tracked stereoscopic display
  and shows why naive symmetric projection breaks the illusion.
- Ware, C., Arthur, K., & Booth, K. S. (1993). *"Fish tank virtual reality."*
  INTERACT '93 & CHI '93. The empirical case for FTVR.
- Rekimoto, J. (1995). *"A vision-based head tracker for fish tank virtual
  reality — VR without head gear."* IEEE VRAIS '95. Perhaps the first
  camera-based (i.e. no marker, no tether) head tracking for FTVR — the same
  category as this project.
- Kooima, R. (2008). *"Generalized Perspective Projection."* A concise
  derivation of the asymmetric-frustum construction used here.
- Arsenault, R., & Ware, C. (2004). *"The importance of stereo and eye-coupled
  perspective for eye-hand coordination in fish tank VR."* Presence 13(5).
  Head coupling roughly equals stereo for many depth tasks; combined they
  dominate.

**In the wild**

- Johnny Chung Lee's 2007 *"Head Tracking for Desktop VR Displays using the
  Wii Remote"* demo — ~10 M YouTube views — brought the effect to a mass
  audience and revived interest.
- Nintendo 3DS briefly used front-camera head-tracked parallax for a "3D
  without glasses" mode.
- Amazon Fire Phone (2014) shipped four IR head-tracking cameras for a
  feature it called *Dynamic Perspective* — a serious hardware effort and a
  commercial flop.
- iOS **parallax wallpapers** use device tilt (IMU) rather than head
  tracking, but produce a similar cue.

---

## How this implementation works

Two independent problems, composed:

### 1. Where is your head, in millimetres?

- MediaPipe **FaceLandmarker** runs in the browser via WebAssembly/GPU and
  returns, per frame, a 4×4 *facial transformation matrix* that maps the
  canonical face model into camera space. The last column is the head's
  rigid-body translation in the camera's own frame — invariant to head
  rotation, unlike raw eye-landmark midpoints.
- Matrix units are not guaranteed to be millimetres, so we calibrate. The
  apparent inter-pupillary distance in pixels, combined with an assumed
  camera FOV and a real-world IPD (63 mm by default), gives a physical
  distance-to-eye via the pinhole model. The ratio of that against the
  matrix's Z component becomes our scale factor. Calibration is refreshed on
  Recenter and whenever FOV/IPD change.

### 2. Given eye position, how do we render?

- The virtual screen sits fixed at *z = 0* with world dimensions matching
  your monitor's glass. The 3D room extends into negative *z*.
- Each frame we build an **asymmetric (off-axis) perspective frustum** whose
  four side planes pass through the four screen corners and the eye. Kooima
  (2008) shows this reduces to a single call:

  ```
  makePerspective(left, right, top, bottom, near, far)
  ```

  where each bound is proportional to the horizontal/vertical offset from
  the eye to the corresponding screen edge, divided by the eye's distance
  from the screen plane and multiplied by *near*.
- The consequence: any point at *z = 0* — i.e. anywhere on the physical
  screen — projects to the same pixel regardless of eye position. Only depth
  parallaxes. That invariance is what sells the "fixed window" illusion.

### Head sensitivity

True fish-tank VR maps head displacement 1 : 1 into virtual eye
displacement. Depending on room, seating distance, and personal preference
this can feel too intense — so a sensitivity multiplier (default 0.55) scales
the delta from the calibration pose on all three axes. Set to 1.0 for
literal window physics; set to 0 to freeze the current view.

---

## Controls

| Key      | Action                                         |
| -------- | ---------------------------------------------- |
| **F**    | Toggle fullscreen (recommended for the effect) |
| **R**    | Recenter — your current pose becomes the reference (0, 0) |
| **S**    | Toggle the settings panel                      |
| **Esc**  | Close the settings panel                       |

The settings panel exposes MacBook screen presets (Air 13" / 15", Pro 14" /
16"), box depth, head sensitivity, webcam FOV, your IPD, smoothing, and a
sign flip for the X axis in case the parallax comes out mirrored on your
setup.

---

## Requirements

- A desktop browser with WebGL2 and camera access — Chrome, Edge, Firefox,
  or Safari on macOS or Windows.
- A webcam. Even lighting helps.
- The scene is tuned for MacBook screens; presets are built in.

---

## Development

The project is a static site with no build step. Serve the folder over HTTP
(the browser blocks camera access on `file://`):

```sh
python -m http.server 8000
# then open http://localhost:8000
```

Three.js and MediaPipe Tasks Vision are loaded as ES modules from a CDN.

### Deploy

Any push to `main` triggers `.github/workflows/deploy.yml`, which publishes
the repository root to GitHub Pages.

### File layout

```
index.html                     markup, settings panel, welcome screen
main.js                        Three.js scene, tracking, off-axis projection
tracker.js                     MediaPipe FaceLandmarker wrapper
styles.css                     dark UI
.github/workflows/deploy.yml   Pages deploy workflow
```

---

## License

Personal experiment. No warranty. Fork and adapt freely.

# CardioVision — Heart Discovery patch

This patch replaces the **prominent Model Transparency section** with a premium Heart Discovery experience. It does not change your trained models or backend.

## What's new
- 6 fascinating, sourced heart-anatomy facts + 6 practical, sourced heart-health tips.
- Facts and tips rotate **automatically every 30 seconds**, with manual next/previous controls, selectable dots, pause/resume and visual timer.
- Data is prewritten and sourced from NIH/NHLBI and the American Heart Association. No paid API, AI hallucinations, internet calls, or API keys required at runtime.
- The technical results still exist in a small expandable "Technical appendix" below Discovery. This preserves the hackathon's evaluation deliverables without dominating the visitor experience.
- A detailed `heart-detailed.glb` is now first in the 3D viewer's asset preference order; existing models remain fallback options.

## Install (from CardioAI project root on your Mac)

**Download this ZIP into Downloads**, then in VS Code Terminal:

```bash
cd ~/Desktop/CardioAI
cp -R frontend/src frontend/src_backup_before_discovery
unzip -o ~/Downloads/CardioVision-Discovery-Upgrade.zip -d .
cd frontend
npm run build
npm run dev
```

Only App.tsx, App.css, HeartScene.tsx, and a new HeartDiscovery.tsx are included. Existing CSS index, logo, model files, Python API and models are untouched.

## Alternative heart asset — no account required

**Human Heart Cutaway**, Grab3D: https://grab3d.com/models/anatomy/human-heart-cutaway/
Publisher lists the model under **CC0** (public domain), with an optional **Light GLB ~13 MB** download that is more suitable for the browser than the full-quality ~27 MB version. This is a **cutaway anatomical heart**, not a segmented coronary arterial tree. Verify the appearance in your own scene.

1. Open the webpage above in a browser.
2. Choose **Light** then **GLB**, then download the model (no Sketchfab login).
3. Rename the downloaded file `heart-detailed.glb`.
4. Place it in `CardioAI/frontend/public/models/heart-detailed.glb`.
5. Reload the app. The viewer prefers this model, falling back to `/models/realistic-heart/scene.gltf`, then `/models/heart.glb`.

**Optional direct download from your Mac's terminal** (this verified publisher URL may be subject to your network's restrictions):

```bash
cd ~/Desktop/CardioAI
mkdir -p frontend/public/models
curl -fL --retry 2   'https://grab3d.com/dl/human-heart-cutaway/human-heart-cutaway-light.glb'   -o frontend/public/models/heart-detailed.glb
ls -lh frontend/public/models/heart-detailed.glb
```

If the downloaded file is a webpage/error rather than GLB, delete it and use the browser download. A valid binary GLB starts with `glTF` and can be inspected with `file frontend/public/models/heart-detailed.glb`.

**Important**: The cutaway model's chambers and great vessels are anatomical reference geometry, but LAD/LCX/RCA projected overlays remain approximations, not verified segmentations. For an exact coronary anatomy visualization, obtain a licensed model with individually identifiable coronary meshes. Avoid presenting projections as true stenosis location.

## API remains unchanged

Two terminal windows are required locally:

Terminal 1, from `CardioAI`:
```bash
source .venv/bin/activate
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
```

Terminal 2, from `CardioAI/frontend`:
```bash
npm run dev
```

Open http://localhost:5173 and click **Explore a clinical case**. For deployment, host FastAPI publicly, set `VITE_API_URL` to its HTTPS origin, and configure `FRONTEND_ORIGIN` in your API's CORS allowlist. Do not use localhost as the deployed API URL.

## Delivery note

The content carousel is fully local and requires no ongoing calls. The hero/3D viewer and all ML inference are otherwise unchanged. If asset download is unavailable, the existing heart model is used so the rest of the application stays functional.

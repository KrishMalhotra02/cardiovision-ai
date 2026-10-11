# CardioVision AI — V2 anatomical viewer + live API integration

This is a **drop-in patch for your existing CardioAI project**, not a standalone new React app.
It preserves the current FastAPI endpoint format and all four trained models.

## What changed
- Replaces the disconnected pale loops with **thin coronary score traces projected onto the surface of the loaded heart mesh**. Their placement is illustrative; individual arteries are not yet anatomically segmented/registered.
- Reduces glossy/plastic-looking untextured materials and harsh lighting, while **preserving textures** when a textured asset is provided.
- Supports a **higher-quality textured external heart** at `/models/realistic-heart/scene.gltf`, with the previous `/models/heart.glb` as fallback.
- Keeps the existing subtly animated brand-heart logo, 55-field assessment drawer, and prediction/evaluation sections.
- **Retries the backend connection automatically every 6 seconds**, and provides a reconnect button and a visible error if inference is unavailable.
- Includes a real end-to-end backend smoke test and an optional macOS one-command local startup script.

## Install from project root
1. Download `CardioVision-V2-Patch.zip` to your Mac's Downloads folder.
2. Open the VS Code terminal and run:

```bash
cd ~/Desktop/CardioAI
cp -R frontend/src frontend/src_backup_before_v2
unzip -o ~/Downloads/CardioVision-V2-Patch.zip -d .
```

3. The original `frontend/public/models/heart.glb` stays in place and will still load. The original backend and models are untouched.

## Strongly recommended: upgrade to a realistic textured asset

The model in the screenshot is a brightly colored textbook mesh. Better CSS cannot make its underlying geometry highly detailed.

Use a real textured model such as **Realistic Human Heart** by **neshallads** on Sketchfab (CC BY, attribution required):
https://sketchfab.com/3d-models/realistic-human-heart-3f8072336ce94d18b3d0d055a1ece089

1. Click **Download 3D Model** (log in to Sketchfab if prompted).
2. Choose **glTF** rather than OBJ/FBX. Extract the downloaded ZIP.
3. Copy the complete extracted glTF model to:
   `CardioAI/frontend/public/models/realistic-heart/`
4. Verify it contains **`scene.gltf`**, along with any `scene.bin` and the `textures/` directory. Keep relative paths intact.

Expected location:

```text
frontend/public/models/
  heart.glb                       # existing fallback model
  realistic-heart/
    scene.gltf                    # preferred detailed heart
    scene.bin                     # if included in the download
    textures/                     # if included in the download
```

If `scene.gltf` is located inside another nested folder, move **the entire containing folder's contents** to `realistic-heart` rather than moving the glTF file alone.

The viewer tries the realistic model first on refresh. It retains the existing GLB as fallback. The included attribution link is displayed with the textured Sketchfab asset; maintain the CC BY credit in the published site.

**Important limitation:** The selected artery traces are visual surface annotations, **not segmentations of LAD/LCX/RCA**. They are not patient-specific lesion coordinates. For anatomically validated vessel coloring, we need a GLB with independently named LAD/LCX/RCA meshes or an anatomically registered coronary segmentation.

## Run and test both servers

From `CardioAI` project root:

**Terminal 1**
```bash
source .venv/bin/activate
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
```

**Terminal 2**
```bash
cd frontend
npm run dev
```

**Terminal 3 (optional end-to-end check)**
```bash
cd ~/Desktop/CardioAI
source .venv/bin/activate
python scripts/check_api.py
```

Open http://127.0.0.1:5173 and click **Explore a clinical case**.
The button calls `GET /api/demo-case` and then `POST /api/predict`. The resulting predictions come from your four actual joblib pipelines.

Optional on macOS, once you've verified the normal two-terminal workflow:
```bash
cd ~/Desktop/CardioAI
chmod +x start_cardio.command
./start_cardio.command
```

## Verify frontend build

```bash
cd ~/Desktop/CardioAI/frontend
npm run build
```

If it reports an error, copy the exact lines. The patch was statically syntax-checked but **cannot be compiled against your exact local node_modules from this package environment**.

## Deployment — two services

**API (Render/Railway/another Python host)**
- Backend root: `CardioAI` repository root.
- Use the Python version and installed scikit-learn version compatible with the serialized models.
- Generate dependency pins from your *working* local Python environment:
  `python scripts/export_backend_requirements.py`
- Build: `pip install -r backend/requirements.txt`
- Start: `uvicorn backend.app:app --host 0.0.0.0 --port $PORT`
- Ensure these files are deployed: `backend/app.py`, all four `backend/models/*_candidate.joblib`, and (with current backend) `data/raw/dataset.xlsx`.
- Configure FastAPI CORS to allow your public frontend HTTPS domain (see below).
- Verify the deployed `/health` and `/api/predict` before considering deployment finished.

**Frontend (Vercel/Netlify)**
- Repository project root: `frontend`.
- Build command: `npm run build`.
- Output directory: `dist`.
- Environment variable **at build time**: `VITE_API_URL=https://your-live-backend.example.com` (no `/api` suffix).
- Redeploy after changing the environment variable.
- Check the browser developer console/network panel to verify requests go to the live HTTPS backend, not `127.0.0.1`.

In the existing `backend/app.py`, update the existing CORS configuration to support production:

```python
import os

origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
frontend_origin = os.getenv("FRONTEND_ORIGIN", "").rstrip("/")
if frontend_origin:
    origins.append(frontend_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
```

**Replace the original `app.add_middleware(CORSMiddleware, ...)` block; do not add it twice.** Set `FRONTEND_ORIGIN=https://your-site.vercel.app` on the backend host.

## What still needs implementing for challenge completion
- Explainability view based on the selected fitted models (SHAP or another defensible per-case method).
- Properly segmented/verified LAD/LCX/RCA anatomical geometry (current traces are not a clinical vessel segmentation).
- Six-page technical report, demo video, submission verification, public deployment validation.
- More complete probability calibration/external validation; existing model probabilities are exploratory research scores.

The 303-record dataset is a small observational research dataset. Do **not** present results as clinically validated diagnostic probabilities or actual patient-specific lesions.

## Attribution
- Preferred 3D asset: *Realistic Human Heart*, neshallads, Sketchfab — **CC BY**. Link above; retain attribution in deployed app.
- Existing fallback asset: Innerscene / MakeHuman — CC0, subject to verifying its source license.

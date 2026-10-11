# CardioVision — Publication checklist (React/Vite + FastAPI)

This package is a **patch** to an existing CardioAI repository, not an entire app and not a hosted deployment. To receive a public website URL you must publish your repository using your own GitHub/Vercel/Render accounts or connected hosting services.

## 1. Install patch and test locally

```bash
cd ~/Desktop/CardioAI
bash ~/Downloads/CardioVision-Launch-Ready/install.sh "$PWD"
source .venv/bin/activate
python -c 'from backend.app import app; print(sorted(app.openapi()["paths"]))'
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
# in a second VS Code terminal:
cd ~/Desktop/CardioAI/frontend
npm run build
npm run dev
```

Verify `/health`, `/api/quick/schema`, `/api/quick/predict`, and `/api/analytics/full` endpoints. Test UI with an example record and select all 3 vessels, rotating the heart. Ensure no labels overlap. The arrows point to **illustrative** mapped regions, not segmented arteries.

## 2. GitHub repository

Create an EMPTY GitHub repository named `cardiovision-ai`. From your project root:

```bash
cd ~/Desktop/CardioAI
git status --short
# Check that no personal clinical information, real patient data, API keys or secrets are included.
git add .
git status --short
# Be sure necessary 4 trained candidate.joblib model files, quick_v4 artifacts,
# and your licensed public UCI dataset.xlsx are included.
git commit -m "Prepare CardioVision for launch"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/cardiovision-ai.git
git push -u origin main
```

If `origin` already exists, do NOT add a duplicate remote: run `git remote -v` and use `git push` to your existing correct repository.

**Do not commit privately collected patient data.** The project uses only the public UCI research dataset. Comply with its attribution requirements. Do not store patient assessments on your deployed app.

## 3. Backend on Render

- Sign in to https://dashboard.render.com.
- Choose **New → Blueprint** and connect your GitHub repository. Render recognizes `render.yaml` in the repository root. Alternatively create **New → Web Service** with the repo root as project root, Python 3, `pip install -r requirements-deploy.txt` and `python -m uvicorn backend.app:app --host 0.0.0.0 --port $PORT`.
- For `CARDIO_ALLOWED_ORIGINS` you may temporarily leave it empty while deploying the API. Once Vercel gives you its actual HTTPS domain, set the exact origin, e.g. `https://cardiovision-ai.vercel.app` and redeploy/restart. Do not use `*` for public CORS.
- Set Python runtime to match your local training environment. Artifacts from scikit-learn 1.9.1 need the same version. Files must include `backend/models/*_candidate.joblib`, `backend/models/quick_v4/*`, and `data/raw/dataset.xlsx` for the current API implementation.
- Verify `https://YOUR-RENDER-URL/health` returns 200.

Render's free compute plan may sleep when idle and can have memory/startup limits. Depending on the subscription available, first request after idling can be slow. The SHAP package increases memory and build time. If a deployment fails due to memory, inspect Render logs before changing anything.

## 4. Frontend on Vercel

- Sign in to https://vercel.com/new and **Import Git Repository**.
- Select your CardioVision repository.
- **Root Directory:** `frontend`.
- **Framework Preset:** `Vite`.
- **Build Command:** `npm run build`.
- **Output Directory:** `dist`.
- Set environment variable `VITE_API_URL` to the FULL Render public API URL including `https://`, without trailing slash.
- Deploy. If you change this environment variable later, redeploy because Vite embeds it at build time.

## 5. Connect both services

- In Render settings, set `CARDIO_ALLOWED_ORIGINS` to the exact Vercel URL, e.g. `https://cardiovision-ai.vercel.app` (without trailing slash).
- Restart/redeploy the Render service.
- Open the Vercel URL in an incognito browser. Check the browser console and network tab if requests fail.

## 6. Final public-site smoke test

1. Landing page displays actual anatomical model from `frontend/public/models/` (not a missing asset message).
2. Persistent LAD/LCX/RCA label boxes, elbow connector lines and contact dots show on the heart. Rotation repositions arrow endpoints; clicking labels switches selection.
3. Quick input form submits and returns CAD, contribution charts and same-age cohort summaries.
4. Full analysis demo returns CAD/LAD/LCX/RCA predictions; vessel highlights, charts and feature attributions update.
5. The page and 3D asset load on mobile; labels do not obscure controls.
6. Accessible disclaimer remains in assessment/results views. Never claim clinical validation.
7. Confirm models and dataset attributions/licensing and remove any secrets or privately collected patient inputs before publishing.

## Limitations

This demo uses a public research dataset, and overlay traces are illustrative. It cannot localize stenoses or diagnose real patients. The backend requires the publicly licensed UCI dataset file to compute reference age-band statistics and feature validation; this should be separated into static aggregate metadata in any future production redesign.

# CardioVision AI — Data Science Upgrade (real 303-patient dataset)

This package adds a **separate Quick CAD model** while preserving the existing four 55-feature models. It does **not** change LAD/LCX/RCA models.

## Confirmed findings

- 303 rows, 59 columns, 55 eligible inputs after excluding `Cath`, `LAD`, `LCX`, `RCA`.
- `BMI = Weight / (Length/100)^2` exactly for all records; do not ask for all three.
- `Exertional CP` is constant; it cannot help distinguish CAD in this dataset.
- The binary chest-pain columns (`Typical Chest Pain`, `Atypical`, `Nonanginal`) form four mutually exclusive combinations and can be represented by **one UI question**.
- Excel row 95: `Cath=Normal`, `LAD=Stenotic`. This contradicts the other 302 records' CAD-versus-vessel definition. We left the row untouched and flagged it for audit.

## Nested 5-fold cross-validation on original dataset (CAD)

| Candidate input pool | Typical input count | Mean fold ROC-AUC | Pooled out-of-fold ROC-AUC |
|---|---:|---:|---:|
| History, symptoms, basic measurements | 10 | 0.8890 | 0.8843 |
| History + ECG | 12 | 0.9083 | 0.9029 |
| History + ECG + echo | 12 | 0.9390 | 0.9358 |
| All 55 columns | 55 | 0.9112 | 0.8955 |

Raw-feature selection and algorithm selection were nested inside each training fold, preventing label leakage during cross-validation. These results are **exploratory internal validation, not external or prospective clinical validation**; the 303 subjects are a selected clinical cohort, not a representative general population. CAD prevalence in these records is about 71%.

### Quick model inputs

The final candidate was trained with 12 original columns:

`Age`, `BMI`, `DM`, `HTN`, `BP`, `PR`, `Current Smoker`, `Typical Chest Pain`, `Dyspnea`, `Atypical`, `Nonanginal`, `Function Class`.

Chest-pain flags are collapsed to one dropdown, so the UI can ask **10 questions**. The trained algorithm selected by full-dataset CV is Random Forest with automatic interaction terms. The new model predicts only overall **CAD**, not LAD/LCX/RCA. The alternatives had similar internal performance; no model should be called clinically validated.

## Install into your existing Mac project

**Backup first** (do not delete existing models or frontend files):

```bash
cd ~/Desktop/CardioAI
cp -R backend backend_backup_before_quick
cp -R ml ml_backup_before_quick
unzip -o ~/Downloads/CardioVision-DataScience-Upgrade.zip -d .
source .venv/bin/activate
python -m pip install scipy scikit-learn joblib pandas openpyxl
python -m ml.train_reduced --xlsx data/raw/dataset.xlsx --out backend/models/quick_cad
```

The training program reruns the nested-CV research (several minutes) and saves:

- `backend/models/quick_cad/quick_cad_model.joblib`
- `backend/models/quick_cad/quick_cad_schema.json`
- `backend/models/quick_cad/nested_cv_summary.csv`
- `backend/models/quick_cad/nested_cv_folds.csv`
- `backend/models/quick_cad/feature_selection_stability.csv`

We intentionally **do not ship a cross-version pickled model**. Your Mac runs scikit-learn 1.9.1 while the separate analysis environment used a different version. Retraining locally avoids unsafe pickle/version incompatibilities.

## Enable the Quick CAD endpoint

Open `backend/app.py` and append these two lines **once**, below the existing FastAPI `app` definition and routes:

```python
from backend.quick_api import router as quick_router
app.include_router(quick_router)
```

Restart backend from the project root:

```bash
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
```

Test:

- `http://127.0.0.1:8000/api/quick/schema`
- `http://127.0.0.1:8000/docs` and `POST /api/quick/predict`

Example request:

```json
{
  "features": {
    "Age": 53,
    "BMI": 29.4,
    "DM": 0,
    "HTN": 1,
    "BP": 110,
    "PR": 80,
    "Current Smoker": 1,
    "Dyspnea": "N",
    "Function Class": 0,
    "ChestPainType": "other_unspecified"
  }
}
```

Use the provided `frontend/src/components/QuickAssessment.tsx` as an **optional standalone widget** in your existing React app:

```tsx
import QuickAssessment from './components/QuickAssessment';
// Place <QuickAssessment /> where you want the concise screening form.
```

The widget does not replace your vessel-specific comprehensive assessment screen. It only shows CAD.

### Scientific limitations

- Don't claim these 10 questions are **clinically sufficient to diagnose or rule out** coronary artery disease.
- Don't take predicted probabilities at face value as calibrated clinical risk estimates.
- Avoid inventing LAD, LCX, or RCA predictions from the reduced CAD model.
- Symptoms, ECG, and echocardiography require appropriate clinical definitions and collection procedures.
- For deployment, perform proper external validation, calibration, subgroup checks, data-governance review, and clinician review.

## What's in `reports/`

Complete feature-target association rankings, numeric redundancy, selection-stability, nested-CV, ablation checks, model schema, and a formatted Excel analysis report.

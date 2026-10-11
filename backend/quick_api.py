"""V4 quick CAD router. Replaces old quick_api.py and keeps the same URLs."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any
import json
import math
import joblib
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.analytics_core import dataset, patient_cohort, explain_case

router = APIRouter(prefix="/api/quick", tags=["Quick CAD assessment"])
ARTIFACTS = Path(__file__).resolve().parent / "models" / "quick_v4"
CHEST_PAIN = {
    "typical": (1, "N", "N"),
    "atypical": (0, "Y", "N"),
    "nonanginal": (0, "N", "Y"),
    "other_unspecified": (0, "N", "N"),
}
INPUT_FIELDS = [
    {"name": "Age", "label": "Age", "unit": "years", "type": "number", "options": []},
    {"name": "Sex", "label": "Sex", "unit": None, "type": "select", "options": ["Male", "Fmale"]},
    {"name": "BMI", "label": "Body mass index", "unit": "kg/m²", "type": "number", "options": []},
    {"name": "DM", "label": "Diagnosed diabetes", "unit": None, "type": "select", "options": [0, 1]},
    {"name": "HTN", "label": "Diagnosed hypertension", "unit": None, "type": "select", "options": [0, 1]},
    {"name": "Current Smoker", "label": "Currently smoking", "unit": None, "type": "select", "options": [0, 1]},
    {"name": "ChestPainType", "label": "Chest pain presentation", "unit": None, "type": "select", "options": list(CHEST_PAIN)},
    {"name": "Dyspnea", "label": "Shortness of breath", "unit": None, "type": "select", "options": ["N", "Y"]},
    {"name": "BP", "label": "Measured blood pressure", "unit": "mmHg", "type": "number", "options": []},
    {"name": "PR", "label": "Pulse rate", "unit": "beats/min", "type": "number", "options": []},
]
VALID_RANGES = {"Age": (18, 110), "BMI": (10, 70), "BP": (60, 260), "PR": (30, 220)}

class QuickRequest(BaseModel):
    features: dict[str, Any]

@lru_cache(maxsize=1)
def resources():
    schema_path = ARTIFACTS / "quick_v4_metadata.json"
    model_path = ARTIFACTS / "quick_cad_v4.joblib"
    try:
        return json.loads(schema_path.read_text()), joblib.load(model_path)
    except (FileNotFoundError, OSError) as exc:
        raise HTTPException(503, "Quick CAD v4 has not been trained. Run: python -m ml.train_quick_v4") from exc

@router.get("/schema")
def get_schema():
    meta, _ = resources()
    return {
        "mode": "Quick CAD assessment",
        "target": "CAD only",
        "visible_questions": len(INPUT_FIELDS),
        "input_fields": INPUT_FIELDS,
        "model_version": meta["model_version"],
    }

@router.post("/predict")
def predict_quick(body: QuickRequest):
    meta, model = resources()
    f = dict(body.features)
    expected = {field["name"] for field in INPUT_FIELDS}
    if set(f) != expected:
        raise HTTPException(422, {"missing": sorted(expected - set(f)), "unexpected": sorted(set(f) - expected)})
    for q in INPUT_FIELDS:
        name = q["name"]
        value = f[name]
        if q["type"] == "number":
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                raise HTTPException(422, f"{name}: finite number required")
            lo, hi = VALID_RANGES[name]
            if not lo <= float(value) <= hi:
                raise HTTPException(422, f"{name}: value must be between {lo} and {hi}")
        else:
            if name in {"DM", "HTN", "Current Smoker"} and (isinstance(value, bool) or value not in [0, 1]):
                raise HTTPException(422, f"{name}: expected Yes / No")
            elif name not in {"DM", "HTN", "Current Smoker"} and value not in q["options"]:
                raise HTTPException(422, f"{name}: invalid option")
    cp = CHEST_PAIN[str(f["ChestPainType"])]
    raw = {**f, "Typical Chest Pain": cp[0], "Atypical": cp[1], "Nonanginal": cp[2]}
    del raw["ChestPainType"]
    x = pd.DataFrame([raw], columns=meta["features"])
    positive_idx = list(model.classes_).index(1)
    probability = float(model.predict_proba(x)[0, positive_idx])
    source = dataset()
    train = source[meta["features"]]
    explanation = explain_case(model, x, train)
    cohort = patient_cohort(float(raw["Age"]), raw, quick=True)
    return {
        "mode": "quick_cad", "target": "CAD",
        "predicted_label": "CAD" if probability >= .5 else "Normal",
        "positive_probability": round(probability, 5),
        "model_version": meta["model_version"],
        "model_method": meta["algorithm"],
        "xai": explanation,
        "cohort": cohort,
        "predictions": {"CAD": {"positive_probability": round(probability, 5)}},
        "vessel_results_available": False,
        "disclaimer": "Prototype model estimate only; not independently validated as a diagnostic or population-screening test.",
    }

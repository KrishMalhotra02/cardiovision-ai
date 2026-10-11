"""Full-model predictions with cohort context and per-target explanations."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any
import math
import joblib
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.analytics_core import dataset, explain_case, patient_cohort, FORBIDDEN, POSITIVE

router = APIRouter(prefix="/api/analytics", tags=["Full coronary analytics"])
ARTIFACTS = Path(__file__).resolve().parent / "models"
NAMES = ["CAD", "LAD", "LCX", "RCA"]

class FullRequest(BaseModel):
    features: dict[str, Any]

@lru_cache(maxsize=1)
def models():
    try:
        return {n: joblib.load(ARTIFACTS / f"{n.lower()}_candidate.joblib") for n in NAMES}
    except (FileNotFoundError, OSError) as e:
        raise HTTPException(503, "Full model artifacts missing") from e

@router.post("/full")
def full_analysis(body: FullRequest):
    df = dataset()
    x = df.drop(columns=sorted(FORBIDDEN))
    expected = x.columns.tolist()
    provided = body.features
    if set(provided) != set(expected):
        raise HTTPException(422, {"missing": sorted(set(expected)-set(provided)), "unexpected": sorted(set(provided)-set(expected))})
    clean = {}
    for col in expected:
        val = provided[col]
        if pd.api.types.is_numeric_dtype(x[col]):
            if isinstance(val, bool) or not isinstance(val, (float, int)) or not math.isfinite(val):
                raise HTTPException(422, f"{col} must be a finite number")
            clean[col] = float(val)
        else:
            options = x[col].dropna().unique().tolist()
            if not isinstance(val, str) or val not in options:
                raise HTTPException(422, f"{col} must be one of {options}")
            clean[col] = val
    patient = pd.DataFrame([clean], columns=expected)
    results = {}
    explanations = {}
    for name, model in models().items():
        model_columns = list(model.named_steps["preprocessor"].feature_names_in_)
        if model_columns != expected:
            raise HTTPException(500, f"Model feature schema mismatch for {name}")
        prob = float(model.predict_proba(patient)[0, list(model.classes_).index(1)])
        predicted = int(model.predict(patient)[0])
        results[name] = {
            "positive_probability": round(prob, 5),
            "predicted_class": predicted,
            "predicted_label": POSITIVE[name] if predicted == 1 else "Normal",
            "positive_class": POSITIVE[name],
            "model_type": type(model.named_steps["classifier"]).__name__,
        }
        explanations[name] = explain_case(model, patient, x)
    return {
        "predictions": results,
        "explanations": explanations,
        "cohort": patient_cohort(float(clean["Age"]), clean, quick=False),
        "vessel_scores": [{"target": name, "probability": results[name]["positive_probability"]} for name in ["LAD", "LCX", "RCA"]],
        "disclaimer": "Model estimates; no patient-specific vessel location or measured stenosis is available from this tabular dataset.",
    }

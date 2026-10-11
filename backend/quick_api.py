"""Ten-question, four-target research assessment. Maintains existing quick endpoints."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any
import json
import math
import numpy as np
import joblib
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from backend.analytics_core import dataset, patient_cohort, explain_case

router = APIRouter(prefix="/api/quick", tags=["Quick coronary assessment"])
ARTIFACTS = Path(__file__).resolve().parent / "models" / "quick_v4"
CHEST_PAIN = {
    "typical": (1, "N", "N"),
    "atypical": (0, "Y", "N"),
    "nonanginal": (0, "N", "Y"),
    "other_unspecified": (0, "N", "N"),
}
INPUT_FIELDS = [
    {"name": "Age", "label": "Age", "unit": "years", "type": "number", "options": []},
    {"name": "Sex", "label": "Sex (dataset categories)", "unit": None, "type": "select", "options": ["Male", "Fmale"]},
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

class PortableLogistic:
    """Portable, version-stable inference for exported quick vessel LR pipelines."""
    def __init__(self, specification):
        self.spec = specification
        self.classes_ = [0, 1]
        assert specification["format"] == "standardized-onehot-logistic-v1"

    def predict_proba(self, table: pd.DataFrame):
        specification = self.spec
        outputs = []
        for _, row in table.iterrows():
            inputs = [
                (float(row[name]) - mean) / scale
                for name, mean, scale in zip(
                    specification["numeric_features"],
                    specification["numeric_mean"],
                    specification["numeric_scale"],
                )
            ]
            for column, categories in zip(
                specification["categorical_features"],
                specification["categorical_categories"],
            ):
                inputs.extend(1.0 if str(row[column]) == category else 0.0 for category in categories)
            coeff = specification["coefficients"]
            if len(inputs) != len(coeff):
                raise ValueError("Portable model encoded input shape mismatch")
            logit = float(specification["intercept"] + sum(w * x for w, x in zip(coeff, inputs)))
            # Stable sigmoid at extreme values; no probability clipping or invented values.
            p = 1 / (1 + math.exp(-logit)) if logit >= 0 else math.exp(logit) / (1 + math.exp(logit))
            outputs.append([1 - p, p])
        return np.asarray(outputs, dtype=float)


@lru_cache(maxsize=1)
def vessel_resources():
    try:
        meta = json.loads((ARTIFACTS / "quick_vessels_v5_metadata.json").read_text())
        models = {}
        for key in ("LAD", "LCX", "RCA"):
            entry = meta["targets"][key]
            portable = entry.get("portable_model")
            if portable:
                models[key] = PortableLogistic(json.loads((ARTIFACTS / portable).read_text()))
            else:
                models[key] = joblib.load(ARTIFACTS / entry["model"])
        return meta, models
    except (FileNotFoundError, OSError) as exc:
        raise HTTPException(503, "Quick vessel model files missing. Install CardioVision Quick4 Upgrade.") from exc


def vessel_drivers(model, patient: pd.DataFrame, reference: pd.DataFrame, max_items=5) -> dict:
    """Model-agnostic reference substitution, NOT SHAP or a causal explanation."""
    idx = list(model.classes_).index(1)
    current = float(model.predict_proba(patient)[0, idx])
    effects = []
    for field in patient.columns:
        population_column = reference[field]
        typical = (float(population_column.median()) if pd.api.types.is_numeric_dtype(population_column)
                   else str(population_column.mode().iloc[0]))
        comparison = patient.copy()
        comparison.loc[comparison.index[0], field] = typical
        alternate = float(model.predict_proba(comparison)[0, idx])
        effects.append({"feature": field, "contribution": round(current - alternate, 5)})
    effects.sort(key=lambda d: abs(d["contribution"]), reverse=True)
    return {"method": "One-feature reference substitution (not SHAP)",
            "unit": "change in model probability vs dataset reference",
            "interpretation": "This explains how changing one input affects the model relative to a reference value; it does not establish causation.",
            "drivers": effects[:max_items]}


@router.get("/schema")
def get_schema():
    meta, _ = resources()
    vessel_meta, _ = vessel_resources()
    return {
        "mode": "10-question coronary assessment",
        "target": "CAD + LAD + LCX + RCA",
        "visible_questions": len(INPUT_FIELDS),
        "input_fields": INPUT_FIELDS,
        "model_version": meta["model_version"],
        "vessel_model_version": "quick-v5-four-targets",
        "vessel_validation": {t: vessel_meta["targets"][t]["holdout"] for t in ("LAD", "LCX", "RCA")},
    }

@router.post("/predict")
def predict_quick(body: QuickRequest):
    meta, model = resources()
    vessel_meta, vessel_models = vessel_resources()
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
            if name in {"DM", "HTN", "Current Smoker"} and value not in [0, 1]:
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
    explanations = {"CAD": explanation}
    predictions = {"CAD": {
        "predicted_class": int(probability >= .5),
        "predicted_label": "CAD" if probability >= .5 else "Normal",
        "positive_probability": round(probability, 5),
        "positive_class": "CAD",
        "model_type": meta["algorithm"],
    }}
    for target, vessel_model in vessel_models.items():
        index = list(vessel_model.classes_).index(1)
        score = float(vessel_model.predict_proba(x)[0, index])
        predictions[target] = {
            "predicted_class": int(score >= .5),
            "predicted_label": "Stenotic" if score >= .5 else "Normal",
            "positive_probability": round(score, 5),
            "positive_class": "Stenotic",
            "model_type": vessel_meta["targets"][target]["algorithm"],
        }
        explanations[target] = vessel_drivers(vessel_model, x, train)
    cohort = patient_cohort(float(raw["Age"]), raw, quick=False)
    return {
        "mode": "quick_cad", "target": "CAD",
        "predicted_label": "CAD" if probability >= .5 else "Normal",
        "positive_probability": round(probability, 5),
        "model_version": meta["model_version"],
        "model_method": meta["algorithm"],
        "xai": explanation,
        "cohort": cohort,
        "predictions": predictions,
        "explanations": explanations,
        "vessel_results_available": True,
        "vessel_validation": {
            target: vessel_meta["targets"][target]["holdout"]
            for target in ("LAD", "LCX", "RCA")
        },
        "probability_note": "Four independent model scores from ten questions. No external validation or clinical calibration. Scores are not angiographic stenosis percentages.",
        "disclaimer": "Prototype model estimate only; not independently validated as a diagnostic or population-screening test.",
    }

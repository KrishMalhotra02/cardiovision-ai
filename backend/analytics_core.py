"""Shared CardioVision analytics — no treatment recommendations or patient persistence."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "raw" / "dataset.xlsx"
TARGETS = {"CAD": "Cath", "LAD": "LAD", "LCX": "LCX", "RCA": "RCA"}
POSITIVE = {"CAD": "CAD", "LAD": "Stenotic", "LCX": "Stenotic", "RCA": "Stenotic"}
FORBIDDEN = set(TARGETS.values())

@lru_cache(maxsize=1)
def dataset() -> pd.DataFrame:
    df = pd.read_excel(DATA)
    if len(df) < 100 or not {"Age", "BMI", "BP", "PR", "Cath", "LAD", "LCX", "RCA"}.issubset(df.columns):
        raise RuntimeError("Unexpected CardioVision dataset schema")
    return df


def patient_cohort(age: float, features: dict[str, Any], quick: bool = False) -> dict:
    """Descriptive, referral-dataset cohort. Never used as a causal or diagnosis claim."""
    if not np.isfinite(age) or age < 0 or age > 120:
        raise ValueError("Age must be between 0 and 120")
    df = dataset()
    low = (int(age) // 10) * 10
    high = low + 9
    group = df.loc[df["Age"].between(low, high)]
    enough = len(group) >= 10
    result = {
        "age_band": f"{low}–{high}",
        "reference": "Z-Alizadeh Sani Extension dataset: patients evaluated for CAD (not the general population)",
        "sample_size": int(len(group)),
        "sufficient_sample": enough,
        "minimum_sample": 10,
        "measurements": [],
        "condition_prevalence": [],
        "observed_labels": [],
    }
    if not enough:
        result["message"] = "Too few dataset records in this age band to show meaningful cohort summaries."
        return result

    for field, label, unit in [("BMI", "BMI", "kg/m²"), ("BP", "Blood pressure", "mmHg"), ("PR", "Pulse rate", "beats/min")]:
        if field in features:
            value = float(features[field])
            result["measurements"].append({
                "feature": field, "label": label, "unit": unit,
                "patient": round(value, 2), "cohort_mean": round(float(group[field].mean()), 2),
                "cohort_median": round(float(group[field].median()), 2),
            })
    for field, label in [("DM", "Diabetes"), ("HTN", "Hypertension"), ("Current Smoker", "Current smoking")]:
        if field in features:
            result["condition_prevalence"].append({
                "feature": field, "label": label,
                "patient": bool(float(features[field]) == 1),
                "cohort_percent": round(float((group[field] == 1).mean() * 100), 1),
            })
    for target in (["CAD"] if quick else ["CAD", "LAD", "LCX", "RCA"]):
        positive = (group[TARGETS[target]] == POSITIVE[target]).sum()
        result["observed_labels"].append({
            "target": target, "positive_count": int(positive),
            "positive_percent": round(float(positive / len(group) * 100), 1),
        })
    result["message"] = "Descriptive comparison within a small, clinically selected dataset; not a population norm or a patient-specific risk estimate."
    return result


def transformed_feature_names(preprocessor, original_columns: list[str]) -> list[str]:
    """Map one-hot coordinates to original inputs for human-readable attributions."""
    raw = list(preprocessor.get_feature_names_out())
    categories = [c for c in original_columns if c in getattr(preprocessor, "feature_names_in_", [])]
    output = []
    for name in raw:
        suffix = name.split("__", 1)[-1]
        # Longest match resolves 'Current Smoker' vs 'Smoker' etc.
        matched = next((col for col in sorted(categories, key=len, reverse=True) if suffix == col or suffix.startswith(col + "_")), suffix)
        output.append(matched)
    return output


def _matrix(x) -> np.ndarray:
    return np.asarray(x.toarray() if hasattr(x, "toarray") else x, dtype=float)


def explain_case(model, patient: pd.DataFrame, training_features: pd.DataFrame, max_items: int = 7) -> dict:
    """Local feature attributions. SHAP for supported models, transparent fallback.

    Positive and negative SHAP values are *changes in model log-odds* for
    linear logistic regression; tree models use native model output units
    (RF probability scale; GB raw log-odds by default). Do not compare units
    across models or present them as causal findings.
    """
    prep = model.named_steps["preprocessor"]
    clf = model.named_steps["classifier"]
    names = list(patient.columns)
    grouped: dict[str, float] = {}
    method = ""
    unit = ""
    try:
        import shap
        matrix = _matrix(prep.transform(patient))
        if type(clf).__name__ == "LogisticRegression":
            rng = np.random.default_rng(42)
            subset = training_features.iloc[rng.choice(len(training_features), size=min(70, len(training_features)), replace=False)]
            reference = _matrix(prep.transform(subset))
            explainer = shap.LinearExplainer(clf, reference)
            values = np.asarray(explainer(matrix).values)[0]
            unit = "log-odds contribution"
            method = "SHAP LinearExplainer"
        elif type(clf).__name__ in {"RandomForestClassifier", "ExtraTreesClassifier", "GradientBoostingClassifier"}:
            explainer = shap.TreeExplainer(clf)
            values = np.asarray(explainer(matrix).values)
            if values.ndim == 3:
                values = values[0, :, 1]
                unit = "model probability contribution"
            elif values.ndim == 2:
                values = values[0]
                unit = "raw-model-output contribution"
            else:
                raise ValueError("Unexpected SHAP shape")
            method = "SHAP TreeExplainer"
        else:
            raise ValueError("No efficient stable SHAP explainer for this classifier")
        mapped = transformed_feature_names(prep, names)
        if len(values) != len(mapped):
            raise ValueError("SHAP output-feature mismatch")
        for name, impact in zip(mapped, values):
            grouped[name] = grouped.get(name, 0.0) + float(impact)
    except Exception:
        # Model-agnostic local reference substitution. This is NOT SHAP.
        # It compares the present prediction with counterfactual values drawn
        # from the observed training data, without asserting causality.
        current = float(model.predict_proba(patient)[0, list(model.classes_).index(1)])
        reference = {}
        for name in names:
            col = training_features[name]
            reference[name] = float(col.median()) if pd.api.types.is_numeric_dtype(col) else str(col.mode().iloc[0])
        for name in names:
            modified = patient.copy()
            modified.loc[modified.index[0], name] = reference[name]
            cf = float(model.predict_proba(modified)[0, list(model.classes_).index(1)])
            grouped[name] = current - cf
        method = "One-feature reference substitution (not SHAP)"
        unit = "change in model probability vs reference"
    ranked = sorted(grouped.items(), key=lambda it: abs(it[1]), reverse=True)[:max_items]
    return {
        "method": method,
        "unit": unit,
        "interpretation": "Local model contribution compared with a reference; not proof of cause, protection or a clinical risk factor.",
        "drivers": [{"feature": k, "contribution": round(v, 5)} for k, v in ranked],
    }

import os

from pathlib import Path
from math import isfinite

import joblib
import pandas as pd

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


# ---------------------------------------
# 1. PROJECT CONFIGURATION
# ---------------------------------------

ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / "backend" / "models"
DATA_PATH = ROOT / "data" / "raw" / "dataset.xlsx"

TARGET_COLUMNS = {"Cath", "LAD", "LCX", "RCA"}

TARGETS = {
    "CAD": "CAD",
    "LAD": "Stenotic",
    "LCX": "Stenotic",
    "RCA": "Stenotic",
}

DISCLAIMER = (
    "Educational and research prototype only. "
    "Not a clinical diagnosis or substitute for "
    "professional medical evaluation. "
    "Predicted probabilities are not clinically validated."
)


# ---------------------------------------
# 2. CREATE THE APPLICATION
# ---------------------------------------

app = FastAPI(
    title="CardioVision AI API",
    description="Cardiovascular prediction research prototype",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://cardiovision-ai-alpha.vercel.app",
        *[
            origin.strip()
            for origin in os.getenv(
                "CARDIO_ALLOWED_ORIGINS", ""
            ).split(",")
            if origin.strip()
        ],
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# ---------------------------------------
# 3. LOAD DATASET SCHEMA
# ---------------------------------------

df = pd.read_excel(DATA_PATH)

# Exclude all four target columns from the input.
X = df.drop(columns=list(TARGET_COLUMNS))

FEATURE_NAMES = X.columns.tolist()

assert len(FEATURE_NAMES) == 55

assert not TARGET_COLUMNS.intersection(FEATURE_NAMES)

NUMERIC_FEATURES = set(
    X.select_dtypes(include="number").columns
)

CATEGORICAL_FEATURES = set(FEATURE_NAMES) - NUMERIC_FEATURES

CATEGORY_OPTIONS = {
    column: sorted(
        X[column].dropna().astype(str).unique().tolist()
    )
    for column in CATEGORICAL_FEATURES
}


# ---------------------------------------
# 4. LOAD TRAINED MODEL PIPELINES
# ---------------------------------------

MODELS = {}

for name in TARGETS:
    model_path = MODEL_DIR / f"{name.lower()}_candidate.joblib"

    model = joblib.load(model_path)

    expected_columns = list(
        model.named_steps["preprocessor"].feature_names_in_
    )

    if expected_columns != FEATURE_NAMES:
        raise RuntimeError(
            f"Feature schema mismatch for {name}"
        )

    MODELS[name] = model


# ---------------------------------------
# 5. DEFINE REQUEST FORMAT
# ---------------------------------------

class PredictionRequest(BaseModel):
    features: dict[str, object] = Field(
        description="55 clinical features required for inference"
    )


# ---------------------------------------
# 6. VALIDATE INPUT
# ---------------------------------------

def validate_features(values: dict) -> pd.DataFrame:

    received = set(values)
    expected = set(FEATURE_NAMES)

    missing = sorted(expected - received)
    unknown = sorted(received - expected)

    if missing or unknown:
        raise HTTPException(
            status_code=422,
            detail={
                "missing_features": missing,
                "unknown_features": unknown,
            },
        )

    clean = {}

    for name in FEATURE_NAMES:
        value = values[name]

        if name in NUMERIC_FEATURES:
            if (
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not isfinite(value)
            ):
                raise HTTPException(
                    status_code=422,
                    detail=f"{name} must be a finite number",
                )

            clean[name] = float(value)

        else:
            if (
                not isinstance(value, str)
                or value not in CATEGORY_OPTIONS[name]
            ):
                raise HTTPException(
                    status_code=422,
                    detail={
                        "feature": name,
                        "allowed_values": CATEGORY_OPTIONS[name],
                    },
                )

            clean[name] = value

    # Preserve exactly the expected feature order.
    return pd.DataFrame([clean], columns=FEATURE_NAMES)


# ---------------------------------------
# 7. API ENDPOINTS
# ---------------------------------------

@app.get("/")
def home():
    return {
        "application": "CardioVision AI",
        "version": "0.1.0",
        "documentation": "/docs",
        "disclaimer": DISCLAIMER,
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "loaded_models": list(MODELS.keys()),
        "feature_count": len(FEATURE_NAMES),
    }


@app.get("/api/features")
def feature_schema():

    features = []

    for name in FEATURE_NAMES:
        if name in NUMERIC_FEATURES:
            features.append({
                "name": name,
                "type": "numeric",
                "observed_min": float(X[name].min()),
                "observed_max": float(X[name].max()),
            })
        else:
            features.append({
                "name": name,
                "type": "categorical",
                "options": CATEGORY_OPTIONS[name],
            })

    return {
        "feature_count": len(features),
        "features": features,
    }


@app.get("/api/demo-case")
def demo_case():
    # An anonymized dataset-derived example.
    # This is not a new patient or independent validation.
    return {
        "source": "Dataset-derived demonstration record",
        "features": X.iloc[0].to_dict(),
    }


@app.post("/api/predict")
def predict(request: PredictionRequest):

    patient = validate_features(request.features)

    predictions = {}

    for name, model in MODELS.items():

        predicted_class = int(model.predict(patient)[0])

        class_ids = list(model.classes_)
        positive_index = class_ids.index(1)

        positive_probability = float(
            model.predict_proba(patient)[0][positive_index]
        )

        predicted_label = (
            TARGETS[name]
            if predicted_class == 1
            else "Normal"
        )

        predictions[name] = {
            "predicted_class": predicted_class,
            "predicted_label": predicted_label,
            "positive_probability": round(
                positive_probability, 4
            ),
            "positive_class": TARGETS[name],
            "model_type": type(
                model.named_steps["classifier"]
            ).__name__,
        }

    return {
        "predictions": predictions,
        "probability_note": (
            "Model-estimated probabilities; "
            "not clinically calibrated or validated."
        ),
        "disclaimer": DISCLAIMER,
    }
from backend.quick_api import router as quick_router

app.include_router(quick_router)
# CardioVision V4 analytics endpoints
from backend.analytics_api import router as analytics_router
app.include_router(analytics_router)

# Optional connected-care research/demo workspace (no model changes)
from backend.care_api import router as care_router
app.include_router(care_router)

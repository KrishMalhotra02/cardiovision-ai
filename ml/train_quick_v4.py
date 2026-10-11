"""Reproducible 10-question CAD research classifier.

Feature set fixed BEFORE modeling: no Function Class, no ECG or echo required.
Compare regularized logistic regression and a conservative random forest.
Use nested CV to report internal discrimination; refit final prototype on all records.
"""
from __future__ import annotations

import json
from pathlib import Path
import argparse
import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, balanced_accuracy_score, recall_score
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.impute import SimpleImputer

RAW_FEATURES = [
    "Age", "Sex", "BMI", "DM", "HTN", "Current Smoker",
    "Typical Chest Pain", "Atypical", "Nonanginal", "Dyspnea", "BP", "PR"
]
CATEGORICAL = ["Sex", "Atypical", "Nonanginal", "Dyspnea"]
NUMERIC = [x for x in RAW_FEATURES if x not in CATEGORICAL]
TARGET_COLUMNS = {"Cath", "LAD", "LCX", "RCA"}


def candidates():
    return {
        "Regularized logistic regression": LogisticRegression(
            max_iter=1500, C=0.5, random_state=42
        ),
        "Conservative random forest": RandomForestClassifier(
            n_estimators=200, min_samples_leaf=4, max_depth=6,
            max_features="sqrt", n_jobs=1, random_state=42
        ),
    }


def pipeline(estimator):
    pre = ColumnTransformer([
        ("numeric", Pipeline([
            ("impute", SimpleImputer(strategy="median")),
            ("scale", StandardScaler()),
        ]), NUMERIC),
        ("categorical", Pipeline([
            ("impute", SimpleImputer(strategy="most_frequent")),
            ("encode", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ]), CATEGORICAL),
    ], remainder="drop", verbose_feature_names_out=False)
    return Pipeline([("preprocessor", pre), ("classifier", estimator)])


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--data", default="data/raw/dataset.xlsx")
    p.add_argument("--out", default="backend/models/quick_v4")
    args = p.parse_args()
    path = Path(args.data)
    df = pd.read_csv(path) if path.suffix.lower() == ".csv" else pd.read_excel(path)
    if not set(RAW_FEATURES + ["Cath"]).issubset(df.columns):
        raise ValueError("Expected clinical columns missing")
    if set(RAW_FEATURES) & TARGET_COLUMNS:
        raise ValueError("Target leakage detected")
    if df[RAW_FEATURES].isna().any().any() or df["Cath"].isna().any():
        raise ValueError("Unexpected missing values: audit before training")
    if set(df["Cath"].unique()) != {"CAD", "Normal"}:
        raise ValueError("Unexpected CAD target encoding")
    if not df["Sex"].isin(["Male", "Fmale"]).all():
        raise ValueError("Unexpected sex label encoding")
    for field in ["Atypical", "Nonanginal", "Dyspnea"]:
        if not df[field].isin(["Y", "N"]).all():
            raise ValueError(f"Unexpected labels in {field}")

    X = df[RAW_FEATURES].copy()
    y = df["Cath"].eq("CAD").astype(int)
    outer = StratifiedKFold(n_splits=5, shuffle=True, random_state=2026)
    scores = np.zeros(len(y))
    selected_per_fold = []
    fold_results = []

    for fold, (train_idx, valid_idx) in enumerate(outer.split(X, y), start=1):
        Xtr, Xvl = X.iloc[train_idx], X.iloc[valid_idx]
        ytr, yvl = y.iloc[train_idx], y.iloc[valid_idx]
        inner = StratifiedKFold(n_splits=3, shuffle=True, random_state=100+fold)
        ranking = []
        for name, algo in candidates().items():
            cv_scores = cross_val_score(pipeline(algo), Xtr, ytr, cv=inner, scoring="roc_auc", n_jobs=1)
            ranking.append((float(np.mean(cv_scores)), name))
        inner_auc, winner = max(ranking)
        mdl = pipeline(candidates()[winner]).fit(Xtr, ytr)
        fold_probability = mdl.predict_proba(Xvl)[:, 1]
        scores[valid_idx] = fold_probability
        selected_per_fold.append(winner)
        fold_results.append({
            "fold": fold, "selected_algorithm": winner,
            "inner_auc": round(inner_auc, 4),
            "outer_auc": round(float(roc_auc_score(yvl, fold_probability)), 4),
            "outer_balanced_accuracy": round(float(balanced_accuracy_score(yvl, fold_probability >= .5)), 4),
            "outer_recall": round(float(recall_score(yvl, fold_probability >= .5)), 4),
        })
        print(f"Fold {fold}: {winner}, outer AUC={fold_results[-1]['outer_auc']}", flush=True)

    nested_auc = float(roc_auc_score(y, scores))
    full_cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=27)
    all_rankings = {}
    for name, algo in candidates().items():
        cv_scores = cross_val_score(pipeline(algo), X, y, cv=full_cv, scoring="roc_auc", n_jobs=1)
        all_rankings[name] = float(np.mean(cv_scores))
    selected_algo = max(all_rankings, key=all_rankings.get)
    final_model = pipeline(candidates()[selected_algo]).fit(X, y)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    joblib.dump(final_model, out / "quick_cad_v4.joblib")
    pd.DataFrame(fold_results).to_csv(out / "nested_cv_folds.csv", index=False)
    artifact = {
        "model_version": "quick-v4-10-questions",
        "question_count": 10,
        "features": RAW_FEATURES,
        "algorithm": selected_algo,
        "selected_by_full_data_cv": all_rankings,
        "nested_out_of_fold_auc": round(nested_auc, 4),
        "nested_mean_fold_auc": round(float(np.mean([r['outer_auc'] for r in fold_results])), 4),
        "sample_size": len(df),
        "positive_class": "CAD",
        "training_positive_records": int(y.sum()),
        "negative_records": int((1-y).sum()),
        "raw_feature_count": len(RAW_FEATURES),
        "note": "All metrics are internal dataset estimates. Final artifact refit on all 303 rows for demo; no external clinical validation or calibration.",
    }
    (out / "quick_v4_metadata.json").write_text(json.dumps(artifact, indent=2))
    print("\nSELECTED ALGORITHM", selected_algo)
    print("NESTED OUT-OF-FOLD ROC-AUC", round(nested_auc, 4))
    print("FINAL INPUT COLUMNS", RAW_FEATURES)
    print("ARTIFACTS", out.resolve())

if __name__ == "__main__":
    main()

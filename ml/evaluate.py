
from pathlib import Path

import joblib
import pandas as pd

from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    confusion_matrix,
    brier_score_loss,
)
from sklearn.model_selection import train_test_split


ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data/raw/dataset.xlsx"
MODEL_DIR = ROOT / "backend/models"

df = pd.read_excel(DATA_PATH)

TARGETS = {
    "CAD": ("Cath", "CAD"),
    "LAD": ("LAD", "Stenotic"),
    "LCX": ("LCX", "Stenotic"),
    "RCA": ("RCA", "Stenotic"),
}

FORBIDDEN = ["Cath", "LAD", "LCX", "RCA"]
X = df.drop(columns=FORBIDDEN)

assert not set(FORBIDDEN).intersection(X.columns)

results = []

for name, (column, positive_label) in TARGETS.items():

    # Reconstruct exactly the same split used during training.
    y = (df[column] == positive_label).astype(int)

    _, X_test, _, y_test = train_test_split(
        X,
        y,
        test_size=0.20,
        random_state=42,
        stratify=y,
    )

    path = MODEL_DIR / f"{name.lower()}_candidate.joblib"
    model = joblib.load(path)

    # Verify that the model expects the correct features.
    expected_features = list(
        model.named_steps["preprocessor"].feature_names_in_
    )

    if expected_features != X.columns.tolist():
        raise ValueError(f"Feature mismatch for {name}")

    predictions = model.predict(X_test)
    probabilities = model.predict_proba(X_test)[:, 1]

    matrix = confusion_matrix(
        y_test, predictions, labels=[0, 1]
    )

    tn, fp, fn, tp = matrix.ravel()

    result = {
        "Target": name,
        "Test_Count": len(y_test),
        "Accuracy": accuracy_score(y_test, predictions),
        "Precision": precision_score(
            y_test, predictions, zero_division=0
        ),
        "Recall": recall_score(
            y_test, predictions, zero_division=0
        ),
        "F1": f1_score(
            y_test, predictions, zero_division=0
        ),
        "ROC_AUC": roc_auc_score(
            y_test, probabilities
        ),
        "Brier_Score": brier_score_loss(
            y_test, probabilities
        ),
        "TN": int(tn),
        "FP": int(fp),
        "FN": int(fn),
        "TP": int(tp),
    }

    results.append(result)

    print(f"\n========== {name} ==========")
    print(f"Accuracy:  {result['Accuracy']:.3f}")
    print(f"Precision: {result['Precision']:.3f}")
    print(f"Recall:    {result['Recall']:.3f}")
    print(f"F1:        {result['F1']:.3f}")
    print(f"ROC-AUC:   {result['ROC_AUC']:.3f}")
    print(f"Brier:     {result['Brier_Score']:.3f}")
    print("Confusion matrix:")
    print(matrix)

results_df = pd.DataFrame(results)

output = MODEL_DIR / "candidate_test_metrics.csv"
results_df.to_csv(output, index=False)

print("\n========== FINAL EVALUATION ==========")
print(results_df.to_string(index=False))
print(f"\nSaved evaluation report: {output}")

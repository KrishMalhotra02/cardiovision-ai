
from pathlib import Path

import joblib
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    confusion_matrix,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


# --------------------------------------------------
# 1. FILE PATHS
# --------------------------------------------------

ROOT = Path(__file__).resolve().parent.parent

DATA_PATH = ROOT / "data" / "raw" / "dataset.xlsx"

MODEL_DIR = ROOT / "backend" / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)


# --------------------------------------------------
# 2. LOAD DATASET
# --------------------------------------------------

df = pd.read_excel(DATA_PATH)

print("Dataset loaded:", df.shape)


# --------------------------------------------------
# 3. DEFINE TARGETS
# --------------------------------------------------

TARGETS = {
    "CAD": ("Cath", "CAD"),
    "LAD": ("LAD", "Stenotic"),
    "LCX": ("LCX", "Stenotic"),
    "RCA": ("RCA", "Stenotic"),
}

FORBIDDEN = {"Cath", "LAD", "LCX", "RCA"}

# Remove every target column from the inputs.
X = df.drop(columns=list(FORBIDDEN))

# Safety check against target leakage.
assert not FORBIDDEN.intersection(X.columns)

print("Number of input features:", X.shape[1])


# --------------------------------------------------
# 4. IDENTIFY FEATURE TYPES
# --------------------------------------------------

numeric_features = X.select_dtypes(
    include=["number"]
).columns.tolist()

categorical_features = X.select_dtypes(
    exclude=["number"]
).columns.tolist()

print("Numeric features:", len(numeric_features))
print("Categorical features:", len(categorical_features))


# --------------------------------------------------
# 5. BUILD PREPROCESSING PIPELINE
# --------------------------------------------------

numeric_pipeline = Pipeline([
    ("imputer", SimpleImputer(strategy="median")),
    ("scaler", StandardScaler()),
])

categorical_pipeline = Pipeline([
    ("imputer", SimpleImputer(strategy="most_frequent")),
    ("encoder", OneHotEncoder(handle_unknown="ignore")),
])

preprocessor = ColumnTransformer([
    ("numeric", numeric_pipeline, numeric_features),
    ("categorical", categorical_pipeline, categorical_features),
])


# --------------------------------------------------
# 6. TRAIN FOUR CLASSIFIERS
# --------------------------------------------------

results = []

for model_name, (target_column, positive_label) in TARGETS.items():

    print(f"\n{'=' * 45}")
    print(f"TRAINING: {model_name}")
    print(f"{'=' * 45}")

    # Convert target labels into binary values.
    # Positive = 1, Negative = 0.
    allowed_labels = (
        {"CAD", "Normal"}
        if model_name == "CAD"
        else {"Stenotic", "Normal"}
    )

    actual_labels = set(df[target_column].dropna().unique())

    if actual_labels != allowed_labels or df[target_column].isna().any():
        raise ValueError(
            f"Unexpected labels in {target_column}: {actual_labels}"
        )

    y = (df[target_column] == positive_label).astype(int)

    # Keep 20% of records for final testing.
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.20,
        random_state=42,
        stratify=y,
    )

    # Each model gets its own preprocessing pipeline.
    model = Pipeline([
        ("preprocessor", preprocessor),
        ("classifier", LogisticRegression(
            max_iter=2000,
            class_weight="balanced",
        )),
    ])

    # Learn only from the training data.
    model.fit(X_train, y_train)

    # Predict on unseen test records.
    y_pred = model.predict(X_test)

    # Probability of positive class.
    y_prob = model.predict_proba(X_test)[:, 1]

    metrics = {
        "Model": model_name,
        "Accuracy": accuracy_score(y_test, y_pred),
        "Precision": precision_score(
            y_test, y_pred, zero_division=0
        ),
        "Recall": recall_score(
            y_test, y_pred, zero_division=0
        ),
        "F1": f1_score(
            y_test, y_pred, zero_division=0
        ),
        "ROC_AUC": roc_auc_score(y_test, y_prob),
    }

    results.append(metrics)

    print("\nMetrics:")
    for key, value in metrics.items():
        print(f"{key}: {value}")

    print("\nConfusion Matrix:")
    print(confusion_matrix(y_test, y_pred))

    # Save the complete fitted pipeline.
    model_path = MODEL_DIR / f"{model_name.lower()}_model.joblib"
    joblib.dump(model, model_path)

    print(f"\nSaved: {model_path}")




results_df = pd.DataFrame(results)

results_path = MODEL_DIR / "evaluation_metrics.csv"
results_df.to_csv(results_path, index=False)

print("\n=== FINAL MODEL COMPARISON ===")
print(results_df.to_string(index=False))

print("\nAll four baseline models trained successfully.")

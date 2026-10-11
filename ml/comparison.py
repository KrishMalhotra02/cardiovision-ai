
from pathlib import Path

import joblib
import pandas as pd

from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import (
    RandomForestClassifier,
    ExtraTreesClassifier,
    GradientBoostingClassifier,
)
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import (
    train_test_split,
    StratifiedKFold,
    cross_validate,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.svm import SVC


# 1. Load our dataset
ROOT = Path(__file__).resolve().parent.parent
df = pd.read_excel(ROOT / "data/raw/dataset.xlsx")

MODEL_DIR = ROOT / "backend/models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# 2. Define the prediction problems
TARGETS = {
    "CAD": ("Cath", "CAD"),
    "LAD": ("LAD", "Stenotic"),
    "LCX": ("LCX", "Stenotic"),
    "RCA": ("RCA", "Stenotic"),
}

FORBIDDEN = {"Cath", "LAD", "LCX", "RCA"}

# Normalize column names for safety checking.
assert FORBIDDEN.issubset(set(df.columns))
X = df.drop(columns=list(FORBIDDEN))

assert not {
    column.strip().lower() for column in X.columns
}.intersection({
    name.lower() for name in FORBIDDEN
})

numeric = X.select_dtypes(include="number").columns.tolist()
categorical = X.select_dtypes(exclude="number").columns.tolist()

# 3. Preprocessing: this stays INSIDE every pipeline
preprocessor = ColumnTransformer([
    ("numeric", Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
    ]), numeric),

    ("categorical", Pipeline([
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("encoder", OneHotEncoder(
            handle_unknown="ignore",
            sparse_output=False,
        )),
    ]), categorical),
])

# 4. Candidate algorithms
ALGORITHMS = {
    "Logistic Regression": LogisticRegression(
        max_iter=2000,
        class_weight="balanced",
    ),
    "Random Forest": RandomForestClassifier(
        n_estimators=150,
        min_samples_leaf=3,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    ),
    "Extra Trees": ExtraTreesClassifier(
        n_estimators=150,
        min_samples_leaf=3,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    ),
    "SVM RBF": SVC(
        kernel="rbf",
        C=1.0,
        class_weight="balanced",
        probability=True,
        random_state=42,
    ),
    "Gradient Boosting": GradientBoostingClassifier(
        n_estimators=100,
        learning_rate=0.05,
        max_depth=2,
        random_state=42,
    ),
}

# 5. Five-fold cross-validation
cv = StratifiedKFold(
    n_splits=5,
    shuffle=True,
    random_state=42,
)

all_results = []

for target_name, (column, positive_label) in TARGETS.items():

    print(f"\n========== {target_name} ==========")

    expected = (
        {"CAD", "Normal"}
        if target_name == "CAD"
        else {"Stenotic", "Normal"}
    )

    if (
        set(df[column].dropna().unique()) != expected
        or df[column].isna().any()
    ):
        raise ValueError(f"Unexpected labels in {column}")

    y = (df[column] == positive_label).astype(int)

    # Preserve the same outer split as the baseline.
    X_train, X_test, y_train, y_test = train_test_split(
        X, y,
        test_size=0.20,
        random_state=42,
        stratify=y,
    )

    best_auc = float("-inf")
    best_name = None
    best_pipeline = None

    for algorithm_name, classifier in ALGORITHMS.items():

        pipeline = Pipeline([
            ("preprocessor", clone(preprocessor)),
            ("classifier", clone(classifier)),
        ])

        scores = cross_validate(
            pipeline,
            X_train,
            y_train,
            cv=cv,
            scoring={
                "auc": "roc_auc",
                "f1": "f1",
                "recall": "recall",
                "accuracy": "accuracy",
            },
            error_score="raise",
            n_jobs=1,
        )

        mean_auc = scores["test_auc"].mean()
        mean_f1 = scores["test_f1"].mean()
        mean_recall = scores["test_recall"].mean()
        mean_accuracy = scores["test_accuracy"].mean()

        print(
            f"{algorithm_name:<22}"
            f"AUC={mean_auc:.3f} "
            f"F1={mean_f1:.3f} "
            f"Recall={mean_recall:.3f}"
        )

        all_results.append({
            "Target": target_name,
            "Algorithm": algorithm_name,
            "CV_AUC": mean_auc,
            "CV_AUC_Std": scores["test_auc"].std(),
            "CV_F1": mean_f1,
            "CV_Recall": mean_recall,
            "CV_Accuracy": mean_accuracy,
        })

        # Select by cross-validated ROC-AUC, not test score.
        if mean_auc > best_auc:
            best_auc = mean_auc
            best_name = algorithm_name
            best_pipeline = pipeline

    # Fit selected candidate on the full training portion.
    best_pipeline.fit(X_train, y_train)

    # Preserve original baseline model files.
    output = MODEL_DIR / f"{target_name.lower()}_candidate.joblib"
    joblib.dump(best_pipeline, output)

    print(f"\nSelected for {target_name}: {best_name}")
    print(f"Training CV ROC-AUC: {best_auc:.3f}")
    print(f"Saved candidate: {output.name}")

# 6. Save all cross-validation results
results = pd.DataFrame(all_results)

results.to_csv(
    MODEL_DIR / "comparison_results.csv",
    index=False,
)

print("\n========== MODEL COMPARISON ==========")
print(
    results.sort_values(
        ["Target", "CV_AUC"],
        ascending=[True, False],
    ).to_string(index=False)
)

print("\nComparison completed successfully.")

"""Train honest 10-question coronary-vessel prototype classifiers.

Output is *not clinically validated*: within the small clinically selected 303-row
Z-Alizadeh Sani Extension dataset, each vessel has an independently fitted model
using ONLY the 12 encoded variables supplied by the 10-question interface.

Per-target train/holdout split is stratified, and algorithm choice uses only the
training split's 5-fold CV; held-out metrics are never used to select the model.
Finally refit the selected algorithm on all dataset records for deployment.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.metrics import roc_auc_score, average_precision_score, accuracy_score, f1_score, recall_score, precision_score
from ml.train_quick_v4 import RAW_FEATURES, TARGET_COLUMNS, candidates, pipeline

POSITIVES = {"LAD":"Stenotic", "LCX":"Stenotic", "RCA":"Stenotic"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--data',default='data/raw/dataset.xlsx')
    parser.add_argument('--out',default='backend/models/quick_v4')
    args = parser.parse_args()
    df = pd.read_excel(args.data)
    assert df.shape[0] == 303
    assert not (set(RAW_FEATURES) & TARGET_COLUMNS), 'Target leakage detected'
    assert set(RAW_FEATURES).issubset(df.columns)
    if df[RAW_FEATURES].isna().any().any(): raise ValueError('Clinical predictors contain missing records')
    output = Path(args.out);output.mkdir(parents=True,exist_ok=True)
    all_meta = {"dataset":"Z-Alizadeh Sani Extension", "records":len(df),"questions":10,
                "features":RAW_FEATURES,"targets":{},
                "limitations":"Internal split only. No external clinical validation, calibration or subgroup reliability established. Probabilities are model scores, not measured stenosis."}
    X = df[RAW_FEATURES]
    for target, positive in POSITIVES.items():
        y = df[target].eq(positive).astype(int)
        if not df[target].isin([positive,'Normal']).all(): raise ValueError(f'Unexpected label in {target}')
        X_train, X_test, y_train, y_test = train_test_split(X,y,test_size=.2,random_state=2026,stratify=y)
        cv = StratifiedKFold(n_splits=5,shuffle=True,random_state=2026)
        comparisons = {}
        for name, model in candidates().items():
            result = cross_val_score(pipeline(model),X_train,y_train,cv=cv,scoring='roc_auc',n_jobs=1)
            comparisons[name] = round(float(result.mean()),4)
            print(target,name,'5-fold training AUC',comparisons[name],flush=True)
        selection = max(comparisons,key=comparisons.get)
        trained = pipeline(candidates()[selection]).fit(X_train,y_train)
        p = trained.predict_proba(X_test)[:,list(trained.classes_).index(1)]
        classification = (p>=.5).astype(int)
        metrics = {
            "roc_auc":round(float(roc_auc_score(y_test,p)),4),
            "pr_auc":round(float(average_precision_score(y_test,p)),4),
            "accuracy":round(float(accuracy_score(y_test,classification)),4),
            "precision":round(float(precision_score(y_test,classification,zero_division=0)),4),
            "recall":round(float(recall_score(y_test,classification,zero_division=0)),4),
            "f1":round(float(f1_score(y_test,classification,zero_division=0)),4),
            "holdout_n":len(y_test),
            "holdout_positive_n":int(y_test.sum()),
        }
        final = pipeline(candidates()[selection]).fit(X,y)
        filename = f'quick_{target.lower()}_v5.joblib'
        joblib.dump(final, output/filename,compress=3)
        portable_filename = f'quick_{target.lower()}_v5_portable.json'
        if selection == "Regularized logistic regression":
            pre = final.named_steps["preprocessor"]
            num = pre.named_transformers_["numeric"].named_steps["scale"]
            enc = pre.named_transformers_["categorical"].named_steps["encode"]
            classifier = final.named_steps["classifier"]
            schema = {
                "format": "standardized-onehot-logistic-v1",
                "numeric_features": [str(c) for c in pre.transformers_[0][2]],
                "numeric_mean": [float(x) for x in num.mean_],
                "numeric_scale": [float(x) for x in num.scale_],
                "categorical_features": [str(c) for c in pre.transformers_[1][2]],
                "categorical_categories": [[str(v) for v in categories] for categories in enc.categories_],
                "intercept": float(classifier.intercept_[0]),
                "coefficients": [float(c) for c in classifier.coef_[0]],
            }
            assert len(schema["coefficients"]) == len(schema["numeric_features"]) + sum(len(x) for x in schema["categorical_categories"])
            (output/portable_filename).write_text(json.dumps(schema, indent=2))
        else:
            portable_filename = None
        all_meta['targets'][target] = {"model":filename, "portable_model":portable_filename,"algorithm":selection,
            "positive_class":"Stenotic","positive_rate":round(float(y.mean()),4),
            "train_folds_roc_auc":comparisons,
            "holdout":metrics}
        print(target,'selected',selection,'held-out AUC',metrics['roc_auc'],flush=True)
    (output/'quick_vessels_v5_metadata.json').write_text(json.dumps(all_meta,indent=2))
    print('Wrote artifacts:',output,flush=True)

if __name__=='__main__':main()

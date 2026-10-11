import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score
import joblib
import os
import json

df = pd.read_excel('backend/data/dataset.xlsx')

targets = ['Cath', 'LAD', 'LCX', 'RCA']
drop_cols = ['Cath', 'LAD', 'LCX', 'RCA']
X = df.drop(columns=drop_cols)

# Identify numerical and categorical columns
numeric_features = X.select_dtypes(include=['int64', 'float64']).columns.tolist()
categorical_features = X.select_dtypes(include=['object']).columns.tolist()

# Define preprocessing
numeric_transformer = Pipeline(steps=[
    ('imputer', SimpleImputer(strategy='median')),
    ('scaler', StandardScaler())
])

categorical_transformer = Pipeline(steps=[
    ('imputer', SimpleImputer(strategy='most_frequent')),
    ('onehot', OneHotEncoder(handle_unknown='ignore'))
])

preprocessor = ColumnTransformer(
    transformers=[
        ('num', numeric_transformer, numeric_features),
        ('cat', categorical_transformer, categorical_features)
    ])

metrics_dict = {}

os.makedirs('backend/models', exist_ok=True)

# Train a model for each target
for target in targets:
    y = df[target]
    
    # Binarize target: 
    # For Cath: CAD -> 1, Normal -> 0
    # For LAD, LCX, RCA: Stenotic -> 1, Normal -> 0
    if target == 'Cath':
        y_bin = (y == 'CAD').astype(int)
    else:
        y_bin = (y == 'Stenotic').astype(int)
        
    X_train, X_test, y_train, y_test = train_test_split(X, y_bin, test_size=0.2, random_state=42, stratify=y_bin)
    
    clf = Pipeline(steps=[('preprocessor', preprocessor),
                          ('classifier', RandomForestClassifier(n_estimators=100, random_state=42))])
    
    clf.fit(X_train, y_train)
    y_pred = clf.predict(X_test)
    y_prob = clf.predict_proba(X_test)[:, 1] if len(np.unique(y_bin)) > 1 else np.zeros(len(y_test))
    
    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, zero_division=0)
    rec = recall_score(y_test, y_pred, zero_division=0)
    f1 = f1_score(y_test, y_pred, zero_division=0)
    
    try:
        roc = roc_auc_score(y_test, y_prob)
    except:
        roc = 0.5
        
    metrics_dict[target] = {
        'accuracy': float(acc),
        'precision': float(prec),
        'recall': float(rec),
        'f1': float(f1),
        'roc_auc': float(roc)
    }
    
    # Save the pipeline
    joblib.dump(clf, f'backend/models/{target}_model.joblib')

# Save schema for frontend/API
schema = {
    'numeric_features': numeric_features,
    'categorical_features': categorical_features
}
with open('backend/models/schema.json', 'w') as f:
    json.dump(schema, f)

with open('backend/models/metrics.json', 'w') as f:
    json.dump(metrics_dict, f)

print("Training completed. Metrics:", metrics_dict)

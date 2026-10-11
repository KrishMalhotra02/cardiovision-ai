from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, create_model
import joblib
import json
import pandas as pd
import numpy as np

app = FastAPI(title="CardioVision AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load models and schemas
models = {}
targets = ['Cath', 'LAD', 'LCX', 'RCA']
for t in targets:
    try:
        models[t] = joblib.load(f'backend/models/{t}_model.joblib')
    except Exception as e:
        print(f"Warning: Could not load model {t}: {e}")

with open('backend/models/schema.json', 'r') as f:
    schema = json.load(f)
with open('backend/models/metrics.json', 'r') as f:
    metrics = json.load(f)

# Create dynamic Pydantic model for input based on schema
fields = {}
for num_f in schema['numeric_features']:
    fields[num_f] = (float, 0.0)
for cat_f in schema['categorical_features']:
    fields[cat_f] = (str, "Unknown")
PatientInput = create_model('PatientInput', **fields)

@app.get("/health")
def health_check():
    return {"status": "ok", "models_loaded": list(models.keys())}

@app.get("/api/model-info")
def model_info():
    return {
        "metrics": metrics,
        "schema": schema,
        "features": schema['numeric_features'] + schema['categorical_features']
    }

@app.post("/api/predict")
def predict(patient: PatientInput):
    data = [patient.dict()]
    df = pd.DataFrame(data)
    
    results = {}
    explanations = {}
    
    for t in targets:
        if t not in models:
            continue
        model = models[t]
        
        # Predict
        prob = model.predict_proba(df)[0][1]
        pred_class = int(model.predict(df)[0])
        
        results[t] = {
            "probability": float(prob),
            "prediction": pred_class,
            "label": "Positive" if pred_class == 1 else "Negative"
        }
        
        # Explainability fallback: Random Forest feature importances
        # To make it "patient specific", we can just return the top features globally, 
        # or multiply global importance by the scaled patient feature.
        # Here we just provide the top global features for the model as a valid fallback.
        rf = model.named_steps['classifier']
        # get feature names from preprocessor
        try:
            cat_encoder = model.named_steps['preprocessor'].named_transformers_['cat'].named_steps['onehot']
            cat_features = cat_encoder.get_feature_names_out(schema['categorical_features'])
            all_features = schema['numeric_features'] + list(cat_features)
            importances = rf.feature_importances_
            
            # get top 5
            top_indices = np.argsort(importances)[::-1][:5]
            top_features = [{"feature": all_features[i], "importance": float(importances[i])} for i in top_indices]
            explanations[t] = top_features
        except:
            explanations[t] = []
            
    return {
        "predictions": results,
        "explanations": explanations
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

"""Leakage-safe nested validation and final reduced CAD model (CardioVision).
Run on Mac: python ml/train_reduced.py --xlsx data/raw/dataset.xlsx --out backend/models/quick_cad
Uses 303 existing patients; no external clinical validation is claimed.
"""
import argparse, csv, json, warnings
from pathlib import Path
from collections import Counter
import numpy as np
import joblib
from backend.quick_transformers import Interactions
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.feature_selection import mutual_info_classif
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score,recall_score,balanced_accuracy_score,precision_score,f1_score
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder,StandardScaler

SEED=42
FORBIDDEN={'Cath','LAD','LCX','RCA'}
HISTORY=['Age','Sex','BMI','DM','HTN','BP','PR','Current Smoker','EX-Smoker','FH','DLP','Obesity','Typical Chest Pain','Dyspnea','Atypical','Nonanginal','Function Class']
ECG=HISTORY+['Q Wave','St Elevation','St Depression','Tinversion','LVH']
ECHO=ECG+['EF-TTE','Region RWMA']
INTERACTIONS=[('Age','HTN'),('DM','HTN'),('Age','Typical Chest Pain'),('BMI','DM')]

def read_source(xlsx=None, csv_file=None):
    if csv_file:
        with open(csv_file,newline='') as f:raw=list(csv.reader(f))
        cols,rows=raw[0],raw[1:]
        for j in range(len(cols)):
            try:
                for r in rows:float(r[j])
                for r in rows:r[j]=float(r[j])
            except (ValueError,TypeError):pass
    else:
        import pandas as pd
        df=pd.read_excel(xlsx);cols=df.columns.tolist();rows=df.values.tolist()
    assert len(cols)==59 and len(rows)==303
    return cols,rows

def matrix(cols,rows,names):
    assert not set(names)&FORBIDDEN
    positions=[cols.index(n) for n in names]
    X=np.empty((len(rows),len(names)),dtype=object)
    for i,r in enumerate(rows):
        for j,p in enumerate(positions):X[i,j]=r[p]
    return X

def flags_for(cols,rows):
    return {c:all(isinstance(r[cols.index(c)],(int,float,np.integer,np.floating)) for r in rows) for c in cols if c not in FORBIDDEN}

def rank(X,y,names,flags):
    arr=np.zeros(X.shape,dtype=float); discrete=[]
    for j,c in enumerate(names):
        if flags[c]:
            z=np.array(X[:,j],dtype=float)
            z[~np.isfinite(z)]=np.nan
            if np.isnan(z).any():z[np.isnan(z)]=np.nanmedian(z)
            arr[:,j]=z
            discrete.append(len(np.unique(z))<=5)
        else:
            options=sorted(set(X[:,j]),key=str)
            lut={v:i for i,v in enumerate(options)}
            arr[:,j]=[lut[v] for v in X[:,j]]
            discrete.append(True)
    with warnings.catch_warnings():
        warnings.simplefilter('ignore',UserWarning)
        importance=mutual_info_classif(arr,y,discrete_features=np.array(discrete,dtype=bool),random_state=SEED)
    indices=sorted(range(len(names)),key=lambda j:(-importance[j],names[j]))
    return indices,importance


def make_model(selected,flags,algo,engineered):
    derived=[a+' × '+b for a,b in INTERACTIONS if engineered and a in selected and b in selected]
    names=list(selected)+derived
    number=[i for i,n in enumerate(names) if (n not in flags or flags[n])]
    category=[i for i,n in enumerate(names) if (n in flags and not flags[n])]
    prep=ColumnTransformer([
        ('number',Pipeline([('fill',SimpleImputer(strategy='median')),('scale',StandardScaler())]),number),
        ('category',Pipeline([('fill',SimpleImputer(strategy='most_frequent')),('ohe',OneHotEncoder(handle_unknown='ignore'))]),category)
    ])
    if algo=='LogisticRegression':cl=LogisticRegression(max_iter=3000,C=1.0,class_weight='balanced',random_state=SEED)
    elif algo=='RandomForest':cl=RandomForestClassifier(n_estimators=110,max_depth=6,min_samples_leaf=3,class_weight='balanced',random_state=SEED,n_jobs=1)
    elif algo=='GradientBoosting':cl=GradientBoostingClassifier(n_estimators=100,learning_rate=.05,max_depth=2,random_state=SEED)
    else:raise ValueError(algo)
    return Pipeline([('interactions',Interactions(selected,engineered)),('preprocessing',prep),('classifier',cl)])

def fit_predict(Xtr,ytr,Xvl,names,flags,config):
    k,algo,engineered=config
    ids=list(range(len(names))) if k=='all' else sorted(rank(Xtr,ytr,names,flags)[0][:k])
    selected=[names[j] for j in ids]
    fitted=make_model(selected,flags,algo,engineered)
    fitted.fit(Xtr[:,ids],ytr)
    proba=fitted.predict_proba(Xvl[:,ids])[:,1]
    return proba,selected,fitted

def score_options(X,y,names,flags,options,folds):
    scored=[]
    for config in options:
        values=[]
        for itr,ivl in folds:
            p,_,_=fit_predict(X[itr],y[itr],X[ivl],names,flags,config)
            values.append(roc_auc_score(y[ivl],p))
        scored.append((float(np.mean(values)),config))
    scored.sort(key=lambda x:(-x[0],x[1][0] if isinstance(x[1][0],int) else 99,x[1][2],x[1][1]!='LogisticRegression'))
    return scored

def save_csv(path,rows):
    with open(path,'w',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--xlsx',default='data/raw/dataset.xlsx')
    parser.add_argument('--csv',default=None)
    parser.add_argument('--out',default='backend/models/quick_cad')
    args=parser.parse_args()
    dest=Path(args.out);dest.mkdir(parents=True,exist_ok=True)
    cols,rows=read_source(args.xlsx,args.csv)
    all_features=[x for x in cols if x not in FORBIDDEN]
    flags=flags_for(cols,rows)
    y=np.array([int(r[cols.index('Cath')]=='CAD') for r in rows],dtype=int)
    # Raw-feature selection always occurs within each training split.
    quick_options=[(k,alg,eng) for k in (8,10,12) for alg in ('LogisticRegression','RandomForest') for eng in (False,True)]
    extra_options=[(k,alg,False) for k in (10,12) for alg in ('LogisticRegression','RandomForest')]
    full_options=[('all',alg,False) for alg in ('LogisticRegression','RandomForest','GradientBoosting')]
    tiers={'History_only':(HISTORY,quick_options),'History_plus_ECG':(ECG,extra_options),'History_ECG_Echo':(ECHO,extra_options),'All_55':(all_features,full_options)}
    outer=StratifiedKFold(n_splits=5,shuffle=True,random_state=SEED+4)
    inner=StratifiedKFold(n_splits=3,shuffle=True,random_state=SEED+9)
    records=[];rollup=[];selected_counts=Counter()
    print('Nested CV: raw feature selection happens INSIDE inner and outer training folds.',flush=True)
    for tier,(names,options) in tiers.items():
        X=matrix(cols,rows,names)
        fold_probs=np.zeros(len(y),dtype=float)
        for fold,(itr,ivl) in enumerate(outer.split(X,y),start=1):
            Xtrain,ytrain=X[itr],y[itr]
            candidates=score_options(Xtrain,ytrain,names,flags,options,list(inner.split(Xtrain,ytrain)))
            inner_auc,chosen=candidates[0]
            p,selected,_=fit_predict(Xtrain,ytrain,X[ivl],names,flags,chosen)
            fold_probs[ivl]=p
            selected_counts.update((tier,c) for c in selected)
            pred=(p>=.5).astype(int)
            fold_auc=float(roc_auc_score(y[ivl],p))
            records.append(dict(Tier=tier,Fold=fold,InnerCV_AUC=round(inner_auc,4),Outer_AUC=round(fold_auc,4),Outer_Recall=round(float(recall_score(y[ivl],pred)),4),Outer_BalancedAccuracy=round(float(balanced_accuracy_score(y[ivl],pred)),4),Questions=len(selected),Algorithm=chosen[1],Interactions=chosen[2],Selected='|'.join(selected)))
            print(f'  {tier} fold {fold}: outer AUC {fold_auc:.3f} | features={len(selected)} | {chosen[1]} | interactions={chosen[2]}',flush=True)
        row=[r for r in records if r['Tier']==tier]
        summary=dict(Tier=tier,Mean_Fold_AUC=round(float(np.mean([r['Outer_AUC'] for r in row])),4),Fold_AUC_SD=round(float(np.std([r['Outer_AUC'] for r in row])),4),Pooled_OOF_AUC=round(float(roc_auc_score(y,fold_probs)),4),Mean_Recall=round(float(np.mean([r['Outer_Recall'] for r in row])),4),Median_Questions=int(np.median([r['Questions'] for r in row])))
        rollup.append(summary)
        print('  Summary:',summary,flush=True)
    save_csv(dest/'nested_cv_folds.csv',records)
    save_csv(dest/'nested_cv_summary.csv',rollup)
    selected=[dict(Tier=t,Feature=f,Times_Selected=n) for (t,f),n in selected_counts.most_common()]
    save_csv(dest/'feature_selection_stability.csv',selected)

    # Final candidate model for demo deployment, fitted on all data after exploratory CV.
    # No independent, external test validation is claimed.
    names=HISTORY;X=matrix(cols,rows,names)
    final_cv=StratifiedKFold(n_splits=5,shuffle=True,random_state=SEED+31)
    grid=score_options(X,y,names,flags,quick_options,list(final_cv.split(X,y)))
    auc,config=grid[0]
    p,selected,model=fit_predict(X,y,X[:1],names,flags,config)
    joblib.dump(model,dest/'quick_cad_model.joblib')
    rankids,importance=rank(X,y,names,flags)
    ranks=[dict(Feature=names[j],MutualInformation=round(float(importance[j]),5),Position=rankids.index(j)+1) for j in range(len(names))]
    ranks.sort(key=lambda item:item['Position']);save_csv(dest/'raw_feature_mutual_information.csv',ranks)
    choices={c:sorted(set(str(r[cols.index(c)]) for r in rows)) for c in selected if not flags[c]}
    schema=dict(selected_features=selected,n_features=len(selected),model=config[1],engineered_interactions=config[2],inner_cv_auc=round(auc,4),training_records=len(rows),positive_label='CAD',categorical_options=choices,numeric_features=[c for c in selected if flags[c]],source='Z-Alizadeh Sani Extension dataset',cautions='Research-only. This dataset contains patients evaluated for CAD. Quick model not independently validated for population screening. Model probability calibration not established.')
    (dest/'quick_cad_schema.json').write_text(json.dumps(schema,indent=2))
    print('\nFINAL FEATURE LIST:',json.dumps(schema,indent=2),flush=True)

if __name__=='__main__':main()

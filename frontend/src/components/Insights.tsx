import { Activity, ArrowUpRight, BarChart3, Info } from "lucide-react";

export type Driver = { feature: string; contribution: number };
export type Explanation = {
  method: string;
  unit: string;
  interpretation?: string;
  drivers: Driver[];
};
export type Cohort = {
  age_band: string;
  sample_size: number;
  sufficient_sample: boolean;
  reference: string;
  message?: string;
  measurements: { feature: string; label: string; unit: string; patient: number; cohort_mean: number; cohort_median: number }[];
  condition_prevalence: { feature: string; label: string; patient: boolean; cohort_percent: number }[];
  observed_labels: { target: string; positive_count: number; positive_percent: number }[];
};

const displayFeature = (x: string): string => ({
  "DM": "Diabetes", "HTN": "Hypertension", "PR": "Pulse rate",
  "BP": "Blood pressure", "Sex": "Sex", "BMI": "Body mass index",
  "Dyspnea": "Shortness of breath", "Atypical": "Atypical chest pain",
  "Nonanginal": "Non-anginal chest pain",
  "Current Smoker": "Current smoking", "EF-TTE": "Ejection fraction",
  "Region RWMA": "Wall-motion abnormality", "Tinversion": "T-wave inversion",
})[x] ?? x;

export function ProbabilityRing({value, caption}:{value:number; caption?:string}) {
  const p = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="cv-prob-ring" style={{background:`conic-gradient(#256B65 ${p}%, #E3EBE8 ${p}% 100%)`}} aria-label={`Positive class score ${p.toFixed(1)} percent`}>
      <div><strong>{p.toFixed(1)}<small>%</small></strong><span>{caption ?? "MODEL SCORE"}</span></div>
    </div>
  );
}

export function ContributionChart({explanation, title = "What influenced this result?"}: { explanation?: Explanation | null; title?: string }) {
  if (!explanation || !explanation.drivers?.length) {
    return <div className="cv-insight-card"><h4>{title}</h4><p className="cv-muted">Patient-specific explanations will appear after inference.</p></div>;
  }
  const shown = explanation.drivers.slice(0, 7);
  const peak = Math.max(...shown.map(item => Math.abs(item.contribution)), 0.00001);
  return (
    <div className="cv-insight-card" aria-label="Patient-level model contributions">
      <div className="cv-insight-head"><div><span className="cv-eyebrow">LOCAL EXPLANATION</span><h4>{title}</h4></div><BarChart3 size={19}/></div>
      <div className="cv-contribution-chart">
        {shown.map((item) => {
          const pct = Math.max(2, Math.abs(item.contribution) / peak * 48);
          return <div className="cv-contribution-row" key={item.feature}>
            <span title={item.feature}>{displayFeature(item.feature)}</span>
            <div className="cv-contribution-track"><span className="cv-midline"/>
              <span className={item.contribution >= 0 ? "cv-contribution-bar positive" : "cv-contribution-bar negative"} style={{width:`${pct}%`,left:item.contribution>=0?"50%":`${50-pct}%`}} />
            </div>
            <b>{item.contribution > 0 ? "+" : ""}{item.contribution.toFixed(3)}</b>
          </div>;
        })}
      </div>
      <div className="cv-chart-legend"><span><i className="cv-swatch positive"/>Higher model score</span><span><i className="cv-swatch negative"/>Lower model score</span></div>
      <p className="cv-caption">{explanation.method} · {explanation.unit}. Explanations describe model behavior relative to a reference, not causes of disease.</p>
    </div>
  );
}

export function CohortComparison({cohort, quick=false}:{cohort?:Cohort|null;quick?:boolean}) {
  if (!cohort) return null;
  return <section className="cv-insight-card cv-cohort-card" aria-label="Same-age dataset comparison">
    <div className="cv-insight-head"><div><span className="cv-eyebrow">AGE-MATCHED REFERENCE</span><h4>Compared with ages {cohort.age_band}</h4></div><Activity size={19}/></div>
    <p className="cv-caption">{cohort.sample_size} records in the reference dataset. This is not a population norm.</p>
    {!cohort.sufficient_sample ? <p className="cv-cohort-notice">{cohort.message}</p> : <>
      <div className="cv-cohort-grid">
        {cohort.measurements.map(m=> {
          const max = Math.max(m.patient, m.cohort_mean, 0.01) * 1.13;
          return <div className="cv-cohort-metric" key={m.feature}>
            <h5>{m.label}</h5>
            <div className="cv-two-bars">
              <div><small>You</small><div className="cv-bar-rail"><span className="cv-bar-patient" style={{width:`${Math.min(100,m.patient/max*100)}%`}}/></div><b>{m.patient.toFixed(1)}</b></div>
              <div><small>Age-group mean</small><div className="cv-bar-rail"><span className="cv-bar-cohort" style={{width:`${Math.min(100,m.cohort_mean/max*100)}%`}}/></div><b>{m.cohort_mean.toFixed(1)}</b></div>
            </div><span className="cv-unit">{m.unit}</span>
          </div>;
        })}
      </div>
      <div className="cv-prevalence-panel">
        <h5>Observed findings among same-age records</h5>
        <div className="cv-prevalence-grid">
          {cohort.condition_prevalence.map(d=><div className="cv-prevalence" key={d.feature}><span>{d.label}</span><div className="cv-slim-track"><i style={{width:`${d.cohort_percent}%`}}/></div><strong>{d.cohort_percent.toFixed(1)}%</strong></div>)}
        </div>
        <div className="cv-outcome-labels">
          {cohort.observed_labels.map(d=><div key={d.target}><strong>{d.positive_percent.toFixed(1)}%</strong><small>{d.target} labelled positive ({d.positive_count}/{cohort.sample_size})</small></div>)}
        </div>
      </div>
    </>}
    <p className="cv-caption">Observed diagnoses in this selected clinical dataset are distinct from your model-estimated score. {quick ? "Quick assessment does not provide artery-specific estimates." : "Vessel labels describe this dataset, not the anatomy of the current patient."}</p>
  </section>;
}

export function ClinicalSnapshot({data}:{data:Record<string,string|number>|null}) {
  if (!data) return null;
  const metrics = ["Age", "BP", "PR", "BMI", "DM", "HTN", "Current Smoker", "Dyspnea"];
  return <div className="cv-insight-card"><div className="cv-insight-head"><div><span className="cv-eyebrow">CLINICAL INPUT SUMMARY</span><h4>Assessment context</h4></div><Info size={18}/></div><div className="cv-snapshot">
    {metrics.filter(m=>data[m]!==undefined).map(m=><div key={m}><span>{displayFeature(m)}</span><strong>{["DM","HTN","Current Smoker"].includes(m) ? Number(data[m])===1 ? "Yes" : "No" : m==="Dyspnea" ? data[m]==="Y"?"Yes":"No" : String(data[m])}</strong></div>)}
  </div></div>;
}

export function FullComparison({scores,predictions,selected,onChoose}:{
  scores?:Record<string,number>;
  predictions?:Record<"CAD"|"LAD"|"LCX"|"RCA",{predicted_label:string}>;
  selected:string;
  onChoose:(v:"LAD"|"LCX"|"RCA")=>void;
}) {
  const names = ["CAD", "LAD", "LCX", "RCA"] as const;
  const readable = (v:typeof names[number]) => v==="CAD"?"Overall CAD":v==="LAD"?"Anterior descending":v==="LCX"?"Left circumflex":"Right coronary";
  return <section className="cv-insight-card cv-profile-card">
    <div className="cv-insight-head"><div><span className="cv-eyebrow">FOUR INDEPENDENT MODELS</span><h4>Coronary prediction profile</h4></div><BarChart3 size={18}/></div>
    <p className="cv-profile-intro">The same answers are evaluated by four separate classifiers. Choose an artery to inspect its model context.</p>
    <div className="cv-full-score-chart">{names.map(n=>{
      const p = scores?.[n];
      const row = <><div className="cv-score-row-head"><span>{n}</span><strong>{p===undefined?"—":`${(p*100).toFixed(1)}%`}</strong></div><div className="cv-score-rail"><i style={{width:p===undefined?"0%":`${Math.min(100,100*p)}%`}}/></div><small>{readable(n)}{predictions?.[n]?` · ${predictions[n].predicted_label} class`:""}</small></>;
      return n==="CAD"
        ? <div key={n} className="cv-score-row cv-score-row--fixed">{row}</div>
        : <button key={n} type="button" className={selected===n?"cv-score-row active":"cv-score-row"} onClick={()=>onChoose(n)} aria-pressed={selected===n} aria-label={`Select ${n}; model score ${p===undefined?'not available':(p*100).toFixed(1)+' percent'}`}>{row}</button>;
    })}</div>
    {scores && <div className="cv-profile-result-summary">
      <div className="cv-profile-result-heading"><Activity size={16}/><strong>How to read these results</strong></div>
      <p>A 50% model decision threshold assigns a dataset class; these bars are not percentages of vessel obstruction.</p>
      <div className="cv-profile-result-mini">{names.map(n=><div key={n}><b>{n}</b><span>{predictions?.[n]?.predicted_label??"Not available"}</span></div>)}</div>
      <a href="#technical-appendix">See validation &amp; model limitations →</a>
    </div>}
    {!scores&&<div className="cv-profile-result-summary"><strong>Four independent estimates in one assessment</strong><p>Complete the patient questionnaire to populate this profile and unlock personalized explanations.</p></div>}
  </section>;
}

export function ScopeHint(){return <p className="cv-caption cv-scope-hint"><Info size={14}/> Research model estimates are not a diagnostic test. For severe or new chest pain or breathlessness, seek urgent medical evaluation rather than relying on this tool. <a href="#methods">How the models work <ArrowUpRight size={12}/></a></p>}

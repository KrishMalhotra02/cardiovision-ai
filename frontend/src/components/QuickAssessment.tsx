import {useEffect,useMemo,useState} from "react";
import type {FormEvent} from "react";
import {ArrowRight, RefreshCw, HeartPulse} from "lucide-react";
import {CohortComparison, ContributionChart, ProbabilityRing, ScopeHint} from "./Insights";
import type {Cohort,Explanation} from "./Insights";

export type CoronaryPrediction = {
  predicted_class: number; predicted_label: string; positive_probability: number;
  positive_class: string; model_type: string;
};
export type QuickOutcome = {
  target:"CAD"; mode:string;predicted_label:string;positive_probability:number;
  xai?:Explanation;cohort?:Cohort;model_method?:string;disclaimer?:string;
  predictions: Record<"CAD"|"LAD"|"LCX"|"RCA",CoronaryPrediction>;
  explanations?:Partial<Record<"CAD"|"LAD"|"LCX"|"RCA",Explanation>>;
  vessel_validation?:Partial<Record<"LAD"|"LCX"|"RCA",{roc_auc:number;holdout_n:number}>>;
  probability_note?:string;
};
type Question = {name:string;label:string;unit:string|null;type:"number"|"select";options:Array<string|number>};
type Schema = {visible_questions:number;input_fields:Question[]};
type Props={apiBase:string;demoSignal:number;onResult:(result:QuickOutcome, inputs:Record<string,string|number>)=>void;onReset?:()=>void};
const numericFields=new Set(["Age","BMI","BP","PR","DM","HTN","Current Smoker"]);
function showOption(q:Question,v:string|number):string {
  if (["DM","HTN","Current Smoker"].includes(q.name))return Number(v)===1?"Yes":"No";
  if (q.name==="Sex")return v==="Fmale"?"Female":"Male";
  if (q.name==="Dyspnea")return v==="Y"?"Yes":"No";
  if (q.name==="ChestPainType")return ({typical:"Typical chest pain",atypical:"Atypical chest pain",nonanginal:"Non-anginal chest pain",other_unspecified:"Other or no chest pain"} as Record<string,string>)[String(v)]??String(v);
  return String(v);
}
type PatientContextProps = {data: Record<string,string|number>; cohort?:Cohort};
function PatientContext({data,cohort}:PatientContextProps) {
  const notes: {headline:string;detail:string}[] = [];
  const chest = String(data.ChestPainType ?? "");
  if (chest === "typical") notes.push({headline:"Typical chest-pain pattern selected",detail:"The selected symptom category contributes to the research models; it does not establish the cause of pain."});
  else if (chest === "atypical") notes.push({headline:"Atypical chest-pain pattern selected",detail:"Symptoms require individual context beyond questionnaire answers."});
  if (data.Dyspnea === "Y") notes.push({headline:"Breathlessness reported",detail:"A symptom input in this assessment; it is not attributed to a particular condition."});
  if (Number(data.HTN) === 1) notes.push({headline:"Hypertension history reported",detail:"Included as a historical clinical input alongside measured blood pressure."});
  if (Number(data.DM) === 1) notes.push({headline:"Diabetes history reported",detail:"Included as a clinical-history input across the research classifiers."});
  if (Number(data["Current Smoker"]) === 1) notes.push({headline:"Current smoking reported",detail:"Smoking status is among the inputs considered by these models."});
  if (!notes.length) notes.push({headline:"No selected symptom or history flags",detail:"The absence of these reported findings does not establish that coronary disease is absent."});
  const metrics = [{key:"BP",label:"Blood pressure",unit:"mmHg"},{key:"PR",label:"Pulse rate",unit:"bpm"},{key:"BMI",label:"Body mass index",unit:"kg/m²"}];
  const references = cohort?.measurements ?? [];
  return <section className="cv-patient-context" aria-label="Patient-specific assessment context">
    <div className="cv-patient-context-heading"><div><span className="panel-eyebrow">YOUR INPUT PROFILE</span><h3>What stands out in your answers</h3></div><HeartPulse size={20}/></div>
    <p className="cv-patient-context-intro">A descriptive summary of the information entered, separate from the predicted disease labels.</p>
    <div className="cv-patient-metrics">{metrics.map(m => {
      const value = Number(data[m.key]);
      const match = references.find(x=>x.feature===m.key);
      const normal = match?.cohort_mean;
      return <div className="cv-patient-metric" key={m.key}>
        <span>{m.label}</span><strong>{Number.isFinite(value)?value.toFixed(m.key==="BMI"?1:0):"—"}<small> {m.unit}</small></strong>
        {normal!==undefined&&<em>Dataset age-group mean: {normal.toFixed(1)}</em>}
      </div>;
    })}</div>
    <div className="cv-patient-findings"><h4>Notable reported findings</h4>{notes.slice(0,3).map(n=><div key={n.headline}><span className="cv-patient-marker"/><div><strong>{n.headline}</strong><p>{n.detail}</p></div></div>)}</div>
    <div className="cv-patient-context-footer">{cohort?<span>Comparison based on {cohort.sample_size} records ages {cohort.age_band}; not a population reference.</span>:<span>Values and history are self-entered questionnaire data.</span>} <a href="#methods">About the model →</a></div>
  </section>;
}

export default function QuickAssessment({apiBase,demoSignal,onResult,onReset}:Props){
  const [schema,setSchema]=useState<Schema|null>(null);
  const [values,setValues]=useState<Record<string,string>>({});
  const [result,setResult]=useState<QuickOutcome|null>(null);
  const [submittedInputs,setSubmittedInputs]=useState<Record<string,string|number>|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    if(demoSignal>0){
      setValues({Age:"52",Sex:"Male",BMI:"26.2",DM:"0",HTN:"1","Current Smoker":"0",ChestPainType:"typical",Dyspnea:"N",BP:"132",PR:"76"});
      setResult(null);setSubmittedInputs(null);onReset?.();setError("");
    }
  },[demoSignal]);
  useEffect(()=>{
    const controller=new AbortController();
    fetch(`${apiBase}/api/quick/schema`,{signal:controller.signal,cache:"no-store"})
      .then(async r=>{if(!r.ok)throw Error(`Assessment service returned ${r.status}`);return r.json()})
      .then((r:Schema)=>{setSchema(r);setError("")})
      .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Backend unavailable")});
    return ()=>controller.abort();
  },[apiBase,retry]);
  const fields=schema?.input_fields??[];
  const answered=useMemo(()=>fields.filter(f=>(values[f.name]??"").trim()!=="").length,[fields,values]);
  const ready=fields.length>0&&answered===fields.length;
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!ready)return;
    setBusy(true);setError("");setResult(null);
    try{
      const features:Record<string,string|number>={};
      for(const q of fields){const raw=values[q.name];if(!raw?.trim())throw Error(`Complete ${q.label}`);features[q.name]=numericFields.has(q.name)?Number(raw):raw;}
      const r=await fetch(`${apiBase}/api/quick/predict`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({features})});
      const data=await r.json();if(!r.ok)throw Error(typeof data.detail==="string"?data.detail:JSON.stringify(data.detail));
      const targets=["CAD","LAD","LCX","RCA"] as const;
      if(targets.some(t=>!Number.isFinite(data.predictions?.[t]?.positive_probability)))throw Error("Incomplete four-model result: please update the backend before running the upgraded frontend.");
      setResult(data as QuickOutcome);setSubmittedInputs(features);onResult(data as QuickOutcome,features);
    }catch(e){setError(e instanceof Error?e.message:"Unable to process the assessment");}
    finally{setBusy(false)}
  }
  const updateField=(name:string,value:string)=>{
    setValues(prev=>({...prev,[name]:value}));
    if(result){setResult(null);setSubmittedInputs(null);onReset?.();}
  };
  return <section className="quick-section" id="quick" aria-labelledby="quick-title">
    <div className="editorial-heading"><div className="editorial-label"><span className="editorial-index">01</span> PATIENT ASSESSMENT</div><div className="editorial-heading-grid"><h2 id="quick-title">Patient assessment.</h2><p>Ten focused questions, four separately trained prediction models. Explore overall CAD and the LAD, LCX and RCA arteries without a second form.</p></div></div>
    <div className="quick-layout cv-quick-grid">
      <div className="cv-form-column">
      <form className="quick-form" onSubmit={submit}>
        <div className="quick-form-header"><div><span className="panel-eyebrow">FOUR-MODEL CORONARY SCREEN</span><h3>Patient information</h3></div><span className="question-progress">{answered} / {fields.length||10} complete</span></div>
        {schema?<div className="quick-fields">{fields.map(q=><label className="quick-field" key={q.name}><span>{q.label}{q.unit?<small> · {q.unit}</small>:null}</span>
          {q.type==="select"?<select required value={values[q.name]??""} onChange={e=>updateField(q.name,e.target.value)}><option value="">Select</option>{q.options.map(o=><option value={String(o)} key={String(o)}>{showOption(q,o)}</option>)}</select>
          : <input required type="number" step="any" min={{Age:18,BMI:10,BP:60,PR:30}[q.name as "Age"|"BMI"|"BP"|"PR"]} max={{Age:110,BMI:70,BP:260,PR:220}[q.name as "Age"|"BMI"|"BP"|"PR"]} value={values[q.name]??""} placeholder={q.name==="Age"?"e.g. 45":q.name==="BP"?"e.g. 125":q.name==="BMI"?"e.g. 25.5":"Enter measurement"} onChange={e=>updateField(q.name,e.target.value)}/>}
        </label>)}</div>:<div className="loading-form"><p>{error||"Loading questionnaire…"}</p><button type="button" onClick={()=>setRetry(i=>i+1)}><RefreshCw size={16}/> Retry</button></div>}
        {error&&<div role="alert" className="quick-error">{error}</div>}
        <div className="quick-form-bottom"><button className="submit-assessment" disabled={!ready||busy}>{busy?"Analyzing…":"Generate assessment"}<ArrowRight size={16}/></button></div>
      </form>
      {result && submittedInputs && <PatientContext data={submittedInputs} cohort={result.cohort}/>}
      </div>
      <div className="cv-result-stack" aria-live="polite">
        <div className="quick-result cv-quick-result"><div className="quick-result-top"><span className="panel-eyebrow">YOUR CORONARY ASSESSMENT</span><HeartPulse size={21}/></div>
          {result?<><h3 className="cv-quick-label">{result.predicted_label==="CAD"?"CAD-positive model classification":"Normal model classification"}</h3><ProbabilityRing value={result.positive_probability} caption="CAD MODEL SCORE"/><p className="cv-muted">{result.model_method??"Reduced-input CAD classifier"}. This is the overall CAD classifier, not a measured narrowing or a diagnosis.</p>
            <div className="cv-mini-target-grid">{(["CAD","LAD","LCX","RCA"] as const).map(t=><div key={t}><span>{t}</span><strong>{(result.predictions[t].positive_probability*100).toFixed(1)}%</strong><small>{result.predictions[t].predicted_label}</small></div>)}</div><div className="cv-cad-interpretation"><strong>What your CAD result means</strong><p>The overall classifier places this answer profile in its <b>{result.predicted_label}</b> class at the 50% research threshold. It is a mathematical pattern match to a small, selected dataset—not confirmation or exclusion of coronary disease. The vessel scores below were generated by three different models.</p></div></>
          :<div className="cv-quick-placeholder"><HeartPulse size={50} strokeWidth={1.1}/><h3>Ready when you are.</h3><p>Complete ten questions to receive all four estimates, feature explanations and age-matched dataset context.</p></div>}
          <div className="quick-full-link"><span>CAD, LAD, LCX and RCA scores from the same ten answers</span><a href="#full">Explore your coronary profile →</a></div>
        </div>
        {result?.xai && <ContributionChart explanation={result.xai}/>}
      </div>
    </div>
    {result?.cohort&&<div className="cv-cohort-quick"><CohortComparison cohort={result.cohort}/><ScopeHint/></div>}
  </section>
}

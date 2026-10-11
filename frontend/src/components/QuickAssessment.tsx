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
type Props={apiBase:string;demoSignal:number;onResult:(result:QuickOutcome, inputs:Record<string,string|number>)=>void};
const numericFields=new Set(["Age","BMI","BP","PR","DM","HTN","Current Smoker"]);
function showOption(q:Question,v:string|number):string {
  if (["DM","HTN","Current Smoker"].includes(q.name))return Number(v)===1?"Yes":"No";
  if (q.name==="Sex")return v==="Fmale"?"Female":"Male";
  if (q.name==="Dyspnea")return v==="Y"?"Yes":"No";
  if (q.name==="ChestPainType")return ({typical:"Typical chest pain",atypical:"Atypical chest pain",nonanginal:"Non-anginal chest pain",other_unspecified:"Other or no chest pain"} as Record<string,string>)[String(v)]??String(v);
  return String(v);
}
export default function QuickAssessment({apiBase,demoSignal,onResult}:Props){
  const [schema,setSchema]=useState<Schema|null>(null);
  const [values,setValues]=useState<Record<string,string>>({});
  const [result,setResult]=useState<QuickOutcome|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    if(demoSignal>0){
      setValues({Age:"52",Sex:"Male",BMI:"26.2",DM:"0",HTN:"1","Current Smoker":"0",ChestPainType:"typical",Dyspnea:"N",BP:"132",PR:"76"});
      setResult(null);setError("");
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
      setResult(data as QuickOutcome);onResult(data as QuickOutcome,features);
    }catch(e){setError(e instanceof Error?e.message:"Unable to process the assessment");}
    finally{setBusy(false)}
  }
  return <section className="quick-section" id="quick" aria-labelledby="quick-title">
    <div className="editorial-heading"><div className="editorial-label"><span className="editorial-index">01</span> PATIENT ASSESSMENT</div><div className="editorial-heading-grid"><h2 id="quick-title">A faster first assessment.</h2><p>Ten focused questions, four separately trained prediction models. Explore overall CAD and the LAD, LCX and RCA arteries without a second form.</p></div></div>
    <div className="quick-layout cv-quick-grid">
      <form className="quick-form" onSubmit={submit}>
        <div className="quick-form-header"><div><span className="panel-eyebrow">FOUR-MODEL CORONARY SCREEN</span><h3>Patient information</h3></div><span className="question-progress">{answered} / {fields.length||10} complete</span></div>
        {schema?<div className="quick-fields">{fields.map(q=><label className="quick-field" key={q.name}><span>{q.label}{q.unit?<small> · {q.unit}</small>:null}</span>
          {q.type==="select"?<select required value={values[q.name]??""} onChange={e=>setValues(p=>({...p,[q.name]:e.target.value}))}><option value="">Select</option>{q.options.map(o=><option value={String(o)} key={String(o)}>{showOption(q,o)}</option>)}</select>
          :<input required type="number" step="any" value={values[q.name]??""} placeholder={q.name==="Age"?"e.g. 45":q.name==="BP"?"e.g. 125":q.name==="BMI"?"e.g. 25.5":"Enter measurement"} onChange={e=>setValues(p=>({...p,[q.name]:e.target.value}))}/>}
        </label>)}</div>:<div className="loading-form"><p>{error||"Loading questionnaire…"}</p><button type="button" onClick={()=>setRetry(i=>i+1)}><RefreshCw size={16}/> Retry</button></div>}
        {error&&<div role="alert" className="quick-error">{error}</div>}
        <div className="quick-form-bottom"><span>Ten inputs · four preliminary model estimates</span><button className="submit-assessment" disabled={!ready||busy}>{busy?"Analyzing…":"Generate assessment"}<ArrowRight size={16}/></button></div>
      </form>
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

import {useEffect,useMemo,useState} from "react";
import type {FormEvent} from "react";
import {ArrowRight, ArrowUpRight, RefreshCw, HeartPulse} from "lucide-react";
import {CohortComparison, ContributionChart, ProbabilityRing, ScopeHint} from "./Insights";
import type {Cohort,Explanation} from "./Insights";

export type QuickOutcome = {
  target:"CAD"; mode:string;predicted_label:string;positive_probability:number;
  xai?:Explanation;cohort?:Cohort;model_method?:string;disclaimer?:string;
};
type Question = {name:string;label:string;unit:string|null;type:"number"|"select";options:Array<string|number>};
type Schema = {visible_questions:number;input_fields:Question[]};
type Props={apiBase:string;onResult:(result:QuickOutcome)=>void;onFull:()=>void};
const numericFields=new Set(["Age","BMI","BP","PR","DM","HTN","Current Smoker"]);
function showOption(q:Question,v:string|number):string {
  if (["DM","HTN","Current Smoker"].includes(q.name))return Number(v)===1?"Yes":"No";
  if (q.name==="Sex")return v==="Fmale"?"Female":"Male";
  if (q.name==="Dyspnea")return v==="Y"?"Yes":"No";
  if (q.name==="ChestPainType")return ({typical:"Typical chest pain",atypical:"Atypical chest pain",nonanginal:"Non-anginal chest pain",other_unspecified:"Other or no chest pain"} as Record<string,string>)[String(v)]??String(v);
  return String(v);
}
export default function QuickAssessment({apiBase,onResult,onFull}:Props){
  const [schema,setSchema]=useState<Schema|null>(null);
  const [values,setValues]=useState<Record<string,string>>({});
  const [result,setResult]=useState<QuickOutcome|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [retry,setRetry]=useState(0);
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
      if(!Number.isFinite(data.positive_probability))throw Error("Invalid CAD score returned");
      setResult(data as QuickOutcome);onResult(data as QuickOutcome);
    }catch(e){setError(e instanceof Error?e.message:"Unable to process the assessment");}
    finally{setBusy(false)}
  }
  return <section className="quick-section" id="quick" aria-labelledby="quick-title">
    <div className="editorial-heading"><div className="editorial-label"><span className="editorial-index">01</span> PATIENT ASSESSMENT</div><div className="editorial-heading-grid"><h2 id="quick-title">A faster first assessment.</h2><p>Ten clinically relevant questions, selected and validated through our feature-engineering workflow. No lab upload required for this mode.</p></div></div>
    <div className="quick-layout cv-quick-grid">
      <form className="quick-form" onSubmit={submit}>
        <div className="quick-form-header"><div><span className="panel-eyebrow">QUICK CAD MODEL</span><h3>Patient information</h3></div><span className="question-progress">{answered} / {fields.length||10} complete</span></div>
        {schema?<div className="quick-fields">{fields.map(q=><label className="quick-field" key={q.name}><span>{q.label}{q.unit?<small> · {q.unit}</small>:null}</span>
          {q.type==="select"?<select required value={values[q.name]??""} onChange={e=>setValues(p=>({...p,[q.name]:e.target.value}))}><option value="">Select</option>{q.options.map(o=><option value={String(o)} key={String(o)}>{showOption(q,o)}</option>)}</select>
          :<input required type="number" step="any" value={values[q.name]??""} placeholder={q.name==="Age"?"e.g. 45":q.name==="BP"?"e.g. 125":q.name==="BMI"?"e.g. 25.5":"Enter measurement"} onChange={e=>setValues(p=>({...p,[q.name]:e.target.value}))}/>}
        </label>)}</div>:<div className="loading-form"><p>{error||"Loading questionnaire…"}</p><button type="button" onClick={()=>setRetry(i=>i+1)}><RefreshCw size={16}/> Retry</button></div>}
        {error&&<div role="alert" className="quick-error">{error}</div>}
        <div className="quick-form-bottom"><span>Uses CAD-only reduced-feature model</span><button className="submit-assessment" disabled={!ready||busy}>{busy?"Analyzing…":"Generate assessment"}<ArrowRight size={16}/></button></div>
      </form>
      <div className="cv-result-stack" aria-live="polite">
        <div className="quick-result cv-quick-result"><div className="quick-result-top"><span className="panel-eyebrow">YOUR CAD ASSESSMENT</span><HeartPulse size={21}/></div>
          {result?<><h3 className="cv-quick-label">{result.predicted_label==="CAD"?"CAD-positive classification":"Normal classification"}</h3><ProbabilityRing value={result.positive_probability} caption="CAD MODEL SCORE"/><p className="cv-muted">{result.model_method??"Reduced-input CAD classifier"}. The score is a model estimate, not an angiographic finding or a clinical diagnosis.</p></>
          :<div className="cv-quick-placeholder"><HeartPulse size={50} strokeWidth={1.1}/><h3>Ready when you are.</h3><p>Complete the assessment to view a prediction, feature contributions and an age-matched dataset comparison.</p></div>}
          <div className="quick-full-link"><span>Need vessel-specific estimates?</span><button onClick={onFull} type="button">Comprehensive analysis <ArrowUpRight size={15}/></button></div>
        </div>
        {result?.xai && <ContributionChart explanation={result.xai}/>}
      </div>
    </div>
    {result?.cohort&&<div className="cv-cohort-quick"><CohortComparison cohort={result.cohort} quick/><ScopeHint/></div>}
  </section>
}

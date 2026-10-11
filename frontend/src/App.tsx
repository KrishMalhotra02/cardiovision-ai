import { useCallback, useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, HeartPulse, RotateCcw, ShieldCheck, RefreshCw, Activity, Sparkles, Info, CheckCircle2 } from "lucide-react";
import HeartScene from "./components/HeartScene";
import HeartLogo from "./components/HeartLogo";
import HeartDiscovery from "./components/HeartDiscovery";
import Methods from "./components/Methods";
import { FullComparison, ContributionChart, ClinicalSnapshot, ScopeHint } from "./components/Insights";
import type { Explanation } from "./components/Insights";
import QuickAssessment from "./components/QuickAssessment";
import type { QuickOutcome } from "./components/QuickAssessment";
import type { Vessel } from "./components/HeartScene";
import "./App.css";

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "http://127.0.0.1:8000";
type Target = Vessel | "CAD";
const TARGETS: Target[] = ["CAD", "LAD", "LCX", "RCA"];
const VESSELS: Vessel[] = ["LAD", "LCX", "RCA"];
const NAMES: Record<Target, string> = {
  CAD: "Coronary artery disease", LAD: "Left anterior descending",
  LCX: "Left circumflex", RCA: "Right coronary artery",
};
const TERRITORIES: Record<Vessel, { anatomy: string; context: string }> = {
  LAD: {anatomy: "Travels in the anterior interventricular groove toward the apex.", context: "Often supplies the anterior left ventricle and much of the interventricular septum."},
  LCX: {anatomy: "Courses around the left atrioventricular groove.", context: "Supplies portions of the lateral left ventricle; territory varies with coronary dominance."},
  RCA: {anatomy: "Follows the right atrioventricular groove toward the inferior heart.", context: "Supplies right-heart structures and often inferior regions, depending on dominance."},
};
const DISPLAY_FEATURE: Record<string,string> = {
  "Age":"Age", "BMI":"Body mass index", "DM":"Diabetes history", "HTN":"Hypertension history",
  "Current Smoker":"Smoking status", "BP":"Blood pressure", "PR":"Pulse rate", "Dyspnea":"Breathlessness",
  "Typical Chest Pain":"Typical chest pain", "Atypical":"Atypical chest pain", "Nonanginal":"Non-anginal chest pain",
};

function VesselInterpretation({
  target, result, explanation, inputs,
}: {
  target: Vessel;
  result: NonNullable<QuickOutcome["predictions"]>[Target];
  explanation?: Explanation;
  inputs?: Record<string, string | number> | null;
}) {
  const positive = result.predicted_label === "Stenotic";
  const drivers = explanation?.drivers?.filter(d => Math.abs(d.contribution) > .00001).slice(0, 3) ?? [];
  const reports: string[] = [];
  if (inputs?.ChestPainType === "typical") reports.push("Typical chest-pain pattern selected");
  if (inputs?.ChestPainType === "atypical") reports.push("Atypical chest-pain pattern selected");
  if (inputs?.Dyspnea === "Y") reports.push("Shortness of breath reported");
  if (Number(inputs?.HTN) === 1) reports.push("Hypertension history reported");
  if (Number(inputs?.DM) === 1) reports.push("Diabetes history reported");
  if (Number(inputs?.["Current Smoker"]) === 1) reports.push("Current smoking reported");
  return <div className="cv-interpretation-panel">
    <div className="cv-interpretation-heading"><Sparkles size={17}/><strong>Personalized model interpretation</strong></div>
    <p className="cv-interpretation-summary">The <strong>{target} model</strong> classified these answers as <strong>{positive ? "Stenotic" : "Normal"}</strong> within the research dataset. Its positive-class score is <strong>{(result.positive_probability*100).toFixed(1)}%</strong>.</p>
    {drivers.length>0 && <div className="cv-driver-highlight">
      <span>Inputs most influential to this output</span>
      <div className="cv-driver-mini-list">{drivers.map(d => <div key={d.feature}><span>{DISPLAY_FEATURE[d.feature]??d.feature}</span><b className={d.contribution>=0?"is-up":"is-down"}>{d.contribution>=0?"↑":"↓"} Model score</b></div>)}</div>
    </div>}
    {reports.length>0 && <div className="cv-context-chips"><span>Reported clinical context</span><div>{reports.slice(0,3).map(x=><em key={x}>{x}</em>)}</div></div>}
    <p className="cv-interpretation-footnote">An exploratory pattern-based estimate, not an image-confirmed blockage or diagnosis. <a href="#technical-appendix">Evaluation details ↗</a></p>
  </div>;
}

export default function App() {
  const [selected,setSelected]=useState<Vessel>("LAD");
  const [result,setResult]=useState<QuickOutcome|null>(null);
  const [quickInputs,setQuickInputs]=useState<Record<string,string|number>|null>(null);
  const [connected,setConnected]=useState(false);
  const [resetKey,setResetKey]=useState(0);
  const [demoSignal,setDemoSignal]=useState(0);
  const checkApi=useCallback(async()=>{
    try {
      const [h,s]=await Promise.all([
        fetch(`${API}/health`,{cache:"no-store"}),
        fetch(`${API}/api/quick/schema`,{cache:"no-store"})
      ]);
      if(!h.ok||!s.ok)throw Error("Assessment unavailable");
      const health=await h.json(); const schema=await s.json();
      if(health.status!=="ok"||!Array.isArray(schema.input_fields))throw Error("Incorrect API response");
      setConnected(true);return true;
    } catch {setConnected(false);return false;}
  },[]);
  useEffect(()=>{void checkApi();const interval=window.setInterval(()=>{void checkApi()},12000);return()=>window.clearInterval(interval);},[checkApi]);
  const probabilities:Partial<Record<Vessel,number>>|undefined=result?.predictions?{
    LAD:result.predictions.LAD?.positive_probability,
    LCX:result.predictions.LCX?.positive_probability,
    RCA:result.predictions.RCA?.positive_probability,
  }:undefined;
  const overallScore=result?.predictions?.CAD?.positive_probability??result?.positive_probability;
  const scores=result?.predictions&&TARGETS.every(t=>Number.isFinite(result.predictions?.[t]?.positive_probability))?
    Object.fromEntries(TARGETS.map(t=>[t,result.predictions![t].positive_probability])) as Record<string,number>:undefined;
  const selectedResult=result?.predictions?.[selected];
  const selectedExplanation=result?.explanations?.[selected];
  return <div className="site-shell">
    <header className="site-header">
      <a className="wordmark" href="#top" aria-label="CardioVision home"><HeartLogo/><span>cardiovision<span className="wordmark-accent">.ai</span></span></a>
      <nav className="header-links" aria-label="Primary"><a href="#quick">10-question assessment</a><a href="#full">Coronary explorer</a><a href="#discovery">Heart notes</a></nav>
      <button className="header-action" onClick={()=>document.getElementById("quick")?.scrollIntoView({behavior:"smooth"})}>Start an assessment <ArrowUpRight size={16}/></button>
    </header>
    <main id="top">
      {!connected&&<div className="api-status-banner" role="status"><span>Connecting to the prediction service. Render may need a moment to wake up.</span><button onClick={()=>void checkApi()}><RefreshCw size={15}/> Retry connection</button></div>}
      <section className="hero-section">
        <div className="hero-copy"><div className="section-kicker">THE CORONARY EXPLORER</div>
          <h1>See the heart.<br/><em>Understand the signals.</em></h1>
          <p className="hero-description">Ten focused questions. Four independent model estimates. One interactive view of the heart and coronary circulation.</p>
          <div className="hero-buttons"><a className="button-primary" href="#quick">Begin assessment <ArrowUpRight size={18}/></a>
            <button className="button-secondary" onClick={()=>{setDemoSignal(n=>n+1);document.getElementById("quick")?.scrollIntoView({behavior:"smooth"})}}>Prefill example <ArrowRight size={17}/></button></div>
          <div className="hero-smallprint">CAD · LAD · LCX · RCA · research predictions</div>
        </div>
        <div className="anatomy-stage" id="anatomy">
          <div className="stage-topline"><span>CARDIAC ANATOMY</span><span>DRAG TO ROTATE</span></div>
          <HeartScene selected={selected} probabilities={probabilities} cadProbability={overallScore} onSelect={setSelected} resetKey={resetKey}/>
          <div className="stage-controls"><div className="stage-vessel-pills" aria-label="Select artery">{VESSELS.map(v=><button key={v} onClick={()=>setSelected(v)} className={selected===v?"vessel-pill active":"vessel-pill"}>{v}</button>)}</div><button className="reset-button" onClick={()=>setResetKey(k=>k+1)} aria-label="Reset heart camera"><RotateCcw size={17}/></button></div>
          <div className="stage-caption"><span>{result?"Four model estimates shown · illustrative coronary positions":"Anatomical reference · select an artery to explore"}</span><span>Drag · zoom · select</span></div>
        </div>
      </section>
      <QuickAssessment apiBase={API} demoSignal={demoSignal} onResult={(r,inputs)=>{setResult(r);setQuickInputs(inputs)}} onReset={()=>{setResult(null);setQuickInputs(null)}}/>
      <section className="full-section" id="full">
        <div className="editorial-heading"><div className="editorial-label"><span className="editorial-index">02</span> CORONARY EXPLORER</div><div className="editorial-heading-grid"><h2>Four signals. One clearer picture.</h2><p>One 10-question assessment now generates separate CAD, LAD, LCX and RCA model scores, with vessel-level explanations and interactive anatomy.</p></div></div>
        <div className="cv-ready-banner"><div className="cv-ready-icon">{result?<CheckCircle2 size={23}/>:<HeartPulse size={23}/>}</div><div><strong>{result?"Your four-part coronary profile is ready":"Your four-part coronary profile will appear here"}</strong><span>{result?"Select an artery to explore its classification, model drivers and reference anatomy.":"No additional form needed. Complete the 10 questions above to populate every card."}</span></div><a href="#quick">{result?"Run another assessment":"Start 10-question assessment"}<ArrowUpRight size={15}/></a></div>
        <div className="cv-analytics-grid">
          <FullComparison scores={scores} predictions={result?.predictions} selected={selected} onChoose={setSelected}/>
          <section className="cv-insight-card cv-focused-anatomy"><div className="cv-insight-head"><div><span className="cv-eyebrow">SELECTED VESSEL · INTERACTIVE 3D</span><h4>{selected} — {NAMES[selected]}</h4></div><button className="cv-focus-reset" type="button" onClick={()=>setResetKey(k=>k+1)} aria-label="Reset heart camera"><RotateCcw size={17}/></button></div>
            <div className="cv-mini-heart"><HeartScene focusMode selected={selected} probabilities={probabilities} onSelect={setSelected} resetKey={resetKey}/></div>
            <p className="cv-focus-description">{TERRITORIES[selected].anatomy} {TERRITORIES[selected].context}</p>
            <p className="cv-caption">Illustrative coronary traces, not patient-specific imaging or measured lesion locations.</p>
          </section>
          <section className="cv-insight-card cv-selected-report"><div className="cv-insight-head"><div><span className="cv-eyebrow">VESSEL ASSESSMENT</span><h4>{selected} prediction</h4></div><ShieldCheck size={19}/></div>
            {selectedResult?<>
              <div className="cv-vessel-score">{(selectedResult.positive_probability*100).toFixed(1)}<small>%</small></div>
              <p className="cv-vessel-label">Model-estimated probability of the <strong>Stenotic</strong> dataset label</p>
              <span className="cv-status-pill">Model classification: {selectedResult.predicted_label}</span>
              <VesselInterpretation target={selected} result={selectedResult} explanation={selectedExplanation} inputs={quickInputs}/>
              <div className="cv-selected-divider"/><h5>Vessel anatomy</h5><p>{TERRITORIES[selected].context}</p>
              <small>MODEL: {selectedResult.model_type}</small>
            </>:<>
              <div className="cv-pre-result-mark"><Activity size={29}/><span>4 ready-to-run models</span></div>
              <h5>One form. No further clinical data.</h5><p>After completing the ten questions, this panel displays the selected vessel's score, classification, important inputs and validation context.</p>
              <div className="cv-selected-divider"/><h5>What {selected} supplies</h5><p>{TERRITORIES[selected].context}</p>
              <p className="cv-caption">No patient estimate has been generated yet. The anatomical rendering remains available for exploration.</p>
            </>}
          </section>
        </div>
        {result&&<div className="cv-detail-grid">
          <ContributionChart explanation={selectedExplanation} title={`Inputs influencing the ${selected} model`}/>
          <ClinicalSnapshot data={quickInputs}/>
        </div>}
        <div className="cv-dashboard-disclaimer"><Info size={17}/><p>Model outputs are exploratory and have not been externally validated or calibrated for clinical use. Four probability scores are <strong>not percentages of artery narrowing</strong> or comparable clinical severity measures. Never use them to diagnose or exclude coronary disease.</p></div>
        <ScopeHint/>
      </section>
      <HeartDiscovery/><Methods/>
    </main>
    <footer className="site-footer"><a className="footer-brand" href="#top"><HeartLogo/> cardiovision.ai</a><p>Cardiovascular intelligence with visible limits. <a href="#technical-appendix">Evaluation &amp; intended use</a></p><span>© 2026 CardioVision</span></footer>
  </div>;
}

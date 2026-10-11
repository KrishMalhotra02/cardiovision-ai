import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight, ArrowUpRight, HeartPulse, RotateCcw, ScanHeart,
  ShieldCheck, X, RefreshCw,
} from "lucide-react";
import HeartScene from "./components/HeartScene";
import HeartLogo from "./components/HeartLogo";
import HeartDiscovery from "./components/HeartDiscovery";
import Methods from "./components/Methods";
import { FullComparison, ContributionChart, CohortComparison, ClinicalSnapshot, ScopeHint } from "./components/Insights";
import type { Cohort, Explanation } from "./components/Insights";
import QuickAssessment from "./components/QuickAssessment";
import type { Vessel } from "./components/HeartScene";
import type { QuickOutcome } from "./components/QuickAssessment";
import "./App.css";

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "http://127.0.0.1:8000";
type Target = Vessel | "CAD";
type Feature = { name: string; type: "numeric" | "categorical"; options?: string[]; observed_min?: number; observed_max?: number };
type Prediction = { predicted_class: number; predicted_label: string; positive_probability: number; positive_class: string; model_type: string };
type FullResult = { predictions: Record<Target, Prediction>; explanations?: Partial<Record<Target, Explanation>>; cohort?: Cohort; disclaimer: string; probability_note?: string };
const TARGETS: Target[] = ["CAD", "LAD", "LCX", "RCA"];
const VESSELS: Vessel[] = ["LAD", "LCX", "RCA"];
const NAMES: Record<Target, string> = {
  CAD: "Coronary artery disease",
  LAD: "Left anterior descending",
  LCX: "Left circumflex",
  RCA: "Right coronary artery",
};
const TERRITORIES: Record<Vessel, { summary: string; context: string; anatomy: string }> = {
  LAD: {
    summary: "The anterior circulation",
    anatomy: "Travels in the anterior interventricular groove toward the apex.",
    context: "Typically supplies much of the anterior left ventricle and interventricular septum.",
  },
  LCX: {
    summary: "The lateral circulation",
    anatomy: "Courses around the left atrioventricular groove.",
    context: "Supplies portions of the lateral left ventricle; territory varies with dominance.",
  },
  RCA: {
    summary: "The right-sided circulation",
    anatomy: "Follows the right atrioventricular groove toward the inferior surface.",
    context: "Supplies right-heart structures and often part of the inferior heart, depending on dominance.",
  },
};
function groupFor(name: string) {
  if (["Age", "Weight", "Length", "Sex", "BMI"].includes(name)) return "Demographics";
  if (["Q Wave", "St Elevation", "St Depression", "Tinversion", "LVH", "Poor R Progression", "BBB"].includes(name)) return "ECG";
  if (["EF-TTE", "Region RWMA", "VHD"].includes(name)) return "Echocardiography";
  if (["FBS", "CR", "TG", "LDL", "HDL", "BUN", "ESR", "HB", "K", "Na", "WBC", "Lymph", "Neut", "PLT"].includes(name)) return "Laboratory";
  return "History & examination";
}
const GROUPS = ["Demographics", "History & examination", "ECG", "Laboratory", "Echocardiography"];

export default function App() {
  const [selected, setSelected] = useState<Vessel>("LAD");
  const [fullResult, setFullResult] = useState<FullResult | null>(null);
  const [quickResult, setQuickResult] = useState<QuickOutcome | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [connected, setConnected] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [lastFullInput, setLastFullInput] = useState<Record<string,number|string> | null>(null);

  const checkApi = useCallback(async () => {
    try {
      const [h, f] = await Promise.all([fetch(`${API}/health`, {cache: "no-store"}), fetch(`${API}/api/features`, {cache:"no-store"})]);
      if (!h.ok || !f.ok) throw Error("API offline");
      const health = await h.json();
      const schema = await f.json();
      if (health.status !== "ok" || !Array.isArray(schema.features)) throw Error("Unexpected API response");
      setConnected(true); setFeatures(schema.features as Feature[]);
      return true;
    } catch { setConnected(false); return false; }
  }, []);

  useEffect(() => {
    void checkApi();
    const interval = window.setInterval(() => { void checkApi(); }, 8000);
    return () => window.clearInterval(interval);
  }, [checkApi]);

  async function predictFull(payload: Record<string, unknown>) {
    const response = await fetch(`${API}/api/analytics/full`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({features:payload})});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(typeof data.detail === "string" ? data.detail : `Model request failed (${response.status})`);
    if (!data.predictions?.CAD || !data.predictions?.LAD || !data.predictions?.LCX || !data.predictions?.RCA) throw Error("Incomplete model response");
    setFullResult(data as FullResult);
    setLastFullInput(payload as Record<string,number|string>);
    const leader = (["LAD", "LCX", "RCA"] as Vessel[]).reduce((best, v) => data.predictions[v].positive_probability > data.predictions[best].positive_probability ? v : best, "LAD" as Vessel);
    setSelected(leader);
    setQuickResult(null);
    document.getElementById("full")?.scrollIntoView({behavior:"smooth"});
  }

  async function runExample() {
    setBusy(true); setError("");
    try {
      if (!connected && !(await checkApi())) throw Error("Start FastAPI on port 8000, then try again.");
      const r = await fetch(`${API}/api/demo-case`);
      if (!r.ok) throw Error("Unable to load example record");
      const data: {features:Record<string,unknown>} = await r.json();
      setValues(Object.fromEntries(Object.entries(data.features).map(([k,v])=>[k,String(v)])));
      await predictFull(data.features);
    } catch (e) { setError(e instanceof Error ? e.message : "Demo unavailable"); }
    finally { setBusy(false); }
  }

  async function submitFull() {
    setBusy(true); setError("");
    try {
      if (!features.length) throw Error("Clinical feature schema unavailable.");
      const payload: Record<string, number | string> = {};
      for (const f of features) {
        const raw = values[f.name];
        if (!raw?.trim()) throw Error(`Missing: ${f.name}`);
        if (f.type === "numeric") { const n = Number(raw); if (!Number.isFinite(n)) throw Error(`${f.name} must be numeric`); payload[f.name] = n; }
        else { if (!f.options?.includes(raw)) throw Error(`${f.name}: select a listed option`); payload[f.name] = raw; }
      }
      await predictFull(payload);
      setDrawer(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Invalid clinical inputs"); }
    finally { setBusy(false); }
  }

  const probabilities: Partial<Record<Vessel, number>> | undefined = fullResult ? {
    LAD: fullResult.predictions.LAD.positive_probability,
    LCX: fullResult.predictions.LCX.positive_probability,
    RCA: fullResult.predictions.RCA.positive_probability,
  } : undefined;
  const selectedResult = fullResult?.predictions[selected];
  const overallModelScore = fullResult?.predictions.CAD.positive_probability ?? quickResult?.positive_probability;
  const fullScores = fullResult ? Object.fromEntries(TARGETS.map(t => [t, fullResult.predictions[t].positive_probability])) as Record<string,number> : undefined;

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="CardioVision home"><HeartLogo/><span>cardiovision<span className="wordmark-accent">.ai</span></span></a>
        <nav className="header-links" aria-label="Primary"><a href="#quick">Quick assessment</a><a href="#full">Coronary explorer</a><a href="#discovery">Heart notes</a></nav>
        <button className="header-action" onClick={() => document.getElementById("quick")?.scrollIntoView({behavior:"smooth"})}>Start an assessment <ArrowUpRight size={16}/></button>
      </header>

      <main id="top">
        {!connected && <div className="api-status-banner" role="status"><span>Prediction service is offline. Start FastAPI to use assessments.</span><button onClick={() => void checkApi()}><RefreshCw size={15}/> Retry connection</button></div>}
        <section className="hero-section">
          <div className="hero-copy">
            <div className="section-kicker">THE CORONARY EXPLORER</div>
            <h1>See the heart.<br/><em>Understand the signals.</em></h1>
            <p className="hero-description">From a focused clinical intake to interactive coronary anatomy—one considered, connected experience.</p>
            <div className="hero-buttons">
              <a className="button-primary" href="#quick">Begin assessment <ArrowUpRight size={18}/></a>
              <button className="button-secondary" onClick={runExample} disabled={busy}>{busy ? "Loading…" : "Explore sample case"} <ArrowRight size={17}/></button>
            </div>
            <div className="hero-smallprint">Machine learning · Clinical context · Anatomical exploration</div>
            {error && <div className="error-notice" role="alert">{error}</div>}
          </div>
          <div className="anatomy-stage" id="anatomy">
            <div className="stage-topline"><span>CARDIAC ANATOMY</span><span>DRAG TO ROTATE</span></div>
            <HeartScene selected={selected} probabilities={probabilities} cadProbability={overallModelScore} onSelect={setSelected} resetKey={resetKey}/>
            <div className="stage-controls"><div className="stage-vessel-pills" aria-label="Select artery">{VESSELS.map(v => <button key={v} onClick={() => setSelected(v)} className={selected === v ? "vessel-pill active":"vessel-pill"}>{v}</button>)}</div><button className="reset-button" onClick={() => setResetKey(k=>k+1)} aria-label="Reset heart camera"><RotateCcw size={17}/></button></div>
            <div className="stage-caption"><span>{fullResult ? "Selected artery reflects your comprehensive model output" : quickResult ? "Overall CAD estimate shown; vessel predictions not available in quick mode" : "Anatomical reference · select an artery to explore"}</span><span>Drag · zoom · select</span></div>
          </div>
        </section>

        <QuickAssessment apiBase={API} onFull={() => setDrawer(true)} onResult={(r)=>{setQuickResult(r);setFullResult(null);}}/>

        <section className="full-section" id="full">
          <div className="editorial-heading"><div className="editorial-label"><span className="editorial-index">02</span> CORONARY EXPLORER</div><div className="editorial-heading-grid"><h2>From prediction to perspective.</h2><p>Review vessel-specific model estimates, explore the coronary map and compare the results of a complete clinical assessment.</p></div></div>
          <div className="full-toolbar"><div className="full-mode"><ScanHeart size={18}/><div><strong>Comprehensive analysis</strong><span>Required for LAD, LCX and RCA estimates</span></div></div><div className="full-toolbar-buttons"><button className="button-outline-dark" onClick={() => setDrawer(true)}>Enter full clinical data <ArrowUpRight size={15}/></button><button className="button-outline-dark" onClick={runExample} disabled={busy}>{busy?"Loading…":"Use example record"}</button></div></div>

          {quickResult && !fullResult && <div className="quick-bridge"><HeartPulse size={21}/><p><strong>Quick CAD assessment: {quickResult.predicted_label} · {(quickResult.positive_probability*100).toFixed(1)}% model score.</strong><br/>This assessment doesn't predict stenosis in specific vessels. Use comprehensive analysis for that view.</p><button onClick={()=>setDrawer(true)}>Open full assessment <ArrowRight size={15}/></button></div>}

          <div className="cv-analytics-grid">
            <FullComparison scores={fullScores} selected={selected} onChoose={setSelected}/>
            <section className="cv-insight-card cv-focused-anatomy">
              <div className="cv-insight-head"><div><span className="cv-eyebrow">SELECTED VESSEL · 3D VIEW</span><h4>{selected} — {NAMES[selected]}</h4></div><button className="cv-focus-reset" type="button" onClick={()=>setResetKey(k=>k+1)} aria-label="Reset camera"><RotateCcw size={17}/></button></div>
              <div className="cv-mini-heart"><HeartScene focusMode selected={selected} probabilities={probabilities} onSelect={setSelected} resetKey={resetKey}/></div>
              <p className="cv-focus-description">{TERRITORIES[selected].anatomy} {TERRITORIES[selected].context}</p>
              <p className="cv-caption">Highlighted lines are approximate anatomical reference traces, not measured lesion locations.</p>
            </section>
            <section className="cv-insight-card cv-selected-report">
              <div className="cv-insight-head"><div><span className="cv-eyebrow">VESSEL ASSESSMENT</span><h4>{selected} prediction</h4></div><ShieldCheck size={19}/></div>
              <div className="cv-vessel-score">{selectedResult ? `${(selectedResult.positive_probability*100).toFixed(1)}%` : "—"}</div>
              <p className="cv-vessel-label">Model-estimated positive-class probability</p>
              <span className="cv-status-pill">{selectedResult?.predicted_label ?? "Awaiting full assessment"}</span>
              <div className="cv-selected-divider"/>
              <h5>What this vessel supplies</h5><p>{TERRITORIES[selected].context}</p>
              <h5>Clinical interpretation</h5><p>Inspect the model's patient-level feature contributions below. A model probability is not a measurement of narrowing or its precise location.</p>
              <small>MODEL: {selectedResult?.model_type ?? "Not run"}</small>
            </section>
          </div>
          {fullResult && <div className="cv-detail-grid">
            <ContributionChart explanation={fullResult.explanations?.[selected]} title={`What influenced the ${selected} model?`}/>
            <CohortComparison cohort={fullResult.cohort}/>
            <ClinicalSnapshot data={lastFullInput}/>
          </div>}
          {fullResult && <ScopeHint/>}
          {error && <div className="error-notice" role="alert">{error}</div>}
        </section>

        <HeartDiscovery/>

        <Methods/>
      </main>

      <footer className="site-footer"><a className="footer-brand" href="#top"><HeartLogo/> cardiovision.ai</a><p>Cardiovascular intelligence with visible limits. <a href="#technical-appendix">Evaluation &amp; intended use</a></p><span>© 2026 CardioVision</span></footer>

      {drawer && <div className="drawer-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setDrawer(false)}}><section className="assessment-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title"><div className="drawer-heading"><div><span className="panel-eyebrow">COMPREHENSIVE ANALYSIS</span><h2 id="drawer-title">Clinical data</h2><p>Complete the required measurements for all four target-specific models.</p></div><button className="icon-button" onClick={()=>setDrawer(false)} aria-label="Close"><X size={23}/></button></div><div className="drawer-scroll">{!connected && <div className="quick-error">Start the FastAPI backend to load the feature schema.</div>}{GROUPS.map(group=>{const fs=features.filter(f=>groupFor(f.name)===group);if(!fs.length)return null;return <section className="form-group" key={group}><h3>{group}</h3><div className="input-grid">{fs.map(f=><label className="clinical-field" key={f.name}><span>{f.name}</span>{f.type==="categorical"?<select value={values[f.name]??""} onChange={e=>setValues(p=>({...p,[f.name]:e.target.value}))}><option value="">Select</option>{f.options?.map(o=><option key={o} value={o}>{o}</option>)}</select>:<input type="number" step="any" placeholder="Enter value" value={values[f.name]??""} onChange={e=>setValues(p=>({...p,[f.name]:e.target.value}))}/>}</label>)}</div></section>})}</div><div className="drawer-bottom">{error && <div className="drawer-error" role="alert">{error}</div>}<button className="button-outline-dark" onClick={async()=>{setError("");try{const r=await fetch(`${API}/api/demo-case`);if(!r.ok)throw Error("Demo unavailable");const data=await r.json();setValues(Object.fromEntries(Object.entries(data.features).map(([k,v])=>[k,String(v)])));}catch(e){setError(e instanceof Error?e.message:"Unable to load example")}}}>Prefill example</button><button className="submit-assessment" disabled={!connected||busy} onClick={submitFull}>{busy?"Analyzing…":"Analyze all vessels"}<ArrowRight size={16}/></button></div></section></div>}
    </div>
  );
}

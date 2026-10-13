import {useCallback,useEffect,useState} from "react";
import type {FormEvent} from "react";
import {Activity, ArrowLeft, ArrowRight, ClipboardList, Download, FileHeart, FilePlus2, HeartPulse, LockKeyhole, LogOut, MessageSquareHeart, Plus, ShieldCheck, Stethoscope, UserRound, Users, UploadCloud} from "lucide-react";
import HeartScene from "./HeartScene";
import type {Vessel} from "./HeartScene";

const TARGETS=["CAD","LAD","LCX","RCA"] as const;
type Target=typeof TARGETS[number];
type Role="doctor"|"patient";
type User={id:string;email:string;display_name:string;role:Role};
type Link={id:string;email:string;display_name:string;linked_at:string};
type Field={name:string;label:string;unit:string|null;type:"number"|"select";options:(string|number)[]};
type Prediction={positive_probability:number;predicted_label:string;model_type?:string};
type Driver={feature:string;contribution:number};
type Explanation={method?:string;unit?:string;drivers?:Driver[]};
type Results={predictions:Record<Target,Prediction>;explanations?:Partial<Record<Target,Explanation>>;cohort?:{sample_size?:number;age_band?:string};model_method?:string};
type Assessment={id:string;created_at:string;author_id:string;inputs:Record<string,string|number>;results:Results};
type DocumentRow={id:string;name:string;bytes:number;content_type:string;created_at:string};
type Plan={id:string;title:string;actions:string;follow_up:string;created_at:string};
type Note={id:string;note:string;visible_to_patient:number;created_at:string};
type Overview={patient:{id:string;display_name:string;email:string};assessments:Assessment[];documents:DocumentRow[];plans:Plan[];notes:Note[];clinicians:{id:string;display_name:string}[]};
const INPUT_LABELS:Record<string,string>={Age:"Age",Sex:"Sex",BMI:"Body mass index",DM:"Diabetes history",HTN:"Hypertension history","Current Smoker":"Current smoking",ChestPainType:"Chest pain pattern",Dyspnea:"Breathlessness",BP:"Blood pressure",PR:"Pulse rate","Typical Chest Pain":"Typical chest pain",Atypical:"Atypical chest pain",Nonanginal:"Non-anginal chest pain"};
const EXAMPLE:Record<string,string>={Age:"52",Sex:"Male",BMI:"26.2",DM:"0",HTN:"1","Current Smoker":"0",ChestPainType:"typical",Dyspnea:"N",BP:"132",PR:"76"};
const numKeys=new Set(["Age","BMI","DM","HTN","Current Smoker","BP","PR"]);
const formatDate=(value:string)=>new Date(value).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});
const pct=(v:number)=>Number.isFinite(v)?`${(v*100).toFixed(1)}%`:"—";

export default function CarePortal({apiBase}:{apiBase:string}){
  const [token,setToken]=useState(()=>sessionStorage.getItem("cardiovision_care_session")||"");
  const [user,setUser]=useState<User|null>(null);
  const [loading,setLoading]=useState(Boolean(token));
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [links,setLinks]=useState<Link[]>([]);
  const [selectedId,setSelectedId]=useState("");
  const [overview,setOverview]=useState<Overview|null>(null);
  const [activePage,setActivePage]=useState<"overview"|"assess"|"explain"|"files"|"plans">("overview");
  const [refresh,setRefresh]=useState(0);
  const [sharing,setSharing]=useState("");
  const [connect,setConnect]=useState("");
  const [busy,setBusy]=useState(false);

  const request=useCallback(async <T,>(path:string,method="GET",body?:unknown,raw?:File):Promise<T>=>{
    const response=await fetch(`${apiBase}/api/care${path}`,{
      method,
      headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(raw?{"Content-Type":raw.type||"application/octet-stream"}:body!==undefined?{"Content-Type":"application/json"}:{})},
      body:raw??(body!==undefined?JSON.stringify(body):undefined),
      cache:"no-store",
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(typeof data?.detail==="string"?data.detail:`Server returned ${response.status}`);
    return data as T;
  },[token,apiBase]);

  useEffect(()=>{
    if(!token){setUser(null);setLoading(false);return;}
    let cancelled=false;setLoading(true);
    request<{user:User}>("/me").then(v=>{if(!cancelled){setUser(v.user);setError("");}})
      .catch(e=>{if(!cancelled){setToken("");sessionStorage.removeItem("cardiovision_care_session");setError(e.message);}})
      .finally(()=>{if(!cancelled)setLoading(false)});
    return()=>{cancelled=true};
  },[token,request]);
  useEffect(()=>{
    if(!user)return;
    request<{links:Link[]}>("/links").then(v=>setLinks(v.links)).catch(e=>setError(e.message));
  },[user,request,refresh]);
  useEffect(()=>{
    if(!user)return;
    if(user.role==="patient")setSelectedId(user.id);
    else if(links.length>0&&(!selectedId||!links.some(l=>l.id===selectedId)))setSelectedId(links[0].id);
    else if(!links.length&&user.role==="doctor")setSelectedId("");
  },[user,links,selectedId]);
  useEffect(()=>{
    if(!user||!selectedId){setOverview(null);return;}
    request<Overview>(`/patients/${selectedId}/overview`).then(setOverview).catch(e=>{setOverview(null);setError(e.message)});
  },[user,selectedId,request,refresh]);
  const reload=()=>setRefresh(v=>v+1);
  const handleAuth=(newToken:string,newUser:User)=>{sessionStorage.setItem("cardiovision_care_session",newToken);setToken(newToken);setUser(newUser);setError("");setNotice("");};
  const signOut=async()=>{try{await request("/logout","POST");}catch{}sessionStorage.removeItem("cardiovision_care_session");setToken("");setUser(null);setOverview(null);setSelectedId("");setLinks([]);};
  const act=async(run:()=>Promise<unknown>,success:string)=>{setError("");setNotice("");setBusy(true);try{await run();setNotice(success);reload();}catch(e){setError(e instanceof Error?e.message:"Request failed");}finally{setBusy(false)}};
  const patientId=user?.role==="patient"?user.id:selectedId;

  return <div className="care-root">
    <div className="care-topbar"><a href="/" className="care-brand"><HeartPulse size={25}/> cardio<span>vision.ai</span><small>CARE WORKSPACE</small></a><div className="care-top-actions"><span className="care-app-label">Research-stage connected care</span><a className="care-back" href="/"><ArrowLeft size={16}/> Coronary explorer</a>{user&&<button type="button" onClick={signOut}><LogOut size={16}/> Sign out</button>}</div></div>
    {loading?<div className="care-center"><Activity className="care-spin"/> Loading workspace…</div>:!user?
      <AuthCard apiBase={apiBase} error={error} onAuthenticated={handleAuth}/>:
      <div className="care-layout">
        <aside className="care-sidebar"><div className="care-user-badge"><div className="care-avatar">{user.display_name.slice(0,1).toUpperCase()}</div><div><strong>{user.display_name}</strong><span>{user.role==="doctor"?"Clinician workspace":"Patient workspace"}</span></div></div>
          <div className="care-sidebar-kicker">WORKSPACE</div>
          {([{id:"overview",label:user.role==="doctor"?"Patient overview":"My health overview",icon:<HeartPulse size={18}/>},{id:"assess",label:"Run CAD assessment",icon:<Activity size={18}/>},{id:"explain",label:"Clinical explanations",icon:<ClipboardList size={18}/>},{id:"files",label:"Lab reports & files",icon:<FileHeart size={18}/>},{id:"plans",label:user.role==="doctor"?"Recommendations & plans":"Doctor recommendations",icon:<MessageSquareHeart size={18}/>} ] as const).map(item=><button key={item.id} type="button" className={activePage===item.id?"care-nav-active":""} onClick={()=>setActivePage(item.id)}>{item.icon}{item.label}</button>)}
          <div className="care-sidebar-note"><ShieldCheck size={20}/><strong>Private by default</strong><p>Records are available only to the patient and explicitly linked clinician accounts. Demo only.</p></div>
        </aside>
        <main className="care-main"><div className="care-main-head"><div><div className="care-kicker">{user.role==="doctor"?"CLINICIAN EXPERIENCE":"PATIENT EXPERIENCE"} · CONNECTED CARE</div><h1>{activePage==="overview"?"One place for every next step.":activePage==="assess"?"Coronary assessment.":activePage==="explain"?"Understand the signals.":activePage==="files"?"Your clinical documents.":"Care that stays connected."}</h1><p>{user.role==="doctor"?"Review a linked patient's assessment history, reports and care plan in one workspace.":"Track assessments and files, review clinician notes and understand your next steps."}</p></div><div className="care-profile-tag"><ShieldCheck size={16}/> {user.role==="doctor"?"Consent-linked records":"Your private record"}</div></div>
          {error&&<div role="alert" className="care-flash care-error">{error}<button onClick={()=>setError("")}>Dismiss</button></div>}
          {notice&&<div className="care-flash care-success">{notice}<button onClick={()=>setNotice("")}>Dismiss</button></div>}
          {user.role==="doctor"&&<div className="care-panel care-patient-selector"><div><div className="care-kicker">ACTIVE PATIENT</div><select aria-label="Select linked patient" value={selectedId} onChange={e=>setSelectedId(e.target.value)}><option value="">Select a consent-linked patient</option>{links.map(link=><option key={link.id} value={link.id}>{link.display_name} · {link.email}</option>)}</select></div><form onSubmit={e=>{e.preventDefault();act(()=>request("/connect-patient","POST",{share_code:connect.trim()}),"Patient securely linked to your workspace.");setConnect("");}}><label>Connect using a patient's temporary share code</label><div className="care-inline"><input aria-label="Share code" required value={connect} onChange={e=>setConnect(e.target.value)} placeholder="Paste a patient-provided code"/><button disabled={busy}>Connect</button></div></form></div>}
          {user.role==="patient"&&<div className="care-share-strip"><div><strong>Share access with your doctor</strong><span>Generate a one-time code, valid for 30 minutes. You can revoke access anytime.</span></div><button onClick={()=>act(async()=>{const x=await request<{share_code:string}>("/share-invite","POST");setSharing(x.share_code);},"One-time share code created.")} disabled={busy}><Users size={17}/> Generate code</button>{sharing&&<div className="care-share-code"><code>{sharing}</code><button onClick={()=>navigator.clipboard?.writeText(sharing)}>Copy</button></div>}</div>}
          {user.role==="patient"&&links.length>0&&<div className="care-small-link-list"><strong>Clinicians with access:</strong>{links.map(l=><span key={l.id}>{l.display_name} <button onClick={()=>act(()=>request(`/links/${l.id}`,"DELETE"),"Clinician access revoked.")}>Revoke</button></span>)}</div>}
          {!patientId||!overview?<div className="care-empty care-panel"><Users size={38}/><h3>{user.role==="doctor"?"Connect with a patient":"Loading your records"}</h3><p>{user.role==="doctor"?"Ask the patient to sign in and generate a one-time share code. Their records are never visible without consent.":"Your workspace will appear after your record loads."}</p></div>:
          <>
            {activePage==="overview"&&<OverviewPage data={overview} role={user.role} onNavigate={setActivePage}/>}
            {activePage==="assess"&&<AssessmentPage apiBase={apiBase} patientId={patientId} role={user.role} save={data=>request("/assessments","POST",data)} onSaved={()=>{reload();setActivePage("explain")}}/>}
            {activePage==="explain"&&<ExplanationPage overview={overview}/>}
            {activePage==="files"&&<FilesPage data={overview} busy={busy} onUpload={(file)=>act(()=>request(`/patients/${patientId}/documents?name=${encodeURIComponent(file.name)}`,"POST",undefined,file),"File uploaded to patient record.")} onDownload={async(doc)=>{try{const response=await fetch(`${apiBase}/api/care/documents/${doc.id}/download`,{headers:{Authorization:`Bearer ${token}`},cache:"no-store"});if(!response.ok)throw new Error(`Download failed (${response.status})`);const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=doc.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setError(e instanceof Error?e.message:'Download error')}}}/>}
            {activePage==="plans"&&<PlansPage data={overview} doctor={user.role==="doctor"} busy={busy} onPlan={(title,actions,follow_up)=>act(()=>request('/plans','POST',{patient_id:patientId,title,actions,follow_up}),"Care plan published for patient review.")} onNote={(note,visible)=>act(()=>request('/notes','POST',{patient_id:patientId,note,visible_to_patient:visible}),"Clinical note saved.")}/>}
          </>}
          <div className="care-footer-note">For supervised demonstration and research only. This software does not diagnose coronary disease, prescribe treatment or replace clinician judgment. Do not enter real patient data on an unapproved deployment.</div>
        </main>
      </div>}
  </div>;
}

function AuthCard({apiBase,error,onAuthenticated}:{apiBase:string;error:string;onAuthenticated:(token:string,user:User)=>void}){
  const [mode,setMode]=useState<"login"|"signup">("login");
  const [role,setRole]=useState<Role>("patient");
  const [email,setEmail]=useState("");const [name,setName]=useState("");const [password,setPassword]=useState("");const [doctorInvite,setDoctorInvite]=useState("");
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState(error);const [ok,setOk]=useState("");
  useEffect(()=>setMessage(error),[error]);
  async function submit(e:FormEvent){e.preventDefault();setBusy(true);setMessage("");setOk("");try{
    const path=mode==="login"?"login":"signup";
    const response=await fetch(`${apiBase}/api/care/${path}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(mode==="login"?{email,password}:{email,password,display_name:name,role,doctor_invite:doctorInvite})});
    const data=await response.json();if(!response.ok)throw new Error(data.detail||`HTTP ${response.status}`);
    if(mode==="signup"){setOk('Account created. Please sign in.');setMode('login');setPassword('')}else onAuthenticated(data.access_token,data.user);
  }catch(e){setMessage(e instanceof Error?e.message:'Unable to authenticate')}finally{setBusy(false)}}
  return <main className="care-auth-wrap"><div className="care-auth-story"><span className="care-kicker">CARDIOVISION · CONTINUITY OF CARE</span><h1>A clearer picture of patient health. <em>Shared with the right people.</em></h1><p>One connected workspace for patient documents, longitudinal assessments, clinician review and understandable coronary model explanations.</p><div className="care-benefits"><div><FileHeart/><strong>Patient records</strong><span>Reports, files and personal history in one view</span></div><div><Stethoscope/><strong>Doctor oversight</strong><span>Consent-linked patient monitoring and recommendations</span></div><div><Activity/><strong>Model insight</strong><span>CAD, LAD, LCX and RCA alongside interpretable factors</span></div></div></div>
    <section className="care-auth-card"><div className="care-auth-top"><div className="care-icon-circle"><LockKeyhole/></div><span className="care-kicker">SECURE ACCESS</span><h2>{mode==="login"?"Welcome back.":"Create a workspace."}</h2><p>{mode==="login"?"Sign in to access your consent-linked clinical workspace.":"Select a role and create your research-demo account."}</p></div>
      <div className="care-auth-tabs"><button className={mode==="login"?"active":""} onClick={()=>setMode('login')}>Sign in</button><button className={mode==="signup"?"active":""} onClick={()=>setMode('signup')}>Create account</button></div>
      <form onSubmit={submit}>{mode==="signup"&&<><label>Account type</label><div className="care-role-choice"><button type="button" className={role==="patient"?"active":""} onClick={()=>setRole('patient')}><UserRound size={17}/> Patient</button><button type="button" className={role==="doctor"?"active":""} onClick={()=>setRole('doctor')}><Stethoscope size={17}/> Doctor</button></div><label htmlFor="care-name">Full name</label><input id="care-name" required minLength={2} maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="Name"/>{role==="doctor"&&<><label htmlFor="care-invite">Clinician onboarding code</label><input id="care-invite" required value={doctorInvite} onChange={e=>setDoctorInvite(e.target.value)} placeholder="Issued by the project administrator"/><p className="care-auth-help">Doctor access requires an administrator-controlled invitation. This is not a medical licensing verification service.</p></>}</>}
        <label htmlFor="care-email">Email address</label><input id="care-email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/>
        <label htmlFor="care-password">Password</label><input id="care-password" type="password" autoComplete={mode==="signup"?"new-password":"current-password"} minLength={mode==="signup"?12:undefined} required value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode==="signup"?"At least 12 characters":"Enter your password"}/>
        {message&&<div className="care-inline-error" role="alert">{message}</div>}{ok&&<div className="care-inline-success">{ok}</div>}
        <button className="care-primary care-auth-submit" disabled={busy}>{busy?"Please wait…":mode==="signup"?"Create account":"Sign in securely"}<ArrowRight size={17}/></button>
      </form><p className="care-auth-fine">Research-stage environment. Use synthetic information only until approved security, storage and clinical governance are in place.</p></section></main>;
}

function Stat({label,value,sub}:{label:string;value:string;sub:string}){return <div className="care-stat"><span>{label}</span><strong>{value}</strong><small>{sub}</small></div>}
function OverviewPage({data,role,onNavigate}:{data:Overview;role:Role;onNavigate:(v:"overview"|"assess"|"explain"|"files"|"plans")=>void}){
 const latest=data.assessments[0];
 return <><div className="care-stats"><Stat label="Assessments" value={String(data.assessments.length)} sub="Saved research results"/><Stat label="Lab documents" value={String(data.documents.length)} sub="Private files"/><Stat label="Clinical plans" value={String(data.plans.length)} sub="Clinician authored"/><Stat label="Connected clinicians" value={String(data.clinicians.length)} sub="Patient-authorized"/></div>
 <div className="care-feature-grid"><section className="care-panel"><div className="care-panel-title"><div><span className="care-kicker">LATEST ASSESSMENT</span><h3>{latest?"Four-model coronary profile":"Ready for a baseline assessment"}</h3></div><Activity/></div>{latest?<><div className="care-four-scores">{TARGETS.map(t=><div key={t}><span>{t}</span><strong>{pct(latest.results.predictions[t]?.positive_probability)}</strong><div className="care-score-track"><i style={{width:pct(latest.results.predictions[t]?.positive_probability??0)}}/></div></div>)}</div><p className="care-meta">Recorded {formatDate(latest.created_at)} · Exploratory model outputs</p></>:<p className="care-empty-note">Complete the questionnaire to generate the first research assessment for this patient.</p>}<button className="care-text-button" onClick={()=>onNavigate(latest?"explain":"assess")}>{latest?"Explore clinical explanations":"Start assessment"}<ArrowRight size={16}/></button></section>
 <section className="care-panel"><div className="care-panel-title"><div><span className="care-kicker">CARE CONTINUITY</span><h3>{role==="doctor"?"Patient record timeline":"Your care timeline"}</h3></div><ClipboardList/></div><div className="care-timeline">{[...data.plans.map(p=>({label:p.title,detail:'Clinician action plan',date:p.created_at})),...data.documents.map(d=>({label:d.name,detail:'Report uploaded',date:d.created_at})),...data.assessments.map(a=>({label:'Four-model assessment',detail:'Prediction record saved',date:a.created_at}))].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4).map((x,i)=><div key={`${x.label}${i}`}><span/><div><strong>{x.label}</strong><small>{x.detail} · {formatDate(x.date)}</small></div></div>)}{data.plans.length+data.documents.length+data.assessments.length===0&&<p className="care-empty-note">Your first uploaded report, prediction or doctor plan will appear here.</p>}</div><button className="care-text-button" onClick={()=>onNavigate("plans")}>Review care plans <ArrowRight size={16}/></button></section></div>
 <section className="care-panel care-next-steps"><div><span className="care-kicker">YOUR NEXT STEP</span><h3>{role==="doctor"?"A continuous record, not a one-time prediction.":"Stay informed between appointments."}</h3><p>Review previous inputs and uploaded reports alongside clinician-authored recommendations. Research model scores must never replace clinical judgment or emergency assessment.</p></div><div className="care-next-buttons"><button onClick={()=>onNavigate('files')}><UploadCloud size={18}/> Open files</button><button onClick={()=>onNavigate('assess')}><Activity size={18}/> New assessment</button></div></section></>;
}

function AssessmentPage({apiBase,patientId,role,save,onSaved}:{apiBase:string;patientId:string;role:Role;save:(data:{patient_id:string;inputs:Record<string,string|number>;results:Results})=>Promise<unknown>;onSaved:()=>void}){
 const [fields,setFields]=useState<Field[]>([]);const [values,setValues]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 useEffect(()=>{let cancelled=false;fetch(`${apiBase}/api/quick/schema`).then(async r=>{if(!r.ok)throw Error(`Assessment service HTTP ${r.status}`);return r.json()}).then(r=>{if(!cancelled)setFields(r.input_fields)}).catch(e=>{if(!cancelled)setError(e.message)});return()=>{cancelled=true}},[apiBase]);
 const total=fields.filter(f=>values[f.name]?.trim()).length;
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{
  const inputs:Record<string,string|number>={};for(const f of fields)inputs[f.name]=numKeys.has(f.name)?Number(values[f.name]):values[f.name];
  const res=await fetch(`${apiBase}/api/quick/predict`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({features:inputs})});
  const result=await res.json();if(!res.ok)throw Error(typeof result.detail==='string'?result.detail:'Model prediction unavailable');
  if(TARGETS.some(k=>!Number.isFinite(result.predictions?.[k]?.positive_probability)))throw Error('All four model results are required');
  await save({patient_id:patientId,inputs,results:result});onSaved();
 }catch(e){setError(e instanceof Error?e.message:'Unable to run assessment')}finally{setBusy(false)}}
 return <div className="care-panel care-assessment"><div className="care-panel-title"><div><span className="care-kicker">SAME VALIDATED API PATH · NO ML MODEL CHANGES</span><h3>{role==="doctor"?"Assess the selected patient":"Create a new assessment"}</h3></div><span className="care-counter">{total} / {fields.length||10} complete</span></div><p className="care-subtext">The same ten structured answers are sent to the existing four-model research endpoint, then saved in the patient's longitudinal workspace. Use synthetic test values only for this demonstration.</p>
  <div className="care-assessment-controls"><button type="button" onClick={()=>setValues(EXAMPLE)}>Use synthetic example</button><button type="button" onClick={()=>setValues({})}>Clear all</button></div>
  <form onSubmit={submit}><div className="care-form-grid">{fields.map(f=><label key={f.name}><span>{f.label}{f.unit&&<small> · {f.unit}</small>}</span>{f.type==='select'?<select required value={values[f.name]??''} onChange={e=>setValues({...values,[f.name]:e.target.value})}><option value="">Choose an option</option>{f.options.map(o=><option key={String(o)} value={String(o)}>{f.name==='Sex'&&o==='Fmale'?'Female':(f.name==='DM'||f.name==='HTN'||f.name==='Current Smoker')?(o===1?'Yes':'No'):f.name==='Dyspnea'?(o==='Y'?'Yes':'No'):f.name==='ChestPainType'?String(o).replace('_unspecified',' / unspecified'):String(o)}</option>)}</select>:<input required type="number" step="any" min={{Age:18,BMI:10,BP:60,PR:30}[f.name as 'Age'|'BMI'|'BP'|'PR']} max={{Age:110,BMI:70,BP:260,PR:220}[f.name as 'Age'|'BMI'|'BP'|'PR']} value={values[f.name]??''} onChange={e=>setValues({...values,[f.name]:e.target.value})} placeholder="Enter value"/>}</label>)}</div>
   {error&&<p className="care-inline-error">{error}</p>}<div className="care-assessment-submit"><span>Results are model-derived estimates, not diagnosis or artery-narrowing measurements.</span><button className="care-primary" disabled={busy||fields.length!==10||total!==10}>{busy?'Generating four outputs…':'Generate & save assessment'} <ArrowRight size={16}/></button></div>
  </form></div>;
}

function ExplanationPage({overview}:{overview:Overview}){
 const [selectedIndex,setSelectedIndex]=useState(0);const [target,setTarget]=useState<Target>('CAD');
 const assessments=overview.assessments;const assessment=assessments[Math.min(selectedIndex,assessments.length-1)];
 const scores=assessment?.results.predictions;const explanation=assessment?.results.explanations?.[target];
 const cohort=assessment?.results.cohort;const values=assessment?.inputs;
 const drivers=(explanation?.drivers||[]).slice(0,7);const strongest=Math.max(...drivers.map(d=>Math.abs(d.contribution)),.001);
 const vessel=target==='CAD'?'LAD':target;
 const modelProbabilities= scores?{LAD:scores.LAD.positive_probability,LCX:scores.LCX.positive_probability,RCA:scores.RCA.positive_probability}:undefined;
 return <><div className="care-panel care-explain-head"><div><span className="care-kicker">CLINICAL EXPLANATION DASHBOARD</span><h3>Model outputs, patient physiology and what influenced the scores.</h3></div>{assessments.length>0&&<select aria-label="Select historical assessment" value={Math.min(selectedIndex,assessments.length-1)} onChange={e=>setSelectedIndex(Number(e.target.value))}>{assessments.map((a,i)=><option value={i} key={a.id}>{formatDate(a.created_at)}</option>)}</select>}</div>
 {!assessment?<div className="care-empty care-panel"><Activity size={40}/><h3>No saved assessments yet.</h3><p>Use the assessment page first. This dashboard will show four predictions and physiology after the assessment is saved.</p></div>:<>
 <div className="care-stats care-four-metrics">{TARGETS.map(t=><button className={t===target?'care-stat-selected':''} key={t} onClick={()=>setTarget(t)}><span>{t} MODEL SCORE</span><strong>{pct(scores[t].positive_probability)}</strong><small>{scores[t].predicted_label}</small></button>)}</div>
 <div className="care-feature-grid"><div className="care-panel"><div className="care-panel-title"><div><span className="care-kicker">MODEL ATTRIBUTION</span><h3>Inputs influencing {target}</h3></div><Activity/></div><p className="care-subtext">{explanation?.method||'Feature contribution analysis'} · {target==='CAD'?'SHAP where supported':'Reference-substitution sensitivity, not SHAP/LIME'}.</p>
 <div className="care-driver-bars">{drivers.map(d=><div key={d.feature}><span>{INPUT_LABELS[d.feature]||d.feature}</span><div className="care-driver-track"><i className={d.contribution>=0?'up':'down'} style={{width:`${Math.abs(d.contribution)/strongest*100}%`}}/></div><b>{d.contribution>=0?'+':''}{d.contribution.toFixed(3)}</b></div>)}{drivers.length===0&&<p>No explanation data available for this assessment.</p>}</div><p className="care-explain-caveat">Contributions describe the behaviour of the research model, not the cause of a disease or a personalized treatment recommendation.</p></div>
 <div className="care-panel"><div className="care-panel-title"><div><span className="care-kicker">PHYSIOLOGICAL BREAKDOWN</span><h3>Patient-reported clinical inputs</h3></div><HeartPulse/></div><div className="care-physiology">{[{k:'Age',unit:'years'},{k:'BMI',unit:'kg/m²'},{k:'BP',unit:'mmHg'},{k:'PR',unit:'beats/min'}].map(item=><div key={item.k}><span>{INPUT_LABELS[item.k]}</span><strong>{String(values[item.k]??'—')} <small>{item.unit}</small></strong></div>)}</div>
 <div className="care-history-tags">{['DM','HTN','Current Smoker','Dyspnea'].map(k=><span key={k}><strong>{INPUT_LABELS[k]}</strong>{String(values[k])==='1'||values[k]==='Y'?'Reported':'Not reported'}</span>)}</div><div className="care-context-note">{cohort?.sample_size?`Reference: ${cohort.sample_size} development-dataset records in the ${cohort.age_band} age band.`:'Age-matched dataset context is unavailable for this assessment.'} This is descriptive context, not a clinical reference interval.</div></div></div>
 <div className="care-feature-grid"><div className="care-panel care-heart-panel"><div className="care-panel-title"><div><span className="care-kicker">INTERACTIVE 3D ANATOMY</span><h3>Selected vessel · {vessel}</h3></div><HeartPulse/></div><div className="care-3d-frame cv-focused-anatomy"><HeartScene focusMode selected={vessel as Vessel} probabilities={modelProbabilities} onSelect={v=>setTarget(v)} resetKey={0}/></div><p className="care-explain-caveat">Illustrative coronary anatomy only; artery highlight does not identify a lesion from patient imaging.</p></div>
 <div className="care-panel"><div className="care-panel-title"><div><span className="care-kicker">LONGITUDINAL REVIEW</span><h3>Assessment history</h3></div><ClipboardList/></div><div className="care-assessment-history">{assessments.slice(0,8).map(a=><div key={a.id}><span>{formatDate(a.created_at)}</span><div>{TARGETS.map(t=><small key={t}>{t} <b>{pct(a.results.predictions[t]?.positive_probability)}</b></small>)}</div></div>)}</div><p className="care-explain-caveat">Comparisons show changes in exploratory classifier outputs, not disease progression or treatment effectiveness.</p></div></div></>}
 </>;
}

function FilesPage({data,busy,onUpload,onDownload}:{data:Overview;busy:boolean;onUpload:(file:File)=>void;onDownload:(doc:DocumentRow)=>void}){
 const [file,setFile]=useState<File|null>(null);
 return <><section className="care-panel"><div className="care-panel-title"><div><span className="care-kicker">LABS & DOCUMENT VAULT</span><h3>Upload and review reports</h3></div><FilePlus2/></div><p className="care-subtext">PDF, JPEG or PNG up to 6 MB. Uploaded documents can be reviewed by the patient and clinicians with active consent. Demo environment: never upload real protected health records until persistent, approved storage is configured.</p><div className="care-upload-row"><input aria-label="Select PDF or image" type="file" accept="application/pdf,image/png,image/jpeg" onChange={e=>setFile(e.target.files?.[0]||null)}/><button className="care-primary" disabled={busy||!file} onClick={()=>{if(file){onUpload(file);setFile(null)}}}><UploadCloud size={16}/> Upload file</button></div></section>
 <section className="care-panel"><div className="care-panel-title"><div><span className="care-kicker">DOCUMENT HISTORY</span><h3>{data.documents.length} uploaded documents</h3></div><FileHeart/></div><div className="care-document-list">{data.documents.map(d=><div key={d.id}><div className="care-doc-icon"><FileHeart size={18}/></div><div><strong>{d.name}</strong><span>{formatDate(d.created_at)} · {(d.bytes/1024).toFixed(0)} KB</span></div><button onClick={()=>onDownload(d)}><Download size={16}/> Download</button></div>)}{data.documents.length===0&&<p className="care-empty-note">No files uploaded yet. Use the upload field to add synthetic sample reports for your demo.</p>}</div></section></>;
}

function PlansPage({data,doctor,busy,onPlan,onNote}:{data:Overview;doctor:boolean;busy:boolean;onPlan:(title:string,actions:string,followUp:string)=>void;onNote:(note:string,visible:boolean)=>void}){
 const [title,setTitle]=useState('');const [actions,setActions]=useState('');const [followUp,setFollowUp]=useState('');const [note,setNote]=useState('');const [visible,setVisible]=useState(true);
 return <><div className="care-feature-grid"><section className="care-panel"><div className="care-panel-title"><div><span className="care-kicker">CLINICIAN ACTION PLANS</span><h3>{doctor?'Publish recommendations':'Recommendations from your doctor'}</h3></div><MessageSquareHeart/></div>{doctor&&<form className="care-plan-form" onSubmit={e=>{e.preventDefault();onPlan(title,actions,followUp);setTitle('');setActions('');setFollowUp('')}}><label>Plan title</label><input required minLength={3} maxLength={120} value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Follow-up after laboratory review"/><label>Clinician-authored actions</label><textarea required minLength={5} maxLength={3500} rows={5} value={actions} onChange={e=>setActions(e.target.value)} placeholder="Document appropriate agreed follow-up steps; no AI-generated prescribing."/><label>Follow-up date or timing (optional)</label><input value={followUp} maxLength={120} onChange={e=>setFollowUp(e.target.value)} placeholder="e.g. Review in 2 weeks"/><button className="care-primary" disabled={busy}><Plus size={16}/> Publish plan</button></form>}
 <div className="care-plan-list">{data.plans.map(p=><article key={p.id}><span>{formatDate(p.created_at)}</span><h4>{p.title}</h4><p>{p.actions}</p>{p.follow_up&&<small>Follow-up: {p.follow_up}</small>}</article>)}{data.plans.length===0&&<p className="care-empty-note">{doctor?'No action plans yet. Publish the first structured plan here.':'Your doctor has not published a plan yet.'}</p>}</div></section>
 <section className="care-panel"><div className="care-panel-title"><div><span className="care-kicker">CONSULTATION NOTES</span><h3>Doctor observations</h3></div><ClipboardList/></div>{doctor&&<form className="care-plan-form" onSubmit={e=>{e.preventDefault();onNote(note,visible);setNote('')}}><label>Clinical note</label><textarea required minLength={3} maxLength={3000} rows={5} value={note} onChange={e=>setNote(e.target.value)} placeholder="Review notes, patient concerns, follow-up items"/><label className="care-checkbox"><input type="checkbox" checked={visible} onChange={e=>setVisible(e.target.checked)}/> Visible to patient</label><button className="care-primary" disabled={busy}>Save note <ArrowRight size={16}/></button></form>}
 <div className="care-plan-list">{data.notes.map(n=><article key={n.id}><span>{formatDate(n.created_at)} · {n.visible_to_patient?'Shared note':'Clinician-only note'}</span><p>{n.note}</p></article>)}{data.notes.length===0&&<p className="care-empty-note">No doctor notes available yet.</p>}</div></section></div></>;
}

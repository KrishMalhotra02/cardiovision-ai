import { Database, GitBranch, ShieldCheck, ChartColumnIncreasing, FileDown } from "lucide-react";
const evidence = [
  {id:"01",icon:Database,title:"Clinical data",desc:"303 de-identified records and 59 source columns: 55 eligible candidate inputs plus the four CAD / coronary-vessel labels. All four target columns were excluded from the model inputs."},
  {id:"02",icon:GitBranch,title:"Feature engineering",desc:"Checked missingness, constants, redundancy and associations. BMI is fully derivable from height and weight; Exertional CP is constant; correlated clinical measurements were reviewed. Tested four interactions, none showed a consistent benefit."},
  {id:"03",icon:ChartColumnIncreasing,title:"Feature selection & model choice",desc:"The 10-question form maps to 12 encoded source features, excluding Functional Class and all four target labels. A quick CAD model is paired with three separately trained vessel models. Model selection used only training-fold cross-validation; each vessel classifier was evaluated on a held-out 20% partition."},
  {id:"04",icon:ShieldCheck,title:"Per-patient interpretation",desc:"The application shows actual model outputs, local explanation contributions, and descriptive records in the same age band. The 3D heart is reference anatomy: model scores do not establish exact stenosis locations."},
];
export default function Methods(){return <section className="cv-methods" id="methods">
  <div className="editorial-heading"><div className="editorial-label"><span className="editorial-index">03</span> THE INTELLIGENCE ENGINE</div><div className="editorial-heading-grid"><h2>Evidence at every step.</h2><p>A reproducible workflow—from clinical inputs and feature engineering to independently evaluated classifiers and interpretable outputs.</p></div></div>
  <div className="cv-method-grid">{evidence.map(c=><article className="cv-method" key={c.id}><span className="cv-method-id">{c.id}</span><c.icon size={25} strokeWidth={1.6}/><h3>{c.title}</h3><p>{c.desc}</p></article>)}</div>
  <div className="cv-evidence-row"><div><strong>Feature engineering evidence</strong><p>Download the underlying cohort analysis, association rankings, interaction experiments, nested-validation results, and dataset quality checks.</p></div>
    <a href="/reports/feature_engineering_evidence.pdf" target="_blank" rel="noreferrer"><FileDown size={16}/> View analysis report</a>
  </div>
  <details className="cv-methods-technical" id="technical-appendix"><summary>Detailed model selection and test results <span>Expand</span></summary>
    <p>The interface uses four reduced-input models, each trained from the same 10 questions. The vessel-classifier algorithm was chosen using 5-fold training CV, then evaluated on a separate held-out 20% split. The CAD model was originally evaluated with nested 5-fold CV (approximate internal ROC-AUC 0.899). The following 61-record vessel holdout results are exploratory; no external cohort has been used.</p>
    <table><thead><tr><th>Target</th><th>Reduced-input model</th><th>Internal ROC-AUC</th><th>Evaluation</th></tr></thead><tbody>
      <tr><td>CAD</td><td>Quick v4 trained pipeline</td><td>0.899</td><td>Nested 5-fold CV; approximate</td></tr>
      <tr><td>LAD</td><td>Regularized logistic regression</td><td>0.760</td><td>20% held-out split (61 records)</td></tr>
      <tr><td>LCX</td><td>Regularized logistic regression</td><td>0.670</td><td>20% held-out split (61 records)</td></tr>
      <tr><td>RCA</td><td>Regularized logistic regression</td><td>0.707</td><td>20% held-out split (61 records)</td></tr>
    </tbody></table>
    <p>One dataset record has discordant CAD/vessel labels; original labels were not silently altered. The sample is small and referral-selected. Model scores have not been established as clinically calibrated or diagnostically valid.</p>
  </details>
</section>}

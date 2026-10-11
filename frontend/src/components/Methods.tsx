import { Database, GitBranch, ShieldCheck, ChartColumnIncreasing, FileDown } from "lucide-react";
const evidence = [
  {id:"01",icon:Database,title:"Clinical data",desc:"303 de-identified records and 59 source columns: 55 eligible candidate inputs plus the four CAD / coronary-vessel labels. All four target columns were excluded from the model inputs."},
  {id:"02",icon:GitBranch,title:"Feature engineering",desc:"Checked missingness, constants, redundancy and associations. BMI is fully derivable from height and weight; Exertional CP is constant; correlated clinical measurements were reviewed. Tested four interactions, none showed a consistent benefit."},
  {id:"03",icon:ChartColumnIncreasing,title:"Feature selection & model choice",desc:"Quick CAD uses 10 patient-facing questions (12 source columns after chest-pain encoding), excluding Functional Class. Five-fold nested cross-validation on the uploaded dataset gave ROC-AUC 0.899. Full CAD and vessel models were selected separately on training folds."},
  {id:"04",icon:ShieldCheck,title:"Per-patient interpretation",desc:"The application shows actual model outputs, local explanation contributions, and descriptive records in the same age band. The 3D heart is reference anatomy: model scores do not establish exact stenosis locations."},
];
export default function Methods(){return <section className="cv-methods" id="methods">
  <div className="editorial-heading"><div className="editorial-label"><span className="editorial-index">03</span> THE INTELLIGENCE ENGINE</div><div className="editorial-heading-grid"><h2>Evidence at every step.</h2><p>A reproducible workflow—from clinical inputs and feature engineering to independently evaluated classifiers and interpretable outputs.</p></div></div>
  <div className="cv-method-grid">{evidence.map(c=><article className="cv-method" key={c.id}><span className="cv-method-id">{c.id}</span><c.icon size={25} strokeWidth={1.6}/><h3>{c.title}</h3><p>{c.desc}</p></article>)}</div>
  <div className="cv-evidence-row"><div><strong>Feature engineering evidence</strong><p>Download the underlying cohort analysis, association rankings, interaction experiments, nested-validation results, and dataset quality checks.</p></div>
    <a href="/reports/feature_engineering_evidence.pdf" target="_blank" rel="noreferrer"><FileDown size={16}/> View analysis report</a>
  </div>
  <details className="cv-methods-technical" id="technical-appendix"><summary>Detailed model selection and test results <span>Expand</span></summary>
    <p>The full-feature classifiers were selected using five-fold stratified CV on the original training partition. These test results are exploratory: the original held-out split was inspected during development, and no external cohort has been used.</p>
    <table><thead><tr><th>Target</th><th>Chosen algorithm</th><th>Test ROC-AUC</th><th>Test accuracy</th></tr></thead><tbody>
      <tr><td>CAD</td><td>Gradient boosting</td><td>0.839</td><td>83.6%</td></tr>
      <tr><td>LAD</td><td>Random forest</td><td>0.830</td><td>73.8%</td></tr>
      <tr><td>LCX</td><td>Random forest</td><td>0.705</td><td>65.6%</td></tr>
      <tr><td>RCA</td><td>RBF support-vector classifier</td><td>0.736</td><td>67.2%</td></tr>
    </tbody></table>
    <p>One dataset record has discordant CAD/vessel labels; original labels were not silently altered. The sample is small and referral-selected. Model scores have not been established as clinically calibrated or diagnostically valid.</p>
  </details>
</section>}

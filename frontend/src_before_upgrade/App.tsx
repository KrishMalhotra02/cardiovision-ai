
import { useState } from "react";
import {
  Activity, ArrowUpRight, BrainCircuit,
  HeartPulse, RotateCcw, ShieldCheck,
} from "lucide-react";
import HeartScene from "./components/HeartScene";
import "./App.css";

type Vessel = "LAD" | "LCX" | "RCA";

type Prediction = {
  predicted_label: string;
  positive_probability: number;
  model_type: string;
};

type ApiResult = {
  predictions: Record<string, Prediction>;
};

const API = "http://127.0.0.1:8000";

const VESSELS: Vessel[] = ["LAD", "LCX", "RCA"];

const DESCRIPTIONS: Record<Vessel, string> = {
  LAD: "Left anterior descending artery",
  LCX: "Left circumflex artery",
  RCA: "Right coronary artery",
};

function App() {
  const [selected, setSelected] = useState<Vessel>("LAD");
  const [results, setResults] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function runDemo() {
    setLoading(true);
    setError("");

    try {
      const demoResponse = await fetch(`${API}/api/demo-case`);
      if (!demoResponse.ok) throw new Error("Demo data unavailable");

      const demo = await demoResponse.json();

      const response = await fetch(`${API}/api/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ features: demo.features }),
      });

      if (!response.ok) throw new Error("Prediction API unavailable");

      setResults(await response.json());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unexpected API error"
      );
    } finally {
      setLoading(false);
    }
  }

  const probabilities = results
    ? {
        LAD: results.predictions.LAD?.positive_probability,
        LCX: results.predictions.LCX?.positive_probability,
        RCA: results.predictions.RCA?.positive_probability,
      }
    : undefined;

  const current = results?.predictions[selected];
  const cad = results?.predictions.CAD;

  return (
    <div className="app">
      <nav className="navbar">
        <div className="brand">
          <HeartPulse size={25} strokeWidth={1.7} />
          <span>cardiovision<span className="brand-ai">.ai</span></span>
        </div>

        <div className="nav-center">
          <span className="nav-active">Explore</span>
          <span>Clinical intelligence</span>
          <span>Research platform</span>
        </div>

        <div className="nav-right">
          <span className="status-light" />
          RESEARCH PROTOTYPE
        </div>
      </nav>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="eyebrow-line" />
              CARDIOVASCULAR INTELLIGENCE
            </div>

            <h1>
              A clearer view
              <br />
              <span>of the heart.</span>
            </h1>

            <p className="lead">
              Clinical data meets interactive anatomy.
              Explore coronary artery predictions through
              machine learning and three-dimensional visualization.
            </p>

            <button
              className="main-button"
              onClick={runDemo}
              disabled={loading}
            >
              {loading ? "Analyzing..." : "Explore demo case"}
              <ArrowUpRight size={19} />
            </button>

            <div className="hero-footnote">
              <ShieldCheck size={16} />
              Educational research prototype · Not for diagnosis
            </div>
          </div>

          <div className="scene-area">
            <div className="scene-label top-left">
              <span className="small-label">ANATOMICAL EXPLORER</span>
              <strong>Heart / Coronary system</strong>
            </div>

            <HeartScene
              selected={selected}
              probabilities={probabilities}
              onSelect={setSelected}
            />

            <div className="scene-label bottom-left">
              <RotateCcw size={15} />
              Drag to rotate · Scroll to zoom
            </div>

            <div className="scene-label bottom-right">
              SCHEMATIC 3D REPRESENTATION
            </div>
          </div>
        </section>

        <section className="analysis-section">
          <div className="section-header">
            <div>
              <div className="eyebrow">01 / CORONARY ASSESSMENT</div>
              <h2>Explore each vessel.</h2>
              <p>
                Select a coronary artery to inspect its model output.
              </p>
            </div>
            <div className="section-meta">
              <Activity size={17} />
              4 TARGET-SPECIFIC CLASSIFIERS
            </div>
          </div>

          <div className="assessment-grid">
            <div className="vessel-panel">
              <span className="small-label">CORONARY ARTERIES</span>

              <div className="vessel-list">
                {VESSELS.map((vessel) => (
                  <button
                    key={vessel}
                    className={`vessel-item ${
                      selected === vessel ? "chosen" : ""
                    }`}
                    onClick={() => setSelected(vessel)}
                  >
                    <div className="vessel-name">
                      <strong>{vessel}</strong>
                      <span>{DESCRIPTIONS[vessel]}</span>
                    </div>
                    <ArrowUpRight size={18} />
                  </button>
                ))}
              </div>
            </div>

            <div className="result-panel">
              <span className="small-label">
                SELECTED VESSEL / {selected}
              </span>

              <div className="result-heading">
                <h3>{DESCRIPTIONS[selected]}</h3>
                <span className="result-status">
                  {current?.predicted_label ?? "Awaiting data"}
                </span>
              </div>

              <div className="result-number">
                {current
                  ? `${(current.positive_probability * 100).toFixed(1)}%`
                  : "—"}
              </div>

              <p className="result-caption">
                Model-estimated probability of stenosis.
                Not clinically calibrated.
              </p>

              <div className="progress-track">
                <div
                  className="progress-value"
                  style={{
                    width: current
                      ? `${current.positive_probability * 100}%`
                      : "0%",
                  }}
                />
              </div>

              <div className="result-bottom">
                <span>
                  MODEL: {current?.model_type ?? "NOT RUN"}
                </span>
                <span>
                  STATUS: {current ? "INFERENCE COMPLETE" : "NO DATA"}
                </span>
              </div>
            </div>

            <div className="cad-panel">
              <BrainCircuit size={24} strokeWidth={1.5} />

              <span className="small-label">OVERALL CAD ASSESSMENT</span>

              <div className="cad-number">
                {cad
                  ? `${(cad.positive_probability * 100).toFixed(1)}%`
                  : "—"}
              </div>

              <h3>{cad?.predicted_label ?? "Not assessed"}</h3>
              <p>
                Overall CAD model output based on the clinical
                features of the selected demonstration record.
              </p>

              <span className="cad-model">
                {cad?.model_type ?? "GRADIENT BOOSTING"}
              </span>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}
        </section>

        <footer className="footer">
          <div>
            <strong>CardioVision AI</strong>
            <p>
              Educational and research use only. Not a substitute
              for clinical evaluation, imaging, or diagnosis.
            </p>
          </div>
          <span>BUILT WITH SCIENCE, NOT CERTAINTY.</span>
        </footer>
      </main>
    </div>
  );
}

export default App;

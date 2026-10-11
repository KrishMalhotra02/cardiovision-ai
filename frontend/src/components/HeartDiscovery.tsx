import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  HeartPulse,
  Pause,
  Play,
  Activity,
  Moon,
  Footprints,
  Leaf,
  ShieldCheck,
  Dumbbell,
} from "lucide-react";

const ROTATION_MS = 30_000;

// Curated and attributed educational content, not AI-generated medical advice.
const FACTS = [
  {
    headline: "Four chambers. One coordinated pump.",
    stat: "04 / chambers",
    body: "The two atria receive blood, while the two ventricles pump it onward. Valves keep blood moving in the intended direction.",
    source: "NIH · Heart anatomy",
    url: "https://www.nhlbi.nih.gov/health/heart/anatomy",
  },
  {
    headline: "Your heart has a built-in pacemaker.",
    stat: "SA / node",
    body: "Specialized cells in the sinoatrial node initiate electrical signals that coordinate each heartbeat.",
    source: "NIH · How the heart beats",
    url: "https://www.nhlbi.nih.gov/health/heart/heart-beats",
  },
  {
    headline: "The heart needs its own blood supply.",
    stat: "03 / major vessels",
    body: "Coronary arteries deliver oxygen-rich blood to the heart muscle. Our explorer focuses on LAD, LCX, and RCA territories.",
    source: "NIH · Blood flow",
    url: "https://www.nhlbi.nih.gov/health/heart/blood-flow",
  },
  {
    headline: "A heartbeat has two familiar sounds.",
    stat: "lub · dub",
    body: "The sounds come primarily from the closing of different heart valves as the heart fills and pumps blood.",
    source: "NIH · How the heart beats",
    url: "https://www.nhlbi.nih.gov/health/heart/heart-beats",
  },
  {
    headline: "Your pulse adapts to your body's needs.",
    stat: "60–100 bpm",
    body: "A typical adult resting heart-rate range is 60–100 beats per minute; exercise can make the heart beat faster to supply working muscles.",
    source: "NIH · Heart rate",
    url: "https://www.nhlbi.nih.gov/health/heart/heart-beats",
  },
  {
    headline: "Every heart valve has a purpose.",
    stat: "04 / valves",
    body: "The tricuspid, pulmonary, mitral, and aortic valves help maintain one-way blood flow through the heart.",
    source: "NIH · Blood flow",
    url: "https://www.nhlbi.nih.gov/health/heart/blood-flow",
  },
] as const;

const TIPS = [
  {
    headline: "Make movement part of your week.",
    body: "Adults should aim for at least 150 minutes of moderate aerobic activity, or 75 minutes of vigorous activity, each week.",
    highlight: "150 min / week",
    source: "American Heart Association",
    url: "https://www.heart.org/en/healthy-living/healthy-lifestyle/lifes-essential-8/how-to-be-more-active-fact-sheet",
    icon: Footprints,
  },
  {
    headline: "Give recovery real attention.",
    body: "Most adults should aim for an average of 7–9 hours of sleep each night as part of a heart-healthy routine.",
    highlight: "7–9 hours",
    source: "American Heart Association",
    url: "https://www.heart.org/en/healthy-living/healthy-lifestyle/lifes-essential-8/how-to-get-healthy-sleep-fact-sheet",
    icon: Moon,
  },
  {
    headline: "Know your blood pressure.",
    body: "Blood pressure can change without noticeable symptoms. Regular measurement helps you understand your numbers and discuss them with a clinician.",
    highlight: "Know your numbers",
    source: "American Heart Association",
    url: "https://newsroom.heart.org/facts/blood-pressure-life-s-essential-8-health-factor",
    icon: Activity,
  },
  {
    headline: "Build your plate around plants.",
    body: "Include vegetables, fruit, whole grains, beans, nuts, and seeds as part of an overall heart-healthy eating pattern.",
    highlight: "Eat better",
    source: "American Heart Association",
    url: "https://newsroom.heart.org/facts/life-s-essential-8",
    icon: Leaf,
  },
  {
    headline: "Protect your heart from tobacco.",
    body: "Avoid smoking and vaping, and limit secondhand-smoke exposure. Avoiding nicotine exposure is a major part of cardiovascular prevention.",
    highlight: "Avoid tobacco",
    source: "American Heart Association",
    url: "https://newsroom.heart.org/facts/life-s-essential-8",
    icon: ShieldCheck,
  },
  {
    headline: "Strength training matters, too.",
    body: "Add muscle-strengthening activities on at least two days each week, alongside your aerobic routine, when appropriate for you.",
    highlight: "2 days / week",
    source: "American Heart Association",
    url: "https://www.heart.org/en/healthy-living/healthy-lifestyle/lifes-essential-8/how-to-be-more-active-fact-sheet",
    icon: Dumbbell,
  },
] as const;

export default function HeartDiscovery() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % FACTS.length);
    }, ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [index, paused]);

  const fact = FACTS[index];
  const tip = TIPS[index];
  const TipIcon = tip.icon;

  function changeSlide(to: number) {
    setIndex((to + FACTS.length) % FACTS.length);
  }

  return (
    <section id="discovery" className="discovery-section" aria-label="Heart facts and healthy habits">
      <div className="discovery-top">
        <div>
          <span className="section-kicker">03 / HEART NOTES</span>
          <h2>A little more heart knowledge.</h2>
          <p>Discover how the heart works and find simple, evidence-informed ways to care for it.</p>
        </div>
        
      </div>

      <div className="discovery-grid" aria-live="off">
        <article className="discovery-fact">
          <div className="discovery-card-meta">
            <span><BookOpen size={16} /> THE ANATOMY FILE</span>
            <span className="discovery-index">{String(index + 1).padStart(2, "0")} / {String(FACTS.length).padStart(2, "0")}</span>
          </div>
          <div className="discovery-stat">{fact.stat}</div>
          <h3>{fact.headline}</h3>
          <p>{fact.body}</p>
          <svg className="discovery-pulse" viewBox="0 0 320 35" role="img" aria-label="Decorative electrocardiogram waveform">
            <path d="M0 18 H83 L99 18 L109 10 L123 28 L139 3 L155 18 H320" stroke="#9bddcf" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="discovery-card-footer">
            <span>LEARN THE SCIENCE</span>
            <a href={fact.url} target="_blank" rel="noopener noreferrer">
              {fact.source} <ArrowUpRight size={14} />
            </a>
          </div>
        </article>

        <article className="discovery-tip">
          <div className="discovery-card-meta"><span><HeartPulse size={16} /> LIVE WELL</span><span>HEART-HEALTH HABIT</span></div>
          <div className="discovery-tip-icon"><TipIcon size={26} strokeWidth={1.6} /></div>
          <h3>{tip.headline}</h3>
          <p>{tip.body}</p>
          <div className="discovery-card-footer">
            <strong>{tip.highlight}</strong>
            <a href={tip.url} target="_blank" rel="noopener noreferrer">
              Source <ArrowUpRight size={14} />
            </a>
          </div>
        </article>
      </div>

      <div className="discovery-actions">
        <div className="discovery-dots" role="group" aria-label="Choose heart insight">
          {FACTS.map((_item, i) => (
            <button
              key={i}
              type="button"
              className={i === index ? "discovery-dot active" : "discovery-dot"}
              onClick={() => changeSlide(i)}
              aria-label={`Show insight ${i + 1}`}
              aria-current={i === index ? "true" : undefined}
            />
          ))}
        </div>
        <div className="discovery-btn-group">
          <button className="discovery-btn discovery-pause" onClick={() => setPaused((v) => !v)} aria-label={paused ? "Resume rotation" : "Pause rotation"}>
            {paused ? <Play size={15} /> : <Pause size={15} />}
            {paused ? "Resume" : "Pause"}
          </button>
          <button className="discovery-btn" onClick={() => changeSlide(index - 1)} aria-label="Previous insight"><ArrowLeft size={17} /></button>
          <button className="discovery-btn" onClick={() => changeSlide(index + 1)} aria-label="Next insight"><ArrowRight size={17} /></button>
        </div>
      </div>
      <div className="discovery-progress" aria-hidden="true">
        <div key={index} style={{ animationPlayState: paused ? "paused" : "running" }} />
      </div>
    </section>
  );
}

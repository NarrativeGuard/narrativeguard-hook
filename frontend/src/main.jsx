import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  Ban,
  Check,
  Clock,
  Gauge,
  Languages,
  Lock,
  Pause,
  Play,
  RefreshCcw,
  Rocket,
  Shield,
  SlidersHorizontal,
  Sparkles,
  TimerReset,
  Wallet,
} from "lucide-react";
import { DeployPanel } from "./DeployPanel.jsx";
import { DEFAULT_LANGUAGE, LANGUAGES, createTranslator } from "./i18n.js";
import "./styles.css";

const DEFAULT_SIGNALS = [
  { id: "social", labelKey: "signalSocial", value: 62, weight: 0.22, icon: Activity, tone: "ok" },
  { id: "kol", labelKey: "signalKol", value: 48, weight: 0.15, icon: Sparkles, tone: "ok" },
  { id: "liquidity", labelKey: "signalLiquidity", value: 54, weight: 0.2, icon: Gauge, tone: "warn" },
  { id: "contract", labelKey: "signalContract", value: 35, weight: 0.18, icon: Lock, tone: "ok" },
  { id: "rumor", labelKey: "signalRumor", value: 71, weight: 0.13, icon: AlertTriangle, tone: "danger" },
  { id: "wallets", labelKey: "signalWallets", value: 66, weight: 0.12, icon: Wallet, tone: "warn" },
];

const LAUNCH_TEMPLATES = [
  {
    id: "fair",
    titleKey: "templateFairTitle",
    copyKey: "templateFairCopy",
    score: 42,
    baseFee: 3000,
    maxFee: 60000,
    maxTrade: 12000,
    cooldown: 30,
    antiSnipeThreshold: 82,
  },
  {
    id: "viral",
    titleKey: "templateViralTitle",
    copyKey: "templateViralCopy",
    score: 68,
    baseFee: 5000,
    maxFee: 120000,
    maxTrade: 8500,
    cooldown: 60,
    antiSnipeThreshold: 74,
  },
  {
    id: "defense",
    titleKey: "templateDefenseTitle",
    copyKey: "templateDefenseCopy",
    score: 86,
    baseFee: 8000,
    maxFee: 180000,
    maxTrade: 4200,
    cooldown: 120,
    antiSnipeThreshold: 70,
  },
];

const formatFee = (feePips) => `${(feePips / 10_000).toFixed(2)}%`;
const scoreTone = (score) => (score >= 78 ? "danger" : score >= 55 ? "warn" : "ok");
const calculateRiskScore = (signals) => {
  const raw = signals.reduce((total, signal) => total + signal.value * signal.weight, 0);
  return Math.min(100, Math.max(0, Math.round(raw)));
};
const templateSignals = (signals, template, fromScore) =>
  signals.map((signal) => ({
    ...signal,
    value: Math.max(0, Math.min(100, Math.round(signal.value + (template.score - fromScore) * signal.weight * 1.6))),
  }));

function App() {
  const [language, setLanguageState] = useState(() => localStorage.getItem("ng-language") || DEFAULT_LANGUAGE);
  const t = useMemo(() => createTranslator(language), [language]);
  const [signals, setSignals] = useState(DEFAULT_SIGNALS);
  const [selectedTemplate, setSelectedTemplate] = useState("viral");
  const [baseFee, setBaseFee] = useState(5000);
  const [maxFee, setMaxFee] = useState(120000);
  const [maxTrade, setMaxTrade] = useState(8500);
  const [tradeSize, setTradeSize] = useState(4200);
  const [cooldown, setCooldown] = useState(60);
  const [cooldownActive, setCooldownActive] = useState(false);
  const [antiSnipeWindow, setAntiSnipeWindow] = useState(true);
  const [antiSnipeThreshold, setAntiSnipeThreshold] = useState(74);
  const [paused, setPaused] = useState(false);
  const [listMode, setListMode] = useState("normal");

  const riskScore = useMemo(() => {
    return calculateRiskScore(signals);
  }, [signals]);

  const feePips = Math.round(baseFee + ((maxFee - baseFee) * riskScore) / 100);
  const tone = scoreTone(riskScore);
  const activeRules = [
    paused,
    listMode === "blacklist",
    listMode === "whitelist",
    antiSnipeWindow,
    tradeSize > maxTrade,
    cooldownActive,
  ].filter(Boolean).length;

  const poolHealth = Math.max(0, Math.min(100, 100 - Math.round(riskScore * 0.55) - (paused ? 24 : 0) + (listMode === "whitelist" ? 8 : 0)));
  const blockedToday = Math.max(12, Math.round(riskScore * 1.8 + activeRules * 9));
  const marketPressure = Math.min(100, Math.round((signals[0].value * 0.35) + (signals[4].value * 0.35) + (signals[5].value * 0.3)));
  const attackerPressure = Math.min(100, Math.round((signals[5].value * 0.45) + (riskScore * 0.35) + (tradeSize > maxTrade ? 20 : 0)));
  const healthBuffer = Math.max(0, Math.min(100, Math.round(poolHealth - riskScore * 0.18 + (listMode === "whitelist" ? 6 : 0))));
  const feeSlope = Math.max(0, Math.round(((feePips - baseFee) / Math.max(1, maxFee - baseFee)) * 100));
  const riskBand = useMemo(() => {
    if (paused || riskScore >= 78) return { label: t("riskBandCritical"), copy: t("riskBandCriticalCopy"), tone: "danger" };
    if (riskScore >= 55) return { label: t("riskBandElevated"), copy: t("riskBandElevatedCopy"), tone: "warn" };
    return { label: t("riskBandStable"), copy: t("riskBandStableCopy"), tone: "ok" };
  }, [paused, riskScore, t]);
  const operatingMode = paused ? t("modeDefense") : riskScore >= antiSnipeThreshold ? t("modeGuarded") : t("modeNormal");
  const leadSignals = useMemo(() => [...signals].sort((a, b) => b.value - a.value).slice(0, 3), [signals]);
  const agentRows = [
    { label: t("agentNarrative"), value: `${Math.round((signals[0].value + signals[1].value + signals[4].value) / 3)}%`, status: t("agentStatusLive"), tone: scoreTone(Math.round((signals[0].value + signals[1].value + signals[4].value) / 3)) },
    { label: t("agentLiquidity"), value: `${Math.max(58, 100 - signals[2].value)}%`, status: t("agentAttestation"), tone: signals[2].value >= 70 ? "warn" : "ok" },
    { label: t("agentWallet"), value: `${signals[5].value}%`, status: t("agentStatusLive"), tone: scoreTone(signals[5].value) },
    { label: t("agentPolicy"), value: operatingMode, status: t("agentPolicyPush"), tone: paused ? "danger" : riskScore >= antiSnipeThreshold ? "warn" : "ok" },
  ];
  const actionQueue = [
    { label: t("queueScoreUpdate"), active: true, tone: "ok" },
    { label: t("queueTightenCaps"), active: riskScore >= 55 || tradeSize > maxTrade, tone: tradeSize > maxTrade ? "danger" : "warn" },
    { label: t("queueMakerList"), active: listMode === "whitelist", tone: "ok" },
    { label: t("queuePause"), active: paused || riskScore >= 82, tone: paused || riskScore >= 82 ? "danger" : "warn" },
  ];
  const decision = useMemo(() => {
    if (paused) return { status: t("blocked"), reason: t("reasonEmergencyPause"), icon: Pause, tone: "danger" };
    if (listMode === "blacklist") return { status: t("blocked"), reason: t("reasonBlacklistedWallet"), icon: Ban, tone: "danger" };
    if (listMode === "whitelist") return { status: t("allowed"), reason: t("reasonWhitelistedWallet"), icon: Check, tone: "ok" };
    if (antiSnipeWindow && riskScore >= antiSnipeThreshold) {
      return { status: t("blocked"), reason: t("reasonAntiSnipeWindow"), icon: Shield, tone: "danger" };
    }
    if (tradeSize > maxTrade) return { status: t("blocked"), reason: t("reasonTradeCapExceeded"), icon: AlertTriangle, tone: "warn" };
    if (cooldownActive) return { status: t("blocked"), reason: t("reasonCooldown", { seconds: cooldown }), icon: Clock, tone: "warn" };
    return { status: t("allowed"), reason: t("reasonPolicyClear"), icon: Check, tone: "ok" };
  }, [antiSnipeThreshold, antiSnipeWindow, cooldown, cooldownActive, listMode, maxTrade, paused, riskScore, t, tradeSize]);

  const DecisionIcon = decision.icon;
  const timelineRows = [
    { time: "T+00", label: t("timelineOraclePush"), value: `${riskScore}/100`, tone },
    { time: "T+04", label: antiSnipeWindow ? t("timelineAntiSnipeArmed") : t("timelineAntiSnipeIdle"), value: antiSnipeWindow ? `${antiSnipeThreshold}+` : t("off"), tone: antiSnipeWindow ? "warn" : "ok" },
    { time: "T+08", label: t("timelineDecision"), value: decision.status, tone: decision.tone },
    { time: "T+12", label: t("timelineFeeOverride"), value: formatFee(feePips), tone: feeSlope > 70 ? "danger" : feeSlope > 35 ? "warn" : "ok" },
  ];

  function updateSignal(id, value) {
    setSignals((current) => current.map((signal) => (signal.id === id ? { ...signal, value } : signal)));
  }

  function setLanguage(nextLanguage) {
    setLanguageState(nextLanguage);
    localStorage.setItem("ng-language", nextLanguage);
  }

  function applyTemplate(template) {
    setSelectedTemplate(template.id);
    setBaseFee(template.baseFee);
    setMaxFee(template.maxFee);
    setMaxTrade(template.maxTrade);
    setCooldown(template.cooldown);
    setAntiSnipeThreshold(template.antiSnipeThreshold);
    setAntiSnipeWindow(true);
    setPaused(template.id === "defense");
    setListMode("normal");
    setCooldownActive(template.id === "defense");
    setTradeSize(template.id === "defense" ? template.maxTrade + 500 : 4200);
    setSignals((current) => templateSignals(current, template, riskScore));
  }

  function resetDemo() {
    const template = LAUNCH_TEMPLATES[1];
    setSelectedTemplate(template.id);
    setBaseFee(template.baseFee);
    setMaxFee(template.maxFee);
    setMaxTrade(template.maxTrade);
    setCooldown(template.cooldown);
    setAntiSnipeThreshold(template.antiSnipeThreshold);
    setAntiSnipeWindow(true);
    setPaused(false);
    setListMode("normal");
    setCooldownActive(false);
    setTradeSize(4200);
    setSignals(templateSignals(DEFAULT_SIGNALS, template, calculateRiskScore(DEFAULT_SIGNALS)));
  }

  function toggleTradeCapPreview() {
    if (tradeSize > maxTrade) {
      setTradeSize(maxTrade);
      return;
    }
    setTradeSize(maxTrade + 1);
  }

  return (
    <main className="app-shell risk-os-shell">
      <header className="topbar os-topbar">
        <div className="brand-block">
          <div className="brand-mark">
            <Shield size={22} />
          </div>
          <div>
            <h1>NarrativeGuard</h1>
            <div className="meta-row">
              <span>{t("riskOsTagline")}</span>
              <span>X Layer 196</span>
              <span>Uniswap v4 BEFORE_SWAP</span>
            </div>
          </div>
        </div>
        <div className="top-actions">
          <label className="language-select" title={t("language")}>
            <Languages size={17} />
            <select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label={t("language")}>
              {LANGUAGES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <button className={`icon-action ${paused ? "danger" : ""}`} onClick={() => setPaused((value) => !value)} title={paused ? t("resumePool") : t("pausePool")}>
            {paused ? <Play size={18} /> : <Pause size={18} />}
          </button>
          <button className="icon-action" onClick={resetDemo} title={t("resetDemo")}>
            <RefreshCcw size={18} />
          </button>
        </div>
      </header>

      <section className="os-hero">
        <div className="hero-copy-block">
          <p className="eyebrow">{t("heroEyebrow")}</p>
          <h2>{t("heroTitle")}</h2>
          <p>{t("heroCopy")}</p>
          <div className="hero-status-row">
            <span>
              {t("operatingMode")} <strong>{operatingMode}</strong>
            </span>
            <span>
              {t("riskBand")} <strong>{riskBand.label}</strong>
            </span>
            <span>
              {t("quorum")} <strong>3/4</strong>
            </span>
          </div>
        </div>
        <div className="hero-metrics">
          <Metric label={t("protectedLaunches")} value="128" />
          <Metric label={t("blockedFlow")} value={blockedToday.toString()} />
          <Metric label={t("currentFee")} value={formatFee(feePips)} />
          <Metric label={t("poolHealth")} value={`${poolHealth}%`} tone={scoreTone(100 - poolHealth)} />
        </div>
      </section>

      <section className="os-grid">
        <section className="panel os-panel launch-panel">
          <PanelTitle eyebrow={t("launchShield")} title={t("launchTemplates")} icon={Rocket} />
          <div className="template-list">
            {LAUNCH_TEMPLATES.map((template) => (
              <button
                className={`template-card ${selectedTemplate === template.id ? "selected" : ""}`}
                key={template.id}
                onClick={() => applyTemplate(template)}
              >
                <strong>{t(template.titleKey)}</strong>
                <span>{t(template.copyKey)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel os-panel oracle-panel">
          <PanelTitle eyebrow={t("oracleInput")} title={t("oracleTitle")} icon={SlidersHorizontal} />
          <div className="signal-list os-signal-list">
            {signals.map((signal) => {
              const Icon = signal.icon;
              return (
                <label className="signal-row compact-signal" key={signal.id}>
                  <span className={`signal-icon ${signal.tone}`}>
                    <Icon size={18} />
                  </span>
                  <span className="signal-copy">
                    <span>{t(signal.labelKey)}</span>
                    <strong>{signal.value}</strong>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={signal.value}
                    onChange={(event) => updateSignal(signal.id, Number(event.target.value))}
                  />
                </label>
              );
            })}
          </div>
        </section>

        <section className="panel os-panel command-panel">
          <PanelTitle eyebrow={t("commandCenter")} title={t("poolCommand")} icon={Gauge} />
          <div className="risk-board os-risk-board">
            <div className={`risk-ring ${tone}`} style={{ "--score": `${riskScore * 3.6}deg` }}>
              <div className="risk-core">
                <span>{riskScore}</span>
                <small>{t("risk")}</small>
              </div>
            </div>
            <div className="risk-copy">
              <p className="eyebrow">{t("hookDecision")}</p>
              <div className={`decision-pill ${decision.tone}`}>
                <DecisionIcon size={18} />
                <strong>{decision.status}</strong>
                <span>{decision.reason}</span>
              </div>
              <div className="fee-stack">
                <div>
                  <span>{t("activeRules")}</span>
                  <strong>{activeRules}</strong>
                </div>
                <div>
                  <span>{t("override")}</span>
                  <strong>{formatFee(feePips)}</strong>
                </div>
                <div>
                  <span>{t("max")}</span>
                  <strong>{formatFee(maxFee)}</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="panel os-panel trader-panel">
          <PanelTitle eyebrow={t("traderProtection")} title={t("tradeSimulator")} icon={TimerReset} />
          <div className="trade-grid">
            <label className="field">
              <span>{t("tradeSize")}</span>
              <input type="number" min="0" value={tradeSize} onChange={(event) => setTradeSize(Number(event.target.value))} />
            </label>
            <label className="field">
              <span>{t("maxTrade")}</span>
              <input type="number" min="0" value={maxTrade} onChange={(event) => setMaxTrade(Number(event.target.value))} />
            </label>
          </div>
          <div className="segmented" aria-label={t("listMode")}>
            {[
              ["normal", t("normal")],
              ["whitelist", t("whitelist")],
              ["blacklist", t("blacklist")],
            ].map(([value, label]) => (
              <button key={value} className={listMode === value ? "selected" : ""} onClick={() => setListMode(value)}>
                {label}
              </button>
            ))}
          </div>
          <div className="protection-readout">
            <div>
              <span>{t("estimatedFee")}</span>
              <strong>{formatFee(feePips)}</strong>
            </div>
            <div>
              <span>{t("cooldown")}</span>
              <strong>{cooldownActive ? t("on") : `${cooldown}s`}</strong>
            </div>
          </div>
        </section>

        <section className="panel os-panel policy-panel">
          <PanelTitle eyebrow={t("adminPolicy")} title={t("ruleControls")} icon={Shield} />
          <div className="control-stack compact-controls">
            <label className="field">
              <span>{t("baseFeePips")}</span>
              <input type="number" min="0" max={maxFee} value={baseFee} onChange={(event) => setBaseFee(Number(event.target.value))} />
            </label>
            <label className="field">
              <span>{t("maxFeePips")}</span>
              <input type="number" min={baseFee} max="1000000" value={maxFee} onChange={(event) => setMaxFee(Number(event.target.value))} />
            </label>
            <label className="field">
              <span>{t("antiSnipeThreshold")}</span>
              <input type="number" min="0" max="100" value={antiSnipeThreshold} onChange={(event) => setAntiSnipeThreshold(Number(event.target.value))} />
            </label>
          </div>
          <div className="rule-list os-rule-list">
            <Rule label={t("emergencyPause")} active={paused} onClick={() => setPaused((value) => !value)} t={t} danger />
            <Rule label={t("antiSnipe")} active={antiSnipeWindow} onClick={() => setAntiSnipeWindow((value) => !value)} t={t} danger={antiSnipeWindow && riskScore >= antiSnipeThreshold} />
            <Rule label={t("singleTradeCap")} active={tradeSize > maxTrade} onClick={toggleTradeCapPreview} t={t} />
            <Rule label={t("cooldown")} active={cooldownActive} onClick={() => setCooldownActive((value) => !value)} t={t} />
          </div>
        </section>
      </section>

      <section className="os-intel-grid">
        <section className="panel os-panel report-panel">
          <PanelTitle eyebrow={t("riskReportEyebrow")} title={t("riskReportTitle")} icon={AlertTriangle} />
          <div className="report-grid">
            <div className={`report-primary ${riskBand.tone}`}>
              <span>{t("riskBand")}</span>
              <strong>{riskBand.label}</strong>
              <small>{riskBand.copy}</small>
            </div>
            <ReportMetric label={t("marketPressure")} value={`${marketPressure}%`} tone={scoreTone(marketPressure)} />
            <ReportMetric label={t("attackerPressure")} value={`${attackerPressure}%`} tone={scoreTone(attackerPressure)} />
            <ReportMetric label={t("healthBuffer")} value={`${healthBuffer}%`} tone={scoreTone(100 - healthBuffer)} />
            <ReportMetric label={t("feeSlope")} value={`${feeSlope}%`} tone={scoreTone(feeSlope)} />
          </div>
          <div className="driver-strip">
            {leadSignals.map((signal) => (
              <span key={signal.id}>
                {t(signal.labelKey)} <strong>{signal.value}</strong>
              </span>
            ))}
          </div>
        </section>

        <section className="panel os-panel agent-panel">
          <PanelTitle eyebrow={t("agentMesh")} title={t("agentMeshTitle")} icon={Sparkles} />
          <div className="agent-list">
            {agentRows.map((agent) => (
              <div className={`agent-row ${agent.tone}`} key={agent.label}>
                <span>{agent.label}</span>
                <strong>{agent.value}</strong>
                <small>{agent.status}</small>
              </div>
            ))}
          </div>
          <div className="quorum-bar">
            <span>{t("quorum")}</span>
            <strong>3/4</strong>
            <em>{t("agentsOnline")}</em>
          </div>
        </section>

        <section className="panel os-panel timeline-panel">
          <PanelTitle eyebrow={t("timelineEyebrow")} title={t("timelineTitle")} icon={Clock} />
          <div className="timeline-list">
            {timelineRows.map((row) => (
              <div className={`timeline-item ${row.tone}`} key={`${row.time}-${row.label}`}>
                <time>{row.time}</time>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="panel os-panel ops-panel">
          <PanelTitle eyebrow={t("opsEyebrow")} title={t("opsTitle")} icon={Shield} />
          <div className="ops-grid">
            <div className="ops-mode">
              <span>{t("operatingMode")}</span>
              <strong>{operatingMode}</strong>
            </div>
            <div className="ops-queue">
              {actionQueue.map((item) => (
                <button
                  type="button"
                  key={item.label}
                  className={`queue-chip ${item.active ? item.tone : ""}`}
                  onClick={() => {
                    if (item.label === t("queueTightenCaps")) toggleTradeCapPreview();
                    if (item.label === t("queueMakerList")) setListMode((value) => (value === "whitelist" ? "normal" : "whitelist"));
                    if (item.label === t("queuePause")) setPaused((value) => !value);
                  }}
                >
                  <span>{item.label}</span>
                  <strong>{item.active ? t("ready") : t("standby")}</strong>
                </button>
              ))}
            </div>
          </div>
        </section>
      </section>

      <DeployPanel t={t} />
    </main>
  );
}

function PanelTitle({ eyebrow, title, icon: Icon }) {
  return (
    <div className="panel-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <Icon size={20} />
    </div>
  );
}

function Metric({ label, value, tone = "" }) {
  return (
    <div className={`hero-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReportMetric({ label, value, tone = "" }) {
  return (
    <div className={`report-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Rule({ label, active, onClick, t, danger = false }) {
  return (
    <button type="button" className={`rule-row ${active ? (danger ? "danger" : "active") : ""}`} onClick={onClick}>
      <span>{label}</span>
      <strong>{active ? t("on") : t("off")}</strong>
    </button>
  );
}

createRoot(document.getElementById("root")).render(<App />);

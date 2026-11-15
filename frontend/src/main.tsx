import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Shield,
  LayoutDashboard,
  Cpu,
  Radar,
  ChartNoAxesCombined,
  Play,
  Square,
  Activity,
  AlertTriangle,
  Radio,
  ArrowUpRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import "./style.css";

type Reading = {
  id: number;
  device_id: string;
  timestamp: string;
  source: string;
  packet_rate: number;
  byte_rate: number;
  average_packet_size: number;
  destination_count: number;
  port_diversity: number;
  risk_score: number;
  rule_score: number;
  ml_score: number;
  ml_anomaly: boolean;
  severity: string;
  reasons: string[];
};
type Alert = Pick<
  Reading,
  "id" | "device_id" | "timestamp" | "severity" | "risk_score" | "reasons"
>;
type Snapshot = {
  demo: { running: boolean; mode: string; last_error: string | null };
  devices: { id: string; name: string; latest: Reading | null }[];
  telemetry: Reading[];
  alerts: Alert[];
  summary: { telemetry_count: number; alert_count: number };
  model: {
    name: string;
    training_samples: number;
    training_source: string;
    evaluation: string;
  };
};
const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const pages = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Devices", icon: Cpu },
  { name: "Threat Detection", icon: Radar },
  { name: "Analytics", icon: ChartNoAxesCombined },
];
const time = (s: string) => new Date(s).toLocaleTimeString();
const num = (v: number | undefined, digits = 0) =>
  v === undefined
    ? "—"
    : v.toLocaleString(undefined, { maximumFractionDigits: digits });
async function request(path: string, options?: RequestInit) {
  const response = await fetch(API + path, {
    ...options,
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`API request failed (${response.status})`);
  return response.json();
}
function App() {
  const [page, setPage] = useState(() =>
    pages.some((p) => p.name === decodeURIComponent(location.hash.slice(1)))
      ? decodeURIComponent(location.hash.slice(1))
      : "Overview",
  );
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [updated, setUpdated] = useState<Date | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const value = await request("/api/dashboard");
        if (alive) {
          setData(value);
          setError("");
          setUpdated(new Date());
        }
      } catch (e) {
        if (alive)
          setError(e instanceof Error ? e.message : "Backend unavailable");
      } finally {
        if (alive) timer = setTimeout(poll, 3000);
      }
    };
    poll();
    const onHash = () => {
      const p = decodeURIComponent(location.hash.slice(1));
      if (pages.some((x) => x.name === p)) setPage(p);
    };
    window.addEventListener("hashchange", onHash);
    return () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);
  const command = async (action: string) => {
    setBusy(true);
    try {
      await request("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setData(await request("/api/dashboard"));
      setError("");
      setUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Control failed");
    } finally {
      setBusy(false);
    }
  };
  const latest =
    data?.devices.map((d) => d.latest).filter((x): x is Reading => !!x) || [];
  const risk = latest.length
    ? latest.reduce((sum, r) => sum + r.risk_score, 0) / latest.length
    : undefined;
  const chart =
    data?.telemetry.map((r) => ({
      ...r,
      time: time(r.timestamp),
      risk_percent: Math.round(r.risk_score * 100),
    })) || [];
  const deviceBars =
    data?.devices.map((d) => ({
      name: d.id,
      packet_rate: d.latest?.packet_rate || 0,
      destinations: d.latest?.destination_count || 0,
      ports: d.latest?.port_diversity || 0,
    })) || [];
  return (
    <div className="shell">
      <aside>
        <a className="brand" href="#Overview">
          <span className="brand-icon">
            <Shield size={25} />
          </span>
          <span>
            IoT Sentinel<small>NETWORK INTELLIGENCE</small>
          </span>
        </a>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {pages.map((p) => (
            <a
              key={p.name}
              href={"#" + encodeURIComponent(p.name)}
              className={page === p.name ? "selected" : ""}
            >
              <p.icon size={19} />
              {p.name}
              {page === p.name && <span className="nav-dot" />}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Radio size={20} />
          <b>Software demo</b>
          <p>
            Synthetic telemetry only.
            <br />
            No network traffic is captured.
          </p>
          <span className="pill">COLLEGE PROJECT · MVP</span>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            Workspace <span>/</span> {page}
          </div>
          <div className="connection">
            <i className={error ? "bad" : ""} />
            {error
              ? "Connection issue"
              : updated
                ? "API connected"
                : "Connecting…"}
            <span className="desktop"> • 3s polling</span>
          </div>
        </header>
        <div className="content">
          <div className="title-row">
            <div>
              <div className="eyebrow">OBSERVE. DETECT. UNDERSTAND.</div>
              <h1>{page}</h1>
              <p className="subtitle">
                {page === "Overview"
                  ? "Your IoT network, in focus."
                  : page === "Devices"
                    ? "Two simulated ESP32 devices. One connected view."
                    : page === "Threat Detection"
                      ? "Understand every signal behind the score."
                      : "Explore the behaviour behind your telemetry."}
              </p>
            </div>
            <span className="synthetic">
              <Radio size={14} /> SYNTHETIC DATA
            </span>
          </div>
          {error && (
            <div role="alert" className="error">
              {error}. Ensure the backend is running. Last successful data may
              be shown.
            </div>
          )}
          {data?.demo.last_error && (
            <div role="alert" className="error">
              {data.demo.last_error}
            </div>
          )}
          <section className="demo-bar">
            <div>
              <span
                className={"status-dot " + (data?.demo.running ? "active" : "")}
              />
              <b>Demo simulator</b>
              <span className="muted">
                {data?.demo.running ? "Running" : "Stopped"} ·{" "}
                {data?.demo.mode || "normal"} behaviour
              </span>
            </div>
            <div className="controls">
              <button
                disabled={busy || !data || data.demo.running}
                onClick={() => command("start")}
                className="primary"
              >
                <Play size={14} />
                Start Demo
              </button>
              <button
                disabled={busy || !data || !data.demo.running}
                onClick={() => command("stop")}
              >
                <Square size={14} />
                Stop Demo
              </button>
              <div className="segmented">
                <button
                  disabled={busy || !data}
                  className={data?.demo.mode === "normal" ? "mode-normal" : ""}
                  onClick={() => command("normal")}
                >
                  Normal Behaviour
                </button>
                <button
                  disabled={busy || !data}
                  className={
                    data?.demo.mode === "abnormal" ? "mode-abnormal" : ""
                  }
                  onClick={() => command("abnormal")}
                >
                  Abnormal Behaviour
                </button>
              </div>
            </div>
          </section>
          {!data ? (
            <div className="empty">
              {error
                ? "Waiting for the backend connection."
                : "Loading telemetry…"}
            </div>
          ) : (
            <>
              <div className="stats">
                <Stat
                  label="Registered devices"
                  value={String(data.devices.length)}
                  note="Simulated ESP32 endpoints"
                  icon={<Cpu />}
                />
                <Stat
                  label="Telemetry records"
                  value={num(data.summary.telemetry_count)}
                  note="Persisted in SQLite"
                  icon={<Activity />}
                />
                <Stat
                  label="Generated alerts"
                  value={num(data.summary.alert_count)}
                  note="All recorded windows"
                  icon={<AlertTriangle />}
                />
                <Stat
                  label="Latest mean risk"
                  value={risk === undefined ? "—" : risk.toFixed(2)}
                  note="Heuristic score · 0 to 1"
                  icon={<Shield />}
                />
              </div>
              {page === "Overview" && (
                <>
                  <div className="grid-main">
                    <Panel
                      title="Network activity"
                      subtitle="Packet rate · latest 120 device windows"
                    >
                      <Plot empty={!chart.length}>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chart}>
                            <defs>
                              <linearGradient
                                id="fill"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                              >
                                <stop
                                  offset="0%"
                                  stopColor="#36d6bb"
                                  stopOpacity={0.3}
                                />
                                <stop
                                  offset="100%"
                                  stopColor="#36d6bb"
                                  stopOpacity={0}
                                />
                              </linearGradient>
                            </defs>
                            <CartesianGrid
                              stroke="#233047"
                              strokeDasharray="3 3"
                            />
                            <XAxis dataKey="time" minTickGap={60} />
                            <YAxis />
                            <Tooltip contentStyle={tooltip} />
                            <Area
                              isAnimationActive={false}
                              type="monotone"
                              dataKey="packet_rate"
                              name="Packets/s"
                              stroke="#36d6bb"
                              fill="url(#fill)"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </Plot>
                    </Panel>
                    <Panel
                      title="Detection engine"
                      subtitle="Explainable signals, combined"
                    >
                      <div className="engine">
                        <div className="engine-icon">
                          <Shield size={34} />
                        </div>
                        <h3>Rules + Isolation Forest</h3>
                        <p>60% rule score + 40% normalized ML score</p>
                        <div className="engine-row">
                          <span>Reference samples</span>
                          <b>{num(data.model.training_samples)}</b>
                        </div>
                        <div className="engine-row">
                          <span>Training source</span>
                          <b>Synthetic normal</b>
                        </div>
                        <div className="engine-row">
                          <span>Alert threshold</span>
                          <b>Risk ≥ 0.40</b>
                        </div>
                        <small>
                          The risk score is not a probability of compromise. No
                          real-world accuracy evaluation has been performed.
                        </small>
                      </div>
                    </Panel>
                  </div>
                  <DeviceCards devices={data.devices} />
                  <Panel
                    title="Recent alerts"
                    subtitle="Each alert represents a telemetry window"
                  >
                    <Alerts alerts={data.alerts.slice(0, 5)} />
                  </Panel>
                </>
              )}
              {page === "Devices" && (
                <>
                  <DeviceCards devices={data.devices} />
                  <Panel
                    title="Latest device telemetry"
                    subtitle="Rates are derived from reported counters and window duration"
                  >
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Device</th>
                            <th>Source</th>
                            <th>Packets/s</th>
                            <th>Bytes/s</th>
                            <th>Avg. bytes/packet</th>
                            <th>Destinations</th>
                            <th>Ports</th>
                            <th>Received</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.devices.map((d) => (
                            <tr key={d.id}>
                              <td>{d.id}</td>
                              <td>{d.latest?.source || "Awaiting data"}</td>
                              <td>{num(d.latest?.packet_rate, 1)}</td>
                              <td>{num(d.latest?.byte_rate)}</td>
                              <td>{num(d.latest?.average_packet_size, 1)}</td>
                              <td>{num(d.latest?.destination_count)}</td>
                              <td>{num(d.latest?.port_diversity)}</td>
                              <td>
                                {d.latest ? time(d.latest.timestamp) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                  <div className="notice">
                    Device-reported counters are supported by the REST schema.
                    Physical ESP32 firmware and independent packet capture are
                    not implemented.
                  </div>
                </>
              )}
              {page === "Threat Detection" && (
                <>
                  <Panel
                    title="Signal breakdown"
                    subtitle="Latest reading per device · scores range from 0 to 1"
                  >
                    <div className="signal-grid">
                      {data.devices.map((d) => (
                        <div className="signal" key={d.id}>
                          <h3>{d.id}</h3>
                          {d.latest ? (
                            <>
                              <Score
                                label="Rule score"
                                value={d.latest.rule_score}
                              />
                              <Score
                                label="ML deviation score"
                                value={d.latest.ml_score}
                              />
                              <Score
                                label="Combined risk"
                                value={d.latest.risk_score}
                              />
                              <p className="muted">
                                Isolation Forest:{" "}
                                {d.latest.ml_anomaly
                                  ? "deviation detected"
                                  : "within reference boundary"}
                              </p>
                              <ul>
                                {d.latest.reasons.length ? (
                                  d.latest.reasons.map((r) => (
                                    <li key={r}>{r}</li>
                                  ))
                                ) : (
                                  <li>No detector triggers in this window.</li>
                                )}
                              </ul>
                            </>
                          ) : (
                            <p className="muted">
                              Start the demo to collect a reading.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </Panel>
                  <div className="notice">
                    Risk = 0.6 × min(triggered rules / 3, 1) + 0.4 × clip(0.3 −
                    3 × model decision, 0, 1). Severity: medium ≥ 0.40, high ≥
                    0.60, critical ≥ 0.80. Alerts begin at 0.40. These are
                    demonstration thresholds, not calibrated compromise
                    probabilities.
                  </div>
                  <Panel
                    title="Alert history"
                    subtitle="Latest 100 alerts · browser local time"
                  >
                    <Alerts alerts={data.alerts} />
                  </Panel>
                </>
              )}
              {page === "Analytics" && (
                <>
                  <div className="grid-two">
                    <Panel
                      title="Risk over time"
                      subtitle="Latest 120 device windows · 0–1 heuristic score"
                    >
                      <Plot empty={!chart.length}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chart}>
                            <CartesianGrid
                              stroke="#233047"
                              strokeDasharray="3 3"
                            />
                            <XAxis dataKey="time" minTickGap={60} />
                            <YAxis domain={[0, 1]} />
                            <Tooltip contentStyle={tooltip} />
                            <Legend />
                            <Line
                              isAnimationActive={false}
                              dataKey="risk_score"
                              name="Risk"
                              stroke="#fdaf69"
                              dot={false}
                            />
                            <Line
                              isAnimationActive={false}
                              dataKey="ml_score"
                              name="ML signal"
                              stroke="#9c8aff"
                              dot={false}
                            />
                            <Line
                              isAnimationActive={false}
                              dataKey="rule_score"
                              name="Rule signal"
                              stroke="#36d6bb"
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </Plot>
                    </Panel>
                    <Panel
                      title="Device behaviour"
                      subtitle="Latest destination and port counts per window"
                    >
                      <Plot empty={!chart.length}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={deviceBars}>
                            <CartesianGrid
                              stroke="#233047"
                              strokeDasharray="3 3"
                            />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip contentStyle={tooltip} />
                            <Legend />
                            <Bar
                              isAnimationActive={false}
                              dataKey="destinations"
                              name="Destinations"
                              fill="#36d6bb"
                              radius={[4, 4, 0, 0]}
                            />
                            <Bar
                              isAnimationActive={false}
                              dataKey="ports"
                              name="Ports"
                              fill="#9c8aff"
                              radius={[4, 4, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </Plot>
                    </Panel>
                  </div>
                  <Panel
                    title="Telemetry log"
                    subtitle="Latest 120 stored records · oldest to newest"
                  >
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Time</th>
                            <th>Device</th>
                            <th>Source</th>
                            <th>Packets/s</th>
                            <th>Bytes/s</th>
                            <th>Risk</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.telemetry.map((r) => (
                            <tr key={r.id}>
                              <td>{time(r.timestamp)}</td>
                              <td>{r.device_id}</td>
                              <td>{r.source}</td>
                              <td>{num(r.packet_rate, 1)}</td>
                              <td>{num(r.byte_rate)}</td>
                              <td>
                                <span className={"badge " + r.severity}>
                                  {r.risk_score.toFixed(2)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!chart.length && (
                        <div className="empty">
                          No telemetry yet. Start the demo to populate
                          analytics.
                        </div>
                      )}
                    </div>
                  </Panel>
                </>
              )}
            </>
          )}
          <footer>
            <span>
              <Shield size={13} /> IoT Sentinel · AI-Based Network Intrusion and
              Anomaly Detection
            </span>
            <span>
              {updated
                ? "Last sync " + updated.toLocaleTimeString()
                : "Awaiting connection"}
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
const tooltip = {
  background: "#131e30",
  border: "1px solid #31415b",
  borderRadius: 8,
  color: "#e7edf7",
};
function Stat({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {children}
    </section>
  );
}
function Plot({
  empty,
  children,
}: {
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="plot">
      {empty ? (
        <div className="empty">Start the demo to collect telemetry.</div>
      ) : (
        children
      )}
    </div>
  );
}
function Score({ label, value }: { label: string; value: number }) {
  return (
    <div className="score">
      <div>
        <span>{label}</span>
        <b>{value.toFixed(2)}</b>
      </div>
      <div className="track">
        <div style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}
function DeviceCards({ devices }: { devices: Snapshot["devices"] }) {
  return (
    <div className="device-grid">
      {devices.map((d) => {
        const fresh =
          d.latest && Date.now() - Date.parse(d.latest.timestamp) < 10000;
        return (
          <section className="device-card" key={d.id}>
            <div className="device-head">
              <span className="chip-icon">
                <Cpu size={24} />
              </span>
              <span className={"badge " + (fresh ? "low" : "offline")}>
                {fresh ? "Recent telemetry" : "No recent telemetry"}
              </span>
            </div>
            <h3>{d.name}</h3>
            <p className="muted">{d.id} · ESP32-compatible schema</p>
            <div className="device-metrics">
              <div>
                <small>PACKETS / SEC</small>
                <b>{num(d.latest?.packet_rate, 1)}</b>
              </div>
              <div>
                <small>RISK SCORE</small>
                <b>{d.latest ? d.latest.risk_score.toFixed(2) : "—"}</b>
              </div>
              <ArrowUpRight size={20} />
            </div>
            <div className="device-foot">
              {d.latest
                ? `${d.latest.source} · last received ${time(d.latest.timestamp)}`
                : "Awaiting first telemetry window"}
            </div>
          </section>
        );
      })}
    </div>
  );
}
function Alerts({ alerts }: { alerts: Alert[] }) {
  return alerts.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Severity</th>
            <th>Device / time</th>
            <th>Risk</th>
            <th>Detection reasons</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((a) => (
            <tr key={a.id}>
              <td>
                <span className={"badge " + a.severity}>{a.severity}</span>
              </td>
              <td>
                <b>{a.device_id}</b>
                <small className="time">
                  {new Date(a.timestamp).toLocaleDateString()} ·{" "}
                  {time(a.timestamp)}
                </small>
              </td>
              <td>{a.risk_score.toFixed(2)}</td>
              <td>
                <ul className="reasons">
                  {a.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="empty">
      <Shield size={28} />
      <p>
        No alerts recorded. Abnormal Behaviour generates synthetic deviations.
      </p>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

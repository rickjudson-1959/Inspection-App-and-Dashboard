import { useState } from "react";

const ACTIVITIES = [
  { id: "mainline_welding", label: "Mainline Welding", icon: "🔥" },
  { id: "tie_in", label: "Tie-In / Hot Tap", icon: "🔗" },
  { id: "excavation", label: "Excavation & Trenching", icon: "⛏️" },
  { id: "confined_space", label: "Confined Space Entry", icon: "🚪" },
  { id: "hydrotest", label: "Hydrotest / Pressure Test", icon: "💧" },
  { id: "line_locating", label: "Line Locating", icon: "📡" },
  { id: "heavy_lift", label: "Heavy Lift / Crane Ops", icon: "🏗️" },
  { id: "hdd", label: "HDD / Road Crossing", icon: "🛣️" },
  { id: "coating", label: "Coating & Wrapping", icon: "🎨" },
  { id: "purging", label: "Purging / Commissioning", icon: "💨" },
  { id: "backfill", label: "Backfill & Compaction", icon: "🪨" },
  { id: "watercourse", label: "Watercourse Crossing", icon: "🌊" },
];

const WEATHER = ["☀️ Clear", "🌤 Partly Cloudy", "☁️ Overcast", "🌧 Rain", "❄️ Snow / Ice", "💨 High Wind", "🌫 Fog"];
const PIPE_SIZES = ["4\"", "6\"", "8\"", "10\"", "12\"", "16\"", "20\"", "24\"", "30\"", "36\"", "42\"+"];

const today = new Date();
const formatDate = (d) => d.toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
const getDayOfYear = (d) => { const s = new Date(d.getFullYear(), 0, 0); return Math.floor((d - s) / 86400000); };
const weekNumber = Math.ceil(getDayOfYear(today) / 7);

const labelStyle = {
  display: "block", fontSize: 10, letterSpacing: 3, color: "#6b7280",
  textTransform: "uppercase", fontFamily: "monospace", marginBottom: 6, fontWeight: 600,
};
const fieldBase = {
  width: "100%", background: "#1a1d26", border: "1px solid #2d3748",
  borderRadius: 6, padding: "9px 12px", color: "#e8e0d4", fontSize: 13,
  outline: "none", boxSizing: "border-box", fontFamily: "monospace",
};

export default function InspectorJournal() {
  const [activities, setActivities] = useState([]);
  const [weather, setWeather] = useState("");
  const [pipeSize, setPipeSize] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [safetyTip, setSafetyTip] = useState(null);
  const [toolboxTalk, setToolboxTalk] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tbLoading, setTbLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("journal");

  const toggleActivity = (id) => {
    setActivities((prev) => prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]);
    setSafetyTip(null);
  };

  const buildContext = () => {
    const labels = activities.map((id) => ACTIVITIES.find((a) => a.id === id)?.label).join(", ");
    return `Activities: ${labels || "general pipeline construction"}. Weather: ${weather || "not specified"}. Pipe size: ${pipeSize || "not specified"}. Location: ${location || "pipeline right-of-way"}.`;
  };

  const generateSafetyTip = async () => {
    if (!activities.length) return;
    setLoading(true); setSafetyTip(null);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          system: "You are a pipeline construction safety expert with 25+ years of field experience following API 1169 standards. Your safety content is direct, specific, and field-relevant — never generic HR boilerplate. Output ONLY valid JSON, no markdown or preamble.",
          messages: [{
            role: "user",
            content: `Generate a daily safety micro-tip for a pipeline inspector. Context: ${buildContext()}

Return ONLY this JSON:
{
  "headline": "Short punchy safety headline (max 10 words)",
  "tip": "2-3 sentence practical safety tip specific to the activities and conditions. Include a specific hazard, consequence, and action.",
  "question": "One reflective question the inspector should ask themselves or their crew today.",
  "regulation": "One relevant standard reference (e.g., CSA Z662, OSHA 1910.146, API 1169)"
}`
          }],
        }),
      });
      const data = await res.json();
      setSafetyTip(JSON.parse(data.content[0].text.replace(/```json|```/g, "").trim()));
    } catch {
      setSafetyTip({ headline: "Connection Error", tip: "Could not reach AI engine. Check your connection and try again.", question: "", regulation: "" });
    }
    setLoading(false);
  };

  const generateToolboxTalk = async () => {
    if (!activities.length) return;
    setTbLoading(true); setToolboxTalk(null);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          system: "You are a pipeline construction safety expert. Generate practical toolbox talk outlines for pipeline crews. Be specific, field-relevant, and direct. Output ONLY valid JSON, no markdown.",
          messages: [{
            role: "user",
            content: `Generate a weekly toolbox talk outline. Context: ${buildContext()}

Return ONLY this JSON:
{
  "title": "Toolbox talk title",
  "theme": "Safety theme for the week",
  "duration": "e.g. 10-15 minutes",
  "opening": "Opening statement/scene-setter (2 sentences)",
  "keyPoints": [
    {"point": "Key point title", "detail": "1-2 sentence explanation with specific hazard and action"},
    {"point": "Key point title", "detail": "1-2 sentence explanation with specific hazard and action"},
    {"point": "Key point title", "detail": "1-2 sentence explanation with specific hazard and action"},
    {"point": "Key point title", "detail": "1-2 sentence explanation with specific hazard and action"}
  ],
  "discussion": "One discussion question for the crew",
  "commitment": "One specific action item for everyone to take today",
  "references": ["Reference 1", "Reference 2"]
}`
          }],
        }),
      });
      const data = await res.json();
      setToolboxTalk(JSON.parse(data.content[0].text.replace(/```json|```/g, "").trim()));
    } catch {
      setToolboxTalk({ title: "Connection Error", theme: "", duration: "", opening: "Could not generate toolbox talk.", keyPoints: [], discussion: "", commitment: "", references: [] });
    }
    setTbLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f1117", color: "#e8e0d4", fontFamily: "'Georgia', serif" }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#1a1d26,#0f1117)", borderBottom: "3px solid #f97316", padding: "20px 24px 0", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 740, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: 4, color: "#f97316", fontFamily: "monospace", textTransform: "uppercase", marginBottom: 3 }}>Pipeline Inspector</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#fff", letterSpacing: -1 }}>Field Journal</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#4b5563", fontFamily: "monospace" }}>WEEK {weekNumber}</div>
              <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace", marginTop: 2 }}>{formatDate(today)}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {[["journal", "Daily Log"], ["toolbox", "Toolbox Talk"]].map(([id, label]) => (
              <button key={id} onClick={() => setActiveTab(id)} style={{
                padding: "7px 18px", background: activeTab === id ? "#f97316" : "transparent",
                border: `1px solid ${activeTab === id ? "#f97316" : "#374151"}`, borderBottom: "none",
                borderRadius: "5px 5px 0 0", color: activeTab === id ? "#000" : "#6b7280",
                fontFamily: "monospace", fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
                cursor: "pointer", fontWeight: activeTab === id ? 700 : 400,
              }}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 740, margin: "0 auto", padding: "24px 16px 80px" }}>

        {/* ── JOURNAL TAB ── */}
        {activeTab === "journal" && <>

          {/* Site Conditions */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Weather", el: <select value={weather} onChange={e => setWeather(e.target.value)} style={fieldBase}><option value="">Select...</option>{WEATHER.map(w => <option key={w}>{w}</option>)}</select> },
              { label: "Pipe Size", el: <select value={pipeSize} onChange={e => setPipeSize(e.target.value)} style={fieldBase}><option value="">Select...</option>{PIPE_SIZES.map(s => <option key={s}>{s}</option>)}</select> },
              { label: "Location / Context", el: <input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. HWY crossing, KP 14.2" style={fieldBase} /> },
            ].map(({ label, el }) => (
              <div key={label}><label style={labelStyle}>{label}</label>{el}</div>
            ))}
          </div>

          {/* Activity Picker */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ ...labelStyle, marginBottom: 10, display: "block" }}>
              Today's Activities <span style={{ color: "#4b5563", fontWeight: 400 }}>— select all that apply</span>
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {ACTIVITIES.map(({ id, label, icon }) => {
                const sel = activities.includes(id);
                return (
                  <button key={id} onClick={() => toggleActivity(id)} style={{
                    padding: "7px 13px", background: sel ? "rgba(249,115,22,0.12)" : "#1a1d26",
                    border: `1.5px solid ${sel ? "#f97316" : "#2d3748"}`, borderRadius: 6,
                    color: sel ? "#f97316" : "#6b7280", fontFamily: "monospace", fontSize: 12,
                    cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <span>{icon}</span><span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Generate Button */}
          <button onClick={generateSafetyTip} disabled={!activities.length || loading} style={{
            width: "100%", padding: 14,
            background: !activities.length ? "#1a1d26" : "linear-gradient(135deg,#ea580c,#f97316)",
            border: "none", borderRadius: 8, color: !activities.length ? "#374151" : "#000",
            fontFamily: "monospace", fontSize: 13, letterSpacing: 2, textTransform: "uppercase",
            fontWeight: 700, cursor: !activities.length ? "not-allowed" : "pointer", marginBottom: 20,
          }}>
            {loading ? "⚙️  Generating Safety Brief..." : "⚡  Generate Today's Safety Brief"}
          </button>

          {/* Safety Tip */}
          {safetyTip && (
            <div style={{
              background: "linear-gradient(135deg,#1a1d26,#141720)", border: "1px solid #f97316",
              borderLeft: "4px solid #f97316", borderRadius: 8, padding: 20, marginBottom: 20,
              animation: "fadeIn 0.35s ease",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 10, letterSpacing: 3, color: "#f97316", fontFamily: "monospace" }}>⚠ DAILY SAFETY BRIEF</span>
                <span style={{ fontSize: 10, color: "#374151", fontFamily: "monospace" }}>AI · {activities.map(id => ACTIVITIES.find(a => a.id === id)?.icon).join(" ")}</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 12, lineHeight: 1.3 }}>{safetyTip.headline}</div>
              <p style={{ fontSize: 14, color: "#d1d5db", lineHeight: 1.75, marginBottom: 16 }}>{safetyTip.tip}</p>
              <div style={{ background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.18)", borderRadius: 6, padding: "12px 14px", marginBottom: 12 }}>
                <div style={{ fontSize: 10, letterSpacing: 2, color: "#f97316", fontFamily: "monospace", marginBottom: 6 }}>TAILGATE QUESTION</div>
                <div style={{ fontSize: 13, color: "#e8e0d4", fontStyle: "italic" }}>"{safetyTip.question}"</div>
              </div>
              {safetyTip.regulation && <div style={{ fontSize: 11, color: "#4b5563", fontFamily: "monospace" }}>📋 {safetyTip.regulation}</div>}
            </div>
          )}

          {/* Field Notes */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Field Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Inspection observations, NCRs flagged, crew notes, conditions..."
              rows={5} style={{ ...fieldBase, resize: "vertical", lineHeight: 1.7, fontFamily: "'Georgia', serif", fontSize: 14, minHeight: 120 }} />
          </div>

          {/* Log Summary */}
          {activities.length > 0 && (
            <div style={{ background: "#1a1d26", border: "1px solid #2d3748", borderRadius: 8, padding: 14, fontFamily: "monospace", fontSize: 11 }}>
              <div style={{ color: "#4b5563", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>Today's Log Summary</div>
              <div style={{ color: "#9ca3af" }}>{activities.map(id => ACTIVITIES.find(a => a.id === id)?.label).join(" · ")}</div>
              <div style={{ color: "#4b5563", marginTop: 4 }}>{[weather, pipeSize && `${pipeSize} pipe`, location].filter(Boolean).join(" · ")}</div>
            </div>
          )}
        </>}

        {/* ── TOOLBOX TAB ── */}
        {activeTab === "toolbox" && <>

          <div style={{ background: "#1a1d26", border: "1px solid #2d3748", borderRadius: 8, padding: 14, marginBottom: 20, fontFamily: "monospace", fontSize: 12, color: "#6b7280", lineHeight: 1.7 }}>
            {!activities.length
              ? "← Select today's activities in the Daily Log tab first — the toolbox talk will be tailored to what your crew is actually working on."
              : `Generating for: ${activities.map(id => ACTIVITIES.find(a => a.id === id)?.label).join(", ")}`}
          </div>

          <button onClick={generateToolboxTalk} disabled={!activities.length || tbLoading} style={{
            width: "100%", padding: 14,
            background: !activities.length ? "#1a1d26" : "linear-gradient(135deg,#1d4ed8,#3b82f6)",
            border: "none", borderRadius: 8, color: !activities.length ? "#374151" : "#fff",
            fontFamily: "monospace", fontSize: 13, letterSpacing: 2, textTransform: "uppercase",
            fontWeight: 700, cursor: !activities.length ? "not-allowed" : "pointer", marginBottom: 24,
          }}>
            {tbLoading ? "⚙️  Building Toolbox Talk..." : "📋  Generate Toolbox Talk Outline"}
          </button>

          {toolboxTalk && (
            <div style={{ background: "#1a1d26", border: "1px solid #3b82f6", borderRadius: 8, overflow: "hidden", animation: "fadeIn 0.35s ease" }}>
              <div style={{ background: "linear-gradient(135deg,#1e3a5f,#1a1d26)", padding: 20, borderBottom: "1px solid #2d3748" }}>
                <div style={{ fontSize: 10, letterSpacing: 3, color: "#60a5fa", fontFamily: "monospace", marginBottom: 6 }}>WEEK {weekNumber} TOOLBOX TALK · {toolboxTalk.duration}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{toolboxTalk.title}</div>
                <div style={{ fontSize: 11, color: "#60a5fa", fontFamily: "monospace" }}>Theme: {toolboxTalk.theme}</div>
              </div>

              <div style={{ padding: 20 }}>
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 10, letterSpacing: 3, color: "#60a5fa", fontFamily: "monospace", marginBottom: 8 }}>OPENING</div>
                  <p style={{ fontSize: 14, color: "#d1d5db", lineHeight: 1.75 }}>{toolboxTalk.opening}</p>
                </div>

                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 10, letterSpacing: 3, color: "#60a5fa", fontFamily: "monospace", marginBottom: 10 }}>KEY POINTS</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {toolboxTalk.keyPoints?.map((kp, i) => (
                      <div key={i} style={{ display: "flex", gap: 12, padding: "12px 14px", background: "#141720", borderRadius: 6, borderLeft: "3px solid #3b82f6" }}>
                        <div style={{ color: "#3b82f6", fontFamily: "monospace", fontWeight: 700, fontSize: 13, minWidth: 18 }}>{i + 1}.</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{kp.point}</div>
                          <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.65 }}>{kp.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ background: "rgba(96,165,250,0.07)", border: "1px solid rgba(96,165,250,0.18)", borderRadius: 6, padding: 14, marginBottom: 12 }}>
                  <div style={{ fontSize: 10, letterSpacing: 3, color: "#60a5fa", fontFamily: "monospace", marginBottom: 6 }}>DISCUSSION QUESTION</div>
                  <p style={{ fontSize: 13, color: "#e8e0d4", fontStyle: "italic", margin: 0 }}>"{toolboxTalk.discussion}"</p>
                </div>

                <div style={{ background: "rgba(249,115,22,0.07)", border: "1px solid rgba(249,115,22,0.18)", borderRadius: 6, padding: 14, marginBottom: 16 }}>
                  <div style={{ fontSize: 10, letterSpacing: 3, color: "#f97316", fontFamily: "monospace", marginBottom: 6 }}>TODAY'S COMMITMENT</div>
                  <p style={{ fontSize: 13, color: "#e8e0d4", margin: 0 }}>{toolboxTalk.commitment}</p>
                </div>

                {toolboxTalk.references?.length > 0 && (
                  <div style={{ fontFamily: "monospace", fontSize: 11, color: "#374151" }}>
                    <div style={{ marginBottom: 5, letterSpacing: 2, color: "#4b5563" }}>REFERENCES</div>
                    {toolboxTalk.references.map((r, i) => <div key={i} style={{ marginBottom: 2 }}>• {r}</div>)}
                  </div>
                )}
              </div>
            </div>
          )}
        </>}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        select option { background: #1a1d26; }
        textarea::placeholder, input::placeholder { color: #374151; }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}

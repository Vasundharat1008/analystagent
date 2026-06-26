import { useCallback, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Upload, FileText, Activity, AlertTriangle, Sparkles, Brain, Target,
  Wand2, Download, MessageSquare, Trophy, ChevronDown, Loader2, BarChart3,
  Database, CheckCircle2, XCircle, TrendingUp, Lightbulb, Send,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  LineChart, Line, CartesianGrid, Legend,
} from "recharts";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { parseCSV, analyze, summaryForAI, type DatasetSummary, type Row } from "@/lib/dataset";
import { callAI } from "@/lib/openrouter.functions";

export const Route = createFileRoute("/")({
  component: InsightAIApp,
});

const CHART_COLORS = ["#a78bfa", "#60a5fa", "#22d3ee", "#f0abfc", "#fbbf24", "#34d399"];

interface AIReport {
  executiveSummary: string;
  keyFindings: string[];
  risks: string[];
  opportunities: string[];
  recommendations: string[];
  businessImpact: string;
  actionPlan: { step: string; description: string }[];
}

interface ActionPlan {
  priorities: {
    title: string;
    reason: string;
    impact: "High" | "Medium" | "Low";
    difficulty: "High" | "Medium" | "Low";
    timeline: string;
    metric: string;
  }[];
}

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
}

function safeParseJSON<T>(text: string): T | null {
  try { return JSON.parse(text) as T; } catch { /* try extract */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]) as T; } catch { return null; } }
  return null;
}

function localReport(s: DatasetSummary): AIReport {
  return {
    executiveSummary: `Dataset "${s.fileName}" contains ${s.rows} rows across ${s.columns} columns with a data quality score of ${s.qualityPercent}% (${s.healthLabel}). The structure supports ${s.numericColumns.length} quantitative and ${s.categoricalColumns.length} categorical dimensions for analysis.`,
    keyFindings: [
      `${s.numericColumns.length} numeric and ${s.categoricalColumns.length} categorical columns identified`,
      `${s.missingValues} missing values (${((s.missingValues / Math.max(1, s.rows * s.columns)) * 100).toFixed(1)}%)`,
      `${s.duplicateRows} duplicate rows detected`,
    ],
    risks: s.weaknesses,
    opportunities: [
      "Apply segmentation across categorical dimensions",
      "Build forecasting on numeric metrics",
      "Combine columns to derive composite KPIs",
    ],
    recommendations: s.improvements.length ? s.improvements : ["Maintain current data hygiene", "Expand collection to deepen insights"],
    businessImpact: `Cleaning identified issues could improve analytical reliability by an estimated ${Math.min(40, 100 - s.qualityPercent)}%.`,
    actionPlan: [
      { step: "Clean & validate", description: "Resolve missing values and duplicates." },
      { step: "Analyze segments", description: "Break down key metrics by top categories." },
      { step: "Operationalize insights", description: "Translate findings into measurable KPIs." },
    ],
  };
}

function InsightAIApp() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<DatasetSummary | null>(null);
  const [preview, setPreview] = useState<Row[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawCSV, setRawCSV] = useState<string>("");

  const [report, setReport] = useState<AIReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [plan, setPlan] = useState<ActionPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);

  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const [whatIfInput, setWhatIfInput] = useState("");
  const [whatIfResult, setWhatIfResult] = useState<string>("");
  const [whatIfLoading, setWhatIfLoading] = useState(false);

  const callAIFn = useServerFn(callAI);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please upload a .csv file");
      return;
    }
    const text = await file.text();
    if (!text.trim()) { toast.error("File is empty"); return; }
    try {
      const { headers: h, data } = parseCSV(text);
      if (!h.length || !data.length) { toast.error("CSV has no parseable data"); return; }
      const s = analyze(file.name, h, data);
      setHeaders(h);
      setPreview(data.slice(0, 20));
      setSummary(s);
      setRawCSV(text);
      setReport(null); setPlan(null); setChat([]); setWhatIfResult("");
      toast.success(`Loaded ${s.rows} rows × ${s.columns} columns`);
      setTimeout(() => document.getElementById("dashboard")?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e) {
      toast.error("Failed to parse CSV: " + (e as Error).message);
    }
  }, []);

  const generateReport = async () => {
    if (!summary) return;
    setReportLoading(true);
    try {
      const res = await callAIFn({
        data: {
          system: "You are InsightAI, a professional AI Business Analyst Agent. Analyze the provided dataset metadata and produce practical, business-focused insights. Return structured JSON only.",
          user: `Analyze this dataset metadata and return JSON with keys: executiveSummary (string), keyFindings (string[]), risks (string[]), opportunities (string[]), recommendations (string[]), businessImpact (string), actionPlan (array of {step, description}).\n\nMETADATA:\n${JSON.stringify(summaryForAI(summary))}`,
          json: true,
        },
      });
      if (res.ok) {
        const parsed = safeParseJSON<AIReport>(res.content);
        if (parsed) { setReport(parsed); toast.success(`Report generated (key ${res.keyIndex})`); }
        else { setReport(localReport(summary)); toast.warning("Used local fallback (parse failed)"); }
      } else {
        setReport(localReport(summary));
        toast.warning("AI unavailable — using local analysis");
      }
    } finally { setReportLoading(false); }
  };

  const generatePlan = async () => {
    if (!summary) return;
    setPlanLoading(true);
    try {
      const res = await callAIFn({
        data: {
          system: "You are InsightAI, a strategic business advisor. Return JSON only.",
          user: `Based on this dataset metadata, return JSON: { priorities: [{title, reason, impact: 'High'|'Medium'|'Low', difficulty: 'High'|'Medium'|'Low', timeline, metric}] } with exactly 3 priorities.\n\nMETADATA:\n${JSON.stringify(summaryForAI(summary))}`,
          json: true,
        },
      });
      if (res.ok) {
        const parsed = safeParseJSON<ActionPlan>(res.content);
        if (parsed?.priorities) { setPlan(parsed); toast.success("Strategic plan ready"); return; }
      }
      // fallback
      setPlan({
        priorities: [
          { title: "Improve data quality", reason: `${summary.missingValues} missing values and ${summary.duplicateRows} duplicates limit analysis confidence.`, impact: "High", difficulty: "Low", timeline: "1–2 weeks", metric: "Quality score ≥ 95%" },
          { title: "Segment by top categories", reason: "Categorical dimensions enable performance breakdown across the business.", impact: "High", difficulty: "Medium", timeline: "2–4 weeks", metric: "Identify top 3 performing segments" },
          { title: "Operationalize KPIs", reason: "Convert numeric metrics into tracked KPIs with thresholds.", impact: "Medium", difficulty: "Medium", timeline: "4–6 weeks", metric: "5 KPIs in weekly review" },
        ],
      });
      toast.warning("Used local strategic plan");
    } finally { setPlanLoading(false); }
  };

  const askAgent = async () => {
    if (!summary || !chatInput.trim()) return;
    const q = chatInput.trim();
    setChatInput("");
    setChat((c) => [...c, { role: "user", content: q }]);
    setChatLoading(true);
    try {
      const res = await callAIFn({
        data: {
          system: "You are InsightAI's reasoning agent. Think step-by-step. Return JSON only.",
          user: `Question: ${q}\n\nDataset metadata:\n${JSON.stringify(summaryForAI(summary))}\n\nReturn JSON: { thinking: string (your step-by-step reasoning process), answer: string (clear final answer for the user) }`,
          json: true,
        },
      });
      let thinking = ""; let answer = "";
      if (res.ok) {
        const parsed = safeParseJSON<{ thinking: string; answer: string }>(res.content);
        if (parsed) { thinking = parsed.thinking; answer = parsed.answer; }
        else { answer = res.content; }
      } else {
        // local fallback
        const lower = q.toLowerCase();
        thinking = "AI unavailable. Matching question to local dataset facts.";
        if (lower.includes("row")) answer = `The dataset has ${summary.rows} rows.`;
        else if (lower.includes("column")) answer = `There are ${summary.columns} columns: ${summary.columnNames.join(", ")}.`;
        else if (lower.includes("missing")) answer = `${summary.missingValues} missing values detected.`;
        else if (lower.includes("duplicate")) answer = `${summary.duplicateRows} duplicate rows.`;
        else if (lower.includes("quality") || lower.includes("score")) answer = `Quality ${summary.qualityPercent}% · Health ${summary.healthScore}/100 (${summary.healthLabel}).`;
        else answer = `Dataset summary: ${summary.rows} rows × ${summary.columns} cols, ${summary.qualityPercent}% quality, ${summary.missingValues} missing, ${summary.duplicateRows} duplicates.`;
      }
      setChat((c) => [...c, { role: "assistant", content: answer, thinking }]);
    } finally { setChatLoading(false); }
  };

  const runWhatIf = async () => {
    if (!summary || !whatIfInput.trim()) return;
    setWhatIfLoading(true);
    try {
      const res = await callAIFn({
        data: {
          system: "You are InsightAI's scenario simulator. Estimate plausible impact from dataset statistics. Return JSON only.",
          user: `Scenario: ${whatIfInput}\n\nDataset metadata:\n${JSON.stringify(summaryForAI(summary))}\n\nReturn JSON: { assumptions: string[], reasoning: string, estimatedImpact: string, recommendation: string, dataGaps: string[] }`,
          json: true,
        },
      });
      if (res.ok) {
        const parsed = safeParseJSON<{ assumptions: string[]; reasoning: string; estimatedImpact: string; recommendation: string; dataGaps: string[] }>(res.content);
        if (parsed) {
          setWhatIfResult(JSON.stringify(parsed, null, 2));
          return;
        }
      }
      setWhatIfResult(`Local estimate:\nScenario: ${whatIfInput}\n\nBased on current dataset (${summary.rows} rows, ${summary.qualityPercent}% quality):\n- Impact depends on which columns are affected.\n- Cleaning missing values (${summary.missingValues}) could improve confidence by ~${Math.min(40, 100 - summary.qualityPercent)}%.\n- Recommendation: validate scenario assumptions against historical data before action.`);
    } finally { setWhatIfLoading(false); }
  };

  const downloadReport = async () => {
    if (!summary) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 48;
    const maxW = pageW - marginX * 2;
    let y = 56;

    const ensureSpace = (needed: number) => {
      if (y + needed > pageH - 48) { doc.addPage(); y = 56; }
    };
    const writeLines = (text: string, size: number, opts: { bold?: boolean; color?: [number, number, number]; gap?: number } = {}) => {
      doc.setFont("helvetica", opts.bold ? "bold" : "normal");
      doc.setFontSize(size);
      doc.setTextColor(...(opts.color ?? [17, 17, 17]));
      const lines = doc.splitTextToSize(text, maxW) as string[];
      const lineH = size * 1.35;
      for (const line of lines) {
        ensureSpace(lineH);
        doc.text(line, marginX, y);
        y += lineH;
      }
      y += opts.gap ?? 4;
    };
    const h1 = (t: string) => writeLines(t, 20, { bold: true, color: [109, 40, 217], gap: 6 });
    const h2 = (t: string) => {
      ensureSpace(40); y += 8;
      writeLines(t, 14, { bold: true, color: [30, 64, 175], gap: 2 });
      ensureSpace(8);
      doc.setDrawColor(229, 231, 235);
      doc.line(marginX, y, marginX + maxW, y);
      y += 10;
    };
    const para = (t: string) => writeLines(t, 11, { gap: 6 });
    const muted = (t: string) => writeLines(t, 9, { color: [107, 114, 128], gap: 6 });
    const bullets = (items: string[]) => { for (const it of items) writeLines(`• ${it}`, 11, { gap: 2 }); y += 4; };

    h1("InsightAI Executive Report");
    muted(`Generated ${new Date().toLocaleString()} · Dataset: ${summary.fileName}`);

    h2("Dataset Overview");
    para(`Rows: ${summary.rows}    Columns: ${summary.columns}    Missing: ${summary.missingValues}    Duplicates: ${summary.duplicateRows}    Quality: ${summary.qualityPercent}%`);

    h2(`Health Score: ${summary.healthScore}/100 (${summary.healthLabel})`);
    writeLines("Strengths", 12, { bold: true, gap: 2 });
    bullets(summary.strengths);
    writeLines("Weaknesses", 12, { bold: true, gap: 2 });
    bullets(summary.weaknesses);

    if (report) {
      h2("Executive Summary");
      para(report.executiveSummary);
      h2("Key Findings"); bullets(report.keyFindings);
      h2("Risks"); bullets(report.risks);
      h2("Opportunities"); bullets(report.opportunities);
      h2("Recommendations"); bullets(report.recommendations);
      h2("Business Impact"); para(report.businessImpact);
    }

    if (plan) {
      h2("Strategic Action Plan");
      plan.priorities.forEach((p, i) => {
        writeLines(`${i + 1}. ${p.title}`, 12, { bold: true, gap: 2 });
        para(p.reason);
        muted(`Impact: ${p.impact} · Difficulty: ${p.difficulty} · Timeline: ${p.timeline} · Metric: ${p.metric}`);
      });
    }

    if (whatIfResult) {
      h2("What-If Analysis");
      para(whatIfResult);
    }

    doc.save(`insightai-report-${Date.now()}.pdf`);
  };


  const exportJSON = () => {
    if (!summary) return;
    const blob = new Blob([JSON.stringify({ summary, report, plan }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `insightai-summary.json`; a.click();
  };

  const exportCSV = () => {
    if (!rawCSV) return;
    const blob = new Blob([rawCSV], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = summary?.fileName || "data.csv"; a.click();
  };

  return (
    <div className="min-h-screen">
      <Toaster theme="dark" position="top-right" />
      <Hero onUploadClick={() => fileInput.current?.click()} onFile={handleFile} />
      <input ref={fileInput} type="file" accept=".csv" hidden onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />

      {summary && (
        <div id="dashboard" className="max-w-7xl mx-auto px-6 py-12 space-y-12">
          <OverviewCards summary={summary} />
          <HealthSection summary={summary} />
          <PreviewTable headers={headers} rows={preview} />
          <ChartsSection summary={summary} headers={headers} preview={preview} />
          <ReportSection report={report} loading={reportLoading} onGenerate={generateReport} />
          <ChatAgent chat={chat} input={chatInput} setInput={setChatInput} onSend={askAgent} loading={chatLoading} />
          <PlanSection plan={plan} loading={planLoading} onGenerate={generatePlan} />
          <WhatIfSection input={whatIfInput} setInput={setWhatIfInput} result={whatIfResult} loading={whatIfLoading} onRun={runWhatIf} />
          <ExportSection onReport={downloadReport} onJSON={exportJSON} onCSV={exportCSV} />
          
        </div>
      )}

      <footer className="border-t border-border/40 py-8 text-center text-sm text-muted-foreground space-y-1">
        <div>Only summarized dataset metadata is sent to AI. Raw rows never leave your browser.</div>
        <div>© 2026 InsightAI | AI Business Analyst Agent</div>
      </footer>
    </div>
  );
}

function Hero({ onUploadClick, onFile }: { onUploadClick: () => void; onFile: (f: File) => void }) {
  const [drag, setDrag] = useState(false);
  return (
    <section className="gradient-hero min-h-[88vh] flex items-center relative overflow-hidden">
      <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(circle at 80% 20%, oklch(0.6 0.25 280 / 0.4), transparent 50%)" }} />
      <div className="max-w-5xl mx-auto px-6 text-center relative">
        <Badge variant="secondary" className="mb-6 glass">
          <Sparkles className="w-3 h-3 mr-1.5" /> AI-powered Data Storytelling & Reasoning Agent
        </Badge>
        <h1 className="text-6xl md:text-8xl font-bold tracking-tight">
          <span className="text-gradient">InsightAI</span>
        </h1>
        <p className="mt-6 text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">
          Transform raw datasets into <span className="text-foreground font-medium">executive intelligence</span>.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Upload a CSV. Get insights, risks, opportunities, reasoning, what-if scenarios, and a strategic action plan.
        </p>
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
          className={`mt-10 mx-auto max-w-xl glass rounded-2xl p-10 transition-all ${drag ? "border-primary glow scale-[1.02]" : ""}`}
        >
          <Upload className="w-10 h-10 mx-auto mb-4 text-primary" />
          <p className="mb-4 text-sm text-muted-foreground">Drag & drop your CSV here, or</p>
          <Button onClick={onUploadClick} size="lg" className="gradient-brand text-white border-0 glow">
            <Upload className="w-4 h-4 mr-2" /> Upload Dataset
          </Button>
        </div>
      </div>
    </section>
  );
}

function Metric({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string | number; sub?: string }) {
  return (
    <Card className="p-5 glass">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="text-3xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Card>
  );
}

function OverviewCards({ summary }: { summary: DatasetSummary }) {
  return (
    <section>
      <SectionTitle icon={Database} title="Dataset Overview" subtitle={summary.fileName} />
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mt-6">
        <Metric icon={FileText} label="Rows" value={summary.rows} />
        <Metric icon={BarChart3} label="Columns" value={summary.columns} />
        <Metric icon={AlertTriangle} label="Missing" value={summary.missingValues} />
        <Metric icon={XCircle} label="Duplicates" value={summary.duplicateRows} />
        <Metric icon={CheckCircle2} label="Quality" value={`${summary.qualityPercent}%`} />
        <Metric icon={TrendingUp} label="Numeric" value={summary.numericColumns.length} />
        <Metric icon={Database} label="Categorical" value={summary.categoricalColumns.length} />
      </div>
    </section>
  );
}

function HealthSection({ summary }: { summary: DatasetSummary }) {
  const color = summary.healthScore >= 85 ? "text-emerald-400" : summary.healthScore >= 70 ? "text-blue-400" : summary.healthScore >= 50 ? "text-yellow-400" : "text-red-400";
  return (
    <section>
      <SectionTitle icon={Activity} title="Dataset Health Score" />
      <Card className="p-6 glass mt-6">
        <div className="grid md:grid-cols-3 gap-6">
          <div className="text-center md:border-r border-border/40 pr-6">
            <div className={`text-7xl font-bold ${color}`}>{summary.healthScore}</div>
            <div className="text-sm text-muted-foreground">out of 100</div>
            <Badge className="mt-3" variant="secondary">{summary.healthLabel}</Badge>
            <Progress value={summary.healthScore} className="mt-4" />
          </div>
          <List title="Strengths" items={summary.strengths} icon={CheckCircle2} color="text-emerald-400" />
          <List title="Weaknesses" items={summary.weaknesses} icon={AlertTriangle} color="text-yellow-400" />
        </div>
        {summary.improvements.length > 0 && (
          <div className="mt-6 pt-6 border-t border-border/40">
            <List title="Improvement Suggestions" items={summary.improvements} icon={Lightbulb} color="text-primary" />
          </div>
        )}
      </Card>
    </section>
  );
}

function List({ title, items, icon: Icon, color }: { title: string; items: string[]; icon: any; color: string }) {
  return (
    <div>
      <h4 className="font-semibold mb-3 flex items-center gap-2"><Icon className={`w-4 h-4 ${color}`} />{title}</h4>
      <ul className="space-y-2 text-sm text-muted-foreground">
        {items.map((it, i) => <li key={i} className="flex gap-2"><span className={color}>•</span>{it}</li>)}
      </ul>
    </div>
  );
}

function PreviewTable({ headers, rows }: { headers: string[]; rows: Row[] }) {
  return (
    <section>
      <SectionTitle icon={FileText} title="Data Preview" subtitle={`First ${rows.length} rows`} />
      <Card className="glass mt-6 overflow-hidden">
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card/95 backdrop-blur">
              <tr>{headers.map((h) => <th key={h} className="text-left p-3 font-semibold border-b border-border/40">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/20 hover:bg-white/5">
                  {headers.map((h) => <td key={h} className="p-3 text-muted-foreground">{String(r[h] ?? "")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}

function ChartsSection({ summary, headers, preview }: { summary: DatasetSummary; headers: string[]; preview: Row[] }) {
  const [chartType, setChartType] = useState<"bar" | "pie" | "line">("bar");
  const [col, setCol] = useState<string>(summary.categoricalColumns[0] || summary.numericColumns[0] || headers[0]);

  const data = useMemo(() => {
    const stat = summary.columnStats.find((c) => c.name === col);
    if (!stat) return [];
    if (stat.type === "categorical") return (stat.topValues ?? []).map((v) => ({ name: v.value, value: v.count }));
    // numeric histogram bins
    const vals = preview.map((r) => Number(r[col])).filter((n) => !isNaN(n));
    if (!vals.length) return [];
    const min = Math.min(...vals), max = Math.max(...vals);
    const bins = 8; const step = (max - min) / bins || 1;
    const buckets = Array.from({ length: bins }, (_, i) => ({ name: `${(min + i * step).toFixed(1)}`, value: 0 }));
    vals.forEach((v) => { const idx = Math.min(bins - 1, Math.floor((v - min) / step)); buckets[idx].value++; });
    return buckets;
  }, [col, summary, preview]);

  return (
    <section>
      <SectionTitle icon={BarChart3} title="Charts & Visualizations" />
      <Card className="p-6 glass mt-6">
        <div className="flex flex-wrap gap-3 mb-6">
          <Select value={col} onValueChange={setCol}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>{headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={chartType} onValueChange={(v) => setChartType(v as any)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bar">Bar</SelectItem>
              <SelectItem value="pie">Pie</SelectItem>
              <SelectItem value="line">Line</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === "bar" ? (
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" />
                <XAxis dataKey="name" stroke="#9ca3af" fontSize={11} />
                <YAxis stroke="#9ca3af" fontSize={11} />
                <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #ffffff20", borderRadius: 8 }} />
                <Bar dataKey="value" fill="#a78bfa" radius={[6, 6, 0, 0]} />
              </BarChart>
            ) : chartType === "pie" ? (
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} label>
                  {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #ffffff20", borderRadius: 8 }} />
                <Legend />
              </PieChart>
            ) : (
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" />
                <XAxis dataKey="name" stroke="#9ca3af" fontSize={11} />
                <YAxis stroke="#9ca3af" fontSize={11} />
                <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #ffffff20", borderRadius: 8 }} />
                <Line type="monotone" dataKey="value" stroke="#a78bfa" strokeWidth={2} dot={{ fill: "#a78bfa" }} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </Card>
    </section>
  );
}

function ReportSection({ report, loading, onGenerate }: { report: AIReport | null; loading: boolean; onGenerate: () => void }) {
  return (
    <section>
      <SectionTitle icon={Sparkles} title="AI Analyst Report" subtitle="Executive-level insights powered by InsightAI" />
      <Card className="p-6 glass mt-6">
        {!report && !loading && (
          <div className="text-center py-8">
            <Button onClick={onGenerate} size="lg" className="gradient-brand text-white border-0">
              <Sparkles className="w-4 h-4 mr-2" /> Generate AI Analyst Report
            </Button>
          </div>
        )}
        {loading && <LoadingState text="Reasoning over your data… detecting risks… generating recommendations" />}
        {report && (
          <div className="space-y-6">
            <Block title="Executive Summary" content={report.executiveSummary} />
            <Tabs defaultValue="findings">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="findings">Findings</TabsTrigger>
                <TabsTrigger value="risks">Risks</TabsTrigger>
                <TabsTrigger value="opps">Opportunities</TabsTrigger>
                <TabsTrigger value="recs">Recommendations</TabsTrigger>
              </TabsList>
              <TabsContent value="findings"><BulletList items={report.keyFindings} /></TabsContent>
              <TabsContent value="risks"><BulletList items={report.risks} color="text-yellow-400" /></TabsContent>
              <TabsContent value="opps"><BulletList items={report.opportunities} color="text-emerald-400" /></TabsContent>
              <TabsContent value="recs"><BulletList items={report.recommendations} color="text-primary" /></TabsContent>
            </Tabs>
            <Block title="Business Impact" content={report.businessImpact} />
            <div>
              <h4 className="font-semibold mb-3">3-Step Action Plan</h4>
              <div className="grid md:grid-cols-3 gap-3">
                {report.actionPlan.map((s, i) => (
                  <Card key={i} className="p-4 bg-card/50">
                    <Badge className="mb-2">Step {i + 1}</Badge>
                    <h5 className="font-semibold mb-1">{s.step}</h5>
                    <p className="text-sm text-muted-foreground">{s.description}</p>
                  </Card>
                ))}
              </div>
            </div>
            <Button onClick={onGenerate} variant="outline" size="sm">Regenerate</Button>
          </div>
        )}
      </Card>
    </section>
  );
}

function ChatAgent({ chat, input, setInput, onSend, loading }: { chat: ChatMsg[]; input: string; setInput: (s: string) => void; onSend: () => void; loading: boolean }) {
  const suggestions = ["What are the biggest risks?", "Which category performs best?", "What data quality issues exist?", "What business decision can be made?"];
  return (
    <section>
      <SectionTitle icon={MessageSquare} title="Ask Your Data — Reasoning Agent" subtitle="Multi-step thinking with visible reasoning" />
      <Card className="p-6 glass mt-6">
        <div className="flex flex-wrap gap-2 mb-4">
          {suggestions.map((s) => (
            <Button key={s} variant="outline" size="sm" onClick={() => setInput(s)}>{s}</Button>
          ))}
        </div>
        <div className="space-y-4 max-h-[500px] overflow-y-auto mb-4">
          {chat.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Ask anything about your dataset.</p>}
          {chat.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl p-4 ${m.role === "user" ? "gradient-brand text-white" : "bg-card/60 border border-border/40"}`}>
                <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                {m.thinking && (
                  <Collapsible className="mt-3">
                    <CollapsibleTrigger className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground">
                      <Brain className="w-3 h-3" /> Agent Thinking Process <ChevronDown className="w-3 h-3" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 text-xs text-muted-foreground bg-background/40 rounded-lg p-3 whitespace-pre-wrap">{m.thinking}</CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            </div>
          ))}
          {loading && <div className="flex justify-start"><div className="bg-card/60 border border-border/40 rounded-2xl p-4"><LoadingState text="Reasoning…" inline /></div></div>}
        </div>
        <div className="flex gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSend()} placeholder="Ask about your data…" />
          <Button onClick={onSend} disabled={loading || !input.trim()} className="gradient-brand text-white border-0"><Send className="w-4 h-4" /></Button>
        </div>
      </Card>
    </section>
  );
}

function PlanSection({ plan, loading, onGenerate }: { plan: ActionPlan | null; loading: boolean; onGenerate: () => void }) {
  const impactColor = (l: string) => l === "High" ? "bg-emerald-500/20 text-emerald-300" : l === "Medium" ? "bg-blue-500/20 text-blue-300" : "bg-muted text-muted-foreground";
  return (
    <section>
      <SectionTitle icon={Target} title="Strategic Action Plan" subtitle="Top 3 business priorities" />
      <Card className="p-6 glass mt-6">
        {!plan && !loading && (
          <div className="text-center py-8">
            <Button onClick={onGenerate} size="lg" className="gradient-brand text-white border-0">
              <Target className="w-4 h-4 mr-2" /> Generate Strategic Plan
            </Button>
          </div>
        )}
        {loading && <LoadingState text="Preparing strategic action plan…" />}
        {plan && (
          <div className="grid md:grid-cols-3 gap-4">
            {plan.priorities.map((p, i) => (
              <Card key={i} className="p-5 bg-card/60 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 gradient-brand opacity-20 rounded-bl-full" />
                <Badge className="mb-3 gradient-brand text-white border-0">Priority {i + 1}</Badge>
                <h4 className="font-bold text-lg mb-2">{p.title}</h4>
                <p className="text-sm text-muted-foreground mb-4">{p.reason}</p>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Impact</span><span className={`px-2 py-0.5 rounded-full ${impactColor(p.impact)}`}>{p.impact}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Difficulty</span><span className={`px-2 py-0.5 rounded-full ${impactColor(p.difficulty)}`}>{p.difficulty}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Timeline</span><span>{p.timeline}</span></div>
                  <div className="pt-2 border-t border-border/40"><span className="text-muted-foreground">Success metric: </span>{p.metric}</div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}

function WhatIfSection({ input, setInput, result, loading, onRun }: { input: string; setInput: (s: string) => void; result: string; loading: boolean; onRun: () => void }) {
  const examples = ["What if sales increase by 10%?", "What if missing values are cleaned?", "What if retention improves by 20%?", "What if low-performing categories are removed?"];
  return (
    <section>
      <SectionTitle icon={Wand2} title="What-If Scenario Simulator" subtitle="Explore plausible outcomes with reasoning" />
      <Card className="p-6 glass mt-6">
        <div className="flex flex-wrap gap-2 mb-4">
          {examples.map((s) => <Button key={s} variant="outline" size="sm" onClick={() => setInput(s)}>{s}</Button>)}
        </div>
        <Textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Describe a what-if scenario…" rows={3} />
        <Button onClick={onRun} disabled={loading || !input.trim()} className="mt-3 gradient-brand text-white border-0">
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
          Run Scenario
        </Button>
        {loading && <div className="mt-4"><LoadingState text="Simulating scenario…" /></div>}
        {result && (
          <pre className="mt-4 p-4 bg-background/40 rounded-lg text-sm whitespace-pre-wrap overflow-x-auto border border-border/40">{result}</pre>
        )}
      </Card>
    </section>
  );
}

function ExportSection({ onReport, onJSON, onCSV }: { onReport: () => void; onJSON: () => void; onCSV: () => void }) {
  return (
    <section>
      <SectionTitle icon={Download} title="Export & Download" />
      <div className="grid md:grid-cols-3 gap-4 mt-6">
        <Card className="p-5 glass">
          <Download className="w-6 h-6 text-primary mb-2" />
          <h4 className="font-semibold mb-1">Executive Report</h4>
          <p className="text-sm text-muted-foreground mb-3">Polished PDF report with all insights.</p>
          <Button onClick={onReport} className="w-full gradient-brand text-white border-0">Download PDF</Button>

        </Card>
        <Card className="p-5 glass">
          <FileText className="w-6 h-6 text-primary mb-2" />
          <h4 className="font-semibold mb-1">Summary JSON</h4>
          <p className="text-sm text-muted-foreground mb-3">Full dataset summary + AI output.</p>
          <Button onClick={onJSON} variant="outline" className="w-full">Download JSON</Button>
        </Card>
        <Card className="p-5 glass">
          <Database className="w-6 h-6 text-primary mb-2" />
          <h4 className="font-semibold mb-1">Processed CSV</h4>
          <p className="text-sm text-muted-foreground mb-3">Original dataset for re-use.</p>
          <Button onClick={onCSV} variant="outline" className="w-full">Download CSV</Button>
        </Card>
      </div>
    </section>
  );
}

function JudgingSection() {
  const items = [
    { title: "Accuracy & Relevance", desc: "Dataset-specific analysis — metadata, stats, and column-aware insights." },
    { title: "Reasoning & Multi-step Thinking", desc: "Visible 'Agent Thinking Process' exposes the chain of reasoning." },
    { title: "Creativity", desc: "What-If Scenario Simulator estimates plausible business impact." },
    { title: "User Experience", desc: "Clean dashboard, smooth chat, and one-click exports." },
    { title: "Reliability & Safety", desc: "5-key API fallback, local rule-based fallback, metadata-only AI calls." },
  ];
  return (
    <section>
      <SectionTitle icon={Trophy} title="Built for Hackathon Judging" />
      <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-3 mt-6">
        {items.map((i) => (
          <Card key={i.title} className="p-4 glass">
            <Trophy className="w-5 h-5 text-primary mb-2" />
            <h5 className="font-semibold text-sm mb-1">{i.title}</h5>
            <p className="text-xs text-muted-foreground">{i.desc}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

function SectionTitle({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl gradient-brand flex items-center justify-center glow">
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <h2 className="text-2xl font-bold">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

function Block({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <h4 className="font-semibold mb-2 text-sm uppercase tracking-wider text-muted-foreground">{title}</h4>
      <p className="text-foreground leading-relaxed">{content}</p>
    </div>
  );
}

function BulletList({ items, color = "text-primary" }: { items: string[]; color?: string }) {
  return (
    <ul className="space-y-2 mt-4">
      {items.map((it, i) => <li key={i} className="flex gap-3 text-sm"><span className={`${color} font-bold`}>→</span><span>{it}</span></li>)}
    </ul>
  );
}

function LoadingState({ text, inline }: { text: string; inline?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${inline ? "" : "justify-center py-8"} text-muted-foreground`}>
      <Loader2 className="w-4 h-4 animate-spin text-primary" />
      <span className="text-sm">{text}</span>
    </div>
  );
}

import Papa from "papaparse";

export type Row = Record<string, string | number | null>;

export interface ColumnStats {
  name: string;
  type: "numeric" | "categorical";
  missing: number;
  unique: number;
  // numeric
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  // categorical
  topValues?: { value: string; count: number }[];
}

export interface DatasetSummary {
  fileName: string;
  rows: number;
  columns: number;
  columnNames: string[];
  missingValues: number;
  duplicateRows: number;
  numericColumns: string[];
  categoricalColumns: string[];
  qualityPercent: number;
  columnStats: ColumnStats[];
  healthScore: number;
  healthLabel: "Excellent" | "Good" | "Fair" | "Needs Attention";
  strengths: string[];
  weaknesses: string[];
  improvements: string[];
}

export function parseCSV(text: string): { headers: string[]; data: Row[] } {
  const result = Papa.parse<Row>(text, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });
  const headers = result.meta.fields ?? [];
  return { headers, data: result.data as Row[] };
}

const isNum = (v: unknown): v is number => typeof v === "number" && !isNaN(v);
const isMissing = (v: unknown) => v === null || v === undefined || v === "" || (typeof v === "number" && isNaN(v));

export function analyze(fileName: string, headers: string[], data: Row[]): DatasetSummary {
  const rows = data.length;
  const columns = headers.length;
  let missingValues = 0;
  const numericColumns: string[] = [];
  const categoricalColumns: string[] = [];
  const columnStats: ColumnStats[] = [];

  for (const col of headers) {
    const values = data.map((r) => r[col]);
    const missing = values.filter(isMissing).length;
    missingValues += missing;
    const nonMissing = values.filter((v) => !isMissing(v));
    const numericRatio = nonMissing.filter(isNum).length / Math.max(1, nonMissing.length);
    const isNumeric = numericRatio > 0.8 && nonMissing.length > 0;
    const uniqueSet = new Set(nonMissing.map((v) => String(v)));

    if (isNumeric) {
      numericColumns.push(col);
      const nums = nonMissing.filter(isNum).sort((a, b) => a - b);
      const mean = nums.reduce((a, b) => a + b, 0) / Math.max(1, nums.length);
      const median = nums.length ? nums[Math.floor(nums.length / 2)] : 0;
      columnStats.push({
        name: col,
        type: "numeric",
        missing,
        unique: uniqueSet.size,
        min: nums[0],
        max: nums[nums.length - 1],
        mean: Number(mean.toFixed(2)),
        median,
      });
    } else {
      categoricalColumns.push(col);
      const counts = new Map<string, number>();
      for (const v of nonMissing) {
        const k = String(v);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const top = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([value, count]) => ({ value, count }));
      columnStats.push({ name: col, type: "categorical", missing, unique: uniqueSet.size, topValues: top });
    }
  }

  // duplicates
  const seen = new Set<string>();
  let duplicateRows = 0;
  for (const r of data) {
    const key = headers.map((h) => String(r[h])).join("|");
    if (seen.has(key)) duplicateRows++;
    else seen.add(key);
  }

  const totalCells = Math.max(1, rows * columns);
  const completeness = 1 - missingValues / totalCells;
  const dupRatio = duplicateRows / Math.max(1, rows);
  const qualityPercent = Math.max(0, Math.min(100, Math.round((completeness - dupRatio * 0.5) * 100)));

  // health score
  let score = 100;
  score -= Math.round((missingValues / totalCells) * 60);
  score -= Math.round(dupRatio * 30);
  if (columns < 2) score -= 10;
  if (rows < 10) score -= 15;
  score = Math.max(0, Math.min(100, score));

  const label: DatasetSummary["healthLabel"] =
    score >= 85 ? "Excellent" : score >= 70 ? "Good" : score >= 50 ? "Fair" : "Needs Attention";

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const improvements: string[] = [];
  if (completeness > 0.95) strengths.push("High data completeness");
  if (duplicateRows === 0) strengths.push("No duplicate rows detected");
  if (numericColumns.length >= 2) strengths.push("Rich numeric features for analysis");
  if (categoricalColumns.length >= 1) strengths.push("Categorical dimensions enable segmentation");

  if (missingValues > 0) {
    weaknesses.push(`${missingValues} missing values across the dataset`);
    improvements.push("Impute missing values using mean/median or domain rules");
  }
  if (duplicateRows > 0) {
    weaknesses.push(`${duplicateRows} duplicate rows`);
    improvements.push("De-duplicate records to avoid skewed analysis");
  }
  if (numericColumns.length === 0) {
    weaknesses.push("No numeric columns detected — limited quantitative analysis");
    improvements.push("Add quantitative metrics (revenue, count, score)");
  }
  if (rows < 50) {
    weaknesses.push("Small sample size may limit statistical confidence");
    improvements.push("Collect additional records to improve reliability");
  }
  if (strengths.length === 0) strengths.push("Dataset successfully parsed");

  return {
    fileName,
    rows,
    columns,
    columnNames: headers,
    missingValues,
    duplicateRows,
    numericColumns,
    categoricalColumns,
    qualityPercent,
    columnStats,
    healthScore: score,
    healthLabel: label,
    strengths,
    weaknesses,
    improvements,
  };
}

export function summaryForAI(s: DatasetSummary) {
  return {
    fileName: s.fileName,
    rows: s.rows,
    columns: s.columns,
    columnNames: s.columnNames,
    missingValues: s.missingValues,
    duplicateRows: s.duplicateRows,
    qualityPercent: s.qualityPercent,
    healthScore: s.healthScore,
    healthLabel: s.healthLabel,
    numericColumns: s.numericColumns,
    categoricalColumns: s.categoricalColumns,
    columnStats: s.columnStats.map((c) => ({
      name: c.name,
      type: c.type,
      missing: c.missing,
      unique: c.unique,
      min: c.min,
      max: c.max,
      mean: c.mean,
      median: c.median,
      topValues: c.topValues,
    })),
  };
}

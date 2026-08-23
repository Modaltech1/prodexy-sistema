"use client";

import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { formatMoney, formatPercent } from "@/lib/money";

export interface MonthlyFinancialSummary {
  month: string;
  gross: number;
  fees: number;
  net: number;
  costs: number;
  profit: number;
  margin: number | null;
}

type ChartMode = "result" | "revenue" | "margin";
type MoneyMetric = "gross" | "fees" | "net" | "costs" | "profit";

interface SeriesDefinition {
  key: MoneyMetric;
  label: string;
  color: string;
}

const WIDTH = 960;
const HEIGHT = 320;
const PLOT = { left: 72, right: 18, top: 28, bottom: 48 };
const RESULT_SERIES: SeriesDefinition[] = [
  { key: "net", label: "Receita líquida", color: "#3156a3" },
  { key: "costs", label: "Custos", color: "#d08a14" },
  { key: "profit", label: "Lucro", color: "#157f4c" },
];
const REVENUE_SERIES: SeriesDefinition[] = [
  { key: "gross", label: "Receita bruta", color: "#17191c" },
  { key: "fees", label: "Taxas", color: "#d08a14" },
  { key: "net", label: "Receita líquida", color: "#3156a3" },
];

export function FinancialYearChart({ data }: { data: MonthlyFinancialSummary[] }) {
  const [mode, setMode] = useState<ChartMode>("result");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const fallbackIndex = useMemo(() => Math.max(0, data.findLastIndex(hasFinancialActivity)), [data]);
  const selectedIndex = activeIndex ?? fallbackIndex;
  const selected = data[selectedIndex];
  const series = mode === "revenue" ? REVENUE_SERIES : RESULT_SERIES;

  return (
    <section className="panel financial-chart-panel">
      <div className="panel-header financial-chart-header">
        <div className="financial-chart-title"><BarChart3 size={16} /><h2>Evolução mensal</h2></div>
        <div className="period-switch financial-chart-switch" role="group" aria-label="Dados exibidos no gráfico">
          <button type="button" className={`segmented-button ${mode === "result" ? "active" : ""}`} onClick={() => setMode("result")}>Resultado</button>
          <button type="button" className={`segmented-button ${mode === "revenue" ? "active" : ""}`} onClick={() => setMode("revenue")}>Receita</button>
          <button type="button" className={`segmented-button ${mode === "margin" ? "active" : ""}`} onClick={() => setMode("margin")}>Margem</button>
        </div>
      </div>
      <div className="financial-chart-summary" aria-live="polite">
        <strong>{selected?.month}</strong>
        {mode === "margin" ? (
          <ChartValue label="Margem" value={selected?.margin == null ? "—" : formatPercent(selected.margin)} color="#635bff" />
        ) : series.map((item) => (
          <ChartValue key={item.key} label={item.label} value={formatMoney(selected?.[item.key] ?? 0)} color={resolveColor(item, selected?.[item.key] ?? 0)} />
        ))}
      </div>
      <div className="financial-chart-scroll">
        {mode === "margin"
          ? <MarginChart data={data} onActive={setActiveIndex} />
          : <MoneyChart data={data} series={series} onActive={setActiveIndex} />}
      </div>
    </section>
  );
}

function MoneyChart({ data, series, onActive }: { data: MonthlyFinancialSummary[]; series: SeriesDefinition[]; onActive: (index: number) => void }) {
  const values = data.flatMap((row) => series.map((item) => row[item.key]));
  const scale = createScale(values);
  const plotWidth = WIDTH - PLOT.left - PLOT.right;
  const step = plotWidth / data.length;
  const groupWidth = step * 0.68;
  const barWidth = groupWidth / series.length;
  const zeroY = scale.y(0);

  return (
    <svg className="financial-chart-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Gráfico mensal de valores financeiros">
      <ChartGrid scale={scale} percent={false} />
      {data.map((row, index) => {
        const centerX = PLOT.left + step * index + step / 2;
        const groupX = centerX - groupWidth / 2;
        const label = series.map((item) => `${item.label}: ${formatMoney(row[item.key])}`).join(", ");
        return (
          <g key={row.month} className="financial-chart-month" tabIndex={0} aria-label={`${row.month}. ${label}`} onMouseEnter={() => onActive(index)} onFocus={() => onActive(index)}>
            <title>{`${row.month}: ${label}`}</title>
            <rect className="financial-chart-hit-area" x={PLOT.left + step * index} y={PLOT.top} width={step} height={HEIGHT - PLOT.top - PLOT.bottom} />
            {series.map((item, seriesIndex) => {
              const value = row[item.key];
              const valueY = scale.y(value);
              return (
                <rect
                  key={item.key}
                  x={groupX + barWidth * seriesIndex + 1}
                  y={Math.min(zeroY, valueY)}
                  width={Math.max(2, barWidth - 2)}
                  height={Math.max(1, Math.abs(zeroY - valueY))}
                  rx={2}
                  fill={resolveColor(item, value)}
                />
              );
            })}
            <text className="financial-chart-month-label" x={centerX} y={HEIGHT - 18} textAnchor="middle">{shortMonth(row.month)}</text>
          </g>
        );
      })}
      <line className="financial-chart-zero" x1={PLOT.left} x2={WIDTH - PLOT.right} y1={zeroY} y2={zeroY} />
    </svg>
  );
}

function MarginChart({ data, onActive }: { data: MonthlyFinancialSummary[]; onActive: (index: number) => void }) {
  const scale = createScale(data.flatMap((row) => row.margin == null ? [] : [row.margin]), true);
  const plotWidth = WIDTH - PLOT.left - PLOT.right;
  const step = plotWidth / data.length;
  const points = data.map((row, index) => row.margin == null ? null : {
    index,
    x: PLOT.left + step * index + step / 2,
    y: scale.y(row.margin),
    value: row.margin,
  });
  const segments = splitSegments(points);

  return (
    <svg className="financial-chart-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Gráfico mensal de margem percentual">
      <ChartGrid scale={scale} percent />
      {segments.map((segment, index) => (
        <polyline key={index} className="financial-chart-line" points={segment.map((point) => `${point.x},${point.y}`).join(" ")} />
      ))}
      {data.map((row, index) => {
        const centerX = PLOT.left + step * index + step / 2;
        const point = points[index];
        const label = row.margin == null ? "Margem indisponível" : `Margem: ${formatPercent(row.margin)}`;
        return (
          <g key={row.month} className="financial-chart-month" tabIndex={0} aria-label={`${row.month}. ${label}`} onMouseEnter={() => onActive(index)} onFocus={() => onActive(index)}>
            <title>{`${row.month}: ${label}`}</title>
            <rect className="financial-chart-hit-area" x={PLOT.left + step * index} y={PLOT.top} width={step} height={HEIGHT - PLOT.top - PLOT.bottom} />
            {point && <circle cx={point.x} cy={point.y} r={5} fill={point.value < 0 ? "#b42318" : "#635bff"} stroke="white" strokeWidth={2} />}
            <text className="financial-chart-month-label" x={centerX} y={HEIGHT - 18} textAnchor="middle">{shortMonth(row.month)}</text>
          </g>
        );
      })}
      {scale.min < 0 && scale.max > 0 && <line className="financial-chart-zero" x1={PLOT.left} x2={WIDTH - PLOT.right} y1={scale.y(0)} y2={scale.y(0)} />}
    </svg>
  );
}

function ChartGrid({ scale, percent }: { scale: Scale; percent: boolean }) {
  return (
    <g aria-hidden="true">
      {scale.ticks.map((tick) => {
        const y = scale.y(tick);
        return (
          <g key={tick}>
            <line className="financial-chart-grid-line" x1={PLOT.left} x2={WIDTH - PLOT.right} y1={y} y2={y} />
            <text className="financial-chart-axis-label" x={PLOT.left - 10} y={y + 4} textAnchor="end">{percent ? compactPercent(tick) : compactMoney(tick)}</text>
          </g>
        );
      })}
    </g>
  );
}

function ChartValue({ label, value, color }: { label: string; value: string; color: string }) {
  return <span><i style={{ background: color }} />{label}<strong>{value}</strong></span>;
}

interface Scale {
  min: number;
  max: number;
  ticks: number[];
  y: (value: number) => number;
}

function createScale(values: number[], percent = false): Scale {
  const rawMin = Math.min(0, ...values);
  const rawMax = Math.max(0, ...values);
  const range = Math.max(1, rawMax - rawMin);
  const min = rawMin < 0 ? rawMin - range * 0.08 : 0;
  const max = rawMax > 0 ? rawMax + range * 0.08 : percent ? 100 : 1;
  const plotHeight = HEIGHT - PLOT.top - PLOT.bottom;
  return {
    min,
    max,
    ticks: Array.from({ length: 5 }, (_, index) => min + (max - min) * index / 4),
    y: (value) => PLOT.top + (max - value) / (max - min) * plotHeight,
  };
}

function splitSegments(points: Array<{ x: number; y: number; value: number } | null>) {
  const segments: Array<Array<{ x: number; y: number; value: number }>> = [];
  let current: Array<{ x: number; y: number; value: number }> = [];
  for (const point of points) {
    if (point) current.push(point);
    else if (current.length) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length) segments.push(current);
  return segments;
}

function hasFinancialActivity(row: MonthlyFinancialSummary) {
  return row.gross !== 0 || row.fees !== 0 || row.costs !== 0;
}

function resolveColor(series: SeriesDefinition, value: number) {
  return series.key === "profit" && value < 0 ? "#b42318" : series.color;
}

function shortMonth(month: string) {
  return month.slice(0, 3).replace(/^./, (letter) => letter.toUpperCase());
}

function compactMoney(value: number) {
  const formatted = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value / 100);
  return `R$ ${formatted}`;
}

function compactPercent(value: number) {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value)}%`;
}

// Plan-It PDF report. Built only from a PlanOutcome produced by the planning
// engine, so every figure matches what the panel shows. Standard PDF fonts have no
// rupee sign, so amounts are written "Rs." in the report.

import { jsPDF } from 'jspdf';
import autoTableImport from 'jspdf-autotable';
import { INTERVENTION_LABEL, PRICES, type CostLine, type PriceRecord } from './costModel';
import { OBJECTIVE_LABEL, describeOption, listJoin, type Plan, type PlanOutcome } from './planEngine';

const CHERRY: [number, number, number] = [110, 28, 46];
const CHERRY_SOFT: [number, number, number] = [196, 120, 134];
const CREAM: [number, number, number] = [246, 238, 222];
const INK: [number, number, number] = [42, 20, 26];
const MUTED: [number, number, number] = [112, 92, 96];
const PIE: [number, number, number][] = [
  [110, 28, 46],
  [190, 98, 64],
  [214, 168, 92],
  [120, 140, 98],
  [88, 112, 140],
  [150, 110, 150],
  [170, 150, 130],
  [70, 60, 60],
];

// jspdf-autotable ships a UMD build: Node returns the function as the default export,
// while the browser bundle can return the module object with the function on `.default`.
const autoTable: typeof autoTableImport =
  typeof autoTableImport === 'function' ? autoTableImport : (autoTableImport as unknown as { default: typeof autoTableImport }).default;

export const MAX_PAGES = 8;
const W = 210;
const M = 16; // page margin, mm

/** Map text to what the standard PDF fonts can draw. */
export function pdfText(s: string): string {
  return s
    .replace(/₹\s?/g, 'Rs. ')
    .replace(/µg\/m³/g, 'ug/m3')
    .replace(/m²/g, 'm2')
    .replace(/[−–—]/g, '-')
    .replace(/→/g, '->')
    .replace(/≥/g, '>=')
    .replace(/×/g, 'x')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7e\n]/g, '');
}

export const rs = (v: number, decimals = 0) => `Rs. ${v.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
const ug = (v: number) => `${v.toFixed(1)} ug/m3`;
const signed = (v: number, d = 2) => `${v > 0 ? '+' : v < 0 ? '-' : ''}${Math.abs(v).toFixed(d)}`;

function lastY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

class Report {
  doc = new jsPDF({ unit: 'mm', format: 'a4' });
  y = M;
  constructor(private outcome: PlanOutcome) {}

  heading(text: string, sub?: string) {
    const d = this.doc;
    d.setFont('helvetica', 'bold');
    d.setFontSize(17);
    d.setTextColor(...CHERRY);
    d.text(pdfText(text), M, 26);
    this.y = 31;
    if (sub) {
      d.setFont('helvetica', 'normal');
      d.setFontSize(10);
      d.setTextColor(...MUTED);
      this.para(sub, 10, MUTED);
    }
    this.y += 2;
  }

  sub(text: string) {
    this.space(12);
    const d = this.doc;
    d.setFont('helvetica', 'bold');
    d.setFontSize(11.5);
    d.setTextColor(...INK);
    d.text(pdfText(text), M, this.y + 4);
    this.y += 7;
  }

  para(text: string, size = 9.5, color: [number, number, number] = INK, bold = false) {
    const d = this.doc;
    d.setFont('helvetica', bold ? 'bold' : 'normal');
    d.setFontSize(size);
    d.setTextColor(...color);
    const lines = d.splitTextToSize(pdfText(text), W - 2 * M) as string[];
    const lh = size * 0.42;
    this.space(lines.length * lh);
    d.text(lines, M, this.y + lh * 0.8);
    this.y += lines.length * lh + 1.5;
  }

  bullets(items: string[], size = 9) {
    for (const t of items) {
      const d = this.doc;
      d.setFont('helvetica', 'normal');
      d.setFontSize(size);
      d.setTextColor(...INK);
      const lines = d.splitTextToSize(pdfText(t), W - 2 * M - 5) as string[];
      const lh = size * 0.42;
      this.space(lines.length * lh);
      d.text('-', M + 1, this.y + lh * 0.8);
      d.text(lines, M + 5, this.y + lh * 0.8);
      this.y += lines.length * lh + 1;
    }
  }

  /** Two-column key figures. */
  figures(rows: [string, string][]) {
    autoTable(this.doc, {
      startY: this.y,
      margin: { left: M, right: M },
      body: rows.map(([k, v]) => [pdfText(k), pdfText(v)]),
      theme: 'plain',
      styles: { fontSize: 9.5, cellPadding: { top: 1.2, bottom: 1.2, left: 2, right: 2 }, textColor: INK },
      columnStyles: { 0: { textColor: MUTED, cellWidth: 70 }, 1: { fontStyle: 'bold' } },
      alternateRowStyles: { fillColor: CREAM },
    });
    this.y = lastY(this.doc) + 4;
  }

  space(h: number) {
    if (this.y + h > 297 - 20) {
      this.doc.addPage();
      this.y = M + 8;
    }
  }

  page() {
    this.doc.addPage();
    this.y = M;
  }

  /** Header band and footer on every page. */
  finish(stamp: string) {
    const d = this.doc;
    const n = d.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      d.setPage(i);
      d.setFillColor(...CHERRY);
      d.rect(0, 0, W, 9, 'F');
      d.setFont('helvetica', 'bold');
      d.setFontSize(8.5);
      d.setTextColor(255, 255, 255);
      d.text('AeroMatrix Plan-It', M, 6);
      d.setFont('helvetica', 'normal');
      d.text(pdfText(`${this.outcome.target?.label ?? ''}, ${stamp}`), W - M, 6, { align: 'right' });
      d.setFontSize(7.5);
      d.setTextColor(...MUTED);
      d.text('Modelled planning estimate from the AeroMatrix prototype scenario engine; not a measured outcome.', M, 289);
      d.text(`Page ${i} of ${n}`, W - M, 289, { align: 'right' });
    }
  }
}

function planSummary(r: Report, plan: Plan, outcome: PlanOutcome) {
  const t = outcome.target!;
  r.figures([
    ['Measures', listJoin(plan.options.map(describeOption))],
    ['One-time costs', rs(plan.oneTime)],
    ['First-year running costs', rs(plan.recurring)],
    ['Total (one-time + first year)', rs(plan.total)],
    ['Budget left', rs(plan.remaining)],
    [`PM2.5, ${t.cityWide ? 'area mean' : t.label}`, `${ug(plan.impact.baseline)} -> ${ug(plan.impact.predicted)}`],
    ['Predicted change', `${signed(plan.impact.abs)} ug/m3${plan.impact.pct != null ? ` (${signed(plan.impact.pct, 1)}%)` : ''}`],
    ['City mean PM2.5', `${ug(plan.impact.cityBaseline)} -> ${ug(plan.impact.cityPredicted)}`],
    ['Zones improved by 0.5 ug/m3 or more', String(plan.impact.zonesImproved)],
  ]);
}

function costRows(lines: CostLine[]) {
  return lines.map((l) => [
    pdfText(l.item) + (l.kind === 'estimate' ? ' *' : ''),
    l.category,
    l.recurring ? 'First year' : 'One-time',
    `${l.quantity.toLocaleString('en-IN')} ${pdfText(l.unit)}`,
    rs(l.unitPrice, l.unitPrice % 1 ? 2 : 0),
    rs(l.total),
  ]);
}

function costTable(r: Report, plan: Plan, compact: boolean) {
  for (const o of plan.options) {
    r.sub(`${o.label}: ${o.quantity.toLocaleString('en-IN')} ${o.quantityUnit}`);
    if (!compact) r.para(o.location, 8.5, MUTED);
    autoTable(r.doc, {
      startY: r.y,
      margin: { left: M, right: M },
      head: [['Item', 'Category', 'Cost type', 'Quantity', 'Unit price', 'Total']],
      body: costRows(o.lines),
      foot: [
        [{ content: `One-time ${rs(o.oneTime)}   First year ${rs(o.recurring)}`, colSpan: 5, styles: { halign: 'right' } }, rs(o.total)],
      ],
      theme: 'grid',
      styles: { fontSize: compact ? 7.5 : 8, cellPadding: compact ? 1 : 1.4, textColor: INK, lineColor: [225, 214, 200], lineWidth: 0.15 },
      headStyles: { fillColor: CHERRY, textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: CREAM, textColor: INK, fontStyle: 'bold' },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } },
    });
    r.y = lastY(r.doc) + 3;
  }
  if (compact) {
    r.para(
      `Plan total ${rs(plan.total)} (one-time ${rs(plan.oneTime)}, first year ${rs(plan.recurring)}); budget left ${rs(plan.remaining)}.`,
      9,
      INK,
      true,
    );
    return;
  }
  autoTable(r.doc, {
    startY: r.y,
    margin: { left: M, right: M },
    body: [
      ['One-time costs', rs(plan.oneTime)],
      ['First-year running costs', rs(plan.recurring)],
      ['Plan total', rs(plan.total)],
      ['Budget', rs(plan.total + plan.remaining)],
      ['Budget left', rs(plan.remaining)],
    ],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.2, textColor: INK },
    columnStyles: { 0: { halign: 'right', textColor: MUTED }, 1: { halign: 'right', fontStyle: 'bold', cellWidth: 40 } },
    didParseCell: (h) => {
      if (h.row.index === 2) h.cell.styles.fillColor = CREAM;
    },
  });
  r.y = lastY(r.doc) + 3;
}

function altPage(r: Report, plan: Plan, outcome: PlanOutcome) {
  r.page();
  r.heading(`Plan ${plan.id}: ${listJoin(plan.options.map(describeOption))}`, plan.tradeoff ? `Against Plan A: ${plan.tradeoff}.` : undefined);
  r.para(plan.reason);
  planSummary(r, plan, outcome);
  costTable(r, plan, true);
}

// ---------------------------------------------------------------- charts

function barChart(
  r: Report,
  title: string,
  groups: { label: string; values: number[] }[],
  series: { name: string; color: [number, number, number] }[],
  fmt: (v: number) => string,
  stacked: boolean,
  height: number,
) {
  const d = r.doc;
  r.sub(title);
  const x0 = M + 22;
  const width = W - M - x0 - 30;
  const max = Math.max(1e-9, ...groups.map((g) => (stacked ? g.values.reduce((s, v) => s + v, 0) : Math.max(...g.values))));
  const rowH = height / groups.length;
  const barH = stacked ? rowH * 0.55 : (rowH * 0.7) / series.length;
  groups.forEach((g, gi) => {
    const top = r.y + gi * rowH;
    d.setFont('helvetica', 'bold');
    d.setFontSize(9);
    d.setTextColor(...INK);
    d.text(g.label, M, top + rowH / 2 + 1);
    let x = x0;
    g.values.forEach((v, si) => {
      const w = (v / max) * width;
      const y = stacked ? top + (rowH - barH) / 2 : top + rowH * 0.15 + si * barH;
      d.setFillColor(...series[si].color);
      d.rect(stacked ? x : x0, y, Math.max(0.3, w), barH * (stacked ? 1 : 0.9), 'F');
      if (!stacked) {
        d.setFont('helvetica', 'normal');
        d.setFontSize(7.5);
        d.setTextColor(...MUTED);
        d.text(fmt(v), x0 + w + 1.5, y + barH * 0.65);
      }
      if (stacked) x += w;
    });
    if (stacked) {
      d.setFont('helvetica', 'normal');
      d.setFontSize(7.5);
      d.setTextColor(...MUTED);
      d.text(fmt(g.values.reduce((s, v) => s + v, 0)), x + 1.5, top + rowH / 2 + 1);
    }
  });
  r.y += height + 2;
  let lx = x0;
  for (const s of series) {
    d.setFillColor(...s.color);
    d.rect(lx, r.y, 3, 3, 'F');
    d.setFontSize(8);
    d.setTextColor(...INK);
    d.text(s.name, lx + 4.5, r.y + 2.6);
    lx += d.getTextWidth(s.name) + 12;
  }
  r.y += 7;
}

function pieChart(r: Report, title: string, slices: { label: string; value: number }[]) {
  const d = r.doc;
  r.sub(title);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const R = 22;
  const cx = M + R + 2;
  const cy = r.y + R + 1;
  let a0 = -Math.PI / 2;
  slices.forEach((s, i) => {
    const a1 = a0 + (s.value / total) * Math.PI * 2;
    d.setFillColor(...PIE[i % PIE.length]);
    d.setDrawColor(...PIE[i % PIE.length]);
    d.setLineWidth(0.2);
    // Fan of thin triangles approximates the arc.
    const steps = Math.max(2, Math.ceil(((a1 - a0) / (Math.PI * 2)) * 90));
    for (let k = 0; k < steps; k++) {
      const p = a0 + ((a1 - a0) * k) / steps;
      const q = a0 + ((a1 - a0) * (k + 1)) / steps + 0.004;
      d.triangle(cx, cy, cx + R * Math.cos(p), cy + R * Math.sin(p), cx + R * Math.cos(q), cy + R * Math.sin(q), 'FD');
    }
    a0 = a1;
  });
  let ly = r.y + 3;
  slices.forEach((s, i) => {
    d.setFillColor(...PIE[i % PIE.length]);
    d.rect(cx + R + 10, ly - 2.6, 3, 3, 'F');
    d.setFont('helvetica', 'normal');
    d.setFontSize(8.5);
    d.setTextColor(...INK);
    d.text(`${s.label}: ${rs(s.value)} (${((s.value / total) * 100).toFixed(1)}%)`, cx + R + 15, ly);
    ly += 5;
  });
  r.y = Math.max(cy + R, ly) + 4;
}

// ---------------------------------------------------------------- report

export function buildPlanPdf(outcome: PlanOutcome, now = new Date()): jsPDF {
  if (outcome.status !== 'OK' || !outcome.plans.length || !outcome.target) throw new Error('There is no feasible plan to report.');
  const stamp = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const r = new Report(outcome);
  const [a, b, c] = outcome.plans;
  const t = outcome.target;

  // 1. Plan A summary
  r.heading('Plan A (recommended)', `${t.label}. Budget ${rs(outcome.budget)}. Objective: ${OBJECTIVE_LABEL[outcome.objective]}. Prepared ${stamp}.`);
  r.para(listJoin(a.options.map(describeOption)), 12, CHERRY, true);
  r.para(a.reason);
  planSummary(r, a, outcome);
  r.sub('What each measure does');
  r.bullets(a.options.map((o) => `${o.label}: ${o.effect}`));
  if (outcome.notes.length || outcome.messages.length) {
    r.sub('Planner notes');
    r.bullets([...outcome.messages, ...outcome.notes]);
  }

  // 2. Plan A costs
  r.page();
  r.heading('Plan A: itemised costs', 'Each line is quantity x unit price, rounded to the rupee. * marks an estimated price; all others are sourced (see the last page).');
  costTable(r, a, false);

  // 3-4. Alternatives
  if (b) altPage(r, b, outcome);
  if (c) altPage(r, c, outcome);

  // 5. Comparison
  r.page();
  r.heading('Comparison of plans', `${outcome.evaluated} packages checked, ${outcome.feasible} within the budget and limits.`);
  autoTable(r.doc, {
    startY: r.y,
    margin: { left: M, right: M },
    head: [['', ...outcome.plans.map((p) => `Plan ${p.id}${p.id === 'A' ? ' (recommended)' : ''}`)]],
    body: [
      ['Measures', ...outcome.plans.map((p) => listJoin(p.options.map(describeOption)))],
      ['One-time costs', ...outcome.plans.map((p) => rs(p.oneTime))],
      ['First-year running', ...outcome.plans.map((p) => rs(p.recurring))],
      ['Total', ...outcome.plans.map((p) => rs(p.total))],
      ['Budget left', ...outcome.plans.map((p) => rs(p.remaining))],
      ['Target PM2.5 now', ...outcome.plans.map((p) => ug(p.impact.baseline))],
      ['Target PM2.5 predicted', ...outcome.plans.map((p) => ug(p.impact.predicted))],
      ['Predicted change', ...outcome.plans.map((p) => `${signed(p.impact.abs)} ug/m3`)],
      ['Reduction per Rs. 1 lakh', ...outcome.plans.map((p) => `${(-p.impact.abs / (p.total / 100000)).toFixed(3)} ug/m3`)],
      ['Zones improved', ...outcome.plans.map((p) => String(p.impact.zonesImproved))],
      ['Against Plan A', ...outcome.plans.map((p) => (p.tradeoff ? pdfText(p.tradeoff) : '-'))],
    ],
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 1.6, textColor: INK, lineColor: [225, 214, 200], lineWidth: 0.15 },
    headStyles: { fillColor: CHERRY, textColor: 255 },
    columnStyles: { 0: { fontStyle: 'bold', textColor: MUTED, cellWidth: 42 } },
  });
  r.y = lastY(r.doc) + 5;
  r.sub('Why they rank this way');
  r.bullets(outcome.plans.map((p) => `Plan ${p.id}: ${p.reason}`));
  r.para(
    `Rejected packages: ${outcome.rejected.overBudget} over budget, ${outcome.rejected.tooMany} with too many measures, ${outcome.rejected.noReduction} with no predicted reduction. Limits are never relaxed to make a plan fit.`,
    8.5,
    MUTED,
  );

  // 6. Graphs and recommendation
  r.page();
  r.heading('Costs and predicted effect');
  barChart(
    r,
    'Cost by plan',
    outcome.plans.map((p) => ({ label: `Plan ${p.id}`, values: [p.oneTime, p.recurring] })),
    [
      { name: 'One-time', color: CHERRY },
      { name: 'First-year running', color: CHERRY_SOFT },
    ],
    (v) => rs(v),
    true,
    8 * outcome.plans.length + 4,
  );
  barChart(
    r,
    `PM2.5 in ${t.cityWide ? 'the analysis area' : t.label}, baseline and predicted`,
    outcome.plans.map((p) => ({ label: `Plan ${p.id}`, values: [p.impact.baseline, p.impact.predicted] })),
    [
      { name: 'Baseline', color: [150, 140, 140] },
      { name: 'Predicted with plan', color: CHERRY },
    ],
    (v) => ug(v),
    false,
    13 * outcome.plans.length,
  );
  const byCat = new Map<string, number>();
  for (const o of a.options) for (const l of o.lines) byCat.set(l.category, (byCat.get(l.category) ?? 0) + l.total);
  pieChart(
    r,
    'Plan A cost by category',
    [...byCat.entries()].sort((x, y) => y[1] - x[1]).map(([label, value]) => ({ label, value })),
  );
  r.sub('Recommendation');
  r.para(
    `Adopt Plan A: ${listJoin(a.options.map(describeOption))} for ${rs(a.total)} (${rs(a.oneTime)} one-time and ${rs(a.recurring)} in first-year running costs), leaving ${rs(a.remaining)} of the budget. ` +
      `The scenario engine predicts PM2.5 in ${t.cityWide ? 'the analysis area' : t.label} falls from ${ug(a.impact.baseline)} to ${ug(a.impact.predicted)} (${signed(a.impact.abs)} ug/m3). ` +
      (b ? `If ${listJoin(a.options.map((o) => INTERVENTION_LABEL[o.type].toLowerCase()))} cannot go ahead, Plan B is the next best mix (${pdfText(b.tradeoff ?? '')}). ` : '') +
      'Confirm prices with current vendor quotations and check the modelled effect against monitoring data after implementation.',
  );

  // 7. Sources and assumptions
  r.page();
  r.heading('Price sources and assumptions');
  const used = new Set(outcome.plans.flatMap((p) => p.options.flatMap((o) => o.lines.map((l) => l.priceId))));
  const records = [...used].map((id) => PRICES[id]).filter((p): p is PriceRecord => !!p);
  autoTable(r.doc, {
    startY: r.y,
    margin: { left: M, right: M },
    head: [['Item', 'Unit price', 'Type', 'Source or basis']],
    body: records.map((p) => [
      pdfText(p.item),
      `${rs(p.unitPrice, p.unitPrice % 1 ? 2 : 0)} / ${pdfText(p.unit)}`,
      p.kind === 'sourced' ? 'Sourced' : 'Estimate',
      p.source ? pdfText(`${p.source.name}. ${p.source.url} (accessed ${p.source.accessed}). ${p.source.note}`) : pdfText(p.basis ?? ''),
    ]),
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.1, textColor: INK, lineColor: [225, 214, 200], lineWidth: 0.15, overflow: 'linebreak' },
    headStyles: { fillColor: CHERRY, textColor: 255 },
    columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 30 }, 2: { cellWidth: 16 } },
  });
  r.y = lastY(r.doc) + 4;
  const as = outcome.assumptions;
  const adj = (Object.keys(as.costMultiplier) as (keyof typeof as.costMultiplier)[]).filter((k) => as.costMultiplier[k] !== 1);
  r.sub('Modelling assumptions');
  r.bullets([
    `Each planted tree adds ${as.treeCanopyM2} m2 of mature canopy to green cover in the target.`,
    `A bag filter captures ${Math.round(as.bagFilterCapture * 100)}% of the remaining particulate emissions of the source it is fitted to.`,
    `Traffic enforcement cuts vehicle traffic in the zone by ${Math.round(as.trafficReduction.standard * 100)}% (standard) or ${Math.round(as.trafficReduction.intensive * 100)}% (intensive).`,
    adj.length
      ? `Cost sensitivity applied: ${adj.map((k) => `${INTERVENTION_LABEL[k].toLowerCase()} ${signed((as.costMultiplier[k] - 1) * 100, 0)}%`).join(', ')}.`
      : 'Prices are used as listed, without sensitivity adjustment.',
    'PM2.5 figures come from the AeroMatrix prototype scenario engine (rule-based dispersion with illustrative coefficients on demo inputs). They are planning estimates, not measurements or guarantees.',
  ], 8.5);

  r.finish(stamp);
  return r.doc;
}

export function planPdfName(outcome: PlanOutcome, now = new Date()): string {
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `AeroMatrix-Plan-It-${outcome.target?.id ?? 'plan'}-${day}.pdf`;
}

export function downloadPlanPdf(outcome: PlanOutcome): void {
  const now = new Date();
  buildPlanPdf(outcome, now).save(planPdfName(outcome, now));
}

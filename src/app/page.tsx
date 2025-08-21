"use client";
import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Trash2, Download, Calculator } from "lucide-react";

// -----------------------------
// Helpers
// -----------------------------
function num(n: any, d = 0) {
  const v = typeof n === "string" ? parseFloat(n) : n;
  return isFinite(v) ? v : d;
}

function toCSV(rows: any[], headers?: string[]) {
  const cols = headers ?? Object.keys(rows[0] ?? {});
  const escape = (s: any) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const lines = [cols.map(escape).join(",")];
  for (const r of rows) lines.push(cols.map((c) => escape(r[c])).join(","));
  return lines.join("\n");
}

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// -----------------------------
// Default factors (edit in UI)
// -----------------------------
const defaultFactors = [
  { category: "fuel", item: "diesel_combustion", unit: "litre", ef_kgco2e_per_unit: 2.68, scope: "S1", notes: "Tailpipe-only diesel" },
  { category: "energy", item: "natural_gas_combustion", unit: "kWh", ef_kgco2e_per_unit: 0.1829, scope: "S1", notes: "Gas combustion" },
  { category: "electricity", item: "grid_location_based", unit: "kWh", ef_kgco2e_per_unit: 0.05, scope: "S2", notes: "Set to your country grid" },
  { category: "f_gases", item: "R410A_GWP100", unit: "kg_leaked", ef_kgco2e_per_unit: 2088, scope: "S1", notes: "GWP100" },
  { category: "transport", item: "employee_commute_avg", unit: "km", ef_kgco2e_per_unit: 0.18, scope: "S3", notes: "Average car per km" },
  // Optional examples for purchased goods (set EFs if known)
  { category: "purchased_goods", item: "LED_lamp_A19", unit: "unit", ef_kgco2e_per_unit: 0, scope: "S3", notes: "Set if you track embodied" },
  { category: "purchased_goods", item: "Ballast_or_driver", unit: "unit", ef_kgco2e_per_unit: 0, scope: "S3", notes: "Set if you track embodied" },
  { category: "purchased_goods", item: "Small_spares_misc", unit: "unit", ef_kgco2e_per_unit: 0, scope: "S3", notes: "Set if you track embodied" },
];

// -----------------------------
// Default params & job mix
// -----------------------------
const defaultParams = {
  year: "2024",
  total_jobs_per_year: 1380,
  fuel_economy_L_per_100km: 10,
  office_m2: 50,
  elec_intensity_kwh_per_m2: 50,
  heat_intensity_kwh_per_m2: 90,
  refrigerant_charge_kg: 2,
  leak_rate_frac: 0.05,
  employees_fte: 4,
  commute_km_per_day_roundtrip: 30,
  workdays_per_year: 230,
};

const defaultJobTypes = [
  { job_type: "quick_lighting_fix", share: 0.7, legs_per_job: 2, avg_one_way_km: 10, detour_factor: 1.15, revisit_rate: 0.1, notes: "Small fix, nearby" },
  { job_type: "panel_fault_diagnosis", share: 0.3, legs_per_job: 2, avg_one_way_km: 22, detour_factor: 1.25, revisit_rate: 0.2, notes: "Longer visit" },
];

const defaultMaterials = [
  { job_type: "quick_lighting_fix", item: "LED_lamp_A19", unit: "unit", qty_per_job: 0.5 },
  { job_type: "quick_lighting_fix", item: "Small_spares_misc", unit: "unit", qty_per_job: 1 },
  { job_type: "panel_fault_diagnosis", item: "Ballast_or_driver", unit: "unit", qty_per_job: 0.3 },
];

// -----------------------------
// Core calculation logic
// -----------------------------
function expandJobMix(params: any, jobTypes: any[]) {
  const totalJobs = Math.round(num(params.total_jobs_per_year, 0));
  const sumShare = jobTypes.reduce((a, b) => a + num(b.share, 0), 0) || 1;
  const rows = jobTypes.map((jt) => {
    const jobs = Math.round((num(jt.share, 0) / sumShare) * totalJobs);
    const avgLegKm = num(jt.avg_one_way_km, 0) * num(jt.detour_factor, 1);
    const legsTotal = num(jt.legs_per_job, 0) * jobs * (1 + num(jt.revisit_rate, 0));
    const kmTotal = legsTotal * avgLegKm;
    return { ...jt, jobs, avg_leg_km: avgLegKm, legs_total: legsTotal, km_total: kmTotal };
  });
  const totalKm = rows.reduce((a, b) => a + b.km_total, 0);
  const litres = totalKm * (num(params.fuel_economy_L_per_100km, 10) / 100);
  return { rows, totalJobs, totalKm, litres };
}

function buildActivities(params: any, jobExp: any, materials: any[]) {
  const elec_kwh = num(params.office_m2) * num(params.elec_intensity_kwh_per_m2);
  const heat_kwh = num(params.office_m2) * num(params.heat_intensity_kwh_per_m2);
  const leak_kg = num(params.refrigerant_charge_kg) * num(params.leak_rate_frac);
  const commute_km = num(params.employees_fte) * num(params.commute_km_per_day_roundtrip) * num(params.workdays_per_year);

  const rows: any[] = [
    { activity_id: "A1", category: "fuel", item: "diesel_combustion", quantity: round1(jobExp.litres), unit: "litre", entity: "Fleet", period: params.year, notes: "From job legs × fuel economy" },
    { activity_id: "A2", category: "electricity", item: "grid_location_based", quantity: Math.round(elec_kwh), unit: "kWh", entity: "Office", period: params.year, notes: "office_m2 × elec_intensity" },
    { activity_id: "A3", category: "energy", item: "natural_gas_combustion", quantity: Math.round(heat_kwh), unit: "kWh", entity: "Office", period: params.year, notes: "office_m2 × heat_intensity" },
    { activity_id: "A4", category: "f_gases", item: "R410A_GWP100", quantity: round2(leak_kg), unit: "kg_leaked", entity: "Office HVAC", period: params.year, notes: "charge × leak_rate" },
    { activity_id: "A5", category: "transport", item: "employee_commute_avg", quantity: Math.round(commute_km), unit: "km", entity: "Employees", period: params.year, notes: "FTE × commute_km × days" },
  ];

  // Optional purchased goods
  let idx = 100;
  for (const m of materials) {
    const jt = jobExp.rows.find((r: any) => r.job_type === m.job_type);
    if (!jt) continue;
    const total_qty = num(m.qty_per_job) * jt.jobs;
    rows.push({ activity_id: `PG${idx++}`, category: "purchased_goods", item: m.item, quantity: round2(total_qty), unit: m.unit || "unit", entity: "Jobs materials", period: params.year, notes: `job_type=${m.job_type}` });
  }

  return rows;
}

function round1(n: number) { return Math.round(num(n) * 10) / 10; }
function round2(n: number) { return Math.round(num(n) * 100) / 100; }

function mergeWithFactors(activities: any[], factors: any[]) {
  const key = (r: any) => `${r.category}__${r.item}__${r.unit}`;
  const fMap = new Map(factors.map((f) => [key(f), f]));
  return activities.map((a) => {
    const f = fMap.get(key(a)) || {};
    const ef = num(f.ef_kgco2e_per_unit, NaN);
    const emissions_kg = isFinite(ef) ? num(a.quantity) * ef : NaN;
    const scope = f.scope || "";
    return { ...a, ef_kgco2e_per_unit: ef, scope, emissions_kgco2e: emissions_kg, emissions_tco2e: isFinite(emissions_kg) ? emissions_kg / 1000 : NaN };
  });
}

function summarize(merged: any[]) {
  const total_t = merged.reduce((a, r) => a + (isFinite(r.emissions_tco2e) ? r.emissions_tco2e : 0), 0);
  const byScope: Record<string, number> = {};
  for (const r of merged) {
    const s = r.scope || "";
    byScope[s] = (byScope[s] || 0) + (isFinite(r.emissions_tco2e) ? r.emissions_tco2e : 0);
  }
  const scopeRows = Object.entries(byScope).map(([scope, emissions_tco2e]) => ({ scope, emissions_tco2e }));
  return { total_t, scopeRows };
}

// -----------------------------
// UI Components
// -----------------------------
function NumberField({ label, value, onChange, step = 1, hint }: any) {
  return (
    <div className="space-y-1">
      <div className="text-sm text-gray-600">{label}</div>
      <Input type="number" step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      {hint && <div className="text-xs text-gray-400">{hint}</div>}
    </div>
  );
}

function EditableTable({ rows, setRows, columns, addRow }: any) {
  return (
    <div className="overflow-x-auto border rounded-xl">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-gray-50">
            {columns.map((c: any) => (
              <th key={c.key} className="text-left p-2 font-medium">{c.label}</th>
            ))}
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any, i: number) => (
            <tr key={i} className="border-t">
              {columns.map((c: any) => (
                <td key={c.key} className="p-2">
                  <Input value={r[c.key] ?? ""} onChange={(e) => {
                    const v = e.target.value;
                    const next = [...rows];
                    next[i] = { ...r, [c.key]: c.type === "number" ? parseFloat(v) : v };
                    setRows(next);
                  }} />
                </td>
              ))}
              <td className="p-2 text-right">
                <Button variant="ghost" onClick={() => setRows(rows.filter((_: any, j: number) => j !== i))}><Trash2 className="w-4 h-4"/></Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-2">
        <Button onClick={() => setRows([...rows, addRow()])}><Plus className="w-4 h-4 mr-1"/>Add row</Button>
      </div>
    </div>
  );
}

export default function SMECarbonEstimator() {
  const [params, setParams] = useState<any>(defaultParams);
  const [jobTypes, setJobTypes] = useState<any[]>(defaultJobTypes);
  const [materials, setMaterials] = useState<any[]>(defaultMaterials);
  const [factors, setFactors] = useState<any[]>(defaultFactors);

  const jobExp = useMemo(() => expandJobMix(params, jobTypes), [params, jobTypes]);
  const activities = useMemo(() => buildActivities(params, jobExp, materials), [params, jobExp, materials]);
  const merged = useMemo(() => mergeWithFactors(activities, factors), [activities, factors]);
  const summary = useMemo(() => summarize(merged), [merged]);
  const tPerJob = jobExp.totalJobs ? summary.total_t / jobExp.totalJobs : 0;

  const lineHeaders = ["activity_id","category","item","quantity","unit","entity","period","notes","ef_kgco2e_per_unit","scope","emissions_tco2e"]; 

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <div className="text-2xl font-semibold">SME Carbon Estimator</div>
      <div className="text-gray-600">Interactive baseline builder for small contractors. Tune job mix, operations, and factors; get totals, scope split, and per‑job intensity.</div>

      <Tabs defaultValue="inputs">
        <TabsList>
          <TabsTrigger value="inputs">Inputs</TabsTrigger>
          <TabsTrigger value="factors">Emission factors</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
        </TabsList>

        {/* Inputs */}
        <TabsContent value="inputs" className="space-y-6">
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <NumberField label="Year" value={params.year} onChange={(v: any)=>setParams({...params, year: String(v)})} />
                <NumberField label="Total jobs / year" value={params.total_jobs_per_year} onChange={(v: number)=>setParams({...params, total_jobs_per_year: v})} />
                <NumberField label="Fuel economy (L/100km)" value={params.fuel_economy_L_per_100km} onChange={(v: number)=>setParams({...params, fuel_economy_L_per_100km: v})} />
                <NumberField label="Employees (FTE)" value={params.employees_fte} onChange={(v: number)=>setParams({...params, employees_fte: v})} />
                <NumberField label="Commute km/day (roundtrip)" value={params.commute_km_per_day_roundtrip} onChange={(v: number)=>setParams({...params, commute_km_per_day_roundtrip: v})} />
                <NumberField label="Workdays / year" value={params.workdays_per_year} onChange={(v: number)=>setParams({...params, workdays_per_year: v})} />
                <NumberField label="Office area (m²)" value={params.office_m2} onChange={(v: number)=>setParams({...params, office_m2: v})} />
                <NumberField label="Elec intensity (kWh/m²·yr)" value={params.elec_intensity_kwh_per_m2} onChange={(v: number)=>setParams({...params, elec_intensity_kwh_per_m2: v})} />
                <NumberField label="Heat intensity (kWh/m²·yr)" value={params.heat_intensity_kwh_per_m2} onChange={(v: number)=>setParams({...params, heat_intensity_kwh_per_m2: v})} />
                <NumberField label="HVAC charge (kg)" value={params.refrigerant_charge_kg} onChange={(v: number)=>setParams({...params, refrigerant_charge_kg: v})} />
                <NumberField label="Leak rate (%)" value={params.leak_rate_frac*100} onChange={(v: number)=>setParams({...params, leak_rate_frac: v/100})} />
              </div>

              <div className="mt-6 text-sm font-semibold">Job types & routing</div>
              <EditableTable
                rows={jobTypes}
                setRows={setJobTypes}
                addRow={() => ({ job_type: "new_job", share: 0.1, legs_per_job: 2, avg_one_way_km: 10, detour_factor: 1.1, revisit_rate: 0, notes: "" })}
                columns={[
                  { key: "job_type", label: "Job type" },
                  { key: "share", label: "Share", type: "number" },
                  { key: "legs_per_job", label: "Legs/job", type: "number" },
                  { key: "avg_one_way_km", label: "Avg one‑way km", type: "number" },
                  { key: "detour_factor", label: "Detour ×", type: "number" },
                  { key: "revisit_rate", label: "Revisit rate", type: "number" },
                  { key: "notes", label: "Notes" },
                ]}
              />

              <div className="mt-6 text-sm font-semibold">Materials per job (optional)</div>
              <EditableTable
                rows={materials}
                setRows={setMaterials}
                addRow={() => ({ job_type: jobTypes[0]?.job_type || "job", item: "New_item", unit: "unit", qty_per_job: 1 })}
                columns={[
                  { key: "job_type", label: "Job type" },
                  { key: "item", label: "Item" },
                  { key: "unit", label: "Unit" },
                  { key: "qty_per_job", label: "Qty/job", type: "number" },
                ]}
              />

              <div className="mt-4 flex gap-2">
                <Button onClick={() => download("job_type_expansion.csv", toCSV(jobExp.rows))}><Download className="w-4 h-4 mr-1"/>Export job expansion</Button>
                <Button variant="secondary" onClick={() => download("activity_data.csv", toCSV(activities))}><Download className="w-4 h-4 mr-1"/>Export activity data</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Factors */}
        <TabsContent value="factors" className="space-y-4">
          <Card className="shadow-sm">
            <CardContent className="p-4 space-y-2">
              <div className="text-sm text-gray-600">Set country‑specific grid, add product factors for purchased goods, etc.</div>
              <EditableTable
                rows={factors}
                setRows={setFactors}
                addRow={() => ({ category: "", item: "", unit: "", ef_kgco2e_per_unit: 0, scope: "S3", notes: "" })}
                columns={[
                  { key: "category", label: "Category" },
                  { key: "item", label: "Item" },
                  { key: "unit", label: "Unit" },
                  { key: "ef_kgco2e_per_unit", label: "EF (kgCO₂e/unit)", type: "number" },
                  { key: "scope", label: "Scope" },
                  { key: "notes", label: "Notes" },
                ]}
              />
              <div className="flex gap-2">
                <Button onClick={() => download("emission_factors.csv", toCSV(factors))}><Download className="w-4 h-4 mr-1"/>Export factors</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Results */}
        <TabsContent value="results" className="space-y-6">
          <div className="grid md:grid-cols-3 gap-4">
            <Card className="shadow-sm"><CardContent className="p-4"><div className="text-xs text-gray-500">Total emissions</div><div className="text-2xl font-semibold">{summary.total_t.toFixed(3)} tCO₂e</div></CardContent></Card>
            <Card className="shadow-sm"><CardContent className="p-4"><div className="text-xs text-gray-500">Jobs / year</div><div className="text-2xl font-semibold">{jobExp.totalJobs}</div></CardContent></Card>
            <Card className="shadow-sm"><CardContent className="p-4"><div className="text-xs text-gray-500">tCO₂e per job</div><div className="text-2xl font-semibold">{(tPerJob || 0).toFixed(4)}</div></CardContent></Card>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="font-medium mb-2">Scope split</div>
                <div className="space-y-1 text-sm">
                  {summary.scopeRows.sort((a,b)=> (a.scope>b.scope?1:-1)).map((r) => (
                    <div key={r.scope} className="flex justify-between"><span>{r.scope || "(no scope)"}</span><span>{r.emissions_tco2e.toFixed(3)} t</span></div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="font-medium mb-2">Operational per‑job metrics</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span>Avg km per job</span><span>{(jobExp.totalKm / (jobExp.totalJobs || 1)).toFixed(2)} km</span></div>
                  <div className="flex justify-between"><span>Avg litres per job</span><span>{(jobExp.litres / (jobExp.totalJobs || 1)).toFixed(3)} L</span></div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">Line items</div>
                <Button variant="secondary" onClick={() => download("merged_line_items.csv", toCSV(merged, lineHeaders))}><Download className="w-4 h-4 mr-1"/>Export CSV</Button>
              </div>
              <div className="overflow-x-auto border rounded-xl">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      {lineHeaders.map((h)=> <th key={h} className="text-left p-2 font-medium">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {merged.map((r, i) => (
                      <tr key={i} className="border-t">
                        {lineHeaders.map((h) => <td key={h} className="p-2">{typeof r[h] === "number" ? (isFinite(r[h]) ? (h.includes("emissions")? r[h].toFixed(3) : r[h]) : "") : r[h]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="text-xs text-gray-400">Note: default factors are placeholders. Replace with your sourced country/company factors for production use.</div>
    </div>
  );
}

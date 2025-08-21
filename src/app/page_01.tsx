"use client";
import React, { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Info, Gauge, Calculator, Wand2, Factory, Building2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from "recharts";

// ---------- Data (seeded from your v2 build) ----------
const GRID_FACTORS = {
  "European Union (27)": { ef: 0.242, note: "EU‑27 avg (2023)." },
  Spain: { ef: 0.08013047067429982, note: "Spain grid avg (2024 approx.)." },
  "United Kingdom": { ef: 0.20705, note: "UK gen-only Scope 2 (2024 factor)." },
  Australia: {
    ef: 0.63,
    note: "Australia national avg (NGA 2024).",
    states: {
      ACT: 0.66,
      NSW: 0.66,
      NT: 0.56,
      QLD: 0.71,
      SA: 0.23,
      TAS: 0.15,
      VIC: 0.77,
      WA: 0.51,
    },
  },
  Global: { ef: 0.45, note: "Global backstop (engineering)." },
} as const;

const KWH_PER_EMP = {
  "European Union (27)": 4700, // ODYSSEE approx.; replace with exact table when available
  Spain: 4700, // proxy until national exacts are pulled
  "United Kingdom": 4700, // proxy until ECUK exacts are pulled
  Australia: 5000, // interim assumption
  Global: 5000,
} as const;

const KWH_PER_EUR = {
  "European Union (27)": 0.18, // JRC official (EU-27, 2022)
  Spain: null,
  "United Kingdom": null,
  Australia: null,
  Global: null,
} as const;

const AREA_BENCHMARKS: Record<string, number> = {
  office: 95,
  retail: 130,
  hospitality: 170,
  education: 80,
};

const methodOrder = ["provided", "per_eurva", "per_employee", "area"] as const;

function formatNumber(n?: number, digits = 0) {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export default function Scope2Visualizer() {
  const [country, setCountry] = useState<keyof typeof GRID_FACTORS>("European Union (27)");
  const [stateAU, setStateAU] = useState<string>("");

  const [employees, setEmployees] = useState<number>(10);
  const [revenue, setRevenue] = useState<number>(500_000);
  const [floorspace, setFloorspace] = useState<number>(200);
  const [buildingType, setBuildingType] = useState<keyof typeof AREA_BENCHMARKS>("office");

  const [useOverrides, setUseOverrides] = useState<boolean>(false);
  const [kwhPerEmp, setKwhPerEmp] = useState<number>(KWH_PER_EMP["European Union (27)"]);
  const [kwhPerEur, setKwhPerEur] = useState<number>(KWH_PER_EUR["European Union (27)"] ?? 0.18);
  const [kwhPerM2, setKwhPerM2] = useState<number>(AREA_BENCHMARKS["office"]);
  const [directKwh, setDirectKwh] = useState<number | null>(null);

  const [autoMode, setAutoMode] = useState<boolean>(true);
  const [lockedMethod, setLockedMethod] = useState<"provided" | "per_eurva" | "per_employee" | "area">("provided");

  // Update defaults when country/buildingType changes
  React.useEffect(() => {
    setKwhPerEmp(KWH_PER_EMP[country] ?? 5000);
    setKwhPerEur(KWH_PER_EUR[country] ?? (country === "European Union (27)" ? 0.18 : 0));
  }, [country]);
  React.useEffect(() => {
    setKwhPerM2(AREA_BENCHMARKS[buildingType]);
  }, [buildingType]);

  const gridEF = useMemo(() => {
    if (country === "Australia" && stateAU && GRID_FACTORS.Australia.states[stateAU as keyof typeof GRID_FACTORS.Australia.states]) {
      return { ef: GRID_FACTORS.Australia.states[stateAU as keyof typeof GRID_FACTORS.Australia.states], source: `Australia • ${stateAU}` };
    }
    const cf = GRID_FACTORS[country];
    return { ef: cf.ef, source: country };
  }, [country, stateAU]);

  const estimates = useMemo(() => {
    const out: Record<string, { kwh?: number; label: string }> = {};
    if (directKwh && directKwh > 0) out.provided = { kwh: directKwh, label: "Provided kWh" };

    const kpe = useOverrides ? kwhPerEmp : (KWH_PER_EMP[country] ?? 5000);
    const keu = useOverrides ? kwhPerEur : (KWH_PER_EUR[country] ?? (country === "European Union (27)" ? 0.18 : null));
    const km2 = useOverrides ? kwhPerM2 : AREA_BENCHMARKS[buildingType];

    if (employees && kpe) out.per_employee = { kwh: employees * kpe, label: `Employees × ${Math.round(kpe).toLocaleString()} kWh` };
    if (revenue && keu) out.per_eurva = { kwh: revenue * keu, label: `€VA × ${keu.toFixed(3)} kWh/€` };
    if (floorspace && km2) out.area = { kwh: floorspace * km2, label: `${floorspace} m² × ${km2} kWh/m²` };

    // Choose auto method (priority: per_eurVA > per_employee > area > provided only if set explicitly)
    const ordered = methodOrder.filter((m) => out[m]);
    let autoChosen: (typeof ordered)[number] | undefined = undefined;
    if (out.per_eurva) autoChosen = "per_eurva";
    else if (out.per_employee) autoChosen = "per_employee";
    else if (out.area) autoChosen = "area";
    else if (out.provided) autoChosen = "provided";

    return { out, autoChosen } as const;
  }, [country, buildingType, employees, revenue, floorspace, directKwh, useOverrides, kwhPerEmp, kwhPerEur, kwhPerM2]);

  const chosenMethod = autoMode ? estimates.autoChosen : (estimates.out[lockedMethod] ? lockedMethod : estimates.autoChosen);
  const chosenKwh = chosenMethod ? estimates.out[chosenMethod]?.kwh : undefined;
  const emissions = chosenKwh && gridEF.ef ? chosenKwh * gridEF.ef : undefined;

  // Confidence & sanity flags
  const confidence = useMemo(() => {
    let base = 0.6;
    const flags: string[] = [];
    if (chosenMethod === "provided") base = 0.98;
    if (chosenMethod === "per_eurva") base = 0.85;
    if (chosenMethod === "per_employee") base = 0.8;
    if (chosenMethod === "area") base = 0.55;
    const kpe = useOverrides ? kwhPerEmp : (KWH_PER_EMP[country] ?? 5000);
    if (chosenMethod === "per_employee" && kpe) {
      if (kpe < 500) { flags.push("LOW_KWH/EMP < 500"); base *= 0.7; }
      if (kpe > 15000) { flags.push("HIGH_KWH/EMP > 15000"); base *= 0.7; }
    }
    if (country === "Australia" && !stateAU) {
      flags.push("AUS: add state for better accuracy"); base *= 0.85;
    }
    if (!chosenKwh) flags.push("No kWh estimate available");
    return { score: Math.max(0.1, Math.min(1, Number(base.toFixed(2)))), flags };
  }, [chosenMethod, country, stateAU, chosenKwh, useOverrides, kwhPerEmp]);

  const bars = useMemo(() => {
    const rows = Object.entries(estimates.out).map(([k, v]) => ({ method: k, label: v.label, kg: v.kwh && gridEF.ef ? v.kwh * gridEF.ef : 0 }));
    return rows;
  }, [estimates, gridEF]);

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">ScopeZero — Scope 2 Services Visualizer</h1>
        <div className="text-sm text-muted-foreground flex items-center gap-2"><Info className="w-4 h-4"/>Interactive estimator for small contractors (services).</div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* LEFT: Context & Inputs */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2"><Calculator className="w-5 h-5"/> Inputs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Country</Label>
                <Select value={country} onValueChange={(v) => setCountry(v as any)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(GRID_FACTORS).map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              {country === "Australia" && (
                <div>
                  <Label>AU State/Territory</Label>
                  <Select value={stateAU} onValueChange={setStateAU}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Optional"/></SelectTrigger>
                    <SelectContent>
                      {Object.keys(GRID_FACTORS.Australia.states).map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Building type</Label>
                <Select value={buildingType} onValueChange={(v) => setBuildingType(v as any)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(AREA_BENCHMARKS).map((b) => (<SelectItem key={b} value={b}>{b}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Tabs defaultValue="per-employee">
              <TabsList>
                <TabsTrigger value="per-employee">Per employee</TabsTrigger>
                <TabsTrigger value="per-eur">Per €VA</TabsTrigger>
                <TabsTrigger value="area">Area fallback</TabsTrigger>
                <TabsTrigger value="provided">Provided kWh</TabsTrigger>
              </TabsList>

              <TabsContent value="per-employee" className="pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Employees: {employees}</Label>
                    <Slider value={[employees]} onValueChange={([v]) => setEmployees(clamp(v,0,1000))} max={1000} step={1}/>
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <Label>kWh per employee</Label>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Switch checked={useOverrides} onCheckedChange={setUseOverrides}/>
                        <span>Override defaults</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Input type="number" value={kwhPerEmp} onChange={(e) => setKwhPerEmp(Number(e.target.value||0))}/>
                      <Button variant="outline" size="sm" onClick={() => setKwhPerEmp(KWH_PER_EMP[country] ?? 5000)}>Reset</Button>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Default: {formatNumber(KWH_PER_EMP[country])} kWh/employee</div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="per-eur" className="pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Value added (€)</Label>
                    <Input type="number" value={revenue} onChange={(e) => setRevenue(Number(e.target.value||0))}/>
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <Label>kWh per €</Label>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Switch checked={useOverrides} onCheckedChange={setUseOverrides}/>
                        <span>Override defaults</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Input type="number" step="0.001" value={kwhPerEur} onChange={(e) => setKwhPerEur(Number(e.target.value||0))}/>
                      <Button variant="outline" size="sm" onClick={() => setKwhPerEur(KWH_PER_EUR[country] ?? (country === "European Union (27)" ? 0.18 : 0))}>Reset</Button>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Default: {KWH_PER_EUR[country] ?? (country === "European Union (27)" ? 0.18 : 0)} kWh/€</div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="area" className="pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Floorspace (m²)</Label>
                    <Input type="number" value={floorspace} onChange={(e) => setFloorspace(Number(e.target.value||0))}/>
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <Label>kWh per m²</Label>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Switch checked={useOverrides} onCheckedChange={setUseOverrides}/>
                        <span>Override defaults</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Input type="number" value={kwhPerM2} onChange={(e) => setKwhPerM2(Number(e.target.value||0))}/>
                      <Button variant="outline" size="sm" onClick={() => setKwhPerM2(AREA_BENCHMARKS[buildingType])}>Reset</Button>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Default: {AREA_BENCHMARKS[buildingType]} kWh/m²</div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="provided" className="pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Annual electricity (kWh)</Label>
                    <Input type="number" value={directKwh ?? ""} onChange={(e) => setDirectKwh(e.target.value === "" ? null : Number(e.target.value))}/>
                  </div>
                  <div className="flex items-end">
                    <div className="text-xs text-muted-foreground">If you provide kWh, it will be used when you choose the <em>Provided</em> method or when other data are missing.</div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex items-center gap-3 pt-2">
              <Switch checked={autoMode} onCheckedChange={setAutoMode}/>
              <span className="text-sm">Auto-pick best method</span>
              {!autoMode && (
                <div className="flex items-center gap-2">
                  <Select value={lockedMethod} onValueChange={(v) => setLockedMethod(v as any)}>
                    <SelectTrigger className="w-44"><SelectValue placeholder="Choose method"/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="provided">Provided</SelectItem>
                      <SelectItem value="per_eurva">Per €VA</SelectItem>
                      <SelectItem value="per_employee">Per employee</SelectItem>
                      <SelectItem value="area">Area fallback</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* RIGHT: Results */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2"><Gauge className="w-5 h-5"/> Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">Grid factor: <span className="font-medium">{gridEF.ef.toFixed(3)} kgCO₂e/kWh</span> <span className="ml-1 text-xs">({gridEF.source})</span></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-2xl bg-muted">
                <div className="text-xs text-muted-foreground">kWh estimate</div>
                <div className="text-2xl font-semibold">{formatNumber(chosenKwh, 0)} kWh</div>
                <div className="text-xs text-muted-foreground">Method: {chosenMethod ?? "—"}</div>
              </div>
              <div className="p-3 rounded-2xl bg-muted">
                <div className="text-xs text-muted-foreground">Scope 2 emissions</div>
                <div className="text-2xl font-semibold">{formatNumber(emissions, 0)} kgCO₂e</div>
                <div className="text-xs text-muted-foreground">= kWh × grid EF</div>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-2xl border">
              <div>
                <div className="text-xs text-muted-foreground">Confidence</div>
                <div className="text-lg font-medium">{Math.round(confidence.score * 100)}%</div>
              </div>
              <div className="text-right text-xs text-muted-foreground max-w-[60%]">
                {confidence.flags.length ? confidence.flags.join(" • ") : "No warnings"}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">Notes: EU‑27 kWh/€ = 0.18 (official); per‑employee defaults shown; area fallback uses typical electricity intensity (kWh/m²) by building type. AU suppliers: select a state for more accurate grid factors.</div>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2"><Factory className="w-5 h-5"/> Scenario comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bars} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="method" tickFormatter={(t) => t.replace("per_", "")} />
                <YAxis tickFormatter={(v) => `${Math.round(v/1000)}k`} />
                <Tooltip
                  formatter={(value: number | string) => [
                    `${formatNumber(Number(value), 0)} kgCO₂e`,
                    "Emissions",
                  ]}
                  labelFormatter={(label: string) => label}
                />
                <Bar dataKey="kg" name="Emissions (kgCO₂e)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-xs text-muted-foreground mt-2">Bars show emissions if each method were used with the same inputs and the selected grid factor.</div>
        </CardContent>
      </Card>

      {/* Footer & Reset */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground flex items-center gap-2"><Wand2 className="w-4 h-4"/>Tip: Toggle “Override defaults” to tune intensities and test sensitivity.</div>
        <Button variant="secondary" onClick={() => {
          setCountry("European Union (27)");
          setStateAU("");
          setEmployees(10);
          setRevenue(500000);
          setFloorspace(200);
          setBuildingType("office");
          setUseOverrides(false);
          setKwhPerEmp(KWH_PER_EMP["European Union (27)"]);
          setKwhPerEur(KWH_PER_EUR["European Union (27)"] ?? 0.18);
          setKwhPerM2(AREA_BENCHMARKS["office"]);
          setDirectKwh(null);
          setAutoMode(true);
          setLockedMethod("provided");
        }}>Reset</Button>
      </div>
    </div>
  );
}

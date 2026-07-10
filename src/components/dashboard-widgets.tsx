import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Line,
  LineChart,
} from "recharts";
import { format, subMonths, startOfMonth, endOfMonth, subDays, startOfWeek, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

const GEM = "#8AB334";
const COLORS = ["#8AB334", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#14B8A6", "#EC4899"];

function fmtMoney(n: number | null | undefined) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", maximumFractionDigits: 0 }).format(n ?? 0);
}

/* ------------------------ OCCUPATION GAUGE ------------------------ */
export function OccupationGauge({ scope }: { scope?: { gestionnaire_id?: string } }) {
  const [pct, setPct] = useState(0);
  const [loues, setLoues] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    (async () => {
      let bienIds: string[] | null = null;
      if (scope?.gestionnaire_id) {
        const { data } = await supabase.from("biens").select("id").eq("gestionnaire_id", scope.gestionnaire_id);
        bienIds = (data ?? []).map((b: { id: string }) => b.id);
        if (bienIds.length === 0) { setPct(0); return; }
      }
      const totalQ = bienIds
        ? supabase.from("lots").select("id", { count: "exact", head: true }).in("bien_id", bienIds)
        : supabase.from("lots").select("id", { count: "exact", head: true });
      const louesQ = bienIds
        ? supabase.from("lots").select("id", { count: "exact", head: true }).in("bien_id", bienIds).eq("statut", "loue")
        : supabase.from("lots").select("id", { count: "exact", head: true }).eq("statut", "loue");
      const [{ count: t }, { count: l }] = await Promise.all([totalQ, louesQ]);
      setTotal(t ?? 0);
      setLoues(l ?? 0);
      setPct(t ? Math.round(((l ?? 0) / t) * 100) : 0);
    })();
  }, [scope?.gestionnaire_id]);

  const color = pct < 60 ? "#EF4444" : pct < 85 ? "#F59E0B" : GEM;
  const data = [
    { name: "occ", value: pct, fill: color },
    { name: "rest", value: 100 - pct, fill: "#E5E7EB" },
  ];

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Taux d'occupation</CardTitle></CardHeader>
      <CardContent>
        <div className="relative h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} innerRadius={55} outerRadius={80} startAngle={90} endAngle={-270} dataKey="value" stroke="none">
                {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-3xl font-bold" style={{ color }}>{pct}%</div>
            <div className="text-xs text-muted-foreground">{loues} / {total} lots</div>
          </div>
        </div>
        <div className="flex justify-center gap-3 text-[11px] text-muted-foreground mt-2">
          <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />&lt;60%</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1" />60-85%</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-primary mr-1" />&gt;85%</span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------ PIPELINE FUNNEL ------------------------ */
export function PipelineFunnel({ scope }: { scope?: { contact_creator?: string } }) {
  const [rows, setRows] = useState<{ label: string; value: number }[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("transactions_commerciales").select("statut_opportunite");
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r: { statut_opportunite: string | null }) => {
        const k = (r.statut_opportunite ?? "prospect").toLowerCase();
        counts[k] = (counts[k] ?? 0) + 1;
      });
      const order = [
        { key: "prospect", label: "Prospects" },
        { key: "visite", label: "Visites" },
        { key: "mandat", label: "Mandats" },
        { key: "gagne", label: "Gagné" },
      ];
      setRows(order.map((o) => ({ label: o.label, value: counts[o.key] ?? 0 })));
    })();
    void scope;
  }, [scope?.contact_creator]);

  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Pipeline commercial</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {rows.map((r, i) => {
          const prev = i > 0 ? rows[i - 1].value : r.value;
          const conv = prev > 0 ? Math.round((r.value / prev) * 100) : 100;
          return (
            <div key={r.label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium">{r.label}</span>
                <span className="text-muted-foreground">{r.value} {i > 0 && `(${conv}%)`}</span>
              </div>
              <div className="h-6 bg-muted rounded overflow-hidden">
                <div className="h-full" style={{ width: `${(r.value / max) * 100}%`, background: COLORS[i] }} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/* ------------------------ ENCAISSEMENTS 6 MOIS ------------------------ */
export function EncaissementsChart() {
  const [data, setData] = useState<{ mois: string; montant: number }[]>([]);
  useEffect(() => {
    (async () => {
      const start = startOfMonth(subMonths(new Date(), 5));
      const { data: rows } = await supabase
        .from("impayes")
        .select("montant_paye, date_derniere_relance, date_echeance")
        .gte("date_echeance", start.toISOString().slice(0, 10));
      const map = new Map<string, number>();
      for (let i = 5; i >= 0; i--) {
        const d = subMonths(new Date(), i);
        map.set(format(d, "yyyy-MM"), 0);
      }
      (rows ?? []).forEach((r: { montant_paye: number | null; date_derniere_relance: string | null; date_echeance: string | null }) => {
        const dateRef = r.date_derniere_relance ?? r.date_echeance;
        if (!dateRef) return;
        const key = dateRef.slice(0, 7);
        if (map.has(key)) map.set(key, (map.get(key) ?? 0) + Number(r.montant_paye ?? 0));
      });
      setData(Array.from(map.entries()).map(([k, v]) => ({ mois: format(new Date(k + "-01"), "MMM", { locale: fr }), montant: v })));
    })();
  }, []);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Encaissements (6 mois)</CardTitle></CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="mois" fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => fmtMoney(v)} />
              <Bar dataKey="montant" fill={GEM} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------ TRAVAUX DONUT ------------------------ */
export function TravauxDonut() {
  const [data, setData] = useState<{ name: string; value: number; color: string }[]>([]);
  useEffect(() => {
    (async () => {
      const { data: rows } = await supabase.from("travaux").select("statut");
      const map: Record<string, number> = {};
      (rows ?? []).forEach((r: { statut: string | null }) => { const k = r.statut ?? "inconnu"; map[k] = (map[k] ?? 0) + 1; });
      const labels: Record<string, string> = { planifie: "Planifié", en_cours: "En cours", termine: "Terminé" };
      setData(Object.entries(map).map(([k, v], i) => ({ name: labels[k] ?? k, value: v, color: COLORS[i % COLORS.length] })));
    })();
  }, []);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Travaux par statut</CardTitle></CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} label>
                {data.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------ RECLAMATIONS PAR PRIORITE ------------------------ */
export function ReclamationsBars() {
  const [data, setData] = useState<{ priorite: string; count: number }[]>([]);
  useEffect(() => {
    (async () => {
      const { data: rows } = await supabase.from("reclamations").select("priorite").in("statut", ["ouverte", "en_cours"]);
      const map: Record<string, number> = { haute: 0, normale: 0, basse: 0 };
      (rows ?? []).forEach((r: { priorite: string | null }) => { const k = (r.priorite ?? "normale").toLowerCase(); if (k in map) map[k]++; else map[k] = 1; });
      setData([
        { priorite: "Haute", count: map.haute ?? 0 },
        { priorite: "Normale", count: map.normale ?? 0 },
        { priorite: "Basse", count: map.basse ?? 0 },
      ]);
    })();
  }, []);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Réclamations par priorité</CardTitle></CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer>
            <BarChart data={data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" fontSize={11} />
              <YAxis type="category" dataKey="priorite" fontSize={11} width={60} />
              <Tooltip />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {data.map((_, i) => <Cell key={i} fill={["#EF4444", "#F59E0B", "#8AB334"][i] ?? GEM} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------ LOTS PAR STATUT DONUT + TABLE ------------------------ */
export function LotsParStatut() {
  const [data, setData] = useState<{ name: string; value: number; color: string }[]>([]);
  useEffect(() => {
    (async () => {
      const { data: rows } = await supabase.from("lots").select("statut");
      const map: Record<string, number> = {};
      (rows ?? []).forEach((r: { statut: string | null }) => { const k = r.statut ?? "inconnu"; map[k] = (map[k] ?? 0) + 1; });
      setData(Object.entries(map).map(([k, v], i) => ({ name: k, value: v, color: COLORS[i % COLORS.length] })));
    })();
  }, []);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Lots par statut</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 items-center">
          <div className="h-[160px]">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius={35} outerRadius={65}>
                  {data.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="text-xs space-y-1">
            {data.map((d) => (
              <div key={d.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: d.color }} /><span className="capitalize">{d.name}</span></div>
                <span className="font-medium">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------ NOUVEAUX CONTRATS 12 MOIS ------------------------ */
export function NouveauxContrats12Mois() {
  const [data, setData] = useState<{ mois: string; count: number }[]>([]);
  useEffect(() => {
    (async () => {
      const start = startOfMonth(subMonths(new Date(), 11));
      const { data: rows } = await supabase.from("contrats").select("created_at").gte("created_at", start.toISOString());
      const map = new Map<string, number>();
      for (let i = 11; i >= 0; i--) {
        const d = subMonths(new Date(), i);
        map.set(format(d, "yyyy-MM"), 0);
      }
      (rows ?? []).forEach((r: { created_at: string }) => {
        const k = r.created_at.slice(0, 7);
        if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
      });
      setData(Array.from(map.entries()).map(([k, v]) => ({ mois: format(new Date(k + "-01"), "MMM", { locale: fr }), count: v })));
    })();
  }, []);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Nouveaux contrats (12 mois)</CardTitle></CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="mois" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke={GEM} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------ OCCUPATION PAR IMMEUBLE ------------------------ */
export function OccupationParImmeuble({ scope }: { scope?: { gestionnaire_id?: string } }) {
  const [data, setData] = useState<{ titre: string; taux: number; loues: number; total: number }[]>([]);
  useEffect(() => {
    (async () => {
      let biensQ = supabase.from("biens").select("id, titre");
      if (scope?.gestionnaire_id) biensQ = biensQ.eq("gestionnaire_id", scope.gestionnaire_id);
      const { data: biens } = await biensQ;
      const ids = (biens ?? []).map((b: { id: string }) => b.id);
      if (ids.length === 0) { setData([]); return; }
      const { data: lots } = await supabase.from("lots").select("bien_id, statut").in("bien_id", ids);
      const per = new Map<string, { l: number; t: number }>();
      (lots ?? []).forEach((l: { bien_id: string | null; statut: string | null }) => {
        if (!l.bien_id) return;
        const cur = per.get(l.bien_id) ?? { l: 0, t: 0 };
        cur.t++;
        if (l.statut === "loue") cur.l++;
        per.set(l.bien_id, cur);
      });
      const rows = (biens ?? []).map((b: { id: string; titre: string | null }) => {
        const p = per.get(b.id) ?? { l: 0, t: 0 };
        return { titre: (b.titre ?? "—").slice(0, 24), taux: p.t ? Math.round((p.l / p.t) * 100) : 0, loues: p.l, total: p.t };
      }).filter((r) => r.total > 0).sort((a, b) => b.taux - a.taux).slice(0, 8);
      setData(rows);
    })();
  }, [scope?.gestionnaire_id]);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Occupation par immeuble</CardTitle></CardHeader>
      <CardContent>
        <div style={{ height: Math.max(150, data.length * 30) }}>
          <ResponsiveContainer>
            <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis type="number" domain={[0, 100]} fontSize={11} />
              <YAxis type="category" dataKey="titre" fontSize={11} width={140} />
              <Tooltip formatter={(v: number, _n, p) => [`${v}% (${p.payload.loues}/${p.payload.total})`, "Occupation"]} />
              <Bar dataKey="taux" radius={[0, 4, 4, 0]}>
                {data.map((d, i) => <Cell key={i} fill={d.taux < 60 ? "#EF4444" : d.taux < 85 ? "#F59E0B" : GEM} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------ LISTE ECHEANCES (contrats 60j) ------------------------ */
export function ListeEcheances({ scope, limit = 5 }: { scope?: { gestionnaire_id?: string }; limit?: number }) {
  const [rows, setRows] = useState<Array<{ id: string; date_fin: string; loyer_mensuel: number | null; locataire?: string; bien?: string }>>([]);
  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const in60 = new Date(); in60.setDate(in60.getDate() + 60);
      let q = supabase
        .from("contrats")
        .select("id, date_fin, loyer_mensuel, locataire:contacts!contrats_locataire_id_fkey(nom, prenom), lots(label, biens(titre, gestionnaire_id))")
        .eq("statut", "actif")
        .gte("date_fin", today)
        .lte("date_fin", in60.toISOString().slice(0, 10))
        .order("date_fin", { ascending: true })
        .limit(limit);
      const { data } = await q;
      let items = (data ?? []).map((r: any) => ({
        id: r.id,
        date_fin: r.date_fin,
        loyer_mensuel: r.loyer_mensuel,
        locataire: r.locataire ? `${r.locataire.prenom ?? ""} ${r.locataire.nom ?? ""}`.trim() : "—",
        bien: r.lots?.biens?.titre ?? "—",
        gestionnaire: r.lots?.biens?.gestionnaire_id,
      }));
      if (scope?.gestionnaire_id) items = items.filter((r: any) => r.gestionnaire === scope.gestionnaire_id);
      setRows(items);
    })();
  }, [scope?.gestionnaire_id, limit]);
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Prochaines échéances</CardTitle>
        <Button asChild variant="ghost" size="sm"><Link to="/contrats">Tous</Link></Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground py-3 text-center">Aucune échéance à venir.</p> : (
          <div className="space-y-2">
            {rows.map((r) => (
              <Link key={r.id} to="/contrats/$contratId" params={{ contratId: r.id }} className="flex items-center justify-between rounded border p-2 hover:bg-muted/40 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.locataire}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.bien}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs">{format(new Date(r.date_fin), "d MMM yyyy", { locale: fr })}</div>
                  <div className="text-xs text-muted-foreground">{fmtMoney(r.loyer_mensuel ?? 0)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------ LISTE À RELANCER (impayés) ------------------------ */
export function ListeARelancer({ limit = 8 }: { limit?: number }) {
  const [rows, setRows] = useState<Array<{ id: string; contrat_id: string; locataire: string; montant: number; date_echeance: string }>>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("impayes")
        .select("id, contrat_id, montant_du, montant_paye, date_echeance, contrats(locataire:contacts!contrats_locataire_id_fkey(nom, prenom))")
        .eq("statut", "en_retard")
        .order("date_echeance", { ascending: true })
        .limit(limit);
      setRows((data ?? []).map((r: any) => ({
        id: r.id,
        contrat_id: r.contrat_id,
        locataire: r.contrats?.locataire ? `${r.contrats.locataire.prenom ?? ""} ${r.contrats.locataire.nom ?? ""}`.trim() : "—",
        montant: Number(r.montant_du ?? 0) - Number(r.montant_paye ?? 0),
        date_echeance: r.date_echeance,
      })));
    })();
  }, [limit]);
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Locataires à relancer</CardTitle>
        <Button asChild variant="ghost" size="sm"><Link to="/impayes">Tous</Link></Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground py-3 text-center">Aucun impayé en retard.</p> : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded border p-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.locataire}</div>
                  <div className="text-xs text-muted-foreground">Échéance {format(new Date(r.date_echeance), "d MMM yyyy", { locale: fr })}</div>
                </div>
                <div className="text-right text-destructive font-semibold">{fmtMoney(r.montant)}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------ LISTE À TRAITER (réclamations + travaux urgents) ------------------------ */
export function ListeATraiter({ limit = 8 }: { limit?: number }) {
  const [items, setItems] = useState<Array<{ id: string; kind: string; titre: string; badge: string; to: string }>>([]);
  useEffect(() => {
    (async () => {
      const [{ data: recs }, { data: trs }] = await Promise.all([
        supabase.from("reclamations").select("id, titre, priorite, statut, bien_id").eq("priorite", "haute").in("statut", ["ouverte", "en_cours"]).limit(limit),
        supabase.from("travaux").select("id, titre, statut").eq("statut", "en_cours").limit(limit),
      ]);
      const merged = [
        ...(recs ?? []).map((r: any) => ({ id: r.id, kind: "Réclamation", titre: r.titre ?? "—", badge: "Haute", to: "/reclamations" })),
        ...(trs ?? []).map((t: any) => ({ id: t.id, kind: "Travaux", titre: t.titre ?? "—", badge: "En cours", to: "/travaux" })),
      ].slice(0, limit);
      setItems(merged);
    })();
  }, [limit]);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">À traiter en priorité</CardTitle></CardHeader>
      <CardContent>
        {items.length === 0 ? <p className="text-sm text-muted-foreground py-3 text-center">Rien d'urgent.</p> : (
          <div className="space-y-2">
            {items.map((r) => (
              <Link key={`${r.kind}-${r.id}`} to={r.to} className="flex items-center justify-between rounded border p-2 text-sm hover:bg-muted/40">
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.titre}</div>
                  <div className="text-xs text-muted-foreground">{r.kind}</div>
                </div>
                <Badge variant={r.badge === "Haute" ? "destructive" : "secondary"}>{r.badge}</Badge>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------ SUIVI EQUIPE ------------------------ */
export function SuiviEquipe() {
  const [rows, setRows] = useState<Array<{ id: string; email: string; role: string; aFaire: number; enRetard: number; derniere: string }>>([]);
  useEffect(() => {
    (async () => {
      const { data: profiles } = await supabase.from("profiles").select("id, email, role");
      const { data: acts } = await supabase.from("activites").select("assigne_a, statut, date_debut, updated_at");
      const now = new Date();
      const in7 = subDays(now, 7);
      const map = new Map<string, { aFaire: number; enRetard: number; derniere: string }>();
      (acts ?? []).forEach((a: { assigne_a: string; statut: string; date_debut: string | null; updated_at: string }) => {
        const cur = map.get(a.assigne_a) ?? { aFaire: 0, enRetard: 0, derniere: "" };
        if (a.statut !== "fait" && a.statut !== "realisee" && a.statut !== "annulee") {
          cur.aFaire++;
          if (a.date_debut && new Date(a.date_debut) < now) cur.enRetard++;
        }
        if (new Date(a.updated_at) > in7 && (!cur.derniere || a.updated_at > cur.derniere)) cur.derniere = a.updated_at;
        map.set(a.assigne_a, cur);
      });
      setRows((profiles ?? []).map((p: { id: string; email: string | null; role: string }) => {
        const m = map.get(p.id) ?? { aFaire: 0, enRetard: 0, derniere: "" };
        return { id: p.id, email: p.email ?? "—", role: p.role, aFaire: m.aFaire, enRetard: m.enRetard, derniere: m.derniere };
      }));
    })();
  }, []);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Suivi d'équipe</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Utilisateur</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead className="text-right">À faire</TableHead>
                <TableHead className="text-right">En retard</TableHead>
                <TableHead className="text-right">Activité récente</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{r.email}</TableCell>
                  <TableCell className="text-xs capitalize">{r.role.replace("_", " ")}</TableCell>
                  <TableCell className="text-right">{r.aFaire}</TableCell>
                  <TableCell className={`text-right font-semibold ${r.enRetard > 0 ? "text-destructive" : ""}`}>{r.enRetard}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{r.derniere ? format(new Date(r.derniere), "d MMM", { locale: fr }) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------ ACTIVITE ENTREPRISE 30 JOURS ------------------------ */
export function ActiviteEntreprise30j() {
  const [data, setData] = useState<{ semaine: string; count: number }[]>([]);
  useEffect(() => {
    (async () => {
      const start = subDays(new Date(), 30);
      const { data: rows } = await supabase.from("activites").select("created_at").gte("created_at", start.toISOString());
      const buckets = new Map<string, number>();
      for (let i = 4; i >= 0; i--) {
        const d = startOfWeek(subDays(new Date(), i * 7), { weekStartsOn: 1 });
        buckets.set(format(d, "yyyy-MM-dd"), 0);
      }
      (rows ?? []).forEach((r: { created_at: string }) => {
        const w = startOfWeek(new Date(r.created_at), { weekStartsOn: 1 });
        const k = format(w, "yyyy-MM-dd");
        if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
      });
      setData(Array.from(buckets.entries()).map(([k, v]) => ({ semaine: format(new Date(k), "d MMM", { locale: fr }), count: v })));
    })();
  }, []);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Activité entreprise (30 jours)</CardTitle></CardHeader>
      <CardContent>
        <div className="h-[180px]">
          <ResponsiveContainer>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="semaine" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill={GEM} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------ TACHES ENTREPRISE DONUT ------------------------ */
export function TachesEntrepriseDonut() {
  const [data, setData] = useState<{ name: string; value: number; color: string }[]>([]);
  useEffect(() => {
    (async () => {
      const { data: rows } = await supabase.from("activites").select("statut");
      const labels: Record<string, string> = { a_faire: "À faire", en_cours: "En cours", fait: "Fait", planifiee: "Planifiée", realisee: "Réalisée", annulee: "Annulée" };
      const map: Record<string, number> = {};
      (rows ?? []).forEach((r: { statut: string }) => { map[r.statut] = (map[r.statut] ?? 0) + 1; });
      setData(Object.entries(map).map(([k, v], i) => ({ name: labels[k] ?? k, value: v, color: COLORS[i % COLORS.length] })));
    })();
  }, []);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Tâches entreprise</CardTitle></CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} label>
                {data.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------ CONTRATS PAR STATUT BARS ------------------------ */
export function ContratsParStatut() {
  const [data, setData] = useState<{ statut: string; count: number }[]>([]);
  useEffect(() => {
    (async () => {
      const { data: rows } = await supabase.from("contrats").select("statut");
      const map: Record<string, number> = {};
      (rows ?? []).forEach((r: { statut: string }) => { map[r.statut] = (map[r.statut] ?? 0) + 1; });
      setData(Object.entries(map).map(([k, v]) => ({ statut: k, count: v })));
    })();
  }, []);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Contrats par statut</CardTitle></CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="statut" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill={GEM} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------ MODIFICATIONS EN ATTENTE (juridique) ------------------------ */
export function ModificationsEnAttente() {
  const [rows, setRows] = useState<Array<{ id: string; contrat_id: string; created_at: string; champ_modifie: string; ancienne_valeur: string | null; nouvelle_valeur: string | null }>>([]);

  const load = async () => {
    const { data } = await supabase
      .from("contrat_modifications_proposees")
      .select("id, contrat_id, created_at, champ_modifie, ancienne_valeur, nouvelle_valeur")
      .eq("statut", "en_attente")
      .order("created_at", { ascending: false })
      .limit(10);
    setRows((data ?? []) as Array<{ id: string; contrat_id: string; created_at: string; champ_modifie: string; ancienne_valeur: string | null; nouvelle_valeur: string | null }>);
  };
  useEffect(() => { load(); }, []);

  const act = async (id: string, statut: "approuve" | "rejete") => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("contrat_modifications_proposees")
      .update({ statut, traite_par: u.user?.id ?? null, traite_le: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(statut === "approuve" ? "Modification approuvée" : "Modification rejetée");
    load();
  };

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Modifications de contrat en attente</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground py-3 text-center">Aucune modification en attente.</p> : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="rounded border p-3 text-sm space-y-2">
                <div className="flex items-center justify-between">
                  <Link to="/contrats/$contratId" params={{ contratId: r.contrat_id }} className="font-medium text-primary hover:underline">
                    Contrat #{r.contrat_id.slice(0, 8)}
                  </Link>
                  <span className="text-xs text-muted-foreground">{format(new Date(r.created_at), "d MMM yyyy", { locale: fr })}</span>
                </div>
                <div className="text-xs">
                  <span className="text-muted-foreground">Champ : </span><span className="font-medium">{r.champ_modifie}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-muted-foreground mb-1">Actuel</div>
                    <div className="bg-muted/50 p-2 rounded text-[11px] break-all">{r.ancienne_valeur ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">Proposé</div>
                    <div className="bg-primary/5 p-2 rounded text-[11px] break-all">{r.nouvelle_valeur ?? "—"}</div>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" onClick={() => act(r.id, "rejete")}>Rejeter</Button>
                  <Button size="sm" onClick={() => act(r.id, "approuve")}>Approuver</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------ MES ACTIVITES 7J ------------------------ */
export function MesActivites7j({ userId }: { userId: string | null }) {
  const [rows, setRows] = useState<Array<{ id: string; titre: string; date_debut: string | null }>>([]);
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const now = new Date();
      const in7 = addDays(now, 7);
      const { data } = await supabase
        .from("activites")
        .select("id, titre, date_debut")
        .eq("assigne_a", userId)
        .gte("date_debut", now.toISOString())
        .lte("date_debut", in7.toISOString())
        .order("date_debut");
      setRows((data ?? []) as any);
    })();
  }, [userId]);
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Mes activités à venir (7 jours)</CardTitle>
        <Button asChild variant="ghost" size="sm"><Link to="/calendrier">Calendrier</Link></Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground py-3 text-center">Aucune activité prévue.</p> : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded border p-2 text-sm">
                <span className="truncate">{r.titre}</span>
                {r.date_debut && <span className="text-xs text-muted-foreground">{format(new Date(r.date_debut), "d MMM HH:mm", { locale: fr })}</span>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Fil d'actualité léger — activité récente de l'équipe
// ============================================================
type FeedItem = {
  key: string;
  ts: string;
  auteur: string | null;
  message: React.ReactNode;
};

async function resolveScopeIds(userId: string) {
  const { data: biens } = await supabase.from("biens").select("id").eq("gestionnaire_id", userId);
  const bienIds = (biens ?? []).map((b: { id: string }) => b.id);
  if (bienIds.length === 0) return { bienIds: [], lotIds: [] as string[], contratIds: [] as string[] };
  const { data: lots } = await supabase.from("lots").select("id").in("bien_id", bienIds);
  const lotIds = (lots ?? []).map((l: { id: string }) => l.id);
  let contratIds: string[] = [];
  if (lotIds.length) {
    const { data: cts } = await supabase.from("contrats").select("id").in("lot_id", lotIds);
    contratIds = (cts ?? []).map((c: { id: string }) => c.id);
  }
  return { bienIds, lotIds, contratIds };
}

export function FilActualiteEquipe({ userId, role }: { userId: string | null; role: string }) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!userId) return;
      setLoading(true);
      const scoped = role === "gestion_locative" || role === "commercial";
      const scope = scoped ? await resolveScopeIds(userId) : null;

      // Profiles map
      const { data: profs } = await supabase.from("profiles").select("id, email");
      const nameOf = (id: string | null) => {
        if (!id) return null;
        const p = (profs ?? []).find((x: { id: string; email: string | null }) => x.id === id);
        return p?.email ?? id.slice(0, 8);
      };

      const feed: FeedItem[] = [];

      // 1) Activités terminées
      const { data: actsDone } = await supabase
        .from("activites")
        .select("id, titre, updated_at, assigne_a, created_by, bien_id, lot_id, contrat_id, contact_id, statut")
        .in("statut", ["fait", "realisee"])
        .order("updated_at", { ascending: false })
        .limit(30);
      for (const a of (actsDone ?? []) as Array<{
        id: string; titre: string; updated_at: string; assigne_a: string; created_by: string | null;
        bien_id: string | null; lot_id: string | null; contrat_id: string | null; contact_id: string | null;
      }>) {
        if (scope && !(scope.bienIds.includes(a.bien_id ?? "") || scope.lotIds.includes(a.lot_id ?? "") || scope.contratIds.includes(a.contrat_id ?? "") || a.assigne_a === userId || a.created_by === userId)) continue;
        feed.push({
          key: `act-${a.id}`,
          ts: a.updated_at,
          auteur: nameOf(a.assigne_a),
          message: <><span className="font-medium">{nameOf(a.assigne_a)}</span> a marqué <span className="font-medium">« {a.titre} »</span> comme terminé.</>,
        });
      }

      // 2) Nouveaux contrats
      const { data: newContrats } = await supabase
        .from("contrats")
        .select("id, created_at, lot_id")
        .order("created_at", { ascending: false })
        .limit(20);
      for (const c of (newContrats ?? []) as Array<{ id: string; created_at: string; lot_id: string | null }>) {
        if (scope && !scope.lotIds.includes(c.lot_id ?? "")) continue;
        feed.push({
          key: `ctr-new-${c.id}`,
          ts: c.created_at,
          auteur: null,
          message: <>Nouveau <Link to="/contrats/$contratId" params={{ contratId: c.id }} className="font-medium text-primary hover:underline">contrat</Link> créé.</>,
        });
      }

      // 3) Contrats clôturés
      const { data: closedContrats } = await supabase
        .from("contrats")
        .select("id, updated_at, statut, lot_id")
        .in("statut", ["clos", "cloture", "termine", "resilie"])
        .order("updated_at", { ascending: false })
        .limit(20);
      for (const c of (closedContrats ?? []) as Array<{ id: string; updated_at: string; lot_id: string | null }>) {
        if (scope && !scope.lotIds.includes(c.lot_id ?? "")) continue;
        feed.push({
          key: `ctr-clos-${c.id}`,
          ts: c.updated_at,
          auteur: null,
          message: <><Link to="/contrats/$contratId" params={{ contratId: c.id }} className="font-medium text-primary hover:underline">Contrat</Link> clôturé.</>,
        });
      }

      // 4) Commentaires ajoutés
      const { data: coms } = await supabase
        .from("activite_commentaires")
        .select("id, created_at, auteur, activite_id")
        .order("created_at", { ascending: false })
        .limit(20);
      const comActIds = Array.from(new Set(((coms ?? []) as Array<{ activite_id: string }>).map((c) => c.activite_id)));
      const actMap = new Map<string, { titre: string; bien_id: string | null; lot_id: string | null; contrat_id: string | null; assigne_a: string; created_by: string | null }>();
      if (comActIds.length) {
        const { data: acts } = await supabase.from("activites").select("id, titre, bien_id, lot_id, contrat_id, assigne_a, created_by").in("id", comActIds);
        for (const a of (acts ?? []) as Array<{ id: string; titre: string; bien_id: string | null; lot_id: string | null; contrat_id: string | null; assigne_a: string; created_by: string | null }>) {
          actMap.set(a.id, a);
        }
      }
      for (const c of (coms ?? []) as Array<{ id: string; created_at: string; auteur: string; activite_id: string }>) {
        const a = actMap.get(c.activite_id);
        if (!a) continue;
        if (scope && !(scope.bienIds.includes(a.bien_id ?? "") || scope.lotIds.includes(a.lot_id ?? "") || scope.contratIds.includes(a.contrat_id ?? "") || a.assigne_a === userId || a.created_by === userId)) continue;
        feed.push({
          key: `com-${c.id}`,
          ts: c.created_at,
          auteur: nameOf(c.auteur),
          message: <><span className="font-medium">{nameOf(c.auteur)}</span> a commenté <span className="font-medium">« {a.titre} »</span>.</>,
        });
      }

      // 5) Nouveaux états des lieux
      const { data: edls } = await supabase
        .from("etats_des_lieux")
        .select("id, created_at, contrat_id, type")
        .order("created_at", { ascending: false })
        .limit(20);
      for (const e of (edls ?? []) as Array<{ id: string; created_at: string; contrat_id: string | null; type: string | null }>) {
        if (scope && !scope.contratIds.includes(e.contrat_id ?? "")) continue;
        feed.push({
          key: `edl-${e.id}`,
          ts: e.created_at,
          auteur: null,
          message: e.contrat_id ? (
            <>Nouvel état des lieux {e.type ? `(${e.type}) ` : ""}sur le <Link to="/contrats/$contratId" params={{ contratId: e.contrat_id }} className="font-medium text-primary hover:underline">contrat</Link>.</>
          ) : <>Nouvel état des lieux enregistré.</>,
        });
      }

      feed.sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""));
      setItems(feed.slice(0, 15));
      setLoading(false);
    })();
  }, [userId, role]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Activité récente de l'équipe</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground py-3 text-center">Chargement…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3 text-center">Aucune activité récente.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((it) => (
              <li key={it.key} className="flex items-start justify-between gap-3 rounded border p-2 text-sm">
                <div className="min-w-0 flex-1">{it.message}</div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(it.ts), { locale: fr, addSuffix: true })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

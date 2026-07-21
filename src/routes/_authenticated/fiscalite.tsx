import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Landmark } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/fiscalite")({
  head: () => ({
    meta: [
      { title: "Fiscalité — GEM Immobilier" },
      { name: "description", content: "Suivi des impôts fonciers et honoraires fiscaux." },
      { property: "og:title", content: "Fiscalité — GEM Immobilier" },
      { property: "og:description", content: "Suivi des impôts fonciers et honoraires fiscaux." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FiscalitePage,
});

const ALLOWED_ROLES = ["admin", "direction", "juridique"];

const TRIMESTRES = ["T1", "T2", "T3", "T4", "annuel"] as const;
const TRIMESTRE_LABEL: Record<string, string> = { T1: "T1", T2: "T2", T3: "T3", T4: "T4", annuel: "Annuel" };
const DEFAULT_ECHEANCE: Record<string, string> = { T1: "03-15", T2: "06-15", T3: "09-15", T4: "12-15" };

const IF_STATUTS: { value: string; label: string; badge: string }[] = [
  { value: "a_retirer", label: "À retirer", badge: "bg-slate-500" },
  { value: "a_payer", label: "À payer", badge: "bg-amber-500" },
  { value: "paye", label: "Payé", badge: "bg-emerald-600" },
  { value: "recu_recupere", label: "Reçu récupéré", badge: "bg-emerald-700" },
];
const IF_STATUT_LABEL: Record<string, { label: string; badge: string }> = Object.fromEntries(
  IF_STATUTS.map((s) => [s.value, { label: s.label, badge: s.badge }]),
);

const HONO_TYPES = [
  { value: "suivi_fiscal", label: "Suivi fiscal" },
  { value: "declaration_fonciere", label: "Déclaration foncière" },
] as const;
const HONO_STATUTS = [
  { value: "a_facturer", label: "À facturer", badge: "bg-amber-500" },
  { value: "facture", label: "Facturé", badge: "bg-blue-500" },
  { value: "paye", label: "Payé", badge: "bg-emerald-600" },
];
const HONO_STATUT_LABEL: Record<string, { label: string; badge: string }> = Object.fromEntries(
  HONO_STATUTS.map((s) => [s.value, { label: s.label, badge: s.badge }]),
);

type Bailleur = { id: string; nom: string; prenom: string | null };
type Bien = { id: string; titre: string };
type Impot = {
  id: string; bailleur_id: string; bien_id: string; annee_fiscale: number; trimestre: string;
  date_echeance: string | null; montant: number | null; montant_annuel_total: number | null;
  statut: string; date_paiement: string | null;
  date_recuperation_recu: string | null; reference_cheque: string | null;
};
type Honoraire = {
  id: string; bailleur_id: string; type_honoraire: string; montant: number; periode: string | null;
  periode_fin: string | null; statut: string; created_at: string;
};
type HistoEntry = {
  id: string; honoraire_id: string; champ_modifie: string; ancienne_valeur: string | null;
  nouvelle_valeur: string | null; auteur: string | null; created_at: string;
};

function bailleurLabel(b: Bailleur | undefined) {
  if (!b) return "—";
  return `${b.prenom ?? ""} ${b.nom}`.trim() || "—";
}

function FiscalitePage() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [bailleurs, setBailleurs] = useState<Bailleur[]>([]);
  const [biens, setBiens] = useState<Bien[]>([]);
  const [impots, setImpots] = useState<Impot[]>([]);
  const [honoraires, setHonoraires] = useState<Honoraire[]>([]);

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const u = userRes.user;
      if (!u) { navigate({ to: "/auth", replace: true }); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", u.id).maybeSingle();
      const role = profile?.role ?? "";
      if (!ALLOWED_ROLES.includes(role)) {
        toast.error("Accès réservé aux profils juridique, admin et direction.");
        navigate({ to: "/dashboard", replace: true });
        return;
      }
      setAllowed(true);
      setChecked(true);
      await loadAll();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    const [{ data: cs }, { data: bs }, { data: ifs }, { data: hs }] = await Promise.all([
      supabase.from("contacts").select("id, nom, prenom, type_contact").eq("type_contact", "bailleur").order("nom"),
      supabase.from("biens").select("id, titre").order("titre"),
      supabase.from("impots_fonciers").select("*").order("annee_fiscale", { ascending: false }).order("trimestre"),
      supabase.from("honoraires_fiscaux").select("*").order("created_at", { ascending: false }),
    ]);
    setBailleurs((cs as Bailleur[]) ?? []);
    setBiens((bs as Bien[]) ?? []);
    setImpots((ifs as Impot[]) ?? []);
    setHonoraires((hs as Honoraire[]) ?? []);
  }

  if (!checked) return <div className="p-6 text-sm text-muted-foreground">Chargement…</div>;
  if (!allowed) return null;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Landmark className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold">Fiscalité</h1>
      </div>
      <p className="text-sm text-muted-foreground">Suivi des impôts fonciers et des honoraires fiscaux (juridique).</p>

      <Tabs defaultValue="planning">
        <TabsList>
          <TabsTrigger value="planning">Planning IF</TabsTrigger>
          <TabsTrigger value="honoraires">Honoraires</TabsTrigger>
        </TabsList>

        <TabsContent value="planning" className="mt-4">
          <PlanningIF impots={impots} bailleurs={bailleurs} biens={biens} onChange={loadAll} />
        </TabsContent>
        <TabsContent value="honoraires" className="mt-4">
          <HonorairesTab honoraires={honoraires} bailleurs={bailleurs} onChange={loadAll} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* -------- Planning IF -------- */

function PlanningIF({
  impots, bailleurs, biens, onChange,
}: { impots: Impot[]; bailleurs: Bailleur[]; biens: Bien[]; onChange: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Impot | null>(null);

  const groups = useMemo(() => {
    const byQuarter = new Map<string, Impot[]>();
    for (const i of impots) {
      const key = `${i.annee_fiscale} ${i.trimestre}`;
      const arr = byQuarter.get(key) ?? [];
      arr.push(i);
      byQuarter.set(key, arr);
    }
    return Array.from(byQuarter.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [impots]);

  const bailleurMap = new Map(bailleurs.map((b) => [b.id, b]));
  const bienMap = new Map(biens.map((b) => [b.id, b]));

  function statutBadge(i: Impot) {
    const s = IF_STATUT_LABEL[i.statut];
    const isLate = i.statut !== "paye" && i.statut !== "recu_recupere" && new Date(i.date_echeance) < new Date();
    if (isLate) return <Badge className="bg-red-600 hover:bg-red-600 text-white">En retard</Badge>;
    return <Badge className={`${s?.badge ?? "bg-slate-500"} hover:opacity-90 text-white`}>{s?.label ?? i.statut}</Badge>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Regroupés par trimestre puis par bailleur.</p>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nouvel impôt foncier
        </Button>
      </div>

      {groups.length === 0 && (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Aucun impôt foncier enregistré.</CardContent></Card>
      )}

      {groups.map(([key, list]) => (
        <Card key={key}>
          <CardHeader>
            <CardTitle className="text-base">{key}</CardTitle>
            <CardDescription>{list.length} enregistrement(s)</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bailleur</TableHead>
                  <TableHead>Bien</TableHead>
                  <TableHead>Échéance</TableHead>
                  <TableHead>Montant</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{bailleurLabel(bailleurMap.get(i.bailleur_id))}</TableCell>
                    <TableCell>{bienMap.get(i.bien_id)?.titre ?? "—"}</TableCell>
                    <TableCell>{new Date(i.date_echeance).toLocaleDateString("fr-FR")}</TableCell>
                    <TableCell>{i.montant ? `${Number(i.montant).toLocaleString("fr-FR")} FCFA` : "—"}</TableCell>
                    <TableCell>{statutBadge(i)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(i); setOpen(true); }}>Ouvrir</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      <ImpotDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        bailleurs={bailleurs}
        biens={biens}
        onSaved={async () => { setOpen(false); setEditing(null); await onChange(); }}
      />
    </div>
  );
}

function ImpotDialog({
  open, onOpenChange, editing, bailleurs, biens, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; editing: Impot | null;
  bailleurs: Bailleur[]; biens: Bien[]; onSaved: () => Promise<void>;
}) {
  const currentYear = new Date().getFullYear();
  const [form, setForm] = useState<Partial<Impot>>({});
  useEffect(() => {
    if (editing) setForm(editing);
    else setForm({ annee_fiscale: currentYear, trimestre: "T1", statut: "a_retirer", date_echeance: `${currentYear}-03-15` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, open]);

  function updateTrimestre(t: string) {
    const yr = form.annee_fiscale ?? currentYear;
    setForm({ ...form, trimestre: t, date_echeance: `${yr}-${DEFAULT_ECHEANCE[t]}` });
  }

  async function save() {
    if (!form.bailleur_id || !form.bien_id || !form.trimestre || !form.annee_fiscale || !form.date_echeance) {
      toast.error("Champs obligatoires manquants."); return;
    }
    const { data: userRes } = await supabase.auth.getUser();
    const payload = {
      bailleur_id: form.bailleur_id,
      bien_id: form.bien_id,
      annee_fiscale: Number(form.annee_fiscale),
      trimestre: form.trimestre,
      date_echeance: form.date_echeance,
      montant: form.montant != null && form.montant !== ("" as unknown) ? Number(form.montant) : null,
      statut: form.statut ?? "a_retirer",
      date_paiement: form.date_paiement || null,
      date_recuperation_recu: form.date_recuperation_recu || null,
      reference_cheque: form.reference_cheque || null,
    };
    let err;
    if (editing) {
      ({ error: err } = await supabase.from("impots_fonciers").update(payload).eq("id", editing.id));
    } else {
      ({ error: err } = await supabase.from("impots_fonciers").insert({ ...payload, created_by: userRes.user?.id }));
    }
    if (err) { toast.error(err.message); return; }
    toast.success(editing ? "Impôt mis à jour" : "Impôt créé");
    await onSaved();
  }

  const bailleurOptions = bailleurs.map((b) => ({ value: b.id, label: bailleurLabel(b) }));
  const bienOptions = biens.map((b) => ({ value: b.id, label: b.titre }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifier l'impôt foncier" : "Nouvel impôt foncier"}</DialogTitle>
          <DialogDescription>Suivi trimestriel par bailleur et par bien.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Bailleur *</Label>
            <SearchableSelect value={form.bailleur_id ?? ""} onChange={(v) => setForm({ ...form, bailleur_id: v })} options={bailleurOptions} placeholder="Choisir un bailleur" />
          </div>
          <div>
            <Label>Bien *</Label>
            <SearchableSelect value={form.bien_id ?? ""} onChange={(v) => setForm({ ...form, bien_id: v })} options={bienOptions} placeholder="Choisir un bien" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Année fiscale *</Label>
              <Input type="number" value={form.annee_fiscale ?? ""} onChange={(e) => setForm({ ...form, annee_fiscale: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Trimestre *</Label>
              <Select value={form.trimestre ?? ""} onValueChange={updateTrimestre}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{TRIMESTRES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date d'échéance *</Label>
              <Input type="date" value={form.date_echeance ?? ""} onChange={(e) => setForm({ ...form, date_echeance: e.target.value })} />
            </div>
            <div>
              <Label>Montant (FCFA)</Label>
              <Input type="number" value={form.montant ?? ""} onChange={(e) => setForm({ ...form, montant: e.target.value === "" ? null : Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <Label>Statut</Label>
            <Select value={form.statut ?? "a_retirer"} onValueChange={(v) => setForm({ ...form, statut: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{IF_STATUTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date de paiement</Label>
              <Input type="date" value={form.date_paiement ?? ""} onChange={(e) => setForm({ ...form, date_paiement: e.target.value })} />
            </div>
            <div>
              <Label>Date récup. reçu</Label>
              <Input type="date" value={form.date_recuperation_recu ?? ""} onChange={(e) => setForm({ ...form, date_recuperation_recu: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Référence chèque</Label>
            <Input value={form.reference_cheque ?? ""} onChange={(e) => setForm({ ...form, reference_cheque: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={save}>{editing ? "Enregistrer" : "Créer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------- Honoraires -------- */

function HonorairesTab({
  honoraires, bailleurs, onChange,
}: { honoraires: Honoraire[]; bailleurs: Bailleur[]; onChange: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Honoraire | null>(null);
  const bailleurMap = new Map(bailleurs.map((b) => [b.id, b]));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Suivi des honoraires fiscaux par bailleur.</p>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nouvel honoraire
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bailleur</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Période</TableHead>
                <TableHead>Montant</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {honoraires.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Aucun honoraire.</TableCell></TableRow>
              )}
              {honoraires.map((h) => {
                const s = HONO_STATUT_LABEL[h.statut];
                const t = HONO_TYPES.find((x) => x.value === h.type_honoraire)?.label ?? h.type_honoraire;
                return (
                  <TableRow key={h.id}>
                    <TableCell>{bailleurLabel(bailleurMap.get(h.bailleur_id))}</TableCell>
                    <TableCell>{t}</TableCell>
                    <TableCell>{h.periode ?? "—"}</TableCell>
                    <TableCell>{Number(h.montant).toLocaleString("fr-FR")} FCFA</TableCell>
                    <TableCell><Badge className={`${s?.badge ?? "bg-slate-500"} hover:opacity-90 text-white`}>{s?.label ?? h.statut}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(h); setOpen(true); }}>Ouvrir</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <HonoraireDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        bailleurs={bailleurs}
        onSaved={async () => { setOpen(false); setEditing(null); await onChange(); }}
      />
    </div>
  );
}

function HonoraireDialog({
  open, onOpenChange, editing, bailleurs, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; editing: Honoraire | null;
  bailleurs: Bailleur[]; onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<Honoraire>>({});
  const [historique, setHistorique] = useState<HistoEntry[]>([]);

  useEffect(() => {
    if (editing) {
      setForm(editing);
      supabase
        .from("honoraires_historique")
        .select("*")
        .eq("honoraire_id", editing.id)
        .order("created_at", { ascending: true })
        .then(({ data }) => setHistorique((data as HistoEntry[]) ?? []));
    } else {
      setForm({ type_honoraire: "suivi_fiscal", montant: 50000, statut: "a_facturer" });
      setHistorique([]);
    }
  }, [editing, open]);

  async function save() {
    if (!form.bailleur_id || !form.type_honoraire) { toast.error("Champs obligatoires manquants."); return; }
    const { data: userRes } = await supabase.auth.getUser();
    const payload = {
      bailleur_id: form.bailleur_id,
      type_honoraire: form.type_honoraire,
      montant: Number(form.montant ?? 50000),
      periode: form.periode || null,
      periode_fin: form.periode_fin || null,
      statut: form.statut ?? "a_facturer",
    };
    let err;
    if (editing) {
      ({ error: err } = await supabase.from("honoraires_fiscaux").update(payload).eq("id", editing.id));
    } else {
      ({ error: err } = await supabase.from("honoraires_fiscaux").insert({ ...payload, created_by: userRes.user?.id }));
    }
    if (err) { toast.error(err.message); return; }
    toast.success(editing ? "Honoraire mis à jour" : "Honoraire créé");
    await onSaved();
  }

  const bailleurOptions = bailleurs.map((b) => ({ value: b.id, label: bailleurLabel(b) }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Honoraire fiscal" : "Nouvel honoraire"}</DialogTitle>
          <DialogDescription>Honoraires de suivi ou de déclaration fiscale.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Bailleur *</Label>
            <SearchableSelect value={form.bailleur_id ?? ""} onChange={(v) => setForm({ ...form, bailleur_id: v })} options={bailleurOptions} placeholder="Choisir un bailleur" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type *</Label>
              <Select value={form.type_honoraire ?? ""} onValueChange={(v) => setForm({ ...form, type_honoraire: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{HONO_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Montant (FCFA)</Label>
              <Input type="number" value={form.montant ?? 50000} onChange={(e) => setForm({ ...form, montant: Number(e.target.value) })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Période</Label>
              <Input value={form.periode ?? ""} placeholder="Juillet-Août 2026" onChange={(e) => setForm({ ...form, periode: e.target.value })} />
            </div>
            <div>
              <Label>Fin de période</Label>
              <Input type="date" value={form.periode_fin ?? ""} onChange={(e) => setForm({ ...form, periode_fin: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Statut</Label>
            <Select value={form.statut ?? "a_facturer"} onValueChange={(v) => setForm({ ...form, statut: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{HONO_STATUTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {editing && (
            <div className="border-t pt-3">
              <h4 className="text-sm font-semibold mb-2">Historique</h4>
              {historique.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucune modification enregistrée.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {historique.map((h) => (
                    <li key={h.id} className="text-muted-foreground">
                      <span className="font-medium text-foreground">{new Date(h.created_at).toLocaleString("fr-FR")}</span>
                      {" — "}
                      {h.champ_modifie === "creation"
                        ? `Création (statut : ${h.nouvelle_valeur})`
                        : `${h.champ_modifie} : ${h.ancienne_valeur ?? "—"} → ${h.nouvelle_valeur ?? "—"}`}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={save}>{editing ? "Enregistrer" : "Créer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

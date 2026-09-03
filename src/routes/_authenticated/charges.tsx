import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FilterBar } from "@/components/filter-bar";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building2, ArrowLeft, Plus, Pencil, Trash2, Repeat } from "lucide-react";
import { toast } from "sonner";
import { hasModuleAccess } from "@/lib/access-overrides";

export const Route = createFileRoute("/_authenticated/charges")({
  head: () => ({
    meta: [
      { title: "Charges & décomptes propriétaires — Immo360" },
      { name: "description", content: "Suivi des charges par bien et par mois de rattachement, et décomptes propriétaires croisant loyers encaissés, charges et honoraires de gestion." },
      { property: "og:title", content: "Charges & décomptes propriétaires — Immo360" },
      { property: "og:description", content: "Charges mensuelles, récurrences et décomptes propriétaires automatisés." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChargesPage,
});

// Lecture : tous les profils métiers (technique et juridique en consultation seule)
const ALLOWED = ["admin", "direction", "gestion_locative", "commercial", "technico_commercial", "technique", "juridique"] as const;
const WRITE_ROLES = ["admin", "direction", "gestion_locative", "commercial", "technico_commercial", "administration"];

type Charge = {
  id: string; bien_id: string; libelle: string; montant: number; date: string; recurrente: boolean;
  mois_rattachement: string; recurrence_debut: string | null; recurrence_fin: string | null;
  frequence: string; statut_imputation: string; decompte_mois: string | null;
};
type Bien = { id: string; titre: string; adresse?: string | null; bailleur_id?: string | null };
type ContratRow = { id: string; loyer_mensuel: number | null; statut: string; locataire_id: string | null; lot: { bien_id: string } | null };
type ImpayeRow = { id: string; contrat_id: string; montant_du: number; montant_paye: number; date_echeance: string };
type ContactRow = { id: string; nom: string; prenom: string | null };
type TravauxRow = {
  id: string; bien_id: string; titre: string; budget_depense: number | null; statut: string;
  date_intervention_reelle: string | null; date_fin: string | null; date_echeance: string | null; updated_at: string;
};
type HonoraireFiscalRow = { id: string; bailleur_id: string; montant: number; type_honoraire: string; periode: string | null; statut: string };

const monthKey = (d: string | Date) => {
  const dt = typeof d === "string" ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
};
const monthStart = (mk: string) => `${mk}-01`;
const monthLabel = (mk: string) =>
  new Date(`${mk}-01T00:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
const currentMonth = monthKey(new Date());

function ChargesPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [biens, setBiens] = useState<Bien[]>([]);
  const [contrats, setContrats] = useState<ContratRow[]>([]);
  const [impayes, setImpayes] = useState<ImpayeRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [travaux, setTravaux] = useState<TravauxRow[]>([]);
  const [honoFiscaux, setHonoFiscaux] = useState<HonoraireFiscalRow[]>([]);
  const [exporting, setExporting] = useState(false);
  const [filterBien, setFilterBien] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [fRec, setFRec] = useState("all");
  const [fStatut, setFStatut] = useState("all");
  const [fMois, setFMois] = useState("all");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Charge | null>(null);
  const [saving, setSaving] = useState(false);
  const emptyForm = {
    bien_id: "", libelle: "", montant: "", date: new Date().toISOString().slice(0, 10),
    mois_rattachement: currentMonth, recurrente: false, recurrence_debut: "", recurrence_fin: "",
    frequence: "mensuelle", statut_imputation: "a_imputer", decompte_mois: "",
  };
  const [form, setForm] = useState(emptyForm);

  // Décompte
  const [dBien, setDBien] = useState<string>("");
  const [dMois, setDMois] = useState<string>(currentMonth);
  const [tauxHono, setTauxHono] = useState<string>("10");

  const canWrite = useMemo(
    () => hasModuleAccess(role, uid, WRITE_ROLES as unknown as readonly string[]),
    [role, uid],
  );

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const id = userRes.user?.id ?? null;
      setUid(id);
      if (!id) { setChecked(true); return; }
      const { data: p } = await supabase.from("profiles").select("role").eq("id", id).maybeSingle();
      const r = p?.role ?? null;
      setRole(r);
      setChecked(true);
      if (!hasModuleAccess(r, id, ALLOWED)) {
        toast.error("Accès refusé"); navigate({ to: "/dashboard", replace: true });
      }
    })();
  }, [navigate]);

  const load = async () => {
    setLoading(true);
    const [
      { data: cData, error }, { data: bData }, { data: ctData }, { data: imData },
      { data: coData }, { data: trData }, { data: hfData },
    ] = await Promise.all([
      supabase.from("charges").select("*").order("mois_rattachement", { ascending: false }),
      supabase.from("biens").select("id, titre, adresse, bailleur_id").order("titre"),
      supabase.from("contrats").select("id, loyer_mensuel, statut, locataire_id, lot:lots(bien_id)"),
      supabase.from("impayes").select("id, contrat_id, montant_du, montant_paye, date_echeance"),
      supabase.from("contacts").select("id, nom, prenom"),
      supabase.from("travaux").select("id, bien_id, titre, budget_depense, statut, date_intervention_reelle, date_fin, date_echeance, updated_at"),
      supabase.from("honoraires_fiscaux").select("id, bailleur_id, montant, type_honoraire, periode, statut"),
    ]);
    if (error) toast.error(error.message);
    else setCharges((cData ?? []) as unknown as Charge[]);
    setBiens((bData ?? []) as Bien[]);
    setContrats((ctData ?? []) as unknown as ContratRow[]);
    setImpayes((imData ?? []) as ImpayeRow[]);
    setContacts((coData ?? []) as ContactRow[]);
    setTravaux((trData ?? []) as unknown as TravauxRow[]);
    setHonoFiscaux((hfData ?? []) as unknown as HonoraireFiscalRow[]);
    setLoading(false);
  };
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (hasModuleAccess(role, data.user?.id ?? null, ALLOWED)) load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (c: Charge) => {
    setEditing(c);
    setForm({
      bien_id: c.bien_id, libelle: c.libelle, montant: String(c.montant), date: c.date,
      mois_rattachement: monthKey(c.mois_rattachement), recurrente: c.recurrente,
      recurrence_debut: c.recurrence_debut ?? "", recurrence_fin: c.recurrence_fin ?? "",
      frequence: c.frequence ?? "mensuelle", statut_imputation: c.statut_imputation ?? "a_imputer",
      decompte_mois: c.decompte_mois ? monthKey(c.decompte_mois) : "",
    });
    setOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.bien_id || !form.libelle || !form.montant || !form.date || !form.mois_rattachement)
      return toast.error("Champs obligatoires manquants");
    if (form.recurrente && !form.recurrence_debut) return toast.error("Date de début de récurrence requise");
    setSaving(true);
    const payload = {
      bien_id: form.bien_id,
      libelle: form.libelle.trim(),
      montant: Number(form.montant),
      date: form.date,
      mois_rattachement: monthStart(form.mois_rattachement),
      recurrente: form.recurrente,
      recurrence_debut: form.recurrente ? form.recurrence_debut : null,
      recurrence_fin: form.recurrente && form.recurrence_fin ? form.recurrence_fin : null,
      frequence: form.recurrente ? form.frequence : "ponctuelle",
      statut_imputation: form.statut_imputation,
      decompte_mois: form.statut_imputation === "imputee" && form.decompte_mois ? monthStart(form.decompte_mois) : null,
    };
    const { error } = editing
      ? await supabase.from("charges").update(payload).eq("id", editing.id)
      : await supabase.from("charges").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Charge mise à jour" : "Charge ajoutée");
    setOpen(false); setEditing(null); setForm(emptyForm); load();
  };

  const handleDelete = async (c: Charge) => {
    if (!confirm(`Supprimer la charge « ${c.libelle} » ?`)) return;
    const { error } = await supabase.from("charges").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Charge supprimée"); load();
  };

  const toggleImputation = async (c: Charge) => {
    const imputee = c.statut_imputation === "imputee";
    const { error } = await supabase.from("charges").update({
      statut_imputation: imputee ? "a_imputer" : "imputee",
      decompte_mois: imputee ? null : c.mois_rattachement,
    }).eq("id", c.id);
    if (error) return toast.error(error.message);
    load();
  };

  const bienTitre = (id: string) => biens.find((b) => b.id === id)?.titre ?? "—";
  const moisOptions = useMemo(() => {
    const set = new Set<string>([currentMonth]);
    charges.forEach((c) => set.add(monthKey(c.mois_rattachement)));
    return Array.from(set).sort().reverse();
  }, [charges]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return charges.filter((c) => {
      if (filterBien !== "all" && c.bien_id !== filterBien) return false;
      if (fRec === "oui" && !c.recurrente) return false;
      if (fRec === "non" && c.recurrente) return false;
      if (fStatut !== "all" && (c.statut_imputation ?? "a_imputer") !== fStatut) return false;
      if (fMois !== "all" && monthKey(c.mois_rattachement) !== fMois) return false;
      if (q && !`${c.libelle} ${bienTitre(c.bien_id)}`.toLowerCase().includes(q)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charges, filterBien, fRec, fStatut, fMois, search, biens]);

  const fmtMoney = (n: number) => Math.round(Number(n) || 0).toLocaleString("fr-FR") + " FCFA";
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("fr-FR");

  /** Charges d'un bien pour un mois : charges rattachées + occurrences récurrentes manquantes */
  const chargesDuMois = (bienId: string, mk: string) => {
    const directes = charges.filter((c) => c.bien_id === bienId && monthKey(c.mois_rattachement) === mk);
    const debutMois = `${mk}-01`;
    const recurrentes = charges.filter((c) => {
      if (!c.recurrente || c.bien_id !== bienId) return false;
      if (c.frequence !== "mensuelle") return false;
      const deb = c.recurrence_debut ?? c.mois_rattachement;
      if (monthKey(deb) > mk) return false;
      if (c.recurrence_fin && monthKey(c.recurrence_fin) < mk) return false;
      if (monthKey(c.mois_rattachement) === mk) return false; // déjà comptée
      return directes.every((d) => d.libelle.toLowerCase() !== c.libelle.toLowerCase());
    }).map((c) => ({ ...c, id: `${c.id}-${mk}`, mois_rattachement: debutMois, virtuelle: true }));
    return [...directes.map((c) => ({ ...c, virtuelle: false })), ...recurrentes];
  };

  const decompte = useMemo(() => {
    if (!dBien) return null;
    const contratsBien = contrats.filter((c) => c.lot?.bien_id === dBien);
    const actifs = contratsBien.filter((c) => c.statut === "actif");
    const loyersAttendus = actifs.reduce((s, c) => s + (Number(c.loyer_mensuel) || 0), 0);
    const ids = new Set(contratsBien.map((c) => c.id));
    const impayesMois = impayes.filter((i) => ids.has(i.contrat_id) && monthKey(i.date_echeance) === dMois);
    const resteDu = impayesMois.reduce((s, i) => s + Math.max(0, Number(i.montant_du) - Number(i.montant_paye)), 0);
    const loyersEncaisses = Math.max(0, loyersAttendus - resteDu);
    const lignes = chargesDuMois(dBien, dMois);
    const totalCharges = lignes.reduce((s, c) => s + Number(c.montant), 0);
    const honoraires = Math.round((loyersEncaisses * (Number(tauxHono) || 0)) / 100);

    // Dépenses réelles de travaux du mois (montant réellement dépensé)
    const travauxMois = travaux.filter((t) => {
      if (t.bien_id !== dBien) return false;
      if (!(Number(t.budget_depense) > 0)) return false;
      const ref = t.date_intervention_reelle ?? t.date_fin ?? t.date_echeance ?? t.updated_at;
      return !!ref && monthKey(ref) === dMois;
    });
    const totalTravaux = travauxMois.reduce((s, t) => s + Number(t.budget_depense || 0), 0);

    // Honoraires de fiscalité du bailleur du bien sur le mois
    const bailleurId = biens.find((b) => b.id === dBien)?.bailleur_id ?? null;
    const honoFiscauxMois = bailleurId
      ? honoFiscaux.filter((h) => h.bailleur_id === bailleurId && h.periode && monthKey(h.periode) === dMois)
      : [];
    const totalHonoFiscaux = honoFiscauxMois.reduce((s, h) => s + Number(h.montant || 0), 0);

    // Loyers encaissés par locataire (prorata des impayés du contrat)
    const detailLoyers = actifs.map((c) => {
      const du = impayesMois
        .filter((i) => i.contrat_id === c.id)
        .reduce((s, i) => s + Math.max(0, Number(i.montant_du) - Number(i.montant_paye)), 0);
      const contact = contacts.find((ct) => ct.id === c.locataire_id);
      return {
        locataire: contact ? `${contact.nom} ${contact.prenom ?? ""}`.trim() : "Locataire",
        echeance: monthLabel(dMois),
        montant: Math.max(0, (Number(c.loyer_mensuel) || 0) - du),
      };
    }).filter((l) => l.montant > 0);

    return {
      loyersAttendus, resteDu, loyersEncaisses, lignes, totalCharges, honoraires,
      travauxMois, totalTravaux, honoFiscauxMois, totalHonoFiscaux, detailLoyers,
      net: loyersEncaisses - totalCharges - totalTravaux - totalHonoFiscaux - honoraires,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dBien, dMois, tauxHono, charges, contrats, impayes, travaux, honoFiscaux, contacts, biens]);

  const handleExportDocx = async () => {
    if (!decompte || !dBien) return;
    const bien = biens.find((b) => b.id === dBien);
    const bailleur = contacts.find((c) => c.id === bien?.bailleur_id);
    setExporting(true);
    try {
      const { generateDecompteDocx } = await import("@/lib/decompte-docx");
      await generateDecompteDocx({
        bienTitre: bien?.titre ?? "Bien",
        bienAdresse: bien?.adresse ?? null,
        proprietaire: bailleur ? `${bailleur.nom} ${bailleur.prenom ?? ""}`.trim() : "Propriétaire",
        moisLabel: monthLabel(dMois),
        loyers: decompte.detailLoyers,
        totalLoyers: decompte.loyersEncaisses,
        charges: decompte.lignes.map((c) => ({ libelle: c.libelle, detail: c.recurrente ? "Récurrente" : "Ponctuelle", montant: Number(c.montant) })),
        totalCharges: decompte.totalCharges,
        travaux: decompte.travauxMois.map((t) => ({ libelle: t.titre, montant: Number(t.budget_depense || 0) })),
        totalTravaux: decompte.totalTravaux,
        honorairesFiscaux: decompte.honoFiscauxMois.map((h) => ({ libelle: h.type_honoraire, montant: Number(h.montant || 0) })),
        totalHonorairesFiscaux: decompte.totalHonoFiscaux,
        tauxHonoraires: Number(tauxHono) || 0,
        honorairesGestion: decompte.honoraires,
        net: decompte.net,
      });
      toast.success("Décompte généré");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la génération");
    } finally {
      setExporting(false);
    }
  };

  if (!checked) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2"><Building2 className="h-5 w-5" /><span className="font-semibold">Agence Immobilière</span></div>
          <Button variant="outline" size="sm" asChild><Link to="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" /> Tableau de bord</Link></Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Tabs defaultValue="charges">
          <TabsList className="mb-4">
            <TabsTrigger value="charges">Charges</TabsTrigger>
            <TabsTrigger value="decompte">Décompte propriétaire</TabsTrigger>
          </TabsList>

          <TabsContent value="charges">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>Charges</CardTitle>
                  <CardDescription>
                    Charges liées aux biens, rattachées à un mois de décompte.
                    {!canWrite && " Consultation seule."}
                  </CardDescription>
                </div>
                {canWrite && <Button size="sm" onClick={openCreate}><Plus className="mr-2 h-4 w-4" /> Nouvelle charge</Button>}
              </CardHeader>
              <CardContent>
                <FilterBar
                  search={search}
                  onSearchChange={setSearch}
                  searchPlaceholder="Libellé ou bien..."
                  selects={[
                    { key: "bien", label: "Bien", value: filterBien, onChange: setFilterBien, options: biens.map((b) => ({ value: b.id, label: b.titre })), width: "w-52" },
                    { key: "mois", label: "Mois de rattachement", value: fMois, onChange: setFMois, options: moisOptions.map((m) => ({ value: m, label: monthLabel(m) })), width: "w-48" },
                    { key: "statut", label: "Imputation", value: fStatut, onChange: setFStatut, options: [{ value: "a_imputer", label: "À imputer" }, { value: "imputee", label: "Imputée" }] },
                    { key: "rec", label: "Récurrente", value: fRec, onChange: setFRec, options: [{ value: "oui", label: "Oui" }, { value: "non", label: "Non" }] },
                  ]}
                  onReset={() => { setSearch(""); setFilterBien("all"); setFRec("all"); setFStatut("all"); setFMois("all"); }}
                />
                {loading ? <p className="text-sm text-muted-foreground">Chargement...</p> : filtered.length === 0 ? <p className="text-sm text-muted-foreground">Aucune charge.</p> : (
                  <div className="overflow-x-auto"><Table>
                    <TableHeader><TableRow>
                      <TableHead>Bien</TableHead><TableHead>Libellé</TableHead><TableHead>Montant</TableHead>
                      <TableHead>Mois de rattachement</TableHead><TableHead>Saisie</TableHead>
                      <TableHead>Récurrence</TableHead><TableHead>Imputation</TableHead>
                      {canWrite && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow></TableHeader>
                    <TableBody>{filtered.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{bienTitre(c.bien_id)}</TableCell>
                        <TableCell>{c.libelle}</TableCell>
                        <TableCell>{fmtMoney(c.montant)}</TableCell>
                        <TableCell className="capitalize">{monthLabel(monthKey(c.mois_rattachement))}</TableCell>
                        <TableCell className="text-muted-foreground">{fmtDate(c.date)}</TableCell>
                        <TableCell>
                          {c.recurrente ? (
                            <span className="inline-flex items-center gap-1 text-sm">
                              <Repeat className="h-3.5 w-3.5" /> {c.frequence}
                              {c.recurrence_debut && <span className="text-muted-foreground">dès {fmtDate(c.recurrence_debut)}</span>}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          {c.statut_imputation === "imputee" ? (
                            <Badge variant="secondary">Imputée {c.decompte_mois ? monthLabel(monthKey(c.decompte_mois)) : ""}</Badge>
                          ) : <Badge variant="outline">À imputer</Badge>}
                        </TableCell>
                        {canWrite && (
                          <TableCell className="text-right whitespace-nowrap">
                            <Button variant="ghost" size="sm" onClick={() => toggleImputation(c)}>
                              {c.statut_imputation === "imputee" ? "Dé-imputer" : "Imputer"}
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(c)}><Trash2 className="h-4 w-4" /></Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}</TableBody>
                  </Table></div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="decompte">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>Décompte propriétaire</CardTitle>
                  <CardDescription>Loyers encaissés − Charges − Travaux (dépense réelle) − Honoraires de fiscalité − Honoraires de gestion = Net à reverser.</CardDescription>
                </div>
                <Button size="sm" disabled={!decompte || exporting} onClick={handleExportDocx}>
                  <FileDown className="mr-2 h-4 w-4" /> {exporting ? "Génération..." : "Générer le décompte"}
                </Button>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="grid gap-2"><Label>Bien</Label>
                    <Select value={dBien} onValueChange={setDBien}>
                      <SelectTrigger><SelectValue placeholder="Sélectionner un bien..." /></SelectTrigger>
                      <SelectContent>{biens.map((b) => <SelectItem key={b.id} value={b.id}>{b.titre}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2"><Label htmlFor="dmois">Mois</Label>
                    <Input id="dmois" type="month" value={dMois} onChange={(e) => setDMois(e.target.value)} />
                  </div>
                  <div className="grid gap-2"><Label htmlFor="taux">Honoraires de gestion (%)</Label>
                    <Input id="taux" type="number" min="0" max="100" step="0.5" value={tauxHono} onChange={(e) => setTauxHono(e.target.value)} />
                  </div>
                </div>

                {!decompte ? <p className="text-sm text-muted-foreground">Sélectionnez un bien pour générer le décompte.</p> : (
                  <div className="space-y-6">
                    <div className="grid gap-4 sm:grid-cols-4">
                      {[
                        { l: "Loyers attendus", v: decompte.loyersAttendus },
                        { l: "Impayés du mois", v: -decompte.resteDu },
                        { l: "Loyers encaissés", v: decompte.loyersEncaisses },
                        { l: "Charges du mois", v: -decompte.totalCharges },
                      ].map((k) => (
                        <div key={k.l} className="rounded-lg border bg-background p-4">
                          <p className="text-xs text-muted-foreground">{k.l}</p>
                          <p className="text-lg font-semibold">{fmtMoney(k.v)}</p>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-lg border bg-background p-4">
                      <div className="flex justify-between py-1 text-sm"><span>Loyers encaissés</span><span>{fmtMoney(decompte.loyersEncaisses)}</span></div>
                      <div className="flex justify-between py-1 text-sm"><span>Charges du mois</span><span>− {fmtMoney(decompte.totalCharges)}</span></div>
                      <div className="flex justify-between py-1 text-sm"><span>Honoraires de gestion ({tauxHono || 0} %)</span><span>− {fmtMoney(decompte.honoraires)}</span></div>
                      <div className="mt-2 flex justify-between border-t pt-2 font-semibold"><span>Net à reverser au propriétaire</span><span>{fmtMoney(decompte.net)}</span></div>
                    </div>

                    <div>
                      <h3 className="mb-2 text-sm font-semibold">Détail des charges — <span className="capitalize">{monthLabel(dMois)}</span></h3>
                      {decompte.lignes.length === 0 ? <p className="text-sm text-muted-foreground">Aucune charge sur ce mois.</p> : (
                        <Table>
                          <TableHeader><TableRow><TableHead>Libellé</TableHead><TableHead>Montant</TableHead><TableHead>Origine</TableHead><TableHead>Imputation</TableHead></TableRow></TableHeader>
                          <TableBody>{decompte.lignes.map((c) => (
                            <TableRow key={c.id}>
                              <TableCell>{c.libelle}</TableCell>
                              <TableCell>{fmtMoney(c.montant)}</TableCell>
                              <TableCell>{c.virtuelle ? <Badge variant="outline">Récurrente (auto)</Badge> : "Saisie"}</TableCell>
                              <TableCell>{c.statut_imputation === "imputee" ? <Badge variant="secondary">Imputée</Badge> : <Badge variant="outline">À imputer</Badge>}</TableCell>
                            </TableRow>
                          ))}</TableBody>
                        </Table>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setForm(emptyForm); } }}>
        <DialogContent>
          <form onSubmit={handleSave}>
            <DialogHeader>
              <DialogTitle>{editing ? "Modifier la charge" : "Nouvelle charge"}</DialogTitle>
              <DialogDescription>Rattachez la charge au mois de décompte concerné.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2"><Label>Bien *</Label>
                <Select value={form.bien_id} onValueChange={(v) => setForm({ ...form, bien_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner un bien..." /></SelectTrigger>
                  <SelectContent>{biens.map((b) => <SelectItem key={b.id} value={b.id}>{b.titre}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2"><Label htmlFor="libelle">Libellé *</Label><Input id="libelle" value={form.libelle} onChange={(e) => setForm({ ...form, libelle: e.target.value })} required /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2"><Label htmlFor="montant">Montant (FCFA) *</Label><Input id="montant" type="number" min="0" step="1" required value={form.montant} onChange={(e) => setForm({ ...form, montant: e.target.value })} /></div>
                <div className="grid gap-2"><Label htmlFor="date">Date de saisie *</Label><Input id="date" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              </div>
              <div className="grid gap-2"><Label htmlFor="mois">Mois de rattachement *</Label>
                <Input id="mois" type="month" required value={form.mois_rattachement} onChange={(e) => setForm({ ...form, mois_rattachement: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="recurrente" checked={form.recurrente} onCheckedChange={(v) => setForm({ ...form, recurrente: v === true })} />
                <Label htmlFor="recurrente">Charge récurrente</Label>
              </div>
              {form.recurrente && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="grid gap-2"><Label htmlFor="rdeb">Début *</Label><Input id="rdeb" type="date" value={form.recurrence_debut} onChange={(e) => setForm({ ...form, recurrence_debut: e.target.value })} /></div>
                  <div className="grid gap-2"><Label htmlFor="rfin">Fin</Label><Input id="rfin" type="date" value={form.recurrence_fin} onChange={(e) => setForm({ ...form, recurrence_fin: e.target.value })} /></div>
                  <div className="grid gap-2"><Label>Fréquence</Label>
                    <Select value={form.frequence} onValueChange={(v) => setForm({ ...form, frequence: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mensuelle">Mensuelle</SelectItem>
                        <SelectItem value="trimestrielle">Trimestrielle</SelectItem>
                        <SelectItem value="annuelle">Annuelle</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2"><Label>Statut d'imputation</Label>
                  <Select value={form.statut_imputation} onValueChange={(v) => setForm({ ...form, statut_imputation: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="a_imputer">À imputer</SelectItem>
                      <SelectItem value="imputee">Imputée au décompte</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.statut_imputation === "imputee" && (
                  <div className="grid gap-2"><Label htmlFor="dm">Décompte de</Label>
                    <Input id="dm" type="month" value={form.decompte_mois || form.mois_rattachement} onChange={(e) => setForm({ ...form, decompte_mois: e.target.value })} />
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={saving}>{saving ? "..." : "Enregistrer"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

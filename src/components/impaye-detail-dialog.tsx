import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, X, History, Scale } from "lucide-react";
import { toast } from "sonner";
import { CommentSection } from "@/components/comment-section";

export type Impaye = {
  id: string;
  contrat_id: string;
  montant_du: number;
  montant_paye: number;
  date_echeance: string;
  statut: string;
  date_derniere_relance: string | null;
  notes: string | null;
  etape_traitement?: string | null;
  service_en_charge?: string | null;
  date_mise_en_demeure?: string | null;
  date_acte_commissaire?: string | null;
  date_assignation?: string | null;
};

type Details = {
  contrat: { id: string; lot_id: string; locataire_id: string | null } | null;
  lot: { id: string; label: string; bien_id: string } | null;
  bien: { id: string; titre: string } | null;
  locataire: { id: string; nom: string; prenom: string | null } | null;
};

type HistoryRow = {
  id: string;
  champ_modifie: string;
  ancienne_valeur: string | null;
  nouvelle_valeur: string | null;
  auteur: string | null;
  created_at: string;
};

const STATUTS = [
  { value: "a_jour", label: "À jour" },
  { value: "en_retard", label: "En retard" },
  { value: "relance_envoyee", label: "Relance envoyée" },
];
const STATUT_LABEL: Record<string, string> = Object.fromEntries(
  STATUTS.map((s) => [s.value, s.label]),
);

const ETAPE_LABEL: Record<string, string> = {
  recouvrement: "Recouvrement",
  transfere_juridique: "Transféré au juridique",
  mise_en_demeure: "Mise en demeure",
  procedure_judiciaire: "Procédure judiciaire",
  resolu: "Résolu",
};
const SERVICE_LABEL: Record<string, string> = {
  recouvrement: "Recouvrement",
  juridique: "Juridique",
};
const CHAMP_LABEL: Record<string, string> = {
  creation: "Création",
  statut: "Statut",
  etape_traitement: "Étape",
  service_en_charge: "Service",
  date_mise_en_demeure: "Mise en demeure",
  date_acte_commissaire: "Acte de commissaire",
  date_assignation: "Assignation",
  cloture_procedure: "Clôture",
};

const JURIDIQUE_ETAPES = new Set([
  "transfere_juridique",
  "mise_en_demeure",
  "procedure_judiciaire",
]);

const WRITE_ROLES = new Set([
  "admin",
  "direction",
  "recouvrement",
  "commercial",
  "gestion_locative",
  "juridique",
]);
const TRANSFER_ROLES = new Set(["admin", "direction", "recouvrement"]);
const JURIDIQUE_ROLES = new Set(["admin", "direction", "juridique"]);

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("fr-FR") : "—";
const fmtDateTime = (d: string | null) =>
  d ? new Date(d).toLocaleString("fr-FR") : "—";
const fmtMoney = (n: number | null) =>
  n == null ? "—" : Number(n).toLocaleString("fr-FR") + " FCFA";

const formatValue = (champ: string, v: string | null): string => {
  if (!v) return "—";
  if (champ === "statut") return STATUT_LABEL[v] ?? v;
  if (champ === "etape_traitement") return ETAPE_LABEL[v] ?? v;
  if (champ === "service_en_charge") return SERVICE_LABEL[v] ?? v;
  if (champ.startsWith("date_")) return new Date(v).toLocaleDateString("fr-FR");
  return v;
};

type Props = {
  impaye: Impaye | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  role?: string;
  onUpdated?: (updated: Impaye) => void;
};

export function ImpayeDetailDialog({ impaye, open, onOpenChange, role, onUpdated }: Props) {
  const [details, setDetails] = useState<Details>({
    contrat: null,
    lot: null,
    bien: null,
    locataire: null,
  });
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [authors, setAuthors] = useState<Map<string, string>>(new Map());
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    statut: "",
    montant_paye: "",
    date_derniere_relance: "",
    date_mise_en_demeure: "",
    date_acte_commissaire: "",
    date_assignation: "",
  });
  const [saving, setSaving] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [closing, setClosing] = useState(false);

  const canWrite = useMemo(() => (role ? WRITE_ROLES.has(role) : false), [role]);
  const canComment = role !== "en_attente";
  const canTransfer = role ? TRANSFER_ROLES.has(role) : false;
  const canEditJuridique = role ? JURIDIQUE_ROLES.has(role) : false;
  const service = impaye?.service_en_charge ?? "recouvrement";
  const etape = impaye?.etape_traitement ?? "recouvrement";
  const isResolved = etape === "resolu";
  const resteInitial = impaye ? Number(impaye.montant_du) - Number(impaye.montant_paye) : 0;
  const showJuridiqueAlert =
    !!impaye && !isResolved && resteInitial <= 0 && JURIDIQUE_ETAPES.has(etape);

  useEffect(() => {
    if (!open || !impaye) return;
    setEditing(false);
    setForm({
      statut: impaye.statut,
      montant_paye: String(impaye.montant_paye ?? 0),
      date_derniere_relance: impaye.date_derniere_relance ?? "",
      date_mise_en_demeure: impaye.date_mise_en_demeure ?? "",
      date_acte_commissaire: impaye.date_acte_commissaire ?? "",
      date_assignation: impaye.date_assignation ?? "",
    });
    (async () => {
      const { data: c } = await supabase
        .from("contrats")
        .select("id, lot_id, locataire_id")
        .eq("id", impaye.contrat_id)
        .maybeSingle();
      let lot: Details["lot"] = null;
      let bien: Details["bien"] = null;
      let locataire: Details["locataire"] = null;
      if (c) {
        const { data: l } = await supabase
          .from("lots")
          .select("id, label, bien_id")
          .eq("id", c.lot_id)
          .maybeSingle();
        lot = (l ?? null) as Details["lot"];
        if (l) {
          const { data: b } = await supabase
            .from("biens")
            .select("id, titre")
            .eq("id", l.bien_id)
            .maybeSingle();
          bien = (b ?? null) as Details["bien"];
        }
        if (c.locataire_id) {
          const { data: loc } = await supabase
            .from("contacts")
            .select("id, nom, prenom")
            .eq("id", c.locataire_id)
            .maybeSingle();
          locataire = (loc ?? null) as Details["locataire"];
        }
      }
      setDetails({ contrat: (c ?? null) as Details["contrat"], lot, bien, locataire });
      await loadHistory(impaye.id);
    })();
  }, [open, impaye]);

  async function loadHistory(id: string) {
    const { data: h } = await supabase
      .from("impayes_historique" as never)
      .select("id, champ_modifie, ancienne_valeur, nouvelle_valeur, auteur, created_at")
      .eq("impaye_id", id)
      .order("created_at", { ascending: false });
    const rows = (h ?? []) as unknown as HistoryRow[];
    setHistory(rows);
    const ids = Array.from(
      new Set(rows.map((r) => r.auteur).filter((v): v is string => !!v)),
    );
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", ids);
      setAuthors(
        new Map(
          ((profs ?? []) as { id: string; email: string | null }[]).map((p) => [
            p.id,
            p.email ?? "—",
          ]),
        ),
      );
    } else {
      setAuthors(new Map());
    }
  }

  if (!impaye) return null;
  const reste = Number(impaye.montant_du) - Number(impaye.montant_paye);

  async function createJuridiqueAlertActivity() {
    if (!impaye) return;
    // Avoid duplicates: check for an existing open "Arrêter la procédure" activity for this impayé.
    const { data: existing } = await supabase
      .from("activites")
      .select("id, statut, titre")
      .eq("impaye_id", impaye.id)
      .ilike("titre", "Arrêter la procédure%")
      .limit(5);
    const hasOpen = ((existing ?? []) as { statut: string }[]).some(
      (a) => a.statut !== "termine" && a.statut !== "annule",
    );
    if (hasOpen) return;
    const { data: juridiques } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "juridique")
      .limit(1);
    const assignee = (juridiques ?? [])[0]?.id ?? null;
    const locNom = details.locataire
      ? `${details.locataire.nom}${details.locataire.prenom ? " " + details.locataire.prenom : ""}`
      : "locataire";
    const { data: userRes } = await supabase.auth.getUser();
    await supabase.from("activites").insert({
      titre: `Arrêter la procédure – ${locNom} – paiement reçu, à confirmer`,
      type_activite: "tache",
      date_debut: new Date().toISOString(),
      priorite: "urgente",
      statut: "a_faire",
      assigne_a: assignee,
      created_by: userRes.user?.id ?? null,
      impaye_id: impaye.id,
    } as never);
  }

  async function handleSave() {
    if (!impaye) return;
    setSaving(true);
    const newMontantPaye = form.montant_paye === "" ? 0 : Number(form.montant_paye);
    const newReste = Number(impaye.montant_du) - newMontantPaye;
    const wasResolved = etape === "resolu";
    const payload: Record<string, unknown> = {
      statut: form.statut,
      montant_paye: newMontantPaye,
      date_derniere_relance: form.date_derniere_relance || null,
    };
    // Juridical dates only when in juridique service and role allowed
    if (service === "juridique" && canEditJuridique) {
      payload.date_mise_en_demeure = form.date_mise_en_demeure || null;
      payload.date_acte_commissaire = form.date_acte_commissaire || null;
      payload.date_assignation = form.date_assignation || null;
      // Auto-update etape based on newly set dates
      let nextEtape = etape === "recouvrement" ? "transfere_juridique" : etape;
      if (form.date_assignation) nextEtape = "procedure_judiciaire";
      else if (form.date_acte_commissaire) nextEtape = "procedure_judiciaire";
      else if (form.date_mise_en_demeure) nextEtape = "mise_en_demeure";
      payload.etape_traitement = nextEtape;
    }
    // Auto-close only if never escalated (etape recouvrement or null) and fully paid.
    let autoClosed = false;
    if (!wasResolved && newReste <= 0 && (etape === "recouvrement" || !impaye.etape_traitement)) {
      payload.statut = "a_jour";
      payload.etape_traitement = "resolu";
      autoClosed = true;
    }
    const { data, error } = await supabase
      .from("impayes")
      .update(payload as never)
      .eq("id", impaye.id)
      .select()
      .maybeSingle();
    setSaving(false);
    if (error) return toast.error(error.message);
    setEditing(false);
    if (data && onUpdated) onUpdated(data as unknown as Impaye);

    // If fully paid but in a juridique step, create alert activity (do not close).
    if (!wasResolved && newReste <= 0 && JURIDIQUE_ETAPES.has(etape)) {
      await createJuridiqueAlertActivity();
      toast.warning("Paiement reçu — procédure juridique à confirmer");
    } else if (autoClosed) {
      toast.success("Impayé soldé et clôturé");
    } else {
      toast.success("Impayé mis à jour");
    }
    await loadHistory(impaye.id);
  }

  async function handleConfirmClose() {
    if (!impaye) return;
    setClosing(true);
    const { data, error } = await supabase
      .from("impayes")
      .update({ statut: "a_jour", etape_traitement: "resolu" } as never)
      .eq("id", impaye.id)
      .select()
      .maybeSingle();
    if (error) {
      setClosing(false);
      return toast.error(error.message);
    }
    // Explicit history entry mentioning procedure stop
    const { data: userRes } = await supabase.auth.getUser();
    await supabase.from("impayes_historique" as never).insert({
      impaye_id: impaye.id,
      champ_modifie: "cloture_procedure",
      ancienne_valeur: ETAPE_LABEL[etape] ?? etape,
      nouvelle_valeur: "Procédure arrêtée suite à paiement",
      auteur: userRes.user?.id ?? null,
    } as never);
    setClosing(false);
    toast.success("Dossier soldé et procédure clôturée");
    if (data && onUpdated) onUpdated(data as unknown as Impaye);
    await loadHistory(impaye.id);
  }


  async function handleTransferJuridique() {
    if (!impaye) return;
    setTransferring(true);

    // Find a juridique user to assign
    const { data: juridiques } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "juridique")
      .limit(1);
    const assignee = (juridiques ?? [])[0]?.id ?? null;

    // Priority based on delay
    const echeance = new Date(impaye.date_echeance);
    const days = Math.floor((Date.now() - echeance.getTime()) / (1000 * 60 * 60 * 24));
    const priorite = days > 25 ? "urgente" : "normale";

    const locNom = details.locataire
      ? `${details.locataire.nom}${details.locataire.prenom ? " " + details.locataire.prenom : ""}`
      : "locataire";
    const bienTxt = details.bien
      ? `${details.bien.titre}${details.lot ? " — " + details.lot.label : ""}`
      : (details.lot?.label ?? "—");
    const titre = `Impayé transféré – ${locNom} – ${bienTxt} – ${fmtMoney(reste)}`;

    // Update impayé
    const { data: updated, error } = await supabase
      .from("impayes")
      .update({
        service_en_charge: "juridique",
        etape_traitement: "transfere_juridique",
      } as never)
      .eq("id", impaye.id)
      .select()
      .maybeSingle();

    if (error) {
      setTransferring(false);
      return toast.error(error.message);
    }

    // Create linked activité
    const { data: userRes } = await supabase.auth.getUser();
    await supabase.from("activites").insert({
      titre,
      type_activite: "tache",
      date_debut: new Date().toISOString(),
      priorite,
      statut: "a_faire",
      assigne_a: assignee,
      created_by: userRes.user?.id ?? null,
      impaye_id: impaye.id,
    } as never);

    setTransferring(false);
    toast.success("Impayé transféré au juridique");
    if (updated && onUpdated) onUpdated(updated as unknown as Impaye);
    await loadHistory(impaye.id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 flex-wrap">
            <DialogTitle>Détail impayé</DialogTitle>
            <Badge variant={impaye.statut === "en_retard" ? "destructive" : "default"}>
              {STATUT_LABEL[impaye.statut] ?? impaye.statut}
            </Badge>
            <Badge variant="outline">
              {SERVICE_LABEL[service] ?? service}
            </Badge>
            {impaye.etape_traitement && !isResolved && (
              <Badge variant="secondary">
                {ETAPE_LABEL[impaye.etape_traitement] ?? impaye.etape_traitement}
              </Badge>
            )}
            {isResolved && (
              <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">Soldé</Badge>
            )}
          </div>
          <DialogDescription>Échéance du {fmtDate(impaye.date_echeance)}</DialogDescription>
        </DialogHeader>

        {showJuridiqueAlert && (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
            <div className="font-semibold text-amber-700 dark:text-amber-400">
              Paiement reçu — vérifier avant de clôturer la procédure
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Le montant dû a été soldé alors qu'une procédure juridique est en cours.
              Confirmez la clôture uniquement après vérification.
            </p>
          </div>
        )}


        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3 rounded-md border p-3 bg-muted/30">
            <div>
              <div className="text-xs text-muted-foreground">Contrat</div>
              {details.contrat ? (
                <Link
                  to="/contrats/$contratId"
                  params={{ contratId: details.contrat.id }}
                  className="underline"
                >
                  Voir contrat
                </Link>
              ) : (
                "—"
              )}
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Lot</div>
              {details.lot ? (
                <Link
                  to="/lots/$lotId"
                  params={{ lotId: details.lot.id }}
                  className="underline"
                >
                  {details.lot.label}
                </Link>
              ) : (
                "—"
              )}
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Bien</div>
              {details.bien ? (
                <Link
                  to="/biens/$bienId"
                  params={{ bienId: details.bien.id }}
                  className="underline"
                >
                  {details.bien.titre}
                </Link>
              ) : (
                "—"
              )}
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Locataire</div>
              {details.locataire ? (
                <Link
                  to="/contacts/$contactId"
                  params={{ contactId: details.locataire.id }}
                  className="underline"
                >
                  {details.locataire.nom}
                  {details.locataire.prenom ? ` ${details.locataire.prenom}` : ""}
                </Link>
              ) : (
                "—"
              )}
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-xs text-muted-foreground">Montant dû</div>
              <div className="font-medium">{fmtMoney(impaye.montant_du)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Montant payé</div>
              <div className="font-medium">{fmtMoney(impaye.montant_paye)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Reste à payer</div>
              <div
                className={
                  "font-medium " + (reste > 0 ? "text-destructive" : "text-emerald-600")
                }
              >
                {fmtMoney(reste)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-muted-foreground">Échéance</div>
              <div>{fmtDate(impaye.date_echeance)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Dernière relance</div>
              <div>{fmtDate(impaye.date_derniere_relance)}</div>
            </div>
          </div>

          {service === "juridique" && (
            <div className="grid grid-cols-3 gap-3 rounded-md border p-3 bg-amber-500/5">
              <div>
                <div className="text-xs text-muted-foreground">Mise en demeure</div>
                <div>{fmtDate(impaye.date_mise_en_demeure)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Acte de commissaire</div>
                <div>{fmtDate(impaye.date_acte_commissaire)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Assignation</div>
                <div>{fmtDate(impaye.date_assignation)}</div>
              </div>
            </div>
          )}

          {impaye.notes && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Notes</div>
              <div className="whitespace-pre-wrap rounded-md border p-3 bg-muted/20">
                {impaye.notes}
              </div>
            </div>
          )}

          {canWrite && editing && (
            <div className="border rounded-md p-3 space-y-3 bg-muted/10">
              <div className="text-sm font-semibold">Mettre à jour</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Statut</Label>
                  <Select
                    value={form.statut}
                    onValueChange={(v) => setForm({ ...form, statut: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUTS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Montant payé</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.montant_paye}
                    onChange={(e) => setForm({ ...form, montant_paye: e.target.value })}
                  />
                </div>
                <div className="grid gap-2 col-span-2">
                  <Label>Date de dernière relance</Label>
                  <Input
                    type="date"
                    value={form.date_derniere_relance}
                    onChange={(e) =>
                      setForm({ ...form, date_derniere_relance: e.target.value })
                    }
                  />
                </div>
                {service === "juridique" && canEditJuridique && (
                  <>
                    <div className="grid gap-2 col-span-2 pt-2">
                      <div className="text-xs font-semibold text-muted-foreground">
                        Dates juridiques
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label>Mise en demeure</Label>
                      <Input
                        type="date"
                        value={form.date_mise_en_demeure}
                        onChange={(e) =>
                          setForm({ ...form, date_mise_en_demeure: e.target.value })
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Acte de commissaire</Label>
                      <Input
                        type="date"
                        value={form.date_acte_commissaire}
                        onChange={(e) =>
                          setForm({ ...form, date_acte_commissaire: e.target.value })
                        }
                      />
                    </div>
                    <div className="grid gap-2 col-span-2">
                      <Label>Assignation</Label>
                      <Input
                        type="date"
                        value={form.date_assignation}
                        onChange={(e) =>
                          setForm({ ...form, date_assignation: e.target.value })
                        }
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                  <X className="mr-2 h-4 w-4" /> Annuler
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </Button>
              </div>
            </div>
          )}

          <div className="border-t pt-3">
            <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
              <History className="h-4 w-4" /> Historique
            </h4>
            {history.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucun changement enregistré.</p>
            ) : (
              <ul className="space-y-1.5">
                {history.map((h) => (
                  <li
                    key={h.id}
                    className="text-xs rounded-md border px-2 py-1.5 bg-muted/20 flex items-center justify-between gap-2"
                  >
                    <span>
                      <span className="font-medium">
                        {CHAMP_LABEL[h.champ_modifie] ?? h.champ_modifie}
                      </span>
                      {h.champ_modifie === "creation" ? (
                        <>
                          {" : "}
                          {formatValue("statut", h.nouvelle_valeur)}
                        </>
                      ) : (
                        <>
                          {" : "}
                          <span className="text-muted-foreground">
                            {formatValue(h.champ_modifie, h.ancienne_valeur)}
                          </span>{" "}
                          →{" "}
                          <span className="font-medium">
                            {formatValue(h.champ_modifie, h.nouvelle_valeur)}
                          </span>
                        </>
                      )}
                    </span>
                    <span className="text-muted-foreground whitespace-nowrap">
                      {h.auteur ? authors.get(h.auteur) ?? "—" : "—"} •{" "}
                      {fmtDateTime(h.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t pt-3">
            <CommentSection
              table="impayes_commentaires"
              fkColumn="impaye_id"
              recordId={impaye.id}
              canComment={canComment}
              entityType="impaye"
              entityId={impaye.id}
              link={`/impayes?open=${impaye.id}`}
              entityTitle={`Impayé du ${fmtDate(impaye.date_echeance)}`}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          {canTransfer && service === "recouvrement" && (
            <Button
              size="sm"
              variant="secondary"
              onClick={handleTransferJuridique}
              disabled={transferring}
            >
              <Scale className="mr-2 h-4 w-4" />
              {transferring ? "Transfert..." : "Transférer au juridique"}
            </Button>
          )}
          {canWrite && !editing && (
            <Button size="sm" onClick={() => setEditing(true)}>
              <Pencil className="mr-2 h-4 w-4" /> Modifier
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

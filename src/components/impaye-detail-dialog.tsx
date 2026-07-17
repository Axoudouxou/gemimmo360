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
import { Pencil, X, History } from "lucide-react";
import { toast } from "sonner";
import { CommentSection } from "@/components/comment-section";

type Impaye = {
  id: string;
  contrat_id: string;
  montant_du: number;
  montant_paye: number;
  date_echeance: string;
  statut: string;
  date_derniere_relance: string | null;
  notes: string | null;
};

type Details = {
  contrat: { id: string; lot_id: string; locataire_id: string | null } | null;
  lot: { id: string; label: string; bien_id: string } | null;
  bien: { id: string; titre: string } | null;
  locataire: { id: string; nom: string; prenom: string | null } | null;
};

type HistoryRow = {
  id: string;
  ancien_statut: string | null;
  nouveau_statut: string;
  changed_by: string | null;
  changed_at: string;
};

const STATUTS = [
  { value: "a_jour", label: "À jour" },
  { value: "en_retard", label: "En retard" },
  { value: "relance_envoyee", label: "Relance envoyée" },
];
const STATUT_LABEL: Record<string, string> = Object.fromEntries(
  STATUTS.map((s) => [s.value, s.label]),
);

const WRITE_ROLES = new Set([
  "admin",
  "direction",
  "recouvrement",
  "commercial",
  "gestion_locative",
  "juridique",
]);

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
const fmtDateTime = (d: string | null) =>
  d ? new Date(d).toLocaleString("fr-FR") : "—";
const fmtMoney = (n: number | null) =>
  n == null ? "—" : Number(n).toLocaleString("fr-FR") + " FCFA";

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
  });
  const [saving, setSaving] = useState(false);

  const canWrite = useMemo(() => (role ? WRITE_ROLES.has(role) : false), [role]);
  const canComment = role !== "en_attente";

  useEffect(() => {
    if (!open || !impaye) return;
    setEditing(false);
    setForm({
      statut: impaye.statut,
      montant_paye: String(impaye.montant_paye ?? 0),
      date_derniere_relance: impaye.date_derniere_relance ?? "",
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

      const { data: h } = await supabase
        .from("impayes_statut_historique")
        .select("id, ancien_statut, nouveau_statut, changed_by, changed_at")
        .eq("impaye_id", impaye.id)
        .order("changed_at", { ascending: false });
      const rows = (h ?? []) as HistoryRow[];
      setHistory(rows);
      const ids = Array.from(
        new Set(rows.map((r) => r.changed_by).filter((v): v is string => !!v)),
      );
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, email")
          .in("id", ids);
        setAuthors(
          new Map(((profs ?? []) as { id: string; email: string | null }[]).map((p) => [p.id, p.email ?? "—"])),
        );
      } else {
        setAuthors(new Map());
      }
    })();
  }, [open, impaye]);

  if (!impaye) return null;
  const reste = Number(impaye.montant_du) - Number(impaye.montant_paye);

  async function handleSave() {
    if (!impaye) return;
    setSaving(true);
    const payload = {
      statut: form.statut,
      montant_paye: form.montant_paye === "" ? 0 : Number(form.montant_paye),
      date_derniere_relance: form.date_derniere_relance || null,
    };
    const { data, error } = await supabase
      .from("impayes")
      .update(payload)
      .eq("id", impaye.id)
      .select()
      .maybeSingle();
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Impayé mis à jour");
    setEditing(false);
    if (data && onUpdated) onUpdated(data as Impaye);
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
          </div>
          <DialogDescription>Échéance du {fmtDate(impaye.date_echeance)}</DialogDescription>
        </DialogHeader>

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
              <History className="h-4 w-4" /> Historique des statuts
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
                      {h.ancien_statut ? (
                        <>
                          <span className="text-muted-foreground">
                            {STATUT_LABEL[h.ancien_statut] ?? h.ancien_statut}
                          </span>{" "}
                          →{" "}
                          <span className="font-medium">
                            {STATUT_LABEL[h.nouveau_statut] ?? h.nouveau_statut}
                          </span>
                        </>
                      ) : (
                        <span className="font-medium">
                          Création : {STATUT_LABEL[h.nouveau_statut] ?? h.nouveau_statut}
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground">
                      {h.changed_by ? authors.get(h.changed_by) ?? "—" : "—"} •{" "}
                      {fmtDateTime(h.changed_at)}
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

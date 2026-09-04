import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ETAPE_LABELS, JOUR_ECHEANCE, dateEcheanceForPeriode } from "@/lib/echeance-statut";

const monthNow = () => new Date().toISOString().slice(0, 7);

export type EcheanceRow = {
  id: string;
  contrat_id: string;
  periode: string;
  date_echeance: string;
  montant_du: number | string;
  montant_affecte?: number | string | null;
  etape_traitement?: string | null;
  service_en_charge?: string | null;
  notes?: string | null;
};

export function EcheanceDialog({
  open,
  onOpenChange,
  contratId,
  contratOptions,
  echeance,
  canDelete = false,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contratId?: string;
  contratOptions?: { value: string; label: string }[];
  echeance?: EcheanceRow | null;
  canDelete?: boolean;
  onSaved?: () => void;
}) {
  const isEdit = !!echeance;
  const [contrat, setContrat] = useState(contratId ?? "");
  const [mois, setMois] = useState(monthNow());
  const dateEcheance = dateEcheanceForPeriode(mois || monthNow());
  const [montant, setMontant] = useState("");
  const [etape, setEtape] = useState("recouvrement");
  const [service, setService] = useState("recouvrement");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (echeance) {
      setContrat(echeance.contrat_id);
      setMois(String(echeance.periode).slice(0, 7));
      setMontant(String(echeance.montant_du));
      setEtape(echeance.etape_traitement ?? "recouvrement");
      setService(echeance.service_en_charge ?? "recouvrement");
      setNotes(echeance.notes ?? "");
      return;
    }
    setContrat(contratId ?? "");
    setMois(monthNow());
    setMontant("");
    setEtape("recouvrement");
    setService("recouvrement");
    setNotes("");
  }, [open, contratId, echeance]);

  // Pré-remplit le montant avec le loyer du contrat sélectionné
  useEffect(() => {
    if (!open || !contrat || isEdit) return;
    (async () => {
      const { data } = await supabase
        .from("contrats")
        .select("loyer_mensuel")
        .eq("id", contrat)
        .maybeSingle();
      if (data?.loyer_mensuel != null) setMontant((m) => m || String(data.loyer_mensuel));
    })();
  }, [open, contrat]);

  const handleSave = async () => {
    if (!contrat) return toast.error("Le contrat est obligatoire");
    if (!mois) return toast.error("La période (mois) est obligatoire");
    const m = Number(montant);
    if (!m || m <= 0) return toast.error("Le montant dû doit être supérieur à 0");

    if (isEdit) {
      const dejaPaye = Number(echeance?.montant_affecte ?? 0);
      if (m < dejaPaye)
        return toast.error(
          `Le montant dû ne peut pas être inférieur au montant déjà affecté (${dejaPaye})`,
        );
      setSaving(true);
      const { error: upErr } = await supabase
        .from("echeances")
        .update({
          periode: `${mois}-01`,
          date_echeance: dateEcheance,
          montant_du: m,
          etape_traitement: etape,
          service_en_charge: service,
          notes: notes.trim() || null,
        })
        .eq("id", echeance!.id);
      setSaving(false);
      if (upErr) {
        if (upErr.code === "23505")
          return toast.error("Un impayé existe déjà pour ce contrat et ce mois");
        return toast.error(upErr.message);
      }
      toast.success("Impayé modifié");
      onOpenChange(false);
      onSaved?.();
      return;
    }

    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase.from("echeances").insert({
      contrat_id: contrat,
      periode: `${mois}-01`,
      date_echeance: dateEcheance,
      montant_du: m,
      statut: "impaye",
      etape_traitement: etape,
      service_en_charge: service,
      notes: notes.trim() || null,
      created_by: userRes.user?.id ?? null,
    });
    setSaving(false);

    if (error) {
      if (error.code === "23505")
        return toast.error("Un impayé existe déjà pour ce contrat et ce mois");
      return toast.error(error.message);
    }
    toast.success("Impayé enregistré");
    onOpenChange(false);
    onSaved?.();
  };

  const handleDelete = async () => {
    if (!echeance) return;
    if (Number(echeance.montant_affecte ?? 0) > 0)
      return toast.error("Impossible de supprimer : des paiements y sont affectés. Retirez d'abord l'affectation.");
    if (!window.confirm("Supprimer définitivement cet impayé ?")) return;
    setSaving(true);
    const { error } = await supabase.from("echeances").delete().eq("id", echeance.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Impayé supprimé");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier l'impayé" : "Saisir un impayé"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Corrigez la période, le montant dû ou le suivi. Les paiements déjà affectés sont conservés."
              : "Un impayé est toujours rattaché à un mois précis. Aucune échéance n'est créée automatiquement."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {!contratId && !isEdit && (
            <div className="grid gap-2">
              <Label>Contrat *</Label>
              <SearchableSelect
                value={contrat}
                onChange={setContrat}
                options={contratOptions ?? []}
                placeholder="Rechercher un contrat..."
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Période (mois) *</Label>
              <Input
                type="month"
                value={mois}
                onChange={(e) => setMois(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Date limite de paiement</Label>
              <Input type="date" value={dateEcheance} readOnly disabled />
              <p className="text-xs text-muted-foreground">
                Fixée au {JOUR_ECHEANCE} du mois pour tous les contrats.
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Montant dû *</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Étape de traitement</Label>
              <Select value={etape} onValueChange={setEtape}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ETAPE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Service en charge</Label>
              <Select value={service} onValueChange={setService}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="recouvrement">Recouvrement</SelectItem>
                  <SelectItem value="juridique">Juridique</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <div>
            {isEdit && canDelete && (
              <Button variant="destructive" onClick={handleDelete} disabled={saving}>
                Supprimer
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Enregistrement..." : isEdit ? "Enregistrer les modifications" : "Enregistrer l'impayé"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

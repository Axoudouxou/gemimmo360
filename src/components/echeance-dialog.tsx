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
import { ETAPE_LABELS } from "@/lib/echeance-statut";

const monthNow = () => new Date().toISOString().slice(0, 7);

export function EcheanceDialog({
  open,
  onOpenChange,
  contratId,
  contratOptions,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contratId?: string;
  contratOptions?: { value: string; label: string }[];
  onSaved?: () => void;
}) {
  const [contrat, setContrat] = useState(contratId ?? "");
  const [mois, setMois] = useState(monthNow());
  const [dateEcheance, setDateEcheance] = useState(`${monthNow()}-01`);
  const [montant, setMontant] = useState("");
  const [etape, setEtape] = useState("recouvrement");
  const [service, setService] = useState("recouvrement");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setContrat(contratId ?? "");
    setMois(monthNow());
    setDateEcheance(`${monthNow()}-01`);
    setMontant("");
    setEtape("recouvrement");
    setService("recouvrement");
    setNotes("");
  }, [open, contratId]);

  // Pré-remplit le montant avec le loyer du contrat sélectionné
  useEffect(() => {
    if (!open || !contrat) return;
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

    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase.from("echeances").insert({
      contrat_id: contrat,
      periode: `${mois}-01`,
      date_echeance: dateEcheance || `${mois}-01`,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Saisir un impayé</DialogTitle>
          <DialogDescription>
            Un impayé est toujours rattaché à un mois précis. Aucune échéance n'est créée
            automatiquement.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {!contratId && (
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
                onChange={(e) => {
                  setMois(e.target.value);
                  if (e.target.value) setDateEcheance(`${e.target.value}-01`);
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label>Date d'échéance *</Label>
              <Input type="date" value={dateEcheance} onChange={(e) => setDateEcheance(e.target.value)} />
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Enregistrement..." : "Enregistrer l'impayé"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { fmtDate, fmtMoney, fmtPeriode } from "@/lib/echeance-statut";

type Echeance = { id: string; periode: string; montant_du: number; montant_affecte: number };
type Affectation = { id: string; echeance_id: string; montant: number };

export function ReaffectationDialog({
  open,
  onOpenChange,
  paiement,
  contratId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  paiement: { id: string; montant: number; date_paiement: string } | null;
  contratId: string;
  onSaved?: () => void;
}) {
  const [echeances, setEcheances] = useState<Echeance[]>([]);
  const [affectations, setAffectations] = useState<Affectation[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [historique, setHistorique] = useState<
    { id: string; action: string; ancienne_valeur: string | null; nouvelle_valeur: string | null; created_at: string }[]
  >([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!paiement) return;
    const [{ data: eData }, { data: aData }, { data: hData }] = await Promise.all([
      supabase
        .from("echeances")
        .select("id, periode, montant_du, montant_affecte")
        .eq("contrat_id", contratId)
        .order("periode", { ascending: true }),
      supabase.from("affectations").select("id, echeance_id, montant").eq("paiement_id", paiement.id),
      supabase
        .from("affectations_historique")
        .select("id, action, ancienne_valeur, nouvelle_valeur, created_at")
        .eq("paiement_id", paiement.id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    const ech = (eData ?? []) as Echeance[];
    const aff = (aData ?? []) as Affectation[];
    setEcheances(ech);
    setAffectations(aff);
    setHistorique((hData ?? []) as typeof historique);
    const v: Record<string, string> = {};
    for (const a of aff) v[a.echeance_id] = String(Number(a.montant));
    setValues(v);
  }, [contratId, paiement]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const total = useMemo(
    () => Object.values(values).reduce((s, x) => s + Number(x || 0), 0),
    [values],
  );

  const handleSave = async () => {
    if (!paiement) return;
    if (total > Number(paiement.montant) + 0.001)
      return toast.error("Le total affecté dépasse le montant du paiement");

    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const byEcheance = new Map(affectations.map((a) => [a.echeance_id, a]));

    for (const e of echeances) {
      const target = Number(values[e.id] || 0);
      const existing = byEcheance.get(e.id);
      if (existing && target <= 0) {
        const { error } = await supabase.from("affectations").delete().eq("id", existing.id);
        if (error) { setSaving(false); return toast.error(error.message); }
      } else if (existing && Math.abs(target - Number(existing.montant)) > 0.001) {
        const { error } = await supabase
          .from("affectations")
          .update({ montant: target })
          .eq("id", existing.id);
        if (error) { setSaving(false); return toast.error(error.message); }
      } else if (!existing && target > 0) {
        const { error } = await supabase.from("affectations").insert({
          paiement_id: paiement.id,
          echeance_id: e.id,
          montant: target,
          mode: "manuel",
          created_by: userRes.user?.id ?? null,
        });
        if (error) { setSaving(false); return toast.error(error.message); }
      }
    }

    setSaving(false);
    toast.success("Affectation mise à jour");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Réaffecter un paiement</DialogTitle>
          <DialogDescription>
            {paiement
              ? `Paiement du ${fmtDate(paiement.date_paiement)} — ${fmtMoney(paiement.montant)}. Chaque modification est tracée.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Période</TableHead>
              <TableHead>Dû</TableHead>
              <TableHead>Déjà affecté (tous paiements)</TableHead>
              <TableHead>Montant de ce paiement</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {echeances.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="capitalize">{fmtPeriode(e.periode)}</TableCell>
                <TableCell>{fmtMoney(e.montant_du)}</TableCell>
                <TableCell>{fmtMoney(e.montant_affecte)}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="h-8 w-32"
                    value={values[e.id] ?? ""}
                    onChange={(ev) => setValues({ ...values, [e.id]: ev.target.value })}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <p className="text-sm text-muted-foreground">
          Total affecté : {fmtMoney(total)} — reliquat :{" "}
          {fmtMoney(Math.max(0, Number(paiement?.montant ?? 0) - total))}
        </p>

        {historique.length > 0 && (
          <div className="rounded-md border p-3">
            <p className="mb-2 text-sm font-medium">Historique des affectations</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {historique.map((h) => (
                <li key={h.id}>
                  {fmtDate(h.created_at)} — {h.action} : {h.ancienne_valeur ?? "—"} →{" "}
                  {h.nouvelle_valeur ?? "—"}
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

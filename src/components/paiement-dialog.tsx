import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { MOYENS_PAIEMENT, fmtMoney, fmtPeriode } from "@/lib/echeance-statut";

type EcheanceRow = {
  id: string;
  periode: string;
  date_echeance: string;
  montant_du: number;
  montant_affecte: number;
  statut: string;
};

export function PaiementDialog({
  open,
  onOpenChange,
  contratId,
  contratOptions,
  isAdmin = false,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contratId?: string;
  contratOptions?: { value: string; label: string }[];
  isAdmin?: boolean;
  onSaved?: () => void;
}) {
  const [contrat, setContrat] = useState(contratId ?? "");
  const [montant, setMontant] = useState("");
  const [datePaiement, setDatePaiement] = useState(new Date().toISOString().slice(0, 10));
  const [moyen, setMoyen] = useState("virement");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [manuel, setManuel] = useState(false);
  const [manualAlloc, setManualAlloc] = useState<Record<string, string>>({});
  const [echeances, setEcheances] = useState<EcheanceRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setContrat(contratId ?? "");
      setMontant("");
      setDatePaiement(new Date().toISOString().slice(0, 10));
      setMoyen("virement");
      setReference("");
      setNotes("");
      setManuel(false);
      setManualAlloc({});
    }
  }, [open, contratId]);

  useEffect(() => {
    if (!open || !contrat) { setEcheances([]); return; }
    (async () => {
      const { data } = await supabase
        .from("echeances")
        .select("id, periode, date_echeance, montant_du, montant_affecte, statut")
        .eq("contrat_id", contrat)
        .neq("statut", "solde")
        .order("periode", { ascending: true });
      setEcheances((data ?? []) as EcheanceRow[]);
    })();
  }, [open, contrat]);

  const restantes = useMemo(
    () =>
      echeances
        .map((e) => ({ ...e, restant: Number(e.montant_du) - Number(e.montant_affecte) }))
        .filter((e) => e.restant > 0),
    [echeances],
  );

  const fifo = useMemo(() => {
    let reste = Number(montant || 0);
    const rows: { echeance: (typeof restantes)[number]; part: number }[] = [];
    for (const e of restantes) {
      if (reste <= 0) break;
      const part = Math.min(reste, e.restant);
      rows.push({ echeance: e, part });
      reste -= part;
    }
    return { rows, reliquat: Math.max(0, reste) };
  }, [montant, restantes]);

  const manualTotal = useMemo(
    () => Object.values(manualAlloc).reduce((s, v) => s + Number(v || 0), 0),
    [manualAlloc],
  );

  const handleSave = async () => {
    if (!contrat) return toast.error("Le contrat est obligatoire");
    const m = Number(montant);
    if (!m || m <= 0) return toast.error("Le montant doit être supérieur à 0");
    if (manuel && manualTotal > m + 0.001)
      return toast.error("Le total affecté dépasse le montant du paiement");

    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { data: paiement, error } = await supabase
      .from("paiements")
      .insert({
        contrat_id: contrat,
        montant: m,
        date_paiement: datePaiement,
        moyen_paiement: moyen,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        created_by: userRes.user?.id ?? null,
      })
      .select("id")
      .single();

    if (error || !paiement) {
      setSaving(false);
      return toast.error(error?.message ?? "Erreur d'enregistrement");
    }

    if (manuel) {
      const rows = Object.entries(manualAlloc)
        .filter(([, v]) => Number(v || 0) > 0)
        .map(([echeance_id, v]) => ({
          paiement_id: paiement.id,
          echeance_id,
          montant: Number(v),
          mode: "manuel",
          created_by: userRes.user?.id ?? null,
        }));
      if (rows.length) {
        const { error: aErr } = await supabase.from("affectations").insert(rows);
        if (aErr) {
          setSaving(false);
          return toast.error(aErr.message);
        }
      }
    } else {
      const { error: fErr } = await supabase.rpc("affecter_paiement_fifo", {
        _paiement_id: paiement.id,
      });
      if (fErr) {
        setSaving(false);
        return toast.error(fErr.message);
      }
    }

    setSaving(false);
    toast.success("Paiement enregistré et affecté");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enregistrer un paiement</DialogTitle>
          <DialogDescription>
            Le montant solde d'abord l'échéance non réglée la plus ancienne (FIFO), puis les suivantes.
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
              <Label>Montant *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Date du paiement *</Label>
              <Input type="date" value={datePaiement} onChange={(e) => setDatePaiement(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Moyen de paiement</Label>
              <Select value={moyen} onValueChange={setMoyen}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MOYENS_PAIEMENT.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Référence</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="N° de chèque, transaction..."
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {isAdmin && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={manuel ? "default" : "outline"}
                size="sm"
                onClick={() => setManuel((v) => !v)}
              >
                {manuel ? "Affectation manuelle activée" : "Affecter manuellement (admin)"}
              </Button>
            </div>
          )}

          <div className="rounded-md border p-3">
            <p className="mb-2 text-sm font-medium">
              {manuel ? "Affectation manuelle" : "Aperçu de l'affectation FIFO"}
            </p>
            {!contrat ? (
              <p className="text-sm text-muted-foreground">Sélectionnez un contrat.</p>
            ) : restantes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune échéance non soldée : le paiement restera en avance non affectée.
              </p>
            ) : manuel ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Période</TableHead>
                    <TableHead>Restant dû</TableHead>
                    <TableHead>Montant à affecter</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {restantes.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{fmtPeriode(e.periode)}</TableCell>
                      <TableCell>{fmtMoney(e.restant)}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max={e.restant}
                          step="0.01"
                          className="h-8 w-32"
                          value={manualAlloc[e.id] ?? ""}
                          onChange={(ev) =>
                            setManualAlloc({ ...manualAlloc, [e.id]: ev.target.value })
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : fifo.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Saisissez un montant pour voir l'affectation.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Période</TableHead>
                    <TableHead>Restant dû</TableHead>
                    <TableHead>Affecté</TableHead>
                    <TableHead>Après</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fifo.rows.map(({ echeance, part }) => (
                    <TableRow key={echeance.id}>
                      <TableCell>{fmtPeriode(echeance.periode)}</TableCell>
                      <TableCell>{fmtMoney(echeance.restant)}</TableCell>
                      <TableCell className="font-medium">{fmtMoney(part)}</TableCell>
                      <TableCell>
                        {echeance.restant - part <= 0 ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">Soldée</Badge>
                        ) : (
                          fmtMoney(echeance.restant - part)
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {!manuel && fifo.reliquat > 0 && (
              <p className="mt-2 text-sm text-amber-700">
                Reliquat non affecté (avance) : {fmtMoney(fifo.reliquat)}
              </p>
            )}
            {manuel && (
              <p className="mt-2 text-sm text-muted-foreground">
                Total affecté : {fmtMoney(manualTotal)} — reliquat :{" "}
                {fmtMoney(Math.max(0, Number(montant || 0) - manualTotal))}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Enregistrement..." : "Enregistrer le paiement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

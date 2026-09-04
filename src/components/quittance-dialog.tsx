import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { generateQuittanceDocx } from "@/lib/quittance-docx";
import {
  MOYENS_PAIEMENT,
  dateEcheanceForPeriode,
  fmtMoney,
  fmtPeriode,
  JOUR_ECHEANCE,
} from "@/lib/echeance-statut";

const MOYEN_LABELS: Record<string, string> = Object.fromEntries(
  MOYENS_PAIEMENT.map((m) => [m.value, m.label]),
);

const monthNow = () => new Date().toISOString().slice(0, 7);

type EchRow = {
  id: string;
  periode: string;
  montant_du: number | string;
  montant_affecte: number | string;
};

export function QuittanceDialog({
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
  const [montant, setMontant] = useState("");
  const [loyer, setLoyer] = useState<number | null>(null);
  const [datePaiement, setDatePaiement] = useState(new Date().toISOString().slice(0, 10));
  const [moyen, setMoyen] = useState("especes");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [antérieurs, setAnterieurs] = useState<EchRow[]>([]);
  const [warnOpen, setWarnOpen] = useState(false);
  const [infos, setInfos] = useState<{ locataire: string; bien: string; lot: string | null }>({
    locataire: "—",
    bien: "—",
    lot: null,
  });

  useEffect(() => {
    if (!open) return;
    setContrat(contratId ?? "");
    setMois(monthNow());
    setMontant("");
    setDatePaiement(new Date().toISOString().slice(0, 10));
    setMoyen("especes");
    setReference("");
    setAnterieurs([]);
  }, [open, contratId]);

  // Loyer + infos locataire/bien/lot
  useEffect(() => {
    if (!open || !contrat) return;
    (async () => {
      const { data } = await supabase
        .from("contrats")
        .select("loyer_mensuel, locataire_id, lots(label, biens(titre, adresse))")
        .eq("id", contrat)
        .maybeSingle();
      const lot = (data as { lots?: { label?: string; biens?: { titre?: string; adresse?: string | null } } } | null)?.lots;
      let locataire = "—";
      if (data?.locataire_id) {
        const { data: ct } = await supabase
          .from("contacts")
          .select("nom, prenom")
          .eq("id", data.locataire_id)
          .maybeSingle();
        if (ct) locataire = `${ct.nom}${ct.prenom ? ` ${ct.prenom}` : ""}`;
      }
      setInfos({
        locataire,
        bien: [lot?.biens?.titre, lot?.biens?.adresse].filter(Boolean).join(", ") || "—",
        lot: lot?.label ?? null,
      });
      const l = data?.loyer_mensuel != null ? Number(data.loyer_mensuel) : null;
      setLoyer(l);
      if (l != null) setMontant((m) => m || String(l));
    })();
  }, [open, contrat]);

  // Impayés antérieurs non soldés
  useEffect(() => {
    if (!open || !contrat || !mois) { setAnterieurs([]); return; }
    (async () => {
      const { data } = await supabase
        .from("echeances")
        .select("id, periode, montant_du, montant_affecte")
        .eq("contrat_id", contrat)
        .lt("periode", `${mois}-01`)
        .order("periode", { ascending: true });
      setAnterieurs(
        ((data ?? []) as EchRow[]).filter(
          (e) => Number(e.montant_du) - Number(e.montant_affecte) > 0,
        ),
      );
    })();
  }, [open, contrat, mois]);

  const submit = useCallback(async () => {
    const m = Number(montant);
    setSaving(true);
    try {
      const periode = `${mois}-01`;
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id ?? null;

      // 1. Échéance du mois (créée si absente)
      const { data: existing } = await supabase
        .from("echeances")
        .select("id, periode, montant_du, montant_affecte")
        .eq("contrat_id", contrat)
        .eq("periode", periode)
        .maybeSingle();

      let echeanceId: string;
      let reste: number;
      if (existing) {
        echeanceId = existing.id;
        reste = Number(existing.montant_du) - Number(existing.montant_affecte);
        if (reste <= 0) {
          toast.error("Cette période est déjà entièrement soldée. Utilisez le bouton Quittance de la fiche.");
          setSaving(false);
          return;
        }
        if (m < reste) {
          toast.error(
            `Le montant saisi (${fmtMoney(m)}) ne solde pas la période : il reste ${fmtMoney(reste)} dû.`,
          );
          setSaving(false);
          return;
        }
      } else {
        const { data: created, error: cErr } = await supabase
          .from("echeances")
          .insert({
            contrat_id: contrat,
            periode,
            date_echeance: dateEcheanceForPeriode(mois),
            montant_du: m,
            statut: "impaye",
            etape_traitement: "recouvrement",
            service_en_charge: "recouvrement",
            created_by: uid,
          })
          .select("id")
          .single();
        if (cErr || !created) throw new Error(cErr?.message ?? "Création de l'échéance impossible");
        echeanceId = created.id;
        reste = m;
      }

      // 2. Paiement
      const { data: paiement, error: pErr } = await supabase
        .from("paiements")
        .insert({
          contrat_id: contrat,
          montant: m,
          date_paiement: datePaiement,
          moyen_paiement: moyen,
          reference: reference.trim() || null,
          notes: `Quittance ${fmtPeriode(periode)}`,
          created_by: uid,
        })
        .select("id")
        .single();
      if (pErr || !paiement) throw new Error(pErr?.message ?? "Enregistrement du paiement impossible");

      // 3. Affectation manuelle à cette échéance
      const { error: aErr } = await supabase.from("affectations").insert({
        paiement_id: paiement.id,
        echeance_id: echeanceId,
        montant: Math.min(m, reste),
        mode: "manuel",
        created_by: uid,
      });
      if (aErr) throw new Error(aErr.message);

      // 4. Quittance
      const { data: q, error: qErr } = await supabase.rpc("emettre_quittance", {
        _echeance_id: echeanceId,
        _date_reglement: datePaiement,
        _mode_reglement: MOYEN_LABELS[moyen] ?? moyen,
        _locataire: infos.locataire,
        _bien: infos.bien,
        _lot: infos.lot ?? "",
      });
      if (qErr || !q) throw new Error(qErr?.message ?? "Émission de la quittance impossible");
      const quittance = q as unknown as {
        numero_affiche: string;
        montant: number;
        date_reglement: string;
        mode_reglement: string | null;
      };
      await generateQuittanceDocx({
        numero: quittance.numero_affiche,
        dateEmission: quittance.date_reglement,
        locataire: infos.locataire,
        bien: infos.bien,
        lot: infos.lot,
        periodeLabel: fmtPeriode(periode),
        montant: Number(quittance.montant),
        modeReglement: quittance.mode_reglement ?? "—",
        resteAPayer: 0,
      });
      toast.success(`Quittance N° ${quittance.numero_affiche} générée`);
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }, [contrat, mois, montant, datePaiement, moyen, reference, infos, onOpenChange, onSaved]);

  const handleValidate = () => {
    if (!contrat) return toast.error("Le contrat est obligatoire");
    if (!mois) return toast.error("La période (mois) est obligatoire");
    const m = Number(montant);
    if (!m || m <= 0) return toast.error("Le montant doit être supérieur à 0");
    if (!datePaiement) return toast.error("La date de paiement est obligatoire");
    if (antérieurs.length > 0) return setWarnOpen(true);
    submit();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Générer une quittance</DialogTitle>
            <DialogDescription>
              Enregistre le paiement du mois choisi et produit la quittance correspondante.
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
                <Label>Mois quittancé *</Label>
                <Input type="month" value={mois} onChange={(e) => setMois(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  Échéance fixée au {JOUR_ECHEANCE} du mois.
                </p>
              </div>
              <div className="grid gap-2">
                <Label>Montant payé *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                />
                {loyer != null && (
                  <p className="text-xs text-muted-foreground">
                    Loyer du contrat : {fmtMoney(loyer)}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Date de paiement *</Label>
                <Input
                  type="date"
                  value={datePaiement}
                  onChange={(e) => setDatePaiement(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Mode de règlement</Label>
                <Select value={moyen} onValueChange={setMoyen}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MOYENS_PAIEMENT.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Référence</Label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="N° de chèque, transaction..."
              />
            </div>

            {antérieurs.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <p className="font-medium text-destructive">
                  {antérieurs.length} mois antérieur{antérieurs.length > 1 ? "s" : ""} non soldé
                  {antérieurs.length > 1 ? "s" : ""}
                </p>
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  {antérieurs.map((e) => (
                    <li key={e.id} className="capitalize">
                      {fmtPeriode(e.periode)} —{" "}
                      {fmtMoney(Number(e.montant_du) - Number(e.montant_affecte))} restant
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button onClick={handleValidate} disabled={saving}>
              {saving ? "Génération..." : "Valider et générer la quittance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={warnOpen} onOpenChange={setWarnOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Impayé antérieur non soldé</AlertDialogTitle>
            <AlertDialogDescription>
              Ce contrat a un impayé de{" "}
              <span className="capitalize">{antérieurs.map((e) => fmtPeriode(e.periode)).join(", ")}</span>{" "}
              non soldé. Voulez-vous d'abord affecter ce paiement à cet impayé (via « Enregistrer un
              paiement »), ou continuer et quittancer {fmtPeriode(`${mois}-01`)} ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Revenir à l'affectation</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); setWarnOpen(false); submit(); }}
              disabled={saving}
            >
              Continuer quand même
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

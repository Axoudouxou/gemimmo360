import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

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

const STATUT_LABEL: Record<string, string> = {
  a_jour: "À jour",
  en_retard: "En retard",
  relance_envoyee: "Relance envoyée",
};

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
const fmtMoney = (n: number | null) => (n == null ? "—" : Number(n).toLocaleString("fr-FR") + " FCFA");

type Props = {
  impaye: Impaye | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export function ImpayeDetailDialog({ impaye, open, onOpenChange }: Props) {
  const [details, setDetails] = useState<Details>({ contrat: null, lot: null, bien: null, locataire: null });

  useEffect(() => {
    if (!open || !impaye) return;
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
        const { data: l } = await supabase.from("lots").select("id, label, bien_id").eq("id", c.lot_id).maybeSingle();
        lot = (l ?? null) as Details["lot"];
        if (l) {
          const { data: b } = await supabase.from("biens").select("id, titre").eq("id", l.bien_id).maybeSingle();
          bien = (b ?? null) as Details["bien"];
        }
        if (c.locataire_id) {
          const { data: loc } = await supabase.from("contacts").select("id, nom, prenom").eq("id", c.locataire_id).maybeSingle();
          locataire = (loc ?? null) as Details["locataire"];
        }
      }
      setDetails({ contrat: (c ?? null) as Details["contrat"], lot, bien, locataire });
    })();
  }, [open, impaye]);

  if (!impaye) return null;
  const reste = Number(impaye.montant_du) - Number(impaye.montant_paye);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
                <Link to="/contrats/$contratId" params={{ contratId: details.contrat.id }} className="underline">
                  Voir contrat
                </Link>
              ) : "—"}
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Lot</div>
              {details.lot ? (
                <Link to="/lots/$lotId" params={{ lotId: details.lot.id }} className="underline">
                  {details.lot.label}
                </Link>
              ) : "—"}
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Bien</div>
              {details.bien ? (
                <Link to="/biens/$bienId" params={{ bienId: details.bien.id }} className="underline">
                  {details.bien.titre}
                </Link>
              ) : "—"}
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Locataire</div>
              {details.locataire ? (
                <Link to="/contacts/$contactId" params={{ contactId: details.locataire.id }} className="underline">
                  {details.locataire.nom}{details.locataire.prenom ? ` ${details.locataire.prenom}` : ""}
                </Link>
              ) : "—"}
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
              <div className={"font-medium " + (reste > 0 ? "text-destructive" : "text-emerald-600")}>{fmtMoney(reste)}</div>
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
              <div className="whitespace-pre-wrap rounded-md border p-3 bg-muted/20">{impaye.notes}</div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

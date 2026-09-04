import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Plus } from "lucide-react";
import { PaiementDialog } from "@/components/paiement-dialog";
import { EcheanceDialog } from "@/components/echeance-dialog";
import { ReaffectationDialog } from "@/components/reaffectation-dialog";
import {
  computeEcheanceStatut,
  fmtDate,
  fmtMoney,
  fmtPeriode,
} from "@/lib/echeance-statut";

type Echeance = {
  id: string;
  periode: string;
  date_echeance: string;
  montant_du: number;
  montant_affecte: number;
  statut: string;
  etape_traitement: string | null;
};
type Paiement = {
  id: string;
  date_paiement: string;
  montant: number;
  moyen_paiement: string;
  reference: string | null;
};
type Affectation = { paiement_id: string; echeance_id: string; montant: number };

type LedgerLine = {
  date: string;
  designation: string;
  periode: string;
  debit: number;
  credit: number;
};

export function SituationLocative({
  contratId,
  canWrite = false,
  isAdmin = false,
  title = "Situation locative",
}: {
  contratId: string;
  canWrite?: boolean;
  isAdmin?: boolean;
  title?: string;
}) {
  const [echeances, setEcheances] = useState<Echeance[]>([]);
  const [paiements, setPaiements] = useState<Paiement[]>([]);
  const [affectations, setAffectations] = useState<Affectation[]>([]);
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);
  const [echOpen, setEchOpen] = useState(false);
  const [reaff, setReaff] = useState<Paiement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: eData }, { data: pData }] = await Promise.all([
      supabase
        .from("echeances")
        .select("id, periode, date_echeance, montant_du, montant_affecte, statut, etape_traitement")
        .eq("contrat_id", contratId)
        .order("periode", { ascending: false }),
      supabase
        .from("paiements")
        .select("id, date_paiement, montant, moyen_paiement, reference")
        .eq("contrat_id", contratId)
        .order("date_paiement", { ascending: false }),
    ]);
    const ech = (eData ?? []) as Echeance[];
    const pay = (pData ?? []) as Paiement[];
    setEcheances(ech);
    setPaiements(pay);
    if (pay.length) {
      const { data: aData } = await supabase
        .from("affectations")
        .select("paiement_id, echeance_id, montant")
        .in("paiement_id", pay.map((p) => p.id));
      setAffectations((aData ?? []) as Affectation[]);
    } else {
      setAffectations([]);
    }
    setLoading(false);
  }, [contratId]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const du = echeances.reduce((s, e) => s + Number(e.montant_du), 0);
    const affecte = echeances.reduce((s, e) => s + Number(e.montant_affecte), 0);
    const encaisse = paiements.reduce((s, p) => s + Number(p.montant), 0);
    const affTotal = affectations.reduce((s, a) => s + Number(a.montant), 0);
    return { du, affecte, encaisse, solde: du - affecte, avance: Math.max(0, encaisse - affTotal) };
  }, [echeances, paiements, affectations]);

  const ledger = useMemo<LedgerLine[]>(() => {
    const lines: LedgerLine[] = [];
    for (const e of echeances) {
      lines.push({
        date: e.date_echeance,
        designation: "Loyer",
        periode: fmtPeriode(e.periode),
        debit: Number(e.montant_du),
        credit: 0,
      });
    }
    const echById = new Map(echeances.map((e) => [e.id, e]));
    for (const p of paiements) {
      const affs = affectations.filter((a) => a.paiement_id === p.id);
      const periodes = affs
        .map((a) => (echById.has(a.echeance_id) ? fmtPeriode(echById.get(a.echeance_id)!.periode) : ""))
        .filter(Boolean)
        .join(", ");
      lines.push({
        date: p.date_paiement,
        designation: `Paiement (${p.moyen_paiement}${p.reference ? ` — ${p.reference}` : ""})`,
        periode: periodes || "Non affecté",
        debit: 0,
        credit: Number(p.montant),
      });
    }
    lines.sort((a, b) => a.date.localeCompare(b.date));
    return lines;
  }, [echeances, paiements, affectations]);

  const exportCsv = () => {
    let solde = 0;
    const header = ["Date", "Désignation", "Période", "Débit", "Crédit", "Solde cumulé"];
    const rows = ledger.map((l) => {
      solde += l.debit - l.credit;
      return [fmtDate(l.date), l.designation, l.periode, l.debit || "", l.credit || "", solde];
    });
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `grand-livre-${contratId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  let running = 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>Échéances, paiements et grand livre du contrat.</CardDescription>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setEchOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Impayé
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPayOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Paiement
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        ) : (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-4">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Total dû</p>
                <p className="text-lg font-semibold">{fmtMoney(totals.du)}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Total payé</p>
                <p className="text-lg font-semibold">{fmtMoney(totals.affecte)}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Solde restant</p>
                <p className={`text-lg font-semibold ${totals.solde > 0 ? "text-destructive" : "text-emerald-600"}`}>
                  {fmtMoney(totals.solde)}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Avance non affectée</p>
                <p className="text-lg font-semibold">{fmtMoney(totals.avance)}</p>
              </div>
            </div>

            <Tabs defaultValue="periodes">
              <TabsList>
                <TabsTrigger value="periodes">Détail par période</TabsTrigger>
                <TabsTrigger value="paiements">Paiements</TabsTrigger>
                <TabsTrigger value="livre">Grand livre</TabsTrigger>
              </TabsList>

              <TabsContent value="periodes">
                {echeances.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune échéance.</p>
                ) : (
                  <div className="max-h-[420px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Période</TableHead>
                          <TableHead>Échéance</TableHead>
                          <TableHead>Dû</TableHead>
                          <TableHead>Payé</TableHead>
                          <TableHead>Reste</TableHead>
                          <TableHead>Statut</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {echeances.map((e) => {
                          const st = computeEcheanceStatut(e);
                          const reste = Math.max(0, Number(e.montant_du) - Number(e.montant_affecte));
                          return (
                            <TableRow key={e.id}>
                              <TableCell className="capitalize">{fmtPeriode(e.periode)}</TableCell>
                              <TableCell>{fmtDate(e.date_echeance)}</TableCell>
                              <TableCell>{fmtMoney(e.montant_du)}</TableCell>
                              <TableCell>{fmtMoney(e.montant_affecte)}</TableCell>
                              <TableCell className={reste > 0 ? "text-destructive font-medium" : ""}>
                                {fmtMoney(reste)}
                              </TableCell>
                              <TableCell><Badge className={st.className}>{st.emoji} {st.label}</Badge></TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="paiements">
                {paiements.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun paiement enregistré.</p>
                ) : (
                  <div className="max-h-[420px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Montant</TableHead>
                          <TableHead>Moyen</TableHead>
                          <TableHead>Référence</TableHead>
                          <TableHead>Affecté</TableHead>
                          {isAdmin && <TableHead />}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paiements.map((p) => {
                          const aff = affectations
                            .filter((a) => a.paiement_id === p.id)
                            .reduce((s, a) => s + Number(a.montant), 0);
                          return (
                            <TableRow key={p.id}>
                              <TableCell>{fmtDate(p.date_paiement)}</TableCell>
                              <TableCell>{fmtMoney(p.montant)}</TableCell>
                              <TableCell>{p.moyen_paiement}</TableCell>
                              <TableCell>{p.reference ?? "—"}</TableCell>
                              <TableCell>{fmtMoney(aff)}</TableCell>
                              {isAdmin && (
                                <TableCell className="text-right">
                                  <Button variant="outline" size="sm" onClick={() => setReaff(p)}>
                                    Réaffecter
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="livre">
                <div className="mb-2 flex justify-end">
                  <Button variant="outline" size="sm" onClick={exportCsv} disabled={ledger.length === 0}>
                    <Download className="mr-2 h-4 w-4" /> Exporter (CSV)
                  </Button>
                </div>
                {ledger.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun mouvement.</p>
                ) : (
                  <div className="max-h-[420px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Désignation</TableHead>
                          <TableHead>Période</TableHead>
                          <TableHead>Débit</TableHead>
                          <TableHead>Crédit</TableHead>
                          <TableHead>Solde cumulé</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ledger.map((l, idx) => {
                          running += l.debit - l.credit;
                          return (
                            <TableRow key={idx}>
                              <TableCell>{fmtDate(l.date)}</TableCell>
                              <TableCell>{l.designation}</TableCell>
                              <TableCell className="capitalize">{l.periode}</TableCell>
                              <TableCell>{l.debit ? fmtMoney(l.debit) : "—"}</TableCell>
                              <TableCell>{l.credit ? fmtMoney(l.credit) : "—"}</TableCell>
                              <TableCell className={running > 0 ? "text-destructive" : "text-emerald-600"}>
                                {fmtMoney(running)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </CardContent>

      <EcheanceDialog
        open={echOpen}
        onOpenChange={setEchOpen}
        contratId={contratId}
        onSaved={load}
      />

      <PaiementDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        contratId={contratId}
        onSaved={load}
      />

      <ReaffectationDialog
        open={!!reaff}
        onOpenChange={(o) => !o && setReaff(null)}
        paiement={reaff}
        contratId={contratId}
        onSaved={load}
      />
    </Card>
  );
}

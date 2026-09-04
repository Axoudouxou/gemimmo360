import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Download, FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PaiementDialog } from "@/components/paiement-dialog";
import { EcheanceDialog, type EcheanceRow } from "@/components/echeance-dialog";
import { ReaffectationDialog } from "@/components/reaffectation-dialog";
import { QuittanceDialog } from "@/components/quittance-dialog";
import { generateQuittanceDocx } from "@/lib/quittance-docx";
import {
  computeEcheanceStatut,
  MOYENS_PAIEMENT,
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
const MOYEN_LABELS: Record<string, string> = Object.fromEntries(
  MOYENS_PAIEMENT.map((m) => [m.value, m.label]),
);

type Quittance = { echeance_id: string; numero_affiche: string; date_reglement: string };

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
  const [editEch, setEditEch] = useState<EcheanceRow | null>(null);
  const [delPay, setDelPay] = useState<Paiement | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [quittances, setQuittances] = useState<Quittance[]>([]);
  const [quittanceBusy, setQuittanceBusy] = useState<string | null>(null);
  const [quittanceOpen, setQuittanceOpen] = useState(false);
  const [infos, setInfos] = useState<{ locataire: string; bien: string; lot: string | null }>({
    locataire: "—",
    bien: "—",
    lot: null,
  });



  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: eData }, { data: pData }] = await Promise.all([
      supabase
        .from("echeances")
        .select("id, contrat_id, periode, date_echeance, montant_du, montant_affecte, statut, etape_traitement, service_en_charge, notes")
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
    const { data: qData } = await supabase
      .from("quittances")
      .select("echeance_id, numero_affiche, date_reglement")
      .eq("contrat_id", contratId);
    setQuittances((qData ?? []) as Quittance[]);

    const { data: cData } = await supabase
      .from("contrats")
      .select("locataire_id, lots(label, biens(titre, adresse))")
      .eq("id", contratId)
      .maybeSingle();
    const lot = (cData as { lots?: { label?: string; biens?: { titre?: string; adresse?: string | null } } } | null)?.lots;
    let locataire = "—";
    if (cData?.locataire_id) {
      const { data: ct } = await supabase
        .from("contacts")
        .select("nom, prenom")
        .eq("id", cData.locataire_id)
        .maybeSingle();
      if (ct) locataire = `${ct.nom}${ct.prenom ? ` ${ct.prenom}` : ""}`;
    }
    setInfos({
      locataire,
      bien: [lot?.biens?.titre, lot?.biens?.adresse].filter(Boolean).join(", ") || "—",
      lot: lot?.label ?? null,
    });
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

  const handleDeletePaiement = async () => {
    if (!delPay) return;
    setDeleting(true);
    const { error } = await supabase.from("paiements").delete().eq("id", delPay.id);
    setDeleting(false);
    if (error) return toast.error(error.message);
    toast.success("Paiement supprimé");
    setDelPay(null);
    load();
  };

  const quittanceById = useMemo(() => new Map(quittances.map((q) => [q.echeance_id, q])), [quittances]);

  const paiementById = useMemo(() => new Map(paiements.map((p) => [p.id, p])), [paiements]);

  /** Date réelle de règlement de la période = date du dernier paiement affecté à cette échéance. */
  const reglementDe = useCallback(
    (echeanceId: string) => {
      const liees = affectations
        .filter((a) => a.echeance_id === echeanceId)
        .map((a) => paiementById.get(a.paiement_id))
        .filter(Boolean) as Paiement[];
      if (!liees.length) return null;
      const dernier = [...liees].sort((a, b) => a.date_paiement.localeCompare(b.date_paiement)).at(-1)!;
      return dernier;
    },
    [affectations, paiementById],
  );

  const handleQuittance = async (e: Echeance) => {
    const reste = Number(e.montant_du) - Number(e.montant_affecte);
    if (reste > 0) return toast.error("La période n'est pas intégralement soldée.");
    const dernier = reglementDe(e.id);
    if (!dernier) return toast.error("Aucun paiement affecté à cette période.");
    setQuittanceBusy(e.id);
    const { data, error } = await supabase.rpc("emettre_quittance", {
      _echeance_id: e.id,
      _date_reglement: dernier.date_paiement,
      _mode_reglement: MOYEN_LABELS[dernier.moyen_paiement] ?? dernier.moyen_paiement,
      _locataire: infos.locataire,
      _bien: infos.bien,
      _lot: infos.lot ?? "",
    });
    if (error || !data) {
      setQuittanceBusy(null);
      return toast.error(error?.message ?? "Émission impossible");
    }
    const q = data as unknown as {
      numero_affiche: string;
      montant: number;
      date_reglement: string;
      mode_reglement: string | null;
    };
    await generateQuittanceDocx({
      numero: q.numero_affiche,
      dateEmission: q.date_reglement,
      locataire: infos.locataire,
      bien: infos.bien,
      lot: infos.lot,
      periodeLabel: fmtPeriode(e.periode),
      montant: Number(q.montant),
      modeReglement: q.mode_reglement ?? "—",
      resteAPayer: 0,
    });
    setQuittanceBusy(null);
    toast.success(`Quittance N° ${q.numero_affiche} générée`);
    load();
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
            <Button size="sm" variant="outline" onClick={() => setQuittanceOpen(true)}>
              <FileText className="mr-2 h-4 w-4" /> Générer quittance
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
                          <TableHead>Quittance</TableHead>
                          {canWrite && <TableHead className="text-right">Actions</TableHead>}
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
                              <TableCell className="whitespace-nowrap">
                                {reste === 0 && Number(e.montant_du) > 0 ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={quittanceBusy === e.id}
                                    onClick={() => handleQuittance(e)}
                                  >
                                    <FileText className="mr-2 h-4 w-4" />
                                    {quittanceById.get(e.id)
                                      ? `N° ${quittanceById.get(e.id)!.numero_affiche}`
                                      : "Quittance"}
                                  </Button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              {canWrite && (
                                <TableCell className="text-right">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setEditEch(e as unknown as EcheanceRow)}
                                  >
                                    Modifier
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
                                  <div className="flex justify-end gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setReaff(p)}>
                                      Réaffecter
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="text-destructive hover:text-destructive"
                                      onClick={() => setDelPay(p)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
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
        open={!!editEch}
        onOpenChange={(o) => !o && setEditEch(null)}
        contratId={contratId}
        echeance={editEch ? { ...editEch, contrat_id: editEch.contrat_id || contratId } : null}
        canDelete={isAdmin}
        onSaved={load}
      />

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

      <AlertDialog open={!!delPay} onOpenChange={(o) => !o && setDelPay(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce paiement ?</AlertDialogTitle>
            <AlertDialogDescription>
              {delPay && (
                <>
                  Paiement du {fmtDate(delPay.date_paiement)} de {fmtMoney(delPay.montant)}.
                  Ses affectations seront annulées et les impayés concernés redeviendront dus.
                  Cette action est irréversible.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeletePaiement(); }}
              disabled={deleting}
            >
              {deleting ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>

  );
}

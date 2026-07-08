import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Building2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/contrats/$contratId")({
  head: () => ({ meta: [{ title: "Fiche contrat — Agence Immobilière" }] }),
  component: ContratDetailPage,
});

type Contrat = {
  id: string;
  lot_id: string;
  locataire_id: string | null;
  date_debut: string | null;
  date_fin: string | null;
  loyer_mensuel: number | null;
  depot_garantie: number | null;
  statut: string;
  notes: string | null;
};
type Lot = { id: string; label: string; bien_id: string };
type Bien = { id: string; titre: string };
type Locataire = { id: string; nom: string; prenom: string | null; type_entite: string | null; interlocuteur: string | null };
type Impaye = { id: string; montant_du: number; montant_paye: number; date_echeance: string; statut: string };
type Edl = { id: string; type: string; date_realisation: string; observations: string | null };

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
const fmtMoney = (n: number | null) => (n == null ? "—" : Number(n).toLocaleString("fr-FR") + " F");

function ContratDetailPage() {
  const { contratId } = Route.useParams();
  const navigate = useNavigate();
  const [contrat, setContrat] = useState<Contrat | null>(null);
  const [lot, setLot] = useState<Lot | null>(null);
  const [bien, setBien] = useState<Bien | null>(null);
  const [locataire, setLocataire] = useState<Locataire | null>(null);
  const [impayes, setImpayes] = useState<Impaye[]>([]);
  const [edls, setEdls] = useState<Edl[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: c, error } = await supabase.from("contrats").select("*").eq("id", contratId).maybeSingle();
      if (error) toast.error(error.message);
      setContrat((c ?? null) as Contrat | null);
      if (c) {
        const [{ data: l }, { data: iData }, { data: eData }] = await Promise.all([
          supabase.from("lots").select("id, label, bien_id").eq("id", c.lot_id).maybeSingle(),
          supabase.from("impayes").select("id, montant_du, montant_paye, date_echeance, statut").eq("contrat_id", contratId).order("date_echeance", { ascending: false }),
          supabase.from("etats_des_lieux").select("id, type, date_realisation, observations").eq("contrat_id", contratId).order("date_realisation", { ascending: false }),
        ]);
        setLot((l ?? null) as Lot | null);
        setImpayes((iData ?? []) as Impaye[]);
        setEdls((eData ?? []) as Edl[]);
        if (l) {
          const { data: b } = await supabase.from("biens").select("id, titre").eq("id", l.bien_id).maybeSingle();
          setBien((b ?? null) as Bien | null);
        }
        if (c.locataire_id) {
          const { data: loc } = await supabase.from("contacts").select("id, nom, prenom, type_entite, interlocuteur").eq("id", c.locataire_id).maybeSingle();
          setLocataire((loc ?? null) as Locataire | null);
        }
      }
      setLoading(false);
    })();
  }, [contratId]);

  const locName = (l: Locataire) => l.type_entite === "entreprise" ? l.nom : `${l.nom}${l.prenom ? ` ${l.prenom}` : ""}`;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            <span className="font-semibold">Agence Immobilière</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/contrats" })}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Retour aux contrats
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        ) : !contrat ? (
          <p className="text-sm text-muted-foreground">Contrat introuvable.</p>
        ) : (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>Contrat</CardTitle>
                    <CardDescription>
                      {lot && bien ? (
                        <>Lot{" "}
                          <Link to="/lots/$lotId" params={{ lotId: lot.id }} className="underline">{lot.label}</Link>
                          {" "}dans{" "}
                          <Link to="/biens/$bienId" params={{ bienId: bien.id }} className="underline">{bien.titre}</Link>
                        </>
                      ) : "—"}
                    </CardDescription>
                  </div>
                  <Badge>{contrat.statut}</Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Locataire : </span>
                  {locataire ? (
                    <Link to="/contacts/$contactId" params={{ contactId: locataire.id }} className="underline">
                      {locName(locataire)}
                    </Link>
                  ) : "—"}
                </div>
                <div><span className="text-muted-foreground">Loyer mensuel : </span>{fmtMoney(contrat.loyer_mensuel)}</div>
                <div><span className="text-muted-foreground">Dépôt de garantie : </span>{fmtMoney(contrat.depot_garantie)}</div>
                <div><span className="text-muted-foreground">Début : </span>{fmtDate(contrat.date_debut)}</div>
                <div><span className="text-muted-foreground">Fin : </span>{fmtDate(contrat.date_fin)}</div>
                {contrat.notes && <div className="sm:col-span-2"><span className="text-muted-foreground">Notes : </span>{contrat.notes}</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Impayés</CardTitle>
                <CardDescription>Historique des impayés liés à ce contrat.</CardDescription>
              </CardHeader>
              <CardContent>
                {impayes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun impayé.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Échéance</TableHead>
                          <TableHead>Montant dû</TableHead>
                          <TableHead>Payé</TableHead>
                          <TableHead>Statut</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {impayes.map((i) => (
                          <TableRow key={i.id}>
                            <TableCell>{fmtDate(i.date_echeance)}</TableCell>
                            <TableCell>{fmtMoney(i.montant_du)}</TableCell>
                            <TableCell>{fmtMoney(i.montant_paye)}</TableCell>
                            <TableCell><Badge>{i.statut}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>États des lieux</CardTitle>
                <CardDescription>Entrée et sortie du logement.</CardDescription>
              </CardHeader>
              <CardContent>
                {edls.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun état des lieux.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Observations</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {edls.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell><Badge variant="outline">{e.type === "entree" ? "Entrée" : "Sortie"}</Badge></TableCell>
                            <TableCell>{fmtDate(e.date_realisation)}</TableCell>
                            <TableCell>{e.observations ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

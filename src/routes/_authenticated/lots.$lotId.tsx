import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Building2, ArrowLeft, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/lots/$lotId")({
  head: () => ({ meta: [{ title: "Fiche lot — Agence Immobilière" }] }),
  component: LotDetailPage,
});

type Lot = { id: string; bien_id: string; label: string; type_lot: string | null; statut: string; surface: number | null; notes: string | null };
type Bien = { id: string; titre: string; adresse: string | null };
type Contrat = {
  id: string; locataire_id: string | null; date_debut: string | null; date_fin: string | null;
  loyer_mensuel: number | null; statut: string;
};
type Locataire = { id: string; nom: string; prenom: string | null; type_entite: string | null; interlocuteur: string | null };

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
const fmtMoney = (n: number | null) => (n == null ? "—" : Number(n).toLocaleString("fr-FR") + " F");
const locName = (l: Locataire) => l.type_entite === "entreprise" ? l.nom : `${l.nom}${l.prenom ? ` ${l.prenom}` : ""}`;

function LotDetailPage() {
  const { lotId } = Route.useParams();
  const navigate = useNavigate();
  const [lot, setLot] = useState<Lot | null>(null);
  const [bien, setBien] = useState<Bien | null>(null);
  const [contrats, setContrats] = useState<Contrat[]>([]);
  const [locataires, setLocataires] = useState<Map<string, Locataire>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: lData, error: lErr } = await supabase.from("lots").select("*").eq("id", lotId).maybeSingle();
      if (lErr) toast.error(lErr.message);
      const lotData = (lData ?? null) as Lot | null;
      setLot(lotData);

      if (lotData) {
        const [{ data: bData }, { data: cData }] = await Promise.all([
          supabase.from("biens").select("id, titre, adresse").eq("id", lotData.bien_id).maybeSingle(),
          supabase.from("contrats").select("id, locataire_id, date_debut, date_fin, loyer_mensuel, statut").eq("lot_id", lotId).order("date_debut", { ascending: false }),
        ]);
        setBien((bData ?? null) as Bien | null);
        const ctsList = (cData ?? []) as Contrat[];
        setContrats(ctsList);
        const locIds = Array.from(new Set(ctsList.map((c) => c.locataire_id).filter((x): x is string => !!x)));
        if (locIds.length) {
          const { data: locsData } = await supabase.from("contacts").select("id, nom, prenom, type_entite, interlocuteur").in("id", locIds);
          setLocataires(new Map(((locsData ?? []) as Locataire[]).map((x) => [x.id, x])));
        } else setLocataires(new Map());
      }
      setLoading(false);
    })();
  }, [lotId]);

  const actif = contrats.find((c) => c.statut === "actif") ?? null;
  const passes = contrats.filter((c) => c.id !== actif?.id);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            <span className="font-semibold">Agence Immobilière</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/biens" })}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Retour aux biens
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        ) : !lot ? (
          <p className="text-sm text-muted-foreground">Lot introuvable.</p>
        ) : (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3 flex-wrap">
                  <CardTitle>{lot.label}</CardTitle>
                  <Badge>{lot.statut}</Badge>
                </div>
                <CardDescription>
                  {bien ? (
                    <>Rattaché à{" "}
                      <Link to="/biens/$bienId" params={{ bienId: bien.id }} className="underline">{bien.titre}</Link>
                    </>
                  ) : "Bien parent inconnu"}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-3 text-sm">
                <div><span className="text-muted-foreground">Type : </span>{lot.type_lot ?? "—"}</div>
                <div><span className="text-muted-foreground">Surface : </span>{lot.surface ?? "—"}</div>
                {lot.notes && <div className="sm:col-span-3"><span className="text-muted-foreground">Notes : </span>{lot.notes}</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>Contrat en cours</CardTitle>
                  <CardDescription>Contrat actif rattaché à ce lot, s'il existe.</CardDescription>
                </div>
                {!actif && (
                  <Button size="sm" asChild>
                    <Link to="/contrats"><Plus className="mr-2 h-4 w-4" /> Nouveau contrat</Link>
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {!actif ? (
                  <p className="text-sm text-muted-foreground">Aucun contrat actif pour ce lot.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Locataire : </span>
                      {actif.locataire_id && locataires.get(actif.locataire_id) ? (
                        <Link to="/contacts/$contactId" params={{ contactId: actif.locataire_id }} className="underline">
                          {locName(locataires.get(actif.locataire_id)!)}
                        </Link>
                      ) : "—"}
                    </div>
                    <div><span className="text-muted-foreground">Loyer : </span>{fmtMoney(actif.loyer_mensuel)}</div>
                    <div><span className="text-muted-foreground">Début : </span>{fmtDate(actif.date_debut)}</div>
                    <div><span className="text-muted-foreground">Fin : </span>{fmtDate(actif.date_fin)}</div>
                    <div className="sm:col-span-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/contrats/$contratId" params={{ contratId: actif.id }}>Ouvrir le contrat</Link>
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Historique des contrats</CardTitle>
                <CardDescription>Anciens contrats sur ce lot.</CardDescription>
              </CardHeader>
              <CardContent>
                {passes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun contrat précédent.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Locataire</TableHead>
                          <TableHead>Début</TableHead>
                          <TableHead>Fin</TableHead>
                          <TableHead>Loyer</TableHead>
                          <TableHead>Statut</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {passes.map((c) => (
                          <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate({ to: "/contrats/$contratId", params: { contratId: c.id } })}>
                            <TableCell>{c.locataire_id && locataires.get(c.locataire_id) ? locName(locataires.get(c.locataire_id)!) : "—"}</TableCell>
                            <TableCell>{fmtDate(c.date_debut)}</TableCell>
                            <TableCell>{fmtDate(c.date_fin)}</TableCell>
                            <TableCell>{fmtMoney(c.loyer_mensuel)}</TableCell>
                            <TableCell><Badge>{c.statut}</Badge></TableCell>
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

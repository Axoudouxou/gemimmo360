import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/lots/$lotId")({
  head: () => ({ meta: [{ title: "Fiche lot — Agence Immobilière" }] }),
  component: LotDetailPage,
});

type Lot = {
  id: string;
  bien_id: string;
  label: string;
  type_lot: string | null;
  statut: string;
  surface: number | null;
  notes: string | null;
};
type Bien = { id: string; titre: string; adresse: string | null };
type Contrat = {
  id: string;
  locataire_id: string | null;
  date_debut: string | null;
  date_fin: string | null;
  loyer_mensuel: number | null;
  statut: string;
};
type Locataire = { id: string; nom: string; prenom: string | null };

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
const fmtMoney = (n: number | null) => (n == null ? "—" : Number(n).toLocaleString("fr-FR") + " F");

function LotDetailPage() {
  const { lotId } = Route.useParams();
  const navigate = useNavigate();
  const [lot, setLot] = useState<Lot | null>(null);
  const [bien, setBien] = useState<Bien | null>(null);
  const [contrat, setContrat] = useState<Contrat | null>(null);
  const [locataire, setLocataire] = useState<Locataire | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: lData, error: lErr } = await supabase.from("lots").select("*").eq("id", lotId).maybeSingle();
      if (lErr) toast.error(lErr.message);
      setLot((lData ?? null) as Lot | null);

      if (lData) {
        const [{ data: bData }, { data: cData }] = await Promise.all([
          supabase.from("biens").select("id, titre, adresse").eq("id", lData.bien_id).maybeSingle(),
          supabase
            .from("contrats")
            .select("id, locataire_id, date_debut, date_fin, loyer_mensuel, statut")
            .eq("lot_id", lotId)
            .eq("statut", "actif")
            .order("date_debut", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        setBien((bData ?? null) as Bien | null);
        const c = (cData ?? null) as Contrat | null;
        setContrat(c);
        if (c?.locataire_id) {
          const { data: locData } = await supabase
            .from("contacts")
            .select("id, nom, prenom")
            .eq("id", c.locataire_id)
            .maybeSingle();
          setLocataire((locData ?? null) as Locataire | null);
        } else {
          setLocataire(null);
        }
      }
      setLoading(false);
    })();
  }, [lotId]);

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
                <CardTitle>{lot.label}</CardTitle>
                <CardDescription>
                  {bien ? (
                    <>Rattaché à{" "}
                      <Link to="/biens/$bienId" params={{ bienId: bien.id }} className="underline">
                        {bien.titre}
                      </Link>
                    </>
                  ) : "Bien parent inconnu"}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-3 text-sm">
                <div><span className="text-muted-foreground">Type : </span>{lot.type_lot ?? "—"}</div>
                <div><span className="text-muted-foreground">Statut : </span><Badge>{lot.statut}</Badge></div>
                <div><span className="text-muted-foreground">Surface : </span>{lot.surface ?? "—"}</div>
                {lot.notes && <div className="sm:col-span-3"><span className="text-muted-foreground">Notes : </span>{lot.notes}</div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Contrat en cours</CardTitle>
                <CardDescription>Contrat actif rattaché à ce lot, s'il existe.</CardDescription>
              </CardHeader>
              <CardContent>
                {!contrat ? (
                  <p className="text-sm text-muted-foreground">Aucun contrat actif pour ce lot.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Locataire : </span>
                      {locataire ? `${locataire.nom}${locataire.prenom ? ` ${locataire.prenom}` : ""}` : "—"}
                    </div>
                    <div><span className="text-muted-foreground">Loyer : </span>{fmtMoney(contrat.loyer_mensuel)}</div>
                    <div><span className="text-muted-foreground">Début : </span>{fmtDate(contrat.date_debut)}</div>
                    <div><span className="text-muted-foreground">Fin : </span>{fmtDate(contrat.date_fin)}</div>
                    <div><span className="text-muted-foreground">Statut : </span><Badge>{contrat.statut}</Badge></div>
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

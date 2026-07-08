import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Building2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/contacts/$contactId")({
  head: () => ({ meta: [{ title: "Fiche contact — Agence Immobilière" }] }),
  component: ContactDetailPage,
});

type Contact = {
  id: string;
  nom: string;
  prenom: string | null;
  telephone: string | null;
  email: string | null;
  type_contact: string | null;
  type_entite: string | null;
  interlocuteur: string | null;
  notes: string | null;
};
type Bien = { id: string; titre: string; adresse: string | null; type_bien: string | null };
type Lot = { id: string; label: string; bien_id: string; statut: string };
type Contrat = {
  id: string;
  lot_id: string;
  loyer_mensuel: number | null;
  date_debut: string | null;
  date_fin: string | null;
  statut: string;
};

const TYPE_LABEL: Record<string, string> = {
  bailleur: "Bailleur", locataire: "Locataire", prospect: "Prospect", prestataire: "Prestataire",
};

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
const fmtMoney = (n: number | null) => (n == null ? "—" : Number(n).toLocaleString("fr-FR") + " F");

type BienSummary = Bien & { nbLots: number; nbLoues: number; nbVacants: number; revenu: number };

function ContactDetailPage() {
  const { contactId } = Route.useParams();
  const navigate = useNavigate();
  const [contact, setContact] = useState<Contact | null>(null);
  const [biens, setBiens] = useState<BienSummary[]>([]);
  const [contrats, setContrats] = useState<(Contrat & { lot: Lot | null; bien: Bien | null })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: c, error } = await supabase.from("contacts").select("*").eq("id", contactId).maybeSingle();
      if (error) toast.error(error.message);
      const contactData = (c ?? null) as Contact | null;
      setContact(contactData);

      if (contactData?.type_contact === "bailleur") {
        const { data: bData } = await supabase
          .from("biens").select("id, titre, adresse, type_bien").eq("bailleur_id", contactId).order("titre");
        const bienList = (bData ?? []) as Bien[];
        if (bienList.length) {
          const ids = bienList.map((b) => b.id);
          const { data: lots } = await supabase.from("lots").select("id, label, bien_id, statut").in("bien_id", ids);
          const lotsList = (lots ?? []) as Lot[];
          const lotIds = lotsList.map((l) => l.id);
          const { data: cts } = lotIds.length
            ? await supabase.from("contrats").select("lot_id, loyer_mensuel, statut").in("lot_id", lotIds).eq("statut", "actif")
            : { data: [] as { lot_id: string; loyer_mensuel: number | null; statut: string }[] };
          const activeByLot = new Map<string, number>();
          (cts ?? []).forEach((x: any) => { activeByLot.set(x.lot_id, Number(x.loyer_mensuel ?? 0)); });
          const summaries: BienSummary[] = bienList.map((b) => {
            const bLots = lotsList.filter((l) => l.bien_id === b.id);
            const nbLoues = bLots.filter((l) => activeByLot.has(l.id)).length;
            const nbVacants = bLots.length - nbLoues;
            const revenu = bLots.reduce((s, l) => s + (activeByLot.get(l.id) ?? 0), 0);
            return { ...b, nbLots: bLots.length, nbLoues, nbVacants, revenu };
          });
          setBiens(summaries);
        } else setBiens([]);
      }

      if (contactData?.type_contact === "locataire") {
        const { data: cts } = await supabase
          .from("contrats").select("*").eq("locataire_id", contactId).order("date_debut", { ascending: false });
        const ctsList = (cts ?? []) as Contrat[];
        if (ctsList.length) {
          const lotIds = Array.from(new Set(ctsList.map((c) => c.lot_id)));
          const { data: lots } = await supabase.from("lots").select("id, label, bien_id, statut").in("id", lotIds);
          const lotsList = (lots ?? []) as Lot[];
          const bienIds = Array.from(new Set(lotsList.map((l) => l.bien_id)));
          const { data: bs } = bienIds.length
            ? await supabase.from("biens").select("id, titre, adresse, type_bien").in("id", bienIds)
            : { data: [] as Bien[] };
          const lotMap = new Map(lotsList.map((l) => [l.id, l]));
          const bienMap = new Map((bs ?? []).map((b: any) => [b.id, b as Bien]));
          setContrats(ctsList.map((c) => {
            const lot = lotMap.get(c.lot_id) ?? null;
            const bien = lot ? bienMap.get(lot.bien_id) ?? null : null;
            return { ...c, lot, bien };
          }));
        } else setContrats([]);
      }
      setLoading(false);
    })();
  }, [contactId]);

  const displayName = contact
    ? contact.type_entite === "entreprise"
      ? `${contact.nom}${contact.interlocuteur ? ` — ${contact.interlocuteur}` : ""}`
      : `${contact.nom}${contact.prenom ? ` ${contact.prenom}` : ""}`
    : "";

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            <span className="font-semibold">Agence Immobilière</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/contacts" })}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Retour aux contacts
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        ) : !contact ? (
          <p className="text-sm text-muted-foreground">Contact introuvable.</p>
        ) : (
          <>
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3 flex-wrap">
                  <CardTitle>{displayName}</CardTitle>
                  {contact.type_contact && <Badge variant="outline">{TYPE_LABEL[contact.type_contact] ?? contact.type_contact}</Badge>}
                  <Badge variant="secondary">{contact.type_entite === "entreprise" ? "Entreprise" : "Personne"}</Badge>
                </div>
                <CardDescription>Coordonnées et informations du contact.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2 text-sm">
                <div><span className="text-muted-foreground">Téléphone : </span>{contact.telephone ?? "—"}</div>
                <div><span className="text-muted-foreground">Email : </span>{contact.email ?? "—"}</div>
                {contact.notes && <div className="sm:col-span-2"><span className="text-muted-foreground">Notes : </span>{contact.notes}</div>}
              </CardContent>
            </Card>

            {contact.type_contact === "bailleur" && (
              <Card>
                <CardHeader>
                  <CardTitle>Biens du bailleur</CardTitle>
                  <CardDescription>Immeubles dont ce contact est bailleur.</CardDescription>
                </CardHeader>
                <CardContent>
                  {biens.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucun bien.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Titre</TableHead>
                            <TableHead>Adresse</TableHead>
                            <TableHead>Lots</TableHead>
                            <TableHead>Loués</TableHead>
                            <TableHead>Vacants</TableHead>
                            <TableHead>Revenu mensuel</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {biens.map((b) => (
                            <TableRow key={b.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate({ to: "/biens/$bienId", params: { bienId: b.id } })}>
                              <TableCell className="font-medium">{b.titre}</TableCell>
                              <TableCell>{b.adresse ?? "—"}</TableCell>
                              <TableCell>{b.nbLots}</TableCell>
                              <TableCell>{b.nbLoues}</TableCell>
                              <TableCell>{b.nbVacants}</TableCell>
                              <TableCell>{fmtMoney(b.revenu)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {contact.type_contact === "locataire" && (
              <Card>
                <CardHeader>
                  <CardTitle>Contrats du locataire</CardTitle>
                  <CardDescription>Contrats liés à ce locataire.</CardDescription>
                </CardHeader>
                <CardContent>
                  {contrats.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucun contrat.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Bien — Lot</TableHead>
                            <TableHead>Loyer</TableHead>
                            <TableHead>Début</TableHead>
                            <TableHead>Fin</TableHead>
                            <TableHead>Statut</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {contrats.map((c) => (
                            <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate({ to: "/contrats/$contratId", params: { contratId: c.id } })}>
                              <TableCell className="font-medium">
                                {c.bien?.titre ?? "—"} — {c.lot?.label ?? "—"}
                              </TableCell>
                              <TableCell>{fmtMoney(c.loyer_mensuel)}</TableCell>
                              <TableCell>{fmtDate(c.date_debut)}</TableCell>
                              <TableCell>{fmtDate(c.date_fin)}</TableCell>
                              <TableCell><Badge>{c.statut}</Badge></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}

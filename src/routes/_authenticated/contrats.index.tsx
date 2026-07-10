import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FilterBar } from "@/components/filter-bar";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Building2, ArrowLeft, Plus } from "lucide-react";
import { NouveauContratDialog } from "@/components/nouveau-contrat-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/contrats/")({
  head: () => ({
    meta: [
      { title: "Contrats — Agence Immobilière" },
      { name: "description", content: "Liste et gestion des contrats de location." },
    ],
  }),
  component: ContratsPage,
});

const STATUTS = [
  { value: "actif", label: "Actif" },
  { value: "renouvellement", label: "Renouvellement" },
  { value: "termine", label: "Terminé" },
] as const;
const STATUT_LABEL: Record<string, string> = Object.fromEntries(STATUTS.map((s) => [s.value, s.label]));

type Contrat = {
  id: string; lot_id: string; locataire_id: string | null;
  date_debut: string | null; date_fin: string | null;
  loyer_mensuel: number | null; depot_garantie: number | null;
  statut: string; notes: string | null; created_at: string;
};
type Lot = { id: string; label: string; bien_id: string };
type Bien = { id: string; titre: string };
type Locataire = { id: string; nom: string; prenom: string | null };

function ContratsPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [contrats, setContrats] = useState<Contrat[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [biens, setBiens] = useState<Bien[]>([]);
  const [locataires, setLocataires] = useState<Locataire[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [fStatut, setFStatut] = useState("all");
  const [fBien, setFBien] = useState("all");
  const [dFrom, setDFrom] = useState("");
  const [dTo, setDTo] = useState("");

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) { setChecked(true); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle();
      const r = profile?.role ?? null;
      setRole(r);
      setChecked(true);
      if (!r) {
        toast.error("Accès refusé");
        navigate({ to: "/dashboard", replace: true });
      }
    })();
  }, [navigate]);

  const canWrite = !!role;

  const load = async () => {
    setLoading(true);
    const [{ data: cData, error }, { data: lData }, { data: bData }, { data: locData }] = await Promise.all([
      supabase.from("contrats").select("*").order("created_at", { ascending: false }),
      supabase.from("lots").select("id, label, bien_id").order("label"),
      supabase.from("biens").select("id, titre").order("titre"),
      supabase.from("contacts").select("id, nom, prenom").eq("type_contact", "locataire").eq("archive", false).order("nom"),
    ]);
    if (error) toast.error(error.message);
    else setContrats((cData ?? []) as Contrat[]);
    setLots((lData ?? []) as Lot[]);
    setBiens((bData ?? []) as Bien[]);
    setLocataires((locData ?? []) as Locataire[]);
    setLoading(false);
  };

  useEffect(() => {
    if (role) load();
  }, [role]);

  const bienById = useMemo(() => new Map(biens.map((b) => [b.id, b])), [biens]);
  const lotById = useMemo(() => new Map(lots.map((l) => [l.id, l])), [lots]);

  const lotLabel = (id: string) => {
    const l = lotById.get(id);
    if (!l) return "—";
    const bien = bienById.get(l.bien_id)?.titre ?? "—";
    return `${bien} — ${l.label}`;
  };
  const locataireName = (id: string | null) => {
    if (!id) return "—";
    const l = locataires.find((x) => x.id === id);
    return l ? `${l.nom}${l.prenom ? ` ${l.prenom}` : ""}` : "—";
  };
  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
  const fmtMoney = (n: number | null) => (n == null ? "—" : n.toLocaleString("fr-FR") + " FCFA");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contrats.filter((c) => {
      if (fStatut !== "all" && c.statut !== fStatut) return false;
      if (fBien !== "all") {
        const lot = lotById.get(c.lot_id);
        if (!lot || lot.bien_id !== fBien) return false;
      }
      if (dFrom && (!c.date_debut || c.date_debut < dFrom)) return false;
      if (dTo && (!c.date_debut || c.date_debut > dTo)) return false;
      if (q) {
        const hay = `${lotLabel(c.lot_id)} ${locataireName(c.locataire_id)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contrats, search, fStatut, fBien, dFrom, dTo, lotById, bienById, locataires]);


  if (!checked) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            <span className="font-semibold">Agence Immobilière</span>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" /> Tableau de bord
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Contrats</CardTitle>
              <CardDescription>
                {canWrite ? "Gestion des contrats de location." : "Consultation des contrats (lecture seule)."}
              </CardDescription>
            </div>
            {canWrite && (
              <Button size="sm" onClick={() => setOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Nouveau contrat
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <FilterBar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Bien, lot ou locataire..."
              selects={[
                { key: "statut", label: "Statut", value: fStatut, onChange: setFStatut, options: STATUTS.map((s) => ({ value: s.value, label: s.label })) },
                { key: "bien", label: "Bien", value: fBien, onChange: setFBien, options: biens.map((b) => ({ value: b.id, label: b.titre })), width: "w-52" },
              ]}
              dateRange={{ label: "Début", from: dFrom, to: dTo, onFromChange: setDFrom, onToChange: setDTo }}
              onReset={() => { setSearch(""); setFStatut("all"); setFBien("all"); setDFrom(""); setDTo(""); }}
            />
            {loading ? (
              <p className="text-sm text-muted-foreground">Chargement...</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun contrat.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bien — Lot</TableHead>
                      <TableHead>Locataire</TableHead>
                      <TableHead>Début</TableHead>
                      <TableHead>Fin</TableHead>
                      <TableHead>Loyer</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((c) => (
                      <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate({ to: "/contrats/$contratId", params: { contratId: c.id } })}>
                        <TableCell className="font-medium">{lotLabel(c.lot_id)}</TableCell>
                        <TableCell>{locataireName(c.locataire_id)}</TableCell>
                        <TableCell>{fmtDate(c.date_debut)}</TableCell>
                        <TableCell>{fmtDate(c.date_fin)}</TableCell>
                        <TableCell>{fmtMoney(c.loyer_mensuel)}</TableCell>
                        <TableCell><Badge>{STATUT_LABEL[c.statut] ?? c.statut}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <NouveauContratDialog open={open} onOpenChange={setOpen} onCreated={() => load()} />
      </main>
    </div>
  );
}

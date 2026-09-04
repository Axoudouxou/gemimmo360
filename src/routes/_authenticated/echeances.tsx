import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FilterBar } from "@/components/filter-bar";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Building2, ArrowLeft, Plus } from "lucide-react";
import { toast } from "sonner";
import { PaiementDialog } from "@/components/paiement-dialog";
import { EcheanceDialog } from "@/components/echeance-dialog";
import {
  computeEcheanceStatut,
  echeanceProgress,
  ETAPE_LABELS,
  fmtDate,
  fmtMoney,
  fmtPeriode,
} from "@/lib/echeance-statut";

export const Route = createFileRoute("/_authenticated/echeances")({
  head: () => ({
    meta: [
      { title: "Impayés & échéances — GEM Immobilier" },
      {
        name: "description",
        content: "Suivi mensuel des échéances de loyer, des paiements affectés et des relances.",
      },
      { property: "og:title", content: "Impayés & échéances — GEM Immobilier" },
      {
        property: "og:description",
        content: "Suivi mensuel des échéances de loyer, des paiements affectés et des relances.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EcheancesPage,
});

const READ_BLOCKED = ["en_attente"] as const;
const WRITE_ROLES = ["admin", "direction", "recouvrement", "gestion_locative"] as const;

type Echeance = {
  id: string;
  contrat_id: string;
  periode: string;
  date_echeance: string;
  montant_du: number;
  montant_affecte: number;
  statut: string;
  etape_traitement: string | null;
  service_en_charge: string | null;
  date_derniere_relance: string | null;
};
type Contrat = { id: string; lot_id: string; locataire_id: string | null; statut: string };
type Lot = { id: string; label: string; bien_id: string };
type Bien = { id: string; titre: string; gestionnaire_id?: string | null };
type Contact = { id: string; nom: string; prenom: string | null };
type Profile = { id: string; email: string | null };

type SortKey = "periode" | "bien" | "locataire" | "montant_du" | "montant_affecte" | "reste" | "statut";

function EcheancesPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [echeances, setEcheances] = useState<Echeance[]>([]);
  const [contrats, setContrats] = useState<Contrat[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [biens, setBiens] = useState<Bien[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);
  const [echOpen, setEchOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [fStatut, setFStatut] = useState("non_solde");
  const [fService, setFService] = useState("all");
  const [dFrom, setDFrom] = useState("");
  const [dTo, setDTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("periode");
  const [sortAsc, setSortAsc] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) { setChecked(true); return; }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle();
      const r = profile?.role ?? null;
      setRole(r);
      setChecked(true);
      if (!r || (READ_BLOCKED as readonly string[]).includes(r)) {
        toast.error("Accès refusé");
        navigate({ to: "/dashboard", replace: true });
      }
    })();
  }, [navigate]);

  const canWrite = !!role && (WRITE_ROLES as readonly string[]).includes(role);

  const load = async () => {
    setLoading(true);
    const [
      { data: eData, error },
      { data: cData },
      { data: lData },
      { data: bData },
      { data: coData },
      { data: pData },
    ] = await Promise.all([
      supabase
        .from("echeances")
        .select(
          "id, contrat_id, periode, date_echeance, montant_du, montant_affecte, statut, etape_traitement, service_en_charge, date_derniere_relance",
        )
        .neq("statut", "solde")
        .order("periode", { ascending: true })
        .limit(5000),
      supabase.from("contrats").select("id, lot_id, locataire_id, statut"),
      supabase.from("lots").select("id, label, bien_id"),
      supabase.from("biens").select("id, titre, gestionnaire_id"),
      supabase.from("contacts").select("id, nom, prenom"),
      supabase.from("profiles").select("id, email"),
    ]);
    if (error) toast.error(error.message);
    else setEcheances((eData ?? []) as Echeance[]);
    setContrats((cData ?? []) as Contrat[]);
    setLots((lData ?? []) as Lot[]);
    setBiens((bData ?? []) as Bien[]);
    setContacts((coData ?? []) as Contact[]);
    setProfiles((pData ?? []) as Profile[]);
    setLoading(false);
  };

  useEffect(() => {
    if (role && !(READ_BLOCKED as readonly string[]).includes(role)) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const contratLabel = (id: string) => {
    const c = contrats.find((x) => x.id === id);
    if (!c) return { bien: "—", locataire: "—", gestionnaire: "—" };
    const lot = lots.find((l) => l.id === c.lot_id);
    const bienRow = lot ? biens.find((b) => b.id === lot.bien_id) : undefined;
    const bienTitre = bienRow?.titre ?? "—";
    const bien = lot ? `${bienTitre} — ${lot.label}` : bienTitre;
    const loc = c.locataire_id ? contacts.find((x) => x.id === c.locataire_id) : null;
    const locataire = loc ? `${loc.nom}${loc.prenom ? ` ${loc.prenom}` : ""}` : "—";
    const gp = bienRow?.gestionnaire_id ? profiles.find((p) => p.id === bienRow.gestionnaire_id) : null;
    const gestionnaire = gp?.email ? gp.email.split("@")[0] : "—";
    return { bien, locataire, gestionnaire };
  };

  const stats = useMemo(() => {
    let totalRestant = 0, nbImpaye = 0, nbPartiel = 0, nbJuridique = 0;
    const contratsTouches = new Set<string>();
    for (const e of echeances) {
      const reste = Math.max(0, Number(e.montant_du) - Number(e.montant_affecte));
      totalRestant += reste;
      if (reste > 0) contratsTouches.add(e.contrat_id);
      const k = computeEcheanceStatut(e).key;
      if (k === "impaye") nbImpaye++;
      else if (k === "partiel") nbPartiel++;
      else if (k === "juridique") nbJuridique++;
    }
    return { totalRestant, nbImpaye, nbPartiel, nbJuridique, nbContrats: contratsTouches.size };
  }, [echeances]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc((v) => !v);
    else { setSortKey(k); setSortAsc(true); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = echeances.filter((e) => {
      const st = computeEcheanceStatut(e).key;
      if (fStatut === "non_solde") {
        if (st === "solde") return false;
      } else if (fStatut !== "all" && st !== fStatut) return false;

      if (fService !== "all" && (e.service_en_charge ?? "recouvrement") !== fService) return false;
      if (dFrom && e.periode < dFrom) return false;
      if (dTo && e.periode > dTo) return false;
      if (q) {
        const { bien, locataire } = contratLabel(e.contrat_id);
        if (!`${bien} ${locataire}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    const val = (e: Echeance): string | number => {
      const l = contratLabel(e.contrat_id);
      switch (sortKey) {
        case "bien": return l.bien.toLowerCase();
        case "locataire": return l.locataire.toLowerCase();
        case "montant_du": return Number(e.montant_du);
        case "montant_affecte": return Number(e.montant_affecte);
        case "reste": return Number(e.montant_du) - Number(e.montant_affecte);
        case "statut": return computeEcheanceStatut(e).label;
        default: return e.periode ?? "";
      }
    };

    return [...rows].sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sortAsc ? c : -c;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [echeances, search, fStatut, fService, dFrom, dTo, contrats, lots, biens, contacts, profiles, sortKey, sortAsc]);

  const contratOptions = useMemo(
    () =>
      contrats
        .filter((c) => c.statut === "actif")
        .map((c) => {
          const { bien, locataire } = contratLabel(c.id);
          return { value: c.id, label: `${bien} — ${locataire}` };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contrats, lots, biens, contacts],
  );

  const SortHead = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort(k)}>
      {children}
      {sortKey === k ? <span className="ml-1 text-xs">{sortAsc ? "▲" : "▼"}</span> : null}
    </TableHead>
  );

  const kpis = [
    { label: "Total restant à recouvrer", value: fmtMoney(stats.totalRestant) },
    { label: "🔴 Échéances impayées", value: stats.nbImpaye },
    { label: "🟡 Échéances partielles", value: stats.nbPartiel },
    { label: "⚖️ Échéances au juridique", value: stats.nbJuridique },
    { label: "Contrats concernés", value: stats.nbContrats },
    { label: "Échéances non soldées", value: echeances.length },
  ];

  if (!checked) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            <span className="font-semibold">GEM Immobilier</span>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" /> Tableau de bord
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kpis.map((k) => (
            <Card key={k.label}>
              <CardHeader className="pb-2"><CardDescription>{k.label}</CardDescription></CardHeader>
              <CardContent><p className="text-2xl font-semibold">{k.value}</p></CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Impayés par échéance</CardTitle>
              <CardDescription>Une ligne = un mois de loyer pour un contrat.</CardDescription>
            </div>
            {canWrite && (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setEchOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Saisir un impayé
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPayOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Enregistrer un paiement
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <FilterBar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Bien ou locataire..."
              selects={[
                {
                  key: "statut",
                  label: "Statut",
                  value: fStatut,
                  onChange: setFStatut,
                  options: [
                    { value: "non_solde", label: "Non soldées" },
                    { value: "impaye", label: "Impayé" },
                    { value: "partiel", label: "Partiel" },
                    { value: "juridique", label: "Transféré au juridique" },
                    { value: "solde", label: "Soldé" },
                  ],
                },
                {
                  key: "service",
                  label: "Service en charge",
                  value: fService,
                  onChange: setFService,
                  options: [
                    { value: "recouvrement", label: "Recouvrement" },
                    { value: "juridique", label: "Juridique" },
                  ],
                },
              ]}
              dateRange={{ label: "Période", from: dFrom, to: dTo, onFromChange: setDFrom, onToChange: setDTo }}
              onReset={() => { setSearch(""); setFStatut("non_solde"); setFService("all"); setDFrom(""); setDTo(""); }}
            />
            {loading ? (
              <p className="text-sm text-muted-foreground">Chargement...</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune échéance.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortHead k="periode">Période</SortHead>
                      <SortHead k="bien">Bien</SortHead>
                      <SortHead k="locataire">Locataire</SortHead>
                      <TableHead>Échéance</TableHead>
                      <SortHead k="montant_du">Dû</SortHead>
                      <SortHead k="montant_affecte">Payé</SortHead>
                      <SortHead k="reste">Reste</SortHead>
                      <TableHead>Progression</TableHead>
                      <SortHead k="statut">Statut</SortHead>
                      <TableHead>Étape</TableHead>
                      <TableHead>Dernière relance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((e) => {
                      const { bien, locataire } = contratLabel(e.contrat_id);
                      const reste = Math.max(0, Number(e.montant_du) - Number(e.montant_affecte));
                      const pct = echeanceProgress(e.montant_du, e.montant_affecte);
                      const st = computeEcheanceStatut(e);
                      return (
                        <TableRow
                          key={e.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate({ to: "/contrats/$contratId", params: { contratId: e.contrat_id } })}
                        >
                          <TableCell className="capitalize whitespace-nowrap">{fmtPeriode(e.periode)}</TableCell>
                          <TableCell className="font-medium">{bien}</TableCell>
                          <TableCell>{locataire}</TableCell>
                          <TableCell>{fmtDate(e.date_echeance)}</TableCell>
                          <TableCell>{fmtMoney(e.montant_du)}</TableCell>
                          <TableCell>{fmtMoney(e.montant_affecte)}</TableCell>
                          <TableCell className={reste > 0 ? "text-destructive font-medium" : "text-emerald-600 font-medium"}>
                            {fmtMoney(reste)}
                          </TableCell>
                          <TableCell className="min-w-[120px]">
                            <div className="flex items-center gap-2">
                              <Progress value={pct} className="h-2 w-16" />
                              <span className="text-xs text-muted-foreground">{pct}%</span>
                            </div>
                          </TableCell>
                          <TableCell><Badge className={st.className}>{st.emoji} {st.label}</Badge></TableCell>
                          <TableCell className="whitespace-nowrap">
                            {ETAPE_LABELS[e.etape_traitement ?? "recouvrement"] ?? e.etape_traitement}
                          </TableCell>
                          <TableCell>{fmtDate(e.date_derniere_relance)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <EcheanceDialog
          open={echOpen}
          onOpenChange={setEchOpen}
          contratOptions={contratOptions}
          onSaved={load}
        />

        <PaiementDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          contratOptions={contratOptions}
          onSaved={load}
        />
      </main>
    </div>
  );
}

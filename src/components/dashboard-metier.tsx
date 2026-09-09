import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { isEnRetard } from "@/lib/echeance-statut";
import { PRIORITE_CLASS, PRIORITE_LABEL, STATUT_LABEL } from "@/lib/travaux-utils";

const fmtMoney = (n: number | null | undefined) =>
  `${Number(n ?? 0).toLocaleString("fr-FR")} FCFA`;

const monthStart = () => {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
};
const monthEnd = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
};
const daysAgo = (iso: string | null | undefined) =>
  iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000)) : null;

type Ech = {
  id: string;
  contrat_id: string;
  periode: string | null;
  date_echeance: string | null;
  montant_du: number | null;
  montant_affecte: number | null;
  etape_traitement: string | null;
  service_en_charge?: string | null;
  date_derniere_relance?: string | null;
};

const reste = (e: Ech) => Number(e.montant_du ?? 0) - Number(e.montant_affecte ?? 0);
const nonSolde = (e: Ech) =>
  reste(e) > 0 && !["solde", "resolu", "cloture"].includes(e.etape_traitement ?? "");

function Mini({
  label,
  value,
  tone,
  to,
}: {
  label: string;
  value: string | number;
  tone?: "danger" | "warning" | "success";
  to?: string;
}) {
  const valueCls =
    tone === "danger"
      ? "text-destructive"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "success"
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-primary";
  const inner = (
    <Card className={to ? "cursor-pointer transition-colors hover:bg-muted/50" : ""}>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${valueCls}`}>{value}</div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-center text-sm text-muted-foreground">{children}</p>;
}

/* ------------------ PILOTAGE FINANCIER DU MOIS ------------------ */
export function PilotageFinancierMois() {
  const [s, setS] = useState({ du: 0, encaisse: 0, taux: 0, impayes: 0, impayesMois: 0 });
  useEffect(() => {
    (async () => {
      const [{ data: ech }, { data: ctr }] = await Promise.all([
        supabase
          .from("echeances")
          .select("id, contrat_id, periode, date_echeance, montant_du, montant_affecte, etape_traitement"),
        supabase.from("contrats").select("id, loyer_mensuel").eq("statut", "actif"),
      ]);
      const rows = (ech ?? []) as Ech[];
      const start = monthStart();
      const end = monthEnd();
      // Loyers dus = somme des loyers des contrats actifs
      const du = ((ctr ?? []) as Array<{ loyer_mensuel: number | null }>).reduce(
        (t, c) => t + Number(c.loyer_mensuel ?? 0),
        0,
      );
      const impayesMois = rows
        .filter((e) => {
          const p = (e.periode ?? e.date_echeance ?? "").slice(0, 10);
          return p >= start && p <= end && nonSolde(e);
        })
        .reduce((t, e) => t + reste(e), 0);
      const encaisse = Math.max(0, du - impayesMois);
      const impayes = rows.filter(nonSolde).reduce((t, e) => t + reste(e), 0);
      setS({ du, encaisse, taux: du > 0 ? Math.round((encaisse / du) * 100) : 0, impayes, impayesMois });
    })();
  }, []);
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Mini label="Loyers dus ce mois" value={fmtMoney(s.du)} />
      <Mini label="Impayés du mois" value={fmtMoney(s.impayesMois)} tone="warning" to="/echeances" />
      <Mini label="Loyers encaissés ce mois (estimé)" value={fmtMoney(s.encaisse)} tone="success" />
      <Mini label="Taux de recouvrement" value={`${s.taux}%`} tone={s.taux < 70 ? "warning" : "success"} />
      <Mini label="Total des impayés" value={fmtMoney(s.impayes)} tone="danger" to="/echeances" />
    </div>
  );
}


/* ------------------ RECOUVREMENT ------------------ */
export function ImpayesATraiter({ limit = 10 }: { limit?: number }) {
  const [rows, setRows] = useState<Array<Ech & { locataire: string }>>([]);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("echeances")
        .select(
          "id, contrat_id, periode, date_echeance, montant_du, montant_affecte, etape_traitement, service_en_charge, contrats(locataire:contacts!contrats_locataire_id_fkey(nom, prenom))",
        )
        .neq("statut", "solde")
        .order("date_echeance", { ascending: true })
        .limit(2000);
      const items = ((data ?? []) as any[])
        .filter((r) => nonSolde(r))
        .map((r) => ({
          ...(r as Ech),
          locataire: r.contrats?.locataire
            ? `${r.contrats.locataire.nom ?? ""} ${r.contrats.locataire.prenom ?? ""}`.trim()
            : "—",
        }));
      setTotal(items.reduce((t, e) => t + reste(e), 0));
      items.sort((a, b) => {
        const d = (a.date_echeance ?? "").localeCompare(b.date_echeance ?? "");
        return d !== 0 ? d : reste(b) - reste(a);
      });
      setRows(items.slice(0, limit));
    })();
  }, [limit]);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-sm">Mes impayés à traiter</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Portefeuille dû : <span className="font-semibold text-destructive">{fmtMoney(total)}</span>
          </p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/echeances">Tous</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <Empty>Aucun impayé en cours.</Empty>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const j = daysAgo(r.date_echeance);
              return (
                <Link
                  key={r.id}
                  to="/contrats/$contratId"
                  params={{ contratId: r.contrat_id }}
                  className="flex items-center justify-between rounded border p-2 text-sm hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{r.locataire}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.periode ? format(new Date(r.periode), "MMMM yyyy", { locale: fr }) : "—"}
                      {j != null && isEnRetard(r.date_echeance) ? ` — ${j} j de retard` : ""}
                    </div>
                  </div>
                  <div className="text-right font-semibold text-destructive">{fmtMoney(reste(r))}</div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function RelancesStats() {
  const [s, setS] = useState({ aFaire: 0, semaine: 0 });
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("echeances")
        .select("id, contrat_id, periode, date_echeance, montant_du, montant_affecte, etape_traitement, date_derniere_relance");
      const rows = ((data ?? []) as Ech[]).filter(nonSolde);
      const weekStart = (() => {
        const d = new Date();
        const day = (d.getDay() + 6) % 7;
        d.setDate(d.getDate() - day);
        return d.toISOString().slice(0, 10);
      })();
      const aFaire = rows.filter((e) => {
        if (!isEnRetard(e.date_echeance)) return false;
        const j = daysAgo(e.date_derniere_relance);
        return j == null || j >= 15;
      }).length;
      const semaine = rows.filter((e) => (e.date_derniere_relance ?? "") >= weekStart).length;
      setS({ aFaire, semaine });
    })();
  }, []);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Mini label="Relances à faire aujourd'hui" value={s.aFaire} tone="warning" to="/echeances" />
      <Mini label="Relances faites cette semaine" value={s.semaine} tone="success" />
    </div>
  );
}

export function ContentieuxJuridiqueList({ limit = 8 }: { limit?: number }) {
  const [rows, setRows] = useState<Array<Ech & { locataire: string }>>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("echeances")
        .select(
          "id, contrat_id, periode, date_echeance, montant_du, montant_affecte, etape_traitement, service_en_charge, contrats(locataire:contacts!contrats_locataire_id_fkey(nom, prenom))",
        )
        .limit(300);
      const items = ((data ?? []) as any[])
        .filter(
          (r) =>
            r.service_en_charge === "juridique" ||
            ["mise_en_demeure", "contentieux", "transfere_juridique"].includes(r.etape_traitement ?? ""),
        )
        .map((r) => ({
          ...(r as Ech),
          locataire: r.contrats?.locataire
            ? `${r.contrats.locataire.nom ?? ""} ${r.contrats.locataire.prenom ?? ""}`.trim()
            : "—",
        }))
        .slice(0, limit);
      setRows(items);
    })();
  }, [limit]);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Locataires en contentieux / juridique</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <Empty>Aucun dossier au juridique.</Empty>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <Link
                key={r.id}
                to="/contrats/$contratId"
                params={{ contratId: r.contrat_id }}
                className="flex items-center justify-between rounded border p-2 text-sm hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.locataire}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.periode ? format(new Date(r.periode), "MMMM yyyy", { locale: fr }) : "—"}
                  </div>
                </div>
                <Badge className="bg-purple-600 text-white hover:bg-purple-600">{fmtMoney(reste(r))}</Badge>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------ COMMERCIAL ------------------ */
export function BiensVacantsAPlacer({ limit = 8 }: { limit?: number }) {
  const [rows, setRows] = useState<Array<{ id: string; label: string; bien: string; bienId: string; jours: number | null }>>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("lots")
        .select("id, label, updated_at, bien_id, biens(titre)")
        .eq("statut", "vacant")
        .order("updated_at", { ascending: true })
        .limit(limit);
      setRows(
        ((data ?? []) as any[]).map((l) => ({
          id: l.id,
          label: l.label ?? "—",
          bien: l.biens?.titre ?? "—",
          bienId: l.bien_id,
          jours: daysAgo(l.updated_at),
        })),
      );
    })();
  }, [limit]);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm">Biens vacants à placer</CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/biens">Tous</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <Empty>Aucun lot vacant.</Empty>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <Link
                key={r.id}
                to="/lots/$lotId"
                params={{ lotId: r.id }}
                className="flex items-center justify-between rounded border p-2 text-sm hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.bien}</div>
                  <div className="text-xs text-muted-foreground">Lot {r.label}</div>
                </div>
                <span className={`text-xs ${(r.jours ?? 0) > 90 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                  {r.jours != null ? `Vacant depuis ${r.jours} j` : "—"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function VisitesWidget({ limit = 6 }: { limit?: number }) {
  const [stats, setStats] = useState({ aVenir: 0, faites: 0, signes: 0 });
  const [rows, setRows] = useState<Array<{ id: string; titre: string; date: string | null; statut: string }>>([]);
  useEffect(() => {
    (async () => {
      const start = monthStart();
      const nowIso = new Date().toISOString();
      const [{ data: acts }, { count: signes }] = await Promise.all([
        supabase
          .from("activites")
          .select("id, titre, date_debut, statut")
          .eq("type_activite", "visite")
          .order("date_debut", { ascending: true })
          .limit(200),
        supabase.from("contrats").select("id", { count: "exact", head: true }).gte("created_at", start),
      ]);
      const list = (acts ?? []) as Array<{ id: string; titre: string; date_debut: string | null; statut: string }>;
      const aVenir = list.filter(
        (a) => !["terminee", "annulee"].includes(a.statut) && (a.date_debut ?? "") >= nowIso,
      );
      const faites = list.filter((a) => a.statut === "terminee" && (a.date_debut ?? "") >= start);
      setStats({ aVenir: aVenir.length, faites: faites.length, signes: signes ?? 0 });
      setRows(aVenir.slice(0, limit).map((a) => ({ id: a.id, titre: a.titre, date: a.date_debut, statut: a.statut })));
    })();
  }, [limit]);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Mini label="Visites à venir" value={stats.aVenir} to="/calendrier" />
        <Mini label="Visites réalisées ce mois" value={stats.faites} tone="success" />
        <Mini label="Contrats signés ce mois" value={stats.signes} tone="success" to="/contrats" />
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm">Prochaines visites</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/calendrier">Calendrier</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <Empty>Aucune visite planifiée.</Empty>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded border p-2 text-sm">
                  <span className="truncate font-medium">{r.titre}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.date ? format(new Date(r.date), "d MMM HH:mm", { locale: fr }) : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------ JURIDIQUE : FISCALITÉ ------------------ */
export function AlertesFoncieres({ limit = 8 }: { limit?: number }) {
  const [rows, setRows] = useState<
    Array<{ id: string; bien: string; trimestre: string; annee: number; date_echeance: string; montant: number | null; statut: string }>
  >([]);
  const [honoraires, setHonoraires] = useState(0);
  useEffect(() => {
    (async () => {
      const in60 = new Date();
      in60.setDate(in60.getDate() + 60);
      const [{ data }, { count }] = await Promise.all([
        supabase
          .from("impots_fonciers")
          .select("id, annee_fiscale, trimestre, date_echeance, montant, statut, biens(titre)")
          .neq("statut", "paye")
          .lte("date_echeance", in60.toISOString().slice(0, 10))
          .order("date_echeance", { ascending: true })
          .limit(limit),
        supabase.from("honoraires_fiscaux").select("id", { count: "exact", head: true }).neq("statut", "paye"),
      ]);
      setRows(
        ((data ?? []) as any[]).map((r) => ({
          id: r.id,
          bien: r.biens?.titre ?? "—",
          trimestre: r.trimestre,
          annee: r.annee_fiscale,
          date_echeance: r.date_echeance,
          montant: r.montant,
          statut: r.statut,
        })),
      );
      setHonoraires(count ?? 0);
    })();
  }, [limit]);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-sm">Planning impôt foncier</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{honoraires} honoraire(s) fiscaux en attente</p>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/fiscalite">Fiscalité</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <Empty>Aucune échéance foncière dans les 60 jours.</Empty>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const late = r.date_echeance < new Date().toISOString().slice(0, 10);
              return (
                <Link
                  key={r.id}
                  to="/fiscalite"
                  className="flex items-center justify-between rounded border p-2 text-sm hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{r.bien}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.trimestre} {r.annee} — {format(new Date(r.date_echeance), "d MMM yyyy", { locale: fr })}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">{r.montant != null ? fmtMoney(r.montant) : "—"}</div>
                    {late && <Badge variant="destructive">En retard</Badge>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------ CONTRATS À ÉCHÉANCE ------------------ */
export function ContratsAEcheance({
  jours = 60,
  titre = "Contrats à échéance",
  limit = 8,
}: {
  jours?: number;
  titre?: string;
  limit?: number;
}) {
  const [rows, setRows] = useState<Array<{ id: string; date_fin: string; locataire: string; bien: string }>>([]);
  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const fin = new Date();
      fin.setDate(fin.getDate() + jours);
      const { data } = await supabase
        .from("contrats")
        .select("id, date_fin, locataire:contacts!contrats_locataire_id_fkey(nom, prenom), lots(label, biens(titre))")
        .eq("statut", "actif")
        .gte("date_fin", today)
        .lte("date_fin", fin.toISOString().slice(0, 10))
        .order("date_fin", { ascending: true })
        .limit(limit);
      setRows(
        ((data ?? []) as any[]).map((r) => ({
          id: r.id,
          date_fin: r.date_fin,
          locataire: r.locataire ? `${r.locataire.nom ?? ""} ${r.locataire.prenom ?? ""}`.trim() : "—",
          bien: r.lots?.biens?.titre ?? "—",
        })),
      );
    })();
  }, [jours, limit]);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm">
          {titre} ({jours} j)
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/contrats">Tous</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <Empty>Aucun contrat concerné.</Empty>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <Link
                key={r.id}
                to="/contrats/$contratId"
                params={{ contratId: r.id }}
                className="flex items-center justify-between rounded border p-2 text-sm hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.locataire}</div>
                  <div className="truncate text-xs text-muted-foreground">{r.bien}</div>
                </div>
                <span className="text-xs">{format(new Date(r.date_fin), "d MMM yyyy", { locale: fr })}</span>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------ TECHNIQUE ------------------ */
export function TravauxPrioritaires({ limit = 8 }: { limit?: number }) {
  const [rows, setRows] = useState<Array<{ id: string; titre: string; statut: string; priorite: string | null }>>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("travaux")
        .select("id, titre, statut, priorite")
        .in("statut", ["en_cours", "planifie", "a_valider", "a_qualifier"])
        .limit(100);
      const order: Record<string, number> = { critique: 0, haute: 1, normale: 2, basse: 3 };
      const items = ((data ?? []) as any[]).sort(
        (a, b) => (order[a.priorite ?? "normale"] ?? 2) - (order[b.priorite ?? "normale"] ?? 2),
      );
      setRows(items.slice(0, limit));
    })();
  }, [limit]);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm">Travaux en cours</CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/travaux">Tous</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <Empty>Aucun travaux en cours.</Empty>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <Link
                key={r.id}
                to="/travaux"
                className="flex items-center justify-between gap-2 rounded border p-2 text-sm hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.titre}</div>
                  <div className="text-xs text-muted-foreground">{STATUT_LABEL[r.statut] ?? r.statut}</div>
                </div>
                <Badge className={PRIORITE_CLASS[r.priorite ?? "normale"]}>
                  {PRIORITE_LABEL[r.priorite ?? "normale"] ?? "Normale"}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ReclamationsAssignees({ userId, limit = 8 }: { userId: string | null; limit?: number }) {
  const [rows, setRows] = useState<Array<{ id: string; titre: string; priorite: string; statut: string }>>([]);
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase
        .from("reclamations")
        .select("id, titre, priorite, statut")
        .eq("assigne_a", userId)
        .in("statut", ["ouverte", "en_cours"])
        .limit(limit);
      setRows((data ?? []) as any[]);
    })();
  }, [userId, limit]);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm">Réclamations ouvertes qui me sont assignées</CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/reclamations">Toutes</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <Empty>Aucune réclamation assignée.</Empty>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <Link
                key={r.id}
                to="/reclamations"
                className="flex items-center justify-between gap-2 rounded border p-2 text-sm hover:bg-muted/40"
              >
                <span className="truncate font-medium">{r.titre}</span>
                <Badge variant={r.priorite === "haute" || r.priorite === "critique" ? "destructive" : "secondary"}>
                  {PRIORITE_LABEL[r.priorite] ?? r.priorite}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function EtatsDesLieuxSuivi({ limit = 8 }: { limit?: number }) {
  const [aFaire, setAFaire] = useState<Array<{ id: string; titre: string; date: string | null }>>([]);
  const [recents, setRecents] = useState<Array<{ id: string; type: string; date: string }>>([]);
  useEffect(() => {
    (async () => {
      const [{ data: acts }, { data: edls }] = await Promise.all([
        supabase
          .from("activites")
          .select("id, titre, date_debut, statut")
          .eq("type_activite", "etat_des_lieux")
          .not("statut", "in", "(terminee,annulee)")
          .order("date_debut", { ascending: true })
          .limit(limit),
        supabase
          .from("etats_des_lieux")
          .select("id, type, date_realisation")
          .order("date_realisation", { ascending: false })
          .limit(5),
      ]);
      setAFaire(((acts ?? []) as any[]).map((a) => ({ id: a.id, titre: a.titre, date: a.date_debut })));
      setRecents(((edls ?? []) as any[]).map((e) => ({ id: e.id, type: e.type, date: e.date_realisation })));
    })();
  }, [limit]);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm">États des lieux à réaliser</CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/etats-des-lieux">Module</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {aFaire.length === 0 ? (
          <Empty>Aucun état des lieux planifié.</Empty>
        ) : (
          <div className="space-y-2">
            {aFaire.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded border p-2 text-sm">
                <span className="truncate font-medium">{a.titre}</span>
                <span className="text-xs text-muted-foreground">
                  {a.date ? format(new Date(a.date), "d MMM", { locale: fr }) : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
        {recents.length > 0 && (
          <div className="border-t pt-2 text-xs text-muted-foreground">
            Derniers réalisés :{" "}
            {recents
              .map((r) => `${r.type === "entree" ? "Entrée" : "Sortie"} ${format(new Date(r.date), "d MMM", { locale: fr })}`)
              .join(" · ")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------ GESTION LOCATIVE ------------------ */
export function DecomptesEtQuittances() {
  const [s, setS] = useState({ decomptes: 0, quittances: 0 });
  const [quittanceRows, setQuittanceRows] = useState<Array<{ id: string; contrat_id: string; periode: string | null }>>([]);
  useEffect(() => {
    (async () => {
      const start = monthStart();
      const end = monthEnd();
      const [{ data: echs }, { data: quittances }] = await Promise.all([
        supabase
          .from("echeances")
          .select("id, contrat_id, periode, date_echeance, montant_du, montant_affecte, etape_traitement")
          .gte("periode", start)
          .lte("periode", end),
        supabase.from("quittances").select("echeance_id").gte("periode", start).lte("periode", end),
      ]);
      const emises = new Set(((quittances ?? []) as any[]).map((q) => q.echeance_id));
      const soldees = ((echs ?? []) as Ech[]).filter((e) => reste(e) <= 0 && Number(e.montant_du ?? 0) > 0);
      const enAttente = soldees.filter((e) => !emises.has(e.id));

      const { data: biens } = await supabase.from("biens").select("id");
      const contratIds = ((echs ?? []) as Ech[]).map((e) => e.contrat_id);
      let biensAvecActivite = new Set<string>();
      if (contratIds.length > 0) {
        const { data: cs } = await supabase.from("contrats").select("id, lots(bien_id)").in("id", contratIds);
        biensAvecActivite = new Set(((cs ?? []) as any[]).map((c) => c.lots?.bien_id).filter(Boolean));
      }
      setS({
        decomptes: biensAvecActivite.size || (biens ?? []).length,
        quittances: enAttente.length,
      });
      setQuittanceRows(enAttente.slice(0, 6).map((e) => ({ id: e.id, contrat_id: e.contrat_id, periode: e.periode })));
    })();
  }, []);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Mini label="Décomptes à générer ce mois" value={s.decomptes} to="/charges" />
        <Mini label="Quittances en attente d'émission" value={s.quittances} tone="warning" to="/echeances" />
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Quittances à émettre (mois en cours)</CardTitle>
        </CardHeader>
        <CardContent>
          {quittanceRows.length === 0 ? (
            <Empty>Toutes les quittances du mois sont émises.</Empty>
          ) : (
            <div className="space-y-2">
              {quittanceRows.map((q) => (
                <Link
                  key={q.id}
                  to="/contrats/$contratId"
                  params={{ contratId: q.contrat_id }}
                  className="flex items-center justify-between rounded border p-2 text-sm hover:bg-muted/40"
                >
                  <span className="font-medium">
                    {q.periode ? format(new Date(q.periode), "MMMM yyyy", { locale: fr }) : "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">Émettre la quittance</span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

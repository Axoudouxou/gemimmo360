import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Minus, Eye, Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import {
  ALL_ROLES,
  DEFAULT_SECTIONS,
  ROLES,
  fetchOverrides,
  type Level,
  type Overrides,
  type RoleKey,
} from "@/lib/permissions-matrix";

export const Route = createFileRoute("/_authenticated/permissions")({
  head: () => ({
    meta: [
      { title: "Matrice des accès par profil — Agence Immobilière" },
      {
        name: "description",
        content:
          "Configurez les actions autorisées pour chaque rôle interne : impayés, paiements, documents, travaux, réclamations et administration.",
      },
      { property: "og:title", content: "Matrice des accès par profil" },
      {
        property: "og:description",
        content: "Ajustez en un coup d'œil ce que chaque rôle peut consulter, créer ou modifier.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) throw redirect({ to: "/auth" });
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role !== "admin") throw redirect({ to: "/dashboard" });
    return { role: profile.role as string };
  },
  component: PermissionsPage,
});

const LEVELS: { value: Level; label: string }[] = [
  { value: "full", label: "Création et modification" },
  { value: "read", label: "Consultation seule" },
  { value: "none", label: "Aucun accès" },
];

function Cell({ level }: { level: Level }) {
  if (level === "full")
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600" title="Création et modification">
        <Check className="h-4 w-4" />
      </span>
    );
  if (level === "read")
    return (
      <span className="inline-flex items-center gap-1 text-amber-600" title="Consultation seule">
        <Eye className="h-4 w-4" />
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground/50" title="Aucun accès">
      <Minus className="h-4 w-4" />
    </span>
  );
}

function defaultLevel(actionKey: string, role: RoleKey): Level {
  const row = DEFAULT_SECTIONS.flatMap((s) => s.rows).find((r) => r.key === actionKey);
  return row?.access[role] ?? "none";
}

function PermissionsPage() {
  const [overrides, setOverrides] = useState<Overrides>({});
  const [draft, setDraft] = useState<Overrides>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    fetchOverrides()
      .then((o) => {
        setOverrides(o);
        setDraft(o);
      })
      .finally(() => setLoading(false));
  }, []);

  const effective = (actionKey: string, role: RoleKey): Level =>
    draft[actionKey]?.[role] ?? defaultLevel(actionKey, role);

  const setLevel = (actionKey: string, role: RoleKey, level: Level) => {
    setDraft((prev) => ({ ...prev, [actionKey]: { ...(prev[actionKey] ?? {}), [role]: level } }));
  };

  const dirty = JSON.stringify(draft) !== JSON.stringify(overrides);

  const save = async () => {
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const rows: { action_key: string; role: string; level: Level; updated_by: string | null }[] = [];
    for (const [actionKey, byRole] of Object.entries(draft)) {
      for (const [role, level] of Object.entries(byRole ?? {})) {
        if (!level) continue;
        rows.push({ action_key: actionKey, role, level, updated_by: userRes.user?.id ?? null });
      }
    }
    const { error } = await supabase
      .from("permissions_overrides")
      .upsert(rows, { onConflict: "action_key,role" });
    setSaving(false);
    if (error) {
      toast.error("Enregistrement impossible : " + error.message);
      return;
    }
    setOverrides(draft);
    setEditing(false);
    toast.success("Matrice des accès enregistrée");
  };

  const resetAll = async () => {
    setSaving(true);
    const { error } = await supabase.from("permissions_overrides").delete().neq("action_key", "");
    setSaving(false);
    if (error) {
      toast.error("Réinitialisation impossible : " + error.message);
      return;
    }
    setOverrides({});
    setDraft({});
    toast.success("Matrice revenue aux valeurs par défaut");
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard">
            <ArrowLeft className="mr-2 h-4 w-4" /> Retour
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDraft(overrides);
                  setEditing(false);
                }}
                disabled={saving}
              >
                Annuler
              </Button>
              <Button size="sm" onClick={save} disabled={saving || !dirty}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Enregistrer
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={resetAll} disabled={saving || !Object.keys(overrides).length}>
                <RotateCcw className="mr-2 h-4 w-4" /> Valeurs par défaut
              </Button>
              <Button size="sm" onClick={() => setEditing(true)}>Modifier la matrice</Button>
            </>
          )}
        </div>
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">Matrice des accès par profil</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Actions autorisées pour chaque rôle interne. Vos ajustements sont enregistrés et appliqués aux
        écrans qui s'appuient sur la matrice.
      </p>

      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <span className="inline-flex items-center gap-2">
          <Check className="h-4 w-4 text-emerald-600" /> Création et modification
        </span>
        <span className="inline-flex items-center gap-2">
          <Eye className="h-4 w-4 text-amber-600" /> Consultation seule
        </span>
        <span className="inline-flex items-center gap-2">
          <Minus className="h-4 w-4 text-muted-foreground/50" /> Aucun accès
        </span>
      </div>

      {loading ? (
        <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {DEFAULT_SECTIONS.map((section) => (
            <Card key={section.title}>
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
                <CardDescription>{section.rows.length} actions</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[280px]">Action</TableHead>
                      {ROLES.map((r) => (
                        <TableHead key={r.key} className="text-center whitespace-nowrap">
                          {r.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {section.rows.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell>
                          <div className="font-medium">{row.action}</div>
                          {row.note && <div className="text-xs text-muted-foreground">{row.note}</div>}
                        </TableCell>
                        {ALL_ROLES.map((role) => (
                          <TableCell key={role} className="text-center">
                            {editing ? (
                              <select
                                className="h-8 rounded-md border border-input bg-background px-1 text-xs"
                                value={effective(row.key, role)}
                                onChange={(e) => setLevel(row.key, role, e.target.value as Level)}
                                aria-label={`${row.action} — ${role}`}
                              >
                                {LEVELS.map((l) => (
                                  <option key={l.value} value={l.value}>
                                    {l.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <Cell level={effective(row.key, role)} />
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Le profil « Inactif » n'a aucun accès. Le profil « En attente » ne voit rien tant qu'un rôle ne
        lui a pas été attribué depuis la page Utilisateurs.
      </p>
    </div>
  );
}

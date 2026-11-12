import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ROLES, type Level } from "@/lib/permissions-matrix";
import { MODULES, fetchModuleMatrix, moduleLevel, type ModuleMatrix } from "@/lib/module-access";

const OPTIONS: { value: Level; label: string }[] = [
  { value: "full", label: "Accès habituel" },
  { value: "read", label: "Consultation seule" },
  { value: "none", label: "Aucun accès" },
];

/** Réglage par l'administrateur de l'accès de chaque rôle à chaque module (appliqué aussi par la base). */
export function ModuleAccessEditor() {
  const [saved, setSaved] = useState<ModuleMatrix>({});
  const [draft, setDraft] = useState<ModuleMatrix>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const roles = ROLES.filter((r) => r.key !== "admin");

  useEffect(() => {
    fetchModuleMatrix().then((m) => { setSaved(m); setDraft(m); }).finally(() => setLoading(false));
  }, []);

  const set = (mod: string, role: string, level: Level) =>
    setDraft((d) => ({ ...d, [mod]: { ...(d[mod] ?? {}), [role]: level } }));

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const save = async () => {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const rows = MODULES.flatMap((m) => roles.map((r) => ({
      module: m.key, role: r.key, level: moduleLevel(draft, m.key, r.key), updated_by: u.user?.id ?? null,
    })));
    const { error } = await supabase.from("module_access").upsert(rows, { onConflict: "module,role" });
    setSaving(false);
    if (error) return toast.error("Enregistrement impossible : " + error.message);
    setSaved(draft);
    toast.success("Accès par module enregistrés");
  };

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Accès par module</CardTitle>
          <CardDescription>
            « Accès habituel » applique les règles détaillées ci-dessous. « Consultation seule » refuse toute création,
            modification ou suppression. « Aucun accès » retire le module du menu. L'administrateur garde toujours tous les accès.
          </CardDescription>
        </div>
        <Button size="sm" onClick={save} disabled={saving || !dirty}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Enregistrer
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[220px]">Module</TableHead>
                {roles.map((r) => <TableHead key={r.key} className="text-center whitespace-nowrap">{r.label}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {MODULES.map((m) => (
                <TableRow key={m.key}>
                  <TableCell className="font-medium">{m.label}</TableCell>
                  {roles.map((r) => (
                    <TableCell key={r.key} className="text-center">
                      <select
                        className="h-8 rounded-md border border-input bg-background px-1 text-xs"
                        value={moduleLevel(draft, m.key, r.key)}
                        onChange={(e) => set(m.key, r.key, e.target.value as Level)}
                        aria-label={`${m.label} — ${r.label}`}
                      >
                        {OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

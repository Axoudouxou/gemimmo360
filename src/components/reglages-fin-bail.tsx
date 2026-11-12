import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type P = { id: string; email: string | null; role: string };
const AUTO = "__auto__";

export function ReglagesFinBail() {
  const [profiles, setProfiles] = useState<P[]>([]);
  const [tech, setTech] = useState(AUTO);
  const [fin, setFin] = useState(AUTO);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("id, email, role").not("role", "in", "(en_attente,inactif)").order("email"),
        supabase.from("reglages_fin_bail").select("technique_user_id, finance_user_id").eq("id", 1).maybeSingle(),
      ]);
      setProfiles((p ?? []) as P[]);
      setTech(r?.technique_user_id ?? AUTO);
      setFin(r?.finance_user_id ?? AUTO);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("reglages_fin_bail").upsert({
      id: 1, technique_user_id: tech === AUTO ? null : tech, finance_user_id: fin === AUTO ? null : fin,
      updated_by: u.user?.id ?? null, updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Réglage enregistré");
  };

  const picker = (value: string, set: (v: string) => void, roles: string[]) => (
    <Select value={value} onValueChange={set}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={AUTO}>Comportement actuel (automatique)</SelectItem>
        {profiles.filter((p) => roles.includes(p.role)).map((p) => <SelectItem key={p.id} value={p.id}>{p.email ?? p.id}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Destinataires des tâches de fin de bail</CardTitle>
        <CardDescription>Personnes qui reçoivent automatiquement les tâches créées à la fin d'un bail.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>Tâche technique (état des lieux de sortie)</Label>
          {picker(tech, setTech, ["technique", "technico_commercial", "admin", "direction"])}
        </div>
        <div className="grid gap-2">
          <Label>Tâche finance (décompte de sortie)</Label>
          {picker(fin, setFin, ["recouvrement", "admin", "direction"])}
        </div>
        <div className="sm:col-span-2"><Button onClick={save} disabled={saving}>{saving ? "..." : "Enregistrer"}</Button></div>
      </CardContent>
    </Card>
  );
}

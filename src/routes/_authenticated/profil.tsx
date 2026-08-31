import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/profil")({
  head: () => ({ meta: [{ title: "Mon profil — GEM Immobilier" }] }),
  component: ProfilPage,
});

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  direction: "Direction",
  gestion_locative: "Gestion locative",
  recouvrement: "Recouvrement",
  technique: "Technique",
  juridique: "Juridique",
  commercial: "Commercial",
  technico_commercial: "Technico-commercial",
};

function ProfilPage() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [lastSignIn, setLastSignIn] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const user = u.user;
      if (!user) return;
      setEmail(user.email ?? "");
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, last_sign_in_at")
        .eq("id", user.id)
        .maybeSingle();
      if (profile) {
        setRole(profile.role ?? "");
        setLastSignIn((profile as { last_sign_in_at: string | null }).last_sign_in_at ?? user.last_sign_in_at ?? null);
      }
    })();
  }, []);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return toast.error("Le mot de passe doit contenir au moins 8 caractères.");
    if (pw !== pw2) return toast.error("Les mots de passe ne correspondent pas.");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Mot de passe mis à jour.");
    setPw("");
    setPw2("");
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <div>
        <h1 className="text-3xl">Mon profil</h1>
        <p className="mt-1 text-sm text-muted-foreground">Vos informations personnelles et sécurité.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Informations</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Email</Label>
            <Input value={email} readOnly disabled />
          </div>
          <div>
            <Label>Rôle</Label>
            <div className="mt-1">
              <Badge variant="secondary">{ROLE_LABELS[role] ?? role ?? "—"}</Badge>
            </div>
          </div>
          <div>
            <Label>Dernière connexion</Label>
            <p className="text-sm text-muted-foreground">
              {lastSignIn
                ? format(new Date(lastSignIn), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr })
                : "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Changer mon mot de passe</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-3">
            <div>
              <Label htmlFor="pw">Nouveau mot de passe</Label>
              <Input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} required />
              <p className="mt-1 text-xs text-muted-foreground">8 caractères minimum.</p>
            </div>
            <div>
              <Label htmlFor="pw2">Confirmation</Label>
              <Input id="pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} minLength={8} required />
            </div>
            <Button type="submit" disabled={saving}>Enregistrer</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Building2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Connexion — Gestion Immobilière" },
      { name: "description", content: "Accès à l'espace interne de l'agence immobilière." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.session.user.id)
        .maybeSingle();
      if (profile?.role === "en_attente") {
        await supabase.auth.signOut();
        navigate({ to: "/compte-en-attente", replace: true });
        return;
      }
      navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      return toast.error(error.message);
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();
    setLoading(false);
    if (!profile || profile.role === "en_attente") {
      await supabase.auth.signOut();
      navigate({ to: "/compte-en-attente", replace: true });
      return;
    }
    // Best-effort : enregistre la date de dernière connexion sur le profil
    void supabase.from("profiles").update({ last_sign_in_at: new Date().toISOString() }).eq("id", data.user.id);
    navigate({ to: "/dashboard", replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-6">
        <Link to="/" className="flex items-center justify-center gap-2 text-foreground">
          <Building2 className="h-6 w-6" />
          <span className="text-lg font-semibold">GEM Immobilier</span>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Espace interne</CardTitle>
            <CardDescription>Connectez-vous à votre compte agence.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="si-email">Email</Label>
                <Input id="si-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="si-pw">Mot de passe</Label>
                <Input id="si-pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Connexion..." : "Se connecter"}
              </Button>
            </form>
            <p className="mt-6 text-center text-xs text-muted-foreground">
              Les comptes sont créés par l'administrateur. Contactez GEM Immobilier pour obtenir un accès.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

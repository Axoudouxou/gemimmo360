import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Home, FileText, AlertTriangle, Contact as ContactIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Tableau de bord — GEM Immobilier" },
      { name: "description", content: "Vue d'ensemble de l'activité de l'agence." },
    ],
  }),
  component: Dashboard,
});

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrateur",
  gestion_locative: "Gestion locative",
  recouvrement: "Recouvrement",
  technique: "Technique",
  juridique: "Juridique",
  commercial: "Commercial",
};

function Dashboard() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [stats, setStats] = useState({
    biens: 0,
    contacts: 0,
    contratsActifs: 0,
    impayesRetard: 0,
  });

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (user) {
        setEmail(user.email ?? "");
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        if (profile?.role) setRole(profile.role);
      }

      const [biens, contacts, contrats, impayes] = await Promise.all([
        supabase.from("biens").select("id", { count: "exact", head: true }),
        supabase.from("contacts").select("id", { count: "exact", head: true }),
        supabase.from("contrats").select("id", { count: "exact", head: true }).eq("statut", "actif"),
        supabase.from("impayes").select("id", { count: "exact", head: true }).eq("statut", "en_retard"),
      ]);

      setStats({
        biens: biens.count ?? 0,
        contacts: contacts.count ?? 0,
        contratsActifs: contrats.count ?? 0,
        impayesRetard: impayes.count ?? 0,
      });
    })();
  }, []);

  const cards = [
    { label: "Biens", value: stats.biens, icon: Home },
    { label: "Contrats actifs", value: stats.contratsActifs, icon: FileText },
    { label: "Impayés en retard", value: stats.impayesRetard, icon: AlertTriangle },
    { label: "Contacts", value: stats.contacts, icon: ContactIcon },
  ];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl">Tableau de bord</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {email ? `Connecté en tant que ${email}` : "Bienvenue"}
          {role ? ` — ${ROLE_LABELS[role] ?? role}` : ""}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-semibold text-foreground">
                {c.label}
              </CardTitle>
              <c.icon className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-primary">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

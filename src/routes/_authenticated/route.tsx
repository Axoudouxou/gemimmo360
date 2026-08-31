import { createFileRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { GlobalSearch } from "@/components/global-search";
import { NotificationsBell } from "@/components/notifications-bell";


export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!profile || profile.role === "en_attente") {
      await supabase.auth.signOut();
      throw redirect({ to: "/compte-en-attente" });
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
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
  inactif: "Compte désactivé",
  en_attente: "Compte en attente d'activation",
};

function initialsFrom(email: string) {
  const base = email.split("@")[0] ?? "";
  const parts = base.split(/[._-]+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return (letters || base.slice(0, 2) || "?").toUpperCase();
}

function AuthenticatedLayout() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) return;
      setEmail(user.email ?? "");
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.role) setRole(profile.role);
    })();
  }, []);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b bg-card px-4 gap-3">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            </div>
            <div className="flex-1 flex justify-center px-4">
              <GlobalSearch />
            </div>
            <div className="flex items-center gap-3">
              <NotificationsBell />
              <Link

                to="/profil"
                className="flex items-center gap-3 rounded-md px-1.5 py-1 hover:bg-muted transition-colors"
                aria-label="Mon profil"
              >
                <div className="hidden sm:flex flex-col items-end leading-tight">
                  <span className="text-sm font-medium text-foreground truncate max-w-[220px]">
                    {email || "—"}
                  </span>
                  {role && (
                    <span className="text-[11px] text-muted-foreground">
                      {ROLE_LABELS[role] ?? role}
                    </span>
                  )}
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold ring-1 ring-primary/20">
                  {email ? initialsFrom(email) : "?"}
                </div>
              </Link>
            </div>
          </header>
          <main className="flex-1">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

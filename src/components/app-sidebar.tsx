import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Building2,
  LayoutDashboard,
  Home,
  Contact as ContactIcon,
  FileText,
  AlertTriangle,
  Receipt,
  Hammer,
  MessageSquareWarning,
  ClipboardCheck,
  Handshake,
  Users,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
};

const ITEMS: NavItem[] = [
  { title: "Tableau de bord", url: "/dashboard", icon: LayoutDashboard },
  { title: "Biens", url: "/biens", icon: Home },
  { title: "Contacts", url: "/contacts", icon: ContactIcon },
  { title: "Contrats", url: "/contrats", icon: FileText, roles: ["admin", "juridique", "gestion_locative"] },
  { title: "Impayés", url: "/impayes", icon: AlertTriangle, roles: ["admin", "recouvrement"] },
  { title: "Charges", url: "/charges", icon: Receipt, roles: ["admin", "gestion_locative"] },
  { title: "Travaux", url: "/travaux", icon: Hammer },
  { title: "Réclamations", url: "/reclamations", icon: MessageSquareWarning },
  { title: "États des lieux", url: "/etats-des-lieux", icon: ClipboardCheck, roles: ["admin", "juridique", "gestion_locative"] },
  { title: "Transactions", url: "/transactions", icon: Handshake, roles: ["admin", "commercial"] },
  { title: "Utilisateurs", url: "/users", icon: Users, roles: ["admin"] },
];

export function AppSidebar() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [role, setRole] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.role) setRole(profile.role);
    })();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Déconnecté");
    navigate({ to: "/auth", replace: true });
  };

  const visible = ITEMS.filter((i) => !i.roles || i.roles.includes(role));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-3">
          <Building2 className="h-6 w-6 text-primary" />
          <span className="font-bold text-primary">GEM Immobilier</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visible.map((item) => {
                const active = pathname === item.url;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link
                        to={item.url}
                        className={
                          active
                            ? "font-semibold text-primary"
                            : "text-foreground"
                        }
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOut} className="text-foreground">
              <LogOut className="h-4 w-4" />
              <span>Déconnexion</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

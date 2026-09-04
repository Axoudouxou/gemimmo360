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
  Upload,
  Users2,
  ShieldCheck,
  CalendarDays,
  LogOut,
  HelpCircle,
  Landmark,
  Archive,


} from "lucide-react";
import { toast } from "sonner";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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
  allowUserIds?: string[];
};

// Overrides individuels (accès étendu par utilisateur)
const CHRISTELLE_KOUASSI_ID = "2f7ca4a8-1730-4d83-88fb-3faa423dcaf6";

const OVERVIEW: NavItem[] = [
  { title: "Tableau de bord", url: "/dashboard", icon: LayoutDashboard },
  { title: "Calendrier", url: "/calendrier", icon: CalendarDays },
  { title: "Aide", url: "/aide", icon: HelpCircle },
];

const NON_RECOUVREMENT = ["admin", "direction", "juridique", "gestion_locative", "technique", "commercial", "technico_commercial"];

const GESTION: NavItem[] = [
  { title: "Biens", url: "/biens", icon: Home },
  { title: "Contacts", url: "/contacts", icon: ContactIcon },
  { title: "Contrats", url: "/contrats", icon: FileText },
  { title: "États des lieux", url: "/etats-des-lieux", icon: ClipboardCheck, roles: NON_RECOUVREMENT, allowUserIds: [CHRISTELLE_KOUASSI_ID] },
];

const FINANCE: NavItem[] = [
  { title: "Impayés", url: "/echeances", icon: AlertTriangle, roles: ["admin", "direction", "recouvrement", "commercial", "technico_commercial", "gestion_locative", "juridique"] },
  { title: "Impayés (archive)", url: "/impayes", icon: Archive, roles: ["admin"] },
  { title: "Charges", url: "/charges", icon: Receipt, roles: ["admin", "direction", "gestion_locative", "commercial", "technico_commercial", "technique", "juridique"], allowUserIds: [CHRISTELLE_KOUASSI_ID] },

  { title: "Transactions", url: "/transactions", icon: Handshake, roles: ["admin", "direction", "commercial", "technico_commercial"], allowUserIds: [CHRISTELLE_KOUASSI_ID] },
  { title: "Fiscalité", url: "/fiscalite", icon: Landmark, roles: ["admin", "direction", "juridique"] },
];

const OPS: NavItem[] = [
  { title: "Travaux", url: "/travaux", icon: Hammer, roles: NON_RECOUVREMENT, allowUserIds: [CHRISTELLE_KOUASSI_ID] },
  { title: "Réclamations", url: "/reclamations", icon: MessageSquareWarning, roles: NON_RECOUVREMENT, allowUserIds: [CHRISTELLE_KOUASSI_ID] },
];

const ADMIN: NavItem[] = [
  { title: "Import CSV", url: "/imports", icon: Upload, roles: ["admin"] },
  { title: "Doublons", url: "/doublons", icon: Users2, roles: ["admin"] },
  { title: "Utilisateurs", url: "/users", icon: Users, roles: ["admin"] },
  { title: "Matrice des accès", url: "/permissions", icon: ShieldCheck, roles: ["admin", "direction"] },
];

export function AppSidebar() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [role, setRole] = useState<string>("");
  const [userId, setUserId] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) return;
      setUserId(user.id);
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

  const filter = (items: NavItem[]) =>
    items.filter((i) => !i.roles || i.roles.includes(role) || (i.allowUserIds?.includes(userId) ?? false));

  const renderGroup = (label: string, items: NavItem[]) => {
    const visible = filter(items);
    if (visible.length === 0) return null;
    return (
      <SidebarGroup>
        <SidebarGroupLabel className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {visible.map((item) => {
              const active = pathname === item.url;
              return (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={active}
                    className={
                      active
                        ? "relative bg-accent text-accent-foreground font-medium before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r before:bg-primary hover:bg-accent"
                        : "text-foreground/80 hover:text-foreground hover:bg-muted transition-colors"
                    }
                  >
                    <Link to={item.url}>
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
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-foreground">GEM Immobilier</span>
            <span className="text-[11px] text-muted-foreground">Espace interne</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-1">
        {renderGroup("Aperçu", OVERVIEW)}
        {renderGroup("Gestion", GESTION)}
        {renderGroup("Finance", FINANCE)}
        {renderGroup("Opérations", OPS)}
        {renderGroup("Administration", ADMIN)}
      </SidebarContent>
      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleSignOut}
              className="text-foreground/80 hover:text-foreground transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span>Déconnexion</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

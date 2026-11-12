import { useRouterState, Link } from "@tanstack/react-router";
import { ShieldOff, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { moduleForPath, useModuleAccess } from "@/lib/module-access";

/** Applique la matrice des accès par module à la page affichée. */
export function ModuleGate({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { ready, levelOf } = useModuleAccess();
  const mod = moduleForPath(pathname);
  if (!mod || !ready) return <>{children}</>;
  const level = levelOf(mod.key);
  if (level === "none")
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-16 text-center">
        <ShieldOff className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Accès non autorisé</h1>
        <p className="text-sm text-muted-foreground">Votre profil n'a pas accès au module « {mod.label} ».</p>
        <Button asChild variant="outline"><Link to="/dashboard">Retour au tableau de bord</Link></Button>
      </div>
    );
  return (
    <>
      {level === "read" && (
        <div className="flex items-center gap-2 border-b bg-muted px-4 py-2 text-sm text-muted-foreground">
          <Eye className="h-4 w-4" /> Consultation seule : vos modifications dans « {mod.label} » seront refusées.
        </div>
      )}
      {children}
    </>
  );
}

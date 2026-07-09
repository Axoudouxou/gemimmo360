import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/compte-en-attente")({
  head: () => ({
    meta: [
      { title: "Compte en attente — GEM Immobilier" },
      { name: "description", content: "Votre compte n'a pas encore été activé." },
    ],
  }),
  component: PendingPage,
});

function PendingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-6">
        <Link to="/" className="flex items-center justify-center gap-2 text-foreground">
          <Building2 className="h-6 w-6" />
          <span className="text-lg font-semibold">GEM Immobilier</span>
        </Link>
        <Card>
          <CardHeader className="items-center text-center">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <Clock className="h-6 w-6" />
            </div>
            <CardTitle>Compte en attente d'activation</CardTitle>
            <CardDescription>
              Votre compte n'a pas encore été activé par un administrateur.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              Merci de contacter GEM Immobilier pour que votre accès soit configuré.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/auth">Retour à la connexion</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

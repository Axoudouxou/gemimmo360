import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/unsubscribe")({
  head: () => ({
    meta: [
      { title: "Désabonnement — GEM Immobilier" },
      { name: "description", content: "Se désabonner des emails GEM Immobilier." },
    ],
  }),
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const [state, setState] = useState<"loading" | "valid" | "already" | "invalid" | "done" | "error">("loading");
  const [submitting, setSubmitting] = useState(false);
  const token = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") : null;

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.valid) setState("valid");
        else if (d?.reason === "already_unsubscribed") setState("already");
        else setState("invalid");
      })
      .catch(() => setState("error"));
  }, [token]);

  async function confirm() {
    if (!token) return;
    setSubmitting(true);
    try {
      const r = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const d = await r.json();
      if (d?.success) setState("done");
      else if (d?.reason === "already_unsubscribed") setState("already");
      else setState("error");
    } catch {
      setState("error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Désabonnement des emails</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === "loading" && <p className="text-sm text-muted-foreground">Vérification…</p>}
          {state === "valid" && (
            <>
              <p className="text-sm">Confirmez que vous ne souhaitez plus recevoir d'emails de notification du CRM GEM Immobilier.</p>
              <Button onClick={confirm} disabled={submitting} className="w-full">
                {submitting ? "…" : "Confirmer le désabonnement"}
              </Button>
            </>
          )}
          {state === "already" && <p className="text-sm">Vous êtes déjà désabonné. Aucune action nécessaire.</p>}
          {state === "done" && <p className="text-sm text-green-600">Vous êtes désormais désabonné. Vous ne recevrez plus d'emails.</p>}
          {state === "invalid" && <p className="text-sm text-destructive">Lien invalide ou expiré.</p>}
          {state === "error" && <p className="text-sm text-destructive">Une erreur est survenue. Réessayez plus tard.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

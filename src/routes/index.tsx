import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Immo360 — GEM Immobilier" },
    { name: "description", content: "Espace de gestion immobilière GEM : contrats, activités et suivi financier." },
    { property: "og:title", content: "Immo360 — GEM Immobilier" },
    { property: "og:description", content: "Espace de gestion immobilière GEM : contrats, activités et suivi financier." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  ssr: false,
  beforeLoad: async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    throw redirect({ to: data.session ? "/dashboard" : "/auth" });
  },
});

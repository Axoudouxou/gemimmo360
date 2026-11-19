import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * API de synchronisation en LECTURE SEULE pour GEM Finance.
 * GET /api/public/gem-finance/sync?resource=biens|proprietaires|loyers|paiements|decomptes&since=ISO&limit=&offset=
 * Auth : header Authorization: Bearer <GEM_FINANCE_API_KEY>.
 */
const Query = z.object({
  resource: z.enum(["biens", "proprietaires", "loyers", "paiements", "decomptes"]),
  since: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
  offset: z.coerce.number().int().min(0).default(0),
});

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const Route = createFileRoute("/api/public/gem-finance/sync")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const key = process.env.GEM_FINANCE_API_KEY;
        if (!key) return Response.json({ error: "Not configured" }, { status: 503 });
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
        if (!token || !safeEqual(token, key)) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const parsed = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
        if (!parsed.success) return Response.json({ error: "Invalid query", details: parsed.error.flatten() }, { status: 400 });
        const { resource, since, limit, offset } = parsed.data;
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const syncedAt = new Date().toISOString();
        const from = since ?? "1970-01-01T00:00:00Z";
        const range = [offset, offset + limit - 1] as const;
        let items: unknown[] = [];

        if (resource === "biens") {
          // Un bien est « modifié » si lui-même ou un de ses lots a changé.
          const { data: lotIds } = await db.from("lots").select("bien_id").gte("updated_at", from);
          const ids = [...new Set((lotIds ?? []).map((l) => l.bien_id))];
          let q = db.from("biens")
            .select("id, reference:id_externe, titre, adresse, type_bien, type_operation, statut, archive, date_fin_gestion, bailleur_id, updated_at, lots(id, label, type_lot, statut, updated_at)")
            .order("updated_at").order("id").range(...range);
          q = ids.length ? q.or(`updated_at.gte.${from},id.in.(${ids.join(",")})`) : q.gte("updated_at", from);
          const { data, error } = await q; if (error) throw error; items = data ?? [];
        } else if (resource === "proprietaires") {
          const { data: bs } = await db.from("biens").select("bailleur_id").not("bailleur_id", "is", null);
          const ids = [...new Set((bs ?? []).map((b) => b.bailleur_id as string))];
          if (ids.length) {
            const { data, error } = await db.from("contacts")
              .select("id, reference:id_externe, nom, prenom, type_entite, interlocuteur, telephone, email, archive, updated_at")
              .in("id", ids).gte("updated_at", from).order("updated_at").order("id").range(...range);
            if (error) throw error; items = data ?? [];
          }
        } else if (resource === "loyers") {
          const { data, error } = await db.from("echeances")
            .select("id, contrat_id, periode, date_echeance, montant_du, montant_encaisse:montant_affecte, statut, updated_at, contrats(lot_id, loyer_mensuel, statut, lots(bien_id))")
            .gte("updated_at", from).order("updated_at").order("id").range(...range);
          if (error) throw error;
          items = (data ?? []).map((e) => ({ ...e, reste_du: Math.max(0, Number(e.montant_du) - Number(e.montant_encaisse)) }));
        } else if (resource === "paiements") {
          const { data, error } = await db.from("paiements")
            .select("id, contrat_id, date_paiement, montant, moyen_paiement, reference, updated_at, affectations(echeance_id, montant)")
            .gte("updated_at", from).order("updated_at").order("id").range(...range);
          if (error) throw error; items = data ?? [];
        } else {
          const { data, error } = await db.from("decomptes")
            .select("id, numero:numero_affiche, bien_id, periodicite, periode_debut, donnees, pdf_path, created_at, updated_at, deleted_at, biens(id_externe, titre)")
            .gte("updated_at", from).order("updated_at").order("id").range(...range);
          if (error) throw error;
          items = await Promise.all((data ?? []).map(async (d) => {
            const x = d.donnees as Record<string, number | string>;
            let pdf_url: string | null = null;
            if (d.pdf_path && !d.deleted_at) {
              const s = await db.storage.from("decomptes-pdf").createSignedUrl(d.pdf_path, 3600);
              pdf_url = s.data?.signedUrl ?? null;
            }
            const b = d.biens as { id_externe: string | null; titre: string } | null;
            return {
              id: d.id, numero: d.numero, bien_id: d.bien_id, bien_reference: b?.id_externe ?? null, bien_titre: b?.titre ?? null,
              periodicite: d.periodicite, periode_debut: d.periode_debut,
              taux_honoraires: x.tauxHonoraires ?? null, honoraires_gestion: x.honorairesGestion ?? null,
              loyers_encaisses: x.totalLoyers ?? null, total_charges: x.totalCharges ?? null, total_travaux: x.totalTravaux ?? null,
              total_honoraires_fiscaux: x.totalHonorairesFiscaux ?? null, net_a_reverser: x.net ?? null,
              pdf_url, pdf_url_expires_in: pdf_url ? 3600 : null,
              created_at: d.created_at, updated_at: d.updated_at, deleted_at: d.deleted_at,
            };
          }));
        }
        return Response.json({ resource, since: since ?? null, synced_at: syncedAt, offset, limit, count: items.length, has_more: items.length === limit, items });
      },
    },
  },
});

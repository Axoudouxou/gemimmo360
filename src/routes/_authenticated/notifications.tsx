import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Check, CheckCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — GEM Immobilier" },
      { name: "description", content: "Toutes vos notifications GEM Immobilier : tâches, travaux, réclamations et impayés." },
      { property: "og:title", content: "Notifications — GEM Immobilier" },
      { property: "og:description", content: "Toutes vos notifications GEM Immobilier : tâches, travaux, réclamations et impayés." },
    ],
  }),
  component: NotificationsPage,
});

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read: boolean;
  created_at: string;
};

const ENTITY_ROUTE: Record<string, string> = {
  activite: "/calendrier",
  travaux: "/travaux",
  reclamation: "/reclamations",
  impaye: "/impayes",
};

const PAGE_SIZE = 50;

function dateLabel(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function NotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (pageIndex: number, mode: "all" | "unread") => {
      setLoading(true);
      let q = supabase
        .from("notifications")
        .select("id, type, title, message, link, entity_type, entity_id, read, created_at")
        .order("created_at", { ascending: false })
        .range(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE - 1);
      if (mode === "unread") q = q.eq("read", false);
      const { data } = await q;
      const rows = (data ?? []) as Notification[];
      setHasMore(rows.length === PAGE_SIZE);
      setItems((prev) => (pageIndex === 0 ? rows : [...prev, ...rows]));
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    setPage(0);
    load(0, filter);
  }, [filter, load]);

  async function markOne(id: string) {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setItems((prev) =>
      filter === "unread"
        ? prev.filter((n) => n.id !== id)
        : prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }

  async function markAllRead() {
    await supabase.from("notifications").update({ read: true }).eq("read", false);
    setPage(0);
    load(0, filter);
  }

  async function openItem(n: Notification) {
    if (!n.read) await markOne(n.id);
    const route = n.entity_type ? ENTITY_ROUTE[n.entity_type] : undefined;
    if (route && n.entity_id) {
      navigate({ to: route as never, search: { open: n.entity_id } as never });
    } else if (n.link) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navigate({ to: n.link as any });
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Bell className="h-5 w-5" /> Notifications
        </h1>
        <div className="flex items-center gap-2">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as "all" | "unread")}>
            <TabsList>
              <TabsTrigger value="all">Toutes</TabsTrigger>
              <TabsTrigger value="unread">Non lues</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <CheckCheck className="mr-1 h-4 w-4" /> Tout marquer lu
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm text-muted-foreground">
            {items.length} notification{items.length > 1 ? "s" : ""} affichée{items.length > 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {items.length === 0 && !loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Aucune notification</div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted/50 ${!n.read ? "bg-primary/5" : ""}`}
                  onClick={() => openItem(n)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {!n.read && <span className="h-2 w-2 flex-none rounded-full bg-primary" />}
                      <p className="truncate text-sm font-medium">{n.title}</p>
                    </div>
                    {n.message && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">{dateLabel(n.created_at)}</p>
                  </div>
                  {!n.read && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => { e.stopPropagation(); markOne(n.id); }}
                      aria-label="Marquer comme lu"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {hasMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => {
              const next = page + 1;
              setPage(next);
              load(next, filter);
            }}
          >
            {loading ? "Chargement..." : "Afficher plus"}
          </Button>
        </div>
      )}
    </div>
  );
}


ALTER TABLE public.biens ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.lots ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.contrats ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_biens_updated_at ON public.biens;
CREATE TRIGGER trg_biens_updated_at BEFORE UPDATE ON public.biens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_lots_updated_at ON public.lots;
CREATE TRIGGER trg_lots_updated_at BEFORE UPDATE ON public.lots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_contrats_updated_at ON public.contrats;
CREATE TRIGGER trg_contrats_updated_at BEFORE UPDATE ON public.contrats FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_contacts_updated_at ON public.contacts;
CREATE TRIGGER trg_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Data cleanup: keep only the most recent 'actif' contract per lot
WITH ranked AS (
  SELECT id, lot_id,
         ROW_NUMBER() OVER (PARTITION BY lot_id ORDER BY COALESCE(date_debut, created_at::date) DESC, created_at DESC) AS rn
  FROM public.contrats
  WHERE statut = 'actif'
)
UPDATE public.contrats c
SET statut = 'termine',
    date_fin = COALESCE(c.date_fin, CURRENT_DATE)
FROM ranked r
WHERE c.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS contrats_lot_actif_unique
  ON public.contrats(lot_id) WHERE statut = 'actif';

CREATE TABLE IF NOT EXISTS public.contact_doublons_ignores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_a_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  contact_b_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  CONSTRAINT contact_doublons_pair_order CHECK (contact_a_id < contact_b_id),
  UNIQUE (contact_a_id, contact_b_id)
);

GRANT SELECT, INSERT, DELETE ON public.contact_doublons_ignores TO authenticated;
GRANT ALL ON public.contact_doublons_ignores TO service_role;

ALTER TABLE public.contact_doublons_ignores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view doublons ignores" ON public.contact_doublons_ignores
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert doublons ignores" ON public.contact_doublons_ignores
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete doublons ignores" ON public.contact_doublons_ignores
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

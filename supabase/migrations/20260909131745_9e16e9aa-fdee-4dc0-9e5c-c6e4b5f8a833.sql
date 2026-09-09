DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM public.echeances WHERE service_en_charge = 'juridique' LOOP
    UPDATE public.echeances SET service_en_charge = 'recouvrement' WHERE id = r.id;
    UPDATE public.echeances SET service_en_charge = 'juridique' WHERE id = r.id;
  END LOOP;
END $$;
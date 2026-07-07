ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_type_contact_check;
UPDATE public.contacts SET type_contact = NULL WHERE type_contact NOT IN ('bailleur','locataire','prospect','prestataire');
ALTER TABLE public.contacts ADD CONSTRAINT contacts_type_contact_check CHECK (type_contact IN ('bailleur','locataire','prospect','prestataire'));
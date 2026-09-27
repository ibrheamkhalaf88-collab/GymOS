-- Contact messages table (public)
-- Stores messages sent via the contact form.
-- RLS: disabled; served only via the gymos-api Edge Function (service_role).

-- Drop any leftover rows from an earlier run.
DELETE FROM public.contact_messages;

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 120),
  email TEXT NOT NULL CHECK (char_length(email) >= 3 AND char_length(email) <= 255),
  subject TEXT NOT NULL CHECK (char_length(subject) >= 1 AND char_length(subject) <= 60),
  message TEXT NOT NULL CHECK (char_length(message) >= 10 AND char_length(message) <= 5000),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Only the gymos-api Edge Function (service_role) should touch this table.
REVOKE ALL ON public.contact_messages FROM anon, authenticated;
GRANT ALL ON public.contact_messages TO service_role;

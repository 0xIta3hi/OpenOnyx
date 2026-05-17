-- ============================================================================
-- OpenObsidian Schema v2
-- Self-contained migration for user-owned Supabase databases
--
-- HOW TO USE:
-- 1. Open your Supabase project dashboard
-- 2. Go to SQL Editor
-- 3. Paste this entire file
-- 4. Click "Run"
--
-- This migration is IDEMPOTENT -- safe to run multiple times.
-- It will NOT overwrite or modify any existing user data.
-- ============================================================================

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA extensions;

-- 2. Users table (synced from auth.users via trigger)
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 3. Spaces table
CREATE TABLE IF NOT EXISTS public.spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  helps_with text[],
  is_public boolean NOT NULL DEFAULT false,
  visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('local', 'private', 'public')),
  forked_from uuid REFERENCES public.spaces(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;

-- 4. Notes table
CREATE TABLE IF NOT EXISTS public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  title text NOT NULL,
  path text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted boolean NOT NULL DEFAULT false,
  is_canvas boolean NOT NULL DEFAULT false
);
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- 5. Note chunks table (for embeddings / RAG)
CREATE TABLE IF NOT EXISTS public.note_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  note_id uuid NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  content text NOT NULL,
  embedding vector(384),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.note_chunks ENABLE ROW LEVEL SECURITY;

-- 6. Space embeddings (for explore/discovery)
CREATE TABLE IF NOT EXISTS public.space_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE UNIQUE,
  content text NOT NULL,
  embedding vector(384),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.space_embeddings ENABLE ROW LEVEL SECURITY;

-- 7. Space stats
CREATE TABLE IF NOT EXISTS public.space_stats (
  space_id uuid PRIMARY KEY REFERENCES public.spaces(id) ON DELETE CASCADE,
  views integer NOT NULL DEFAULT 0,
  forks integer NOT NULL DEFAULT 0,
  upvotes integer NOT NULL DEFAULT 0,
  score double precision DEFAULT 0
);
ALTER TABLE public.space_stats ENABLE ROW LEVEL SECURITY;

-- 8. Space votes
CREATE TABLE IF NOT EXISTS public.space_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  value smallint NOT NULL CHECK (value IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, space_id)
);
ALTER TABLE public.space_votes ENABLE ROW LEVEL SECURITY;


-- ════════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_spaces_owner_updated ON public.spaces (owner_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_spaces_visibility ON public.spaces (visibility);
CREATE INDEX IF NOT EXISTS idx_notes_space_updated ON public.notes (space_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_notes_deleted ON public.notes (deleted) WHERE deleted = true;
CREATE INDEX IF NOT EXISTS idx_note_chunks_note_updated ON public.note_chunks (note_id, updated_at);


-- ════════════════════════════════════════════════════════════════════════════
-- AUTO-UPDATE TRIGGERS
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_spaces_updated_at ON public.spaces;
CREATE TRIGGER trg_spaces_updated_at
  BEFORE UPDATE ON public.spaces FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_notes_updated_at ON public.notes;
CREATE TRIGGER trg_notes_updated_at
  BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_note_chunks_updated_at ON public.note_chunks;
CREATE TRIGGER trg_note_chunks_updated_at
  BEFORE UPDATE ON public.note_chunks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ════════════════════════════════════════════════════════════════════════════
-- AUTH TRIGGER (auto-create user profile on signup)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users (id, email, created_at)
  VALUES (NEW.id, NEW.email, now())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Lock down internal functions from API exposure
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY POLICIES
-- ════════════════════════════════════════════════════════════════════════════

-- Users
DO $$ BEGIN
  CREATE POLICY "Users can view their own profile"
    ON public.users FOR SELECT USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own profile"
    ON public.users FOR UPDATE USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own profile"
    ON public.users FOR INSERT WITH CHECK (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Spaces
DO $$ BEGIN
  CREATE POLICY "Users can view their own spaces"
    ON public.spaces FOR SELECT USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Public spaces are viewable by everyone"
    ON public.spaces FOR SELECT USING (visibility = 'public');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own spaces"
    ON public.spaces FOR INSERT WITH CHECK (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own spaces"
    ON public.spaces FOR UPDATE USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete their own spaces"
    ON public.spaces FOR DELETE USING (auth.uid() = owner_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Notes
DO $$ BEGIN
  CREATE POLICY "Notes are viewable if space is public or owned"
    ON public.notes FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.spaces
        WHERE spaces.id = notes.space_id
          AND (spaces.visibility = 'public' OR spaces.owner_id = auth.uid()))
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert notes to their own spaces"
    ON public.notes FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM public.spaces
        WHERE spaces.id = notes.space_id AND spaces.owner_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update notes in their own spaces"
    ON public.notes FOR UPDATE USING (
      EXISTS (SELECT 1 FROM public.spaces
        WHERE spaces.id = notes.space_id AND spaces.owner_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete notes in their own spaces"
    ON public.notes FOR DELETE USING (
      EXISTS (SELECT 1 FROM public.spaces
        WHERE spaces.id = notes.space_id AND spaces.owner_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Note chunks
DO $$ BEGIN
  CREATE POLICY "Users can insert chunks to their own notes"
    ON public.note_chunks FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM public.spaces
        WHERE spaces.id = note_chunks.space_id AND spaces.owner_id = auth.uid())
    );

  CREATE POLICY "Users can update chunks in their own notes"
    ON public.note_chunks FOR UPDATE USING (
      EXISTS (SELECT 1 FROM public.spaces
        WHERE spaces.id = note_chunks.space_id AND spaces.owner_id = auth.uid())
    );

  CREATE POLICY "Users can delete chunks in their own notes"
    ON public.note_chunks FOR DELETE USING (
      EXISTS (SELECT 1 FROM public.spaces
        WHERE spaces.id = note_chunks.space_id AND spaces.owner_id = auth.uid())
    );

  CREATE POLICY "Chunks viewable if space public or owned"
    ON public.note_chunks FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.spaces
        WHERE spaces.id = note_chunks.space_id 
        AND (spaces.visibility = 'public' OR spaces.owner_id = auth.uid()))
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Space embeddings
DO $$ BEGIN
  CREATE POLICY "Space embeddings readable if space accessible"
    ON public.space_embeddings FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.spaces
        WHERE spaces.id = space_embeddings.space_id
          AND (spaces.visibility = 'public' OR spaces.owner_id = auth.uid()))
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can manage embeddings for own spaces"
    ON public.space_embeddings FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM public.spaces
        WHERE spaces.id = space_embeddings.space_id AND spaces.owner_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update embeddings for own spaces"
    ON public.space_embeddings FOR UPDATE USING (
      EXISTS (SELECT 1 FROM public.spaces
        WHERE spaces.id = space_embeddings.space_id AND spaces.owner_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete embeddings for own spaces"
    ON public.space_embeddings FOR DELETE USING (
      EXISTS (SELECT 1 FROM public.spaces
        WHERE spaces.id = space_embeddings.space_id AND spaces.owner_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Space stats
DO $$ BEGIN
  CREATE POLICY "Space stats viewable by everyone"
    ON public.space_stats FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Space votes
DO $$ BEGIN
  CREATE POLICY "Users can view all votes"
    ON public.space_votes FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert their own votes"
    ON public.space_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own votes"
    ON public.space_votes FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete their own votes"
    ON public.space_votes FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ════════════════════════════════════════════════════════════════════════════
-- RPC FUNCTIONS
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.increment_space_views(p_space_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.space_stats (space_id, views) VALUES (p_space_id, 1)
  ON CONFLICT (space_id) DO UPDATE SET views = space_stats.views + 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_space_forks(space_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.space_stats (space_id, forks) VALUES (space_id, 1)
  ON CONFLICT (space_id) DO UPDATE SET forks = space_stats.forks + 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_space_forks(uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.vote_on_space(p_space_id uuid, p_value smallint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.space_votes (user_id, space_id, value)
  VALUES (auth.uid(), p_space_id, p_value)
  ON CONFLICT (user_id, space_id) DO UPDATE SET value = p_value;

  UPDATE public.space_stats
  SET upvotes = (SELECT COALESCE(SUM(value), 0) FROM public.space_votes WHERE space_id = p_space_id)
  WHERE space_id = p_space_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.vote_on_space(uuid, smallint) FROM anon;

-- Vector search: match note chunks by embedding similarity
CREATE OR REPLACE FUNCTION public.match_note_chunks(
  query_embedding vector(384),
  match_threshold float,
  match_count int,
  filter_space_id uuid DEFAULT NULL
)
RETURNS TABLE (id uuid, note_id uuid, note_title text, content text, similarity float)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT nc.id, nc.note_id, n.title, nc.content,
    1 - (nc.embedding <=> query_embedding) AS similarity
  FROM public.note_chunks nc
  JOIN public.notes n ON n.id = nc.note_id
  WHERE nc.embedding IS NOT NULL
    AND n.deleted = false
    AND (filter_space_id IS NULL OR n.space_id = filter_space_id)
    AND 1 - (nc.embedding <=> query_embedding) > match_threshold
  ORDER BY nc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Vector search: match spaces by embedding similarity
CREATE OR REPLACE FUNCTION public.match_spaces(
  query_embedding vector(384),
  match_threshold float,
  match_count int
)
RETURNS TABLE (space_id uuid, title text, description text, similarity float)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT se.space_id, s.title, s.description,
    1 - (se.embedding <=> query_embedding) AS similarity
  FROM public.space_embeddings se
  JOIN public.spaces s ON s.id = se.space_id
  WHERE se.embedding IS NOT NULL
    AND s.visibility = 'public'
    AND 1 - (se.embedding <=> query_embedding) > match_threshold
  ORDER BY se.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;


-- ════════════════════════════════════════════════════════════════════════════
-- DONE
-- ════════════════════════════════════════════════════════════════════════════
-- Schema installation complete. Your Supabase project is now ready for
-- OpenObsidian. Configure the app with your project URL and anon key.

-- ============================================================================
-- MIGRATION: 0001_core_schema.sql
-- PROJECT: IELTS NUANCE MASTERY & REAL-TIME OMNI-SYNC ENGINE
-- TARGET INSTANCE: https://igetygmsrksbhfhismat.supabase.co
-- ARCHITECTURE: Doubt-Driven Development (D3) & Last-Write-Wins (LWW)
-- ============================================================================

BEGIN;

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. LAST-WRITE-WINS TIMESTAMP & CONFLICT RESOLUTION FUNCTION
CREATE OR REPLACE FUNCTION public.update_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Cơ chế Last-Write-Wins (LWW):
  -- Nếu gói tin đồng bộ đến trễ (NEW.updated_at < OLD.updated_at),
  -- giữ nguyên bản ghi mới hơn đang có trên Server để chống ghi đè lùi (Stale Overwrite).
  IF TG_OP = 'UPDATE' THEN
    IF NEW.updated_at IS NOT NULL AND OLD.updated_at IS NOT NULL AND NEW.updated_at < OLD.updated_at THEN
      RETURN OLD;
    END IF;
  END IF;

  -- Nếu client không truyền updated_at mới hơn hoặc bằng thời điểm hiện tại, ép chuẩn UTC NOW()
  IF NEW.updated_at IS NULL OR (TG_OP = 'UPDATE' AND NEW.updated_at = OLD.updated_at) THEN
    NEW.updated_at := timezone('utc'::text, now());
  END IF;

  RETURN NEW;
END;
$$;

-- 3. FUNCTION CẬP NHẬT TSVECTOR TỰ ĐỘNG CHO VOCAB_VAULT
CREATE OR REPLACE FUNCTION public.vocab_vault_tsvector_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.tsvector_search :=
    setweight(to_tsvector('english', COALESCE(NEW.word, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.academic_alternative, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.spoken_idiom, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.nuance, '')), 'C');
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 4. BẢNG 1: synonym_clusters (Bậc thang CEFR B1 -> C2)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.synonym_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  root_concept TEXT NOT NULL CHECK (char_length(trim(root_concept)) > 0),
  tier_b1 TEXT NOT NULL DEFAULT '',
  tier_b2 TEXT NOT NULL DEFAULT '',
  tier_c1 TEXT NOT NULL DEFAULT '',
  tier_c2 TEXT NOT NULL DEFAULT '',
  nuance_matrix JSONB NOT NULL DEFAULT '{"formality": "", "collocation": "", "register_warning": ""}'::jsonb,
  sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_synonym_clusters_updated_at
  ON public.synonym_clusters (updated_at DESC);

DROP TRIGGER IF EXISTS trg_synonym_clusters_lww_timestamp ON public.synonym_clusters;
CREATE TRIGGER trg_synonym_clusters_lww_timestamp
  BEFORE UPDATE ON public.synonym_clusters
  FOR EACH ROW
  EXECUTE FUNCTION public.update_timestamp();

-- ============================================================================
-- 5. BẢNG 2: vocab_vault (Kho từ vựng 15,000+ từ hỗ trợ Full-Text Search)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.vocab_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word TEXT NOT NULL CHECK (char_length(trim(word)) > 0),
  cefr TEXT NOT NULL CHECK (cefr IN ('B1', 'B2', 'C1', 'C2')),
  nuance TEXT NOT NULL DEFAULT '',
  academic_alternative TEXT NOT NULL DEFAULT '',
  spoken_idiom TEXT NOT NULL DEFAULT '',
  cluster_id UUID REFERENCES public.synonym_clusters(id) ON DELETE SET NULL,
  tsvector_search TSVECTOR,
  sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_vocab_vault_tsvector
  ON public.vocab_vault USING GIN (tsvector_search);

CREATE INDEX IF NOT EXISTS idx_vocab_vault_cefr
  ON public.vocab_vault (cefr);

CREATE INDEX IF NOT EXISTS idx_vocab_vault_updated_at
  ON public.vocab_vault (updated_at DESC);

DROP TRIGGER IF EXISTS trg_vocab_vault_tsvector ON public.vocab_vault;
CREATE TRIGGER trg_vocab_vault_tsvector
  BEFORE INSERT OR UPDATE OF word, nuance, academic_alternative, spoken_idiom
  ON public.vocab_vault
  FOR EACH ROW
  EXECUTE FUNCTION public.vocab_vault_tsvector_trigger();

DROP TRIGGER IF EXISTS trg_vocab_vault_lww_timestamp ON public.vocab_vault;
CREATE TRIGGER trg_vocab_vault_lww_timestamp
  BEFORE UPDATE ON public.vocab_vault
  FOR EACH ROW
  EXECUTE FUNCTION public.update_timestamp();

-- ============================================================================
-- 6. BẢNG 3: exercises_vault (Kho câu mẫu AI & Thẻ ôn tập SM-2)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.exercises_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vocab_id UUID REFERENCES public.vocab_vault(id) ON DELETE SET NULL,
  word_target TEXT NOT NULL CHECK (char_length(trim(word_target)) > 0),
  academic_example TEXT NOT NULL DEFAULT '',
  speaking_example TEXT NOT NULL DEFAULT '',
  user_rewrite TEXT NOT NULL DEFAULT '',
  is_draft BOOLEAN NOT NULL DEFAULT true,
  ease_factor NUMERIC(5, 2) NOT NULL DEFAULT 2.50 CHECK (ease_factor >= 1.30),
  interval_days INTEGER NOT NULL DEFAULT 0 CHECK (interval_days >= 0),
  repetitions INTEGER NOT NULL DEFAULT 0 CHECK (repetitions >= 0),
  last_fluency_ms INTEGER NOT NULL DEFAULT 0 CHECK (last_fluency_ms >= 0),
  next_review_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_exercises_vault_next_review
  ON public.exercises_vault (next_review_at ASC);

CREATE INDEX IF NOT EXISTS idx_exercises_vault_updated_at
  ON public.exercises_vault (updated_at DESC);

DROP TRIGGER IF EXISTS trg_exercises_vault_lww_timestamp ON public.exercises_vault;
CREATE TRIGGER trg_exercises_vault_lww_timestamp
  BEFORE UPDATE ON public.exercises_vault
  FOR EACH ROW
  EXECUTE FUNCTION public.update_timestamp();

-- ============================================================================
-- 7. BẢNG 4: srs_logs (Lịch sử chấm điểm phản xạ Micro-Timer & SM-2)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.srs_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES public.exercises_vault(id) ON DELETE CASCADE,
  quality_rating SMALLINT NOT NULL CHECK (quality_rating IN (0, 1, 2, 3)),
  time_spent_ms INTEGER NOT NULL CHECK (time_spent_ms >= 0),
  previous_interval INTEGER NOT NULL DEFAULT 0,
  new_interval INTEGER NOT NULL DEFAULT 0,
  previous_ease NUMERIC(5, 2) NOT NULL DEFAULT 2.50,
  new_ease NUMERIC(5, 2) NOT NULL DEFAULT 2.50,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_srs_logs_exercise_id
  ON public.srs_logs (exercise_id, reviewed_at DESC);

DROP TRIGGER IF EXISTS trg_srs_logs_lww_timestamp ON public.srs_logs;
CREATE TRIGGER trg_srs_logs_lww_timestamp
  BEFORE UPDATE ON public.srs_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_timestamp();

-- ============================================================================
-- 8. BẬT ROW LEVEL SECURITY (RLS) CHO TOÀN BỘ 4 BẢNG
-- ============================================================================
ALTER TABLE public.synonym_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vocab_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.srs_logs ENABLE ROW LEVEL SECURITY;

-- Xóa policy cũ nếu chạy lại script nhiều lần (Idempotent Migration)
DROP POLICY IF EXISTS "anon_select_synonym_clusters" ON public.synonym_clusters;
DROP POLICY IF EXISTS "anon_insert_synonym_clusters" ON public.synonym_clusters;
DROP POLICY IF EXISTS "anon_update_synonym_clusters" ON public.synonym_clusters;

CREATE POLICY "anon_select_synonym_clusters"
  ON public.synonym_clusters FOR SELECT
  TO anon, authenticated
  USING (auth.role() IN ('anon', 'authenticated') AND id IS NOT NULL);

CREATE POLICY "anon_insert_synonym_clusters"
  ON public.synonym_clusters FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    auth.role() IN ('anon', 'authenticated')
    AND char_length(trim(root_concept)) > 0
  );

CREATE POLICY "anon_update_synonym_clusters"
  ON public.synonym_clusters FOR UPDATE
  TO anon, authenticated
  USING (auth.role() IN ('anon', 'authenticated'))
  WITH CHECK (
    auth.role() IN ('anon', 'authenticated')
    AND char_length(trim(root_concept)) > 0
  );

-- Policy cho bảng vocab_vault
DROP POLICY IF EXISTS "anon_select_vocab_vault" ON public.vocab_vault;
DROP POLICY IF EXISTS "anon_insert_vocab_vault" ON public.vocab_vault;
DROP POLICY IF EXISTS "anon_update_vocab_vault" ON public.vocab_vault;

CREATE POLICY "anon_select_vocab_vault"
  ON public.vocab_vault FOR SELECT
  TO anon, authenticated
  USING (auth.role() IN ('anon', 'authenticated') AND id IS NOT NULL);

CREATE POLICY "anon_insert_vocab_vault"
  ON public.vocab_vault FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    auth.role() IN ('anon', 'authenticated')
    AND char_length(trim(word)) > 0
    AND cefr IN ('B1', 'B2', 'C1', 'C2')
  );

CREATE POLICY "anon_update_vocab_vault"
  ON public.vocab_vault FOR UPDATE
  TO anon, authenticated
  USING (auth.role() IN ('anon', 'authenticated'))
  WITH CHECK (
    auth.role() IN ('anon', 'authenticated')
    AND char_length(trim(word)) > 0
    AND cefr IN ('B1', 'B2', 'C1', 'C2')
  );

-- Policy cho bảng exercises_vault
DROP POLICY IF EXISTS "anon_select_exercises_vault" ON public.exercises_vault;
DROP POLICY IF EXISTS "anon_insert_exercises_vault" ON public.exercises_vault;
DROP POLICY IF EXISTS "anon_update_exercises_vault" ON public.exercises_vault;

CREATE POLICY "anon_select_exercises_vault"
  ON public.exercises_vault FOR SELECT
  TO anon, authenticated
  USING (auth.role() IN ('anon', 'authenticated') AND id IS NOT NULL);

CREATE POLICY "anon_insert_exercises_vault"
  ON public.exercises_vault FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    auth.role() IN ('anon', 'authenticated')
    AND char_length(trim(word_target)) > 0
    AND ease_factor >= 1.30
  );

CREATE POLICY "anon_update_exercises_vault"
  ON public.exercises_vault FOR UPDATE
  TO anon, authenticated
  USING (auth.role() IN ('anon', 'authenticated'))
  WITH CHECK (
    auth.role() IN ('anon', 'authenticated')
    AND char_length(trim(word_target)) > 0
    AND ease_factor >= 1.30
  );

-- Policy cho bảng srs_logs
DROP POLICY IF EXISTS "anon_select_srs_logs" ON public.srs_logs;
DROP POLICY IF EXISTS "anon_insert_srs_logs" ON public.srs_logs;
DROP POLICY IF EXISTS "anon_update_srs_logs" ON public.srs_logs;

CREATE POLICY "anon_select_srs_logs"
  ON public.srs_logs FOR SELECT
  TO anon, authenticated
  USING (auth.role() IN ('anon', 'authenticated') AND id IS NOT NULL);

CREATE POLICY "anon_insert_srs_logs"
  ON public.srs_logs FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    auth.role() IN ('anon', 'authenticated')
    AND quality_rating IN (0, 1, 2, 3)
    AND time_spent_ms >= 0
  );

CREATE POLICY "anon_update_srs_logs"
  ON public.srs_logs FOR UPDATE
  TO anon, authenticated
  USING (auth.role() IN ('anon', 'authenticated'))
  WITH CHECK (
    auth.role() IN ('anon', 'authenticated')
    AND quality_rating IN (0, 1, 2, 3)
    AND time_spent_ms >= 0
  );

-- ============================================================================
-- 9. KÍCH HOẠT REALTIME PUBLICATION CHO ĐỒNG BỘ OMNI-SYNC
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'exercises_vault'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.exercises_vault;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'vocab_vault'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vocab_vault;
  END IF;
END $$;

COMMIT;
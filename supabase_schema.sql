-- ============================================================
-- AppLeyes Supabase Schema — Versión Mejorada con FTS
-- Ejecuta este SQL en Supabase Dashboard > SQL Editor
-- ============================================================

-- ============================================================
-- 1. LAWS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.laws (
    id                TEXT PRIMARY KEY,
    title             TEXT NOT NULL,
    category          TEXT,
    parent_category   TEXT,
    type              TEXT,
    date              TEXT,
    description       TEXT,
    searchable_text   TEXT,
    hash              TEXT,
    item_count        INTEGER DEFAULT 0,
    is_large_law      BOOLEAN DEFAULT FALSE,
    last_updated      TIMESTAMPTZ,
    schema_version    TEXT,
    -- Full-Text Search vector (auto-updated, Spanish stemming)
    fts               TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('spanish',
            coalesce(title, '') || ' ' ||
            coalesce(searchable_text, '') || ' ' ||
            coalesce(category, '')
        )
    ) STORED
);

CREATE INDEX IF NOT EXISTS idx_laws_fts ON public.laws USING GIN(fts);
CREATE INDEX IF NOT EXISTS idx_laws_category ON public.laws(category);
CREATE INDEX IF NOT EXISTS idx_laws_parent_category ON public.laws(parent_category);

ALTER TABLE public.laws DISABLE ROW LEVEL SECURITY;


-- ============================================================
-- 2. LAW_ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.law_items (
    id            TEXT NOT NULL,
    law_id        TEXT NOT NULL REFERENCES public.laws(id) ON DELETE CASCADE,
    "index"       INTEGER,
    number        TEXT,
    title         TEXT,
    text          TEXT,
    type          TEXT,
    law_category  TEXT,
    last_updated  TIMESTAMPTZ,

    PRIMARY KEY (law_id, id)
);

CREATE INDEX IF NOT EXISTS idx_law_items_law_id ON public.law_items(law_id);
CREATE INDEX IF NOT EXISTS idx_law_items_index  ON public.law_items(law_id, "index" ASC);

ALTER TABLE public.law_items DISABLE ROW LEVEL SECURITY;


-- ============================================================
-- 3. JURISPRUDENCE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.jurisprudence (
    id              TEXT PRIMARY KEY,
    id_sentencia    TEXT,
    ano             INTEGER,
    expediente      TEXT,
    numero          TEXT,
    sala            TEXT,
    ponente         TEXT,
    fecha           TEXT,
    titulo          TEXT,
    procedimiento   TEXT,
    partes          TEXT,
    resumen         TEXT,
    -- keywords se mantiene para compatibilidad, pero FTS es lo principal ahora
    keywords        TEXT[] DEFAULT '{}',
    searchable_text TEXT,
    url_original    TEXT,
    fecha_corte     DATE,
    timestamp       TIMESTAMPTZ DEFAULT NOW(),
    -- Full-Text Search vector (Spanish stemming — plurales, conjugaciones)
    fts             TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('spanish',
            coalesce(numero, '')    || ' ' ||
            coalesce(expediente, '') || ' ' ||
            coalesce(resumen, '')   || ' ' ||
            coalesce(ponente, '')   || ' ' ||
            coalesce(procedimiento, '') || ' ' ||
            coalesce(partes, '')
        )
    ) STORED
);

-- Índices para todos los patrones de búsqueda
CREATE INDEX IF NOT EXISTS idx_jur_fts         ON public.jurisprudence USING GIN(fts);
CREATE INDEX IF NOT EXISTS idx_jur_numero       ON public.jurisprudence(numero);
CREATE INDEX IF NOT EXISTS idx_jur_expediente   ON public.jurisprudence(expediente);
CREATE INDEX IF NOT EXISTS idx_jur_sala         ON public.jurisprudence(sala);
CREATE INDEX IF NOT EXISTS idx_jur_ano          ON public.jurisprudence(ano);
CREATE INDEX IF NOT EXISTS idx_jur_fecha        ON public.jurisprudence(fecha);
-- Keyset pagination index (Ahora por fecha legal)
CREATE INDEX IF NOT EXISTS idx_jur_fecha_corte  ON public.jurisprudence(fecha_corte DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_jur_sala_fc      ON public.jurisprudence(sala, fecha_corte DESC);
CREATE INDEX IF NOT EXISTS idx_jur_ano_fc       ON public.jurisprudence(ano, fecha_corte DESC);
CREATE INDEX IF NOT EXISTS idx_jur_fecha        ON public.jurisprudence(fecha);

ALTER TABLE public.jurisprudence DISABLE ROW LEVEL SECURITY;


-- ============================================================
-- 4. GACETAS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.gacetas (
    id              TEXT PRIMARY KEY,
    numero          INTEGER,
    numero_display  TEXT,
    fecha           TEXT,
    ano             INTEGER,
    mes             INTEGER,
    dia             INTEGER,
    timestamp       TIMESTAMPTZ,
    url_original    TEXT,
    titulo          TEXT,
    subtitulo       TEXT,
    tipo            TEXT,
    sumario         TEXT,
    -- Full-Text Search vector (Spanish stemming)
    fts             TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('spanish',
            coalesce(titulo, '')    || ' ' ||
            coalesce(sumario, '')   || ' ' ||
            coalesce(numero_display, '')
        )
    ) STORED
);

-- Keyset pagination: el campo numero es único y ordenable
CREATE INDEX IF NOT EXISTS idx_gacetas_fts        ON public.gacetas USING GIN(fts);
CREATE INDEX IF NOT EXISTS idx_gacetas_numero     ON public.gacetas(numero DESC);
CREATE INDEX IF NOT EXISTS idx_gacetas_ano_numero ON public.gacetas(ano DESC, numero DESC);

ALTER TABLE public.gacetas DISABLE ROW LEVEL SECURITY;


-- ============================================================
-- 5. APP_METADATA (Singleton)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_metadata (
    id                  TEXT PRIMARY KEY DEFAULT 'singleton',
    laws_last_updated   TEXT,
    laws_count          INTEGER DEFAULT 0,
    last_upload_count   INTEGER DEFAULT 0,
    schema_version      TEXT,
    latest_app_version  TEXT DEFAULT '1.0.0',
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.app_metadata DISABLE ROW LEVEL SECURITY;

-- Insertar el singleton si no existe
INSERT INTO public.app_metadata (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 6. SYNC_MONITOR
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sync_monitor (
    id          TEXT PRIMARY KEY,
    data        JSONB DEFAULT '{}',
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sync_monitor DISABLE ROW LEVEL SECURITY;

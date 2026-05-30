-- 0009_conformity_to_reference.sql
-- A2 (real-only conformity) — SHADOW signal, no fake data needed.
--
-- Measures how close the user's scan embedding sits to AUTHENTIC catalog
-- examples of the IDENTIFIED reference (or same brand if the exact ref has no
-- rows). High max/mean similarity ⇒ the photo conforms to genuine examples of
-- that ref; low ⇒ anomalous (gross fake / wrong ref / bad photo).
--
-- IMPORTANT (honesty): this runs over the existing 256-d probe embeddings,
-- which are tuned for IDENTIFICATION (what model is this), not authenticity.
-- So this conformity mostly captures "is it the right model" — a super-clone
-- of the right ref will still score HIGH. It is wired in SHADOW MODE only
-- (logged, not driving the verdict) to collect real numbers and decide whether
-- a fine-grained 1024-d / real+fake (A1) upgrade is worth it. Do NOT surface
-- this to users as an authenticity score until validated.
--
-- Mirrors match_watches_v2 (supabase/02-embeddings.sql): reads
-- public.image_embeddings.image_embedding_v2 (vector(256)) JOIN public.watches.

CREATE OR REPLACE FUNCTION public.conformity_to_reference(
  query_embedding vector(256),
  p_brand text,
  p_reference text,
  p_k integer DEFAULT 8
)
RETURNS TABLE(n integer, max_sim double precision, mean_topk double precision, scope text)
LANGUAGE sql STABLE
AS $$
  WITH ref_rows AS (
    SELECT (1 - (ie.image_embedding_v2 <=> query_embedding))::double precision AS sim
    FROM public.image_embeddings ie
    JOIN public.watches w ON ie.watch_id = w.id
    WHERE ie.image_embedding_v2 IS NOT NULL
      AND p_reference IS NOT NULL AND p_reference <> ''
      AND lower(w.reference) = lower(p_reference)
    ORDER BY ie.image_embedding_v2 <=> query_embedding
    LIMIT p_k
  ),
  brand_rows AS (
    SELECT (1 - (ie.image_embedding_v2 <=> query_embedding))::double precision AS sim
    FROM public.image_embeddings ie
    JOIN public.watches w ON ie.watch_id = w.id
    WHERE ie.image_embedding_v2 IS NOT NULL
      AND p_brand IS NOT NULL AND p_brand <> ''
      AND lower(w.brand) = lower(p_brand)
    ORDER BY ie.image_embedding_v2 <=> query_embedding
    LIMIT p_k
  ),
  chosen AS (
    SELECT sim, 'reference'::text AS scope FROM ref_rows
    UNION ALL
    SELECT sim, 'brand'::text AS scope FROM brand_rows
    WHERE NOT EXISTS (SELECT 1 FROM ref_rows)
  )
  SELECT count(*)::int AS n,
         COALESCE(max(sim), 0)::double precision AS max_sim,
         COALESCE(avg(sim), 0)::double precision AS mean_topk,
         COALESCE(max(scope), 'none')::text AS scope
  FROM chosen;
$$;

GRANT EXECUTE ON FUNCTION public.conformity_to_reference(vector, text, text, integer)
  TO anon, authenticated;

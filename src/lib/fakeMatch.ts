/**
 * fakeMatch.ts — Query the `fake_embeddings` table (known fakes).
 *
 * Usage:
 *   const fakes = await findSimilarFakes(rawDinov3Embedding, 3);
 */

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export type FakeMatch = {
  id: string;
  watchId: string | null;
  sourceUrl: string | null;
  imageUrl: string | null;
  fakeSignalNotes: string | null;
  distance: number;
  similarity: number;        // 1 - distance, in [-1, 1]
};

export async function findSimilarFakes(
  embedding: number[],
  k = 3
): Promise<FakeMatch[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_fake_embeddings`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query_embedding: embedding,
        match_count: k,
        max_distance: 2.0,
      }),
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[fakeMatch] match_fake_embeddings ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return [];
    }
    const rows = (await res.json()) as Array<{
      id: string;
      watch_id: string | null;
      source_url: string | null;
      image_url: string | null;
      fake_signal_notes: string | null;
      distance: number;
    }>;
    return rows.map((r) => ({
      id: r.id,
      watchId: r.watch_id ?? null,
      sourceUrl: r.source_url ?? null,
      imageUrl: r.image_url ?? null,
      fakeSignalNotes: r.fake_signal_notes ?? null,
      distance: Number(r.distance ?? 1),
      similarity: 1 - Number(r.distance ?? 1),
    }));
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn(`[fakeMatch] error: ${e?.message ?? e}`);
    return [];
  }
}

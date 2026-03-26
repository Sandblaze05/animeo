import { NextResponse } from 'next/server';

const delay = (ms) => new Promise(r => setTimeout(r, ms));

const fetchAllEpisodes = async (id) => {
  let episodes = [];
  let page = 1;
  const MAX_PAGES = 15;

  while (page <= MAX_PAGES) {
    await delay(350);
    try {
      const res = await fetch(`https://api.jikan.moe/v4/anime/${id}/episodes?page=${page}`);
      if (!res.ok) {
        if (res.status === 429) {
          console.warn(`[MAL API] Rate limited on page ${page}. Breaking early.`);
        }
        break;
      }
      const json = await res.json();
      const data = json.data ?? [];
      if (!data.length) break;
      episodes.push(...data);
      if (!json.pagination?.has_next_page) break;
      page++;
    } catch (error) {
      console.error(`[MAL API] Fetch failed on page ${page}:`, error);
      break;
    }
  }
  return episodes;
};

const fetchEpisodesPage = async (id, page = 1) => {
  try {
    await delay(350);
    const res = await fetch(`https://api.jikan.moe/v4/anime/${id}/episodes?page=${page}`);
    if (!res.ok) {
      return { episodes: [], pagination: { has_next_page: false, current_page: page }, ok: false, status: res.status };
    }
    const json = await res.json();
    return { episodes: json.data ?? [], pagination: json.pagination ?? { has_next_page: false, current_page: page }, ok: true };
  } catch (err) {
    console.error(`[MAL API] fetchEpisodesPage failed for ${id} page ${page}:`, err);
    return { episodes: [], pagination: { has_next_page: false, current_page: page }, ok: false };
  }
};

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const malId = searchParams.get('malId');
    if (!malId) return NextResponse.json({ error: 'missing malId' }, { status: 400 });
    const jikanPage = searchParams.get('jikanPage');
    if (jikanPage) {
      const pageNum = Math.max(1, parseInt(jikanPage, 10) || 1);
      const { episodes, pagination, ok, status } = await fetchEpisodesPage(malId, pageNum);
      if (!ok) return NextResponse.json({ error: 'fetch failed' }, { status: status || 500 });
      return NextResponse.json(
        { episodes, pagination },
        { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
      );
    }
    const eps = await fetchAllEpisodes(malId);
    return NextResponse.json(
      { episodes: eps },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
    );
  } catch (err) {
    console.error('[Episode Route Error]:', err);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}

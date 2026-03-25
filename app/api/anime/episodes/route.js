import { NextResponse } from 'next/server';

const delay = (ms) => new Promise(r => setTimeout(r, ms));

const fetchAllEpisodes = async (id) => {
  let episodes = [];
  let page = 1;
  const MAX_PAGES = 15; // Safeguard against serverless timeouts (~1500 episodes)

  while (page <= MAX_PAGES) {
    // 350ms safely keeps under Jikan's 3 requests/sec limit
    await delay(350);

    try {
      const res = await fetch(`https://api.jikan.moe/v4/anime/${id}/episodes?page=${page}`, {
        next: { revalidate: 3600 }
      });

      if (!res.ok) {
        if (res.status === 429) {
          console.warn(`[MAL API] Rate limited on page ${page}. Breaking early.`);
        }
        break; // Stop fetching, but return the episodes we already gathered
      }

      const json = await res.json();
      const data = json.data ?? [];

      if (!data.length) break;

      episodes.push(...data);

      if (!json.pagination?.has_next_page) break;

      page++;
    } catch (error) {
      console.error(`[MAL API] Fetch failed on page ${page}:`, error);
      break; // Fail gracefully: return what we have so far instead of crashing
    }
  }

  return episodes;
};

const fetchEpisodesPage = async (id, page = 1) => {
  // Fetch a single Jikan page and return data + pagination info
  try {
    await delay(350);
    const res = await fetch(`https://api.jikan.moe/v4/anime/${id}/episodes?page=${page}`, {
      next: { revalidate: 3600 }
    });

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
    
    if (!malId) {
      return NextResponse.json({ error: 'missing malId' }, { status: 400 });
    }

    const jikanPage = searchParams.get('jikanPage');

    if (jikanPage) {
      const pageNum = Math.max(1, parseInt(jikanPage, 10) || 1);
      const { episodes, pagination, ok, status } = await fetchEpisodesPage(malId, pageNum);
      if (!ok) return NextResponse.json({ error: 'fetch failed' }, { status: status || 500 });

      return NextResponse.json(
        { episodes, pagination },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
          },
        }
      );
    }

    const eps = await fetchAllEpisodes(malId);

    // Set Cache-Control headers so edge networks/browsers cache the heavy payload
    return NextResponse.json(
      { episodes: eps },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    );
  } catch (err) {
    console.error('[Episode Route Error]:', err);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}
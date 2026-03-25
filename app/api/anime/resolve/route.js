import { NextResponse } from 'next/server';

const delay = (ms) => new Promise(r => setTimeout(r, ms));

const normalizeTitle = (str = '') =>
  str
    .toLowerCase()
    .replace(/[\[\]()]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const titleSimilarity = (a, b) => {
  const ta = new Set(normalizeTitle(a).split(' ').filter(Boolean));
  const tb = new Set(normalizeTitle(b).split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const word of ta) if (tb.has(word)) overlap++;
  return overlap / Math.max(ta.size, tb.size);
};

const pickBestMatch = (query, results) => {
  let best = null, bestScore = -1;
  for (const item of results) {
    const candidates = [
      item.title,
      item.title_english,
      item.title_japanese,
      ...(item.titles?.map(t => t.title) ?? []),
    ].filter(Boolean);
    const score = Math.max(...candidates.map(c => titleSimilarity(query, c)));
    if (score > bestScore) { bestScore = score; best = item; }
  }
  return best;
};

const searchMAL = async (query) => {
  const cleanQuery = query
    .replace(/season\s*\d+/gi, '')
    .replace(/part\s*\d+/gi, '')
    .replace(/[\[\]]/g, '')
    .trim();

  const res = await fetch(
    `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(cleanQuery)}&limit=10&order_by=popularity&sort=asc`
  );
  if (!res.ok) return [];
  const json = await res.json();
  return json.data ?? [];
};

const fetchAniListMedia = async (idMal) => {
  const query = `
    query ($idMal: Int) {
      Media(idMal: $idMal, type: ANIME) {
        idMal
        season
        seasonYear
        format
        status
        episodes
        duration
        genres
        averageScore
        popularity
        description(asHtml: false)
        bannerImage
        coverImage { extraLarge large color }
        title { romaji english native }
        studios(isMain: true) { nodes { name } }
        trailer { id site }
        characters(perPage: 12, sort: [ROLE, RELEVANCE]) {
          edges {
            role
            node {
              id
              name { full }
              image { large }
            }
          }
        }
        relations {
          edges {
            relationType
            node {
              idMal
              type
              format
              title { romaji english }
            }
          }
        }
      }
    }
  `;
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { idMal } }),
  });
  const json = await res.json();
  return json.data?.Media ?? null;
};

const findFranchiseRoot = async (startId, visited = new Set()) => {
  if (visited.has(startId)) return startId;
  visited.add(startId);

  const media = await fetchAniListMedia(startId);
  if (!media) return startId;

  const prequelEdge = media.relations?.edges?.find(
    e => e.relationType === 'PREQUEL' && e.node.type === 'ANIME' && e.node.idMal
  );

  if (!prequelEdge) return startId;
  return findFranchiseRoot(prequelEdge.node.idMal, visited);
};

const discoverFranchise = async (rootId) => {
  const visited = new Map();
  const queue = [rootId];

  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;

    const media = await fetchAniListMedia(id);
    if (!media) continue;

    visited.set(id, {
      malId: id,
      title: media.title?.english || media.title?.romaji,
      year: media.seasonYear,
      season: media.season,
      anilistData: media,
    });

    for (const edge of media.relations?.edges ?? []) {
      if (
        edge.node.type === 'ANIME' &&
        edge.node.idMal &&
        (edge.relationType === 'SEQUEL' || edge.relationType === 'PREQUEL') &&
        !visited.has(edge.node.idMal)
      ) {
        queue.push(edge.node.idMal);
      }
    }
  }

  return visited;
};

const fetchAnimeMeta = async (id) => {
  await delay(250);
  const res = await fetch(`https://api.jikan.moe/v4/anime/${id}/full`);
  if (!res.ok) return null;
  return (await res.json()).data;
};

const mergeSeasonData = (season, jikanMeta) => {
  const anilist = season.anilistData;
  return {
    malId: season.malId,
    title: season.title,
    titleJapanese: anilist?.title?.native ?? jikanMeta?.title_japanese,
    year: season.year,
    season: season.season,
    format: anilist?.format ?? jikanMeta?.type,
    status: anilist?.status ?? jikanMeta?.status,
    episodesCount: anilist?.episodes ?? jikanMeta?.episodes,
    duration: jikanMeta?.duration ?? (anilist?.duration ? `${anilist.duration} min per ep` : null),
    image: anilist?.coverImage?.extraLarge ?? jikanMeta?.images?.webp?.large_image_url,
    banner: anilist?.bannerImage,
    trailerId: jikanMeta?.trailer?.youtube_id ?? (anilist?.trailer?.site === 'youtube' ? anilist?.trailer?.id : null),
    score: jikanMeta?.score ?? (anilist?.averageScore ? (anilist.averageScore / 10).toFixed(2) : null),
    rank: jikanMeta?.rank,
    popularity: jikanMeta?.popularity ?? anilist?.popularity,
    synopsis: jikanMeta?.synopsis ?? anilist?.description,
    genres: anilist?.genres ?? jikanMeta?.genres?.map(g => g.name) ?? [],
    studios: anilist?.studios?.nodes?.map(n => n.name) ?? jikanMeta?.studios?.map(s => s.name) ?? [],
    rating: jikanMeta?.rating,
    source: jikanMeta?.source,
    aired: jikanMeta?.aired?.from,
    characters: anilist?.characters?.edges ?? [],
  };
};

export async function POST(req) {
  try {
    const body = await req.json();
    let { title, id } = body ?? {};
    if (!title && !id) return NextResponse.json({ error: 'no input' }, { status: 400 });

    let matchedMalId = id ? parseInt(id, 10) : null;

    if (!matchedMalId && title) {
      const searchResults = await searchMAL(title);
      if (searchResults.length) {
        const bestMatch = pickBestMatch(title, searchResults);
        if (bestMatch) matchedMalId = bestMatch.mal_id;
      }
    }

    if (!matchedMalId) return NextResponse.json({ error: 'could not resolve id' }, { status: 404 });

    const rootMalId = await findFranchiseRoot(matchedMalId);
    const franchiseMap = await discoverFranchise(rootMalId);

    let seasons = Array.from(franchiseMap.values());
    const jikanMetaList = await Promise.all(seasons.map(s => fetchAnimeMeta(s.malId)));

    seasons = seasons.map((season, i) => mergeSeasonData(season, jikanMetaList[i])).sort((a, b) => {
      if (a.year && b.year) return a.year - b.year;
      if (a.aired && b.aired) return new Date(a.aired) - new Date(b.aired);
      return 0;
    });

    const payload = {
      title: title || seasons[0]?.title || 'Unknown Title',
      rootMalId,
      matchedMalId,
      seasons,
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'server error' }, { status: 500 });
  }
}

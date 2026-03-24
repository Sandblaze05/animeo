import React from 'react';
import DetailsDisplay from '@/components/DetailsDisplay';

/* ─── Helpers ─────────────────────────────────────────────── */

const delay = (ms) => new Promise(r => setTimeout(r, ms));

/** Normalize a title for comparison: lowercase, strip brackets/punctuation */
const normalizeTitle = (str = '') =>
  str
    .toLowerCase()
    .replace(/[\[\]()]/g, '')        // remove brackets
    .replace(/[^\w\s]/g, ' ')        // punctuation → space
    .replace(/\s+/g, ' ')
    .trim();

/** Token-overlap similarity score between two strings (0–1) */
const titleSimilarity = (a, b) => {
  const ta = new Set(normalizeTitle(a).split(' ').filter(Boolean));
  const tb = new Set(normalizeTitle(b).split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const word of ta) if (tb.has(word)) overlap++;
  return overlap / Math.max(ta.size, tb.size);
};

/** Pick the best-matching anime entry from a list of MAL results */
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

/** Fetch a page of MAL search results */
const searchMAL = async (query) => {
  // Strip season qualifiers that confuse MAL ("Season 3", "Part 1", etc.)
  const cleanQuery = query
    .replace(/season\s*\d+/gi, '')
    .replace(/part\s*\d+/gi, '')
    .replace(/[\[\]]/g, '')
    .trim();

  const res = await fetch(
    `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(cleanQuery)}&limit=10&order_by=popularity&sort=asc`,
    { next: { revalidate: 3600 } }
  );
  if (!res.ok) throw new Error('MAL search failed');
  const json = await res.json();
  return json.data ?? [];
};

/** Fetch all episodes for a MAL anime ID */
const fetchAllEpisodes = async (id) => {
  let episodes = [], page = 1;
  while (true) {
    await delay(350);
    const res = await fetch(
      `https://api.jikan.moe/v4/anime/${id}/episodes?page=${page}`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) break;
    const json = await res.json();
    const data = json.data ?? [];
    if (!data.length) break;
    episodes.push(...data);
    if (!json.pagination?.has_next_page) break;
    page++;
  }
  return episodes;
};

/** Fetch full Jikan metadata */
const fetchAnimeMeta = async (id) => {
  await delay(350);
  const res = await fetch(
    `https://api.jikan.moe/v4/anime/${id}/full`,
    { next: { revalidate: 3600 } }
  );
  if (!res.ok) return null;
  return (await res.json()).data;
};

/** Fetch AniList deep metadata + relations */
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
    next: { revalidate: 3600 },
  });
  const json = await res.json();
  return json.data?.Media ?? null;
};

/**
 * Walk PREQUEL edges all the way up to find the true franchise root.
 * Guards against infinite loops with a visited set.
 */
const findFranchiseRoot = async (startId, visited = new Set()) => {
  if (visited.has(startId)) return startId;
  visited.add(startId);

  const media = await fetchAniListMedia(startId);
  if (!media) return startId;

  const prequelEdge = media.relations?.edges?.find(
    e => e.relationType === 'PREQUEL' && e.node.type === 'ANIME' && e.node.idMal
  );

  if (!prequelEdge) return startId; // we've reached the root
  return findFranchiseRoot(prequelEdge.node.idMal, visited);
};

/**
 * BFS/DFS from rootId following SEQUEL edges to collect the whole franchise.
 * Stores the full AniList Media object per entry.
 */
const discoverFranchise = async (rootId) => {
  const visited = new Map(); // malId → { malId, anilistData }
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

/** Merge Jikan + AniList data into one clean season object */
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
    trailerId:
      jikanMeta?.trailer?.youtube_id ??
      (anilist?.trailer?.site === 'youtube' ? anilist?.trailer?.id : null),
    score:
      jikanMeta?.score ??
      (anilist?.averageScore ? (anilist.averageScore / 10).toFixed(2) : null),
    rank: jikanMeta?.rank,
    popularity: jikanMeta?.popularity ?? anilist?.popularity,
    synopsis: jikanMeta?.synopsis ?? anilist?.description,
    genres: anilist?.genres ?? jikanMeta?.genres?.map(g => g.name) ?? [],
    studios:
      anilist?.studios?.nodes?.map(n => n.name) ??
      jikanMeta?.studios?.map(s => s.name) ??
      [],
    rating: jikanMeta?.rating,
    source: jikanMeta?.source,
    aired: jikanMeta?.aired?.from,
    characters: anilist?.characters?.edges ?? [],
  };
};

/* ─── Component ───────────────────────────────────────────── */

const Details = async ({ title }) => {
  if (!title) return <div>No title provided</div>;

  try {
    /* 1. Search MAL with a cleaned query, then score results */
    const searchResults = await searchMAL(title);
    if (!searchResults.length) return <div>No anime found</div>;

    const bestMatch = pickBestMatch(title, searchResults);
    if (!bestMatch) return <div>No anime found</div>;

    const matchedMalId = bestMatch.mal_id;

    /* 2. Climb the PREQUEL chain to find the true franchise root */
    const rootMalId = await findFranchiseRoot(matchedMalId);

    /* 3. Discover the full franchise (BFS over SEQUEL/PREQUEL edges) */
    const franchiseMap = await discoverFranchise(rootMalId);

    /* 4. Fetch Jikan metadata for every discovered entry */
    let seasons = Array.from(franchiseMap.values());
    const jikanMetaList = await Promise.all(
      seasons.map(s => fetchAnimeMeta(s.malId))
    );

    /* 5. Merge + sort chronologically */
    seasons = seasons
      .map((season, i) => mergeSeasonData(season, jikanMetaList[i]))
      .sort((a, b) => {
        if (a.year && b.year) return a.year - b.year;
        if (a.aired && b.aired) return new Date(a.aired) - new Date(b.aired);
        return 0;
      });

    /* 6. Fetch episodes for each season */
    const seasonData = [];
    for (const season of seasons) {
      const episodes = await fetchAllEpisodes(season.malId);
      seasonData.push({ ...season, episodes });
    }

    /* 7. Build final payload */
    const payload = {
      title,
      rootMalId,
      matchedMalId,            // which entry the search actually hit
      seasons: seasonData,
    };

    return <DetailsDisplay payload={payload} />;
  } catch (err) {
    console.error(err);
    return <div>Error loading anime</div>;
  }
};

export default Details;
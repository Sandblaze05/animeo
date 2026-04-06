import path from 'path'
import fs from 'fs'
import { createRequire } from 'module'
import { randomUUID } from 'crypto'
import { app, ipcMain } from 'electron'
import serve from 'electron-serve'
import { createWindow } from './helpers'
import { TorrentStreamService } from './services/torrent-stream-service'
import * as Store from 'electron-store'
import * as cheerio from 'cheerio'
import { createApiBay } from 'apibay.org'

const isProd = process.env.NODE_ENV === 'production'
const apibay = createApiBay()
let torrentStreamService = null
let torrentStreamServiceInitError = null

if (isProd) {
  serve({ directory: 'app' })
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`)
}

// --- Helper Functions for Anime Resolve ---
const delay = (ms) => new Promise(r => setTimeout(r, ms));

const isTransientFetchError = (err) => {
  const code = err?.cause?.code || err?.code;
  if (typeof code === 'string' && ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN'].includes(code)) {
    return true;
  }

  const message = String(err?.message || '').toLowerCase();
  return (
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('timeout')
  );
};

const fetchWithRetry = async (url, init = {}, options = {}) => {
  const {
    retries = 2,
    timeoutMs = 12000,
    retryDelayMs = 600,
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeoutId);
      return res;
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err;

      const canRetry = attempt < retries && isTransientFetchError(err);
      if (!canRetry) break;

      await delay(retryDelayMs * (attempt + 1));
    }
  }

  throw lastError;
};

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

const getKitsuId = (item) => {
  const id = item?.id;
  if (typeof id === 'string' && /^\d+$/.test(id)) return Number(id);
  if (Number.isFinite(Number(id))) return Number(id);
  return null;
};

const fetchKitsuAnime = async (query) => {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return [];

  const url = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(cleanQuery)}&page[limit]=10&sort=popularityRank`;
  const res = await fetchWithRetry(url, {
    headers: {
      'User-Agent': 'animeo-scraper/1.0',
      'Accept': 'application/vnd.api+json',
    }
  }, {
    retries: 2,
    timeoutMs: 12000,
    retryDelayMs: 600,
  });

  if (!res.ok) return [];

  const json = await res.json();
  return Array.isArray(json?.data) ? json.data : [];
};

const fetchKitsuByMalId = async (malId) => {
  const parsedMalId = Number(malId);
  if (!Number.isFinite(parsedMalId) || parsedMalId <= 0) return null;

  const url = `https://kitsu.io/api/edge/mappings?filter[externalSite]=myanimelist/anime&filter[externalId]=${parsedMalId}&include=item&page[limit]=1`;
  const res = await fetchWithRetry(url, {
    headers: {
      'User-Agent': 'animeo-scraper/1.0',
      'Accept': 'application/vnd.api+json',
    }
  }, {
    retries: 2,
    timeoutMs: 12000,
    retryDelayMs: 600,
  });

  if (!res.ok) return null;

  const json = await res.json();
  const itemRef = json?.data?.[0]?.relationships?.item?.data;
  const included = Array.isArray(json?.included) ? json.included : [];
  const kitsuAnime = included.find(i => i?.type === itemRef?.type && String(i?.id) === String(itemRef?.id));

  if (!kitsuAnime?.id) return null;

  return {
    kitsuId: Number(kitsuAnime.id),
    kitsuTitle: kitsuAnime?.attributes?.canonicalTitle || kitsuAnime?.attributes?.titles?.en || null,
    confidence: 1,
  };
};

const pickBestKitsuMatch = (query, results) => {
  let best = null;
  let bestScore = -1;

  for (const item of results) {
    const attributes = item?.attributes ?? {};
    const candidates = [
      attributes.canonicalTitle,
      attributes.titles?.en,
      attributes.titles?.en_jp,
      attributes.titles?.ja_jp,
      attributes.slug,
      ...(Array.isArray(attributes.titles) ? attributes.titles.map(t => t?.title) : []),
    ].filter(Boolean);

    if (!candidates.length) continue;

    const score = Math.max(...candidates.map(candidate => titleSimilarity(query, candidate)));
    const exactBonus = candidates.some(candidate => normalizeTitle(candidate) === normalizeTitle(query)) ? 1 : 0;
    const totalScore = score + exactBonus;

    if (totalScore > bestScore) {
      bestScore = totalScore;
      best = item;
    }
  }

  return best;
};

const resolveKitsuContext = async (title, seasonInput, preferredMalId) => {
  const cleanTitle = sanitizeAnimeQueryTitle(title);
  const query = cleanTitle || String(title || '').trim();
  const parsedMalId = Number(preferredMalId);

  if (Number.isFinite(parsedMalId) && parsedMalId > 0) {
    try {
      const mapped = await fetchKitsuByMalId(parsedMalId);
      if (mapped?.kitsuId) {
        return {
          cleanTitle,
          kitsuId: mapped.kitsuId,
          confidence: mapped.confidence ?? 1,
          kitsuTitle: mapped.kitsuTitle || query,
          seasonInput,
          matchedMalId: parsedMalId,
          source: 'mal-mapping',
        };
      }
    } catch (err) {
      console.warn(`[anime:search] Failed Kitsu MAL mapping for ${parsedMalId}: ${err?.message || err}`);
    }
  }

  if (!query) return { cleanTitle, kitsuId: null, confidence: 0 };

  try {
    const results = await fetchKitsuAnime(query);
    if (!results.length) return { cleanTitle, kitsuId: null, confidence: 0 };

    const best = pickBestKitsuMatch(query, results);
    const kitsuId = getKitsuId(best);
    if (!kitsuId) return { cleanTitle, kitsuId: null, confidence: 0 };

    const confidence = Math.min(1, Math.max(0, titleSimilarity(query, best?.attributes?.canonicalTitle || query)));
    return {
      cleanTitle,
      kitsuId,
      confidence,
      kitsuTitle: best?.attributes?.canonicalTitle || best?.attributes?.titles?.en || best?.attributes?.titles?.en_jp || query,
      seasonInput,
      matchedMalId: Number.isFinite(parsedMalId) ? parsedMalId : null,
      source: 'title-search',
    };
  } catch (err) {
    console.warn(`[anime:search] Failed to resolve Kitsu context: ${err?.message || err}`);
    return { cleanTitle, kitsuId: null, confidence: 0 };
  }
};

const normalizeStreamResult = (stream, index, sourceLabel) => {
  const title = String(stream?.title || stream?.name || `${sourceLabel} Stream ${index + 1}`).trim();
  const directUrl = String(stream?.url || '').trim();
  const infoHash = String(stream?.infoHash || '').trim();
  const trackers = extractStreamTrackers(stream);
  const fileNameHint = String(stream?.behaviorHints?.filename || '').trim() || null;
  const magnetUrl = infoHash ? buildMagnetUri(infoHash, title, trackers) : '';
  const href = directUrl || magnetUrl;

  return {
    title,
    links: href
      ? [{
        href,
        text: directUrl ? 'Open' : 'Magnet',
        isMagnet: !directUrl,
      }]
      : [],
    score: Number.isFinite(Number(stream?.fileIdx)) ? 100 - Number(stream.fileIdx) : 0,
    source: sourceLabel,
    infoHash: infoHash || null,
    fileIdx: Number.isFinite(Number(stream?.fileIdx)) ? Number(stream.fileIdx) : null,
    trackers,
    fileNameHint,
    sources: Array.isArray(stream?.sources) ? stream.sources : [],
    behaviorHints: stream?.behaviorHints || {},
  };
};

const PUBLIC_TRACKERS = [
  'wss://tracker.btorrent.xyz',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev',
  'https://tracker.opentrackr.org:443/announce',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.coppersurfer.tk:6969/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://opentracker.i2p.rocks:6969/announce',
];

function extractStreamTrackers(stream) {
  const fromBehavior = Array.isArray(stream?.behaviorHints?.trackers)
    ? stream.behaviorHints.trackers
    : [];

  const fromSources = Array.isArray(stream?.sources)
    ? stream.sources.flatMap((sourceEntry) => {
      if (typeof sourceEntry === 'string') {
        return sourceEntry.match(/(?:udp|https?|wss):\/\/[^\s,]+/gi) || [];
      }
      if (Array.isArray(sourceEntry?.trackers)) return sourceEntry.trackers;
      return [];
    })
    : [];

  const deduped = new Set();
  for (const tracker of [...fromBehavior, ...fromSources]) {
    const clean = String(tracker || '').trim();
    if (!clean) continue;
    if (!/^(udp|https?|wss):\/\//i.test(clean)) continue;
    deduped.add(clean);
  }

  return Array.from(deduped);
}

function buildMagnetUri(infoHash, displayName, extraTrackers = []) {
  const cleanHash = String(infoHash || '').trim();
  if (!cleanHash) return '';

  const params = [`xt=urn:btih:${encodeURIComponent(cleanHash)}`];
  const title = String(displayName || '').trim();
  if (title) {
    params.push(`dn=${encodeURIComponent(title)}`);
  }

  const trackers = [...extraTrackers, ...PUBLIC_TRACKERS];
  const seen = new Set();
  for (const tracker of trackers) {
    const clean = String(tracker || '').trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    params.push(`tr=${encodeURIComponent(tracker)}`);
  }

  return `magnet:?${params.join('&')}`;
}

const normalizeSearchResults = (results) => {
  const seen = new Set();
  const deduped = [];

  for (const result of Array.isArray(results) ? results : []) {
    const links = Array.isArray(result?.links) ? result.links : [];
    const uniqueLinks = [];

    for (const link of links) {
      const href = String(link?.href || '').trim();
      if (!href) continue;

      const key = href.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueLinks.push(link);
    }

    if (!uniqueLinks.length) continue;
    deduped.push({ ...result, links: uniqueLinks });
  }

  return deduped;
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
        idMal season seasonYear format status episodes duration genres averageScore popularity description(asHtml: false)
        startDate { year month day }
        bannerImage
        coverImage { extraLarge large color }
        title { romaji english native }
        studios(isMain: true) { nodes { name } }
        trailer { id site }
        characters(perPage: 12, sort: [ROLE, RELEVANCE]) {
          edges { role node { id name { full } image { large } } }
        }
        relations {
          edges { relationType node { idMal type format title { romaji english } } }
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

const NON_MAINLINE_FORMATS = new Set(['MOVIE', 'OVA', 'ONA', 'SPECIAL', 'MUSIC']);

const seasonTokenRank = (seasonToken) => {
  const token = String(seasonToken || '').toUpperCase();
  if (token === 'WINTER') return 1;
  if (token === 'SPRING') return 2;
  if (token === 'SUMMER') return 3;
  if (token === 'FALL') return 4;
  return 9;
};

const getAniListReleaseTimestamp = (entry) => {
  const startDate = entry?.anilistData?.startDate;
  const year = Number(startDate?.year);
  if (!Number.isFinite(year)) return null;

  const month = Number.isFinite(Number(startDate?.month)) ? Number(startDate.month) : 1;
  const day = Number.isFinite(Number(startDate?.day)) ? Number(startDate.day) : 1;
  const ts = Date.UTC(year, Math.max(0, month - 1), Math.max(1, day));
  return Number.isFinite(ts) ? ts : null;
};

const compareFranchiseEntriesByRelease = (a, b) => {
  const tsA = getAniListReleaseTimestamp(a);
  const tsB = getAniListReleaseTimestamp(b);
  if (tsA != null && tsB != null && tsA !== tsB) return tsA - tsB;
  if (tsA != null && tsB == null) return -1;
  if (tsA == null && tsB != null) return 1;

  const yearA = Number.isFinite(Number(a?.year)) ? Number(a.year) : Number.MAX_SAFE_INTEGER;
  const yearB = Number.isFinite(Number(b?.year)) ? Number(b.year) : Number.MAX_SAFE_INTEGER;
  if (yearA !== yearB) return yearA - yearB;

  const seasonA = seasonTokenRank(a?.season);
  const seasonB = seasonTokenRank(b?.season);
  if (seasonA !== seasonB) return seasonA - seasonB;

  return Number(a?.malId || 0) - Number(b?.malId || 0);
};

const isMainlineFranchiseEntry = (entry) => {
  const format = String(entry?.anilistData?.format || '').toUpperCase();
  return !NON_MAINLINE_FORMATS.has(format);
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

const buildEpisodePlaceholders = (totalCount) => {
  const total = Math.max(0, Number.isFinite(Number(totalCount)) ? Number(totalCount) : 0);
  return Array.from({ length: total }, (_, index) => ({
    mal_id: index + 1,
    title: `Episode ${index + 1}`,
    aired: null,
  }));
};

const fetchAllEpisodes = async (id) => {
  let episodes = [];
  let page = 1;
  const MAX_PAGES = 15;

  while (page <= MAX_PAGES) {
    const { episodes: pageEpisodes, pagination, ok, status } = await fetchEpisodesPage(id, page);
    if (!ok) {
      if (status === 429) {
        console.warn(`[MAL API] Rate limited on page ${page} after retries. Breaking early.`);
      }
      break;
    }

    if (!pageEpisodes.length) break;
    episodes.push(...pageEpisodes);

    if (!pagination?.has_next_page) break;
    page = Number.isFinite(Number(pagination?.current_page))
      ? Number(pagination.current_page) + 1
      : page + 1;
  }

  return episodes;
};

const fetchEpisodesPage = async (id, page = 1) => {
  const MAX_RETRIES = 3;
  let lastError = null;

  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await delay(350);
      const res = await fetch(`https://api.jikan.moe/v4/anime/${id}/episodes?page=${page}`);

      if (res.ok) {
        const json = await res.json();
        return { episodes: json.data ?? [], pagination: json.pagination ?? { has_next_page: false, current_page: page }, ok: true };
      }

      if (res.status === 429 && attempt < MAX_RETRIES) {
        const retryAfterHeader = Number(res.headers.get('retry-after'));
        const retryAfterMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
          ? retryAfterHeader * 1000
          : 1000 * Math.pow(2, attempt + 1);
        console.warn(`[MAL API] Rate limited for ${id} page ${page}. Retrying in ${retryAfterMs}ms (attempt ${attempt + 1}/${MAX_RETRIES}).`);
        await delay(retryAfterMs);
        continue;
      }

      return { episodes: [], pagination: { has_next_page: false, current_page: page }, ok: false, status: res.status };
    }

    return { episodes: [], pagination: { has_next_page: false, current_page: page }, ok: false, status: 429 };
  } catch (err) {
    lastError = err;
    console.error(`[MAL API] fetchEpisodesPage failed for ${id} page ${page}:`, err);
    return { episodes: [], pagination: { has_next_page: false, current_page: page }, ok: false };
  }
};
// --- End Helper Functions ---

// --- Embedded SQLite Helper (inlined from main/helpers/sqlite.js) ---
const require = createRequire(import.meta.url);

let db = null;
let usingFallback = false;

const inMemory = {
  profiles: [],
  lists: [],
  list_items: []
};

function now() {
  return new Date().toISOString();
}

async function initDatabase(dbFilePath) {
  if (db || usingFallback) return;

  try {
    const dbDir = path.dirname(dbFilePath);
    if (!fs.existsSync(dbDir)) {
      try { fs.mkdirSync(dbDir, { recursive: true }); } catch (e) { /* ignore */ }
    }

    // Attempt to load better-sqlite3
    const Database = require('better-sqlite3');
    db = new Database(dbFilePath);

    // Initialize tables
    db.prepare(`
      CREATE TABLE IF NOT EXISTS lists (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS list_items (
        id TEXT PRIMARY KEY,
        list_id TEXT NOT NULL,
        anime TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        avatar TEXT,
        created_at TEXT NOT NULL
      )
    `).run();

    usingFallback = false;
  } catch (e) {
    console.warn('better-sqlite3 not available or failed to load, using in-memory fallback:', e && e.message);
    usingFallback = true;
  }
}

function getLists(userId) {
  if (usingFallback) {
    return inMemory.lists.filter(l => l.user_id === userId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return db.prepare('SELECT id, title, user_id, created_at FROM lists WHERE user_id = ? ORDER BY created_at DESC').all(userId);
}

function getProfiles() {
  if (usingFallback) {
    return [...inMemory.profiles].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return db.prepare('SELECT id, name, avatar, created_at FROM profiles ORDER BY created_at DESC').all();
}

function createProfile(name, avatar = null) {
  if (usingFallback) {
    const id = randomUUID();
    const created_at = now();
    const profile = { id, name, avatar, created_at };
    inMemory.profiles.push(profile);
    try { getOrCreateDefaultList(id); } catch (e) { console.error(e); }
    return profile;
  }

  const id = randomUUID();
  const created_at = now();
  db.prepare('INSERT INTO profiles (id, name, avatar, created_at) VALUES (?, ?, ?, ?)').run(id, name, avatar, created_at);
  try {
    getOrCreateDefaultList(id);
  } catch (e) {
    console.error('Failed to create default list for profile', id, e);
  }
  return db.prepare('SELECT id, name, avatar, created_at FROM profiles WHERE id = ?').get(id);
}

function deleteProfile(profileId) {
  if (usingFallback) {
    inMemory.list_items = inMemory.list_items.filter(li => !inMemory.lists.find(l => l.id === li.list_id && l.user_id === profileId));
    inMemory.lists = inMemory.lists.filter(l => l.user_id !== profileId);
    inMemory.profiles = inMemory.profiles.filter(p => p.id !== profileId);
    return;
  }

  const listIds = db.prepare('SELECT id FROM lists WHERE user_id = ?').all(profileId).map(r => r.id);
  if (listIds.length > 0) {
    const delItems = db.prepare(`DELETE FROM list_items WHERE list_id IN (${listIds.map(() => '?').join(',')})`);
    delItems.run(...listIds);
  }
  db.prepare('DELETE FROM lists WHERE user_id = ?').run(profileId);
  db.prepare('DELETE FROM profiles WHERE id = ?').run(profileId);
}

function getOrCreateDefaultList(userId) {
  if (usingFallback) {
    const row = inMemory.lists.find(l => l.user_id === userId && l.title === 'My List');
    if (row) return row;
    const id = randomUUID();
    const created_at = now();
    const list = { id, title: 'My List', user_id: userId, created_at };
    inMemory.lists.push(list);
    return list;
  }

  const row = db.prepare('SELECT * FROM lists WHERE user_id = ? AND title = ? LIMIT 1').get(userId, 'My List');
  if (row) return row;
  const id = randomUUID();
  const created_at = now();
  db.prepare('INSERT INTO lists (id, title, user_id, created_at) VALUES (?, ?, ?, ?)').run(id, 'My List', userId, created_at);
  return db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
}

function createList(title, userId) {
  if (usingFallback) {
    const id = randomUUID();
    const created_at = now();
    const list = { id, title, user_id: userId, created_at };
    inMemory.lists.push(list);
    return list;
  }
  const id = randomUUID();
  const created_at = now();
  db.prepare('INSERT INTO lists (id, title, user_id, created_at) VALUES (?, ?, ?, ?)').run(id, title, userId, created_at);
  return db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
}

function updateList(id, title, userId) {
  if (usingFallback) {
    const idx = inMemory.lists.findIndex(l => l.id === id && l.user_id === userId);
    if (idx >= 0) { inMemory.lists[idx].title = title; return inMemory.lists[idx]; }
    return null;
  }
  db.prepare('UPDATE lists SET title = ? WHERE id = ? AND user_id = ?').run(title, id, userId);
  return db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
}

function deleteList(id, userId) {
  if (usingFallback) {
    inMemory.list_items = inMemory.list_items.filter(li => li.list_id !== id);
    inMemory.lists = inMemory.lists.filter(l => !(l.id === id && l.user_id === userId));
    return;
  }
  db.prepare('DELETE FROM list_items WHERE list_id = ?').run(id);
  db.prepare('DELETE FROM lists WHERE id = ? AND user_id = ?').run(id, userId);
}

function getListItems(listId, userId) {
  if (usingFallback) {
    const list = inMemory.lists.find(l => l.id === listId);
    if (!list || (userId && list.user_id !== userId)) throw new Error('List not found');
    const rows = inMemory.list_items.filter(li => li.list_id === listId).sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
    return rows.map(r => ({ ...r, anime: JSON.parse(r.anime) }));
  }
  const list = db.prepare('SELECT user_id FROM lists WHERE id = ?').get(listId);
  if (!list || (userId && list.user_id !== userId)) throw new Error('List not found');
  const rows = db.prepare('SELECT id, list_id, anime, position, created_at FROM list_items WHERE list_id = ? ORDER BY position ASC, created_at ASC').all(listId);
  return rows.map(r => ({ ...r, anime: JSON.parse(r.anime) }));
}

function addListItem(listId, animeData, position = 0, userId) {
  if (usingFallback) {
    const list = inMemory.lists.find(l => l.id === listId);
    if (!list || (userId && list.user_id !== userId)) throw new Error('List not found');
    const id = randomUUID();
    const created_at = now();
    const item = { id, list_id: listId, anime: JSON.stringify(animeData), position, created_at };
    inMemory.list_items.push(item);
    return item;
  }
  const list = db.prepare('SELECT user_id FROM lists WHERE id = ?').get(listId);
  if (!list || (userId && list.user_id !== userId)) throw new Error('List not found');
  const id = randomUUID();
  const created_at = now();
  db.prepare('INSERT INTO list_items (id, list_id, anime, position, created_at) VALUES (?, ?, ?, ?, ?)').run(id, listId, JSON.stringify(animeData), position, created_at);
  return db.prepare('SELECT * FROM list_items WHERE id = ?').get(id);
}

function updateListItem(itemId, updates, userId) {
  if (usingFallback) {
    const row = inMemory.list_items.find(li => li.id === itemId);
    const list = inMemory.lists.find(l => l.id === (row && row.list_id));
    if (!row || (userId && list && list.user_id !== userId)) throw new Error('List item not found');
    const allowed = ['position'];
    const keys = Object.keys(updates).filter(k => allowed.includes(k));
    if (keys.length === 0) return row;
    keys.forEach(k => { row[k] = updates[k]; });
    return row;
  }
  const row = db.prepare('SELECT li.id, li.list_id, l.user_id FROM list_items li JOIN lists l ON li.list_id = l.id WHERE li.id = ?').get(itemId);
  if (!row || (userId && row.user_id !== userId)) throw new Error('List item not found');
  const allowed = ['position'];
  const keys = Object.keys(updates).filter(k => allowed.includes(k));
  if (keys.length === 0) return db.prepare('SELECT * FROM list_items WHERE id = ?').get(itemId);
  const stmt = db.prepare(`UPDATE list_items SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`);
  stmt.run(...keys.map(k => updates[k]), itemId);
  return db.prepare('SELECT * FROM list_items WHERE id = ?').get(itemId);
}

function deleteListItem(itemId, userId) {
  if (usingFallback) {
    const row = inMemory.list_items.find(li => li.id === itemId);
    const list = inMemory.lists.find(l => l.id === (row && row.list_id));
    if (!row || (userId && list && list.user_id !== userId)) throw new Error('List item not found');
    inMemory.list_items = inMemory.list_items.filter(li => li.id !== itemId);
    return;
  }
  const row = db.prepare('SELECT li.id, l.user_id FROM list_items li JOIN lists l ON li.list_id = l.id WHERE li.id = ?').get(itemId);
  if (!row || (userId && row.user_id !== userId)) throw new Error('List item not found');
  db.prepare('DELETE FROM list_items WHERE id = ?').run(itemId);
}

function addAnimeToDefaultList(animeData, userId) {
  if (usingFallback) {
    const list = getOrCreateDefaultList(userId);
    const existing = inMemory.list_items.filter(li => li.list_id === list.id).map(r => ({ id: r.id, anime: JSON.parse(r.anime) }));
    const alreadyExists = existing.some(item => item.anime?.id === animeData.id);
    if (alreadyExists) throw new Error('Anime already in your list');
    const last = [...inMemory.list_items].filter(li => li.list_id === list.id).sort((a, b) => b.position - a.position)[0];
    const newPosition = last ? last.position + 1 : 0;
    const inserted = addListItem(list.id, animeData, newPosition, userId);
    return { ...inserted, anime: animeData };
  }

  const list = getOrCreateDefaultList(userId);
  const existing = db.prepare('SELECT id, anime FROM list_items WHERE list_id = ?').all(list.id).map(r => ({ id: r.id, anime: JSON.parse(r.anime) }));
  const alreadyExists = existing.some(item => item.anime?.id === animeData.id);
  if (alreadyExists) throw new Error('Anime already in your list');
  const last = db.prepare('SELECT position FROM list_items WHERE list_id = ? ORDER BY position DESC LIMIT 1').get(list.id);
  const newPosition = last ? last.position + 1 : 0;
  const inserted = addListItem(list.id, animeData, newPosition, userId);
  return { ...inserted, anime: animeData };
}

// --- End Embedded SQLite Helper ---

function pad2(n) {
  const num = Number(n);
  if (Number.isNaN(num)) return String(n);
  return num.toString().padStart(2, '0');
}

function extractSeasonPart(seasonInput) {
  const raw = String(seasonInput ?? '').trim();
  if (!raw) return { seasonNumber: null, partNumber: null, raw: '' };

  const seasonMatch = raw.match(/(?:^|\b)(?:season|s)\s*(\d{1,2})(?:\b|$)/i);
  const partMatch = raw.match(/(?:^|\b)(?:part|cour)\s*(\d{1,2})(?:\b|$)/i);

  return {
    seasonNumber: seasonMatch ? Number(seasonMatch[1]) : null,
    partNumber: partMatch ? Number(partMatch[1]) : null,
    raw
  };
}

function sanitizeAnimeQueryTitle(titleInput) {
  let title = String(titleInput ?? '').trim();
  if (!title) return '';

  title = title
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
    .replace(/[\[\]{}()]/g, ' ')
    .replace(/\s*[:|\-]\s*final\s*season\b/gi, '')
    .replace(/\bthe\s+final\s+season\b/gi, '')
    .replace(/\bfinal\s+season\b/gi, '')
    .replace(/\bseason\s*\d{1,2}\b/gi, '')
    .replace(/\b(?:part|cour)\s*\d{1,2}\b/gi, '')
    .replace(/[,:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return title;
}

function hasFinalSeasonHint(...inputs) {
  const text = inputs
    .map(v => String(v ?? ''))
    .join(' ')
    .toLowerCase();
  return /\bfinal\s+season\b/.test(text);
}

function toSeasonLabel(seasonNumber, partNumber) {
  if (!Number.isFinite(seasonNumber)) return '';
  if (Number.isFinite(partNumber)) return `Season ${seasonNumber} Part ${partNumber}`;
  return `Season ${seasonNumber}`;
}

async function resolveSearchContext(title, seasonInput, preferredMalId) {
  const parsed = extractSeasonPart(seasonInput);
  const cleanTitle = sanitizeAnimeQueryTitle(title);
  const finalSeasonHint = hasFinalSeasonHint(title, seasonInput);
  const parsedPreferredMalId = Number(preferredMalId);

  let seasonNumber = parsed.seasonNumber;
  const partNumber = parsed.partNumber;

  try {
    let matchedMalId = Number.isFinite(parsedPreferredMalId) ? parsedPreferredMalId : null;

    if (!matchedMalId) {
      if (Number.isFinite(seasonNumber) && !finalSeasonHint) {
        return { cleanTitle, seasonNumber, partNumber, inferred: false };
      }

      const searchResults = await searchMAL(cleanTitle || String(title || ''));
      if (!searchResults?.length) {
        return { cleanTitle, seasonNumber, partNumber, inferred: false };
      }

      const best = pickBestMatch(cleanTitle || String(title || ''), searchResults);
      matchedMalId = best?.mal_id;
      if (!matchedMalId) {
        return { cleanTitle, seasonNumber, partNumber, inferred: false };
      }
    }

    const rootMalId = await findFranchiseRoot(matchedMalId);
    const franchiseMap = await discoverFranchise(rootMalId);
    const orderedMainline = Array.from(franchiseMap.values())
      .filter(isMainlineFranchiseEntry)
      .sort(compareFranchiseEntriesByRelease);

    if (!orderedMainline.length) {
      return { cleanTitle, seasonNumber, partNumber, inferred: false };
    }

    const matchedIndex = orderedMainline.findIndex(item => Number(item.malId) === Number(matchedMalId));
    if (finalSeasonHint) {
      seasonNumber = orderedMainline.length;
    } else if (!Number.isFinite(seasonNumber) && matchedIndex >= 0) {
      seasonNumber = matchedIndex + 1;
    } else if (!Number.isFinite(seasonNumber) && orderedMainline.length === 1) {
      seasonNumber = 1;
    }

    return { cleanTitle, seasonNumber, partNumber, inferred: Number.isFinite(seasonNumber), matchedMalId };
  } catch (err) {
    console.warn(`[anime:search] Failed to infer season context: ${err?.message || err}`);
    return { cleanTitle, seasonNumber, partNumber, inferred: false };
  }
}

function hasEpisodeMarker(entryTitle, episode) {
  const epNum = Number(episode);
  if (!Number.isFinite(epNum)) return false;

  const ep = pad2(epNum);
  const patterns = [
    new RegExp(`\\bS\\d{1,2}E${ep}\\b`, 'i'),
    new RegExp(`\\bS\\d{1,2}E${epNum}\\b`, 'i'),
    new RegExp(`\\bE${ep}\\b`, 'i'),
    new RegExp(`\\bE${epNum}\\b`, 'i'),
    new RegExp(`\\bEP(?:ISODE)?[ ._-]*${ep}\\b`, 'i'),
    new RegExp(`\\bEP(?:ISODE)?[ ._-]*${epNum}\\b`, 'i')
  ];

  return patterns.some((re) => re.test(entryTitle));
}

function hasSeasonMismatch(entryTitle, expectedSeason) {
  if (!Number.isFinite(expectedSeason)) return false;

  const sxe = entryTitle.match(/\bS(\d{1,2})E\d{1,3}\b/i);
  if (sxe && Number(sxe[1]) !== expectedSeason) return true;

  const seasonWord = entryTitle.match(/\bSeason\s*(\d{1,2})\b/i);
  if (seasonWord && Number(seasonWord[1]) !== expectedSeason) return true;

  return false;
}

function hasPartMismatch(entryTitle, expectedPart) {
  if (!Number.isFinite(expectedPart)) return false;

  const partWord = entryTitle.match(/\b(?:Part|Cour)\s*(\d{1,2})\b/i);
  if (partWord && Number(partWord[1]) !== expectedPart) return true;

  return false;
}

function scoreAnimeSourceMatch({ title, entryTitle, seasonNumber, partNumber, episode }) {
  const similarity = titleSimilarity(title, entryTitle);
  const score = Math.round(similarity * 100);

  if (!hasEpisodeMarker(entryTitle, episode)) {
    return { score: -1, include: false };
  }

  if (hasSeasonMismatch(entryTitle, seasonNumber)) {
    return { score: -1, include: false };
  }

  if (hasPartMismatch(entryTitle, partNumber)) {
    return { score: -1, include: false };
  }

  return { score, include: score >= 25 };
}

function generateSphinxQuery(title, season, episode, options = {}) {
  if (!title) throw new Error('title is required');
  if (episode === undefined || episode === null) throw new Error('episode is required');

  const {
    strict = true,
    scopeField = 'name',
    includeLooseNumeric = false,
    includeNonPadded = false,
    excludeTerms = ['batch', 'complete', 'compilation', 'pack', 'discussion', 'preview']
  } = options || {};

  const cleanTitle = String(title).trim();
  const ep = pad2(episode);
  const variants = [];

  const scope = strict && scopeField ? `@${scopeField} ` : '';

  const parsed = extractSeasonPart(season);
  const seasonNumber = parsed.seasonNumber;
  const partNumber = parsed.partNumber;

  if (Number.isFinite(seasonNumber)) {
    const sn = pad2(seasonNumber);
    variants.push(`${scope}="S${sn}E${ep}"`);
    if (includeNonPadded) {
      variants.push(`${scope}="S${seasonNumber}E${Number(episode)}"`);
    }
    variants.push(`${scope}"Season ${seasonNumber}"`);
  }

  if (Number.isFinite(partNumber)) {
    variants.push(`${scope}"Part ${partNumber}"`);
    variants.push(`${scope}"Cour ${partNumber}"`);
  }

  variants.push(`${scope}="E${ep}"`);
  variants.push(`${scope}"Episode ${Number(episode)}"`);
  variants.push(`${scope}"Ep ${ep}"`);
  if (includeNonPadded) {
    variants.push(`${scope}="E${Number(episode)}"`);
    variants.push(`${scope}"Ep ${Number(episode)}"`);
  }
  if (includeLooseNumeric) {
    variants.push(`${scope}" ${ep} "`);
  }

  const joined = variants.join(' | ');
  const titleScoped = `${scope}"${cleanTitle}"`;

  let query = `${titleScoped} & (${joined})`;

  if (strict && excludeTerms && excludeTerms.length) {
    const excl = excludeTerms
      .filter(Boolean)
      .map(t => `-${scope}"${String(t)}"`)
      .join(' ');
    if (excl) query = `${query} ${excl}`;
  }

  return query;
}

const SEARCH_CACHE_TTL_MS = 1000 * 60 * 20;
const searchResultCache = new Map();

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function getMagnetKey(href) {
  const raw = String(href || '').trim();
  if (!raw) return '';
  if (!raw.toLowerCase().startsWith('magnet:?')) return raw.toLowerCase();

  try {
    const magnet = new URL(raw);
    const xt = String(magnet.searchParams.get('xt') || '');
    const hashMatch = xt.match(/urn:btih:([^&]+)/i);
    if (hashMatch?.[1]) return `btih:${hashMatch[1].toUpperCase()}`;
  } catch (err) {
    const inline = raw.match(/btih:([a-z0-9]+)/i);
    if (inline?.[1]) return `btih:${inline[1].toUpperCase()}`;
  }

  return raw.toLowerCase();
}

function setupAnimeHandlers() {
  ipcMain.handle('anime:generateQuery', (event, args) => {
    try {
      const { title, season, episode, options } = args || {};
      const parsed = extractSeasonPart(season);
      const cleanTitle = sanitizeAnimeQueryTitle(title);
      const normalizedSeason = toSeasonLabel(parsed.seasonNumber, parsed.partNumber) || season;
      const query = generateSphinxQuery(cleanTitle || title, normalizedSeason, episode, options);
      return { query };
    } catch (err) {
      throw new Error(err.message);
    }
  });

  ipcMain.handle('anime:search', async (event, args) => {
    try {
      const { title, season, episode, malId, options: rawOptions = {} } = args || {};
      const options = {
        strict: rawOptions.strict !== undefined ? rawOptions.strict : true,
        includeLooseNumeric: !!rawOptions.includeLooseNumeric,
        includeNonPadded: !!rawOptions.includeNonPadded,
        scopeField: rawOptions.scopeField || 'name',
        excludeTerms: Array.isArray(rawOptions.excludeTerms)
          ? rawOptions.excludeTerms
          : typeof rawOptions.excludeTerms === 'string' && rawOptions.excludeTerms.length
            ? rawOptions.excludeTerms.split(',').map(s => s.trim()).filter(Boolean)
            : undefined
      };

      const context = await resolveSearchContext(title, season, malId);
      const cleanTitle = context.cleanTitle || String(title || '').trim();
      const effectiveSeasonNumber = context.seasonNumber;
      const effectivePartNumber = context.partNumber;
      const effectiveMalId = Number.isFinite(Number(malId)) ? Number(malId) : Number(context?.matchedMalId);
      const kitsuContext = await resolveKitsuContext(cleanTitle || title, season, effectiveMalId);
      const episodeNumber = Number.isFinite(Number(episode)) ? Number(episode) : 1;
      const cacheKey = stableStringify({
        title: cleanTitle,
        seasonNumber: effectiveSeasonNumber,
        partNumber: effectivePartNumber,
        malId: Number.isFinite(effectiveMalId) ? effectiveMalId : null,
        kitsuId: kitsuContext.kitsuId,
        episode: episodeNumber,
        options
      });
      const now = Date.now();
      const cached = searchResultCache.get(cacheKey);

      if (cached && cached.expiresAt > now) {
        return {
          ...cached.payload,
          metadata: {
            ...(cached.payload?.metadata || {}),
            cached: true,
          }
        };
      }

      if (cached && cached.expiresAt <= now) {
        searchResultCache.delete(cacheKey);
      }
      const fetchTorrentio = async () => {
        if (!kitsuContext?.kitsuId) {
          return {
            results: [],
            url: null,
            available: false,
            error: 'could not resolve kitsu id'
          };
        }

        const url = `https://torrentio.strem.fun/stream/anime/kitsu:${kitsuContext.kitsuId}:${episodeNumber}.json`;
        const resp = await fetchWithRetry(url, {
          headers: {
            'User-Agent': 'animeo-scraper/1.0',
            'Accept': 'application/json',
          }
        }, {
          retries: 2,
          timeoutMs: 12000,
          retryDelayMs: 600,
        });

        if (!resp.ok) {
          return {
            results: [],
            url,
            available: false,
            error: `Torrentio failed: ${resp.status}`
          };
        }

        const json = await resp.json();
        const streams = Array.isArray(json?.streams) ? json.streams : [];
        const results = streams.map((stream, index) => normalizeStreamResult(stream, index, 'Torrentio'));

        return {
          results,
          url,
          available: true,
          error: results.length ? null : 'no streams returned'
        };
      };

      const fetchTPB = async () => {
        // Format season and episode with leading zeros (e.g., S03E01)
        const sStr = Number.isFinite(effectiveSeasonNumber) ? pad2(effectiveSeasonNumber) : '01';
        const eStr = Number.isFinite(Number(episode)) ? pad2(episode) : '01';
        const tpbQuery = Number.isFinite(effectiveSeasonNumber)
          ? `${cleanTitle} S${sStr}E${eStr}`
          : `${cleanTitle} E${eStr}`;

        let lastError = null;

        try {
          const data = await apibay.search({ q: tpbQuery, cat: 200 });
          const results = [];

          for (const item of Array.isArray(data) ? data.slice(0, 40) : []) {
            const entryTitle = String(item?.name || '').trim();
            const hash = String(item?.info_hash || '').trim();
            if (!entryTitle || !hash) continue;

            const magnetLink = buildMagnetUri(hash, entryTitle);
            const { score, include } = scoreAnimeSourceMatch({
              title: cleanTitle,
              entryTitle,
              seasonNumber: effectiveSeasonNumber,
              partNumber: effectivePartNumber,
              episode,
            });

            if (include) {
              results.push({
                title: entryTitle,
                links: [{ href: magnetLink, text: 'Magnet', isMagnet: true }],
                score,
                source: 'ThePirateBay'
              });
            }
          }

          results.sort((a, b) => b.score - a.score);
          return {
            results,
            query: tpbQuery,
            url: typeof apibay.getBaseUrl === 'function' ? apibay.getBaseUrl() : 'https://apibay.org',
            available: true,
            provider: 'apibay',
          };
        } catch (err) {
          lastError = err;
        }

        const mirrors = [
          'https://tpb.party',
          'https://thepiratebay10.org',
          'https://thepiratebay.zone'
        ];

        for (const base of mirrors) {
          try {
            const url = `${base}/search/${encodeURIComponent(tpbQuery)}/1/99/200`;
            const resp = await fetchWithRetry(url, {
              headers: { 'User-Agent': 'animeo-scraper/1.0' }
            }, {
              retries: 1,
              timeoutMs: 9000,
              retryDelayMs: 500,
            });

            if (!resp.ok) {
              lastError = new Error(`TPB mirror failed: ${resp.status}`);
              continue;
            }

            const html = await resp.text();
            const $ = cheerio.load(html);
            const results = [];

            $('table#searchResult tr:has(td)').each((index, element) => {
              const entryTitle = $(element).find('td').eq(1).find('a').first().text().trim();
              const magnetLink = $(element).find('a[href^="magnet:"]').attr('href');

              if (entryTitle && magnetLink) {
                const { score, include } = scoreAnimeSourceMatch({
                  title: cleanTitle,
                  entryTitle,
                  seasonNumber: effectiveSeasonNumber,
                  partNumber: effectivePartNumber,
                  episode,
                });

                if (include) {
                  results.push({
                    title: entryTitle,
                    links: [{ href: magnetLink, text: 'Magnet', isMagnet: true }],
                    score,
                    source: 'ThePirateBay'
                  });
                }
              }
            });

            if (results.length) {
              results.sort((a, b) => b.score - a.score);
            }

            return { results, query: tpbQuery, url, available: true };
          } catch (err) {
            lastError = err;
          }
        }

        return {
          results: [],
          query: tpbQuery,
          url: null,
          available: false,
          error: lastError?.message || 'TPB unavailable'
        };
      };

      const torrentioResponse = await fetchTorrentio();
      let fallbackResponse = null;
      let allResults = [];

      if (torrentioResponse?.results?.length) {
        allResults = torrentioResponse.results;
      } else {
        fallbackResponse = await fetchTPB();
        allResults = Array.isArray(fallbackResponse?.results) ? fallbackResponse.results : [];
      }

      const dedupedResults = normalizeSearchResults(allResults);
      const payload = {
        count: dedupedResults.length,
        results: dedupedResults,
        metadata: {
          torrentioUrl: torrentioResponse?.url || null,
          torrentioAvailable: !!torrentioResponse?.available,
          torrentioError: torrentioResponse?.available === false ? (torrentioResponse?.error || 'Torrentio unavailable') : null,
          tpbUrl: fallbackResponse?.url || null,
          tpbAvailable: fallbackResponse ? !!fallbackResponse.available : false,
          tpbError: fallbackResponse && !fallbackResponse.available
            ? (fallbackResponse.error || 'TPB unavailable')
            : null,
          cached: false,
          deduped: allResults.length !== dedupedResults.length,
          originalCount: allResults.length,
          source: torrentioResponse?.results?.length ? 'Torrentio' : 'TPB',
          kitsuId: kitsuContext?.kitsuId || null,
        }
      };

      searchResultCache.set(cacheKey, {
        expiresAt: now + SEARCH_CACHE_TTL_MS,
        payload
      });

      // Optional: You can adjust the return payload to include both URLs/Queries for debugging
      return payload;

    } catch (err) {
      throw new Error(err.message);
    }
  });
}

// --- Master Setup Function ---
async function setupAppBackend(rootPath) {
  // 1. Setup Writable App Data Directory (Runs for Dev & Prod)
  const appName = (app.getName && typeof app.getName === 'function') ? app.getName() : 'animeo';
  const dataDir = path.join(app.getPath('appData'), appName);
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) { /* ignore */ }
  process.env.ANIMEO_DATA_DIR = dataDir;

  // This is the absolute path where the ACTUAL database file will live.
  const dbFilePath = path.join(dataDir, 'animeo_data.sqlite');

  if (!torrentStreamService && !torrentStreamServiceInitError) {
    try {
      torrentStreamService = new TorrentStreamService({
        cacheRoot: path.join(dataDir, 'stream-cache'),
        maxCacheBytes: 30 * 1024 * 1024 * 1024,
        maxCacheTorrents: 25,
        cacheMaxAgeMs: 3 * 24 * 60 * 60 * 1000,
        idleTimeoutMs: 60 * 60 * 1000,
      });
    } catch (err) {
      torrentStreamServiceInitError = err?.message || String(err);
      console.warn('[torrent:session] Service initialization failed:', torrentStreamServiceInitError);
    }
  }

  // 2. Register IPC Database & API Handlers
  try {
    setupAnimeHandlers();

    // Initialize DB (attempt to load better-sqlite3, fall back to in-memory)
    try {
      await initDatabase(dbFilePath);
    } catch (e) {
      console.warn('initDatabase failed:', e && e.message);
    }

    const wrap = (fn) => async (event, ...args) => {
      try {
        const res = await fn(...args);
        return { success: true, result: res };
      } catch (e) {
        return { success: false, error: e.message || String(e) };
      }
    };

    // --- Torrent Streaming Session APIs ---
    ipcMain.handle('torrent:session:start', wrap(async (payload = {}) => {
      if (!torrentStreamService) {
        throw new Error(torrentStreamServiceInitError || 'Torrent streaming service is unavailable');
      }

      const started = await torrentStreamService.startSession({
        magnetUri: payload.magnetUri,
        preferredFileIndex: Number.isFinite(Number(payload.preferredFileIndex))
          ? Number(payload.preferredFileIndex)
          : null,
        preferredFileName: payload.fileNameHint || null,
        trackers: Array.isArray(payload.trackers) ? payload.trackers : [],
        sourceTitle: payload.sourceTitle || 'Unknown Source',
      });

      return started;
    }));

    ipcMain.handle('torrent:session:status', wrap(async (sessionId) => {
      if (!torrentStreamService) {
        throw new Error(torrentStreamServiceInitError || 'Torrent streaming service is unavailable');
      }
      return torrentStreamService.getSessionStatus(sessionId);
    }));

    ipcMain.handle('torrent:session:stop', wrap(async (sessionId) => {
      if (!torrentStreamService) {
        return { sessionId, stopped: false };
      }
      return torrentStreamService.stopSession(sessionId);
    }));

    // --- Database Profiles ---
    if (typeof getProfiles === 'function') ipcMain.handle('api:profiles:get', wrap(() => getProfiles()));
    if (typeof createProfile === 'function') ipcMain.handle('api:profiles:create', wrap((name, avatar) => createProfile(name, avatar)));
    if (typeof deleteProfile === 'function') ipcMain.handle('api:profiles:delete', wrap((id) => deleteProfile(id)));

    // --- Database Lists ---
    if (typeof getLists === 'function') ipcMain.handle('db:getLists', wrap((userId) => getLists(userId)));
    if (typeof getOrCreateDefaultList === 'function') ipcMain.handle('db:getOrCreateDefaultList', wrap((userId) => getOrCreateDefaultList(userId)));
    if (typeof createList === 'function') ipcMain.handle('db:createList', wrap((title, userId) => createList(title, userId)));
    if (typeof updateList === 'function') ipcMain.handle('db:updateList', wrap((id, title, userId) => updateList(id, title, userId)));
    if (typeof deleteList === 'function') ipcMain.handle('db:deleteList', wrap((id, userId) => deleteList(id, userId)));

    // --- Database List Items ---
    if (typeof getListItems === 'function') ipcMain.handle('db:getListItems', wrap((listId, userId) => getListItems(listId, userId)));
    if (typeof addListItem === 'function') ipcMain.handle('db:addListItem', wrap((listId, animeData, position, userId) => addListItem(listId, animeData, position, userId)));
    if (typeof updateListItem === 'function') ipcMain.handle('db:updateListItem', wrap((itemId, updates, userId) => updateListItem(itemId, updates, userId)));
    if (typeof deleteListItem === 'function') ipcMain.handle('db:deleteListItem', wrap((itemId, userId) => deleteListItem(itemId, userId)));
    if (typeof addAnimeToDefaultList === 'function') ipcMain.handle('db:addAnimeToDefaultList', wrap((animeData, userId) => addAnimeToDefaultList(animeData, userId)));

    // --- External APIs ---

    const store = new Store();

    const CACHE_TTL = 1000 * 60 * 60 * 4; // 4 hours 

    /**
     * Reusable caching wrapper for IPC handlers
     * @param {string} key - The unique name for this piece of data in electron-store
     * @param {number} ttl - Time to live in milliseconds
     * @param {function} fetchCallback - The async function that fetches fresh data if needed
     */
    async function withCache(key, ttl, fetchCallback) {
      const now = Date.now();
      const cachedData = store.get(key);
      const lastFetchTime = store.get(`${key}_time`) || 0;

      // 1. Return valid cache
      if (cachedData && (now - lastFetchTime < ttl)) {
        console.log(`[Main] Serving ${key} from store...`);
        return { success: true, result: cachedData, cached: true };
      }

      // 2. Fetch fresh data
      try {
        console.log(`[Main] Fetching fresh data for ${key}...`);
        const freshData = await fetchCallback();

        // 3. Save to store
        store.set(key, freshData);
        store.set(`${key}_time`, now);

        return { success: true, result: freshData, cached: false };
      } catch (err) {
        // 4. Fallback to stale cache if network fails
        if (cachedData) {
          console.warn(`[Main] Fetch failed for ${key}, serving stale data: `, err.message);
          return { success: true, result: cachedData, cached: true, warning: 'Stale data' };
        }
        return { success: false, error: err.message || 'Internal Server Error' };
      }
    }

    // ==========================================================
    // IPC HANDLERS
    // ==========================================================

    ipcMain.handle('api:all-anime-data', async () => {
      return await withCache('allAnimeData', CACHE_TTL, async () => {
        const query = `
          query GetTopAiringAnime {
            Page(page: 1, perPage: 10) {
              media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC) {
                id
                idMal
                title { romaji english }
                bannerImage
                coverImage { color extraLarge }
                description(asHtml: false)
                genres averageScore
                startDate { year }
              }
            }
          }    
        `;
        const options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ query }),
        };

        const [anilistRes, jikanRes] = await Promise.all([
          fetch('https://graphql.anilist.co', options),
          fetch('https://api.jikan.moe/v4/seasons/now')
        ]);

        const data1 = await anilistRes.json();
        const data2 = await jikanRes.json();

        if (!anilistRes.ok || data1.errors) throw new Error("Failed to fetch data from AniList");
        if (!jikanRes.ok) throw new Error("Failed to fetch data from Jikan");

        const allAnime = data1.data.Page.media;
        const jikanData = data2.data;

        const topAiring = allAnime.map((anime) => ({
          id: anime.idMal,
          title: anime.title.english || anime.title.romaji,
          coverImage: anime.coverImage.extraLarge,
          score: anime.averageScore,
          year: anime.startDate.year
        }));

        const currentSeason = jikanData.slice(0, 11).map((anime) => ({
          id: anime.mal_id,
          coverImage: anime.images.webp.large_image_url,
          title: anime.title_english,
          type: anime.type,
          airing: anime.airing,
          score: anime.score,
          year: anime.year,
          season: anime.season
        }));

        // Whatever is returned here gets saved to electron-store
        return { topAiring, currentSeason };
      });
    });


    ipcMain.handle('api:hero-items', async () => {
      return await withCache('heroItems', CACHE_TTL, async () => {
        const query = `
          query GetTopAiringAnimeForHero {
            Page(page: 1, perPage: 10) {
              media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC) {
                id
                idMal
                title { romaji english }
                bannerImage
                coverImage { color extraLarge }
                description(asHtml: false)
                genres averageScore
                startDate { year }
              }
            }
          }    
        `;
        const options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ query }),
        };

        const response = await fetch('https://graphql.anilist.co', options);
        const data = await response.json();
        if (!response.ok || data.errors) throw new Error("Failed to fetch data from AniList");

        const allAnime = data.data.Page.media;
        return allAnime
          .filter(anime => anime.bannerImage)
          .map(anime => {
            const description = anime.description
              ? anime.description.replace(/<br\s*\/?>/gi, ' ').substring(0, 180) + '...'
              : 'No description available.';

            return {
              id: anime.idMal,
              title: anime.title.english || anime.title.romaji,
              bannerImage: anime.bannerImage,
              coverImage: anime.coverImage.extraLarge,
              description,
              genres: anime.genres,
              year: anime.startDate.year,
              score: anime.averageScore,
              color: anime.coverImage.color,
            };
          });
      });
    });


    ipcMain.handle('api:movies', async () => {
      return await withCache('movies', CACHE_TTL, async () => {
        const query = `
          query GetPopularMovies {
            Page(page: 1, perPage: 20) {
              media(type: ANIME, format: MOVIE, sort: POPULARITY_DESC) {
                id
                idMal
                title { romaji english }
                bannerImage
                coverImage { color extraLarge }
                description(asHtml: false)
                genres averageScore
                startDate { year }
              }
            }
          }    
        `;
        const options = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ query }),
        };

        const response = await fetch('https://graphql.anilist.co', options);
        const data = await response.json();
        if (!response.ok || data.errors) throw new Error("Failed to fetch data from AniList");

        const allMovies = data.data.Page.media;
        return allMovies.map(anime => {
          const description = anime.description
            ? anime.description.replace(/<br\s*\/?>/gi, ' ').substring(0, 180) + '...'
            : 'No description available.';

          return {
            id: anime.idMal,
            title: anime.title.english || anime.title.romaji,
            bannerImage: anime.bannerImage,
            coverImage: anime.coverImage.extraLarge,
            description,
            genres: anime.genres,
            year: anime.startDate.year,
            score: anime.averageScore,
            color: anime.coverImage.color,
          };
        });
      });
    });


    ipcMain.handle('api:anime:episodes', async (event, malId, jikanPage, options = {}) => {
      if (!malId) return { success: false, error: 'missing malId' };

      const countsOnly = !!options?.countsOnly;
      const fallbackCount = Number.isFinite(Number(options?.fallbackCount)) ? Number(options.fallbackCount) : null;

      if (countsOnly) {
        const cacheKey = `episodes_count_only_${malId}_${fallbackCount ?? 'unknown'}`;
        return await withCache(cacheKey, CACHE_TTL, async () => {
          let count = fallbackCount;

          if (!Number.isFinite(count) || count <= 0) {
            const meta = await fetchAnimeMeta(malId);
            const detected = Number(meta?.episodes);
            count = Number.isFinite(detected) && detected > 0 ? detected : 0;
          }

          const episodes = buildEpisodePlaceholders(count);
          return {
            episodes,
            pagination: {
              current_page: 1,
              has_next_page: false,
              items: { total: episodes.length }
            },
            countsOnly: true,
          };
        });
      }

      // Create a dynamic key based on the specific anime and page
      const cacheKey = `episodes_${malId}_${jikanPage || 'all'}`;

      return await withCache(cacheKey, CACHE_TTL, async () => {
        if (jikanPage) {
          const pageNum = Math.max(1, parseInt(jikanPage, 10) || 1);
          const { episodes, pagination, ok, status } = await fetchEpisodesPage(malId, pageNum);
          if (!ok) throw new Error(`fetch failed with status ${status || 500}`);
          return { episodes, pagination };
        }

        const eps = await fetchAllEpisodes(malId);
        return { episodes: eps };
      });
    });


    ipcMain.handle('api:anime:resolve', async (event, body) => {
      const { title, id } = body ?? {};
      if (!title && !id) return { success: false, error: 'no input' };

      // Create a dynamic key so we don't re-resolve franchises we've already looked up
      const cacheKey = `resolve_${id || title.replace(/\s+/g, '_')}`;

      return await withCache(cacheKey, CACHE_TTL, async () => {
        let matchedMalId = id ? parseInt(id, 10) : null;

        if (!matchedMalId && title) {
          const searchResults = await searchMAL(title);
          if (searchResults.length) {
            const bestMatch = pickBestMatch(title, searchResults);
            if (bestMatch) matchedMalId = bestMatch.mal_id;
          }
        }

        if (!matchedMalId) throw new Error('could not resolve id');

        const rootMalId = await findFranchiseRoot(matchedMalId);
        const franchiseMap = await discoverFranchise(rootMalId);

        let seasons = Array.from(franchiseMap.values());
        const jikanMetaList = await Promise.all(seasons.map(s => fetchAnimeMeta(s.malId)));

        seasons = seasons.map((season, i) => mergeSeasonData(season, jikanMetaList[i])).sort((a, b) => {
          if (a.year && b.year) return a.year - b.year;
          if (a.aired && b.aired) return new Date(a.aired) - new Date(b.aired);
          return 0;
        });

        return {
          title: title || seasons[0]?.title || 'Unknown Title',
          rootMalId,
          matchedMalId,
          seasons,
        };
      });
    });

    console.log('Backend Services & IPC handlers established.');
  } catch (e) {
    console.warn('Failed to set up DB IPC handlers', e && e.message);
  }
}
// --- End Master Setup ---

; (async () => {
  await app.whenReady()

  // ---> Added this line to actually execute your backend setup! <---
  // Pass project root (one level up from this file) so utils/sqlite.js is found
  await setupAppBackend(__dirname)

  const mainWindow = createWindow('main', {
    width: 1000,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  mainWindow.setMenuBarVisibility(false);

  if (isProd) {
    await mainWindow.loadURL('app://./profiles')
  } else {
    const port = process.argv[2]
    await mainWindow.loadURL(`http://localhost:${port}/profiles`)
    mainWindow.webContents.openDevTools()
  }
})()

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', async () => {
  if (!torrentStreamService) return;
  try {
    await torrentStreamService.dispose();
  } catch (err) {
    console.warn('[torrent:session] Failed during shutdown cleanup:', err?.message || err);
  }
})

ipcMain.on('message', async (event, arg) => {
  event.reply('message', `${arg} World!`)
})
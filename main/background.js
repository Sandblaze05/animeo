import path from 'path'
import fs from 'fs'
import { createRequire } from 'module'
import { randomUUID } from 'crypto'
import { app, ipcMain } from 'electron'
import serve from 'electron-serve'
import { createWindow } from './helpers'
import * as Store from 'electron-store'

const isProd = process.env.NODE_ENV === 'production'

if (isProd) {
  serve({ directory: 'app' })
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`)
}

// --- Helper Functions for Anime Resolve ---
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
        idMal season seasonYear format status episodes duration genres averageScore popularity description(asHtml: false)
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

const fetchAllEpisodes = async (id) => {
  let episodes = [];
  let page = 1;
  const MAX_PAGES = 15;

  while (page <= MAX_PAGES) {
    await delay(350);
    try {
      const res = await fetch(`https://api.jikan.moe/v4/anime/${id}/episodes?page=${page}`);
      if (!res.ok) {
        if (res.status === 429) console.warn(`[MAL API] Rate limited on page ${page}. Breaking early.`);
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


// --- Master Setup Function ---
async function setupAppBackend(rootPath) {
  // 1. Setup Writable App Data Directory (Runs for Dev & Prod)
  const appName = (app.getName && typeof app.getName === 'function') ? app.getName() : 'animeo';
  const dataDir = path.join(app.getPath('appData'), appName);
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) { /* ignore */ }
  process.env.ANIMEO_DATA_DIR = dataDir;

  // This is the absolute path where the ACTUAL database file will live.
  const dbFilePath = path.join(dataDir, 'animeo_data.sqlite');

  // 2. Register IPC Database & API Handlers
  try {
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
          id: anime.id,
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
              id: anime.id,
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
            id: anime.id,
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


    ipcMain.handle('api:anime:episodes', async (event, malId, jikanPage) => {
      if (!malId) return { success: false, error: 'missing malId' };

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
    await mainWindow.loadURL('app://./home')
  } else {
    const port = process.argv[2]
    await mainWindow.loadURL(`http://localhost:${port}/home`)
    mainWindow.webContents.openDevTools()
  }
})()

app.on('window-all-closed', () => {
  app.quit()
})

ipcMain.on('message', async (event, arg) => {
  event.reply('message', `${arg} World!`)
})
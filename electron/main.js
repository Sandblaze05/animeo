const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;

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


// --- Master Setup Function ---
function setupAppBackend(rootPath) {
  // 1. Setup App Data Directory (Runs for Dev & Prod)
  const appName = (app.getName && typeof app.getName === 'function') ? app.getName() : 'animeo';
  const dataDir = path.join(app.getPath('appData'), appName);
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) { /* ignore */ }
  process.env.ANIMEO_DATA_DIR = dataDir;

  // 2. Register IPC Database & API Handlers
  try {
    const sqlitePath = path.join(rootPath, 'utils', 'sqlite.js');

    if (fs.existsSync(sqlitePath)) {
      const dbModule = require(sqlitePath);

      const wrap = (fn) => async (event, ...args) => {
        try {
          const res = await fn(...args);
          return { success: true, result: res };
        } catch (e) {
          return { success: false, error: e.message || String(e) };
        }
      };

      // --- Database Profiles ---
      if (dbModule.getProfiles) ipcMain.handle('api:profiles:get', wrap(() => dbModule.getProfiles()));
      if (dbModule.createProfile) ipcMain.handle('api:profiles:create', wrap((name, avatar) => dbModule.createProfile(name, avatar)));
      if (dbModule.deleteProfile) ipcMain.handle('api:profiles:delete', wrap((id) => dbModule.deleteProfile(id)));

      // --- Database Lists ---
      if (dbModule.getLists) ipcMain.handle('db:getLists', wrap((userId) => dbModule.getLists(userId)));
      if (dbModule.getOrCreateDefaultList) ipcMain.handle('db:getOrCreateDefaultList', wrap((userId) => dbModule.getOrCreateDefaultList(userId)));
      if (dbModule.createList) ipcMain.handle('db:createList', wrap((title, userId) => dbModule.createList(title, userId)));
      if (dbModule.updateList) ipcMain.handle('db:updateList', wrap((id, title, userId) => dbModule.updateList(id, title, userId)));
      if (dbModule.deleteList) ipcMain.handle('db:deleteList', wrap((id, userId) => dbModule.deleteList(id, userId)));

      // --- Database List Items ---
      if (dbModule.getListItems) ipcMain.handle('db:getListItems', wrap((listId, userId) => dbModule.getListItems(listId, userId)));
      if (dbModule.addListItem) ipcMain.handle('db:addListItem', wrap((listId, animeData, position, userId) => dbModule.addListItem(listId, animeData, position, userId)));
      if (dbModule.updateListItem) ipcMain.handle('db:updateListItem', wrap((itemId, updates, userId) => dbModule.updateListItem(itemId, updates, userId)));
      if (dbModule.deleteListItem) ipcMain.handle('db:deleteListItem', wrap((itemId, userId) => dbModule.deleteListItem(itemId, userId)));
      if (dbModule.addAnimeToDefaultList) ipcMain.handle('db:addAnimeToDefaultList', wrap((animeData, userId) => dbModule.addAnimeToDefaultList(animeData, userId)));

      // --- External APIs ---
      ipcMain.handle('api:all-anime-data', async (event) => {
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

        try {
          const response = await fetch('https://graphql.anilist.co', options);
          const jikan_res = await fetch('https://api.jikan.moe/v4/seasons/now');
          const data1 = await response.json();
          const data2 = await jikan_res.json();

          if (!response.ok || data1.errors) throw new Error("Failed to fetch data from AniList");
          if (!jikan_res.ok) throw new Error("Failed to fetch data from Jikan");

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

          return { success: true, result: { topAiring, currentSeason } };
        } catch (err) {
          return { success: false, error: err.message || 'Internal Server Error' };
        }
      });

      ipcMain.handle('api:hero-items', async (event) => {
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

        try {
          const response = await fetch('https://graphql.anilist.co', options);
          const data = await response.json();
          if (!response.ok || data.errors) throw new Error("Failed to fetch data from AniList");

          const allAnime = data.data.Page.media;
          const heroItems = allAnime
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

          return { success: true, result: heroItems };
        } catch (err) {
          return { success: false, error: err.message || 'Internal Server Error' };
        }
      });

      ipcMain.handle('api:movies', async (event) => {
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

        try {
          const response = await fetch('https://graphql.anilist.co', options);
          const data = await response.json();
          if (!response.ok || data.errors) throw new Error("Failed to fetch data from AniList");

          const allMovies = data.data.Page.media;
          const movieItems = allMovies.map(anime => {
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

          return { success: true, result: movieItems };
        } catch (err) {
          return { success: false, error: err.message || 'Internal Server Error' };
        }
      });

      ipcMain.handle('api:anime:episodes', async (event, malId, jikanPage) => {
        try {
          if (!malId) return { success: false, error: 'missing malId' };

          if (jikanPage) {
            const pageNum = Math.max(1, parseInt(jikanPage, 10) || 1);
            const { episodes, pagination, ok, status } = await fetchEpisodesPage(malId, pageNum);
            if (!ok) return { success: false, error: `fetch failed with status ${status || 500}` };
            return { success: true, result: { episodes, pagination } };
          }

          const eps = await fetchAllEpisodes(malId);
          return { success: true, result: { episodes: eps } };
        } catch (err) {
          console.error('[Episode Route Error]:', err);
          return { success: false, error: 'server error' };
        }
      });

      ipcMain.handle('api:anime:resolve', async (event, body) => {
        try {
          let { title, id } = body ?? {};
          if (!title && !id) return { success: false, error: 'no input' };

          let matchedMalId = id ? parseInt(id, 10) : null;
          if (!matchedMalId && title) {
            const searchResults = await searchMAL(title);
            if (searchResults.length) {
              const bestMatch = pickBestMatch(title, searchResults);
              if (bestMatch) matchedMalId = bestMatch.mal_id;
            }
          }

          if (!matchedMalId) return { success: false, error: 'could not resolve id' };

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

          return { success: true, result: payload };
        } catch (err) {
          console.error('[Anime Resolve Route Error]:', err);
          return { success: false, error: 'server error' };
        }
      });

      console.log('Backend Services & IPC handlers established.');
    } else {
      console.warn('No utils/sqlite.js found to expose via IPC at', sqlitePath);
    }
  } catch (e) {
    console.warn('Failed to set up DB IPC handlers', e && e.message);
  }
}
// --- End Master Setup ---


// --- Application Initialization ---
async function createWindow() {
  const rootPath = path.join(__dirname, '..');

  // Initialize backend logic completely independent of the UI loading state
  setupAppBackend(rootPath);

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true
    }
  });

  win.setMenuBarVisibility(false);

  if (isDev) {
    // Development Mode
    win.loadURL('http://localhost:3000');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Production Mode: Load Static UI
    const indexPath = path.join(rootPath, 'out', 'index.html');
    win.loadFile(indexPath).catch(err => {
      console.error('Failed to load static Next.js export. Did you run "next build" with output: "export"?', err);
    });
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
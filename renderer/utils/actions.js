// A helper to dynamically get the active profile from localStorage
// This ensures that Lists and Items belong to the currently selected profile!
const getActiveProfileId = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('profileId') || 'default-user';
  }
  return 'default-user';
};

// --- Lists ---

export async function getLists(userId = getActiveProfileId()) {
  return await window.animeo.db.getLists(userId);
}

export async function getOrCreateDefaultList(userId = getActiveProfileId()) {
  return await window.animeo.db.getOrCreateDefaultList(userId);
}

export async function createList(title, userId = getActiveProfileId()) {
  return await window.animeo.db.createList(title, userId);
}

export async function updateList(id, title, userId = getActiveProfileId()) {
  return await window.animeo.db.updateList(id, title, userId);
}

export async function deleteList(id, userId = getActiveProfileId()) {
  return await window.animeo.db.deleteList(id, userId);
}

// --- List Items ---

export async function getListItems(listId, userId = getActiveProfileId()) {
  return await window.animeo.db.getListItems(listId, userId);
}

export async function addAnimeToDefaultList(animeData, userId = getActiveProfileId()) {
  return await window.animeo.db.addAnimeToDefaultList(animeData, userId);
}

export async function isAnimeInDefaultList(animeData, userId = getActiveProfileId()) {
  try {
    const list = await getOrCreateDefaultList(userId);
    const items = await getListItems(list.id, userId);
    const candidates = new Set([animeData?.id, animeData?.mal_id, animeData?.malId, animeData?.title].filter(Boolean));
    return items.some(item => {
      const a = item.anime || {};
      return (a.id && candidates.has(a.id)) || (a.mal_id && candidates.has(a.mal_id)) || (a.title && candidates.has(a.title));
    });
  } catch (e) {
    return false;
  }
}

export async function addListItem(listId, animeData, position = 0, userId = getActiveProfileId()) {
  const data = await window.animeo.db.addListItem(listId, animeData, position, userId);
  return { ...data, anime: animeData };
}

export async function updateListItem(itemId, updates, userId = getActiveProfileId()) {
  return await window.animeo.db.updateListItem(itemId, updates, userId);
}

export async function deleteListItem(itemId, userId = getActiveProfileId()) {
  return await window.animeo.db.deleteListItem(itemId, userId);
}

// --- API (main process via preload) ---
// Note: preload.js already unwraps the { success, result } payload 
// and throws errors automatically, so we just return the calls directly!

export async function getHeroItems() {
  return await window.animeo.api.heroItems();
}

export async function getAllAnimeData() {
  return await window.animeo.api.allAnimeData();
}

export async function getMovies() {
  return await window.animeo.api.movies();
}

export async function resolveAnime(body) {
  return await window.animeo.api.animeResolve(body);
}

export async function getAnimeEpisodes(malId, jikanPage, options) {
  return await window.animeo.api.animeEpisodes(malId, jikanPage, options);
}

export async function generateAnimeQuery(args) {
  return await window.animeo.anime.generateQuery(args);
}

export async function searchAnimeSources(args) {
  return await window.animeo.anime.search(args);
}

export async function startTorrentSession(payload) {
  return await window.animeo.torrent.startSession(payload);
}

export async function getTorrentSessionStatus(sessionId) {
  return await window.animeo.torrent.getSessionStatus(sessionId);
}

export async function stopTorrentSession(sessionId) {
  return await window.animeo.torrent.stopSession(sessionId);
}

// --- Profiles ---

export async function getProfiles() {
  return await window.animeo.api.profiles.get();
}

export async function createProfile(name, avatar) {
  return await window.animeo.api.profiles.create(name, avatar);
}

export async function deleteProfile(id) {
  return await window.animeo.api.profiles.delete(id);
}
// No "use server" - this is now a frontend utility file for Electron!

const LOCAL_USER_ID = 'local-user'; // Hardcoded for local Electron app

// Helper function to handle the IPC response format from main.js
function handleResponse(response) {
  // Some IPC/preload handlers already unwrap the `{ success, result }` shape
  // and return the `result` directly. Support both shapes here.
  if (response && typeof response === 'object' && Object.prototype.hasOwnProperty.call(response, 'success')) {
    if (!response.success) {
      console.error("Database Action Error:", response.error);
      throw new Error(response.error || 'Database action failed');
    }
    return response.result;
  }

  // Already-unwrapped response (assume success)
  return response;
}

// --- Lists ---

export async function getLists(userId = LOCAL_USER_ID) {
  const response = await window.animeo.db.getLists(userId);
  return handleResponse(response);
}

export async function getOrCreateDefaultList(userId = LOCAL_USER_ID) {
  const response = await window.animeo.db.getOrCreateDefaultList(userId);
  return handleResponse(response);
}

export async function createList(title, userId = LOCAL_USER_ID) {
  const response = await window.animeo.db.createList(title, userId);
  return handleResponse(response);
}

export async function updateList(id, title, userId = LOCAL_USER_ID) {
  const response = await window.animeo.db.updateList(id, title, userId);
  return handleResponse(response);
}

export async function deleteList(id, userId = LOCAL_USER_ID) {
  const response = await window.animeo.db.deleteList(id, userId);
  return handleResponse(response);
}

// --- List Items ---

export async function getListItems(listId) {
  const response = await window.animeo.db.getListItems(listId, LOCAL_USER_ID);
  return handleResponse(response);
}

export async function addAnimeToDefaultList(animeData, userId = LOCAL_USER_ID) {
  const response = await window.animeo.db.addAnimeToDefaultList(animeData, userId);
  return handleResponse(response);
}

export async function addListItem(listId, animeData, position = 0, userId = LOCAL_USER_ID) {
  const response = await window.animeo.db.addListItem(listId, animeData, position, userId);
  const data = handleResponse(response);
  return { ...data, anime: animeData };
}

export async function updateListItem(itemId, updates) {
  const response = await window.animeo.db.updateListItem(itemId, updates, LOCAL_USER_ID);
  return handleResponse(response);
}

export async function deleteListItem(itemId) {
  const response = await window.animeo.db.deleteListItem(itemId, LOCAL_USER_ID);
  return handleResponse(response);
}

// --- API (main process via preload) ---

function handleApiResponse(r) {
  // Main handlers return { success: true, result: ... }
  if (r && typeof r === 'object') {
    if (r.success === false) {
      console.error('API error', r.error);
      throw new Error(r.error || 'API error');
    }
    if (r.result !== undefined) return r.result;
    return r; // already a payload (legacy shape)
  }
  return r;
}

export async function getHeroItems() {
  const r = await window.animeo.api.heroItems();
  return handleApiResponse(r);
}

export async function getAllAnimeData() {
  const r = await window.animeo.api.allAnimeData();
  return handleApiResponse(r);
}

export async function getMovies() {
  const r = await window.animeo.api.movies();
  return handleApiResponse(r);
}

export async function resolveAnime(body) {
  const r = await window.animeo.api.animeResolve(body);
  return handleApiResponse(r);
}

export async function getAnimeEpisodes(malId, jikanPage) {
  const r = await window.animeo.api.animeEpisodes(malId, jikanPage);
  return handleApiResponse(r);
}

// Profiles via API (may also map to DB handlers)
export async function getProfiles() {
  const r = await window.animeo.api.profiles.get();
  return handleApiResponse(r);
}

export async function createProfile(name, avatar) {
  const r = await window.animeo.api.profiles.create(name, avatar);
  return handleApiResponse(r);
}

export async function deleteProfile(id) {
  const r = await window.animeo.api.profiles.delete(id);
  return handleApiResponse(r);
}
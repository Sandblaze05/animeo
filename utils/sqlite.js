const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

// Prefer an explicitly provided writable data directory (set by Electron main)
// Fallback to `process.cwd()/data` for dev mode.
const DB_DIR = process.env.ANIMEO_DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'animeo.sqlite');

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

function ensureDir() {
  if (!fs.existsSync(DB_DIR)) {
    try { fs.mkdirSync(DB_DIR, { recursive: true }); } catch (e) { /* ignore */ }
  }
}

function initDb() {
  if (db || usingFallback) return;
  try {
    ensureDir();
    // Native require works perfectly with Electron's ASAR reader
    const Database = require('better-sqlite3');
    db = new Database(DB_PATH);

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
    try {
      const testDb = path.join(process.cwd(), 'testdata', 'test-animeo.sqlite');
      if (fs.existsSync(testDb)) { /* nothing to do; fallback remains empty */ }
    } catch (e2) { /* ignore */ }
  }
}

// --- Database Functions ---

function getLists(userId) {
  initDb();
  if (usingFallback) {
    return inMemory.lists.filter(l => l.user_id === userId).sort((a,b)=>b.created_at.localeCompare(a.created_at));
  }
  return db.prepare('SELECT id, title, user_id, created_at FROM lists WHERE user_id = ? ORDER BY created_at DESC').all(userId);
}

function getProfiles() {
  initDb();
  if (usingFallback) {
    return [...inMemory.profiles].sort((a,b)=>b.created_at.localeCompare(a.created_at));
  }
  return db.prepare('SELECT id, name, avatar, created_at FROM profiles ORDER BY created_at DESC').all();
}

function createProfile(name, avatar = null) {
  initDb();
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
  initDb();
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
  initDb();
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
  initDb();
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
  initDb();
  if (usingFallback) {
    const idx = inMemory.lists.findIndex(l => l.id === id && l.user_id === userId);
    if (idx >= 0) { inMemory.lists[idx].title = title; return inMemory.lists[idx]; }
    return null;
  }
  db.prepare('UPDATE lists SET title = ? WHERE id = ? AND user_id = ?').run(title, id, userId);
  return db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
}

function deleteList(id, userId) {
  initDb();
  if (usingFallback) {
    inMemory.list_items = inMemory.list_items.filter(li => li.list_id !== id);
    inMemory.lists = inMemory.lists.filter(l => !(l.id === id && l.user_id === userId));
    return;
  }
  db.prepare('DELETE FROM list_items WHERE list_id = ?').run(id);
  db.prepare('DELETE FROM lists WHERE id = ? AND user_id = ?').run(id, userId);
}

function getListItems(listId, userId) {
  initDb();
  if (usingFallback) {
    const list = inMemory.lists.find(l => l.id === listId);
    if (!list || (userId && list.user_id !== userId)) throw new Error('List not found');
    const rows = inMemory.list_items.filter(li => li.list_id === listId).sort((a,b)=>a.position - b.position || a.created_at.localeCompare(b.created_at));
    return rows.map(r => ({ ...r, anime: JSON.parse(r.anime) }));
  }
  const list = db.prepare('SELECT user_id FROM lists WHERE id = ?').get(listId);
  if (!list || (userId && list.user_id !== userId)) throw new Error('List not found');
  const rows = db.prepare('SELECT id, list_id, anime, position, created_at FROM list_items WHERE list_id = ? ORDER BY position ASC, created_at ASC').all(listId);
  return rows.map(r => ({ ...r, anime: JSON.parse(r.anime) }));
}

function addListItem(listId, animeData, position = 0, userId) {
  initDb();
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
  initDb();
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
  initDb();
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
  initDb();
  if (usingFallback) {
    const list = getOrCreateDefaultList(userId);
    const existing = inMemory.list_items.filter(li => li.list_id === list.id).map(r => ({ id: r.id, anime: JSON.parse(r.anime) }));
    const alreadyExists = existing.some(item => item.anime?.id === animeData.id);
    if (alreadyExists) throw new Error('Anime already in your list');
    const last = [...inMemory.list_items].filter(li => li.list_id === list.id).sort((a,b)=>b.position - a.position)[0];
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

module.exports = {
  getLists,
  getProfiles,
  createProfile,
  deleteProfile,
  getOrCreateDefaultList,
  createList,
  updateList,
  deleteList,
  getListItems,
  addListItem,
  updateListItem,
  deleteListItem,
  addAnimeToDefaultList
};
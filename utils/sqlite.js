import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'animeo.sqlite');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Initialize tables
db.prepare(
  `CREATE TABLE IF NOT EXISTS lists (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`
).run();

db.prepare(
  `CREATE TABLE IF NOT EXISTS list_items (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL,
    anime TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`
).run();

db.prepare(
  `CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    avatar TEXT,
    created_at TEXT NOT NULL
  )`
).run();

function now() {
  return new Date().toISOString();
}

export function getLists(userId) {
  return db
    .prepare('SELECT id, title, user_id, created_at FROM lists WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId);
}

// Profiles
export function getProfiles() {
  return db.prepare('SELECT id, name, avatar, created_at FROM profiles ORDER BY created_at DESC').all();
}

export function createProfile(name, avatar = null) {
  const id = randomUUID();
  const created_at = now();
  db.prepare('INSERT INTO profiles (id, name, avatar, created_at) VALUES (?, ?, ?, ?)')
    .run(id, name, avatar, created_at);
  // Ensure this profile has a default list created for it
  try {
    getOrCreateDefaultList(id);
  } catch (e) {
    // non-fatal: if list creation fails, continue returning profile
    console.error('Failed to create default list for profile', id, e);
  }

  return db.prepare('SELECT id, name, avatar, created_at FROM profiles WHERE id = ?').get(id);
}

export function deleteProfile(profileId) {
  // Remove all list items belonging to lists owned by this profile
  const listIds = db.prepare('SELECT id FROM lists WHERE user_id = ?').all(profileId).map(r => r.id);
  if (listIds.length > 0) {
    const delItems = db.prepare(
      `DELETE FROM list_items WHERE list_id IN (${listIds.map(() => '?').join(',')})`
    );
    delItems.run(...listIds);
  }

  // Remove the lists owned by this profile
  db.prepare('DELETE FROM lists WHERE user_id = ?').run(profileId);

  // Finally remove the profile
  db.prepare('DELETE FROM profiles WHERE id = ?').run(profileId);
}

export function getOrCreateDefaultList(userId) {
  const row = db
    .prepare('SELECT * FROM lists WHERE user_id = ? AND title = ? LIMIT 1')
    .get(userId, 'My List');

  if (row) return row;

  const id = randomUUID();
  const created_at = now();
  db.prepare('INSERT INTO lists (id, title, user_id, created_at) VALUES (?, ?, ?, ?)')
    .run(id, 'My List', userId, created_at);

  return db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
}

export function createList(title, userId) {
  const id = randomUUID();
  const created_at = now();
  db.prepare('INSERT INTO lists (id, title, user_id, created_at) VALUES (?, ?, ?, ?)')
    .run(id, title, userId, created_at);
  return db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
}

export function updateList(id, title, userId) {
  db.prepare('UPDATE lists SET title = ? WHERE id = ? AND user_id = ?')
    .run(title, id, userId);
  return db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
}

export function deleteList(id, userId) {
  db.prepare('DELETE FROM list_items WHERE list_id = ?').run(id);
  db.prepare('DELETE FROM lists WHERE id = ? AND user_id = ?').run(id, userId);
}

export function getListItems(listId, userId) {
  // verify list belongs to user
  const list = db.prepare('SELECT user_id FROM lists WHERE id = ?').get(listId);
  if (!list || (userId && list.user_id !== userId)) throw new Error('List not found');

  const rows = db
    .prepare('SELECT id, list_id, anime, position, created_at FROM list_items WHERE list_id = ? ORDER BY position ASC, created_at ASC')
    .all(listId);
  return rows.map(r => ({ ...r, anime: JSON.parse(r.anime) }));
}

export function addListItem(listId, animeData, position = 0, userId) {
  // verify list belongs to user
  const list = db.prepare('SELECT user_id FROM lists WHERE id = ?').get(listId);
  if (!list || (userId && list.user_id !== userId)) throw new Error('List not found');

  const id = randomUUID();
  const created_at = now();
  db.prepare('INSERT INTO list_items (id, list_id, anime, position, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, listId, JSON.stringify(animeData), position, created_at);
  return db.prepare('SELECT * FROM list_items WHERE id = ?').get(id);
}

export function updateListItem(itemId, updates, userId) {
  // verify item exists and belongs to a list owned by user
  const row = db.prepare('SELECT li.id, li.list_id, l.user_id FROM list_items li JOIN lists l ON li.list_id = l.id WHERE li.id = ?').get(itemId);
  if (!row || (userId && row.user_id !== userId)) throw new Error('List item not found');

  const allowed = ['position'];
  const keys = Object.keys(updates).filter(k => allowed.includes(k));
  if (keys.length === 0) return db.prepare('SELECT * FROM list_items WHERE id = ?').get(itemId);
  const stmt = db.prepare(`UPDATE list_items SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`);
  stmt.run(...keys.map(k => updates[k]), itemId);
  return db.prepare('SELECT * FROM list_items WHERE id = ?').get(itemId);
}

export function deleteListItem(itemId, userId) {
  // verify item exists and belongs to a list owned by user
  const row = db.prepare('SELECT li.id, l.user_id FROM list_items li JOIN lists l ON li.list_id = l.id WHERE li.id = ?').get(itemId);
  if (!row || (userId && row.user_id !== userId)) throw new Error('List item not found');

  db.prepare('DELETE FROM list_items WHERE id = ?').run(itemId);
}

export function addAnimeToDefaultList(animeData, userId) {
  const list = getOrCreateDefaultList(userId);

  const existing = db
    .prepare('SELECT id, anime FROM list_items WHERE list_id = ?')
    .all(list.id)
    .map(r => ({ id: r.id, anime: JSON.parse(r.anime) }));

  const alreadyExists = existing.some(item => item.anime?.id === animeData.id);
  if (alreadyExists) throw new Error('Anime already in your list');

  const last = db.prepare('SELECT position FROM list_items WHERE list_id = ? ORDER BY position DESC LIMIT 1').get(list.id);
  const newPosition = last ? last.position + 1 : 0;

  const inserted = addListItem(list.id, animeData, newPosition, userId);
  return { ...inserted, anime: animeData };
}

export default db;

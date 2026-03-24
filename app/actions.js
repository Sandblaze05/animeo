"use server"

import { revalidatePath } from "next/cache";
import {
  getLists as dbGetLists,
  getOrCreateDefaultList as dbGetOrCreateDefaultList,
  createList as dbCreateList,
  updateList as dbUpdateList,
  deleteList as dbDeleteList,
  getListItems as dbGetListItems,
  addListItem as dbAddListItem,
  updateListItem as dbUpdateListItem,
  deleteListItem as dbDeleteListItem,
  addAnimeToDefaultList as dbAddAnimeToDefaultList,
} from "@/utils/sqlite";

// For local app with SQLite, use a fixed local user id.
const LOCAL_USER_ID = process.env.LOCAL_USER_ID || 'local-user';

// --- Lists ---

export async function getLists(userId = LOCAL_USER_ID) {
  return dbGetLists(userId);
}

export async function getOrCreateDefaultList(userId = LOCAL_USER_ID) {
  return dbGetOrCreateDefaultList(userId);
}

export async function createList(title, userId = LOCAL_USER_ID) {
  const data = dbCreateList(title, userId);
  revalidatePath('/', 'layout');
  return data;
}

export async function updateList(id, title, userId = LOCAL_USER_ID) {
  const data = dbUpdateList(id, title, userId);
  revalidatePath('/', 'layout');
  return data;
}

export async function deleteList(id, userId = LOCAL_USER_ID) {
  dbDeleteList(id, userId);
  revalidatePath('/', 'layout');
}

// --- List Items ---

export async function getListItems(listId) {
  return dbGetListItems(listId, LOCAL_USER_ID);
}

export async function addAnimeToDefaultList(animeData, userId = LOCAL_USER_ID) {
  const data = dbAddAnimeToDefaultList(animeData, userId);
  revalidatePath('/', 'layout');
  return data;
}

export async function addListItem(listId, animeData, position = 0, userId = LOCAL_USER_ID) {
  const data = dbAddListItem(listId, animeData, position, userId);
  revalidatePath('/', 'layout');
  return { ...data, anime: animeData };
}

export async function updateListItem(itemId, updates) {
  const data = dbUpdateListItem(itemId, updates, LOCAL_USER_ID);
  revalidatePath('/', 'layout');
  return data;
}

export async function deleteListItem(itemId) {
  // Rudimentary delete: remove the item
  dbDeleteListItem(itemId, LOCAL_USER_ID);
  revalidatePath('/', 'layout');
}
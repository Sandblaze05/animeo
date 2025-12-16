'use server'

import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

async function getSupabase() {
  const cookieStore = await cookies();
  return createClient(cookieStore);
}

async function getUser(supabase) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error("Unauthorized");
  }
  return user;
}

// --- Lists ---

export async function getLists() {
  const supabase = await getSupabase();
  const user = await getUser(supabase);

  const { data, error } = await supabase
    .from('lists')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function getOrCreateDefaultList() {
  const supabase = await getSupabase();
  const user = await getUser(supabase);

  // Check if default list exists
  const { data: existingList } = await supabase
    .from('lists')
    .select('*')
    .eq('user_id', user.id)
    .eq('title', 'My List')
    .single();

  if (existingList) {
    return existingList;
  }

  // Create default list if it doesn't exist
  const { data, error } = await supabase
    .from('lists')
    .insert({ title: 'My List', user_id: user.id })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function createList(title) {
  const supabase = await getSupabase();
  const user = await getUser(supabase);

  const { data, error } = await supabase
    .from('lists')
    .insert({ title, user_id: user.id })
    .select()
    .single();

  if (error) throw new Error(error.message);
  
  revalidatePath('/', 'layout');
  return data;
}

export async function updateList(id, title) {
  const supabase = await getSupabase();
  const user = await getUser(supabase);

  const { data, error } = await supabase
    .from('lists')
    .update({ title })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath('/', 'layout');
  return data;
}

export async function deleteList(id) {
  const supabase = await getSupabase();
  const user = await getUser(supabase);

  const { error } = await supabase
    .from('lists')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);

  revalidatePath('/', 'layout');
}

// --- List Items ---

export async function getListItems(listId) {
  const supabase = await getSupabase();
  
  const { data, error } = await supabase
    .from('list_items')
    .select('*')
    .eq('list_id', listId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

export async function addAnimeToDefaultList(animeData) {
  const supabase = await getSupabase();
  const user = await getUser(supabase);
  
  // Get or create default list
  const list = await getOrCreateDefaultList();

  // Check if anime already exists in the list using anime->id
  const { data: existingItems } = await supabase
    .from('list_items')
    .select('id, anime')
    .eq('list_id', list.id);

  // Check if this anime ID already exists
  const alreadyExists = existingItems?.some(item => item.anime?.id === animeData.id);
  
  if (alreadyExists) {
    throw new Error('Anime already in your list');
  }

  // Get current max position
  const { data: items } = await supabase
    .from('list_items')
    .select('position')
    .eq('list_id', list.id)
    .order('position', { ascending: false })
    .limit(1);

  const newPosition = items && items.length > 0 ? items[0].position + 1 : 0;

  const { data, error } = await supabase
    .from('list_items')
    .insert({ 
      list_id: list.id, 
      anime: animeData, 
      position: newPosition 
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath('/', 'layout');
  return data;
}

export async function addListItem(listId, animeData, position = 0) {
  const supabase = await getSupabase();
  const user = await getUser(supabase);
  
  // Verify list ownership
  const { data: list } = await supabase.from('lists').select('id').eq('id', listId).eq('user_id', user.id).single();
  if (!list) throw new Error("List not found or unauthorized");

  const { data, error } = await supabase
    .from('list_items')
    .insert({ list_id: listId, anime: animeData, position })
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath('/', 'layout');
  return data;
}

export async function updateListItem(itemId, updates) {
  const supabase = await getSupabase();
  
  const { data, error } = await supabase
    .from('list_items')
    .update(updates)
    .eq('id', itemId)
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath('/', 'layout');
  return data;
}

export async function deleteListItem(itemId) {
  const supabase = await getSupabase();
  
  const { error } = await supabase.rpc("delete_list_item_and_reorder", {
    p_item_id: itemId
  });

  if (error) throw new Error(error.message);

  revalidatePath('/', 'layout');
}
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('animeo', {
  isElectron: true,
  
  // --- DATABASE LISTS & ITEMS ---
  db: {
    getLists: async (userId) => {
      const r = await ipcRenderer.invoke('db:getLists', userId);
      if (r && r.success) return r.result;
      throw new Error(r?.error || 'Failed to get lists');
    },
    getOrCreateDefaultList: async (userId) => {
      const r = await ipcRenderer.invoke('db:getOrCreateDefaultList', userId);
      if (r && r.success) return r.result;
      throw new Error(r?.error || 'Failed to get/create default list');
    },
    createList: async (title, userId) => {
      const r = await ipcRenderer.invoke('db:createList', title, userId);
      if (r && r.success) return r.result;
      throw new Error(r?.error || 'Failed to create list');
    },
    updateList: async (id, title, userId) => {
      const r = await ipcRenderer.invoke('db:updateList', id, title, userId);
      if (r && r.success) return r.result;
      throw new Error(r?.error || 'Failed to update list');
    },
    deleteList: async (id, userId) => {
      const r = await ipcRenderer.invoke('db:deleteList', id, userId);
      if (r && r.success) return r.result;
      throw new Error(r?.error || 'Failed to delete list');
    },
    getListItems: async (listId, userId) => {
      const r = await ipcRenderer.invoke('db:getListItems', listId, userId);
      if (r && r.success) return r.result;
      throw new Error(r?.error || 'Failed to get list items');
    },
    addListItem: async (listId, animeData, position, userId) => {
      const r = await ipcRenderer.invoke('db:addListItem', listId, animeData, position, userId);
      if (r && r.success) return r.result;
      throw new Error(r?.error || 'Failed to add list item');
    },
    updateListItem: async (itemId, updates, userId) => {
      const r = await ipcRenderer.invoke('db:updateListItem', itemId, updates, userId);
      if (r && r.success) return r.result;
      throw new Error(r?.error || 'Failed to update list item');
    },
    deleteListItem: async (itemId, userId) => {
      const r = await ipcRenderer.invoke('db:deleteListItem', itemId, userId);
      if (r && r.success) return r.result;
      throw new Error(r?.error || 'Failed to delete list item');
    },
    addAnimeToDefaultList: async (animeData, userId) => {
      const r = await ipcRenderer.invoke('db:addAnimeToDefaultList', animeData, userId);
      if (r && r.success) return r.result;
      throw new Error(r?.error || 'Failed to add anime to default list');
    }
  },

  // --- EXTERNAL APIS & PROFILES ---
  api: {
    allAnimeData: async () => {
      const r = await ipcRenderer.invoke('api:all-anime-data');
      if (r && r.success) return r.result;
      throw new Error(r?.error || 'API error: allAnimeData');
    },
    heroItems: async () => {
      const r = await ipcRenderer.invoke('api:hero-items');
      if (r && r.success) return r.result;
      throw new Error(r?.error || 'API error: heroItems');
    },
    movies: async () => {
      const r = await ipcRenderer.invoke('api:movies');
      if (r && r.success) return r.result;
      throw new Error(r?.error || 'API error: movies');
    },
    animeEpisodes: async (malId, jikanPage, options) => {
      const r = await ipcRenderer.invoke('api:anime:episodes', malId, jikanPage, options);
      if (r && r.success) return r.result;
      throw new Error(r?.error || 'API error: animeEpisodes');
    },
    animeResolve: async (body) => {
      const r = await ipcRenderer.invoke('api:anime:resolve', body);
      if (r && r.success) return r.result;
      throw new Error(r?.error || 'API error: animeResolve');
    },
    
    // Profiles nested under API (Matching main.js exactly)
    profiles: {
      get: async () => {
        const r = await ipcRenderer.invoke('api:profiles:get');
        if (r && r.success) return r.result;
        throw new Error(r?.error || 'Failed to get profiles');
      },
      create: async (name, avatar) => {
        const r = await ipcRenderer.invoke('api:profiles:create', name, avatar);
        if (r && r.success) return r.result;
        throw new Error(r?.error || 'Failed to create profile');
      },
      delete: async (id) => {
        const r = await ipcRenderer.invoke('api:profiles:delete', id);
        if (r && r.success) return r.result;
        throw new Error(r?.error || 'Failed to delete profile');
      }
    }
  },

  // --- ANIME SEARCH HELPERS ---
  anime: {
    generateQuery: async (args) => {
      return await ipcRenderer.invoke('anime:generateQuery', args);
    },
    search: async (args) => {
      return await ipcRenderer.invoke('anime:search', args);
    }
  },

  torrent: {
    startSession: async (payload) => {
      const r = await ipcRenderer.invoke('torrent:session:start', payload);
      if (r && r.success) return r.result;
      throw new Error(r?.error || 'Failed to start stream session');
    },
    getSessionStatus: async (sessionId) => {
      const r = await ipcRenderer.invoke('torrent:session:status', sessionId);
      if (r && r.success) return r.result;
      throw new Error(r?.error || 'Failed to fetch stream session status');
    },
    stopSession: async (sessionId) => {
      const r = await ipcRenderer.invoke('torrent:session:stop', sessionId);
      if (r && r.success) return r.result;
      throw new Error(r?.error || 'Failed to stop stream session');
    }
  }
});
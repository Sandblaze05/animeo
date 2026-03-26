const { contextBridge } = require('electron');
const { ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('animeo', {
  isElectron: true,
  db: {
    getProfiles: async () => {
      const r = await ipcRenderer.invoke('db:getProfiles');
      if (r && r.success) return r.result;
      throw new Error(r && r.error);
    },
    createProfile: async (name, avatar) => {
      const r = await ipcRenderer.invoke('db:createProfile', name, avatar);
      if (r && r.success) return r.result;
      throw new Error(r && r.error);
    },
    deleteProfile: async (id) => {
      const r = await ipcRenderer.invoke('db:deleteProfile', id);
      if (r && r.success) return r.result;
      throw new Error(r && r.error);
    },
    // Lists
    getLists: async (userId) => {
      const r = await ipcRenderer.invoke('db:getLists', userId);
      if (r && r.success) return r.result;
      throw new Error(r && r.error);
    },
    getOrCreateDefaultList: async (userId) => {
      const r = await ipcRenderer.invoke('db:getOrCreateDefaultList', userId);
      if (r && r.success) return r.result;
      throw new Error(r && r.error);
    },
    createList: async (title, userId) => {
      const r = await ipcRenderer.invoke('db:createList', title, userId);
      if (r && r.success) return r.result;
      throw new Error(r && r.error);
    },
    // Items
    getListItems: async (listId, userId) => {
      const r = await ipcRenderer.invoke('db:getListItems', listId, userId);
      if (r && r.success) return r.result;
      throw new Error(r && r.error);
    },
    addAnimeToDefaultList: async (animeData, userId) => {
      const r = await ipcRenderer.invoke('db:addAnimeToDefaultList', animeData, userId);
      if (r && r.success) return r.result;
      throw new Error(r && r.error);
    }
  }
  ,
  api: {
    allAnimeData: async () => {
      const r = await ipcRenderer.invoke('api:all-anime-data');
      if (r && r.success !== false) return r;
      throw new Error(r && r.error ? r.error : 'API error');
    },
    heroItems: async () => {
      const r = await ipcRenderer.invoke('api:hero-items');
      if (r && r.success !== false) return r;
      throw new Error(r && r.error ? r.error : 'API error');
    },
    movies: async () => {
      const r = await ipcRenderer.invoke('api:movies');
      if (r && r.success !== false) return r;
      throw new Error(r && r.error ? r.error : 'API error');
    },
    animeEpisodes: async (malId, jikanPage) => {
      const r = await ipcRenderer.invoke('api:anime:episodes', malId, jikanPage);
      if (r && r.success !== false) return r;
      throw new Error(r && r.error ? r.error : 'API error');
    },
    animeResolve: async (body) => {
      const r = await ipcRenderer.invoke('api:anime:resolve', body);
      if (r && r.success !== false) return r;
      throw new Error(r && r.error ? r.error : 'API error');
    },
    profiles: {
      get: async () => {
        const r = await ipcRenderer.invoke('api:profiles:get');
        if (r && r.success !== false) return r;
        throw new Error(r && r.error ? r.error : 'API error');
      },
      create: async (name, avatar) => {
        const r = await ipcRenderer.invoke('api:profiles:create', name, avatar);
        if (r && r.success !== false) return r;
        throw new Error(r && r.error ? r.error : 'API error');
      },
      delete: async (id) => {
        const r = await ipcRenderer.invoke('api:profiles:delete', id);
        if (r && r.success !== false) return r;
        throw new Error(r && r.error ? r.error : 'API error');
      }
    }
  }
});

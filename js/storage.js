// ============================================================
// GESTOR DE ALMACENAMIENTO (LOCALSTORAGE)
// ============================================================

window.Storage = {
  // Clave base para localStorage
  prefix: 'drmusic_',

  // Métodos genéricos
  get: function(key, defaultValue = []) {
    try {
      const data = localStorage.getItem(this.prefix + key);
      return data ? JSON.parse(data) : defaultValue;
    } catch (e) {
      console.error('Error al leer de localStorage:', e);
      return defaultValue;
    }
  },

  set: function(key, value) {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value));
    } catch (e) {
      console.warn('Error al guardar en localStorage (¿lleno?):', e);
    }
  },

  // Gestión de Favoritos, Historial y Descargas
  add: function(key, item) {
    const data = this.get(key);
    const videoId = item.id && item.id.videoId;
    if (!videoId) return;

    if (!data.find(d => d.id && d.id.videoId === videoId)) {
      data.unshift(item);
      this.set(key, data);
    }
  },

  remove: function(key, videoId) {
    const data = this.get(key).filter(d => !(d.id && d.id.videoId === videoId));
    this.set(key, data);
  },

  has: function(key, videoId) {
    return this.get(key).some(d => d.id && d.id.videoId === videoId);
  },

  // Gestión de Listas de Reproducción (Playlists)
  getPlaylists: function() {
    return this.get('playlists', []);
  },

  createPlaylist: function(name) {
    const playlists = this.getPlaylists();
    const newPlaylist = {
      id: 'pl_' + Date.now(),
      name: name,
      tracks: []
    };
    playlists.push(newPlaylist);
    this.set('playlists', playlists);
    return newPlaylist;
  },

  deletePlaylist: function(playlistId) {
    const playlists = this.getPlaylists().filter(pl => pl.id !== playlistId);
    this.set('playlists', playlists);
  },

  addTrackToPlaylist: function(playlistId, track) {
    const playlists = this.getPlaylists();
    const playlist = playlists.find(pl => pl.id === playlistId);
    if (!playlist) return false;

    const videoId = track.id && track.id.videoId;
    if (!videoId) return false;

    // Verificar si la canción ya está en la playlist
    if (!playlist.tracks.find(t => t.id && t.id.videoId === videoId)) {
      playlist.tracks.push(track);
      this.set('playlists', playlists);
      return true;
    }
    return false; // Ya estaba agregada
  },

  removeTrackFromPlaylist: function(playlistId, videoId) {
    const playlists = this.getPlaylists();
    const playlist = playlists.find(pl => pl.id === playlistId);
    if (playlist) {
      playlist.tracks = playlist.tracks.filter(t => !(t.id && t.id.videoId === videoId));
      this.set('playlists', playlists);
    }
  },

  // Gestión de Configuración (Settings)
  getSettings: function() {
    const defaultSettings = {
      apiKey: '',
      theme: 'green',
      volume: 50
    };
    return this.get('settings', defaultSettings);
  },

  saveSetting: function(key, value) {
    const settings = this.getSettings();
    settings[key] = value;
    this.set('settings', settings);
  },

  // Caché Temporal de API offline
  saveOfflineSearch: function(query, data) {
    try {
      const cacheKey = 'search_' + query.toLowerCase().replace(/\s+/g, '_');
      localStorage.setItem(this.prefix + 'cache_' + cacheKey, JSON.stringify({
        data: data,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.warn('Caché de búsqueda lleno');
    }
  },

  getOfflineSearch: function(query) {
    try {
      const cacheKey = 'search_' + query.toLowerCase().replace(/\s+/g, '_');
      const cached = localStorage.getItem(this.prefix + 'cache_' + cacheKey);
      if (cached) {
        return JSON.parse(cached).data;
      }
    } catch (e) {}
    return null;
  },

  clearCache: function() {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith(this.prefix + 'cache_')) {
        localStorage.removeItem(k);
      }
    });
  }
};

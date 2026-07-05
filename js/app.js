// ============================================================
// LÓGICA PRINCIPAL DE LA APLICACIÓN - DR MUSIC
// ============================================================

const API_URL = 'https://www.googleapis.com/youtube/v3/search';

// Estado de la reproducción
let player = null;
let playerReady = false;
let currentQueue = [];
let currentIndex = -1;
let isPlaying = false;
let progressInterval = null;
let searchTimeout = null;

// Modos de reproducción
let isShuffle = false;
let isRepeat = 'none'; // 'none' | 'all' | 'one'
let shuffledIndices = [];
let shuffledPosition = -1;

let currentPage = 'home';
let currentTrack = null;
let activeLibraryTab = 'favorites';
let activePlaylistId = null;

// ============================================================
// INICIALIZACIÓN
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  updateGreeting();
  setupEventListeners();
  loadInitialContent();
  navigateTo('home');
  registerServiceWorker();
  checkProtocol();
});

// Comprobar si se ejecuta bajo protocolo local file://
function checkProtocol() {
  if (window.location.protocol === 'file:') {
    console.warn('Advertencia de Origen: La aplicación se está ejecutando mediante el protocolo file://. El reproductor de YouTube requiere un servidor local HTTP/HTTPS (como localhost) para funcionar correctamente debido a las políticas de seguridad de origen.');
    setTimeout(() => {
      showError('Advertencia: Ejecutando en local (file://). El reproductor de YouTube podría no funcionar. Usa un servidor local.');
    }, 1000);
  }
}

// Cargar clave API de YouTube activa
function getApiKey() {
  return window.Storage.getSettings().apiKey;
}

// Aplicar tema de color seleccionado
function applyTheme() {
  const settings = window.Storage.getSettings();
  document.body.className = 'theme-' + (settings.theme || 'red');
  
  // Activar el punto de tema en modal de configuración
  document.querySelectorAll('.theme-dot').forEach(dot => {
    dot.classList.toggle('active', dot.dataset.theme === settings.theme);
  });
}

// Registrar el Service Worker para soporte Offline
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('Service Worker registrado con éxito:', reg.scope))
        .catch(err => console.warn('Registro de Service Worker fallido:', err));
    });
  }
}

// Detector de conexión Offline
function updateOfflineStatus() {
  const badge = document.getElementById('offline-badge');
  if (!navigator.onLine) {
    badge.classList.add('show');
    showToast('Sin conexión - Cambiado a modo offline');
  } else {
    badge.classList.remove('show');
  }
}
window.addEventListener('online', updateOfflineStatus);
window.addEventListener('offline', updateOfflineStatus);
updateOfflineStatus();

// ============================================================
// NAVEGACIÓN Y VISTAS
// ============================================================
function navigateTo(page) {
  currentPage = page;
  
  // Ocultar todas las páginas
  document.querySelectorAll('[id^="page-"]').forEach(p => p.style.display = 'none');
  
  // Mostrar la página activa
  document.getElementById('page-' + page).style.display = 'block';
  
  // Actualizar estado del Bottom Nav
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const activeNav = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (activeNav) activeNav.classList.add('active');

  // Acciones específicas de cada página
  if (page === 'library') {
    // Si estábamos viendo un detalle de playlist, volver al listado
    goBackToPlaylists();
    loadLibrary();
  }
  if (page === 'history') {
    loadHistory();
  }
  if (page === 'search') {
    document.getElementById('search').focus();
  }
  
  window.scrollTo(0, 0);
}
window.navigateTo = navigateTo; // Exponer a HTML

// Saludo según hora del día
function updateGreeting() {
  const hour = new Date().getHours();
  let greeting = 'Buenos días';
  if (hour >= 12 && hour < 18) greeting = 'Buenas tardes';
  else if (hour >= 18) greeting = 'Buenas noches';
  document.getElementById('greeting').textContent = greeting;
}

// ============================================================
// COMPONENTES UI (TOAST, ACTION SHEET, MODALS)
// ============================================================
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}
window.showToast = showToast;

function showActionSheet(item) {
  const sheet = document.getElementById('action-sheet');
  const content = document.getElementById('action-sheet-content');
  const videoId = item.id.videoId;
  const isLiked = window.Storage.has('favorites', videoId);
  const isOffline = window.Storage.has('offline', videoId);
  const thumb = item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '';

  content.innerHTML = `
    <div class="action-sheet-info">
      <img src="${thumb}" alt="">
      <div style="min-width:0;">
        <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(item.snippet.title)}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${escapeHtml(item.snippet.channelTitle)}</div>
      </div>
    </div>
    <button class="action-sheet-item" onclick="handleAction('like')">
      <ion-icon name="${isLiked ? 'heart' : 'heart-outline'}"></ion-icon>
      ${isLiked ? 'Quitar de favoritos' : 'Agregar a favoritos'}
    </button>
    <button class="action-sheet-item" onclick="handleAction('playlist')">
      <ion-icon name="musical-notes-outline"></ion-icon>
      Agregar a playlist
    </button>
    <button class="action-sheet-item" onclick="handleAction('queue')">
      <ion-icon name="list-outline"></ion-icon>
      Agregar a la cola
    </button>
    <button class="action-sheet-item" onclick="handleAction('offline')">
      <ion-icon name="${isOffline ? 'cloud-download' : 'cloud-download-outline'}"></ion-icon>
      ${isOffline ? 'Quitar de offline' : 'Guardar para offline'}
    </button>
    <button class="action-sheet-item" onclick="handleAction('share')">
      <ion-icon name="share-outline"></ion-icon>
      Compartir
    </button>
    <button class="action-sheet-cancel" onclick="closeActionSheet()">Cancelar</button>
  `;

  window._actionItem = item;
  sheet.classList.add('active');
}
window.showActionSheet = showActionSheet;

function closeActionSheet() {
  document.getElementById('action-sheet').classList.remove('active');
  window._actionItem = null;
}
window.closeActionSheet = closeActionSheet;

function handleAction(action) {
  const item = window._actionItem;
  if (!item) return;

  switch(action) {
    case 'like': 
      toggleLikeTrack(item); 
      closeActionSheet();
      break;
    case 'playlist':
      closeActionSheet();
      openPlaylistSelectModal(item);
      break;
    case 'queue':
      addToQueue(item);
      closeActionSheet();
      break;
    case 'offline': 
      toggleOfflineTrack(item); 
      closeActionSheet();
      break;
    case 'share': 
      shareTrack(item); 
      closeActionSheet();
      break;
  }
}
window.handleAction = handleAction;

// ============================================================
// AUDIO SILENCIOSO Y MEDIA SESSION (SOPORTE SEGUNDO PLANO)
// ============================================================
let silentPlayer = null;

function initSilentAudio() {
  if (!silentPlayer) {
    silentPlayer = new Audio();
    // 0.1s silent WAV file base64 data URI
    silentPlayer.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
    silentPlayer.loop = true;
  }
}

function playSilentAudio() {
  initSilentAudio();
  silentPlayer.play().catch(err => {
    console.warn('No se pudo reproducir el audio silencioso:', err);
  });
}

function pauseSilentAudio() {
  if (silentPlayer) {
    silentPlayer.pause();
  }
}

function updateMediaSession() {
  if ('mediaSession' in navigator && currentTrack) {
    const title = currentTrack.snippet.title;
    const artist = currentTrack.snippet.channelTitle;
    const thumb = currentTrack.snippet.thumbnails?.medium?.url || currentTrack.snippet.thumbnails?.default?.url || '';

    navigator.mediaSession.metadata = new MediaMetadata({
      title: title,
      artist: artist,
      album: 'DR Music',
      artwork: [
        { src: thumb, sizes: '96x96',   type: 'image/jpeg' },
        { src: thumb, sizes: '128x128', type: 'image/jpeg' },
        { src: thumb, sizes: '192x192', type: 'image/jpeg' },
        { src: thumb, sizes: '256x256', type: 'image/jpeg' },
        { src: thumb, sizes: '384x384', type: 'image/jpeg' },
        { src: thumb, sizes: '512x512', type: 'image/jpeg' }
      ]
    });

    setupMediaSessionActions();
  }
}

function setupMediaSessionActions() {
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('play', () => {
        togglePlay();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        togglePlay();
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        prevTrack();
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        nextTrack();
      });
    } catch (error) {
      console.warn('El navegador no soporta algunos manejadores de Media Session:', error);
    }
  }
}

// ============================================================
// REPRODUCTOR YOUTUBE
// ============================================================
const scriptTag = document.createElement('script');
scriptTag.src = 'https://www.youtube.com/iframe_api';
document.head.appendChild(scriptTag);

// Registrar el callback global para el IFrame de YT
window.onYouTubeIframeAPIReady = function() {
  player = new YT.Player('yt-player', {
    height: '1', width: '1',
    playerVars: { autoplay: 0, controls: 0, playsinline: 1, rel: 0, showinfo: 0, modestbranding: 1 },
    events: { 
      onReady: onPlayerReady, 
      onStateChange: onPlayerStateChange, 
      onError: onPlayerError 
    }
  });
};

function onPlayerReady(event) {
  playerReady = true;
  console.log('Reproductor listo');
  player.setVolume(window.Storage.getSettings().volume);
  updateControlsState();
}

function onPlayerStateChange(event) {
  isPlaying = event.data === YT.PlayerState.PLAYING;
  updatePlayButtons();
  
  // Agregar o quitar clases visuales de reproducción en las canciones
  document.querySelectorAll('.track').forEach((t) => {
    const isThisPlaying = currentTrack && t.querySelector('.track-menu')?.getAttribute('onclick')?.includes(currentTrack.id.videoId);
    t.classList.toggle('playing', !!(isThisPlaying && isPlaying));
    const numEl = t.querySelector('.track-num');
    if (numEl && numEl.textContent !== '♪') {
      const originalNum = t.dataset.index ? parseInt(t.dataset.index) + 1 : '';
      numEl.textContent = (isThisPlaying && isPlaying) ? '♪' : originalNum;
    }
  });

  const artwork = document.getElementById('fs-artwork');
  if (isPlaying) {
    artwork.classList.add('playing');
    startProgressUpdate();
    playSilentAudio();
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
  } else {
    artwork.classList.remove('playing');
    stopProgressUpdate();
    if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
      pauseSilentAudio();
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
    }
  }

  // Reproducción finalizada
  if (event.data === YT.PlayerState.ENDED) {
    if (isRepeat === 'one') {
      player.playVideo();
    } else {
      nextTrack();
    }
  }
}

function onPlayerError(event) {
  console.error('Error de YouTube:', event.data);
  showError('Error al reproducir. Intentando reproducir la siguiente...');
  nextTrack();
}

function updatePlayButtons() {
  const icon = isPlaying ? 'pause' : 'play';
  const playBtn = document.querySelector('#play-btn ion-icon');
  const fsPlayBtn = document.querySelector('#fs-play-btn ion-icon');
  if (playBtn) playBtn.setAttribute('name', icon);
  if (fsPlayBtn) fsPlayBtn.setAttribute('name', icon);
}

// ============================================================
// CONTROL DE PROGRESO Y TIEMPOS
// ============================================================
function startProgressUpdate() {
  stopProgressUpdate();
  progressInterval = setInterval(() => {
    if (player && player.getDuration && player.getCurrentTime) {
      const duration = player.getDuration();
      const current = player.getCurrentTime();
      if (duration > 0) {
        const pct = (current / duration) * 100;
        document.getElementById('progress-fill').style.width = pct + '%';
        document.getElementById('fs-progress-fill').style.width = pct + '%';
        document.getElementById('fs-current').textContent = formatTime(current);
        document.getElementById('fs-duration').textContent = formatTime(duration);
      }
    }
  }, 500);
}

function stopProgressUpdate() {
  if (progressInterval) { 
    clearInterval(progressInterval); 
    progressInterval = null; 
  }
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + s.toString().padStart(2, '0');
}

function seekToPercentage(pct) {
  if (player && player.getDuration) {
    const duration = player.getDuration();
    if (duration > 0) {
      player.seekTo(duration * (pct / 100), true);
    }
  }
}

// ============================================================
// BUSCADOR DINÁMICO
// ============================================================
async function searchYouTube(query) {
  const key = getApiKey();
  if (!key) {
    throw new Error('Configura tu clave de API de YouTube en los ajustes.');
  }

  // Comprobar caché local primero
  const cached = window.Storage.getOfflineSearch(query);
  if (cached && !navigator.onLine) {
    console.log('Modo offline - Usando resultados de caché');
    return cached;
  }

  const url = `${API_URL}?part=snippet&type=video&videoCategoryId=10&videoEmbeddable=true&q=${encodeURIComponent(query + ' audio')}&maxResults=20&key=${key}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Error HTTP ' + res.status);
    }
    const data = await res.json();
    const items = data.items || [];
    window.Storage.saveOfflineSearch(query, items);
    return items;
  } catch (error) {
    if (cached) {
      showToast('Error de red. Usando resultados en caché.');
      return cached;
    }
    throw new Error(error.message);
  }
}

function searchGenre(genre) {
  const searchInput = document.getElementById('search');
  searchInput.value = genre;
  navigateTo('search');
  // Disparar búsqueda
  searchInput.dispatchEvent(new Event('input'));
}
window.searchGenre = searchGenre;

// Renderizar lista de canciones
function renderResults(items, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  
  if (items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <ion-icon name="search-outline"></ion-icon>
        <p>No se encontraron resultados</p>
      </div>`;
    return;
  }

  items.forEach((item, i) => {
    const title = item.snippet.title;
    const channel = item.snippet.channelTitle;
    const thumb = item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '';
    const videoId = item.id.videoId;

    const div = document.createElement('div');
    div.className = 'track fade-in';
    div.dataset.index = i;
    
    // Comprobar si se está reproduciendo esta canción
    const isThisPlaying = currentTrack && currentTrack.id.videoId === videoId && isPlaying;
    if (isThisPlaying) {
      div.className += ' playing';
    }

    div.innerHTML = `
      <div class="track-num">${isThisPlaying ? '♪' : (i + 1)}</div>
      <img src="${thumb}" alt="" loading="lazy">
      <div class="track-info">
        <div class="title">${escapeHtml(title)}</div>
        <div class="artist">${escapeHtml(channel)}</div>
      </div>
      <div class="track-menu" onclick="event.stopPropagation(); window._actionItem = currentQueue[${i}] || ${JSON.stringify(item).replace(/"/g, '&quot;')}; showActionSheet(window._actionItem)">
        <ion-icon name="ellipsis-vertical"></ion-icon>
      </div>
    `;
    div.onclick = () => playTrack(items, i);
    container.appendChild(div);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================================
// FAVORITOS Y DESCARGAS OFFLINE
// ============================================================
function toggleLikeTrack(item) {
  const videoId = item.id.videoId;
  if (window.Storage.has('favorites', videoId)) {
    window.Storage.remove('favorites', videoId);
    showToast('Eliminado de favoritos');
  } else {
    window.Storage.add('favorites', item);
    showToast('Agregado a favoritos');
  }
  updateLikeButton();
  if (currentPage === 'library') loadLibrary();
}

function toggleLike() {
  if (!currentTrack) return;
  toggleLikeTrack(currentTrack);
}
window.toggleLike = toggleLike;

function updateLikeButton() {
  if (!currentTrack) return;
  const isLiked = window.Storage.has('favorites', currentTrack.id.videoId);
  const btn = document.getElementById('like-btn');
  if (btn) btn.classList.toggle('active', isLiked);
}

function toggleOfflineTrack(item) {
  const videoId = item.id.videoId;
  if (window.Storage.has('offline', videoId)) {
    window.Storage.remove('offline', videoId);
    showToast('Eliminado de descargas');
  } else {
    window.Storage.add('offline', item);
    showToast('Guardado en la caché local');
  }
  updateOfflineButton();
  if (currentPage === 'library') loadLibrary();
}

function addToOffline() {
  if (!currentTrack) return;
  toggleOfflineTrack(currentTrack);
}
window.addToOffline = addToOffline;

function updateOfflineButton() {
  if (!currentTrack) return;
  const isOffline = window.Storage.has('offline', currentTrack.id.videoId);
  const btn = document.getElementById('offline-btn');
  if (btn) {
    btn.classList.toggle('active', isOffline);
    btn.style.color = isOffline ? 'var(--accent)' : '';
  }
}

function shareTrack(item) {
  const url = 'https://youtube.com/watch?v=' + item.id.videoId;
  if (navigator.share) {
    navigator.share({
      title: item.snippet.title,
      text: `Escucha ${item.snippet.title} en DR Music`,
      url: url
    }).catch(console.error);
  } else {
    navigator.clipboard.writeText(url);
    showToast('Enlace copiado al portapapeles');
  }
}

// ============================================================
// HISTORIAL DE REPRODUCCIÓN
// ============================================================
function addToHistory(item) {
  const history = window.Storage.get('history');
  // Evitar duplicados consecutivos
  if (history.length > 0 && history[0].id && history[0].id.videoId === item.id.videoId) {
    return;
  }
  const entry = Object.assign({}, item, { playedAt: Date.now() });
  history.unshift(entry);
  if (history.length > 100) history.length = 100;
  window.Storage.set('history', history);
}

function loadHistory() {
  const history = window.Storage.get('history');
  const container = document.getElementById('history-list');
  if (history.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <ion-icon name="time-outline"></ion-icon>
        <p>Aún no has escuchado nada</p>
      </div>`;
    return;
  }

  // Agrupar por fechas
  const grouped = {};
  history.forEach(item => {
    const date = new Date(item.playedAt);
    const dateKey = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(item);
  });

  container.innerHTML = '';
  Object.entries(grouped).forEach(([date, items]) => {
    const dateEl = document.createElement('div');
    dateEl.className = 'history-date';
    dateEl.textContent = date;
    container.appendChild(dateEl);

    items.forEach((item, i) => {
      const thumb = item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '';
      const div = document.createElement('div');
      div.className = 'track';
      div.innerHTML = `
        <div class="track-num">${i + 1}</div>
        <img src="${thumb}" alt="" loading="lazy">
        <div class="track-info">
          <div class="title">${escapeHtml(item.snippet?.title || 'Sin título')}</div>
          <div class="artist">${escapeHtml(item.snippet?.channelTitle || 'Desconocido')}</div>
        </div>
        <div class="track-menu" onclick="event.stopPropagation(); window._actionItem = ${JSON.stringify(item).replace(/"/g, '&quot;')}; showActionSheet(window._actionItem)">
          <ion-icon name="ellipsis-vertical"></ion-icon>
        </div>
      `;
      div.onclick = () => playTrack([item], 0);
      container.appendChild(div);
    });
  });
}

function clearHistory() {
  if (confirm('¿Quieres borrar todo el historial?')) {
    window.Storage.set('history', []);
    loadHistory();
    showToast('Historial borrado');
  }
}
window.clearHistory = clearHistory;

// ============================================================
// BIBLIOTECA (TABS, PLAYLISTS DETALLE)
// ============================================================
function switchLibraryTab(tab) {
  activeLibraryTab = tab;
  document.querySelectorAll('.library-tab').forEach(t => t.classList.remove('active'));
  const activeTabBtn = document.querySelector(`.library-tab[data-tab="${tab}"]`);
  if (activeTabBtn) activeTabBtn.classList.add('active');

  document.getElementById('library-favorites').style.display = tab === 'favorites' ? 'block' : 'none';
  document.getElementById('library-playlists').style.display = tab === 'playlists' ? 'block' : 'none';
  document.getElementById('library-offline').style.display = tab === 'offline' ? 'block' : 'none';
  
  loadLibraryContent(tab);
}
window.switchLibraryTab = switchLibraryTab;

function loadLibrary() {
  switchLibraryTab(activeLibraryTab);
}

function loadLibraryContent(tab) {
  if (tab === 'favorites') {
    const favorites = window.Storage.get('favorites');
    const container = document.getElementById('favorites-list');
    if (favorites.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <ion-icon name="heart-outline"></ion-icon>
          <p>No tienes favoritos aún</p>
        </div>`;
      return;
    }
    container.innerHTML = '';
    favorites.forEach((item, i) => {
      const thumb = item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '';
      const div = document.createElement('div');
      div.className = 'track';
      div.innerHTML = `
        <div class="track-num">${i + 1}</div>
        <img src="${thumb}" alt="" loading="lazy">
        <div class="track-info">
          <div class="title">${escapeHtml(item.snippet?.title || 'Sin título')}</div>
          <div class="artist">${escapeHtml(item.snippet?.channelTitle || 'Desconocido')}</div>
        </div>
        <div class="track-menu" onclick="event.stopPropagation(); window._actionItem = ${JSON.stringify(item).replace(/"/g, '&quot;')}; showActionSheet(window._actionItem)">
          <ion-icon name="ellipsis-vertical"></ion-icon>
        </div>
      `;
      div.onclick = () => playTrack(favorites, i);
      container.appendChild(div);
    });
  }

  if (tab === 'playlists') {
    const container = document.getElementById('playlists-grid');
    const playlists = window.Storage.getPlaylists();
    
    let html = `
      <div class="library-item" onclick="openCreatePlaylistModal()">
        <div style="background:linear-gradient(135deg,var(--accent),var(--bg-elevated));aspect-ratio:1;border-radius:12px;display:flex;align-items:center;justify-content:center;box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
          <ion-icon name="add" style="font-size:48px;color:#000;"></ion-icon>
        </div>
        <div class="title" style="margin-top:8px;">Crear playlist</div>
        <div class="subtitle">Nueva lista</div>
      </div>
    `;

    playlists.forEach(pl => {
      const count = pl.tracks.length;
      html += `
        <div class="library-item" onclick="viewPlaylistDetail('${pl.id}')">
          <div style="background:linear-gradient(135deg,#242424,#121212);aspect-ratio:1;border-radius:12px;display:flex;align-items:center;justify-content:center;box-shadow: 0 4px 12px rgba(0,0,0,0.3);position:relative;">
            <ion-icon name="musical-notes-outline" style="font-size:40px;color:var(--text-secondary);"></ion-icon>
          </div>
          <div class="title" style="margin-top:8px;">${escapeHtml(pl.name)}</div>
          <div class="subtitle">${count} canciones</div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  if (tab === 'offline') {
    const offline = window.Storage.get('offline');
    const container = document.getElementById('offline-list');
    if (offline.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <ion-icon name="cloud-offline-outline"></ion-icon>
          <p>No tienes descargas aún</p>
        </div>`;
      return;
    }
    container.innerHTML = '';
    offline.forEach((item, i) => {
      const thumb = item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '';
      const div = document.createElement('div');
      div.className = 'track';
      div.innerHTML = `
        <div class="track-num">${i + 1}</div>
        <img src="${thumb}" alt="" loading="lazy">
        <div class="track-info">
          <div class="title">${escapeHtml(item.snippet?.title || 'Sin título')}</div>
          <div class="artist">${escapeHtml(item.snippet?.channelTitle || 'Desconocido')}</div>
        </div>
        <div class="track-menu" onclick="event.stopPropagation(); window._actionItem = ${JSON.stringify(item).replace(/"/g, '&quot;')}; showActionSheet(window._actionItem)">
          <ion-icon name="ellipsis-vertical"></ion-icon>
        </div>
      `;
      div.onclick = () => playTrack(offline, i);
      container.appendChild(div);
    });
  }
}

// ============================================================
// FUNCIONES PLAYLIST DETALLE E INTERACTIVIDAD
// ============================================================
function viewPlaylistDetail(playlistId) {
  activePlaylistId = playlistId;
  const playlist = window.Storage.getPlaylists().find(pl => pl.id === playlistId);
  if (!playlist) return;

  // Ocultar grids y pestañas
  document.getElementById('library-favorites').style.display = 'none';
  document.getElementById('library-playlists').style.display = 'none';
  document.getElementById('library-offline').style.display = 'none';
  document.querySelector('.library-tabs').style.display = 'none';

  // Mostrar el panel de detalles
  const detailPanel = document.getElementById('library-playlist-detail');
  detailPanel.style.display = 'block';

  // Llenar datos
  document.getElementById('playlist-detail-title').textContent = playlist.name;
  document.getElementById('playlist-detail-count').textContent = `${playlist.tracks.length} canciones`;

  // Renderizar pistas
  const container = document.getElementById('playlist-detail-tracks');
  container.innerHTML = '';
  
  if (playlist.tracks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <ion-icon name="musical-note-outline"></ion-icon>
        <p>Esta playlist no tiene canciones</p>
      </div>`;
    document.getElementById('play-playlist-btn').disabled = true;
  } else {
    document.getElementById('play-playlist-btn').disabled = false;
    playlist.tracks.forEach((item, i) => {
      const thumb = item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '';
      const div = document.createElement('div');
      div.className = 'track';
      div.innerHTML = `
        <div class="track-num">${i + 1}</div>
        <img src="${thumb}" alt="" loading="lazy">
        <div class="track-info">
          <div class="title">${escapeHtml(item.snippet?.title || 'Sin título')}</div>
          <div class="artist">${escapeHtml(item.snippet?.channelTitle || 'Desconocido')}</div>
        </div>
        <div class="track-menu" onclick="event.stopPropagation(); removeTrackFromPlaylist('${playlistId}', '${item.id.videoId}')">
          <ion-icon name="trash-outline" style="color:#ff453a;"></ion-icon>
        </div>
      `;
      div.onclick = () => playTrack(playlist.tracks, i);
      container.appendChild(div);
    });
  }

  // Asignar eventos de los botones
  document.getElementById('delete-playlist-btn').onclick = () => {
    if (confirm(`¿Eliminar la playlist "${playlist.name}"?`)) {
      window.Storage.deletePlaylist(playlistId);
      showToast('Playlist eliminada');
      goBackToPlaylists();
      loadLibraryContent('playlists');
    }
  };

  document.getElementById('play-playlist-btn').onclick = () => {
    if (playlist.tracks.length > 0) {
      playTrack(playlist.tracks, 0);
    }
  };
}
window.viewPlaylistDetail = viewPlaylistDetail;

function goBackToPlaylists() {
  activePlaylistId = null;
  const detailPanel = document.getElementById('library-playlist-detail');
  if (detailPanel) detailPanel.style.display = 'none';

  // Mostrar tabs
  const tabs = document.querySelector('.library-tabs');
  if (tabs) tabs.style.display = 'flex';
  
  // Re-visualizar pestaña activa
  switchLibraryTab(activeLibraryTab);
}
window.goBackToPlaylists = goBackToPlaylists;

function removeTrackFromPlaylist(playlistId, videoId) {
  if (confirm('¿Quitar canción de la playlist?')) {
    window.Storage.removeTrackFromPlaylist(playlistId, videoId);
    showToast('Canción eliminada de la playlist');
    viewPlaylistDetail(playlistId);
  }
}
window.removeTrackFromPlaylist = removeTrackFromPlaylist;

// ============================================================
// MODAL DE CREAR PLAYLIST
// ============================================================
function openCreatePlaylistModal() {
  const modal = document.getElementById('playlist-modal');
  modal.classList.add('active');
  const input = document.getElementById('playlist-name');
  input.value = '';
  input.focus();
}
window.openCreatePlaylistModal = openCreatePlaylistModal;

function closeCreatePlaylistModal() {
  document.getElementById('playlist-modal').classList.remove('active');
}
window.closeCreatePlaylistModal = closeCreatePlaylistModal;

function submitPlaylist() {
  const name = document.getElementById('playlist-name').value.trim();
  if (name.length === 0) {
    showToast('El nombre no puede estar vacío');
    return;
  }
  window.Storage.createPlaylist(name);
  showToast(`Playlist "${name}" creada`);
  closeCreatePlaylistModal();
  loadLibraryContent('playlists');
}
window.submitPlaylist = submitPlaylist;

// ============================================================
// MODAL SELECCIONAR PLAYLIST (AGREGAR A PLAYLIST)
// ============================================================
function openPlaylistSelectModal(track) {
  window._playlistTrack = track;
  const modal = document.getElementById('playlist-select-modal');
  const listContainer = document.getElementById('playlist-select-list');
  const playlists = window.Storage.getPlaylists();

  if (playlists.length === 0) {
    listContainer.innerHTML = `
      <p style="color:var(--text-secondary);text-align:center;padding:16px 0;">No tienes playlists.</p>
      <button class="btn btn-primary" onclick="closePlaylistSelectModal(); navigateTo('library'); openCreatePlaylistModal();" style="width:100%;margin-top:8px;">Crear una playlist</button>
    `;
  } else {
    listContainer.innerHTML = playlists.map(pl => `
      <button class="action-sheet-item" onclick="addTrackToPlaylistSelected('${pl.id}')" style="border-radius:8px;margin-bottom:4px;">
        <ion-icon name="musical-notes"></ion-icon>
        ${escapeHtml(pl.name)}
      </button>
    `).join('');
  }
  
  modal.classList.add('active');
}
window.openPlaylistSelectModal = openPlaylistSelectModal;

function closePlaylistSelectModal() {
  document.getElementById('playlist-select-modal').classList.remove('active');
  window._playlistTrack = null;
}
window.closePlaylistSelectModal = closePlaylistSelectModal;

function addTrackToPlaylistSelected(playlistId) {
  const track = window._playlistTrack;
  if (!track) return;
  
  const success = window.Storage.addTrackToPlaylist(playlistId, track);
  const playlist = window.Storage.getPlaylists().find(pl => pl.id === playlistId);
  
  if (success) {
    showToast(`Agregado a "${playlist.name}"`);
  } else {
    showToast(`Esta canción ya está en "${playlist.name}"`);
  }
  closePlaylistSelectModal();
}
window.addTrackToPlaylistSelected = addTrackToPlaylistSelected;

// ============================================================
// COLA DE REPRODUCCIÓN (PLAY QUEUE) Y SHUFFLE
// ============================================================
function addToQueue(track) {
  if (currentQueue.length === 0) {
    playTrack([track], 0);
  } else {
    currentQueue.push(track);
    if (isShuffle) {
      // Si el shuffle está activo, agregar el índice al final de los índices mezclados
      shuffledIndices.push(currentQueue.length - 1);
    }
    updateControlsState();
    showToast('Agregado a la cola');
  }
}

function openQueueModal() {
  const modal = document.getElementById('queue-modal');
  const container = document.getElementById('queue-modal-list');
  container.innerHTML = '';

  if (currentQueue.length === 0 || currentIndex < 0) {
    container.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:24px 0;">La cola está vacía</p>';
    modal.classList.add('active');
    return;
  }

  // Mostrar activa
  const active = currentQueue[currentIndex];
  const activeThumb = active.snippet?.thumbnails?.medium?.url || active.snippet?.thumbnails?.default?.url || '';
  const nowPlayingDiv = document.createElement('div');
  nowPlayingDiv.innerHTML = `
    <h4 style="font-size:12px;color:var(--accent);text-transform:uppercase;margin:8px 0;font-weight:700;">Sonando Ahora</h4>
    <div class="track playing" style="background:rgba(255,255,255,0.03);">
      <div class="track-num">♪</div>
      <img src="${activeThumb}" alt="">
      <div class="track-info">
        <div class="title" style="color:var(--accent);">${escapeHtml(active.snippet.title)}</div>
        <div class="artist">${escapeHtml(active.snippet.channelTitle)}</div>
      </div>
      <div></div>
    </div>
    <h4 style="font-size:12px;color:var(--text-secondary);text-transform:uppercase;margin:16px 0 8px 0;font-weight:700;">A continuación</h4>
  `;
  container.appendChild(nowPlayingDiv);

  // Mostrar siguientes pistas
  const remaining = [];
  if (isShuffle) {
    // Si es shuffle, renderizar según los índices mezclados
    for (let i = shuffledPosition + 1; i < shuffledIndices.length; i++) {
      const actualIdx = shuffledIndices[i];
      if (currentQueue[actualIdx]) {
        remaining.push({ queueIndex: actualIdx, track: currentQueue[actualIdx] });
      }
    }
  } else {
    for (let i = currentIndex + 1; i < currentQueue.length; i++) {
      remaining.push({ queueIndex: i, track: currentQueue[i] });
    }
  }

  if (remaining.length === 0) {
    const noMore = document.createElement('p');
    noMore.style.cssText = 'color:var(--text-muted);text-align:center;font-size:13px;padding:8px;';
    noMore.textContent = 'No hay más canciones en la cola.';
    container.appendChild(noMore);
  } else {
    remaining.forEach((item, index) => {
      const track = item.track;
      const thumb = track.snippet?.thumbnails?.medium?.url || track.snippet?.thumbnails?.default?.url || '';
      const div = document.createElement('div');
      div.className = 'track';
      div.innerHTML = `
        <div class="track-num">${index + 1}</div>
        <img src="${thumb}" alt="">
        <div class="track-info">
          <div class="title">${escapeHtml(track.snippet.title)}</div>
          <div class="artist">${escapeHtml(track.snippet.channelTitle)}</div>
        </div>
        <div class="track-menu" onclick="event.stopPropagation(); removeFromQueue(${item.queueIndex})">
          <ion-icon name="close-outline" style="font-size:24px;color:#ff453a;"></ion-icon>
        </div>
      `;
      div.onclick = () => {
        closeQueueModal();
        if (isShuffle) {
          shuffledPosition = shuffledIndices.indexOf(item.queueIndex);
        }
        playTrackIndex(item.queueIndex);
      };
      container.appendChild(div);
    });
  }

  modal.classList.add('active');
}
window.openQueueModal = openQueueModal;

function closeQueueModal() {
  document.getElementById('queue-modal').classList.remove('active');
}
window.closeQueueModal = closeQueueModal;

function removeFromQueue(indexToRemove) {
  if (indexToRemove === currentIndex) return; // No se puede eliminar la activa

  // Eliminar de la lista de reproducción
  currentQueue.splice(indexToRemove, 1);

  // Corregir índice actual si eliminamos antes de él
  if (indexToRemove < currentIndex) {
    currentIndex--;
  }

  // Actualizar listas de shuffle
  if (isShuffle) {
    const pos = shuffledIndices.indexOf(indexToRemove);
    if (pos !== -1) {
      shuffledIndices.splice(pos, 1);
      if (pos < shuffledPosition) {
        shuffledPosition--;
      }
    }
    // Reajustar índices mayores al eliminado
    shuffledIndices = shuffledIndices.map(idx => idx > indexToRemove ? idx - 1 : idx);
  }

  updateControlsState();
  openQueueModal(); // Refrescar lista
  showToast('Canción quitada de la cola');
}
window.removeFromQueue = removeFromQueue;

function clearPlayQueue() {
  if (confirm('¿Seguro que quieres borrar la cola de reproducción?')) {
    if (currentIndex >= 0 && currentIndex < currentQueue.length) {
      currentQueue = [currentQueue[currentIndex]];
      currentIndex = 0;
      if (isShuffle) {
        shuffledIndices = [0];
        shuffledPosition = 0;
      }
    } else {
      currentQueue = [];
      currentIndex = -1;
    }
    updateControlsState();
    closeQueueModal();
    showToast('Cola limpiada');
  }
}
window.clearPlayQueue = clearPlayQueue;

// ============================================================
// REPRODUCCIÓN (PLAY, SIGUIENTE, ANTERIOR)
// ============================================================
function playTrack(queue, index) {
  if (!playerReady || !player) {
    showError('El reproductor no está listo aún. Espera...');
    return;
  }
  
  if (!Array.isArray(queue)) queue = [queue];
  currentQueue = queue;
  currentIndex = index;
  
  if (isShuffle) {
    initShuffle();
  }

  playTrackIndex(currentIndex);
}
window.playTrack = playTrack;

function initShuffle() {
  shuffledIndices = Array.from({length: currentQueue.length}, (_, i) => i);
  // Algoritmo de Fisher-Yates
  for (let i = shuffledIndices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledIndices[i], shuffledIndices[j]] = [shuffledIndices[j], shuffledIndices[i]];
  }
  // Mover la canción activa a la primera posición
  if (currentIndex >= 0) {
    const activePos = shuffledIndices.indexOf(currentIndex);
    if (activePos !== -1) {
      shuffledIndices.splice(activePos, 1);
      shuffledIndices.unshift(currentIndex);
    }
  }
  shuffledPosition = 0;
}

function playTrackIndex(index) {
  currentIndex = index;
  const item = currentQueue[index];
  if (!item) return;

  const videoId = item.id.videoId;
  currentTrack = item;

  try {
    player.loadVideoById(videoId);
    const thumb = item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '';

    // Actualizar Player Bar inferior
    const thumbEl = document.getElementById('np-thumb');
    thumbEl.src = thumb;
    thumbEl.style.display = thumb ? 'block' : 'none';
    document.getElementById('np-title').textContent = item.snippet.title;
    document.getElementById('np-artist').textContent = item.snippet.channelTitle;

    // Actualizar Fullscreen Player
    document.getElementById('fs-artwork').src = thumb;
    document.getElementById('fs-title').textContent = item.snippet.title;
    document.getElementById('fs-artist').textContent = item.snippet.channelTitle;

    addToHistory(item);
    updateControlsState();
    updateLikeButton();
    updateOfflineButton();
    hideError();
    
    // Actualizar Media Session con la nueva canción
    updateMediaSession();
    // Reproducir audio silencioso para mantener vivo el proceso
    playSilentAudio();
  } catch (e) {
    console.error('Error al reproducir canción:', e);
    showError('Error al iniciar la canción.');
  }
}

function nextTrack() {
  if (isShuffle) {
    if (shuffledPosition < shuffledIndices.length - 1) {
      shuffledPosition++;
      playTrackIndex(shuffledIndices[shuffledPosition]);
    } else {
      if (isRepeat === 'all') {
        initShuffle();
        playTrackIndex(shuffledIndices[0]);
      } else {
        stopPlaybackState();
      }
    }
  } else {
    if (currentIndex < currentQueue.length - 1) {
      playTrackIndex(currentIndex + 1);
    } else {
      if (isRepeat === 'all') {
        playTrackIndex(0);
      } else {
        stopPlaybackState();
      }
    }
  }
}
window.nextTrack = nextTrack;

function prevTrack() {
  if (isShuffle) {
    if (shuffledPosition > 0) {
      shuffledPosition--;
      playTrackIndex(shuffledIndices[shuffledPosition]);
    } else {
      player.seekTo(0);
    }
  } else {
    if (currentIndex > 0) {
      playTrackIndex(currentIndex - 1);
    } else {
      player.seekTo(0);
    }
  }
}
window.prevTrack = prevTrack;

function togglePlay() {
  if (!playerReady || !player) return;
  if (isPlaying) {
    player.pauseVideo();
  } else if (currentIndex >= 0) {
    player.playVideo();
  }
}
window.togglePlay = togglePlay;

function stopPlaybackState() {
  isPlaying = false;
  updatePlayButtons();
  stopProgressUpdate();
  document.getElementById('progress-fill').style.width = '0%';
  document.getElementById('fs-progress-fill').style.width = '0%';
  
  pauseSilentAudio();
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'none';
  }
}

function updateControlsState() {
  const hasQueue = currentQueue.length > 0;
  
  let hasPrev = false;
  let hasNext = false;

  if (isShuffle) {
    hasPrev = shuffledPosition > 0;
    hasNext = shuffledPosition < shuffledIndices.length - 1;
  } else {
    hasPrev = currentIndex > 0;
    hasNext = currentIndex < currentQueue.length - 1;
  }

  // Si repeat 'all' está habilitado, siempre podemos avanzar/retroceder en la cola si tiene > 1 canción
  if (isRepeat === 'all' && currentQueue.length > 1) {
    hasPrev = true;
    hasNext = true;
  }

  document.getElementById('play-btn').disabled = !hasQueue;
  document.getElementById('prev-btn').disabled = !hasPrev;
  document.getElementById('next-btn').disabled = !hasNext;
}

function shuffleToggle() {
  isShuffle = !isShuffle;
  const btn = document.getElementById('shuffle-btn');
  btn.classList.toggle('active', isShuffle);
  btn.style.color = isShuffle ? 'var(--accent)' : '';
  
  if (isShuffle && currentQueue.length > 0) {
    initShuffle();
  }
  
  updateControlsState();
  showToast(isShuffle ? 'Shuffle activado' : 'Shuffle desactivado');
}
window.shuffleToggle = shuffleToggle;

function repeatToggle() {
  const btn = document.getElementById('repeat-btn');
  const icon = btn.querySelector('ion-icon');
  
  if (isRepeat === 'none') {
    isRepeat = 'all';
    btn.style.color = 'var(--accent)';
    icon.setAttribute('name', 'repeat');
    showToast('Repetir todo');
  } else if (isRepeat === 'all') {
    isRepeat = 'one';
    btn.style.color = 'var(--accent)';
    icon.setAttribute('name', 'repeat');
    // Para repetir uno, añadimos un indicador visual en el icono o un toast
    showToast('Repetir canción actual');
  } else {
    isRepeat = 'none';
    btn.style.color = '';
    icon.setAttribute('name', 'repeat');
    showToast('Repetición desactivada');
  }
  
  updateControlsState();
}
window.repeatToggle = repeatToggle;

// ============================================================
// AJUSTES (SETTINGS MODAL)
// ============================================================
function openSettingsModal() {
  const modal = document.getElementById('settings-modal');
  const settings = window.Storage.getSettings();
  
  document.getElementById('settings-api-key').value = settings.apiKey;
  
  // Resaltar tema actual
  document.querySelectorAll('.theme-dot').forEach(dot => {
    dot.classList.toggle('active', dot.dataset.theme === settings.theme);
  });
  
  modal.classList.add('active');
}
window.openSettingsModal = openSettingsModal;

function closeSettingsModal() {
  document.getElementById('settings-modal').classList.remove('active');
}
window.closeSettingsModal = closeSettingsModal;

function selectTheme(themeName) {
  document.querySelectorAll('.theme-dot').forEach(dot => {
    dot.classList.toggle('active', dot.dataset.theme === themeName);
  });
  // Guardar y aplicar de inmediato
  window.Storage.saveSetting('theme', themeName);
  applyTheme();
}
window.selectTheme = selectTheme;

function saveSettings() {
  const apiKey = document.getElementById('settings-api-key').value.trim();
  if (apiKey.length === 0) {
    showToast('La clave de la API no puede estar vacía');
    return;
  }
  
  window.Storage.saveSetting('apiKey', apiKey);
  showToast('Ajustes guardados');
  closeSettingsModal();
  
  // Recargar contenido inicial
  loadInitialContent();
}
window.saveSettings = saveSettings;

function clearCachedSearches() {
  if (confirm('¿Quieres limpiar toda la caché de búsquedas guardadas?')) {
    window.Storage.clearCache();
    showToast('Caché limpiada');
  }
}
window.clearCachedSearches = clearCachedSearches;

// ============================================================
// PANTALLA COMPLETA REPRODUCTOR
// ============================================================
function openFullscreenPlayer() {
  if (currentIndex < 0) return;
  document.getElementById('fullscreen-player').classList.add('active');
}
window.openFullscreenPlayer = openFullscreenPlayer;

function closeFullscreenPlayer() {
  document.getElementById('fullscreen-player').classList.remove('active');
}
window.closeFullscreenPlayer = closeFullscreenPlayer;

// ============================================================
// CARGA INICIAL DE DATOS
// ============================================================
async function loadInitialContent() {
  try {
    const items = await searchYouTube('trending music 2026');
    renderQuickAccess(items);
    renderCards(items, 'made-for-you');
  } catch (e) {
    console.warn('No se pudo cargar contenido inicial (API Key o Red offline):', e.message);
  }
}

function renderQuickAccess(items) {
  const grid = document.getElementById('quick-grid');
  if (!items || items.length < 6) return;
  
  grid.innerHTML = items.slice(0, 6).map((item, i) => {
    const thumb = item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '';
    return `
      <div class="quick-item" onclick="playTrackFromQuick(${i})">
        <img src="${thumb}" alt="">
        <span class="quick-title">${escapeHtml(item.snippet.title)}</span>
      </div>`;
  }).join('');
  
  window._quickItems = items.slice(0, 6);
}

function playTrackFromQuick(index) {
  if (window._quickItems && window._quickItems[index]) {
    playTrack(window._quickItems, index);
  }
}
window.playTrackFromQuick = playTrackFromQuick;

function renderCards(items, containerId) {
  const container = document.getElementById(containerId);
  if (!items || items.length === 0) return;
  
  container.innerHTML = items.slice(0, 10).map((item, i) => {
    const thumb = item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '';
    return `
      <div class="card" onclick="playTrackFromCards(${i})">
        <img class="card-img" src="${thumb}" alt="" loading="lazy">
        <div class="card-title">${escapeHtml(item.snippet.title)}</div>
        <div class="card-subtitle">${escapeHtml(item.snippet.channelTitle)}</div>
      </div>`;
  }).join('');
  
  window._cardItems = items.slice(0, 10);
}

function playTrackFromCards(index) {
  if (window._cardItems && window._cardItems[index]) {
    playTrack(window._cardItems, index);
  }
}
window.playTrackFromCards = playTrackFromCards;

// ============================================================
// MANEJO DE ERRORES
// ============================================================
function showError(msg) {
  const el = document.getElementById('error-msg');
  const searchEl = document.getElementById('search-error-msg');
  
  if (el) {
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(hideError, 5000);
  }
  if (searchEl) {
    searchEl.textContent = msg;
    searchEl.classList.add('show');
    setTimeout(hideError, 5000);
  }
}

function hideError() {
  const el = document.getElementById('error-msg');
  const searchEl = document.getElementById('search-error-msg');
  if (el) el.classList.remove('show');
  if (searchEl) searchEl.classList.remove('show');
}

// ============================================================
// REGISTRO DE EVENTOS (LISTENERS)
// ============================================================
function setupEventListeners() {
  // Manejo de la búsqueda global interactiva
  document.getElementById('search').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const q = e.target.value.trim();

    // Si borra la búsqueda y está en la página de buscar
    if (q.length === 0) {
      document.getElementById('search-results').innerHTML = '';
      const genreGrid = document.getElementById('genre-grid');
      const subTitle = document.querySelector('#page-search .section-subtitle');
      if (genreGrid) genreGrid.style.display = 'grid';
      if (subTitle) subTitle.style.display = 'block';
      return;
    }
    
    if (q.length < 2) return;

    // Cambiar dinámicamente a la página de búsqueda
    if (currentPage !== 'search') {
      navigateTo('search');
    }

    // Ocultar rejilla de géneros populares en página de buscar
    const genreGrid = document.getElementById('genre-grid');
    const subTitle = document.querySelector('#page-search .section-subtitle');
    if (genreGrid) genreGrid.style.display = 'none';
    if (subTitle) subTitle.style.display = 'none';

    document.getElementById('search-results').innerHTML = `
      <div class="loading">
        <div class="loading-spinner"></div>
        <p>Buscando...</p>
      </div>`;

    searchTimeout = setTimeout(async () => {
      try {
        const items = await searchYouTube(q);
        renderResults(items, 'search-results');
      } catch (error) {
        document.getElementById('search-results').innerHTML = `
          <div class="empty-state">
            <ion-icon name="warning-outline"></ion-icon>
            <p>${error.message}</p>
          </div>`;
        showError(error.message);
      }
    }, 500);
  });

  // Botón de engranaje para Ajustes
  document.getElementById('settings-btn').onclick = openSettingsModal;

  // Clicks en selectores de tema
  document.querySelectorAll('.theme-dot').forEach(dot => {
    dot.onclick = () => selectTheme(dot.dataset.theme);
  });

  // Eventos de barra de volumen y controles
  document.getElementById('play-btn').onclick = togglePlay;
  document.getElementById('next-btn').onclick = nextTrack;
  document.getElementById('prev-btn').onclick = prevTrack;

  // Saltos de reproducción haciendo click en la barra de progreso
  document.getElementById('progress-container').addEventListener('click', (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    seekToPercentage(pct);
  });

  document.getElementById('fs-progress-bar').addEventListener('click', (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    seekToPercentage(pct);
  });

  // Barra de volumen
  document.getElementById('volume').addEventListener('input', (e) => {
    const vol = parseInt(e.target.value);
    window.Storage.saveSetting('volume', vol);
    if (player && player.setVolume) {
      player.setVolume(vol);
    }
    const icon = document.getElementById('vol-icon');
    if (vol === 0) icon.setAttribute('name', 'volume-mute');
    else if (vol < 50) icon.setAttribute('name', 'volume-low');
    else icon.setAttribute('name', 'volume-high');
  });

  // Control multimedia del teclado (Espacio para Play/Pausa)
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
      e.preventDefault();
      togglePlay();
    }
  });

  // Gesto de deslizar hacia abajo en el reproductor a pantalla completa
  let touchStartY = 0;
  document.getElementById('fullscreen-player').addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
  });
  document.getElementById('fullscreen-player').addEventListener('touchend', (e) => {
    const touchEndY = e.changedTouches[0].clientY;
    if (touchEndY - touchStartY > 100) {
      closeFullscreenPlayer();
    }
  });
}

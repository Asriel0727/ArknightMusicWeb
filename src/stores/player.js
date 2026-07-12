import { reactive } from 'vue';
import { i18n } from '../i18n/index.js';
import {
  fetchAlbumDetails,
  fetchFullSongDetails,
  fetchLyrics,
  fetchSongDetails,
  getProxyAudioUrl,
} from '../services/api.js';

function unknownArtistLabel() {
  return i18n.global.t('common.unknownArtist');
}

function getCurrentLocale() {
  const locale = i18n.global.locale;
  return typeof locale === 'string' ? locale : locale.value;
}

let lyricLoadToken = 0;
let lyricTranslationToken = 0;
let lyricsTranslationPluginPromise = null;
const masterSongDetailsPromises = new Map();
const PLAY_MODES = ['repeat-all', 'repeat-one', 'shuffle'];
const PLAYER_VOLUME_STORAGE_KEY = 'arknight-music-player-volume';

function readStoredVolume() {
  try {
    const stored = Number.parseFloat(localStorage.getItem(PLAYER_VOLUME_STORAGE_KEY));
    return Number.isFinite(stored) ? Math.min(1, Math.max(0, stored)) : 1;
  } catch {
    return 1;
  }
}

function persistVolume(volume) {
  try {
    localStorage.setItem(PLAYER_VOLUME_STORAGE_KEY, String(volume));
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

async function fetchMasterSongDetails(songId) {
  if (!masterSongDetailsPromises.has(songId)) {
    const promise = fetchFullSongDetails(songId)
      .then((fullSong) => ({
        ...fullSong.song,
        album: fullSong.album,
        preloadedLyrics: fullSong.lyrics,
        assets: fullSong.assets,
      }))
      .catch(() => fetchSongDetails(songId))
      .finally(() => {
        masterSongDetailsPromises.delete(songId);
      });
    masterSongDetailsPromises.set(songId, promise);
  }

  return masterSongDetailsPromises.get(songId);
}

async function loadLyricsTranslationPlugin() {
  if (!lyricsTranslationPluginPromise) {
    lyricsTranslationPluginPromise = import('../services/lyricsTranslationPlugin.js');
  }
  return lyricsTranslationPluginPromise;
}

function prefetchCurrentLyricTranslations(expectedLyricLoadToken) {
  const songId = playerState.currentSong?.cid || '';
  if (!songId || playerState.lyrics.length === 0) return;

  loadLyricsTranslationPlugin()
    .then(({ prefetchLyricLines }) => {
      if (expectedLyricLoadToken !== lyricLoadToken) return null;
      return prefetchLyricLines(playerState.lyrics, getCurrentLocale(), songId);
    })
    .catch((error) => {
      console.warn('Lyric translation prefetch plugin failed:', error.message);
    });
}

function normalizePlaybackTime(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function resetPlaybackProgress() {
  playerState.currentTime = 0;
  playerState.duration = 0;

  if (!playerState.audioPlayer) {
    return;
  }

  playerState.audioPlayer.pause();
  playerState.audioPlayer.currentTime = 0;
}

function getRandomSongIndex() {
  const playlistLength = playerState.currentPlaylist.length;
  if (playlistLength <= 1) {
    return 0;
  }

  let randomIndex = playerState.currentSongIndex;
  while (randomIndex === playerState.currentSongIndex) {
    randomIndex = Math.floor(Math.random() * playlistLength);
  }

  return randomIndex;
}

function getNextSongIndex() {
  if (playerState.playMode === 'repeat-one') {
    return playerState.currentSongIndex;
  }

  if (playerState.playMode === 'shuffle') {
    return getRandomSongIndex();
  }

  return (playerState.currentSongIndex + 1) % playerState.currentPlaylist.length;
}

// 播放器狀態
export const playerState = reactive({
  audioPlayer: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: readStoredVolume(),
  isMuted: false,
  currentSong: null,
  currentSongIndex: 0,
  currentPlaylist: [],
  sourceContext: null,
  lyrics: [],
  showLyricTranslation: false,
  isTranslatingLyrics: false,
  playMode: 'repeat-all',
});

// 專輯和歌曲狀態
export const albumState = reactive({
  allAlbums: [],
  currentAlbumDetails: null,
  currentAlbumSongs: [],
  isLoading: false,
  hasMore: true,
  currentPage: 1,
  isInitialFetchDone: false
});

// 搜索狀態
export const searchState = reactive({
  query: '',
  filteredAlbums: []
});

// 角色狀態
export const characterState = reactive({
  currentCharacterDetails: null,
});

// Modal狀態
export const modalState = reactive({
  isOpen: false,
  currentView: 'album', // 'album', 'player', 'character' 或 'character-share'
  characterPortraitId: '',
});

// 下拉列表狀態
export const dropdownState = reactive({
  isOpen: false,
  allSongs: [],
  isLoaded: false,
  isLoading: false,
  loadError: ''
});

// 初始化音頻播放器
export function initAudioPlayer(audioElement) {
  playerState.audioPlayer = audioElement;
  
  if (audioElement) {
    audioElement.volume = playerState.volume;
    audioElement.addEventListener('timeupdate', () => {
      playerState.currentTime = normalizePlaybackTime(audioElement.currentTime);
      syncLyrics(audioElement.currentTime);
    });
    
    audioElement.addEventListener('loadedmetadata', () => {
      playerState.currentTime = normalizePlaybackTime(audioElement.currentTime);
      playerState.duration = normalizePlaybackTime(audioElement.duration);
    });
    
    audioElement.addEventListener('durationchange', () => {
      playerState.duration = normalizePlaybackTime(audioElement.duration);
    });
    
    audioElement.addEventListener('volumechange', () => {
      playerState.volume = audioElement.volume;
      playerState.isMuted = audioElement.muted;
      persistVolume(audioElement.volume);
    });
    
    audioElement.addEventListener('play', () => {
      playerState.isPlaying = true;
    });
    
    audioElement.addEventListener('pause', () => {
      playerState.isPlaying = false;
    });
    
    audioElement.addEventListener('ended', () => {
      playNextSong();
    });
  }
}

// 播放歌曲（音訊優先：不等待歌詞；已有 sourceUrl 時不重複請求詳情）
export async function playSong(song, coverUrl, coverDeUrl) {
  try {
    resetPlaybackProgress();
    playerState.showLyricTranslation = false;
    playerState.isTranslatingLyrics = false;
    lyricTranslationToken += 1;

    let songDetails = song;
    if (!song.sourceUrl) {
      songDetails = await fetchSongDetails(song.cid);
    }

    const fullSong = {
      ...songDetails,
      artistes: song.artistes || songDetails.artistes || [unknownArtistLabel()],
      coverUrl: coverUrl || song.coverUrl || songDetails.coverUrl,
      coverDeUrl: coverDeUrl || song.coverDeUrl || songDetails.coverDeUrl,
      audioUrl: getProxyAudioUrl(songDetails.sourceUrl || ''),
      albumCid: song.albumCid || songDetails.albumCid
    };

    const idx = playerState.currentSongIndex;
    const pl = playerState.currentPlaylist;
    if (pl[idx] && pl[idx].cid === fullSong.cid) {
      Object.assign(pl[idx], songDetails);
    }

    playerState.currentSong = fullSong;
    playerState.lyrics = [];
    playerState.isTranslatingLyrics = false;
    const currentLyricLoadToken = ++lyricLoadToken;

    if (Array.isArray(songDetails.preloadedLyrics) && songDetails.preloadedLyrics.length > 0) {
      playerState.lyrics = songDetails.preloadedLyrics.map((line) => ({
        ...line,
        translation: '',
      }));
      prefetchCurrentLyricTranslations(currentLyricLoadToken);
    } else if (fullSong.lyricUrl) {
      fetchLyrics(fullSong.lyricUrl)
        .then(async (lyrics) => {
          if (currentLyricLoadToken !== lyricLoadToken) {
            return;
          }

          playerState.lyrics = lyrics.map((line) => ({
            ...line,
            translation: '',
          }));
          prefetchCurrentLyricTranslations(currentLyricLoadToken);

          if (playerState.showLyricTranslation) {
            await refreshLyricTranslations(currentLyricLoadToken);
          }
        })
        .catch(() => {
          if (currentLyricLoadToken !== lyricLoadToken) {
            return;
          }

          playerState.lyrics = [];
        })
        .finally(() => {
          if (currentLyricLoadToken === lyricLoadToken) {
            playerState.isTranslatingLyrics = false;
          }
        });
    }

    if (playerState.audioPlayer && fullSong.audioUrl) {
      playerState.audioPlayer.src = fullSong.audioUrl;
      playerState.audioPlayer.load();
      await playerState.audioPlayer.play();
    }

    // 預熱下一首詳情（不打斷播放，方便連續切歌）
    const nextIdx = playerState.currentSongIndex + 1;
    if (nextIdx < playerState.currentPlaylist.length) {
      const nextSong = playerState.currentPlaylist[nextIdx];
      if (nextSong?.cid && !nextSong.sourceUrl) {
        fetchSongDetails(nextSong.cid).catch(() => {});
      }
    }
  } catch (error) {
    console.error('播放歌曲時出錯:', error);
    throw error;
  }
}

export async function refreshLyricTranslations(expectedLyricLoadToken = lyricLoadToken) {
  if (!playerState.showLyricTranslation) {
    return;
  }

  if (!playerState.lyrics || playerState.lyrics.length === 0) {
    return;
  }

  const translationToken = ++lyricTranslationToken;
  playerState.lyrics = playerState.lyrics.map((line) => ({
    ...line,
    translation: '',
  }));
  playerState.isTranslatingLyrics = true;

  try {
    const { translateLyricLines } = await loadLyricsTranslationPlugin();
    const translatedLyrics = await translateLyricLines(
      playerState.lyrics,
      getCurrentLocale(),
      playerState.currentSong?.cid || ''
    );

    if (
      expectedLyricLoadToken !== lyricLoadToken ||
      translationToken !== lyricTranslationToken
    ) {
      return;
    }

    playerState.lyrics = translatedLyrics;
  } finally {
    if (translationToken === lyricTranslationToken) {
      playerState.isTranslatingLyrics = false;
    }
  }
}

// 從專輯播放歌曲
export async function playSongFromAlbum(index, albumId) {
  try {
    if (!albumState.currentAlbumDetails || albumState.currentAlbumDetails.cid !== albumId) {
      albumState.currentAlbumDetails = await fetchAlbumDetails(albumId);
    }
    
    const album = albumState.currentAlbumDetails;
    albumState.currentAlbumSongs = album.songs.map((song) => ({
      ...song,
      artistes: song.artistes || album.artistes || [unknownArtistLabel()],
      coverUrl: album.coverUrl,
      coverDeUrl: album.coverDeUrl,
      albumCid: album.cid, // 保存專輯ID以便導航時使用
    }));
    
    playerState.currentPlaylist = albumState.currentAlbumSongs;
    playerState.currentSongIndex = index;
    playerState.sourceContext = { type: 'album', albumCid: album.cid };
    
    const song = albumState.currentAlbumSongs[index];
    await playSong(song, album.coverUrl, album.coverDeUrl);
  } catch (error) {
    console.error('播放專輯歌曲時出錯:', error);
  }
}

// 從主列表播放歌曲
export async function playSongFromMasterList(song) {
  try {
    const songDetails = await fetchMasterSongDetails(song.cid);
    const albumDetailsFromFull = songDetails.album || null;
    const albumCid = songDetails.albumCid || albumDetailsFromFull?.cid;
    if (!albumCid) {
      console.error('歌曲沒有專輯ID');
      return;
    }

    const songToPlay = {
      ...songDetails,
      artistes: songDetails.artistes || song.artistes || [unknownArtistLabel()],
      coverUrl: song.coverUrl || albumDetailsFromFull?.coverUrl || songDetails.coverUrl,
      coverDeUrl: song.coverDeUrl || albumDetailsFromFull?.coverDeUrl || songDetails.coverDeUrl,
      album: albumDetailsFromFull || songDetails.album || song.album || null,
      albumCid
    };

    playerState.currentPlaylist = [songToPlay];
    playerState.currentSongIndex = 0;
    playerState.sourceContext = { type: 'song', albumCid };
    await playSong(songToPlay, songToPlay.coverUrl, songToPlay.coverDeUrl);

    const albumDetailsPromise = albumDetailsFromFull
      ? Promise.resolve(albumDetailsFromFull)
      : fetchAlbumDetails(albumCid);

    albumDetailsPromise
      .then((albumDetails) => {
        const currentSong = playerState.currentSong;
        if (!currentSong || currentSong.cid !== song.cid) {
          return;
        }

        const coverPatch = {
          artistes: currentSong.artistes || albumDetails.artistes || song.artistes || [unknownArtistLabel()],
          coverUrl: albumDetails.coverUrl,
          coverDeUrl: albumDetails.coverDeUrl,
          albumCid
        };

        Object.assign(currentSong, coverPatch);
        if (playerState.currentPlaylist[0]?.cid === song.cid) {
          Object.assign(playerState.currentPlaylist[0], coverPatch);
        }
      })
      .catch((error) => {
        console.warn(`?剜撠摩 ${albumCid} 閰單?憭望?:`, error);
      });
  } catch (error) {
    console.error(`播放歌曲 ${song.cid} 時出錯:`, error);
  }
}

export async function playSongQueueFromMasterList(songs, startIndex = 0, sourceContext = null) {
  const queue = Array.isArray(songs)
    ? songs.filter((song) => song?.cid)
    : [];

  if (queue.length === 0) {
    return;
  }

  const safeStartIndex = Math.min(Math.max(startIndex, 0), queue.length - 1);
  const selectedSong = queue[safeStartIndex];

  try {
    const songDetails = await fetchMasterSongDetails(selectedSong.cid);
    const albumDetailsFromFull = songDetails.album || selectedSong.album || null;
    const albumCid = songDetails.albumCid || selectedSong.albumCid || albumDetailsFromFull?.cid;

    const songToPlay = {
      ...selectedSong,
      ...songDetails,
      artistes: songDetails.artistes || selectedSong.artistes || albumDetailsFromFull?.artistes || [unknownArtistLabel()],
      coverUrl: selectedSong.coverUrl || songDetails.coverUrl || albumDetailsFromFull?.coverUrl,
      coverDeUrl: selectedSong.coverDeUrl || songDetails.coverDeUrl || albumDetailsFromFull?.coverDeUrl,
      album: albumDetailsFromFull || songDetails.album || null,
      albumCid,
    };

    queue[safeStartIndex] = songToPlay;
    playerState.currentPlaylist = queue;
    playerState.currentSongIndex = safeStartIndex;
    playerState.sourceContext = sourceContext || { type: 'queue' };
    await playSong(songToPlay, songToPlay.coverUrl, songToPlay.coverDeUrl);
  } catch (error) {
    console.error(`播放歌曲佇列 ${selectedSong.cid} 時出錯:`, error);
  }
}

// 播放控制
export function prefetchSongFromMasterList(song) {
  if (!song?.cid) return;
  fetchMasterSongDetails(song.cid).catch(() => {});
}

export function togglePlay() {
  if (!playerState.audioPlayer) return;
  if (playerState.audioPlayer.paused) {
    playerState.audioPlayer.play();
  } else {
    playerState.audioPlayer.pause();
  }
}

export function playPreviousSong() {
  if (playerState.currentPlaylist.length === 0) return;
  let newIndex = playerState.currentSongIndex - 1;
  if (newIndex < 0) {
    newIndex = playerState.currentPlaylist.length - 1;
  }
  playerState.currentSongIndex = newIndex;
  const song = playerState.currentPlaylist[newIndex];
  playSong(song, song.coverUrl, song.coverDeUrl);
}

export function playNextSong() {
  if (playerState.currentPlaylist.length === 0) return;
  const newIndex = getNextSongIndex();
  playerState.currentSongIndex = newIndex;
  const song = playerState.currentPlaylist[newIndex];
  playSong(song, song.coverUrl, song.coverDeUrl);
}

export function togglePlayMode() {
  const currentIndex = PLAY_MODES.indexOf(playerState.playMode);
  const nextIndex = (currentIndex + 1) % PLAY_MODES.length;
  playerState.playMode = PLAY_MODES[nextIndex];
}

export function seek(position) {
  if (!playerState.audioPlayer || isNaN(playerState.audioPlayer.duration)) return;
  playerState.audioPlayer.currentTime = position * playerState.audioPlayer.duration;
  syncLyrics(playerState.audioPlayer.currentTime);
}

export function clampVolume(volume) {
  const parsedVolume = Number.parseFloat(volume);

  if (Number.isNaN(parsedVolume)) {
    return playerState.volume;
  }

  return Math.min(1, Math.max(0, parsedVolume));
}

export function setVolume(volume) {
  if (!playerState.audioPlayer) return;

  const nextVolume = clampVolume(volume);
  playerState.audioPlayer.muted = nextVolume === 0;
  playerState.audioPlayer.volume = nextVolume;
  playerState.volume = nextVolume;
  playerState.isMuted = nextVolume === 0;
  persistVolume(nextVolume);
}

export function toggleMute() {
  if (!playerState.audioPlayer) return;
  playerState.audioPlayer.muted = !playerState.audioPlayer.muted;
}

// 同步歌詞
export function syncLyrics(currentTime) {
  if (!playerState.lyrics || playerState.lyrics.length === 0) return;
  
  // 這個函數需要在組件中實現，因為需要操作DOM
  // 這裡只更新狀態
}



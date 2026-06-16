import { reactive } from 'vue';
import { i18n } from '../i18n/index.js';

function unknownArtistLabel() {
  return i18n.global.t('common.unknownArtist');
}

function getCurrentLocale() {
  const locale = i18n.global.locale;
  return typeof locale === 'string' ? locale : locale.value;
}

let lyricLoadToken = 0;
let lyricTranslationToken = 0;
let apiModulePromise = null;
let lyricsTranslationPluginPromise = null;
const masterSongDetailsPromises = new Map();

async function loadApiModule() {
  if (!apiModulePromise) {
    apiModulePromise = import('../services/api.js');
  }
  return apiModulePromise;
}

async function fetchMasterSongDetails(songId) {
  if (!masterSongDetailsPromises.has(songId)) {
    const promise = loadApiModule()
      .then(({ fetchSongDetails }) => fetchSongDetails(songId))
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

// 播放器狀態
export const playerState = reactive({
  audioPlayer: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  isMuted: false,
  currentSong: null,
  currentSongIndex: 0,
  currentPlaylist: [],
  lyrics: [],
  showLyricTranslation: false,
  isTranslatingLyrics: false,
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
  currentView: 'album', // 'album', 'player', 或 'character'
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
    audioElement.addEventListener('timeupdate', () => {
      playerState.currentTime = audioElement.currentTime;
      syncLyrics(audioElement.currentTime);
    });
    
    audioElement.addEventListener('durationchange', () => {
      playerState.duration = audioElement.duration;
    });
    
    audioElement.addEventListener('volumechange', () => {
      playerState.volume = audioElement.volume;
      playerState.isMuted = audioElement.muted;
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
    const { fetchSongDetails, fetchLyrics, getProxyAudioUrl } = await loadApiModule();
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

    if (fullSong.lyricUrl) {
      fetchLyrics(fullSong.lyricUrl)
        .then(async (lyrics) => {
          if (currentLyricLoadToken !== lyricLoadToken) {
            return;
          }

          playerState.lyrics = lyrics.map((line) => ({
            ...line,
            translation: '',
          }));

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
    const translatedLyrics = await translateLyricLines(playerState.lyrics, getCurrentLocale());

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
    const { fetchAlbumDetails } = await loadApiModule();
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
    
    const song = albumState.currentAlbumSongs[index];
    await playSong(song, album.coverUrl, album.coverDeUrl);
  } catch (error) {
    console.error('播放專輯歌曲時出錯:', error);
  }
}

// 從主列表播放歌曲
export async function playSongFromMasterList(song) {
  try {
    const { fetchAlbumDetails } = await loadApiModule();
    const songDetails = await fetchMasterSongDetails(song.cid);
    const albumCid = songDetails.albumCid;
    if (!albumCid) {
      console.error('歌曲沒有專輯ID');
      return;
    }

    const songToPlay = {
      ...songDetails,
      artistes: songDetails.artistes || song.artistes || [unknownArtistLabel()],
      coverUrl: song.coverUrl,
      coverDeUrl: song.coverDeUrl,
      albumCid
    };

    playerState.currentPlaylist = [songToPlay];
    playerState.currentSongIndex = 0;
    await playSong(songToPlay, song.coverUrl, song.coverDeUrl);

    fetchAlbumDetails(albumCid)
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
  const newIndex = (playerState.currentSongIndex + 1) % playerState.currentPlaylist.length;
  playerState.currentSongIndex = newIndex;
  const song = playerState.currentPlaylist[newIndex];
  playSong(song, song.coverUrl, song.coverDeUrl);
}

export function seek(position) {
  if (!playerState.audioPlayer || isNaN(playerState.audioPlayer.duration)) return;
  playerState.audioPlayer.currentTime = position * playerState.audioPlayer.duration;
  syncLyrics(playerState.audioPlayer.currentTime);
}

export function setVolume(volume) {
  if (!playerState.audioPlayer) return;
  playerState.audioPlayer.muted = false;
  playerState.audioPlayer.volume = parseFloat(volume);
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



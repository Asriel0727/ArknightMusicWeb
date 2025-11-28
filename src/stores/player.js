import { ref, reactive, computed } from 'vue';
import { fetchSongDetails, fetchLyrics, fetchAlbumDetails } from '../services/api.js';

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
  isUserScrolled: false,
  scrollTimeout: null
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

// Modal狀態
export const modalState = reactive({
  isOpen: false,
  currentView: 'album', // 'album' 或 'player'
});

// 下拉列表狀態
export const dropdownState = reactive({
  isOpen: false,
  allSongs: [],
  isLoaded: false
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

// 播放歌曲
export async function playSong(song, coverUrl, coverDeUrl) {
  try {
    console.log('開始播放歌曲:', song);
    const songDetails = await fetchSongDetails(song.cid);
    console.log('歌曲詳情:', songDetails);
    
    const fullSong = {
      ...songDetails,
      artistes: song.artistes || songDetails.artistes || ['未知演出者'],
      coverUrl: coverUrl || song.coverUrl || songDetails.coverUrl,
      coverDeUrl: coverDeUrl || song.coverDeUrl || songDetails.coverDeUrl,
      audioUrl: songDetails.sourceUrl || '',
      albumCid: song.albumCid || songDetails.albumCid // 確保保留專輯ID
    };
    
    console.log('完整歌曲信息:', fullSong);
    console.log('封面URL:', fullSong.coverUrl);
    console.log('視覺圖URL:', fullSong.coverDeUrl);
    
    playerState.currentSong = fullSong;
    playerState.lyrics = [];
    
    // 載入歌詞
    if (fullSong.lyricUrl) {
      console.log('開始載入歌詞:', fullSong.lyricUrl);
      // fetchLyrics 現在會返回空數組而不是拋出錯誤
      playerState.lyrics = await fetchLyrics(fullSong.lyricUrl);
      if (playerState.lyrics.length > 0) {
        console.log('歌詞載入成功，共', playerState.lyrics.length, '行');
      } else {
        console.log('歌曲沒有歌詞或歌詞載入失敗');
      }
    } else {
      console.log('歌曲沒有歌詞URL');
      playerState.lyrics = [];
    }
    
    // 設置音頻源並播放
    if (playerState.audioPlayer) {
      playerState.audioPlayer.src = fullSong.audioUrl;
      playerState.audioPlayer.load();
      await playerState.audioPlayer.play();
    }
  } catch (error) {
    console.error('播放歌曲時出錯:', error);
    throw error;
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
      artistes: song.artistes || album.artistes || ['未知演出者'],
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
    console.log('從主列表播放歌曲:', song);
    const songDetails = await fetchSongDetails(song.cid);
    console.log('歌曲詳情:', songDetails);
    
    const albumCid = songDetails.albumCid;
    if (!albumCid) {
      console.error('歌曲沒有專輯ID');
      return;
    }
    
    const albumDetails = await fetchAlbumDetails(albumCid);
    console.log('專輯詳情:', albumDetails);
    console.log('專輯封面URL:', albumDetails.coverUrl);
    console.log('專輯視覺圖URL:', albumDetails.coverDeUrl);
    
    const songToPlay = {
      ...songDetails,
      artistes: songDetails.artistes || albumDetails.artistes || song.artistes || ['未知演出者'],
      coverUrl: albumDetails.coverUrl,
      coverDeUrl: albumDetails.coverDeUrl
    };
    
    playerState.currentPlaylist = [songToPlay];
    playerState.currentSongIndex = 0;
    await playSong(songToPlay, albumDetails.coverUrl, albumDetails.coverDeUrl);
  } catch (error) {
    console.error(`播放歌曲 ${song.cid} 時出錯:`, error);
  }
}

// 播放控制
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
  syncLyrics(playerState.audioPlayer.currentTime, true);
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
export function syncLyrics(currentTime, forceScroll = false) {
  if (!playerState.lyrics || playerState.lyrics.length === 0) return;
  if (playerState.isUserScrolled && !forceScroll) return;
  
  // 這個函數需要在組件中實現，因為需要操作DOM
  // 這裡只更新狀態
}

// 設置用戶滾動狀態
export function setUserScrolled(scrolled) {
  playerState.isUserScrolled = scrolled;
  if (playerState.scrollTimeout) {
    clearTimeout(playerState.scrollTimeout);
  }
  if (scrolled) {
    playerState.scrollTimeout = setTimeout(() => {
      playerState.isUserScrolled = false;
    }, 5000);
  }
}


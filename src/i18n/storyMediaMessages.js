export const storyMediaMessages = {
  'zh-TW': { videoHint: '影片播畢會接續劇情；若未開始，請按影片的播放鍵。', videoFailed: '影片暫時無法載入，可以重試或前往來源頁。', videoMissing: '來源端尚無可用影片，可前往 PRTS 查看或繼續劇情。', blocked: '瀏覽器暫停了自動播放，請啟用聲音。', failed: '部分音訊暫時無法載入。', missing: '這段劇情有尚未取得的音訊素材。', retry: '重新載入', enable: '啟用聲音' },
  'zh-CN': { videoHint: '视频播完会接续剧情；若未开始，请按视频的播放键。', videoFailed: '视频暂时无法加载，可以重试或前往来源页。', videoMissing: '来源端暂无可用视频，可前往 PRTS 查看或继续剧情。', blocked: '浏览器暂停了自动播放，请启用声音。', failed: '部分音频暂时无法加载。', missing: '这段剧情有尚未取得的音频素材。', retry: '重新加载', enable: '启用声音' },
  en: { videoHint: 'The story continues when the video ends. Press Play if it does not start.', videoFailed: 'The video could not load. Retry or visit the source page.', videoMissing: 'No available video was found at the source. Visit PRTS or continue the story.', blocked: 'Your browser paused automatic audio playback.', failed: 'Some audio could not load.', missing: 'Some audio assets are unavailable for this story.', retry: 'Retry', enable: 'Enable audio' },
  ja: { videoHint: '動画終了後に物語が続きます。始まらない場合は再生ボタンを押してください。', videoFailed: '動画を読み込めません。再試行するか、出典ページをご覧ください。', videoMissing: '配信元に利用できる動画がありません。PRTS を確認するか、物語を続けてください。', blocked: 'ブラウザーが音声の自動再生を停止しました。', failed: '一部の音声を読み込めません。', missing: 'この物語には未取得の音声素材があります。', retry: '再読み込み', enable: '音声を有効にする' },
  ko: { videoHint: '영상이 끝나면 이야기가 이어집니다. 시작되지 않으면 재생 버튼을 눌러 주세요.', videoFailed: '영상을 불러올 수 없습니다. 다시 시도하거나 출처 페이지를 확인해 주세요.', videoMissing: '출처에서 이용 가능한 영상을 찾지 못했습니다. PRTS를 확인하거나 이야기를 계속해 주세요.', blocked: '브라우저가 오디오 자동 재생을 중지했습니다.', failed: '일부 오디오를 불러올 수 없습니다.', missing: '이 이야기에는 아직 확보하지 못한 오디오가 있습니다.', retry: '다시 불러오기', enable: '소리 켜기' },
};
const controls = {
  'zh-TW': { volume: '音量', log: '對話紀錄', close: '關閉', emptyLog: '尚未出現對白。', choice: '你的選擇', context: '導讀說明', details: '閱讀提示', credits: '素材出處與說明' },
  'zh-CN': { volume: '音量', log: '对话记录', close: '关闭', emptyLog: '尚未出现对白。', choice: '你的选择', context: '导读说明', details: '阅读提示', credits: '素材出处与说明' },
  en: { volume: 'Volume', log: 'Dialogue log', close: 'Close', emptyLog: 'No dialogue yet.', choice: 'Your choice', context: 'Reading context', details: 'Reading notes', credits: 'Sources and notes' },
  ja: { volume: '音量', log: '会話ログ', close: '閉じる', emptyLog: '会話はまだありません。', choice: '選択した回答', context: '読書ガイド', details: '読む際のヒント', credits: '出典と説明' },
  ko: { volume: '음량', log: '대화 기록', close: '닫기', emptyLog: '아직 대화가 없습니다.', choice: '선택한 답변', context: '읽기 안내', details: '읽기 참고 사항', credits: '출처 및 안내' },
};
for (const [locale, labels] of Object.entries(controls)) Object.assign(storyMediaMessages[locale], labels);

const continuationLabels = {"zh-TW":"是否接續下一段劇情？","zh-CN":"是否接续下一段剧情？","en":"Continue to the next story?","ja":"次の物語を読みますか？","ko":"다음 이야기를 이어서 읽을까요?"};
for (const [locale, label] of Object.entries(continuationLabels)) storyMediaMessages[locale].continueChoice = label;

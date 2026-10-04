# 劇情快照流程

`StoryStage.vue` 只讀取 `public/story/catalog.json`、每篇的 `manifest.json` 與 `script.txt`，不直接依賴 PRTS 連線。新增劇情時在 `stories.json` 加一筆 `id`、`page`、`title`，必要時加 `fallbackScriptUrl`；接著執行 `npm run story:sync -- --story <id>`。成功後，故事會自動出現在同一個播放器的選單。

同步器會從劇情指令收集背景、CG、立繪、配樂、音效、影片引用。圖片依 PRTS Wiki 檔名規則嘗試下載，並保留原始 PNG、另產生較小的 WebP 供網頁顯示；音訊依遊戲 `story_variables.json` 對照到 PRTS 音訊站。特殊 PNG 可用 `imageSources`、特殊音訊可用 `audioSources` 覆寫 URL。影片目前沒有通用的 PRTS 路徑規則，需在該筆設定提供 `videoSources`（影片 ID 對 HTTPS URL 的物件）。無法解析或下載的素材會使同步失敗，不會產生缺檔的新 manifest。

`npm run story:sync -- --offline` 用已下載的素材與對照表驗證並重建 manifest；`--overwrite` 會嘗試重新下載來源，來源暫時故障時沿用已驗證的本地檔案，兩個旗標不可同時使用。每日 GitHub Actions 執行下述增量更新入口，編譯成功後才提交快照並主動觸發 Pages 發布。單一影片超過約 95 MiB 時同步會失敗，以避免碰到 GitHub 單檔限制。

`npm run story:sync-prts` 使用 PRTS MediaWiki API 發現所有引用「劇情模擬器」的正文頁面，批次下載劇本文本並依頁面的劇情類型、劇情分組建立目錄，包括主線、活動、干員密錄和特殊劇情。每篇劇本與 manifest 保存在本地；圖片使用 PRTS 的 Data Image / Data Char 對照，音訊使用 Data Audio 對照，已下載的音訊與影片優先使用共用本地檔案，其餘素材保留遠端引用；完整影音下載使用 `npm run story:download-media`。原本初始引導的完整本地素材保留。這個範圍不包含沒有使用劇情模擬器的外部設定文章。

同步結果記錄在 `public/story/sync-report.json`，列出發現數、可播放數、劇本解析失敗及未解析的素材 ID。劇本不可讀時仍保留目錄項目與 PRTS 來源連結，同步命令回傳非零狀態；未解析素材不會阻止閱讀文本。影片目前保留播放器的繼續按鈕，可前往來源頁觀看完整演出。使用 `--resume` 沿用 `tmp/prts-stories/` 的已下載 API 批次，`--offline` 完全從快取重建。一般同步會重新讀取上游；API 批次失敗時自動拆小批次重試。

`npm run story:sync-thumbnails` 把目錄中重複引用的封面按來源 URL 去重，從 PRTS 的 480px 縮圖產生本地 480×270 WebP，保存於 `public/story/thumbnails/`，並寫入 `thumbnail-index.json` 與 `thumbnail-report.json`。既有縮圖直接重用，最多四個下載同時進行；上游縮圖不可用時嘗試原圖，仍不可用則由介面回退至遠端圖片。每日增量同步工作流程會一起更新縮圖。目錄優先使用本地 WebP，首排先載入、其餘延後載入；演出遠端背景使用 1280px 版本，其他圖片使用 960px 版本，失敗時退回原圖。有本地封面對照的背景會先以低解析預覽墊底，再顯示完整演出圖片。本地快照素材維持原本 WebP。演出最多三個圖片預載同時進行，提前找三張尚未載入的不同圖片，並在切換或退出劇情時清除未完成的預載。

封面選擇會排除純黑、純白、空白與透明素材，優先使用劇情內的有效畫面；没有有效素材的純文字或影片段落會借用同活動／章節的封面，`coverOrigin: "collection"` 表示借用封面。同分類內也沒有可用封面時顯示本地 `archive-cover.svg`，標記為 `coverOrigin: "placeholder"`。縮圖同步也會修正既有目錄的黑白封面。瀏覽器若載入本地縮圖失敗，先嘗試原圖，再回退至膠捲備援圖，不直接隱藏圖片。

干員密錄的干員目錄卡片與段落卡片優先顯示該干員的基礎立繪。縮圖同步會依 `operator-assets.json` 的干員名稱與 ID 對照本地基礎立繪，裁去外圍透明區域，產生保留透明度、固定 480×480 畫布的 WebP；立繪等比例置中，不以橫向封面的方式裁切。匯入資產中雲跡、荒蕪拉普蘭德的 `_1` 檔案實為半身像，改用 `public/story/operator-art/` 的 PRTS 基礎全身圖，來源記錄在該目錄的 `sources.json`；不改動其他頁面共用的資產。結果保存在劇情目錄的 `operatorId`、`operatorPortrait` 欄位及 `operator-cover-report.json`。若立繪不可用，保留劇情封面與膠捲備援圖。這只影響選單封面，演出中的背景與角色素材仍依原劇本載入。

每日 GitHub Actions 比對全站劇情的版本，只抓新增或修改的劇本並補下載新影音引用。`story:sync` 更新單篇快照時會保留其他已同步的目錄項目。劇情介面保留膠捲邊框，以固定高度的橫向膠捲呈現，不將目錄向下堆疊。操作分成三個獨立畫面：先選活動名稱／章節名稱／干員名稱，再選該目錄內的劇情段落，最後進入演出畫面；選單與播放器不會同時顯示。初次進入只載入目錄與素材對照，不自動下載劇本或開始演出。演出可返回原目錄的段落列表，保留篩選與分頁，並停止音訊、打字計時器和未完成的播放載入。主目錄與段落列表各有獨立搜尋與分頁。

`src/utils/storyCatalog.js` 是介面與同步器共用的分類規則：主線、大型活動、故事集、干員密錄、集成戰略、生息演算、危機合約、特殊劇情／企劃、內測劇情。先按大類及子分類選取具體的活動／章節／干員卡片，再於段落列表按行動前／後／故事段落／分支結局／序曲篩選。主線卡片標示 EP 編號與完整章節名稱；活动卡片使用活動名稱；內測區分唤醒、收束、回声測試並依章節整理。來源原始分類保留在 `category` 與 `sourceGroup`，整理後的分類放在 `archiveCategory`、`section`、`group`、`chapterNumber`、`phase`。播放器目前支援常見背景、CG、立繪、選項、基本遮罩、灰階、音效、配樂與影片；新指令仍需逐類實作演出語意。

`npm run story:sync-archive` 更新 `public/story/archive-metadata.json`：PRTS「關卡一覽/曲譜」提供 14 條樂章分類、活動順序與故事線交點，遊戲 `story_review_table.json` 提供段落的 `storySort` 和活動首次實裝時間。依 PRTS 劇本的「文本路徑」配對；舊目錄可從 `tmp/prts-stories/` 的快取修復，新的全站同步會保留 `scriptPath`。使用 `--offline` 可從 `tmp/story-research/` 內已有的兩份資料重建，無需連線。每日增量流程會一併更新。

介面採黑色典藏面板與樂章分組，保留膠捲邊框。可切換「劇情典藏」與「敘事脈絡」兩種檢視，皆維持左右瀏覽；舊精簡模式合併至劇情典藏；分類及故事線改用下拉選單，進階篩選與跨故事線路徑預設收合，並切換樂章／實裝／名稱排序。主線另有覺醒、幻滅、殘陽、裂變篩選。尚未列入 PRTS 樂章的活動保留原分類，不推測其所屬故事線。段落編號使用完整章節的排序位置，搜尋、分頁與段落篩選不會重編；匹配不到遊戲排序時，使用章節代碼的自然排序並明示來源。故事線路徑包含 PRTS 列出的交點，可切換到對應章節，未收錄的項目會停用。

播放畫面可前往上一段／下一段，結尾也可接著播放下一段。到達劇情結束時，將已讀記錄保存在瀏覽器 `localStorage` 的 `story-archive-read`；檢視偏好保存於 `story-archive-view-v2`。進度不會跨裝置同步，瀏覽器禁止儲存時仍可正常閱讀。選擇目錄、段落與演出仍分成三個畫面。

膠捲以中央封面為焦點，兩側封面水平銜接，上下齒孔與拖曳位置同步移動；支援滑鼠拖曳、觸控左右滑動、滾輪／觸控板、左右方向鍵與按鈕切換，並可用進度滑桿快速定位。滑鼠拖曳以 3.2 倍距離回應，觸控為 1.6 倍，位移以動畫影格合併更新；短距離拖曳即可換片，放開後依速度提供有限慣性並平順吸附封面，重新按住即可接手。拖曳產生的點擊會被抑制；先點側邊封面置中，再點中央封面進入。只渲染目前位置附近最多七張封面，分類及段落編號保持不變。系統啟用減少動態效果時停用轉場動畫。

分類選單依類型列出全部故事線及未歸入樂章的系列，第三層可直接選活動、章節或干員；不只顯示 14 條樂章。觀看順序使用獨立閱讀路徑，從 PRTS 交點的流入標記區分跨線前置與後續，主線穿插活動由 storyReadingOrder.js 明確編排。逐篇顯示篇章、閱讀說明、前後篇與相關完整路徑；不宣稱為故事世界的年代順序。舊精簡檢視偏好會自動回到劇情典藏。


## 多語劇情

`npm run story:sync-localizations` 匯入 ArknightsGameData_YoStar 的英文、日文及韓文遊戲劇本，保存於 `public/story/localizations/<locale>/`，並產生標題對照、索引與缺漏報告。此工作只同步已有的遊戲譯文，不會把缺少的內容冒充機器翻譯。繁中／簡中仍使用既有原文與簡繁轉換。影片本身的字幕、配音不會被這個流程翻譯。

同步使用 PRTS 文本路徑對應，持久對照在 `scripts/story/localization-paths.json`；有 PRTS 快取時優先讀取新對照。上游清單與劇本快取在 tmp；`--refresh` 更新清單，`--offline` 只重建快取。下載內容須符合上游 Git blob 校驗；譯文新增的演出素材若不在原劇本內，會列入 incompatibleAssets，不直接啟用。指令不進行網站部署。

播放器依網站語言選擇整篇對應語言的遊戲劇本，包含對白、旁白、角色名稱及選項；遊戲版本的台詞段數可能不同，因此播放中切換語言會從該篇開頭重播。讀取時核對原文和譯文 SHA-256，原文改版後停用過期譯文，直到重新同步。譯文不存在、過期或載入失敗時顯示說明並回退原文，不阻擋閱讀。`report.json` 的 imported 表示實際匯入篇數，missing 為尚未對應或尚無海外版，failed 為下載或資料問題；這不是全量翻譯完成的聲明。


## 敘事脈絡的導讀方式

主線沿篇章總覽保留活動插入點，並說明回憶、人物背景與主線的閱讀銜接。其他故事線以本線活動為主要路徑；PRTS 明確標示的流入交點附在它之後的本線活動，列為「讀這篇之前，先補齊」，流出交點附在它之前的活動，列為可延伸的故事線。跨線前置不再被攤平成連續必讀卡片。另有明確標為本站建議的補充篇目，與來源標示的前置分開。

跨線跳轉會前往目標故事的導讀位置，先呈現其閱讀準備，不會直接播放孤立的中段章節；可以返回原導讀位置。進入主線中的插入活動後仍保留原來選定的閱讀路徑。讀到活動最後一段，可回到下一站導讀，再決定是否先補跨線前置。「接續未讀」根據本瀏覽器已讀紀錄定位本線第一個尚未讀完的活動，並非對玩家站外進度的推測。

夏日律動與泰拉奇談以選讀方式呈現，相鄰活動不一律當成必要前置。臨光、萊茵生命、海洋等篇目與主線插入點補上具體導讀說明，其餘採本線建議次序與已記錄的跨線關聯。這份導讀不等同逐句考證的全故事年代線，也不宣稱所有相鄰篇目都是直接續篇。關聯來源為 PRTS「關卡一覽／曲譜」，導讀文字為本站編排。


## 帳號閱讀進度

Supabase 的 `public.user_story_reads` 以 `(user_id, story_id)` 為主鍵，記錄已讀段落及首次同步完成時間。Schema 在 `docs/story-reading-progress-schema.sql`。帳號 ID 來自既有 Worker KV session，不能以 Supabase Auth 的 auth.uid() 取代。資料表啟用 RLS，撤銷 PUBLIC、anon、authenticated 的存取，只授予後端 service_role SELECT / INSERT；前端無資料庫私密金鑰。

Worker 新增 `/api/user/story-reads`：GET 依 story_id 游標每頁 500 筆讀取目前帳號；POST 每次最多 200 個 storyIds，實際 body 上限 24 KiB。兩者都先驗證 Worker 登入 session，查詢與新增的 user_id 只採用 session。重複完成紀錄採 ignore-duplicates，不覆蓋其他裝置的紀錄或最初時間；本次沒有刪除／設為未讀功能。

前端 `storyReadingProgress.js` 為每個帳號保存獨立 completed / pending 快取。看完一段先記錄本機，再合併雲端、分批上傳待同步項目。登入切換會撤銷舊請求及清除畫面上的舊帳號狀態；請求固定使用起始帳號的 token，回應也需符合該帳號。離線等待 online 事件，暫時失敗最多自動重試三次，另可手動重試；回到視窗可刷新其他裝置的進度。關閉頁面後不會背景持續同步，未送出的紀錄會在再次開啟劇情頁後補送。

訪客沿用 `story-archive-read`；不會自動匯入任一登入帳號。玩家點選「將本機已讀匯入目前帳號」才合併，訪客原紀錄保留。登出後回到訪客紀錄，不把帳號快取混回共用訪客紀錄。讀取範圍是段落是否已讀，不包含台詞位置或分支存檔。

上線須先建立資料表，再部署新版 Worker，最後發布前端。只發布前端時會顯示「帳號進度服務尚未啟用」，並保留本機 pending。依本次要求只執行編譯／語法檢查，未做登入與跨裝置功能測試。

## 劇情影片與音訊

`npm run story:sync-media` 會讀取現有劇本，補入缺少且來源可用的影片／音訊網址，不改寫翻譯、封面或閱讀進度。`npm run story:sync-media -- --all` 重新查核所有遠端引用；加上 `--retry-unresolved` 只重試上次未確認的項目。請在 `story:sync-prts` 後執行。同步需連線並使用 curl，這是素材匯入，不是專案執行測試。

影片使用 PRTS 的 `static.prts.wiki/video/`，音訊使用 `torappu.prts.wiki/assets/audio/`。執行 `npm run story:download-media` 後，可用影音會實際下載到 `public/story/media/audio/` 與 `public/story/media/videos/`，並將各篇 manifest 改為本地相對路徑。未下載的項目才保留遠端引用。匯入時檢查 HTTP 狀態與媒體 Content-Type；HTML 錯誤頁不視為成功。音效別名不分大小寫，支援舊檔案路徑、副檔名與含特殊字元的合法檔名。僅對同名別名或唯一檔名提供候選，不以相似歌曲冒充缺失素材。

`public/story/media-sync-report.json` 列出已確認網址與尚未確認的素材；失敗項目記錄 HTTP 狀態、內容類型或網路逾時。此清單表示來源探測結果，不等同瀏覽器實播結果。既有網址遇到暫時網路錯誤仍保留，避免誤刪。後續目錄同步會保留這份清單已確認的修正網址。

播放器支援站內影片、影片播畢接續、載入失敗重試，以及音效循環、聲道停止、音量調整與音效延遲。音樂／環境音在影片播放與段落結束時停止，返回劇情後依當前狀態恢復。聲音預設開啟並保存使用者選擇，瀏覽器阻擋自動播放時顯示啟用按鈕；未完整模擬所有演出時間軸及漸變參數。


`story:download-media` 以來源網址去重，每個檔案保存來源、大小與 SHA-256 至 `media/local-index.json`。重新執行會重用校驗正確的已下載檔案；來源不穩定時加上 `--slow` 以兩路併發並間隔請求續傳；`--offline` 可只從現有檔案恢復本地引用，不連線。下載先寫入 `.part`，確認 HTTP、Content-Type、MP3／MP4 檔頭及檔案大小後才正式存入，避免把 HTML 錯誤頁當成音樂。每 25 筆保存可續跑索引，未完成檔不會被播放器引用。

結果在 `public/story/media-download-report.json`：包含實際存檔數與大小、各篇仍未本地化的引用及下載失敗原因。`media-sync-report.json` 是遠端可用性檢查，與本地下載結果分開。後續 `story:sync-prts` 會優先保留仍存在的本地素材；重跑 `story:download-media` 可重新補齊。


## 劇情閱讀控制

劇情頁的音量預設 50%，聲音預設開啟，並記住本機的音量與開關選擇。音量同時作用於音樂、音效、影片與膠捲切換聲，保留劇本原有的各音軌相對音量。聲音開關採靜音方式：音軌在背景繼續，重新開啟時接回目前位置，不重新建立或重播音軌；換曲、影片、段落結束仍按劇本處理。

「對話紀錄」提供目前段落已到達的對白、旁白與實際選擇，不預先列出後續劇情；上一句不重複加入相同對白，重新播放、換段落或換語言會清空紀錄。視窗可用關閉按鈕、Esc 或背景關閉。

膠捲切換會播放短促、低音量的合成提示聲，遵循相同音量與靜音設定，不依赖遠端素材。導讀與素材說明改為預設收合，閱讀前置與接續操作仍直接顯示。依使用者要求只檢查程式語法及元件編譯，未執行整個專案或實播測試。


## 補充來源：聯動音效與官方影片

`community-media-sources.json` 保存 ArknightsAssets/ArknightsAssets2 的固定 commit、精確檔名、Git blob SHA-1 與大小；目前包含落葉逐火的 69 個 MH 音效。`npm run story:download-media -- --community` 只從這份對照下載新檔，其餘來源重用已下載檔案，不重新探測 PRTS 缺檔。匯入核對 MP3 檔頭、檔案大小、Git blob SHA-1，並保存本地 SHA-256。下載只允許清單中的指定 GitHub repository／commit URL。

`official-video-sources.json` 保存官方 hot_update_list 中 03.usm 與 act49side/ta02.usm 的版本、網址與 MD5。官方 CDN 提供 ZIP 格式的 .dat；解出 USM 後核對官方 MD5，用 WannaCRI 0.3.3（GBK 檔名編碼）拆出 IVF 影像與 SFA 音訊，再以 FFmpeg 7.1 轉成 H.264／AAC MP4（CRF 19、yuv420p、音訊 192k、faststart）。兩段影片保留原音軌，沒有替換為劇情錄影。轉換用依賴與原始下載保存在被忽略的 tmp/story-research，網站使用 public/story/media/videos 的 MP4。

素材本地索引保存轉換來源、原始 MD5 與本地 SHA-256；離線匯入會保留這些資料。缺少本地轉換影片時，下載器會明確報 official-usm-needs-conversion，不把原始 USM 誤存為 MP4。後續目錄同步透過 local-index.references 保留新增的本地素材。


## 角色演出與中央視窗

`public/story/character-index.json` 同步自 https://torappu.prts.wiki/assets/avg/character.json，包含角色底圖、表情差分與 faceRect。播放器支援 Character 與 CharSlot 的左／中／右位置、清除角色、焦點與基本明暗；保留 # 後的表情名稱，以 Canvas 在底圖的原始座標合成臉部差分。表情載入失敗時保留底圖，缺少對照時使用既有 manifest 圖片。角色圖片仍由 PRTS 載入，這份索引不是全部角色圖片的離線下載。

CameraShake 支援劇本的時間、橫／縱強度、頻率與淡出，切換台詞或離開劇情時取消既有動畫；返回上一句不重播晃動，減少動態效果偏好會停用。仍未完整模擬所有演出指令與阻塞時間軸。

對話紀錄與劇情結束選項使用固定在視窗中央的原生 dialog，限制高度並允許內部捲動。段落結束時自動開啟接續視窗，提供下一段／下一站導讀、返回選段與重播；關閉後仍可再次開啟。

## 每日增量更新與手動執行

在專案根目錄執行 `npm run story:update`。此入口依序檢查 PRTS 劇情、角色表情對照、敘事分類與段落順序、封面縮圖、本地影音及既有英文／日文／韓文遊戲譯文，不啟動網站，也不執行專案測試。

`public/story/sync-state.json` 保存各正文頁與引用的 /data 子頁版本 ID。每次重新讀取上游頁面清單與版本，只下載新增、修改或本地檔案缺失的劇本；相同內容不重寫。首次執行尚無版本紀錄，需讀取所有正文建立基準，之後才是增量讀取。正文抓取失敗時保留既有可播放項目且不推進失敗頁面的版本，命令回傳失敗，供下次重試。

影音沿用 `media/local-index.json` 與既有下載報告：驗證本地檔案後重用，只下載尚未取得的新來源，不重抓全部；已知失效來源保留缺檔紀錄而不每天重試。要重新嘗試已知缺檔，可執行 `npm run story:update -- --retry-unresolved`。官方 USM 影片仍需專用轉換，來源缺檔不會被這個排程憑空補齊。譯文按上游 Git blob、原文 SHA-256 和本地譯文 SHA-256 重用，原文修改時重新檢查素材相容性；此流程匯入既有遊戲翻譯，沒有新增機器翻譯。

`.github/workflows/sync-story-w2g.yml` 每日台灣時間凌晨 02:30 執行同一個入口，亦可在 GitHub Actions 手動 Run workflow。排程需推送到 GitHub 預設分支後才生效，可能因 GitHub 排隊延後；本機命令不會自動提交或發布。本機手動更新與工作流程預設讓影片成品保持在 95 MiB 內；超標影片會先自動壓縮，既有未超標檔案直接重用。同步成功並通過編譯後，提交快照並明確呼叫 deploy.yml，避免 GITHUB_TOKEN 推送不觸發另一個 push 工作流程的限制。

`sync-report.json` 的 fetchedScripts / reusedScripts / changedFiles 表示此次下載與重用的劇情數；`media-download-report.json` 的 downloaded / reused / skippedKnownMissing 表示影音下載、重用與略過已知缺檔數。檢查仍會刷新這些報告，即使沒有劇本內容變動。

`cfa_03.mp4` 已轉為 H.264、yuv420p 與 faststart，維持 1560×720、25 fps、完整 76.68 秒，AAC 音軌直接複製；檔案由 147,892,197 bytes 降為 44,955,584 bytes。`local-index.json` 和對應 manifest 已更新大小、SHA-256 與轉換来源；同步器會沿用這份本地影片。原檔備份位於被 Git 忽略的 `tmp/video-compression/cfa_03-original.mp4`。

## 大影片自動壓縮

`story:update` 與 `story:download-media` 都會自動處理超過成品上限的影片。原始影片先下載到被 Git 忽略的 `tmp/story-media-downloads/`，原始下載上限為 512 MiB；音訊仍受 32 MiB 上限保護。成品上限預設 95 MiB，設定更小的 `--max-file-mib` 也會套用；即使指定更大的值，影片成品仍不超過 95 MiB。

壓縮使用 FFmpeg / libx264，先嘗試 CRF 20，仍超標時按影片長度和原音轨預算做兩次編碼，保留原解析度與影格時間戳，音軌直接複製。完成後確認長度、解析度、音軌數量，解碼完整影片並比對原音軌封包 SHA-256，再次確認成品大小；通過後才替換檔案並更新本地索引與劇情 manifest。`media-download-report.json` 的 compressed / compressedSources 記錄壓縮數量及前後大小，conversion 保留轉換來源校驗資訊。

本機優先使用 `FFMPEG_PATH` 指定的執行檔，未指定時沿用 `tmp/video-compression/ffmpeg.exe` 或 PATH 的 ffmpeg；目前這台電腦已有工具。GitHub 排程會檢查並安裝 FFmpeg。多部大影片排隊壓縮，避免同時大量占用 CPU。壓縮或驗證失敗時不覆蓋既有素材，新下載的失敗檔案不進入 public；原因記錄在 failures，已知失敗可加 `--retry-unresolved` 重試。如果本地仍有超過 GitHub 100 MiB 限制的影片，命令回傳失敗、排程停止提交及發布，unsafeLocalFiles 列出問題檔案。官方 USM 原始影片仍需專門解包，本流程只處理已可讀的 MP4。

# ArknightMusicWeb Agent Handoff

更新時間：2026-07-09  
專案路徑：`D:\Personal Project\ArknightMusicWeb`

這份文件是給另一台電腦上的 agent 接手用。目標是讓對方即使沒有前面的對話紀錄，也能理解目前做到哪、為什麼這樣做、下一步要怎麼繼續。

## 使用者偏好與回答方式

- 預設使用繁體中文。
- 以資深工程師角度協助，但回答要直接、務實、具體。
- 修改程式前要先理解既有 Vue/Vite 架構與元件分工。
- 不要做大範圍重構，除非真的能降低風險或符合目前需求。
- 使用者如果明確說「幫我改」「直接幫我做」，可以直接改檔。
- 如果只是問「怎麼修」「為什麼」，先提供分析、修改位置與建議，不要直接改。
- 回答要包含：
  - 修哪個檔案。
  - 修哪個 function 或區塊。
  - 原本功能是什麼。
  - 改完後功能是什麼。
  - 為什麼修在那裡。
- 工作中要避免覆蓋使用者既有改動。
- 不要隨便 `git reset` 或 revert 使用者未要求的變更。

## 專案背景

這是一個 Vue/Vite 的明日方舟音樂網站，已經逐步加入：

- 音樂播放。
- 專輯頁、歌曲詳情頁。
- 歌詞翻譯。
- 分享連結。
- 使用者登入/歌單/我的最愛/角色清單。
- Cloudflare Worker API。
- 本地化圖片資產流程。

目前正在處理的主線是：**降低 GitHub raw 圖片限流造成的 429、圖片載入慢、角色圖片不穩問題**。

核心策略：

```text
前端
  ↓
先吃 public/images 本地資產
  ↓
本地找不到才 fallback 遠端來源
```

目前已先完成 avatar/faction/class 的本地優先，正在擴充 portraits/items/skills。

## 目前 Git 狀態重點

目前工作樹是 dirty，這是正常的，因為有大量功能與資產還沒整理 commit。

目前觀察到的狀態：

```text
 M package.json
 D public/images/logo_kazimierz.png
 D public/images/logo_rhine.png
 D public/images/logo_rhodes.png
 D public/images/logo_rhodes2.png
 D public/images/logo_victoria.png
 D public/images/logo_yan.png
 M src/App.vue
 M src/components/CharacterDetails.vue
 M src/components/CharacterList.vue
 M src/components/Modal.vue
 M src/components/Navbar.vue
 M src/components/UserLibraryView.vue
 M src/services/api.js
 M src/utils/recruitCard.js
 M worker/index.js
?? public/images/classes/
?? public/images/factions/
?? public/images/manifest/
?? public/images/operators/
?? scripts/assets/
?? src/services/operatorAssetManifest.js
```

注意：

- 不要看到 dirty 就重置。
- `scripts/assets/` 目前在這台電腦是 untracked，但它是本地資產流程的核心，後續要 commit 的話要一起 add。
- `public/images/...` 大量圖片也會是 untracked 或新增檔案。
- root 底下的舊 logo 已刪除，正式位置改為 `public/images/factions/`。

## Git 提交策略

不要把 `public/images/operators/portraits/` 直接提交到 GitHub。這個資料夾目前約 3.75GB，雖然單檔沒有超過 GitHub 100MB 限制，但整體會讓 repo 過重，clone/push/build 都會變差。

目前建議提交到 GitHub 的內容：

- 程式碼變更。
- `scripts/assets/`。
- `src/services/operatorAssetManifest.js`。
- `public/images/operators/avatars/`。
- `public/images/factions/`。
- `public/images/classes/`。
- `public/images/manifest/`。
- 這份 handoff 文件。

目前建議不要提交：

- `public/images/operators/portraits/`
- `public/images/items/`
- `public/images/skills/`

接手機器需要用 `assets:sync` 指令重建這些大型或尚未完成的本地資產。

## 已完成的主要工作

### 1. 前端音樂 API 改走 Worker

之前已將前端音樂 API 改成走 Worker，並新增或整合：

- 歌曲完整資料 endpoint。
- 歌詞翻譯後端化。
- 搜尋後端化。
- 分享連結 Open Graph 預覽。

相關檔案可能包含：

- `worker/index.js`
- `src/services/api.js`
- `src/services/lyricsTranslationPlugin.js`
- `src/stores/player.js`
- `src/components/*`

這部分不是目前主線，但不要誤刪。

### 2. 使用者功能

已加入使用者系統相關功能：

- 使用者可以登入/註冊，但不登入也能使用基本功能。
- 我的最愛。
- 我的歌單。
- 角色清單。
- 歌單管理：建立、重新命名、刪除、移除歌曲、播放全部。
- 加入歌單改成「查看 / 管理」modal。

主要檔案：

- `src/services/auth.js`
- `src/services/userLibrary.js`
- `src/components/UserLibraryView.vue`
- `src/components/PlayerView.vue`
- `src/components/CharacterDetails.vue`

### 3. 角色清單與角色頁

已做過幾個重要修正：

- 角色清單中的角色可以點進角色詳情。
- 從我的角色清單點角色時，會先顯示基本資料，再非同步補完整詳情。
- 角色圖片正在改成本地資產優先。
- 角色頁回上一層的 UX 還有後續規劃，但不是目前最優先。

### 4. `alert()` 問題已處理

使用者曾遇到瀏覽器 alert：

```text
無法載入角色詳情，請稍後再試
```

原因：

- `CharacterList.vue` 裡點角色時會呼叫 `fetchCharacterDetails(char.id)`。
- 如果角色詳情資料來源失敗，原本會 `alert(t('character.loadDetailError'))`。
- 這會打斷使用者操作。

目前處理：

- 已在 `src/components/CharacterList.vue` 改成畫面底部 toast。
- 角色頁仍會先打開基本資料。
- 詳情載入失敗時只顯示非阻斷式提示。

相關位置：

- `src/components/CharacterList.vue`
  - `detailLoadMessage`
  - `showDetailLoadMessage()`
  - `.character-detail-toast`

同時注意：

- 這個檔案原本有一些亂碼註解黏住程式碼，已順手修正幾段關鍵邏輯：
  - `selectedFactions`
  - `avatarIndexMap`
  - `toggleRarity`
  - `getRarityStars`

Build 已通過。

## 本地圖片資產流程

### 目前目標

把外部圖片來源逐步搬到本地：

- avatar
- faction logo
- class icon
- 精一/精二立繪
- 時裝圖
- material/item icon
- skill icon

原因：

- GitHub raw / cdn 圖片可能 429。
- Worker proxy 仍可能被上游限流。
- 角色圖片、陣營圖、職業圖是高頻使用資產，應該本地優先。

### 目前資料夾結構

已建立或使用：

```text
public/images/operators/avatars/
public/images/factions/
public/images/classes/
public/images/operators/portraits/
public/images/items/
public/images/skills/
public/images/manifest/
```

目前本機檔案數量：

```text
public/images/operators/avatars      418
public/images/factions               43
public/images/classes                8
public/images/operators/portraits    1286
public/images/items                  0
public/images/skills                 0
```

目前 manifest summary：

```json
{
  "avatars": 418,
  "factions": 43,
  "classes": 8,
  "portraits": 1286,
  "items": 0,
  "skills": 0
}
```

目前 audit report summary：

```json
{
  "operators": 418,
  "avatars": { "total": 418, "existing": 418, "missing": 0 },
  "factions": { "total": 44, "existing": 44, "missing": 0 },
  "classes": { "total": 8, "existing": 8, "missing": 0 },
  "portraits": { "total": 1287, "existing": 1234, "missing": 53 },
  "items": { "total": 85, "existing": 0, "missing": 85 },
  "skills": { "total": 866, "existing": 0, "missing": 866 }
}
```

注意：

- audit report 的 `existing` 是 audit 當下狀態，可能比目前 manifest 舊。
- 以目前 manifest/filesystem 來看，portraits 已有 1286 張。
- audit total 是 1287，代表大概率只剩少量 portrait 未同步成功。

### 重要：不要平行跑 sync

不要同時開多個 CMD 跑：

```powershell
npm.cmd run assets:sync -- --type portraits
npm.cmd run assets:sync -- --type items
npm.cmd run assets:sync -- --type skills
```

原因：

- `assets:sync` 會共同寫 `public/images/manifest/operator-assets.json`。
- 多個 process 同時寫會讓 manifest 互相覆蓋。
- 圖片檔可能沒事，但 manifest 會漏資料。

正確做法：一個一個跑。

## 已新增/修改的資產腳本

### `package.json`

新增 scripts：

```json
{
  "assets:audit": "node scripts/assets/audit-operator-assets.mjs",
  "assets:sync": "node scripts/assets/sync-operator-assets.mjs"
}
```

### `scripts/assets/audit-operator-assets.mjs`

用途：

- 盤點需要本地化的圖片。
- 不下載圖片。
- 產出 `public/images/manifest/operator-assets-audit.json`。

目前支援：

- avatars
- factions
- classes
- portraits
- items
- skills

重要行為：

- `items` / `skills` 預設會盤點。
- `portraits` 需要 `--include-portraits`。
- portraits 現在從 `character_table.json + skin_table.json` 解析精一、精二、時裝，不再逐一依賴角色 detail endpoint。

常用指令：

```powershell
npm.cmd run assets:audit -- --include-portraits
```

小規模測試：

```powershell
npm.cmd run assets:audit -- --include-portraits --detail-limit 20
```

### `scripts/assets/sync-operator-assets.mjs`

用途：

- 讀取 audit report。
- 下載缺少的圖片。
- 寫入 `public/images/manifest/operator-assets.json`。

目前支援：

```text
avatars
factions
classes
portraits
items
skills
```

常用指令：

```powershell
npm.cmd run assets:sync -- --type portraits --limit 100
npm.cmd run assets:sync -- --type items --limit 200
npm.cmd run assets:sync -- --type skills --limit 200
```

如果失敗，可以重跑同一條。腳本會跳過已存在檔案。

### root 舊 logo 已清除

以前 root 底下有：

```text
public/images/logo_kazimierz.png
public/images/logo_rhine.png
public/images/logo_rhodes.png
public/images/logo_rhodes2.png
public/images/logo_victoria.png
public/images/logo_yan.png
```

目前已刪除。

正式 faction logo 位置：

```text
public/images/factions/logo_*.png
```

`sync-operator-assets.mjs` 裡原本會拿 `public/images/${record.id}.png` 當 fallback，已移除。

## 前端本地資產接入狀態

### 已接入

新增檔案：

```text
src/services/operatorAssetManifest.js
```

用途：

- 讀取 `public/images/manifest/operator-assets.json`。
- 正規化舊 manifest 裡 `/public/images/...` 路徑。
- 提供本地資產 resolver。

目前已有：

- `loadOperatorAssetManifest()`
- `getLocalOperatorAvatarUrl(operatorId)`
- `getLocalFactionLogoUrl(factionOrLogoKey)`
- `getLocalProfessionIconUrl(profession)`

已接入本地 avatar：

- `src/components/CharacterList.vue`
- `src/components/CharacterDetails.vue`
- `src/components/UserLibraryView.vue`

已接入本地 faction/class：

- `src/services/api.js`
- `src/utils/recruitCard.js`

另外 `src/services/api.js` 的 `getProxyImageUrl()` 已修正：

- 本地 `/images/...` 不再丟 Worker proxy。
- 遠端 URL 才走 proxy。

### 尚未接入

尚未讓前端吃本地：

- portraits
- items
- skills

下一步要做。

## 下一步建議順序

### Step 1：補完本地資產同步

在家裡電腦先確認最新程式碼與資產存在後，依序跑：

```powershell
npm.cmd run assets:sync -- --type portraits --limit 100
npm.cmd run assets:sync -- --type items --limit 200
npm.cmd run assets:sync -- --type skills --limit 200
```

如果 items/skills 很順，可以改大：

```powershell
npm.cmd run assets:sync -- --type items --limit 500
npm.cmd run assets:sync -- --type skills --limit 500
```

不要多開 CMD 平行跑。

### Step 2：讓前端吃本地 portrait/item/skill

要修改：

```text
src/services/operatorAssetManifest.js
src/services/api.js
src/components/CharacterDetails.vue
```

建議新增：

```js
getLocalOperatorPortraitUrl(portraitId)
getLocalItemIconUrl(iconId)
getLocalSkillIconUrl(iconId)
```

然後：

- `resolveCharacterPortraits()` 產出的 `urls`：本地 portrait 放第一個。
- `getItemInfo()` 的 `iconUrl`：本地 item icon 優先。
- skill object 增加 `iconUrl`：本地 skill icon 優先。
- `CharacterDetails.vue` 的技能區可以加 skill icon，不然 skill icon 下載了但畫面不用。

### Step 3：處理角色詳情資料仍可能慢/失敗的問題

目前角色詳情仍會在前端抓多個 GameData JSON：

- `character_table.json`
- `skill_table.json`
- `building_data.json`
- `uniequip_table.json`
- `handbook_info_table.json`
- `item_table.json`
- `range_table.json`
- `skin_table.json`

這還是可能慢或失敗。

長期比較好的做法：

- Worker 提供角色完整詳情 endpoint。
- Worker 快取/整理 GameData。
- 前端只吃整理好的 JSON。

但這是下一階段，不要和圖片本地化混在同一個大改裡。

## 已驗證

最後一次已跑：

```powershell
node --check scripts/assets/sync-operator-assets.mjs
npm.cmd run build
```

結果：

- `node --check` 通過。
- `npm.cmd run build` 通過。
- build 時間約 1 分 44 秒。

build 變慢原因：

- `public/images/operators/portraits` 已有大量圖片。
- Vite build 需要處理/複製 public 資產。
- 這是目前預期現象。

## 已知風險與注意事項

### 1. 大量圖片進 Git 會讓 repo 變大

目前選擇是本地 assets，不使用 R2，因為使用者不想提供信用卡。

後續如果圖片量繼續增加，要注意：

- Git repo 大小。
- GitHub push 時間。
- GitHub Pages 部署時間。
- Vite build/preview 時間。

如果 repo 變太大，未來可能要考慮：

- Git LFS。
- 分離 assets repo。
- 只保留高頻資產本地化。

但目前使用者傾向完整本地版本。

### 2. `public/images/manifest/operator-assets.json` 是 sync 的核心

不要手動亂改 manifest。

sync 腳本會寫入：

```text
public/images/manifest/operator-assets.json
```

前端透過它找本地資產。

### 3. audit report 和 manifest 不是同一個用途

```text
operator-assets-audit.json
```

用途：

- 盤點候選資產。
- 告訴 sync 腳本哪些要抓。

```text
operator-assets.json
```

用途：

- 前端實際讀取。
- 記錄已同步成功的本地資產。

### 4. 若 `assets:sync` 出現少數 fail，不代表流程壞掉

例如先前 portraits 同步時出現過：

```text
char_450_necras_summer#20
char_1035_wisdel_sale#14
```

這類可能是：

- 上游沒有該檔名。
- `#` 編碼後來源不支援。
- 特殊 skin 路徑規則不同。

處理方式：

- 先同步大多數成功的資產。
- 最後只針對少量 fail 補特殊 fallback 規則。

不要為了少數 fail 先重寫整個流程。

## 建議給接手 agent 的工作原則

1. 先讀這份文件。
2. 再讀：

```text
AGENTS.md
src/services/operatorAssetManifest.js
scripts/assets/audit-operator-assets.mjs
scripts/assets/sync-operator-assets.mjs
src/services/api.js
src/components/CharacterDetails.vue
```

3. 先確認本地資產狀態：

```powershell
Get-ChildItem public/images/operators/portraits -File | Measure-Object
Get-ChildItem public/images/items -File | Measure-Object
Get-ChildItem public/images/skills -File | Measure-Object
```

4. 不要平行跑 sync。
5. 不要 revert dirty worktree。
6. 修改前先說明會改哪裡，除非使用者明確要求直接改。
7. 每次修改後至少跑：

```powershell
node --check scripts/assets/sync-operator-assets.mjs
npm.cmd run build
```

如果只是改 Vue 前端，也至少跑：

```powershell
npm.cmd run build
```

## 接手後最可能的下一個任務

使用者大概率會要：

```text
讓角色頁的立繪、材料圖示、技能圖示改成本地優先。
```

建議實作順序：

1. `operatorAssetManifest.js`
   - 加 `getLocalOperatorPortraitUrl()`
   - 加 `getLocalItemIconUrl()`
   - 加 `getLocalSkillIconUrl()`

2. `api.js`
   - portraits 的 `urls` 陣列前面塞本地 URL。
   - `getItemInfo()` 回傳本地 `iconUrl`。
   - skills 回傳 `iconUrl`。

3. `CharacterDetails.vue`
   - 材料圖片會自然吃 `item.iconUrl`。
   - 技能區新增 icon 圖片顯示。
   - 圖片 error fallback 保留。

4. build 驗證。

## 最後狀態總結

目前進度：

- avatar/faction/class 本地優先：完成。
- portraits/items/skills audit/sync 腳本：完成。
- portraits 本地檔案：已大量完成，manifest 目前 1286。
- items/skills 本地檔案：尚未下載，目前 0。
- portraits/items/skills 前端本地優先：尚未做。
- 角色詳情 alert：已改 toast。
- root 舊 logo：已移除。
- build：通過。

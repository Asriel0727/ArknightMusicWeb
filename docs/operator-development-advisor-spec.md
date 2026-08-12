# 幹員培養與抽卡建議系統規格

> 狀態：提案（尚未實作）  
> 最後更新：2026-08-12  
> 目標：以全自動資料同步提供「可追溯的幹員資訊與帳號缺口提示」，玩家瀏覽時不呼叫 AI、不中斷載入，也不消耗 AI Token。

## 1. 背景與目標

角色資料頁目前已可取得官方 GameData 的技能、天賦、模組、素材、職業、分支與各伺服器實裝資料。玩家仍會想知道：

- 此角色能解決什麼問題？
- 是否補足自己的帳號缺口？
- 應優先精二、專精哪個技能、是否需要模組？
- 當期卡池是否值得投入資源？

本功能的目標是將上述資訊以版本化、來源可查的方式顯示在角色頁，並在登入玩家建立持有清單後提供帳號缺口分析。

## 2. 必要限制與產品原則

1. 網站前端不得即時呼叫 LLM 或外部攻略搜尋服務。
2. 玩家瀏覽必須只讀取已發布的快照 JSON；因此玩家端 AI Token 成本為零。
3. 官方 GameData 是「事實」來源；攻略評價是「判斷」來源，兩者不可混為一談。
4. 沒有足夠的、版本相符的外部證據時，不顯示「必抽／高推薦」等 Meta 結論。
5. 新角色、資料過期或來源意見分歧時，優先顯示不確定性，而不是輸出看似肯定的結論。
6. 採用 YAGNI：第一版不建立後台、不使用 D1、不導入模型；沿用既有 Worker 排程與 `ARKNIGHTS_DATA` KV。

## 3. 非目標

- 不保證關卡通關、抽卡結果或角色強度永遠正確。
- 不在 V1 建立全角色人工攻略資料庫。
- 不直接轉載第三方攻略全文、影片字幕或付費內容。
- 不以官方技能數值自動推導「必抽榜」。
- 不在前端下載或執行本機／瀏覽器 LLM。

## 4. 使用者可見功能

### 4.1 角色詳情：自動分析卡

每位角色在 `CharacterDetails.vue` 顯示以下區塊：

- **角色功能**：例如範圍輸出、真實傷害、回費、反隱、治療、控場、再部署調度。
- **培養資料**：精英化、技能專精、模組的客觀解鎖條件與素材成本。
- **外部評價**：僅在來源門檻達成時顯示「推薦程度」、「適用模式」、「信心」與簡短理由。
- **資料狀態**：伺服器、遊戲版本、最後同步時間、來源數量及資料是否過期。
- **依據連結**：僅列來源名稱與連結，不複製來源原文。

### 4.2 帳號缺口分析（第二期）

已登入玩家可用現有角色清單標記持有幹員。前端將已持有角色與候選角色的功能標籤比對，顯示：

- 帳號尚缺的功能標籤。
- 該角色能補足的標籤。
- 已有同功能角色時的重疊提示。
- 角色投資成本與玩家指定的遊玩目標（主線／肉鴿／高難等）的關聯。

此功能是 deterministic 規則比對，不使用 AI。

## 5. 整體架構

```text
官方 GameData ──┐
                ├─ Worker 排程：同步、標準化、驗證、產生快照 ── KV 快照 API ── Vue 顯示
攻略來源快照 ──┘                                                        │
玩家持有清單 ─────────────────────────────── 前端功能標籤比對 ──────────────┘
```

### 5.1 同步責任

`worker/index.js` 新增獨立 `guide-sync` 工作：

1. 讀取目前伺服器的角色與版本資料。
2. 讀取已核准的外部攻略來源。
3. 將各來源轉為共同格式並驗證欄位。
4. 以固定規則計算共識、信心與過期狀態。
5. 成功後寫入新的不可變快照，再切換 current pointer。
6. 任一重要步驟失敗時保留上一版完整快照，並寫入同步狀態供管理端檢查。

### 5.2 快照與 API

KV key 建議：

```text
guide:snapshot:{server}:{publishedAt}
guide:current:{server}
guide:sync-status:v1:guides
```

公開 API：

```text
GET /api/guides?server=cn|global|tw
GET /api/guides/:operatorId?server=cn|global|tw
```

管理 API（必須沿用既有 `SYNC_TOKEN` 驗證）：

```text
GET /api/admin/sync-guides?server=cn|global|tw
GET /api/admin/guides-status
```

KV 為最終一致性儲存；因此 API 讀取永遠以 `guide:current:{server}` 指向的「已完成快照」為準，不在寫入後立即跨區讀回驗證。

## 6. 標準化資料格式

外部來源必須能轉換為下列最小結構；沒有角色 ID、伺服器、版本或更新時間的資料不可用於 Meta 結論。

```json
{
  "providerId": "provider-a",
  "operatorId": "char_1052_kalts2",
  "server": "cn",
  "gameVersion": "2026-05",
  "mode": "general",
  "rating": 4,
  "updatedAt": "2026-05-10T00:00:00Z",
  "sourceUrl": "https://example.invalid/guide"
}
```

發布給前端的快照格式：

```json
{
  "schemaVersion": 1,
  "server": "cn",
  "publishedAt": "2026-08-12T00:00:00Z",
  "operators": {
    "char_1052_kalts2": {
      "featureTags": ["true_damage", "healing", "crowd_control", "redeploy_reposition"],
      "development": {
        "elite": "E2",
        "skills": [],
        "module": "unknown"
      },
      "assessment": {
        "status": "initial",
        "recommendation": "high",
        "confidence": "medium",
        "modes": ["general", "integrated_strategies"],
        "sourceCount": 2,
        "reasonTags": ["account_gap_coverage"],
        "staleAfter": "2026-08-10T00:00:00Z"
      },
      "sources": [
        { "providerId": "provider-a", "url": "https://example.invalid/guide", "updatedAt": "2026-05-10T00:00:00Z" }
      ]
    }
  }
}
```

`featureTags` 的產生必須可回溯：優先使用官方結構欄位；若需解析技能描述，僅允許產出功能標籤，且要保留規則版本。描述解析失敗時寧可遺漏標籤，不可虛構標籤。

## 7. 評價與信心規則

### 7.1 評價門檻

- 相同伺服器、相容版本、至少兩個獨立 provider 都可用，才可產生 `recommendation`。
- 實裝未滿 30 天：`status = initial`，即使評價高也不得顯示為穩定結論。
- 來源不足、版本不符或超過有效期：`status = observation`，只顯示客觀功能資料。
- 來源評分差距過大：`status = contextual`，顯示「依玩法而異」，不可強制平均成單一高／低結論。

### 7.2 建議枚舉值

```text
recommendation: high | medium | low | unavailable
confidence: high | medium | low
status: stable | initial | contextual | observation | stale
```

### 7.3 過期規則

- 來源更新時間超過 90 天，或來源版本早於當前伺服器版本兩個以上主要版本，視為過期。
- 角色平衡調整、技能／模組資料變更時，該角色既有評價立即標記為 `stale`。
- 過期資料可保留供歷史查看，但前端不得以「目前推薦」語氣呈現。

## 8. 來源準入與授權

實作前必須完成 Source Feasibility Spike。每個候選來源至少檢查：

1. 有可公開、穩定、可機讀的 API／JSON／RSS 或可明確授權的資料下載方式。
2. 有角色對應、伺服器、版本或更新時間。
3. 能以穩定 ID 或受控 alias 對應官方 `char_*` ID。
4. 使用條款允許本專案所需的讀取與連結方式。
5. 不需規避登入、CAPTCHA、付費牆、robots 限制或反爬機制。

若找不到至少兩個合格來源，V1 僅實作「官方資料 + 功能標籤 + 帳號缺口」；不實作自動 Meta 推薦。

## 9. 分期計畫

### Phase 0：來源可行性驗證

- 選定 2–3 個候選來源並完成準入檢查。
- 建立 provider adapter 的介面與 10 位幹員測試樣本。
- 定義角色 ID alias 表與模式名稱映射。
- 產出通過／不通過結論；未通過即停止 Meta 路線。

### Phase 1：官方功能與培養資訊

- 以現有 GameData 擴充 `featureTags` 與投資成本呈現。
- 在角色詳情加入「培養資訊」卡。
- 提供版本與資料更新狀態。
- 不顯示「抽／不抽」結論。

### Phase 2：證據式評價快照

- 新增 Worker `guide-sync`、KV snapshot、公開 API 與同步狀態。
- 實作 provider adapter、資料驗證與第 7 節規則。
- 在角色頁顯示推薦、信心、資料狀態與來源連結。

### Phase 3：帳號缺口分析

- 整合既有使用者角色清單。
- 加入已持有角色、遊玩目標與資源預算輸入。
- 在前端用功能標籤與固定規則輸出個人化提示。

### Phase 4：選配的離線模型輔助

僅在已有合格來源與可量測品質後評估。模型只能在離線同步期將長文整理成受限 JSON，且：

- 模型輸出不可作為唯一證據。
- 必須通過 schema、GameData 事實與來源 URL 驗證。
- 模型無法確認的內容必須輸出 `unavailable`。
- 發布結果仍是靜態快照，玩家端不耗 Token。

## 10. 驗收條件

- 玩家開啟角色頁時無 AI 請求、無外部攻略即時爬取。
- 官方角色 ID、技能、模組與培養資料都可對照 GameData。
- 所有 Meta 結論都有至少兩個符合資格的來源，並包含版本與最後更新時間。
- 同步失敗或來源不可用時，API 繼續提供上一個完整快照。
- 資料不足、衝突或過期時，UI 清楚降級為觀察／功能分析。
- 任意高推薦結論可由 API 回傳的來源清單追溯。

## 11. 主要風險與決策

| 風險 | 對策 |
| --- | --- |
| 沒有合格的機讀攻略來源 | 停在 Phase 1／3，只提供客觀功能與帳號缺口。 |
| 第三方來源改版或失效 | provider adapter 隔離來源格式；同步失敗保留上一快照。 |
| 版本不同步造成誤導 | 每筆資料強制有 server、version、updatedAt 與 stale 規則。 |
| 來源授權或轉載爭議 | 只儲存最小評價摘要與連結，實作前完成準入檢查。 |
| 新角初期評價不穩 | `initial` 狀態與 30 天保守期，不顯示穩定結論。 |
| KV 最終一致性 | 使用版本化 immutable snapshot + current pointer，切換前不暴露半成品。 |

## 12. 後續實作檔案預估

| 檔案 | 預計調整 |
| --- | --- |
| `worker/index.js` | 同步工作、provider adapter、KV snapshot 與 guide API。 |
| `wrangler.toml` | 新增或調整 cron 排程。 |
| `src/services/api.js` | 讀取 guide snapshot API。 |
| `src/services/operatorGuide.js`（新增） | 前端資料快取、狀態轉換與功能標籤查詢。 |
| `src/components/CharacterDetails.vue` | 培養／自動分析卡與資料狀態 UI。 |
| `src/components/UserLibraryView.vue` | Phase 3 的持有幹員與帳號缺口入口。 |
| `src/i18n/locales/*.json` | UI 字串；來源文字不直接當成翻譯素材。 |

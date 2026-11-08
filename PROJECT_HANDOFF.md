# JMA-LIVE-MONITOR プロジェクト引継ぎ仕様書（AIモデル向け完全ハンドオフ資料）

本ドキュメントは、**「気象庁防災XML 常時ループ型ライブモニター（JMA-LIVE-MONITOR）」** の開発を別のAIモデルや開発者が引き継ぎ、即座に安全かつ正確に機能追加・改修・運用を行えるよう、アーキテクチャ、データ取得パイプライン、60fps地図描画エンジン、シーン制御ロジック、および直近の重要な設計決定を網羅した完全な引継ぎ仕様書です。

---

## 1. プロジェクト概要と設計思想

### 1.1 プロジェクトの目的
- 気象庁（JMA）の防災情報XML（PULL型）・各種公式JSON・タイルデータ、およびP2P地震情報・Wolfx API（PUSH型WebSocket / REST）を統合し、**24時間365日無人で常時巡回・緊急時即時割り込みを行う放送クオリティ（NERV防災風・ダークサイバーUI）の気象ライブモニターSPA**。
- OBS等の配信用途や常時監視スクリーンを想定し、**フレームドロップのない滑らかな60fps**、ゼロレイアウトシフト、および信頼性の高い情報更新を保証します。

### 1.2 主要機能
1. **通常巡回（ノーマルループ）**:
   - `01 雨雲・雷レーダー (radar)`: 高解像度降水ナウキャスト ＋ 雷ナウキャスト（LIDEN落雷データ重畳）の2周再生。
   - `02 全国の気象警報・注意報 (warnings)`: 令和8年新基準（57予報区分・市区町村単位）のリアルタイムコロプレスマップ。警報・特別警報発表地域への自動ズーム巡回。
   - `03 台風・低気圧進路情報 (typhoon)`: 発表中の熱帯低気圧・台風・温帯低気圧の一覧概要ブロック ➔ 各低気圧単体の予報円・進路予想タイムライン（下矢印遷移）への自動ステップ巡回。
   - `04 全国アメダス気象実況 (amedas)`: 気温・降水量・風向風速・積雪深の全国約1,300観測点データ。北から南へのカスケード出現アニメーションとズーム連動非重複間引き。
   - `05 今後の天気・週間予報 (forecast)`: 全国主要都市のピンポイント予報と概況。
   - `06 地震情報 (earthquake)`: 直近の地震履歴・震源地・各地の観測点震度表示。
2. **緊急割り込み（リアルタイム・インタラプト）**:
   - **緊急地震速報（EEW）**: 「警報」だけでなく「予報」の全報（第1報〜最終報）に対応。P波・S波の同心円リアルタイム拡大アニメーション、主要動到達秒数カウントダウン。
   - **地震発生時の自動遷移と確定待ちロック**: 地震・EEW検知時に即座に地震タブへ強制切り替え。「各地の震度に関する情報」で震源・震度が確定するまで巡回タイマーを停止・固定。
   - **津波情報**: 津波警報・注意報・予報の発表状況を沿岸ラインに色分け描画。警報時は津波画面に常時固定ロック。
   - **噴火警戒レベル変化**: 火山レベル引き上げ・噴火発生時に当該火山へ自動クローズアップ。

---

## 2. 開発・実行環境と必須ルール

### 2.1 技術スタック
- **Runtime / Package Manager**: Node.js, npm
- **Framework**: React 18 / 19, TypeScript (Strict Mode)
- **Bundler**: Vite
- **Styling**: Tailwind CSS, CSS Custom Properties (Compositorアニメーション)
- **Mapping / GIS**: Leaflet 1.9, HTML5 Canvas 2D (High-DPI / Retargeting), GeoJSON, Web Mercator (EPSG:3857) 高速射影
- **Test Runner**: Node.js Built-in Test Runner (`node:test`, `node:assert/strict`) + `tsx`

### 2.2 実行コマンド規約（Windows環境における最重要事項）
本環境は Windows 上の PowerShell で動作しています。コマンド実行時は必ず以下を遵守してください：
```powershell
# 1. 必ず Node.js の PATH を先頭に付与して実行すること
$env:Path = 'C:\Program Files\nodejs;' + $env:Path; npm run dev
$env:Path = 'C:\Program Files\nodejs;' + $env:Path; npx tsc --noEmit
$env:Path = 'C:\Program Files\nodejs;' + $env:Path; npx tsx --test src/utils/jmaParser.test.ts
$env:Path = 'C:\Program Files\nodejs;' + $env:Path; npm run build

# 2. git push はユーザーから明示的な指示（「pushして」等）があるまで勝手に行わないこと
```

---

## 3. ディレクトリ構造と主要ファイルの責務

```text
C:\Users\kuror\antigravity\JMA-LIVE-MONITOR-—-気象庁防災XML-常時ループ型ライブモニター
├── PROJECT_HANDOFF.md              # 本引継ぎ仕様書
├── public/
│   ├── japan-prefectures.geojson   # 日本全国47都道府県の標準境界データ
│   ├── world-countries.geojson     # 世界地図ベクターデータ（台風・世界表示用）
│   └── favicon.svg
├── src/
│   ├── App.tsx                     # アプリケーションルート、巡回ループ管理、WS/ポーリング制御、割り込み状態マシン
│   ├── main.tsx                    # React エントリーポイント
│   ├── index.css                   # グローバルCSS、カスタムユーティリティ、Ticker用アニメーション定義
│   ├── components/
│   │   ├── MonitorMap.tsx          # 60fpsハイブリッド地図エンジン（Leaflet + High-DPI Canvas 2D）
│   │   ├── SceneDetailPanel.tsx    # 右側情報表示パネル（シーン別カード、自動スクロール、EEWバナー、台風タイムライン）
│   │   └── XmlInspectorModal.tsx   # 設定モーダル・電文XMLインスペクター
│   ├── data/
│   │   └── fallbackData.ts         # オフライン・初期表示用フォールバックデータ、各種テスト用モックデータ
│   ├── services/
│   │   └── jmaClient.ts            # データフェッチャー（JMA XML/JSON、AMeDAS、台風、津波、地震、Wolfx、P2PQuake）
│   ├── types/
│   │   └── jma.ts                  # 全データ構造の型定義（SceneId, EarthquakeReport, EewReport, TyphoonReport 等）
│   └── utils/
│       ├── jmaParser.ts            # JMA電文・JSONパーサー、トポロジー結合、間引き、カスケード座標計算
│       ├── jmaParser.test.ts       # 単体テスト群（18テストケース、回帰テスト網羅）
│       └── eewTsunami.ts           # EEW・津波の物理伝播計算、到達時間算出、P2P/Wolfxパーサー
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 4. データソースとマルチソース通信アーキテクチャ

単一のデータ元がダウンまたは遅延しても運用を継続できるよう、多重化（冗長化）が施されています。

```mermaid
flowchart TD
    subgraph PUSH配信（低遅延リアルタイム）
        W1[Wolfx WebSocket<br/>wss://ws-api.wolfx.jp/jma_eew] -->|EEW 予報・警報 全報| PARSE_WOLFX[parseWolfxEew]
        P1[P2PQuake WebSocket<br/>wss://api.p2pquake.net/v2/ws] -->|EEW警報 code 556<br/>発表検出 code 554<br/>地震情報 code 551<br/>津波予報 code 552| PARSE_P2P[parseP2PEew / parseP2PTsunami]
    end

    subgraph 高速バックグラウンドポーリング（10秒）
        REST_FAST[pollFastEarthquakeAndEew] -->|fetchLatestLiveEew| W2[Wolfx REST + P2P 556]
        REST_FAST -->|fetchRecentEarthquakes| JMA_LIST[気象庁 bosai/quake/data/list.json]
        REST_FAST -->|fetchRecentEarthquakes| P2P_REST[P2PQuake history codes=551]
    end

    subgraph 通常定時ポーリング（1分 / 60000ms）
        REST_MAIN[refreshJmaData] -->|fetchMonitorDataBundle| ALL_JMA[気象警報・ナウキャスト・AMeDAS・台風・火山・XML]
    end

    PARSE_WOLFX --> MERGE_EEW[shouldReplaceEew / 重複排除]
    PARSE_P2P --> MERGE_EEW
    W2 --> MERGE_EEW
    MERGE_EEW -->|activeEew| APP_STATE[App.tsx State]

    JMA_LIST --> MERGE_EQ[mergeProgressiveEarthquakeReports]
    P2P_REST --> MERGE_EQ
    PARSE_P2P --> MERGE_EQ
    MERGE_EQ -->|earthquakes| APP_STATE
```

### 4.1 緊急地震速報（EEW: 予報・警報）
- **Wolfx API (`wss://ws-api.wolfx.jp/jma_eew` / `https://api.wolfx.jp/jma_eew.json`)**:
  - 気象庁が発表するすべての「緊急地震速報（予報）」および「緊急地震速報（警報）」の全報（第1報〜最終報）を取得。
  - `isWarn: false` で「予報（アンバー色）」、`isWarn: true` で「警報（赤色）」として正規化。
- **P2P地震情報 API (`wss://api.p2pquake.net/v2/ws`)**:
  - `code: 556`: 緊急地震速報（警報）の細分区域・到達予測時刻。
  - `code: 554`: 緊急地震速報 発表検出（NHKチャイム検知）。即座に解析中バナーを展開し10秒高速ポーリングをトリガー。
- **自動再接続 & 10秒高速ポーリング**:
  - WebSocketの切断時は3.5秒〜5秒で自動再接続。
  - さらに10秒間隔の `pollFastEarthquakeAndEew` が走るため、WebSocketが瞬断しても10秒以内に復帰・キャッチします。

### 4.2 地震情報（段階的進展レポートのマージ）
同一地震イベント（同一EventID）に対して気象庁は電文を順次発表します：
1. `VXSE51`（震度速報）: 最大震度と地域名のみ（震源・深さ・Mは未確定・緯度-200）
2. `VXSE52`（震源に関する情報）: 震源・深さ・Mのみ（**震度データは空**）
3. `VXSE5k` / `DetailScale`（各地の震度に関する情報 / 震源・震度情報）: 震源 ＋ 全観測点（`IntensityStation`）の震度が確定

> **重要**: `mergeProgressiveEarthquakeReports`（`src/utils/jmaParser.ts`）により、同一地震で「震源情報（震度なし）」が来ても「震度速報」の震度データを消さずに結合し、確定報（`isConfirmed === true`）が到着するまで安全に追跡します。

### 4.3 気象警報・注意報
- `https://www.jma.go.jp/bosai/warning/data/r8/map.json`（令和8年新基準、57予報区分 ＋ 市区町村単位）
- `area.json` および `xy.json` と突合し、各自治体・予報区のコードと重なり順を解決。

### 4.4 雨雲・雷レーダー
- 高解像度降水ナウキャスト (`hrpns`): `targetTimes_N1.json` 〜 `N3.json` から過去〜未来のタイルを取得。
- 雷監視システム（ライデン / `thns`）: `surf/liden/data.geojson` より落雷地点の座標と種別を取得し、Pass 2（2周目）で重畳描画。

### 4.5 アメダス（AMeDAS）
- `latest_time.txt` から最新観測時刻を取得し、全国約1,300観測点の気温、1時間降水量、風向風速、積雪深を取得。

---

## 5. 地図描画・60fps Canvasレンダリングエンジン

### 5.1 なぜLeaflet DOMマーカーではなくCanvas 2Dなのか？
- 全国930点のアメダスや数千のポリゴン、地震観測点をDOM要素（`L.marker` / `L.divIcon`）で描画すると、カメラ移動（`flyTo`）時やズーム時に大量のリフロー（Reflow / Style Recalculation）が発生し、フレームレートが15〜20fpsまで低下します。
- そのため、**ベクターポリゴン・アメダス点・地震観測点・台風予報円はすべて `interactiveCanvasRef`（Retina / DPR対応の透過Canvas）上に毎フレーム純粋描画（60fps）** しています。

### 5.2 描画パイプライン（MonitorMap.tsx）
1. **ベースマップ（`baseMapCanvasRef` / z-index: 5）**:
   - 日本列島・世界地図・警報注意報の塗りつぶし（コロプレス）を担当。
   - 事前コンパイル済みの正規化メルカトル座標（`Float64Array`）を使用。
   - LOD（Level of Detail）判定により、広域表示時は間引きされた軽量リングを描画。
2. **レーダータイルレイヤー（`radarPane` / z-index: 450）**:
   - Leafletの `createJmaSeamlessNowcastLayer` により降水ナウキャストをシームレス重畳。
   - 次フレームのタイルを裏で先行プリロード（opacity: 0）し、フレーム切り替え時の白飛び・再ダウンロードを防止。
3. **インタラクティブオーバーレイ（`interactiveCanvasRef` / z-index: 390）**:
   - **アメダス実況**:
     - ズームレベルに応じて `selectNonOverlappingAmedasStations` で非重複点をO(N)で抽出し描画。
     - シーン開始時、北から南へ緯度順に波打つように出現するカスケードアニメーション（`entering` ➔ `steady` ➔ `exiting` ➔ `transitioning`）。
   - **台風進路図**:
     - 過去軌跡（実況線）、予報円包絡線（ファン状コーン）、暴風域・強風域円、中心バツ印（✕）、日時バッジをベクター描画。
     - 単体低気圧モード時は選択された低気圧のみを描画し、中心へクローズアップ。
   - **地震・EEW**:
     - EEW発表時はP波（青破線）・S波（赤半透明塗り）の同心円を物理速度（P: 6.0km/s, S: 3.5km/s）から実時間アニメーション。
     - 震度観測点バッジは震度順（降順）に重なり判定を行い、高い震度が最前面に来るよう描画。

---

## 6. シーン制御と状態マシン（App.tsx ＆ SceneDetailPanel.tsx）

### 6.1 シーン遷移フロー
```text
通常巡回:
  [radar (2Pass)]
    ↓
  [warnings (全国表示 ➔ 警報/特別警報地域ズーム ➔ 全国復帰)]
    ↓
  [typhoon (一覧概要 ➔ 各低気圧単体フォーカス×M ➔ 一覧復帰)]
    ↓
  [amedas (気温 ➔ 降水量 ➔ 風速 ➔ 積雪深)]
    ↓
  [forecast (全国主要都市予報)]
    ↓
  [earthquake (直近地震情報)]
    ↓
  (radar へループ)
```

### 6.2 自動スクロール制御（SceneDetailPanel.tsx）
- 右パネルの情報が画面縦幅（Viewport）に収まらない場合、上部で数秒静止したあと、VSync同期の `requestAnimationFrame`（72px/s）で下端まで自動スクロールします。
- スクロールが下端に達すると一定時間ホールドされ、完了通知（`onSceneComplete`）が発火して次のシーンへ安全に進みます。
- 短いリストであっても最低表示時間（`minSceneDurationMs` / 通常10〜15秒）が保証されており、一瞬で画面が切り替わることはありません。

### 6.3 確定待ちロック（Earthquake Confirm Lock）
- **動作契機**:
  - 新規EEWを受信した時
  - 直近15分以内に発生した未確定地震（`issueTypeLabel === '震度速報'` や `hypocenterUnknown === true`）を受信した時
- **挙動**:
  - `eqLockUntilConfirmedRef.current = true` となり、**通常巡回タイマー（`advanceScene`）が完全にブロック**されます。
  - 右パネルには「`最終震度・震源の確定まで地震タブ固定中（自動取得中）`」の点滅ステータスバーが表示されます。
  - 気象庁から「各地の震度に関する情報（`DetailScale`）」が届き、震源と全観測点震度が確定すると `isConfirmed = true` となり、緑色の「`✓ 震源・各地の震度 確定`」バッジに変化します。
  - 確定後、ユーザーが内容を確認できるよう**60秒間その場を維持**した後にロックを解除し、通常巡回へ復帰します。

---

## 7. 直近で解決された課題と重要な実装ノウハウ（Gotchas）

後任のAIモデルが改修を行う際、再発させないための重要知見です：

### ① 新潟県北部（村上市など）の波浪警報が消える問題
- **原因**: 以前は `dissolveGeoJsonByGroup` で複数ポリゴンの外枠をトポロジー結合していたが、気象庁の生ベクターデータで本土海岸線のリングが完全に閉じていない（Unclosed ring）データが存在し、結合時にポリゴンごと破棄されていた。
- **解決策**: 警報の塗りつぶしは結合処理を通さず、各ポリゴンを直接 `class20CompiledRef` から純粋にバッチ塗りつぶすアーキテクチャに変更済み。

### ② カメラ移動（flyTo）時の北端島嶼部（粟島など）クリッピング
- **原因**: 広域表示時に極小の島が画面描画負荷軽減用のバウンディングボックスカリングで誤判定されていた。
- **解決策**: スパン判定のしきい値と正規化メルカトル境界計算を最適化済み。

### ③ 警報（赤）の周りから注意報（黄）のフチがはみ出る問題
- **原因**: 都道府県ポリゴン全体を注意報黄色で下塗りした上に、市区町村警報の赤ポリゴンを重ねていたため、境界線アンチエイリアス部分で黄色が滲み出ていた。
- **解決策**: 注意報自治体と警報自治体を厳密に排他的（Exclusive）に塗り分けるよう修正済み。

### ④ 台風情報UIの折り返しと文字レイアウト
- **仕様**:
  - 赤色の角丸ブロックバッジ（「台風」「熱帯低気圧」）はテキスト圧迫のため削除。
  - 中心気圧（`1002 hPa`）や最大風速（`18 m/s`）の数値を大きく強調（`text-2xl font-black`）。
  - 最大瞬間風速は最大風速の真下に改行配置（`max-w-[120px]` で見切れ防止）。
  - 単体フォーカス時は下矢印（`↓`）で時系列の予想を接続。

### ⑤ `edit_file` 使用時の注意点（CRLF/LF・重複ターゲット）
- `src/data/fallbackData.ts` や `src/App.tsx` 等で、共通の閉じ括弧（`},\n],\n};` 等）をターゲットに指定すると「Multiple matches found」で失敗します。置換時は必ず前後の固有プロパティ名を含めたユニークなブロックを指定してください。

---

## 8. テストおよび検証手順

コードを変更した際は、必ず以下の検証コマンドを実行して健全性を確認してください：

```powershell
# 1. TypeScript型検査（エラー0件を確認）
$env:Path = 'C:\Program Files\nodejs;' + $env:Path; npx tsc --noEmit

# 2. 単体テスト実行（18テストすべてPASSすることを確認）
$env:Path = 'C:\Program Files\nodejs;' + $env:Path; npx tsx --test src/utils/jmaParser.test.ts

# 3. 本番ビルド検証（Viteビルドが正常終了することを確認）
$env:Path = 'C:\Program Files\nodejs;' + $env:Path; npm run build
```

---

## 9. 将来の拡張ポイント・推奨改修事項
- **津波警報時の沿岸色分け強化**:
  - 大津波警報（紫）、津波警報（赤）、津波注意報（黄）の線幅および点滅アニメーションのさらなる強調。
- **AMeDAS極値検出通知**:
  - 全国最高気温（猛暑日）や最大瞬間風速の歴代記録更新時のティッカーハイライト。
- **音声合成（TTS）読み上げ機能**:
  - EEW発表時や特別警報発令時にWeb Speech APIを利用した自動音声速報の追加。

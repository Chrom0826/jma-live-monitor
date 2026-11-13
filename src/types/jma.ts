export type SceneId =
  | 'radar'
  | 'warnings'
  | 'typhoon'
  | 'weather_info'
  | 'amedas'
  | 'volcano'
  | 'tsunami'
  | 'forecast'
  | 'earthquake';

export type RegionId =
  | 'world'
  | 'national'
  | 'hokkaido'
  | 'tohoku'
  | 'kanto'
  | 'chubu'
  | 'kinki'
  | 'chugoku_shikoku'
  | 'kyushu'
  | 'okinawa';

export interface RegionConfig {
  id: RegionId;
  name: string;
  enName: string;
  center: [number, number];
  zoom: number;
  jmaOfficeCodes: string[];
}

export interface SceneMetadata {
  id: SceneId;
  index: string;
  shortLabel: string;
  title: string;
  subtitle: string;
  xmlSource: string;
  isInterruptOnly?: boolean;
}

export type XmlFeedType = 'regular' | 'extra' | 'eqvol';

export interface JmaXmlEntry {
  id: string;
  title: string;
  updated: string;
  author: string;
  link: string;
  content: string;
  feedType: XmlFeedType;
  category: SceneId;
}

export interface NowcastTimeEntry {
  basetime: string;
  validtime: string;
  label: string;
  isForecast: boolean;
  thnsBasetime?: string;
  thnsValidtime?: string;
}

export interface LightningPoint {
  id: string;
  lat: number;
  lon: number;
  timeJst: string;
  type: number;
  validtime?: string;
}

/** special=レベル5 特別警報, danger=レベル4 危険警報, warning=レベル3 警報, advisory=レベル2 注意報 */
export type WarningSeverity = 'special' | 'danger' | 'warning' | 'advisory' | 'normal';

export interface WarningBadgeItem {
  code: string;
  name: string;
  severity: WarningSeverity;
}

export interface RegionalWarningItem {
  id: string;
  prefId: number;
  prefecture: string;
  regionId: RegionId;
  areaName: string;
  lat: number;
  lon: number;
  zoom?: number;
  divisionCode?: string;
  muniCode?: string;
  severity: WarningSeverity;
  activeWarnings: string[];
  badgeItems: WarningBadgeItem[];
  updatedAt: string;
  office: string;
  headline: string;
  isMunicipality?: boolean;
}

export interface MapViewportState {
  zoom: number;
  center: [number, number];
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  inferredRegionId: RegionId;
}

export interface TyphoonTrackPoint {
  partLabel: string; // e.g. '実況', '12時間後 (6日09時)'
  timeLabel: string; // e.g. '5日21時 実況', '6日09時 予報'
  advancedHours: number; // 0 for current analysis, >0 for forecast
  isForecast: boolean;
  categoryJp: string; // '台風', '熱帯低気圧', '温帯低気圧'
  intensity: string; // '強い', '非常に強い', '猛烈な', '-'
  scale: string; // '大型', '超大型', '-'
  lat: number;
  lon: number;
  pressureHpa: number;
  maxWindMs: number;
  maxGustMs: number;
  course: string; // e.g. '北東'
  speedKmh: number; // e.g. 55
  location: string; // e.g. '日本の東'
  probabilityCircleRadiusKm: number; // 0 for analysis, >0 for forecast
  galeRadiusKm: number; // 強風域 (15m/s以上)
  stormRadiusKm: number; // 暴風域 (25m/s以上)
}

export interface TyphoonReport {
  id: string; // e.g. 'TC2637'
  typhoonNumber: string; // e.g. '2631' -> 台風第31号
  displayNumber: string; // e.g. '台風第31号'
  nameJp: string; // e.g. 'インファ'
  nameEn: string; // e.g. 'In-fa'
  categoryJp: string;
  issueTimeJst: string; // e.g. '11月5日 21:45 発表'
  isLiveJma: boolean;
  isTest?: boolean;
  lastSeenMs?: number;
  pastTrack?: Array<[number, number]>;
  points: TyphoonTrackPoint[];
}

export interface WeatherBulletinItem {
  id: string;
  title: string;
  office: string;
  regionId: RegionId;
  updatedAt: string;
  headline: string;
  bodyText: string;
  category: 'heavy_rain' | 'typhoon' | 'wind_gust' | 'landslide' | 'general';
  lat: number;
  lon: number;
}

export type AmedasMetric = 'temp' | 'precip' | 'wind' | 'snow';

export interface AmedasStationData {
  id: string;
  stationName: string;
  prefecture: string;
  regionId: RegionId;
  lat: number;
  lon: number;
  temp: number;
  hasTemp?: boolean;
  precip1h: number;
  windSpeed: number;
  windDirection: string;
  humidity: number;
  snowCm?: number;
  observedAt: string;
}

export interface VolcanoStatusItem {
  id: string;
  name: string;
  regionId: RegionId;
  prefecture: string;
  lat: number;
  lon: number;
  alertLevel: 1 | 2 | 3 | 4 | 5;
  previousLevel?: 1 | 2 | 3 | 4 | 5;
  levelChanged?: boolean;
  levelLabel: string;
  headline: string;
  lastUpdated: string;
  ashForecast: string;
  office: string;
}

export interface TsunamiStationItem {
  id: string;
  areaName: string;
  stationName: string;
  regionId: RegionId;
  lat: number;
  lon: number;
  status: 'none' | 'forecast' | 'advisory' | 'warning' | 'major_warning';
  statusLabel: string;
  maxHeightText: string;
  tideLevelM: number;
  anomalyMeters?: number;
  isAbnormal?: boolean;
  trend: 'rising' | 'falling' | 'steady';
  updatedAt: string;
}

export type ForecastViewMode = 'today_3h' | 'tomorrow' | 'day_after';

export interface Forecast3HourlySlot {
  /** 3時間ごとの時刻ラベル（例: '03時', '06時', '09時', '12時', '15時', '18時', '21時', '24時'） */
  timeLabel: string;
  /** 時刻（3, 6, 9, 12, 15, 18, 21, 24） */
  hour: number;
  /** 気象庁天気コード（例: '100', '200', '300', '400'） */
  weatherCode: string;
  /** 天気テキスト（例: '晴', '曇', '雨', '雪'） */
  weatherText: string;
  /** その時刻の予想気温（℃） */
  temp: number;
  /** 降水確率（%） */
  pop: number;
}

export interface CityForecastItem {
  id: string;
  cityName: string;
  prefecture: string;
  regionId: RegionId;
  lat: number;
  lon: number;
  todayWeather: string;
  tomorrowWeather: string;
  dayAfterWeather: string;
  todayWeatherCode?: string;
  tomorrowWeatherCode?: string;
  dayAfterWeatherCode?: string;
  tempMin: number;
  tempMax: number;
  todayTempMin?: number;
  todayTempMax?: number;
  tomorrowTempMin?: number;
  tomorrowTempMax?: number;
  dayAfterTempMin?: number;
  dayAfterTempMax?: number;
  todayDateLabel?: string;
  tomorrowDateLabel?: string;
  dayAfterDateLabel?: string;
  pops: [number, number, number, number];
  tomorrowPop?: number;
  dayAfterPop?: number;
  hourly3h?: Forecast3HourlySlot[];
  overviewText: string;
  updatedAt: string;
  office: string;
}

export interface EarthquakeStationIntensity {
  prefecture: string;
  city: string;
  stationName: string;
  scaleCode: number;
  scaleLabel: string;
  lat?: number;
  lon?: number;
}

export interface EarthquakeReport {
  id: string;
  issueTime: string;
  occurrenceTime: string;
  hypocenterName: string;
  regionId: RegionId;
  lat: number;
  lon: number;
  depthKm: number;
  magnitude: number;
  maxScaleCode: number;
  maxScaleLabel: string;
  domesticTsunami: string;
  foreignTsunami: string;
  sourceOffice: string;
  isTest?: boolean;
  /** P2P地震情報 issue.type の日本語ラベル（震度速報 / 震源に関する情報 / 各地の震度に関する情報 など） */
  issueTypeLabel?: string;
  /** 震度速報など震源未確定（hypocenter.latitude = -200）の場合 true */
  hypocenterUnknown?: boolean;
  /** 震源および各地の震度が確定した最終報（各地の震度に関する情報 / 震源・震度に関する情報）かどうか */
  isConfirmed?: boolean;
  /** 同一地震IDで震度速報→震源情報→各地の震度へ更新されたことを検知する署名キー */
  reportKey?: string;
  /** 気象庁震度細分区域コード（100, 704等）ごとの最大観測震度 */
  areaMaxScales?: Record<string, { scaleCode: number; scaleLabel: string; name?: string }>;
  /** 市区町村コード（3520300等）ごとの最大観測震度（拡大時に使用） */
  cityMaxScales?: Record<string, number>;
  stations: EarthquakeStationIntensity[];
}

/** P2P地震情報 code 556（緊急地震速報（警報））の細分区域ごとの予測震度・長周期地震動 */
export interface EewForecastArea {
  pref: string;
  name: string;
  /** 最大予測震度の下限（10倍値: 45=5弱, -1=不明） */
  scaleFrom: number;
  /** 最大予測震度の上限（10倍値: 99=～程度以上） */
  scaleTo: number;
  /** 10: 主要動未到達と予測 / 11: 既に到達と予測 / 19: PLUM法（到達予想なし） */
  kindCode: string;
  /** 主要動の到達予測時刻（JST "YYYY/MM/DD HH:mm:ss"）。到達済み・PLUM法の場合 null */
  arrivalTime: string | null;
  /** 長周期地震動予測階級（0: 階級0, 1: 階級1, 2: 階級2, 3: 階級3, 4: 階級4） */
  lpgmClass?: 0 | 1 | 2 | 3 | 4;
}

/** 緊急地震速報の表示モード: 震度予測 vs 長周期地震動階級 */
export type EewDisplayMode = 'intensity' | 'lpgm';

/** 緊急地震速報（警報: P2P code 556 / 予報・警報: Wolfx jma_eew）を正規化したレポート（第n報） */
export interface EewReport {
  id: string;
  eventId: string;
  /** 情報番号（第n報） */
  serial: number;
  issueTime: string;
  originTime: string;
  hypocenterName: string;
  lat: number;
  lon: number;
  depthKm: number;
  magnitude: number;
  isCancelled: boolean;
  isTest: boolean;
  /** 仮定震源要素（PLUM法等で震源が仮定されている） */
  isAssumedHypocenter: boolean;
  /** 全区域の最大予測震度（scaleTo の最大値、99 の場合は scaleFrom を採用） */
  maxScaleCode: number;
  maxScaleLabel: string;
  /** 長周期地震動 最大予測階級（0〜4） */
  maxLpgmClass?: 0 | 1 | 2 | 3 | 4;
  /** 長周期地震動 最大予測階級ラベル（階級1〜階級4） */
  maxLpgmLabel?: string;
  areas: EewForecastArea[];
  receivedAtMs: number;
  isDemo?: boolean;
  /**
   * 緊急地震速報（警報）を含むか。false = 緊急地震速報（予報）のみ。
   * 未指定は警報扱い（P2P code 556 / デモ）。同一イベントで一度警報になれば以降も警報扱い。
   */
  isWarning?: boolean;
  /** 最終報か（Wolfx isFinal）。未指定時は従来どおり serial >= 5 で推定（isEewFinal） */
  isFinal?: boolean;
  /** 受信元 */
  source?: 'p2p' | 'wolfx' | 'demo';
}

export type TsunamiGrade =
  | 'MajorWarning'
  | 'Warning'
  | 'Watch'
  | 'Forecast'
  | 'Unknown';

export interface TsunamiForecastArea {
  /** 気象庁 津波予報区コード（tsunami.json の properties.code） */
  code?: string;
  name: string;
  grade: TsunamiGrade;
  immediate: boolean;
  /** 第1波の到達予想（時刻 or 状態「津波到達中と推測」等） */
  firstHeightText: string;
  arrivalTime?: string;
  /** 予想される津波の高さ（「３ｍ」「巨大」「0.2m未満」等） */
  maxHeightText: string;
  maxHeightValue?: number;
}

export interface TsunamiForecastReport {
  id: string;
  issueTime: string;
  validUntil?: string;
  cancelled: boolean;
  source: 'p2p' | 'jma' | 'demo';
  hypocenterName?: string;
  magnitude?: number;
  lat?: number;
  lon?: number;
  depthKm?: number;
  maxScaleLabel?: string;
  occurrenceTime?: string;
  headline?: string;
  areas: TsunamiForecastArea[];
}

export type InterruptKind =
  | 'none'
  | 'earthquake'
  | 'eew'
  | 'volcano'
  | 'tsunami'
  | 'typhoon';

export interface MonitorDataBundle {
  xmlEntries: JmaXmlEntry[];
  nowcastTimes: NowcastTimeEntry[];
  lightningPoints: LightningPoint[];
  warnings: RegionalWarningItem[];
  municipalityWarnings?: RegionalWarningItem[];
  muniSeverityMap?: Record<string, WarningSeverity>;
  prefSeverityMap: Record<number, WarningSeverity>;
  /** 気象警報・注意報（Ｒ０６）（集約通報）VPWS50 から抽出した57地域ごとの発表種別一覧 */
  vpws50Summaries?: Record<string, string[]>;
  vpws50Updated?: string;
  typhoons: TyphoonReport[];
  bulletins: WeatherBulletinItem[];
  amedas: AmedasStationData[];
  volcanoes: VolcanoStatusItem[];
  tsunamiStations: TsunamiStationItem[];
  /** 現在発表中の津波警報・注意報・予報（P2P code 552 / 気象庁 bosai tsunami）。発表なしは null */
  tsunamiForecast?: TsunamiForecastReport | null;
  forecasts: CityForecastItem[];
  earthquakes: EarthquakeReport[];
  lastXmlFetchTime: string;
  dataSourceStatus: {
    jmaXmlLive: boolean;
    jmaBosaiLive: boolean;
    p2pQuakeLive: boolean;
  };
}

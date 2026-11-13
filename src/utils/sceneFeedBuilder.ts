import {
  AmedasMetric,
  AmedasStationData,
  CityForecastItem,
  EarthquakeReport,
  EewReport,
  JmaXmlEntry,
  MonitorDataBundle,
  RegionalWarningItem,
  SceneId,
  TsunamiForecastArea,
  TyphoonReport,
  VolcanoStatusItem,
} from '../types/jma';
import {
  computeAmedasTop5Rankings,
  extractJmaXmlDataCode,
  extractJmaXmlOfficeCode,
  isDeprecatedWarningXmlEntry,
  isR06WarningXmlEntry,
  isWarningOrAbove,
  isWeatherCommentaryXmlEntry,
  resolveWarningDivision,
} from './jmaParser';
import {
  formatEewArrivalLabel,
  formatEewScaleRange,
  getTsunamiAlertSeverity,
  getTsunamiHighestGrade,
  isEewFinal,
  isEewSpecialWarning,
  isEewStillActive,
  isEewWarning,
  isTsunamiForecastActive,
  parseJstDateTimeMs,
} from './eewTsunami';

export const WEATHER_COMMENTARY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const WEATHER_COMMENTARY_EMPTY_MESSAGE =
  '24時間以内に気象解説情報は発表されていません';

export interface SceneFeedItem {
  prefix?: string;
  text: string;
  sourceTitle?: string;
  sourceTime?: string;
}

export interface SceneFeedData {
  sceneId: SceneId;
  badgeLabel: string;
  badgeSub: string;
  title: string;
  timeLabel: string;
  accentColor: string;
  items: SceneFeedItem[];
  textKey: string;
}

export interface BuildSceneFeedOptions {
  effectiveScene: SceneId;
  data: MonitorDataBundle;
  activeEew: EewReport | null;
  selectedEarthquake: EarthquakeReport | null;
  pinnedEarthquakeId: string | null;
  activeWarningDivision: RegionalWarningItem | null;
  selectedTyphoon?: TyphoonReport | null;
  activeVolcano: VolcanoStatusItem | null;
  amedasMetric: AmedasMetric;
  currentTime?: string;
  nowMs?: number;
}

function formatXmlUpdatedJst(updatedIso: string, fallback: string): string {
  const ms = Date.parse(updatedIso);
  if (!Number.isFinite(ms)) return fallback;
  const jst = new Date(ms + 9 * 3600 * 1000);
  const hh = String(jst.getUTCHours()).padStart(2, '0');
  const mm = String(jst.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm} 発表`;
}

/**
 * Evaluates whether a finished horizontal bottom-bar scroll pass should transition
 * to the next scene/step or continue streaming the next feed item until `minDurationSec` elapses.
 */
export function evaluateTickerPassEnd(options: {
  isDriverScene: boolean;
  isPausedOrInterrupted: boolean;
  activeElapsedMs: number;
  minDurationSec: number;
  currentPassIndex: number;
  itemCount: number;
}): { shouldSignalComplete: boolean; nextPassIndex: number } {
  const {
    isDriverScene,
    isPausedOrInterrupted,
    activeElapsedMs,
    minDurationSec,
    currentPassIndex,
  } = options;
  const requiredMs = Math.max(1000, minDurationSec * 1000);
  const shouldSignalComplete =
    isDriverScene && !isPausedOrInterrupted && activeElapsedMs >= requiredMs;
  return {
    shouldSignalComplete,
    nextPassIndex: currentPassIndex + 1,
  };
}

/**
 * Selects active meteorological commentary entries (`VPZJ51`, `VPCJ51`, `VPFJ51`)
 * issued within `maxAgeMs` (default 24h), sorted newest-first and deduplicated per topic/office.
 */
export function selectActiveWeatherCommentaryEntries(
  xmlEntries: JmaXmlEntry[],
  nowMs: number = Date.now(),
  maxAgeMs: number = WEATHER_COMMENTARY_MAX_AGE_MS
): JmaXmlEntry[] {
  const cutoffMs = nowMs - maxAgeMs;
  const candidates = xmlEntries
    .filter((entry) => {
      if (isDeprecatedWarningXmlEntry(entry)) return false;
      if (!isWeatherCommentaryXmlEntry(entry)) return false;
      const ms = Date.parse(entry.updated);
      if (!Number.isFinite(ms)) return false;
      return ms >= cutoffMs;
    })
    .sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated));

  const seenTopics = new Set<string>();
  const deduped: JmaXmlEntry[] = [];
  for (const entry of candidates) {
    const code = extractJmaXmlDataCode(entry) || entry.title;
    const office = extractJmaXmlOfficeCode(entry) || entry.author || '';
    const bracketMatch = /^【([^】]+)】/.exec(entry.content.trim());
    const topicLabel = bracketMatch
      ? bracketMatch[1]
      : entry.content.trim().slice(0, 24);
    const key = `${code}|${office}|${topicLabel}`;
    if (seenTopics.has(key)) continue;
    seenTopics.add(key);
    deduped.push(entry);
  }
  return deduped;
}

function doesWarningEntryMatchDivision(
  entry: JmaXmlEntry,
  division: RegionalWarningItem
): boolean {
  const divCode = division.divisionCode || '';
  const officeCode = extractJmaXmlOfficeCode(entry);
  if (officeCode && divCode) {
    const resolved = resolveWarningDivision(officeCode);
    if (resolved?.code === divCode) {
      if (divCode === '471000' && entry.content.includes('大東島')) {
        return false;
      }
      return true;
    }
    if (divCode === '460040' && officeCode === '460100') {
      return entry.content.includes('奄美');
    }
    if (divCode === '472000' && officeCode === '471000') {
      return entry.content.includes('大東島');
    }
    if (
      division.prefId >= 2 &&
      division.prefId <= 45 &&
      officeCode.slice(0, 2) === divCode.slice(0, 2)
    ) {
      return true;
    }
    return false;
  }

  const hay = `${entry.content} ${entry.author}`;
  if (division.areaName && hay.includes(division.areaName)) return true;
  if (division.prefecture && hay.includes(division.prefecture)) return true;
  return false;
}

/**
 * Selects active R06 warning XML entries (`VPWW55`..`VPWW61`) for a zoomed-in warning division,
 * strictly excluding deprecated `VPWW50`, `VPWW53`, and `VPWW54`, and filtering out lifted notices.
 */
export function selectDivisionR06WarningEntries(
  xmlEntries: JmaXmlEntry[],
  division: RegionalWarningItem
): JmaXmlEntry[] {
  const candidates = xmlEntries
    .filter(
      (entry) =>
        isR06WarningXmlEntry(entry, { includeAggregate: false }) &&
        doesWarningEntryMatchDivision(entry, division)
    )
    .sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated));

  const latestPerKind = new Map<string, JmaXmlEntry>();
  for (const entry of candidates) {
    const code = extractJmaXmlDataCode(entry) || entry.title;
    const office = extractJmaXmlOfficeCode(entry) || entry.author || '';
    const key = `${office}|${code}`;
    if (!latestPerKind.has(key)) {
      latestPerKind.set(key, entry);
    }
  }

  return Array.from(latestPerKind.values())
    .filter((entry) => !entry.content.includes('解除します'))
    .sort((a, b) => {
      const aSevere =
        a.content.includes('特別警報') ||
        a.content.includes('危険警報') ||
        a.content.includes('警報')
          ? 0
          : 1;
      const bSevere =
        b.content.includes('特別警報') ||
        b.content.includes('危険警報') ||
        b.content.includes('警報')
          ? 0
          : 1;
      if (aSevere !== bSevere) return aSevere - bSevere;
      return Date.parse(b.updated) - Date.parse(a.updated);
    });
}

/**
 * Extracts a leading JMA bracketed headline (`【...】`) into `headline`
 * and returns the remaining body text without `【】` wrappers.
 */
export function splitJmaBracketHeadline(
  content: string,
  fallbackTitle: string
): { headline: string; body: string } {
  const trimmed = content.trim();
  const match = /^【([^】]+)】\s*(.*)$/s.exec(trimmed);
  if (match) {
    const innerHeadline = match[1].trim();
    const rest = match[2].trim();
    return {
      headline: innerHeadline || fallbackTitle,
      body: rest || innerHeadline || trimmed,
    };
  }
  return {
    headline: fallbackTitle,
    body: trimmed,
  };
}

function buildSharedCommentaryResult(
  sceneId: 'radar' | 'warnings',
  xmlEntries: JmaXmlEntry[],
  nowMs: number,
  defaultTimeLabel: string,
  options: {
    badgeLabel: string;
    badgeSub: string;
    accentColor: string;
    defaultTitle: string;
  }
): SceneFeedData {
  const commentaryXmls = selectActiveWeatherCommentaryEntries(xmlEntries, nowMs);

  const items: SceneFeedItem[] =
    commentaryXmls.length > 0
      ? commentaryXmls.map((entry) => {
          const { headline, body } = splitJmaBracketHeadline(
            entry.content,
            entry.title
          );
          return {
            text: body,
            sourceTitle: headline,
            sourceTime: formatXmlUpdatedJst(entry.updated, defaultTimeLabel),
          };
        })
      : [{ text: WEATHER_COMMENTARY_EMPTY_MESSAGE }];

  const title = items[0]?.sourceTitle || options.defaultTitle;
  const timeLabel =
    commentaryXmls.length > 0
      ? formatXmlUpdatedJst(commentaryXmls[0].updated, defaultTimeLabel)
      : defaultTimeLabel;

  return {
    sceneId,
    badgeLabel: options.badgeLabel,
    badgeSub: options.badgeSub,
    title,
    timeLabel,
    accentColor: options.accentColor,
    items,
    textKey: `${sceneId}-commentary-${commentaryXmls.map((e) => e.id).join('-') || 'none'}`,
  };
}

/**
 * Builds real-time broadcast-grade ticker feed customized specifically to the currently active scene (Pattern B).
 */
export function buildSceneFeed(options: BuildSceneFeedOptions): SceneFeedData {
  const {
    effectiveScene,
    data,
    activeEew,
    selectedEarthquake,
    pinnedEarthquakeId,
    activeWarningDivision,
    selectedTyphoon,
    activeVolcano,
    amedasMetric,
    currentTime = '',
    nowMs = Date.now(),
  } = options;

  const defaultTimeLabel = data.lastXmlFetchTime
    ? `${data.lastXmlFetchTime} 更新`
    : currentTime
      ? `${currentTime} 更新`
      : '最新情報';

  // ==================== 1. EARTHQUAKE SCENE ====================
  if (effectiveScene === 'earthquake') {
    // 1a. Active EEW (緊急地震速報 特別警報・警報・予報)
    if (activeEew && isEewStillActive(activeEew)) {
      const isSpecial = isEewSpecialWarning(activeEew);
      const isWarn = isEewWarning(activeEew);
      const isFin = isEewFinal(activeEew);
      const accentColor = isSpecial ? '#9333EA' : isWarn ? '#EF4444' : '#F59E0B';
      const kindLabel = isSpecial ? '特別警報' : isWarn ? '警報' : '予報';
      const badgeLabel = `緊急地震速報（${kindLabel}）`;
      const badgeSub = `第${activeEew.serial}報${isFin ? '・最終報' : ''}`;
      const title = `緊急地震速報（${kindLabel}） 第${activeEew.serial}報 - ${activeEew.hypocenterName || '震源調査中'}`;
      const timeLabel = activeEew.originTime || activeEew.issueTime || defaultTimeLabel;

      const items: SceneFeedItem[] = [];
      items.push({
        prefix: '【震源・規模】',
        text: `震源: ${activeEew.hypocenterName} 深さ約${activeEew.depthKm >= 0 ? activeEew.depthKm + 'km' : '不明'} 規模 M${activeEew.magnitude > 0 ? activeEew.magnitude.toFixed(1) : '不明'} 最大予測震度: ${activeEew.maxScaleLabel}。強い揺れに警戒してください。`,
      });

      if (activeEew.areas && activeEew.areas.length > 0) {
        const areaStr = activeEew.areas
          .slice(0, 10)
          .map((a) => `${a.name}(震度${formatEewScaleRange(a.scaleFrom, a.scaleTo)} / ${formatEewArrivalLabel(a)})`)
          .join('、');
        items.push({
          prefix: '【強い揺れの予想地域】',
          text: `${areaStr}${activeEew.areas.length > 10 ? ` ほか計${activeEew.areas.length}地域` : ''}`,
        });
      }

      if (activeEew.maxLpgmClass && activeEew.maxLpgmClass > 0) {
        items.push({
          prefix: '【長周期地震動】',
          text: `最大予測階級: ${activeEew.maxLpgmLabel || `階級${activeEew.maxLpgmClass}`}。高層ビル等では大きな揺れに注意してください。`,
        });
      }

      return {
        sceneId: 'earthquake',
        badgeLabel,
        badgeSub,
        title,
        timeLabel,
        accentColor,
        items,
        textKey: `eew-${activeEew.id}-${activeEew.serial}-${items.length}`,
      };
    }

    // 1b. Regular Earthquake Scene (View selected/pinned or latest earthquake)
    const targetQuake: EarthquakeReport | undefined =
      (pinnedEarthquakeId
        ? data.earthquakes.find((e) => e.id === pinnedEarthquakeId)
        : selectedEarthquake) || data.earthquakes[0];

    if (targetQuake) {
      const maxScale = targetQuake.maxScaleCode || 0;
      const accentColor =
        maxScale >= 50 ? '#EF4444' : maxScale >= 40 ? '#F59E0B' : '#38BDF8';
      const badgeLabel = '地震情報';
      const badgeSub = pinnedEarthquakeId ? '固定選択中' : '震源・各地の震度';
      const title = `${targetQuake.issueTypeLabel || '震源・震度に関する情報'}（${targetQuake.hypocenterName} 最大震度${targetQuake.maxScaleLabel}）`;
      const timeLabel = targetQuake.occurrenceTime || targetQuake.issueTime || defaultTimeLabel;

      const items: SceneFeedItem[] = [];

      // Main Quake Summary
      const depthStr =
        targetQuake.depthKm >= 0 ? `約${targetQuake.depthKm}km` : 'ごく浅い';
      const magStr =
        targetQuake.magnitude >= 0
          ? `M${targetQuake.magnitude.toFixed(1)}`
          : '不明';
      const latStr =
        typeof targetQuake.lat === 'number' && !Number.isNaN(targetQuake.lat) && targetQuake.lat > -90
          ? `北緯${targetQuake.lat.toFixed(1)}度`
          : '';
      const lonStr =
        typeof targetQuake.lon === 'number' && !Number.isNaN(targetQuake.lon) && targetQuake.lon > -180
          ? `東経${targetQuake.lon.toFixed(1)}度`
          : '';
      const coordStr = latStr && lonStr ? `（${latStr}、${lonStr}）` : '';
      const tsunamiStr =
        targetQuake.domesticTsunami || 'この地震による津波の心配はありません。';

      items.push({
        prefix: '【発生概要】',
        text: `${targetQuake.occurrenceTime || targetQuake.issueTime}ころ、${targetQuake.hypocenterName}を震源とする地震がありました。震源の深さは${depthStr}、規模は${magStr}${coordStr}。最大震度${targetQuake.maxScaleLabel}を観測しました。${tsunamiStr}`,
      });

      // Intensity stations breakdown
      if (targetQuake.stations && targetQuake.stations.length > 0) {
        const byScale = new Map<string, string[]>();
        for (const st of targetQuake.stations) {
          const sc = st.scaleLabel || '不明';
          if (!byScale.has(sc)) byScale.set(sc, []);
          const list = byScale.get(sc)!;
          if (list.length < 8) list.push(st.stationName);
        }
        const stationParts: string[] = [];
        for (const [sc, stList] of byScale.entries()) {
          stationParts.push(`[震度${sc}] ${stList.join('、')}`);
        }
        if (stationParts.length > 0) {
          items.push({
            prefix: '【各地の震度】',
            text: stationParts.slice(0, 4).join(' ｜ '),
          });
        }
      } else if (targetQuake.areaMaxScales) {
        const areaParts = Object.entries(targetQuake.areaMaxScales)
          .slice(0, 8)
          .map(([name, s]) => `${name}: 震度${s.scaleLabel}`);
        if (areaParts.length > 0) {
          items.push({
            prefix: '【各地の震度】',
            text: areaParts.join(' ｜ '),
          });
        }
      }

      // Recent earthquakes in history
      const otherQuakes = data.earthquakes.filter((q) => q.id !== targetQuake.id).slice(0, 3);
      if (otherQuakes.length > 0) {
        const historyStr = otherQuakes
          .map(
            (q) =>
              `${q.occurrenceTime ? q.occurrenceTime.slice(5, 16) : ''} ${q.hypocenterName} (最大震度${q.maxScaleLabel} M${q.magnitude >= 0 ? q.magnitude.toFixed(1) : '-'})`
          )
          .join(' ｜ ');
        items.push({
          prefix: '【最近の地震】',
          text: historyStr,
        });
      }

      return {
        sceneId: 'earthquake',
        badgeLabel,
        badgeSub,
        title,
        timeLabel,
        accentColor,
        items,
        textKey: `eq-${targetQuake.id}-${targetQuake.reportKey || ''}`,
      };
    }
  }

  // ==================== 2. FORECAST SCENE ====================
  if (effectiveScene === 'forecast') {
    const accentColor = '#38BDF8';
    const badgeLabel = '全国の天気予報';
    const badgeSub = '主要18地点';
    const title = '全国の天気予報（今日・明日・明後日の見通し）';
    const timeLabel = defaultTimeLabel;

    const items: SceneFeedItem[] = [];

    // City forecasts
    if (data.forecasts && data.forecasts.length > 0) {
      const cityForecastStr = data.forecasts
        .map((f: CityForecastItem) => {
          const todayMax = f.todayTempMax ?? f.tempMax;
          const todayMin = f.todayTempMin ?? f.tempMin;
          const tomorrowMax = f.tomorrowTempMax ?? f.tempMax;
          const tomorrowMin = f.tomorrowTempMin ?? f.tempMin;
          const todayPart = `今日: ${f.todayWeather || '晴れ'}${todayMax != null ? ` ${todayMax}℃` : ''}${todayMin != null ? `/${todayMin}℃` : ''}`;
          const tomorrowPart = `明日: ${f.tomorrowWeather || '曇り'}${tomorrowMax != null ? ` ${tomorrowMax}℃` : ''}${tomorrowMin != null ? `/${tomorrowMin}℃` : ''}`;
          return `【${f.cityName}】${todayPart} ｜ ${tomorrowPart}`;
        })
        .join(' ｜ ');

      items.push({
        prefix: '【主要都市予報】',
        text: cityForecastStr,
      });
    }

    // Weather overview commentary text
    const overviewText =
      data.forecasts.find((f) => f.id === 'fc-130000')?.overviewText ||
      data.xmlEntries.find((e) => e.feedType === 'regular' && e.title.includes('概況'))?.content ||
      '日本付近は移動性高気圧に覆われて広く晴れる見込みです。北日本の日本海側では寒気の影響で曇りや雨となる所があるでしょう。';

    items.push({
      prefix: '【気象概況】',
      text: overviewText,
    });

    return {
      sceneId: 'forecast',
      badgeLabel,
      badgeSub,
      title,
      timeLabel,
      accentColor,
      items,
      textKey: `forecast-${data.forecasts.length}-${data.lastXmlFetchTime}`,
    };
  }

  // ==================== 3. WARNINGS SCENE ====================
  if (effectiveScene === 'warnings') {
    let hasSpecial = false;
    let hasWarning = false;

    const muniMap = data.muniSeverityMap || {};
    for (const sev of Object.values(muniMap)) {
      if (sev === 'special') {
        hasSpecial = true;
      } else if (sev === 'danger' || sev === 'warning') {
        hasWarning = true;
      }
    }

    const accentColor = hasSpecial ? '#DC2626' : hasWarning ? '#EF4444' : '#F59E0B';
    const badgeLabel = '気象警報・注意報';
    const divName = activeWarningDivision
      ? activeWarningDivision.areaName || activeWarningDivision.prefecture
      : '';

    // When zoomed into an active 警報以上 division, use R06 warning XMLs (VPWW55..61 / VPWS50)
    if (activeWarningDivision && isWarningOrAbove(activeWarningDivision.severity)) {
      const matchedR06 = selectDivisionR06WarningEntries(
        data.xmlEntries,
        activeWarningDivision
      );
      if (matchedR06.length > 0) {
        const items: SceneFeedItem[] = matchedR06.map((entry) => {
          const { headline, body } = splitJmaBracketHeadline(
            entry.content,
            `${divName} ${entry.title}`
          );
          return {
            text: body,
            sourceTitle: headline,
            sourceTime: formatXmlUpdatedJst(entry.updated, defaultTimeLabel),
          };
        });
        return {
          sceneId: 'warnings',
          badgeLabel,
          badgeSub: divName,
          title: items[0]?.sourceTitle || `${divName} ${matchedR06[0].title}`,
          timeLabel: formatXmlUpdatedJst(matchedR06[0].updated, defaultTimeLabel),
          accentColor,
          items,
          textKey: `warnings-zoom-${activeWarningDivision.divisionCode || activeWarningDivision.id}-${matchedR06.map((e) => e.id).join('-')}`,
        };
      }

      const divCode = activeWarningDivision.divisionCode || '';
      const vpws50Kinds = divCode ? data.vpws50Summaries?.[divCode] : undefined;
      if (vpws50Kinds && vpws50Kinds.length > 0) {
        const vpwsTime = data.vpws50Updated
          ? formatXmlUpdatedJst(data.vpws50Updated, defaultTimeLabel)
          : defaultTimeLabel;
        return {
          sceneId: 'warnings',
          badgeLabel,
          badgeSub: divName,
          title: `${divName} 気象警報・注意報（Ｒ０６）（集約通報）`,
          timeLabel: vpwsTime,
          accentColor,
          items: [
            {
              text: `${divName}：${vpws50Kinds.join('・')}`,
              sourceTitle: `${divName} 気象警報・注意報（Ｒ０６）（集約通報）`,
              sourceTime: vpwsTime,
            },
          ],
          textKey: `warnings-vpws50-${divCode}-${vpws50Kinds.join('-')}`,
        };
      }
    }

    // Nationwide view (or fallback when no R06 warning XML exists for zoomed division):
    // Share exact 24h meteorological commentary XMLs (VPZJ51 / VPCJ51 / VPFJ51) with radar.
    return buildSharedCommentaryResult(
      'warnings',
      data.xmlEntries,
      nowMs,
      defaultTimeLabel,
      {
        badgeLabel,
        badgeSub: activeWarningDivision ? divName : '気象解説情報',
        accentColor,
        defaultTitle: '気象解説情報（気象庁発表）',
      }
    );
  }

  // ==================== 4. TYPHOON SCENE ====================
  if (effectiveScene === 'typhoon') {
    const hasTyphoons = data.typhoons && data.typhoons.length > 0;
    const t =
      (selectedTyphoon &&
        data.typhoons.find((item) => item.id === selectedTyphoon.id)) ||
      (hasTyphoons ? data.typhoons[0] : null);

    if (t && hasTyphoons) {
      const accentColor = '#A855F7';
      const badgeLabel = '台風進路情報';
      const dispNum = t.displayNumber || `台風第${t.typhoonNumber}号`;
      const nameStr = t.nameJp || t.nameEn || '';
      const badgeSub = dispNum;
      const title = `台風情報（${dispNum} ${nameStr}）`;
      const timeLabel = t.issueTimeJst || defaultTimeLabel;

      const items: SceneFeedItem[] = [];
      const currentPoint = t.points && t.points.length > 0 ? t.points[0] : null;

      if (currentPoint) {
        const intensityStr = currentPoint.intensity ? `強さ: ${currentPoint.intensity}、` : '';
        const dirStr = currentPoint.course ? `進行方向: ${currentPoint.course} ${currentPoint.speedKmh}km/h` : '';

        items.push({
          prefix: `【${dispNum} (${nameStr})】`,
          text: `${currentPoint.timeLabel || ''} 中心位置: 北緯${currentPoint.lat.toFixed(1)}度、東経${currentPoint.lon.toFixed(1)}度、${intensityStr}中心気圧: ${currentPoint.pressureHpa}hPa、最大風速: ${currentPoint.maxWindMs}m/s、最大瞬間風速: ${currentPoint.maxGustMs}m/s。${dirStr}。`,
        });
      } else {
        items.push({
          prefix: `【${dispNum} (${nameStr})】`,
          text: `台風第${t.typhoonNumber}号の実況および進路予想です。`,
        });
      }

      items.push({
        prefix: '【防災上の注意】',
        text: '暴風域・強風域への接近に伴う暴風、高波、高潮、土砂災害や浸水害に厳重に警戒してください。最新の気象庁台風進路予想図を確認してください。',
      });

      return {
        sceneId: 'typhoon',
        badgeLabel,
        badgeSub,
        title,
        timeLabel,
        accentColor,
        items,
        textKey: `typhoon-${t.id}-${t.typhoonNumber}-${t.issueTimeJst}`,
      };
    }

    // No active typhoon
    return {
      sceneId: 'typhoon',
      badgeLabel: '台風情報',
      badgeSub: '発表なし',
      title: '台風解析・進路予報情報',
      timeLabel: defaultTimeLabel,
      accentColor: '#64748B',
      items: [
        {
          prefix: '【実況】',
          text: '現在台風情報は発表されていません。',
        },
      ],
      textKey: 'typhoon-none',
    };
  }

  // ==================== 5. AMEDAS SCENE ====================
  if (effectiveScene === 'amedas') {
    const metricLabel =
      amedasMetric === 'temp'
        ? '気温'
        : amedasMetric === 'precip'
          ? '降水量'
          : amedasMetric === 'wind'
            ? '風向・風速'
            : '積雪深';
    const accentColor = '#10B981';
    const badgeLabel = 'アメダス実況';
    const badgeSub = '全国1,300地点';
    const title = `全国アメダス最新観測実況（${metricLabel}ランキング）`;
    const timeLabel = data.amedas[0]?.observedAt ? `${data.amedas[0].observedAt} 実況` : defaultTimeLabel;

    const items: SceneFeedItem[] = [];
    const rankings = computeAmedasTop5Rankings(data.amedas);

    if (amedasMetric === 'temp') {
      const topStr = rankings.tempHigh5
        .map((s, i) => `第${i + 1}位: ${s.stationName}（${s.prefecture}）${s.temp.toFixed(1)}℃`)
        .join(' ｜ ');
      const lowStr = rankings.tempLow5
        .map((s, i) => `第${i + 1}位: ${s.stationName}（${s.prefecture}）${s.temp.toFixed(1)}℃`)
        .join(' ｜ ');

      if (topStr) {
        items.push({
          prefix: '【全国最高気温ランキング】',
          text: topStr,
        });
      }
      if (lowStr) {
        items.push({
          prefix: '【全国最低気温ランキング】',
          text: lowStr,
        });
      }
    } else if (amedasMetric === 'precip') {
      const precipStr = rankings.precipTop5
        .map((s, i) => `第${i + 1}位: ${s.stationName}（${s.prefecture}）${s.precip1h.toFixed(1)}mm/h`)
        .join(' ｜ ');
      items.push({
        prefix: '【全国1時間降水量ランキング】',
        text: precipStr || '現在、全国で強い降水は観測されていません',
      });
    } else if (amedasMetric === 'wind') {
      const windStr = rankings.windTop5
        .map((s, i) => `第${i + 1}位: ${s.stationName}（${s.prefecture}）${s.windDirection || ''} ${s.windSpeed.toFixed(1)}m/s`)
        .join(' ｜ ');
      items.push({
        prefix: '【全国最大風速ランキング】',
        text: windStr || '現在、強風は観測されていません',
      });
    } else {
      const snowStr = rankings.snowTop5
        .map((s, i) => `第${i + 1}位: ${s.stationName}（${s.prefecture}）${s.snowCm}cm`)
        .join(' ｜ ');
      items.push({
        prefix: '【全国最深積雪ランキング】',
        text: snowStr || '現在、全国で積雪は観測されていません',
      });
    }

    return {
      sceneId: 'amedas',
      badgeLabel,
      badgeSub,
      title,
      timeLabel,
      accentColor,
      items,
      textKey: `amedas-${amedasMetric}-${rankings.tempHigh5[0]?.id || ''}-${rankings.precipTop5[0]?.id || ''}`,
    };
  }

  // ==================== 6. RADAR SCENE ====================
  if (effectiveScene === 'radar') {
    return buildSharedCommentaryResult(
      'radar',
      data.xmlEntries,
      nowMs,
      defaultTimeLabel,
      {
        badgeLabel: '気象解説情報',
        badgeSub: '雨雲レーダー',
        accentColor: '#3B82F6',
        defaultTitle: '気象解説情報（気象庁発表）',
      }
    );
  }

  // ==================== 7. TSUNAMI SCENE ====================
  if (effectiveScene === 'tsunami') {
    const isAct = isTsunamiForecastActive(data.tsunamiForecast);
    const tf = data.tsunamiForecast;

    if (isAct && tf && tf.areas && tf.areas.length > 0) {
      const highestGrade = getTsunamiHighestGrade(tf);
      const accentColor =
        highestGrade === 'MajorWarning'
          ? '#C026D3'
          : highestGrade === 'Warning'
            ? '#EF4444'
            : highestGrade === 'Watch'
              ? '#F59E0B'
              : '#38BDF8';
      const badgeLabel =
        highestGrade === 'MajorWarning'
          ? '大津波警報'
          : highestGrade === 'Warning'
            ? '津波警報'
            : highestGrade === 'Watch'
              ? '津波注意報'
              : '津波予報';
      const badgeSub =
        highestGrade === 'MajorWarning'
          ? '直ちに高台へ避難'
          : highestGrade === 'Warning'
            ? '直ちに避難'
            : '海岸から離れて';
      const title =
        highestGrade === 'MajorWarning'
          ? '大津波警報 発表中（ただちに高台へ避難してください）'
          : highestGrade === 'Warning'
            ? '津波警報 発表中（直ちに高台へ避難してください）'
            : '津波警報・注意報 発表中（海岸から離れてください）';
      const timeLabel = tf.issueTime || defaultTimeLabel;

      const items: SceneFeedItem[] = [
        {
          prefix: '【緊急津波速報】',
          text: '海岸付近や河口付近にいる方は直ちに高台や避難ビルなど安全な場所へ避難してください。津波は何波も押し寄せ、後から来る波の方が高くなることがあります。',
        },
        {
          prefix: '【津波予報区】',
          text: tf.areas
            .map(
              (a: TsunamiForecastArea) =>
                `【${a.name}】${a.grade} 予想高さ: ${a.maxHeightText || '不明'}${a.arrivalTime ? ` 到達予想: ${a.arrivalTime}` : ''}`
            )
            .join(' ｜ '),
        },
      ];

      if (activeEew && isEewStillActive(activeEew)) {
        const kindLabel = isEewSpecialWarning(activeEew)
          ? '特別警報'
          : isEewWarning(activeEew)
            ? '警報'
            : '予報';
        items.push({
          prefix: `【緊急地震速報（${kindLabel}）】`,
          text: `第${activeEew.serial}報 震源: ${activeEew.hypocenterName} 最大予測震度: ${activeEew.maxScaleLabel} M${activeEew.magnitude > 0 ? activeEew.magnitude.toFixed(1) : '不明'}。P波・S波の到達と強い揺れにも警戒してください。`,
        });
      }

      return {
        sceneId: 'tsunami',
        badgeLabel,
        badgeSub,
        title,
        timeLabel,
        accentColor,
        items,
        textKey: `tsunami-${tf.id}-${tf.areas.length}-${activeEew?.serial || 0}`,
      };
    }

    return {
      sceneId: 'tsunami',
      badgeLabel: '津波情報',
      badgeSub: '発表なし',
      title: '全国の津波警報・注意報・予報発表状況',
      timeLabel: defaultTimeLabel,
      accentColor: '#06B6D4',
      items: [
        {
          prefix: '【実況】',
          text: '現在、日本全国の沿岸に津波警報・津波注意報・津波予報は発表されていません。海岸付近における津波の心配はありません。',
        },
      ],
      textKey: 'tsunami-none',
    };
  }

  // ==================== 8. VOLCANO SCENE ====================
  if (effectiveScene === 'volcano') {
    if (activeVolcano) {
      const accentColor = '#EF4444';
      const badgeLabel = '火山情報';
      const badgeSub = `噴火警戒Lv.${activeVolcano.alertLevel}`;
      const title = `火山情報（${activeVolcano.name} 噴火警戒レベル${activeVolcano.alertLevel}）`;
      const timeLabel = defaultTimeLabel;

      const items: SceneFeedItem[] = [
        {
          prefix: `【${activeVolcano.name}】`,
          text: `${activeVolcano.prefecture || ''}の${activeVolcano.name}では噴火警戒レベル${activeVolcano.alertLevel}（${activeVolcano.levelLabel}）が発表されています。火口周辺や立ち入り規制区域には絶対に立ち入らないでください。地元自治体の避難指示に従ってください。`,
        },
      ];

      return {
        sceneId: 'volcano',
        badgeLabel,
        badgeSub,
        title,
        timeLabel,
        accentColor,
        items,
        textKey: `volcano-${activeVolcano.id}-${activeVolcano.alertLevel}`,
      };
    }

    return {
      sceneId: 'volcano',
      badgeLabel: '火山情報',
      badgeSub: '平常',
      title: '全国の火山観測・噴火警報状況',
      timeLabel: defaultTimeLabel,
      accentColor: '#64748B',
      items: [
        {
          prefix: '【実況】',
          text: '現在、全国の主要火山において緊急の臨時火山観測報や噴火速報は発表されていません。各火山の噴火警戒レベルに従って行動してください。',
        },
      ],
      textKey: 'volcano-none',
    };
  }

  // ==================== DEFAULT / FALLBACK (weather_info) ====================
  return {
    sceneId: effectiveScene,
    badgeLabel: '気象情報',
    badgeSub: '全国実況',
    title: '気象庁 防災情報リアルタイムフィード',
    timeLabel: defaultTimeLabel,
    accentColor: '#38BDF8',
    items: data.xmlEntries.slice(0, 5).map((e) => ({
      prefix: `【${e.title}】`,
      text: e.content,
    })),
    textKey: `default-${data.xmlEntries.length}-${data.lastXmlFetchTime}`,
  };
}


export const AMEDAS_BOTTOM_CITY_TARGETS: Array<{
  code: string;
  cityName: string;
}> = [
  { code: '14163', cityName: '札幌' },
  { code: '34392', cityName: '仙台' },
  { code: '44132', cityName: '東京' },
  { code: '51106', cityName: '名古屋' },
  { code: '62078', cityName: '大阪' },
  { code: '67437', cityName: '広島' },
  { code: '82182', cityName: '福岡' },
  { code: '91197', cityName: '那覇' },
];

export function getAmedasCityMetricTitle(metric: AmedasMetric): string {
  switch (metric) {
    case 'temp':
      return '現在の気温';
    case 'precip':
      return '現在の1時間降水量';
    case 'wind':
      return '現在の風向・風速';
    case 'snow':
      return '現在の積雪深';
  }
}

function findAmedasTargetStation(
  stations: AmedasStationData[],
  target: { code: string; cityName: string }
): AmedasStationData | undefined {
  return (
    stations.find(
      (s) => s.id === target.code || s.id === `amd-${target.code}`
    ) ||
    stations.find(
      (s) =>
        s.stationName === target.cityName ||
        s.stationName.startsWith(`${target.cityName}（`)
    )
  );
}

/**
 * Formats the 8 major Japanese cities (`札幌・仙台・東京・名古屋・大阪・広島・福岡・那覇`)
 * for the active AMeDAS metric as `都市名 値`.
 */
export function buildAmedasCitySegments(
  stations: AmedasStationData[],
  metric: AmedasMetric
): string[] {
  const segments: string[] = [];
  for (const target of AMEDAS_BOTTOM_CITY_TARGETS) {
    const st = findAmedasTargetStation(stations, target);
    if (!st) continue;
    if (metric === 'temp') {
      if (st.hasTemp === false) continue;
      segments.push(`${target.cityName} ${st.temp.toFixed(1)}℃`);
    } else if (metric === 'precip') {
      segments.push(`${target.cityName} ${st.precip1h.toFixed(1)}mm`);
    } else if (metric === 'wind') {
      const dir = st.windDirection ? `${st.windDirection} ` : '';
      segments.push(`${target.cityName} ${dir}${st.windSpeed.toFixed(1)}m/s`);
    } else {
      segments.push(`${target.cityName} ${st.snowCm ?? 0}cm`);
    }
  }
  return segments;
}

/**
 * Greedily packs consecutive city segments onto one card using `doesLineFit`,
 * putting overflow segments onto card 2 (and further cards if needed on narrow screens).
 */
export function paginateSegmentsGreedy(
  segments: string[],
  doesLineFit: (candidateLine: string) => boolean
): string[][] {
  if (segments.length === 0) return [];
  const pages: string[][] = [];
  let current: string[] = [];

  for (const seg of segments) {
    const candidate =
      current.length === 0 ? seg : `${current.join('／')}／${seg}`;
    if (current.length === 0 || doesLineFit(candidate)) {
      current.push(seg);
    } else {
      pages.push(current);
      current = [seg];
    }
  }

  if (current.length > 0) {
    pages.push(current);
  }
  return pages;
}

export function buildAmedasFlipCardsFromPages(
  pages: string[][],
  metric: AmedasMetric
): BottomFlipCard[] {
  return pages
    .filter((page) => page.length > 0)
    .map((page, idx) => ({
      id: `amedas-${metric}-page-${idx}`,
      badge: '',
      badgeBg: 'bg-emerald-600 text-white',
      mainText: page.join('／'),
      accentColor: '#10B981',
    }));
}

export interface BottomFlipCard {
  id: string;
  badge: string;
  badgeBg: string;
  mainText: string;
  subText?: string;
  accentColor: string;
}

export interface BottomFlipFeedResult {
  isFlipMode: boolean;
  cards: BottomFlipCard[];
  headerTitle: string;
  headerTime: string;
  accentColor: string;
  citySegments?: string[];
  amedasMetric?: AmedasMetric;
  stopOnLastCard?: boolean;
}

export interface BuildBottomFlipFeedOptions {
  effectiveScene: SceneId;
  data: MonitorDataBundle;
  activeEew: EewReport | null;
  selectedEarthquake?: EarthquakeReport | null;
  pinnedEarthquakeId?: string | null;
  amedasMetric?: AmedasMetric;
  isLiveInterrupt?: boolean;
  currentTime?: string;
}

/**
 * Builds vertical-flip broadcast telop cards for high-priority disaster updates:
 * Priority 1: Tsunami Alert (MajorWarning, Warning, or Watch active - takes precedence over all scenes)
 * Priority 2: EEW (緊急地震速報 警報・予報 観測中)
 * Priority 3: Earthquake Scene (震度速報・震源・規模・津波情報が入電した実況)
 * Priority 4: Tsunami Scene (全国の津波予報発表状況)
 *
 * Cards flip vertically (bottom-to-top) every ~3.5s without horizontal scrolling.
 */

/**
 * Formats occurrence time for past earthquake headlines during normal patrol loop:
 * e.g. "2026/11/09 16:30 頃発生" -> "2026 11/9 16:30"
 */
export function formatQuakePastHeadlineTime(
  timeStr: string | null | undefined
): string {
  if (!timeStr) return '';
  const s = String(timeStr).trim();
  const ms = parseJstDateTimeMs(s);
  if (!Number.isNaN(ms)) {
    const d = new Date(ms + 9 * 3600 * 1000);
    const y = d.getUTCFullYear();
    const mo = d.getUTCMonth() + 1;
    const date = d.getUTCDate();
    const h = d.getUTCHours();
    const mi = String(d.getUTCMinutes()).padStart(2, '0');
    return `${y} ${mo}/${date} ${h}:${mi}`;
  }
  return s
    .replace(/[-/]/g, ' ')
    .replace('頃発生', '')
    .replace('発表', '')
    .trim();
}

export function buildBottomFlipFeed(
  options: BuildBottomFlipFeedOptions
): BottomFlipFeedResult | null {
  const {
    effectiveScene,
    data,
    activeEew,
    selectedEarthquake,
    pinnedEarthquakeId,
    amedasMetric = 'temp',
    isLiveInterrupt = false,
    currentTime = '',
  } = options;

  const tsunamiSeverity = getTsunamiAlertSeverity(data.tsunamiForecast);
  const isTsunamiAlertActive = tsunamiSeverity === 'warning_or_above';
  const isEewActive = Boolean(activeEew && isEewStillActive(activeEew));
  const hasActiveTyphoons = Boolean(data.typhoons && data.typhoons.length > 0);

  // Determine whether Flip Feed should be active:
  // 1) When Tsunami Advisory or Warning is active (ALWAYS on regardless of scene!)
  // 2) When EEW is active (in earthquake/eew or normal loop)
  // 3) When viewing earthquake, tsunami, or amedas scene
  // 4) When viewing typhoon scene with no active typhoon (shows empty-state message cleanly)
  const shouldActivateFlip =
    isTsunamiAlertActive ||
    isEewActive ||
    effectiveScene === 'earthquake' ||
    effectiveScene === 'tsunami' ||
    effectiveScene === 'amedas' ||
    (effectiveScene === 'typhoon' && !hasActiveTyphoons);

  if (!shouldActivateFlip) {
    return null;
  }

  const defaultTime =
    data.lastXmlFetchTime || currentTime || '最新情報';

  // ==================== PRIORITY 1: TSUNAMI ALERT ====================
  // "もし津波注意報以上が発令された場合は下には常に津波についての情報を表示し、「津波警報　安全な場所に避難」や「愛知県沿岸で巨大な津波を予想」「愛知県沿岸で〇〇mを観測」などと表示して。これもスクロールしないで表示できるような長さに抑える。"
  if (isTsunamiAlertActive && data.tsunamiForecast) {
    const tf = data.tsunamiForecast;
    const highestGrade = getTsunamiHighestGrade(tf);
    const timeLabel = tf.issueTime || defaultTime;
    const cards: BottomFlipCard[] = [];

    // Card 1: Official Callout / 避難の呼びかけ (JMA / NHK standard disaster broadcast)
    if (highestGrade === 'MajorWarning') {
      cards.push({
        id: 'tsunami-callout-major',
        badge: '大津波警報',
        badgeBg: 'bg-fuchsia-700 text-white animate-pulse',
        mainText: '大津波警報　ただちに高台へ避難！',
        subText: '命を守るため 今すぐ全力で逃げてください。沿岸部や川沿いから離れてください。',
        accentColor: '#C026D3',
      });
    } else if (highestGrade === 'Warning') {
      cards.push({
        id: 'tsunami-callout-warn',
        badge: '津波警報',
        badgeBg: 'bg-red-600 text-white animate-pulse',
        mainText: '津波警報　安全な場所に避難',
        subText: '沿岸部や川沿いにいる方は 直ちに高台や避難ビルへ避難してください。',
        accentColor: '#EF4444',
      });
    } else {
      cards.push({
        id: 'tsunami-callout-watch',
        badge: '津波注意報',
        badgeBg: 'bg-amber-500 text-slate-950 font-bold',
        mainText: '津波注意報　海から上がって海岸から離れて',
        subText: '海の中にいる人は直ちに海から上がり 海岸や河口付近から離れてください。',
        accentColor: '#F59E0B',
      });
    }

    // Card 2+: Expected Tsunami Heights by Area
    const majorAreas = tf.areas.filter((a) => a.grade === 'MajorWarning');
    const warningAreas = tf.areas.filter((a) => a.grade === 'Warning');
    const watchAreas = tf.areas.filter((a) => a.grade === 'Watch');

    if (majorAreas.length > 0) {
      for (const a of majorAreas.slice(0, 2)) {
        cards.push({
          id: `tsunami-area-major-${a.name}`,
          badge: '大津波警報',
          badgeBg: 'bg-fuchsia-700 text-white',
          mainText: `${a.name}沿岸で巨大な津波を予想`,
          subText: `予想される高さ: 巨大（5m超〜10m超） 到達: ${a.firstHeightText || '直ちに到達'}`,
          accentColor: '#C026D3',
        });
      }
    }

    if (warningAreas.length > 0) {
      const names = warningAreas.slice(0, 3).map((a) => a.name).join('・');
      const height = warningAreas[0]?.maxHeightText || '3m';
      const arrival = warningAreas[0]?.firstHeightText || '直ちに到達';
      cards.push({
        id: 'tsunami-area-warn',
        badge: '津波警報',
        badgeBg: 'bg-red-600 text-white',
        mainText: `${names}で${height}の津波を予想`,
        subText: `予想される高さ: ${height} 到達予想: ${arrival}`,
        accentColor: '#EF4444',
      });
    }

    if (watchAreas.length > 0) {
      const names = watchAreas.slice(0, 4).map((a) => a.name).join('・');
      const height = watchAreas[0]?.maxHeightText || '1m';
      cards.push({
        id: 'tsunami-area-watch',
        badge: '津波注意報',
        badgeBg: 'bg-amber-500 text-slate-950 font-bold',
        mainText: `${names}で${height}の津波を予想`,
        subText: `予想される高さ: ${height} 海岸・川沿いから離れてください`,
        accentColor: '#F59E0B',
      });
    }

    // Observed Tsunami card from XML entries (if any mention "津波観測" or "mの津波を観測")
    const obsEntry = data.xmlEntries.find(
      (e) =>
        e.title.includes('津波観測') ||
        e.content.includes('津波を観測') ||
        e.content.includes('mの津波')
    );
    if (obsEntry) {
      const m = /([^\s、。]+?で[0-9.]+(?:m|ｍ)の津波を観測)/.exec(obsEntry.content);
      const obsText = m ? m[1] : obsEntry.content.slice(0, 36);
      cards.push({
        id: 'tsunami-obs',
        badge: '津波観測',
        badgeBg: 'bg-sky-600 text-white font-bold',
        mainText: obsText,
        subText: '津波は繰り返し押し寄せます。警報解除まで海岸に近づかないでください。',
        accentColor: '#0EA5E9',
      });
    }

    // Integrated active EEW cards (Tsunami remains Priority 1 above, followed by active EEW)
    let eewHeaderSuffix = '';
    if (isEewActive && activeEew) {
      const isSpecial = isEewSpecialWarning(activeEew);
      const isWarn = isEewWarning(activeEew);
      const isFin = isEewFinal(activeEew);
      const eewAccent = isSpecial ? '#9333EA' : isWarn ? '#EF4444' : '#F59E0B';
      const kindLabel = isSpecial ? '特別警報' : isWarn ? '警報' : '予報';
      const magStr =
        activeEew.magnitude > 0 ? `M${activeEew.magnitude.toFixed(1)}` : 'M不明';
      const depthStr =
        activeEew.depthKm >= 0 ? `深さ約${activeEew.depthKm}km` : '深さ不明';

      eewHeaderSuffix = `｜緊急地震速報（${kindLabel}） 第${activeEew.serial}報`;

      cards.push({
        id: `tsunami-eew-alert-${activeEew.serial}`,
        badge: `緊急地震速報（${kindLabel}）`,
        badgeBg: isSpecial
          ? 'bg-purple-600 text-white animate-pulse'
          : isWarn
            ? 'bg-red-600 text-white animate-pulse'
            : 'bg-amber-500 text-slate-950 font-bold',
        mainText: `緊急地震速報(${kindLabel}) 強い揺れに警戒`,
        subText: `第${activeEew.serial}報${isFin ? ' (最終報)' : ''} P波・S波表示中｜倒れやすい家具から離れ 身の安全を確保`,
        accentColor: eewAccent,
      });

      cards.push({
        id: `tsunami-eew-scale-${activeEew.serial}`,
        badge: '予想震度・規模',
        badgeBg: 'bg-white text-slate-950 font-black',
        mainText: `予想最大震度${activeEew.maxScaleLabel || '不明'} ${magStr}`,
        subText: `震源: ${activeEew.hypocenterName || '調査中'}　${depthStr}`,
        accentColor: eewAccent,
      });

      if (activeEew.maxLpgmClass && activeEew.maxLpgmClass >= 1) {
        cards.push({
          id: `tsunami-eew-lpgm-${activeEew.serial}`,
          badge: '長周期地震動',
          badgeBg: 'bg-orange-600 text-white font-bold',
          mainText: `長周期地震動 最大予測 ${activeEew.maxLpgmLabel || `階級${activeEew.maxLpgmClass}`}`,
          subText: '高層ビル等での大きな揺れにも警戒してください',
          accentColor: '#EA580C',
        });
      }
    }

    const baseTsunamiHeaderTitle =
      highestGrade === 'MajorWarning'
        ? '大津波警報 発表中'
        : highestGrade === 'Warning'
          ? '津波警報 発表中'
          : '津波注意報 発表中';

    return {
      isFlipMode: true,
      cards,
      headerTitle: `${baseTsunamiHeaderTitle}${eewHeaderSuffix}`,
      headerTime: timeLabel,
      accentColor:
        highestGrade === 'MajorWarning'
          ? '#C026D3'
          : highestGrade === 'Warning'
            ? '#EF4444'
            : '#F59E0B',
    };
  }

  // ==================== PRIORITY 2: ACTIVE EEW ====================
  // "下のFeedには、「緊急地震速報(警報/特別警報) 強い揺れに警戒」「予想最大震度5強 M5.7」などと観測中は表示し"
  if (isEewActive && activeEew) {
    const isSpecial = isEewSpecialWarning(activeEew);
    const isWarn = isEewWarning(activeEew);
    const isFin = isEewFinal(activeEew);
    const accentColor = isSpecial ? '#9333EA' : isWarn ? '#EF4444' : '#F59E0B';
    const kindLabel = isSpecial ? '特別警報' : isWarn ? '警報' : '予報';
    const badgeLabel = `緊急地震速報（${kindLabel}）`;
    const cards: BottomFlipCard[] = [];

    // Card 1: 強い揺れに警戒
    cards.push({
      id: `eew-alert-${activeEew.serial}`,
      badge: badgeLabel,
      badgeBg: isSpecial
        ? 'bg-purple-600 text-white animate-pulse'
        : isWarn
          ? 'bg-red-600 text-white animate-pulse'
          : 'bg-amber-500 text-slate-950 font-bold',
      mainText: `緊急地震速報(${kindLabel}) 強い揺れに警戒`,
      subText: `第${activeEew.serial}報${isFin ? ' (最終報)' : ''} 倒れやすい家具から離れ 身の安全を確保`,
      accentColor,
    });

    // Card 2: 予想最大震度 & 規模
    const magStr =
      activeEew.magnitude > 0 ? `M${activeEew.magnitude.toFixed(1)}` : 'M不明';
    const depthStr =
      activeEew.depthKm >= 0 ? `深さ約${activeEew.depthKm}km` : '深さ不明';
    cards.push({
      id: `eew-scale-${activeEew.serial}`,
      badge: '予想震度・規模',
      badgeBg: 'bg-yellow-500 text-slate-950 font-bold',
      mainText: `予想最大震度${activeEew.maxScaleLabel || '不明'} ${magStr}`,
      subText: `震源: ${activeEew.hypocenterName || '調査中'}　${depthStr}`,
      accentColor: '#EAB308',
    });

    // Card 3: 強い揺れの予想地域 (if areas > 0)
    if (activeEew.areas && activeEew.areas.length > 0) {
      const areaNames = activeEew.areas.slice(0, 4).map((a) => `${a.pref} ${a.name}`);
      cards.push({
        id: `eew-areas-${activeEew.serial}`,
        badge: '予想地域',
        badgeBg: 'bg-neutral-800 text-neutral-200 border border-neutral-700',
        mainText: `強い揺れの予想地域: ${areaNames.join('、')}${activeEew.areas.length > 4 ? ` ほか計${activeEew.areas.length}地域` : ''}`,
        subText: '揺れが収まるまで安全な場所に身を潜めてください',
        accentColor: isSpecial ? '#9333EA' : '#EF4444',
      });
    }

    // Card 4: 長周期地震動 (if LPGM >= 1)
    if (activeEew.maxLpgmClass && activeEew.maxLpgmClass >= 1) {
      cards.push({
        id: `eew-lpgm-${activeEew.serial}`,
        badge: '長周期地震動',
        badgeBg: 'bg-orange-600 text-white font-bold',
        mainText: `長周期地震動 最大予測 ${activeEew.maxLpgmLabel || `階級${activeEew.maxLpgmClass}`}`,
        subText: '超高層ビル・集合住宅では大きく長い揺れに厳重に警戒してください',
        accentColor: '#EA580C',
      });
    }

    return {
      isFlipMode: true,
      cards,
      headerTitle: `緊急地震速報（${kindLabel}） 第${activeEew.serial}報`,
      headerTime: activeEew.originTime || activeEew.issueTime || defaultTime,
      accentColor,
    };
  }

  // ==================== PRIORITY 3: EARTHQUAKE SCENE ====================
  // "実際に地震計等で観測したデータが入電した場合、「愛知県で震度5強を観測」「震源: 〇〇　最大震度〇〇　M〇〇」「津波の心配なし」などと表示。スクロールはしないで上のタイトルみたいにアニメーションで下から上に回転するようなイメージで。"
  if (effectiveScene === 'earthquake') {
    const targetQuake =
      (pinnedEarthquakeId
        ? data.earthquakes.find((e) => e.id === pinnedEarthquakeId)
        : selectedEarthquake) || data.earthquakes[0];

    if (!targetQuake) {
      return null;
    }

    const cards: BottomFlipCard[] = [];

    // 1. Max Intensity Prefecture(s)
    const maxStations = targetQuake.stations.filter(
      (s) =>
        s.scaleCode === targetQuake.maxScaleCode ||
        (targetQuake.maxScaleLabel && s.scaleLabel === targetQuake.maxScaleLabel)
    );
    const distinctPrefs = Array.from(
      new Set(maxStations.map((s) => s.prefecture).filter(Boolean))
    );
    let maxPrefText = '';
    let prefOnlyText = '';

    if (distinctPrefs.length === 1) {
      maxPrefText = `${distinctPrefs[0]}で震度${targetQuake.maxScaleLabel}を観測`;
      prefOnlyText = distinctPrefs[0];
    } else if (distinctPrefs.length === 2) {
      maxPrefText = `${distinctPrefs[0]}・${distinctPrefs[1]}で震度${targetQuake.maxScaleLabel}を観測`;
      prefOnlyText = `${distinctPrefs[0]}・${distinctPrefs[1]}`;
    } else if (distinctPrefs.length >= 3) {
      maxPrefText = `${distinctPrefs[0]}・${distinctPrefs[1]}などで震度${targetQuake.maxScaleLabel}を観測`;
      prefOnlyText = `${distinctPrefs.slice(0, 3).join('・')}など`;
    } else if (targetQuake.areaMaxScales && Object.keys(targetQuake.areaMaxScales).length > 0) {
      const matchingAreas = Object.entries(targetQuake.areaMaxScales)
        .filter(
          ([, v]) =>
            v.scaleCode === targetQuake.maxScaleCode ||
            v.scaleLabel === targetQuake.maxScaleLabel
        )
        .map(([k, v]) => v.name || k);
      if (matchingAreas.length > 0) {
        maxPrefText = `${matchingAreas[0]}などで震度${targetQuake.maxScaleLabel}を観測`;
        prefOnlyText = `${matchingAreas.slice(0, 2).join('・')}など`;
      } else {
        maxPrefText = `最大震度${targetQuake.maxScaleLabel}を観測`;
        prefOnlyText = '各地';
      }
    } else {
      maxPrefText = targetQuake.hypocenterName
        ? `${targetQuake.hypocenterName}周辺で震度${targetQuake.maxScaleLabel}を観測`
        : `最大震度${targetQuake.maxScaleLabel}を観測`;
      prefOnlyText = targetQuake.hypocenterName || '各地';
    }

    const timePrefix = formatQuakePastHeadlineTime(
      targetQuake.occurrenceTime || targetQuake.issueTime
    );

    // "下の情報は巡回で、過去の情報を表示するときは「岩手県・茨城県で震度3を観測」ではなく、「2026 11/9 16:30ごろ岩手県・茨城県で最大地震3の地震がありました」をメインに表示する。"
    // Half-width space before ごろ and no subText in Card 1 as requested:
    const pastHeadline = `${timePrefix} ごろ${prefOnlyText}で最大震度${targetQuake.maxScaleLabel}の地震がありました`;
    const card1Main = isLiveInterrupt ? maxPrefText : pastHeadline;
    const card1Sub = isLiveInterrupt
      ? `${targetQuake.occurrenceTime.replace(' 頃発生', '')}ころ 地震がありました`
      : '';

    const maxScale = targetQuake.maxScaleCode || 0;
    const maxScaleBadgeBg =
      maxScale >= 50
        ? 'bg-red-600 text-white'
        : maxScale >= 40
          ? 'bg-amber-500 text-slate-950 font-bold'
          : 'bg-cyan-600 text-white font-bold';

    cards.push({
      id: `eq-card-max-${targetQuake.id}`,
      badge: isLiveInterrupt ? (targetQuake.issueTypeLabel === '震度速報' ? '震度速報' : '最大震度') : '地震情報',
      badgeBg: maxScaleBadgeBg,
      mainText: card1Main,
      subText: card1Sub,
      accentColor: maxScale >= 50 ? '#EF4444' : maxScale >= 40 ? '#F59E0B' : '#0EA5E9',
    });

    // 2. Hypocenter, Max Scale, Magnitude ("震源: 〇〇　最大震度〇〇　M〇〇")
    const hypo =
      targetQuake.hypocenterName ||
      (targetQuake.hypocenterUnknown ? '調査中' : '震源情報');
    const mag =
      targetQuake.magnitude >= 0
        ? `M${targetQuake.magnitude.toFixed(1)}`
        : 'M不明';
    const depth =
      targetQuake.depthKm >= 0 ? `約${targetQuake.depthKm}km` : 'ごく浅い';

    cards.push({
      id: `eq-card-hypo-${targetQuake.id}`,
      badge: '震源・規模',
      badgeBg: 'bg-neutral-800 text-neutral-200 border border-neutral-700',
      mainText: `震源: ${hypo}　最大震度${targetQuake.maxScaleLabel}　${mag}　深さ: ${depth}`,
      subText: '',
      accentColor: '#38BDF8',
    });

    // 3. Tsunami Status ("津波の心配なし")
    const tsunamiRaw = targetQuake.domesticTsunami || '';
    let tsunamiMain = '津波の心配なし';
    let tsunamiSub = 'この地震による津波の心配はありません。';
    let tsunamiBg = 'bg-teal-700 text-white font-bold';

    if (tsunamiRaw.includes('警報')) {
      tsunamiMain = '津波警報発令中 直ちに高台へ避難！';
      tsunamiSub = tsunamiRaw;
      tsunamiBg = 'bg-red-600 text-white animate-pulse';
    } else if (tsunamiRaw.includes('注意報')) {
      tsunamiMain = '津波注意報発令中 海から離れて！';
      tsunamiSub = tsunamiRaw;
      tsunamiBg = 'bg-amber-500 text-slate-950 font-bold';
    } else if (tsunamiRaw.includes('調査中') || tsunamiRaw.includes('Checking')) {
      tsunamiMain = '津波の有無は調査中';
      tsunamiSub = '津波の有無については気象庁で現在精査中です。';
      tsunamiBg = 'bg-amber-600 text-white font-bold';
    }

    cards.push({
      id: `eq-card-tsunami-${targetQuake.id}`,
      badge: '津波情報',
      badgeBg: tsunamiBg,
      mainText: tsunamiMain,
      subText: tsunamiSub,
      accentColor: '#14B8A6',
    });

    // 4. Stations breakdown if available
    if (targetQuake.stations && targetQuake.stations.length > 0) {
      const topStations = targetQuake.stations
        .filter((s) => s.scaleCode === targetQuake.maxScaleCode)
        .slice(0, 4)
        .map((s) => s.stationName);
      if (topStations.length > 0) {
        cards.push({
          id: `eq-card-stations-${targetQuake.id}`,
          badge: '各地の震度',
          badgeBg: 'bg-neutral-800 text-neutral-200 border border-neutral-700',
          mainText: `[震度${targetQuake.maxScaleLabel}] ${topStations.join('・')}${maxStations.length > 4 ? ` ほか計${maxStations.length}地点` : ''}`,
          subText: `各地の震度 計${targetQuake.stations.length}観測点で観測`,
          accentColor: '#94A3B8',
        });
      }
    }

    return {
      isFlipMode: true,
      cards,
      headerTitle: `${targetQuake.issueTypeLabel || '震源・震度に関する情報'}（${targetQuake.hypocenterName} 最大震度${targetQuake.maxScaleLabel}）`,
      headerTime:
        targetQuake.occurrenceTime || targetQuake.issueTime || defaultTime,
      accentColor:
        maxScale >= 50
          ? '#EF4444'
          : maxScale >= 40
            ? '#F59E0B'
            : '#38BDF8',
    };
  }

  // ==================== PRIORITY 4: TSUNAMI SCENE (no active alert) ====================
  if (effectiveScene === 'tsunami') {
    return {
      isFlipMode: true,
      cards: [
        {
          id: 'tsunami-none-card',
          badge: '津波予報',
          badgeBg: 'bg-teal-700 text-white font-bold',
          mainText: '現在、大津波警報・津波警報・津波注意報は発表されていません',
          subText: '日本沿岸で津波の心配はありません。',
          accentColor: '#14B8A6',
        },
      ],
      headerTitle: '全国の津波予報発表状況',
      headerTime: defaultTime,
      accentColor: '#14B8A6',
    };
  }

  // ==================== PRIORITY 5: TYPHOON SCENE (no active typhoon) ====================
  if (effectiveScene === 'typhoon' && !hasActiveTyphoons) {
    return {
      isFlipMode: true,
      cards: [
        {
          id: 'typhoon-none-card',
          badge: '台風情報',
          badgeBg: 'bg-slate-700 text-white font-bold',
          mainText: '現在台風情報は発表されていません',
          subText: '日本近海および監視エリアに台風・熱帯低気圧は発生していません。',
          accentColor: '#64748B',
        },
      ],
      headerTitle: '台風解析・進路予報情報',
      headerTime: defaultTime,
      accentColor: '#64748B',
    };
  }

  // ==================== PRIORITY 6: AMEDAS SCENE (8 Major Cities Flip Cards) ====================
  if (effectiveScene === 'amedas') {
    const citySegments = buildAmedasCitySegments(data.amedas, amedasMetric);
    const defaultPages =
      citySegments.length > 4
        ? [citySegments.slice(0, 4), citySegments.slice(4)]
        : citySegments.length > 0
          ? [citySegments]
          : [['現在アメダス観測データを取得中です']];
    const cards = buildAmedasFlipCardsFromPages(defaultPages, amedasMetric);
    const observedTime = data.amedas[0]?.observedAt
      ? data.amedas[0].observedAt
      : defaultTime;

    return {
      isFlipMode: true,
      cards,
      headerTitle: getAmedasCityMetricTitle(amedasMetric),
      headerTime: observedTime,
      accentColor: '#10B981',
      citySegments,
      amedasMetric,
      stopOnLastCard: true,
    };
  }

  return null;
}

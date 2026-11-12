import {
  AmedasMetric,
  CityForecastItem,
  EarthquakeReport,
  EewReport,
  MonitorDataBundle,
  RegionalWarningItem,
  SceneId,
  TsunamiForecastArea,
  TyphoonReport,
  VolcanoStatusItem,
} from '../types/jma';
import {
  computeAmedasTop5Rankings,
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

export interface SceneFeedItem {
  prefix?: string;
  text: string;
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
  selectedTyphoon: TyphoonReport;
  activeVolcano: VolcanoStatusItem | null;
  amedasMetric: AmedasMetric;
  currentTime?: string;
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
    let specialCount = 0;
    let warningCount = 0;
    let advisoryCount = 0;

    const muniMap = data.muniSeverityMap || {};
    for (const sev of Object.values(muniMap)) {
      if (sev === 'special') {
        hasSpecial = true;
        specialCount++;
      } else if (sev === 'danger' || sev === 'warning') {
        hasWarning = true;
        warningCount++;
      } else if (sev === 'advisory') {
        advisoryCount++;
      }
    }

    const accentColor = hasSpecial ? '#DC2626' : hasWarning ? '#EF4444' : '#F59E0B';
    const badgeLabel = '気象警報・注意報';
    const divName = activeWarningDivision
      ? (activeWarningDivision.areaName || activeWarningDivision.prefecture)
      : '';
    const badgeSub = activeWarningDivision ? divName : '全国発表実況';
    const title = activeWarningDivision
      ? `${divName} 気象警報・注意報 発表実況`
      : '全国の気象警報・注意報 発表実況';
    const timeLabel = defaultTimeLabel;

    const items: SceneFeedItem[] = [];

    // Summary count item
    if (specialCount > 0 || warningCount > 0 || advisoryCount > 0) {
      items.push({
        prefix: '【全国発表状況】',
        text: `${specialCount > 0 ? `特別警報 ${specialCount}地域、` : ''}${warningCount > 0 ? `警報 ${warningCount}地域、` : ''}注意報 ${advisoryCount}地域に発表されています。土砂災害、浸水害、河川の増水や氾濫、暴風、高波に警戒・注意してください。`,
      });
    } else {
      items.push({
        prefix: '【全国発表状況】',
        text: '現在、全国に気象警報・特別警報は発表されていません。',
      });
    }

    // Active regional warning breakdown
    if (data.warnings && data.warnings.length > 0) {
      const activeWarns = data.warnings
        .filter(
          (w) =>
            w.severity === 'warning' ||
            w.severity === 'danger' ||
            w.severity === 'special' ||
            (w.badgeItems && w.badgeItems.some((i) => i.severity === 'warning' || i.severity === 'special'))
        )
        .slice(0, 6)
        .map(
          (w) =>
            `${w.areaName || w.prefecture}（${(w.activeWarnings || w.badgeItems?.map((b) => b.name) || []).join('・')}）`
        );

      if (activeWarns.length > 0) {
        items.push({
          prefix: '【主な警報発表地域】',
          text: activeWarns.join(' ｜ '),
        });
      }
    }

    // Focused division detail
    if (activeWarningDivision) {
      items.push({
        prefix: `【${divName}】`,
        text: '該当地域の各市区町村における詳細な警報・注意報状況を表示しています。今後の気象情報に注意してください。',
      });
    }

    // Latest XML warning commentary
    const extraWarnXml = data.xmlEntries.find(
      (e) => e.feedType === 'extra' && (e.title.includes('警報') || e.title.includes('気象情報'))
    );
    if (extraWarnXml) {
      items.push({
        prefix: `【${extraWarnXml.title}】`,
        text: extraWarnXml.content,
      });
    }

    return {
      sceneId: 'warnings',
      badgeLabel,
      badgeSub,
      title,
      timeLabel,
      accentColor,
      items,
      textKey: `warnings-${activeWarningDivision?.divisionCode || 'all'}-${specialCount}-${warningCount}-${advisoryCount}`,
    };
  }

  // ==================== 4. TYPHOON SCENE ====================
  if (effectiveScene === 'typhoon') {
    const hasTyphoons = data.typhoons && data.typhoons.length > 0;
    const t = selectedTyphoon || (hasTyphoons ? data.typhoons[0] : null);

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
      badgeLabel: '台風進路情報',
      badgeSub: '監視中',
      title: '台風情報（日本近海・監視エリア）',
      timeLabel: defaultTimeLabel,
      accentColor: '#64748B',
      items: [
        {
          prefix: '【実況】',
          text: '現在、日本近海および監視対象エリアに発生している台風はありません。熱帯低気圧や気圧の谷の発生にご留意ください。',
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
    const accentColor = '#3B82F6';
    const badgeLabel = '気象解説情報';
    const badgeSub = '雨雲レーダー';

    const items: SceneFeedItem[] = [];

    // Filter meteorological commentary XML telegrams:
    // extra / regular feeds that contain 気象情報, 気象解説, 天気の概況, 大雨, 暴風, 雷, 警報, etc.
    const commentaryXmls = data.xmlEntries.filter((e) => {
      if (e.feedType !== 'extra' && e.feedType !== 'regular') return false;
      const t = e.title;
      if (
        t.includes('震源') ||
        t.includes('震度') ||
        t.includes('地震') ||
        t.includes('津波') ||
        t.includes('噴火') ||
        t.includes('火山')
      ) {
        return false;
      }
      return (
        t.includes('気象情報') ||
        t.includes('気象解説') ||
        t.includes('解説情報') ||
        t.includes('天気の概況') ||
        t.includes('全般気象') ||
        t.includes('地方気象') ||
        t.includes('府県気象') ||
        t.includes('大雨') ||
        t.includes('暴風') ||
        t.includes('高波') ||
        t.includes('雷') ||
        t.includes('雪')
      );
    });

    if (commentaryXmls.length > 0) {
      for (const entry of commentaryXmls) {
        items.push({
          prefix: `【${entry.title}】`,
          text: entry.content,
        });
      }
    } else if (data.bulletins && data.bulletins.length > 0) {
      for (const b of data.bulletins) {
        if (b.headline || b.bodyText) {
          items.push({
            prefix: `【${b.office}発表 気象解説】`,
            text: b.headline || b.bodyText || '',
          });
        }
      }
    }

    if (items.length === 0) {
      items.push({
        prefix: '【全般気象解説情報】',
        text: '北日本海側では西高東低の気圧配置の影響により、西よりの暴風や大しけ、落雷、急な強い雨に警戒してください。最新の気象レーダー実況および気象情報にご注意ください。',
      });
    }

    // Title reflects prominent commentary
    const firstTitle = commentaryXmls[0]?.title;
    const title = firstTitle || '気象解説情報（気象庁発表）';
    const timeLabel = commentaryXmls[0]?.updated
      ? `${commentaryXmls[0].updated.slice(11, 19)} 発表`
      : defaultTimeLabel;

    return {
      sceneId: 'radar',
      badgeLabel,
      badgeSub,
      title,
      timeLabel,
      accentColor,
      items,
      textKey: `radar-commentary-${commentaryXmls.map((e) => e.id).join('-') || 'default'}`,
    };
  }

  // ==================== 7. TSUNAMI SCENE ====================
  if (effectiveScene === 'tsunami') {
    const isAct = isTsunamiForecastActive(data.tsunamiForecast);
    const tf = data.tsunamiForecast;

    if (isAct && tf && tf.areas && tf.areas.length > 0) {
      const accentColor = '#EF4444';
      const badgeLabel = '津波警報・注意報';
      const badgeSub = '直ちに避難';
      const title = '津波警報・注意報 発表中（直ちに高台へ避難してください）';
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

      return {
        sceneId: 'tsunami',
        badgeLabel,
        badgeSub,
        title,
        timeLabel,
        accentColor,
        items,
        textKey: `tsunami-${tf.id}-${tf.areas.length}`,
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
}

export interface BuildBottomFlipFeedOptions {
  effectiveScene: SceneId;
  data: MonitorDataBundle;
  activeEew: EewReport | null;
  selectedEarthquake?: EarthquakeReport | null;
  pinnedEarthquakeId?: string | null;
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
    isLiveInterrupt = false,
    currentTime = '',
  } = options;

  const tsunamiSeverity = getTsunamiAlertSeverity(data.tsunamiForecast);
  const isTsunamiAlertActive = tsunamiSeverity === 'warning_or_above';
  const isEewActive = Boolean(activeEew && isEewStillActive(activeEew));

  // Determine whether Flip Feed should be active:
  // 1) When Tsunami Advisory or Warning is active (ALWAYS on regardless of scene!)
  // 2) When EEW is active (in earthquake/eew or normal loop)
  // 3) When viewing earthquake or tsunami scene
  const shouldActivateFlip =
    isTsunamiAlertActive ||
    isEewActive ||
    effectiveScene === 'earthquake' ||
    effectiveScene === 'tsunami';

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

    return {
      isFlipMode: true,
      cards,
      headerTitle:
        highestGrade === 'MajorWarning'
          ? '大津波警報 発表中'
          : highestGrade === 'Warning'
            ? '津波警報 発表中'
            : '津波注意報 発表中',
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

  return null;
}

import React, { useEffect, useState } from 'react';
import { JmaXmlEntry, RegionId, SceneId, XmlFeedType } from '../types/jma';
import { REGION_CONFIGS, SCENE_LIST } from '../utils/jmaParser';

export type ModalTabMode = 'xml' | 'settings' | 'deploy';

interface XmlInspectorModalProps {
  isOpen: boolean;
  initialTab: ModalTabMode;
  onClose: () => void;
  xmlEntries: JmaXmlEntry[];
  selectedEntry: JmaXmlEntry | null;
  onSelectEntry: (entry: JmaXmlEntry) => void;
  enabledScenes: SceneId[];
  onToggleSceneEnabled: (sceneId: SceneId) => void;
  regionScope: 'auto' | RegionId;
  onChangeRegionScope: (val: 'auto' | RegionId) => void;
  loopIntervalSec: number;
  onChangeLoopIntervalSec: (sec: number) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onTriggerTestEarthquake: () => void;
  onTriggerTestEew?: () => void;
  onTriggerTestVolcano: () => void;
  onTriggerTestTsunami?: () => void;
  onToggleTsunamiDemo?: () => void;
  isTsunamiDemo?: boolean;
  onManualRefresh: () => void;
  isRefreshing: boolean;
  lastFetchTime: string;
}

export const XmlInspectorModal: React.FC<XmlInspectorModalProps> = ({
  isOpen,
  initialTab,
  onClose,
  xmlEntries,
  selectedEntry,
  onSelectEntry,
  enabledScenes,
  onToggleSceneEnabled,
  regionScope,
  onChangeRegionScope,
  loopIntervalSec,
  onChangeLoopIntervalSec,
  isFullscreen,
  onToggleFullscreen,
  onTriggerTestEarthquake,
  onTriggerTestEew,
  onTriggerTestVolcano,
  onTriggerTestTsunami,
  onToggleTsunamiDemo,
  isTsunamiDemo,
  onManualRefresh,
  isRefreshing,
  lastFetchTime,
}) => {
  const [activeTab, setActiveTab] = useState<ModalTabMode>(initialTab);
  const [feedFilter, setFeedFilter] = useState<'all' | XmlFeedType>('all');

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const filteredEntries =
    feedFilter === 'all'
      ? xmlEntries
      : xmlEntries.filter((e) => e.feedType === feedFilter);

  const activeEntry = selectedEntry || filteredEntries[0] || null;
  const normalLoopScenes = SCENE_LIST.filter((s) => !s.isInterruptOnly);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="xml-modal-title"
      className="fixed inset-0 z-[1000] bg-black/80 flex items-center justify-center p-4 select-none"
      onClick={onClose}
    >
      <div
        className="bg-[#0E1117] border border-[#5A606D] w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-[#2B303C] bg-[#111318] flex items-center justify-between gap-4 shrink-0">
          <div>
            <h2
              id="xml-modal-title"
              className="text-base font-extrabold text-white tracking-wide"
            >
              {activeTab === 'xml'
                ? '気象庁防災情報XML 電文詳細ポップアップ'
                : 'モニター表示設定・デモ発報コントロール'}
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              {activeTab === 'xml'
                ? 'タイムラインで選択した気象庁XML電文の全文・発表官署・メタデータ'
                : '対象エリア切替・巡回秒数・シミュレーション発報・ループ対象画面の設定'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onManualRefresh}
              disabled={isRefreshing}
              className="px-3 py-1.5 text-xs font-mono bg-[#181C24] hover:bg-neutral-800 text-cyan-300 border border-neutral-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isRefreshing ? 'XML取得中...' : `XML手動更新 (${lastFetchTime})`}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="モーダルを閉じる"
              className="px-3.5 py-1.5 text-xs font-bold bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-600 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              ✕ 閉じる
            </button>
          </div>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="px-5 py-2 border-b border-[#2B303C] bg-[#0B0D12] flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`px-3.5 py-1.5 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-white text-black'
                : 'text-neutral-300 hover:bg-neutral-800 border border-neutral-800'
            }`}
          >
            ⚙ 表示設定・デモ発報
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('xml')}
            className={`px-3.5 py-1.5 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'xml'
                ? 'bg-white text-black'
                : 'text-neutral-300 hover:bg-neutral-800 border border-neutral-800'
            }`}
          >
            気象庁XML電文詳細 ({xmlEntries.length}件)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('deploy')}
            className={`px-3.5 py-1.5 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'deploy'
                ? 'bg-white text-black'
                : 'text-neutral-300 hover:bg-neutral-800 border border-neutral-800'
            }`}
          >
            GitHub Pages 無料公開ガイド
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* ==================== TAB 1: SETTINGS & DEMO TRIGGERS ==================== */}
          {activeTab === 'settings' && (
            <div className="space-y-5">
              {/* Row 1: Area Selection & Loop Interval */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[#14171F] border border-[#2B303C] p-4">
                  <label
                    htmlFor="modal-region-select"
                    className="block text-xs font-bold text-neutral-200 mb-2"
                  >
                    表示対象エリア設定
                  </label>
                  <select
                    id="modal-region-select"
                    aria-label="対象エリア選択"
                    value={regionScope}
                    onChange={(e) =>
                      onChangeRegionScope(e.target.value as 'auto' | RegionId)
                    }
                    className="w-full bg-[#0B0D12] border border-neutral-700 text-white text-xs px-2.5 py-2 font-bold"
                  >
                    <option value="national">日本全国表示 (全体)</option>
                    <option value="world">世界全体表示 (ワールドマップ)</option>
                    <option value="auto">日本全国＋地方 自動巡回</option>
                    {REGION_CONFIGS.filter(
                      (r) => r.id !== 'national' && r.id !== 'world'
                    ).map((rc) => (
                      <option key={rc.id} value={rc.id}>
                        {rc.name} 固定
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-[#14171F] border border-[#2B303C] p-4">
                  <label
                    htmlFor="modal-interval-select"
                    className="block text-xs font-bold text-neutral-200 mb-2"
                  >
                    基本ホールド秒数 (スクロールなし画面)
                  </label>
                  <select
                    id="modal-interval-select"
                    aria-label="巡回秒数"
                    value={loopIntervalSec}
                    onChange={(e) =>
                      onChangeLoopIntervalSec(Number(e.target.value))
                    }
                    className="w-full bg-[#0B0D12] border border-neutral-700 text-white text-xs px-2.5 py-2 font-mono font-bold"
                  >
                    <option value={10}>10秒 (雨雲・警報は全表示後に遷移)</option>
                    <option value={15}>15秒 (推奨・雨雲・警報は全表示後に遷移)</option>
                    <option value={20}>20秒 (雨雲・警報は全表示後に遷移)</option>
                    <option value={30}>30秒 (雨雲・警報は全表示後に遷移)</option>
                  </select>
                </div>

                <div className="bg-[#14171F] border border-[#2B303C] p-4 flex flex-col justify-between">
                  <div className="text-xs font-bold text-neutral-200 mb-2">
                    スクリーンセーバー全画面表示
                  </div>
                  <button
                    type="button"
                    onClick={onToggleFullscreen}
                    className="w-full py-2 text-xs font-bold bg-[#1D222D] hover:bg-neutral-700 text-white border border-neutral-600 transition-colors cursor-pointer"
                  >
                    {isFullscreen ? '通常ウィンドウへ戻す' : '全画面モードで表示'}
                  </button>
                </div>
              </div>

              {/* Row 2: Demo / Emergency Interrupt Simulation Triggers */}
              <div className="bg-[#14171F] border border-[#2B303C] p-4">
                <div className="text-xs font-bold text-white mb-1">
                  緊急割り込みシミュレーション発報（テスト確認用）
                </div>
                <p className="text-[11px] text-neutral-400 mb-3">
                  ボタンを押すと即座にポップアップを閉じ、該当の割り込みズームを表示します。
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {onTriggerTestEew && (
                    <button
                      type="button"
                      onClick={() => {
                        onTriggerTestEew();
                        onClose();
                      }}
                      className="px-3 py-2.5 text-xs font-black bg-rose-950/90 hover:bg-rose-900 border-2 border-red-500 text-white transition-colors text-center cursor-pointer shadow-md shadow-red-950"
                    >
                      🚨 EEWデモ発火 (第1報→第3報→最終報)
                    </button>
                  )}
                  {onToggleTsunamiDemo && (
                    <button
                      type="button"
                      onClick={() => {
                        onToggleTsunamiDemo();
                        onClose();
                      }}
                      className="px-3 py-2.5 text-xs font-bold bg-purple-950/90 hover:bg-purple-900 border border-purple-400 text-purple-100 transition-colors text-center cursor-pointer"
                    >
                      🌊 {isTsunamiDemo ? '津波実況に戻す' : '津波警報デモ発火 (大津波警報)'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onTriggerTestEarthquake();
                      onClose();
                    }}
                    className="px-3 py-2.5 text-xs font-bold bg-red-950/90 hover:bg-red-900 border border-red-500 text-red-100 transition-colors text-center cursor-pointer"
                  >
                    テスト地震 (震度5強)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onTriggerTestVolcano();
                      onClose();
                    }}
                    className="px-3 py-2.5 text-xs font-bold bg-amber-950/90 hover:bg-amber-900 border border-amber-500 text-amber-100 transition-colors text-center cursor-pointer"
                  >
                    火山Lv変化 (桜島ズーム)
                  </button>
                </div>
              </div>

              {/* Row 3: Normal Loop Scene Selection */}
              <div className="bg-[#14171F] border border-[#2B303C] p-4">
                <div className="text-xs font-bold text-white mb-1">
                  通常ループに含める表示画面 ({enabledScenes.length}/
                  {normalLoopScenes.length} 有効)
                </div>
                <p className="text-[11px] text-neutral-400 mb-3">
                  ※気象解説情報は画面下部の全文FEEDおよび左タイムラインで常時表示されます。地震・火山・津波は発生・変化時に自動割り込みします。
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {normalLoopScenes.map((sc) => {
                    const isChecked = enabledScenes.includes(sc.id);
                    return (
                      <label
                        key={sc.id}
                        className={`flex items-start gap-2.5 p-3 border cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-[#1A1F2B] border-cyan-500/70'
                            : 'bg-[#0B0D12] border-neutral-800 opacity-60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => onToggleSceneEnabled(sc.id)}
                          className="mt-0.5 accent-cyan-400"
                        />
                        <div>
                          <div className="text-xs font-bold text-white">
                            {sc.index}. {sc.title}
                          </div>
                          <div className="text-[11px] text-neutral-400 mt-0.5">
                            {sc.subtitle}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ==================== TAB 2: XML TELEGRAM POPUP DETAIL ==================== */}
          {activeTab === 'xml' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
              {/* Highlighted Selected Telegram Full View (Top/Right prominence) */}
              <div className="lg:col-span-7 border border-[#3E434F] bg-[#14171F] p-5 flex flex-col justify-between">
                {activeEntry ? (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2 py-0.5 text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        {activeEntry.feedType}.xml 電文詳細
                      </span>
                      <span className="text-xs font-mono text-neutral-400">
                        {activeEntry.updated}
                      </span>
                    </div>
                    <h3
                      data-testid="popup-xml-title"
                      className="text-xl font-extrabold text-white mt-2.5 leading-snug"
                    >
                      {activeEntry.title}
                    </h3>
                    <div className="mt-2.5 flex flex-wrap items-center gap-4 text-xs font-mono text-neutral-300 border-t border-b border-[#2B303C] py-2">
                      <div>発表官署: {activeEntry.author}</div>
                      <div>分類: {activeEntry.category}</div>
                    </div>
                    <div className="mt-4">
                      <div className="text-xs font-bold text-neutral-300 mb-2">
                        電文全文内容：
                      </div>
                      <div
                        data-testid="popup-xml-content"
                        className="bg-[#0B0D12] border border-[#2B303C] p-4 text-sm text-white leading-relaxed font-medium whitespace-pre-wrap break-words"
                      >
                        {activeEntry.content}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-neutral-400">
                    電文を選択してください
                  </div>
                )}

                <div className="mt-4 pt-3 border-t border-[#2B303C] text-[11px] text-neutral-400">
                  左側のタイムラインをクリックすると、いつでも該当電文の全文をこのポップアップで確認できます。
                </div>
              </div>

              {/* Other XML Entries List */}
              <div className="lg:col-span-5 flex flex-col border border-[#2B303C] bg-[#111318] overflow-hidden max-h-[56vh]">
                <div className="p-2 border-b border-[#2B303C] flex items-center gap-1 bg-[#0B0D12]">
                  {(['all', 'eqvol', 'extra', 'regular'] as const).map((ft) => (
                    <button
                      key={ft}
                      type="button"
                      onClick={() => setFeedFilter(ft)}
                      className={`px-2 py-1 text-[10px] font-mono transition-colors cursor-pointer ${
                        feedFilter === ft
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 font-bold'
                          : 'text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      {ft === 'all'
                        ? 'すべて'
                        : ft === 'eqvol'
                          ? '地震火山'
                          : ft === 'extra'
                            ? '随時'
                            : '定時'}
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-[#2B303C]">
                  {filteredEntries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => onSelectEntry(entry)}
                      className={`w-full text-left p-3 transition-colors cursor-pointer ${
                        activeEntry?.id === entry.id
                          ? 'bg-[#1F2430] border-l-2 border-amber-400'
                          : 'hover:bg-[#181C24]'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono text-neutral-400">
                        <span className="text-amber-300">{entry.feedType}.xml</span>
                        <span>{entry.author}</span>
                      </div>
                      <div className="text-xs font-bold text-white mt-0.5">
                        {entry.title}
                      </div>
                      <div className="text-[11px] text-neutral-300 mt-1 line-clamp-2">
                        {entry.content}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ==================== TAB 3: STATIC HOSTING GUIDE ==================== */}
          {activeTab === 'deploy' && (
            <div className="space-y-4 text-xs text-neutral-300 leading-relaxed">
              <div className="bg-[#14171F] border border-[#2B303C] p-5">
                <h3 className="text-sm font-bold text-white">
                  GitHub Pages / Cloudflare Pages で完全無料公開する方法
                </h3>
                <p className="mt-2">
                  本アプリケーションはバックエンドサーバーを必要としない
                  <strong className="text-cyan-300">
                    完全クライアントサイド完結型（SPA）
                  </strong>
                  として実装されています。維持費0円で24時間365日稼働します。
                </p>
                <div className="mt-4 space-y-2 font-mono bg-[#0B0D12] border border-[#2B303C] p-4 text-neutral-200">
                  <div>1. ビルドを実行します： $ npm run build</div>
                  <div>
                    2. 生成された dist/ フォルダを GitHub Pages または Cloudflare Pages に配置します。
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

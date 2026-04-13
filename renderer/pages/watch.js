import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import {
  resolveAnime,
  getAnimeEpisodes,
  searchAnimeSources,
  startTorrentSession,
  getTorrentSessionStatus,
  stopTorrentSession,
} from '../utils/actions';
import { useToast } from '../providers/toast-provider';
import {
  Play, Pause, Volume2, Maximize, BarChart3,
  ChevronRight, ExternalLink, Download, Magnet,
  Tv, List, Clock, Calendar, Signal, Loader2,
  SkipForward, SkipBack, ChevronDown, Activity,
  Fullscreen, Minimize2
} from 'lucide-react';

const WATCH_EPISODES_COUNTS_ONLY = false;

/* ─── Retry helper ─────────────────────────────────────────────── */
const retryWithBackoff = async (fn, maxRetries = 3, initialDelayMs = 1000) => {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isRateLimit = err.status === 429 || err.message?.includes('429');
      const isNetworkError = !err.status || err.message?.includes('network');
      if ((isRateLimit || isNetworkError) && attempt < maxRetries - 1) {
        const delay = initialDelayMs * Math.pow(2, attempt);
        console.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms...`, err.message);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
};

const formatBitrate = (bytesPerSecond) => {
  const bps = Number(bytesPerSecond) * 8;
  if (!Number.isFinite(bps) || bps <= 0) return '—';
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} Kbps`;
  return `${Math.round(bps)} bps`;
};

const formatPeerCount = (value) => {
  const peers = Number(value);
  if (!Number.isFinite(peers)) return '—';
  return `${Math.max(0, Math.round(peers))}`;
};

const formatTime = (seconds) => {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total < 0) return '00:00';
  const rounded = Math.floor(total);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

/* ═══════════════════════════════════════════════════════════════ */
/* COMPONENT                                                      */
/* ═══════════════════════════════════════════════════════════════ */
export default function WatchPage() {
  const router = useRouter();
  const { mal_id, season, episode } = router.query;
  const { toast } = useToast();

  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState({ title: '', rootMalId: null, matchedMalId: null, seasons: [] });
  const [activeSeasonId, setActiveSeasonId] = useState(null);
  const [activeEpisodeNum, setActiveEpisodeNum] = useState(1);
  const [episodes, setEpisodes] = useState([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [episodePageIndex, setEpisodePageIndex] = useState(1);
  const EPISODES_PER_PAGE = 12;

  const [showStats, setShowStats] = useState(false);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState(null);
  const [streamPayload, setStreamPayload] = useState({ count: 0, results: [], metadata: {} });
  const [playerHovered, setPlayerHovered] = useState(false);
  const [streamSession, setStreamSession] = useState(null);
  const [streamSessionStatus, setStreamSessionStatus] = useState(null);
  const [streamBooting, setStreamBooting] = useState(false);
  const [playerError, setPlayerError] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackState, setPlaybackState] = useState({
    currentTime: 0,
    duration: 0,
    isLive: true,
  });
  const [isSeeking, setIsSeeking] = useState(false);

  const fetchingRef = useRef(new Set());
  const metaRef = useRef(meta);
  useEffect(() => { metaRef.current = meta; }, [meta]);
  const episodeListRef = useRef(null);
  const playerContainerRef = useRef(null);
  const streamSessionRef = useRef(null);
  const statusPollRef = useRef(null);
  const videoRef = useRef(null);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === playerContainerRef.current);
    };

    syncFullscreenState();
    document.addEventListener('fullscreenchange', syncFullscreenState);

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState);
    };
  }, []);

  /* ─── 1. RESOLVE FRANCHISE ─────────────────────────────────── */
  useEffect(() => {
    if (!router.isReady || !mal_id) return;
    let mounted = true;
    const resolve = async () => {
      setError(null);

      const requestedMalId = parseInt(mal_id, 10);
      const cachedFranchise = metaRef.current;
      const hasLoadedFranchise = Array.isArray(cachedFranchise?.seasons) && cachedFranchise.seasons.length > 0;
      const cachedSeason = hasLoadedFranchise
        ? cachedFranchise.seasons.find(s => Number(s.malId) === requestedMalId)
        : null;

      if (cachedSeason) {
        if (mounted) {
          setLoading(false);
          setActiveSeasonId(requestedMalId);
        }
        return;
      }

      setLoading(true);
      try {
        const resolvedData = await retryWithBackoff(() =>
          resolveAnime({ id: requestedMalId })
        );
        if (!mounted) return;
        setMeta({
          title: resolvedData.title || 'Anime',
          rootMalId: resolvedData.rootMalId,
          matchedMalId: resolvedData.matchedMalId,
          seasons: (resolvedData.seasons || []).map(s => ({
            ...s,
            episodesHasNext: true,
            episodesTotalCount: null,
            episodesTotalPages: null,
          })),
        });
        setActiveSeasonId(requestedMalId);
      } catch (err) {
        console.error(err);
        toastRef.current(err.message || 'Error resolving anime', 'error');
        if (mounted) setError(err.message || 'Error resolving anime');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    resolve();
    return () => { mounted = false; };
  }, [router.isReady, mal_id]);

  /* ─── 2. SYNC EPISODE NUMBER FROM URL ──────────────────────── */
  useEffect(() => {
    if (!router.isReady) return;
    const epNum = episode ? Math.max(1, parseInt(episode, 10)) : 1;
    setActiveEpisodeNum(epNum);
    const page = Math.ceil(epNum / EPISODES_PER_PAGE);
    setEpisodePageIndex(page);
  }, [router.isReady, episode]);

  /* ─── 3. FETCH EPISODES ────────────────────────────────────── */
  useEffect(() => {
    if (!activeSeasonId) return;
    let mounted = true;
    const key = `episodes_${activeSeasonId}`;
    if (fetchingRef.current.has(key)) return;
    fetchingRef.current.add(key);
    const fetchEpisodes = async () => {
      setEpisodesLoading(true);
      try {
        const seasonEntry = metaRef.current.seasons.find(s => s.malId === activeSeasonId);
        const fallbackCount = Number.isFinite(Number(seasonEntry?.episodesCount)) ? Number(seasonEntry.episodesCount) : null;
        const result = await retryWithBackoff(() =>
          getAnimeEpisodes(activeSeasonId, 1, {
            countsOnly: WATCH_EPISODES_COUNTS_ONLY,
            fallbackCount,
          })
        );
        if (!mounted) return;
        const eps = result.episodes || result || [];
        const pagination = result.pagination || {};

        setEpisodes(Array.isArray(eps) ? eps : []);

        const totalItems = pagination.items?.total ?? pagination.total ?? null;
        const episodesTotalPages = totalItems ? Math.ceil(totalItems / EPISODES_PER_PAGE) : null;

        setMeta(prev => ({
          ...prev,
          seasons: prev.seasons.map(s =>
            s.malId === activeSeasonId
              ? {
                ...s,
                episodesHasNext: pagination.has_next_page ?? false,
                episodesTotalCount: totalItems,
                episodesTotalPages: episodesTotalPages,
                episodesPage: pagination.current_page || 1
              }
              : s
          )
        }));
      } catch (err) {
        console.error(err);
        toastRef.current(err.message || 'Error fetching episodes', 'error');
        if (mounted) setEpisodes([]);
      } finally {
        fetchingRef.current.delete(key);
        if (mounted) setEpisodesLoading(false);
      }
    };
    fetchEpisodes();
    return () => { mounted = false; };
  }, [activeSeasonId]);

  const activeSeason = meta.seasons.find(s => s.malId === activeSeasonId);

  const isTvFranchiseEntry = (entry) => String(entry?.format || '').toUpperCase().startsWith('TV');
  const activeSeasonIndex = meta.seasons.findIndex(s => s.malId === activeSeasonId);
  const activeSeasonNumber = activeSeasonIndex >= 0
    ? meta.seasons.slice(0, activeSeasonIndex + 1).filter(isTvFranchiseEntry).length
    : null;
  const formatSeasonEpisodeCode = (seasonNumber, episodeNumber) => {
    const safeEpisode = Math.max(1, Number(episodeNumber) || 1);
    const ep = String(safeEpisode).padStart(2, '0');
    if (!seasonNumber || seasonNumber < 1) return `E${ep}`;
    const season = String(seasonNumber).padStart(2, '0');
    return `S${season}E${ep}`;
  };
  const activeEpisodeCode = formatSeasonEpisodeCode(activeSeasonNumber, activeEpisodeNum);

  /* ─── Load More Episodes Helper ────────────────────────────── */
  const loadMoreEpisodes = async () => {
    if (WATCH_EPISODES_COUNTS_ONLY) return;
    if (!activeSeason || !activeSeason.episodesHasNext || episodesLoading) return;

    const nextPage = (activeSeason.episodesPage || 1) + 1;
    const key = `episodes_${activeSeasonId}_${nextPage}`;

    if (fetchingRef.current.has(key)) return;
    fetchingRef.current.add(key);

    setEpisodesLoading(true);
    try {
      const result = await retryWithBackoff(() =>
        getAnimeEpisodes(activeSeasonId, nextPage)
      );
      const eps = result.episodes || result || [];
      const pagination = result.pagination || {};

      setEpisodes(prev => [...prev, ...(Array.isArray(eps) ? eps : [])]);

      setMeta(prev => ({
        ...prev,
        seasons: prev.seasons.map(s =>
          s.malId === activeSeasonId
            ? {
              ...s,
              episodesHasNext: pagination.has_next_page ?? false,
              episodesPage: pagination.current_page || nextPage
            }
            : s
        )
      }));
    } catch (err) {
      console.error(err);
      toastRef.current(err.message || 'Error fetching more episodes', 'error');
    } finally {
      fetchingRef.current.delete(key);
      setEpisodesLoading(false);
    }
  };

  const currentEpisode = episodes.find(e => e.mal_id === activeEpisodeNum);

  /* ─── Pagination Logic ─────────────────────────────────────── */
  const totalEpisodes = episodes.length;
  const totalPages = activeSeason?.episodesTotalPages || Math.ceil(totalEpisodes / EPISODES_PER_PAGE);
  const startIndex = (episodePageIndex - 1) * EPISODES_PER_PAGE;
  const visibleEpisodes = episodes.slice(startIndex, startIndex + EPISODES_PER_PAGE);

  const handleNextPage = async () => {
    const nextClientPage = episodePageIndex + 1;
    const neededCount = nextClientPage * EPISODES_PER_PAGE;

    if (episodes.length < neededCount && activeSeason?.episodesHasNext) {
      await loadMoreEpisodes();
    }

    if (nextClientPage <= totalPages || activeSeason?.episodesHasNext) {
      setEpisodePageIndex(nextClientPage);
      if (episodeListRef.current) episodeListRef.current.scrollTop = 0;
    }
  };

  const handlePrevPage = () => {
    setEpisodePageIndex(prev => Math.max(1, prev - 1));
    if (episodeListRef.current) episodeListRef.current.scrollTop = 0;
  };

  /* ─── 4. FETCH STREAMS ─────────────────────────────────────── */
  useEffect(() => {
    if (!meta.title || !activeSeasonId || !activeEpisodeNum) return;
    let mounted = true;
    const key = `streams_${activeSeasonId}_${activeEpisodeNum}`;
    setStreamPayload({ count: 0, results: [], metadata: {} });
    setStreamError(null);
    if (fetchingRef.current.has(key)) return;
    fetchingRef.current.add(key);
    setStreamLoading(true);
    const fetchStreams = async () => {
      try {
        const seasonInput = Number.isFinite(parseInt(season, 10))
          ? parseInt(season, 10) : activeSeason?.title;
        const params = {
          title: meta.title, season: seasonInput,
          malId: activeSeasonId,
          episode: activeEpisodeNum,
          options: { strict: true, includeLooseNumeric: false, includeNonPadded: true, excludeTerms: ['dub'] },
        };
        const searched = await searchAnimeSources(params);
        if (!mounted) return;
        setStreamPayload({
          count: Number.isFinite(searched?.count) ? searched.count : 0,
          results: Array.isArray(searched?.results) ? searched.results : [],
          metadata: searched?.metadata || {},
        });
      } catch (err) {
        if (!mounted) return;
        console.error(err);
        setStreamError(err.message || 'Failed to fetch stream links');
        setStreamPayload({ count: 0, results: [], metadata: {} });
      } finally {
        fetchingRef.current.delete(key);
        if (mounted) setStreamLoading(false);
      }
    };
    fetchStreams();
    return () => { mounted = false; };
  }, [meta.title, activeSeasonId, activeSeason?.title, activeEpisodeNum, season]);

  const teardownPlayer = useCallback(() => {
    if (statusPollRef.current) {
      clearInterval(statusPollRef.current);
      statusPollRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }

    setIsPlaying(false);
    setPlaybackState({ currentTime: 0, duration: 0, bufferedEnd: 0, isLive: true });
  }, []);

  const stopActiveSession = useCallback(async () => {
    const currentSessionId = streamSessionRef.current?.sessionId;
    teardownPlayer();
    if (!currentSessionId) return;

    try {
      await stopTorrentSession(currentSessionId);
    } catch (err) {
      console.warn('[watch] Failed to stop stream session:', err?.message || err);
    } finally {
      streamSessionRef.current = null;
      setStreamSession(null);
      setStreamSessionStatus(null);
    }
  }, [teardownPlayer]);

  const attachPlayback = useCallback(async (streamUrl) => {
    if (!videoRef.current || !streamUrl) return;
    const video = videoRef.current;

    setPlayerError(null);
    video.src = streamUrl;
    video.preload = 'auto';
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const playerContainer = playerContainerRef.current;
    if (!playerContainer) return;

    try {
      if (document.fullscreenElement === playerContainer) {
        await document.exitFullscreen();
        return;
      }

      if (playerContainer.requestFullscreen) {
        await playerContainer.requestFullscreen();
        return;
      }

      if (videoRef.current?.requestFullscreen) {
        await videoRef.current.requestFullscreen();
      }
    } catch (err) {
      console.warn('[watch] Failed to toggle fullscreen:', err?.message || err);
    }
  }, []);

  const beginStatusPolling = useCallback((sessionId) => {
    if (statusPollRef.current) clearInterval(statusPollRef.current);
    statusPollRef.current = setInterval(async () => {
      try {
        const nextStatus = await getTorrentSessionStatus(sessionId);
        setStreamSessionStatus(nextStatus);
      } catch (err) {
        console.warn('[watch] Failed to poll stream status:', err?.message || err);
      }
    }, 2000);
  }, []);

  const handleStartStream = useCallback(async (entry) => {
    const magnetLink = (entry?.links || []).find((link) => link?.isMagnet && link?.href);
    if (!magnetLink?.href) {
      toastRef.current('No valid magnet link was found for this source', 'error');
      return;
    }

    setStreamBooting(true);
    setPlayerError(null);

    try {
      await stopActiveSession();

      const createdSession = await startTorrentSession({
        magnetUri: magnetLink.href,
        preferredFileIndex: Number.isFinite(Number(entry?.fileIdx)) ? Number(entry.fileIdx) : null,
        fileNameHint: entry?.fileNameHint || entry?.behaviorHints?.filename || null,
        trackers: Array.isArray(entry?.trackers) ? entry.trackers : [],
        sourceTitle: entry?.title || meta.title,
      });

      streamSessionRef.current = createdSession;
      setStreamSession(createdSession);
      setStreamSessionStatus({
        status: createdSession.status,
        metrics: { peers: 0, downloadSpeed: 0 },
        fileName: createdSession.fileName,
      });

      beginStatusPolling(createdSession.sessionId);
    } catch (err) {
      console.error(err);
      setPlayerError(err?.message || 'Failed to start stream');
      toastRef.current(err?.message || 'Failed to start stream', 'error');
    } finally {
      setStreamBooting(false);
    }
  }, [beginStatusPolling, meta.title, stopActiveSession]);

  useEffect(() => {
    let cancelled = false;

    const startPlayback = async () => {
      const streamUrl = streamSession?.streamingUrl;
      if (!streamUrl) return;

      try {
        await attachPlayback(streamUrl);
        if (cancelled || !videoRef.current) return;

        try {
          await videoRef.current.play();
        } catch {
          if (!videoRef.current) return;
          videoRef.current.muted = true;
          await videoRef.current.play();
        }

        if (!cancelled) {
          setIsPlaying(true);
        }
      } catch (err) {
        if (cancelled) return;
        const message = err?.message || 'Failed to attach player';
        setPlayerError(message);
        console.error('[watch] Playback attach failed:', err);
      }
    };

    startPlayback();

    return () => {
      cancelled = true;
    };
  }, [attachPlayback, streamSession?.streamingUrl]);

  const togglePlayPause = useCallback(async () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      try {
        await videoRef.current.play();
        setIsPlaying(true);
      } catch (err) {
        setPlayerError('Unable to resume playback');
      }
      return;
    }

    videoRef.current.pause();
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updatePlaybackState = () => {
      const duration = Number(video.duration);
      const isFiniteDuration = Number.isFinite(duration) && duration > 0;
      const bufferedEnd = video.buffered?.length ? video.buffered.end(video.buffered.length - 1) : 0;
      const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;

      setPlaybackState({
        currentTime,
        duration: isFiniteDuration ? duration : 0,
        bufferedEnd: Number.isFinite(bufferedEnd) ? bufferedEnd : 0,
        isLive: !isFiniteDuration,
      });
    };

    updatePlaybackState();

    video.addEventListener('loadedmetadata', updatePlaybackState);
    video.addEventListener('durationchange', updatePlaybackState);
    video.addEventListener('timeupdate', updatePlaybackState);
    video.addEventListener('progress', updatePlaybackState);
    video.addEventListener('playing', updatePlaybackState);
    video.addEventListener('pause', updatePlaybackState);
    video.addEventListener('waiting', updatePlaybackState);

    return () => {
      video.removeEventListener('loadedmetadata', updatePlaybackState);
      video.removeEventListener('durationchange', updatePlaybackState);
      video.removeEventListener('timeupdate', updatePlaybackState);
      video.removeEventListener('progress', updatePlaybackState);
      video.removeEventListener('playing', updatePlaybackState);
      video.removeEventListener('pause', updatePlaybackState);
      video.removeEventListener('waiting', updatePlaybackState);
    };
  }, [streamSession?.sessionId]);

  const handleSeek = useCallback(async (event) => {
    const video = videoRef.current;
    if (!video) return;

    // Prefer server-reported duration (available before the video element knows it)
    const knownDuration = Number.isFinite(Number(streamSessionStatus?.durationSeconds))
      ? Number(streamSessionStatus.durationSeconds)
      : Number(video.duration);

    if (!knownDuration || knownDuration <= 0) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const targetTime = ratio * knownDuration;

    const streamUrl = streamSession?.streamingUrl;
    if (!streamSession?.sessionId || !streamUrl) {
      // No active torrent session — plain HTML5 seek is enough
      video.currentTime = targetTime;
      return;
    }

    // Best effort: notify backend to prioritize pieces near the target.
    setIsSeeking(true);
    try {
      const urlObj = new URL(streamUrl);
      const seekUrl = `${urlObj.protocol}//${urlObj.host}/seek/${streamSession.sessionId}?t=${Math.floor(targetTime)}`;
      await fetch(seekUrl, { method: 'POST' });
      video.currentTime = targetTime;

      if (video.paused) {
        try { await video.play(); setIsPlaying(true); } catch { /* autoplay policy */ }
      }
    } catch (err) {
      console.error('[watch] Seek failed:', err);
    } finally {
      setIsSeeking(false);
    }
  }, [streamSession, streamSessionStatus?.durationSeconds]);

  useEffect(() => {
    return () => {
      stopActiveSession();
    };
  }, [stopActiveSession]);

  useEffect(() => {
    stopActiveSession();
  }, [activeSeasonId, activeEpisodeNum, stopActiveSession]);

  /* ─── Scroll active episode into view ──────────────────────── */
  useEffect(() => {
    if (!episodeListRef.current || episodesLoading) return;
    const activeEl = episodeListRef.current.querySelector('[data-active="true"]');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeEpisodeNum, episodesLoading]);

  /* ─── NAV HELPERS ──────────────────────────────────────────── */
  const selectEpisode = useCallback((episodeNum) => {
    const query = { mal_id: activeSeasonId };
    if (episodeNum > 1) query.episode = episodeNum;
    router.replace({ pathname: '/watch', query }, undefined, { shallow: true });
  }, [router, activeSeasonId]);

  const navigateToSeason = useCallback((seasonMalId) => {
    router.push({ pathname: '/watch', query: { mal_id: seasonMalId } });
  }, [router]);

  /* ─── Derived counts ───────────────────────────────────────── */
  const totalLinks = streamPayload.count || streamPayload.results.reduce((acc, entry) => acc + (entry.links?.length || 0), 0);
  const streamPeers = formatPeerCount(streamSessionStatus?.metrics?.peers);
  const streamBitrate = formatBitrate(streamSessionStatus?.metrics?.downloadSpeed);
  const streamHealth = streamSessionStatus?.status || (streamSession ? 'starting' : 'idle');
  const isLivePlayback = Boolean(streamSession?.sessionId) && streamHealth !== 'completed';
  const expectedDurationSeconds = Number.isFinite(Number(streamSessionStatus?.durationSeconds))
    ? Number(streamSessionStatus.durationSeconds)
    : null;
  const durationSeconds = playbackState.duration;
  const displayCurrentTime = playbackState.currentTime;
  const displayDurationSeconds = isLivePlayback
    ? (expectedDurationSeconds || 0)
    : durationSeconds;
  const progressPercent = displayDurationSeconds > 0
    ? Math.max(0, Math.min(100, (displayCurrentTime / displayDurationSeconds) * 100))
    : 0;
  const bufferedPercent = displayDurationSeconds > 0
    ? Math.max(0, Math.min(100, (playbackState.bufferedEnd / displayDurationSeconds) * 100))
    : 0;
  const streamResolution = (() => {
    if (!videoRef.current || !videoRef.current.videoHeight) return '—';
    return `${videoRef.current.videoWidth}x${videoRef.current.videoHeight}`;
  })();

  const activeSeasonStats = [
    { label: 'MAL ID', value: activeSeason?.malId },
    { label: 'Format', value: activeSeason?.format },
    { label: 'Status', value: activeSeason?.status },
    { label: 'Source', value: activeSeason?.source },
    { label: 'Rating', value: activeSeason?.rating },
    { label: 'Episodes', value: activeSeason?.episodesTotalCount || activeSeason?.episodesCount || null },
    { label: 'Duration', value: activeSeason?.duration },
    { label: 'Season', value: activeSeason?.season && activeSeason?.year ? `${activeSeason.season} ${activeSeason.year}` : (activeSeason?.year || activeSeason?.season || null) },
  ].filter(item => item.value !== null && item.value !== undefined && item.value !== '');

  const activeSeasonSignal = [
    { label: 'Score', value: activeSeason?.score ?? 'N/A' },
    { label: 'Rank', value: activeSeason?.rank ? `#${activeSeason.rank}` : 'N/A' },
    { label: 'Popularity', value: activeSeason?.popularity ? `#${activeSeason.popularity}` : 'N/A' },
  ];

  /* ─── MEDIA QUERY (responsive grid) ────────────────────────── */
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e) => setIsDesktop(e.matches);
    handler(mq);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <div className="min-h-screen bg-[#04000a] text-white relative pb-16 font-poppins overflow-x-hidden">

      {/* ── Ambient Backdrop ────────────────────────────────── */}
      <div className="fixed inset-0 h-screen overflow-hidden pointer-events-none z-0">
        {activeSeason?.image ? (
          <img
            src={activeSeason.image}
            alt=""
            className="w-full h-full object-cover opacity-12 blur-[100px] saturate-200 scale-110"
          />
        ) : (
          <div className="w-full h-full bg-[radial-gradient(circle_at_20%_30%,rgba(230,0,118,0.1)_0%,transparent_50%),radial-gradient(circle_at_80%_70%,rgba(90,0,230,0.08)_0%,transparent_50%)]" />
        )}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#04000a_100%),linear-gradient(to_bottom,transparent_0%,#04000a_90%)]" />
      </div>

      <div className="max-w-400 mx-auto px-8 pt-10 pb-6 relative z-10">

        {/* ── Loading ─────────────────────────────────────────── */}
        {loading && (
          <div className="flex items-center justify-center py-32">
            <div className="text-center flex flex-col items-center gap-6">
              <div className="w-12 h-12 border-3 border-[#ff2d9b]/10 border-t-[#ff2d9b] rounded-full animate-spin" />
              <p className="text-white/40 text-sm font-semibold tracking-widest">PREPARING STREAM</p>
            </div>
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────── */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-[20px] p-8 text-center mb-8 animate-in fade-in slide-in-from-bottom-2 duration-600">
            <p className="text-red-500/80 text-base font-semibold">{error}</p>
          </div>
        )}

        {/* ── Main Grid ───────────────────────────────────────── */}
        {!loading && !error && (
          <div className={`grid grid-cols-1 gap-10 items-start mt-6 ${isDesktop ? 'lg:grid-cols-[1fr_380px] lg:mt-12' : ''}`}>

            {/* ═══ LEFT: Player & Info ════════════════════════ */}
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-600 delay-100">
              {/* Video Player */}
              <div
                ref={playerContainerRef}
                className="group relative w-full aspect-video rounded-3xl overflow-hidden bg-black border border-white/10 shadow-2xl transition-all duration-500"
                onMouseEnter={() => setPlayerHovered(true)}
                onMouseLeave={() => setPlayerHovered(false)}
              >
                {/* Video Element */}
                {streamSession?.streamingUrl ? (
                  <video
                    ref={videoRef}
                    className="w-full h-full object-contain bg-black"
                    controls={false}
                    playsInline
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-black">
                    <span className="text-white/30 font-mono text-xs tracking-[0.3em] uppercase select-none">
                      Awaiting Signal
                    </span>
                  </div>
                )}

                {/* Loading State */}
                {(streamBooting || isSeeking) && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-20">
                    <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-black/50 text-white/90 text-xs tracking-widest uppercase">
                      <Loader2 size={14} className="animate-spin" />
                      {isSeeking ? 'Seeking' : 'Initializing'}
                    </div>
                  </div>
                )}

                {/* Error Overlay */}
                {playerError && (
                  <div className="absolute top-4 right-4 z-30 text-xs bg-red-500/10 border border-red-500/20 text-red-300 px-4 py-2 rounded-lg backdrop-blur-md max-w-xs">
                    {playerError}
                  </div>
                )}

                {/* Minimal Stats Overlay */}
                {showStats && (
                  <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-xl border border-white/10 p-4 rounded-xl text-xs font-mono text-white/60 z-40 w-60 animate-in fade-in duration-200">
                    <div className="text-white/90 font-semibold mb-3 tracking-wider">
                      STATISTICS
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between">
                        <span>Res</span><span className="text-white">{streamResolution}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Bitrate</span><span className="text-white">{streamBitrate}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Peers</span><span className="text-white">{streamPeers}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Status</span><span className="text-white">{streamHealth}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Minimalist Controls */}
                <div className="absolute bottom-0 inset-x-0 bg-linear-to-t from-black/80 via-black/20 to-transparent pt-12 px-6 pb-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-30">

                  {/* Sleek Seek Bar */}
                  <div
                    className="group/seek w-full h-1 bg-white/20 rounded-full mb-5 cursor-pointer relative flex items-center"
                    onClick={handleSeek}
                    role="slider"
                    aria-label="Seek"
                    aria-valuemin={0}
                    aria-valuemax={displayDurationSeconds || 0}
                    aria-valuenow={displayCurrentTime}
                  >
                    <div className="absolute inset-y-0 left-0 bg-white/30 rounded-full" style={{ width: `${bufferedPercent}%` }} />
                    <div className="absolute inset-y-0 left-0 bg-white rounded-full transition-all" style={{ width: `${progressPercent}%` }}>
                      <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover/seek:opacity-100 transition-opacity duration-200 shadow-sm" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    {/* Left Controls: Play, Volume, Time */}
                    <div className="flex items-center gap-5">
                      <button
                        onClick={togglePlayPause}
                        disabled={!streamSession?.streamingUrl}
                        className="text-white hover:text-white/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                      </button>

                      <button className="text-white/70 hover:text-white transition-colors">
                        <Volume2 size={18} />
                      </button>

                      <span className="text-xs font-mono text-white/50 tracking-wide mt-0.5">
                        {isLivePlayback
                          ? `${formatTime(displayCurrentTime)} / ${expectedDurationSeconds ? formatTime(expectedDurationSeconds) : 'LIVE'}`
                          : `${formatTime(playbackState.currentTime)} / ${formatTime(durationSeconds)}`}
                      </span>
                    </div>

                    {/* Right Controls: Stats, Fullscreen */}
                    <div className="flex items-center gap-5">
                      <button
                        onClick={() => setShowStats(!showStats)}
                        className={`transition-colors ${showStats ? 'text-white' : 'text-white/50 hover:text-white'}`}
                        title="Stream Stats"
                      >
                        <Activity size={18} />
                      </button>

                      <button
                        onClick={toggleFullscreen}
                        className="text-white/70 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                      >
                        {isFullscreen ? <Minimize2 size={18} /> : <Fullscreen size={18} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Episode Info ──────────────────────────────── */}
              <div className="mt-8 border-b border-white/6 pb-8">
                <h1 className="text-4xl font-extrabold tracking-tighter leading-[1.1] flex flex-wrap items-baseline gap-3">
                  <span className="text-[#ff2d9b] font-black whitespace-nowrap">{activeEpisodeCode}</span>
                  <span className="text-white/98">
                    {currentEpisode?.title || `Episode ${activeEpisodeNum}`}
                  </span>
                </h1>
                <p className="mt-3 text-[0.875rem] text-white/40 font-medium flex items-center gap-3">
                  <span className="text-white/70 font-semibold">{meta.title}</span>
                  {/* <span className="w-1 h-1 rounded-full bg-white/20 inline-block" /> */}
                  {/* <span>{currentEpisode?.aired ? new Date(currentEpisode.aired).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Release date unknown'}</span> */}
                </p>
              </div>

              {/* ── Active Season Details ─────────────────────── */}
              <div className="mt-8 rounded-3xl border border-white/8 bg-[#0a0014]/35 backdrop-blur-xl p-6 md:p-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[0.68rem] uppercase tracking-[0.22em] text-white/35 font-extrabold">Current Franchise Entry</p>
                    <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white mt-1">{activeSeason?.title || meta.title}</h2>
                    {activeSeason?.titleJapanese && (
                      <p className="text-[0.8rem] text-white/35 font-medium mt-1">{activeSeason.titleJapanese}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {activeSeasonSignal.map((stat) => (
                      <div key={stat.label} className="min-w-22 rounded-xl border border-white/10 bg-white/4 px-3 py-2 text-center">
                        <p className="text-[0.6rem] uppercase tracking-wider text-white/35 font-semibold">{stat.label}</p>
                        <p className="text-[0.9rem] font-bold text-[#ff71bd] mt-0.5">{stat.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {activeSeason?.genres?.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {activeSeason.genres.slice(0, 8).map((genre) => (
                      <span key={genre} className="px-2.5 py-1 rounded-lg border border-[#ff2d9b]/20 bg-[#ff2d9b]/10 text-[0.66rem] uppercase tracking-wider text-[#ff71bd] font-bold">
                        {genre}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {activeSeasonStats.map((item) => (
                    <div key={item.label} className="rounded-xl border border-white/10 bg-white/3 px-4 py-3 flex items-center justify-between gap-3">
                      <span className="text-[0.68rem] uppercase tracking-[0.18em] text-white/35 font-semibold">{item.label}</span>
                      <span className="text-[0.8rem] text-white/82 font-semibold text-right">{item.value}</span>
                    </div>
                  ))}
                </div>

                {activeSeason?.studios?.length > 0 && (
                  <p className="mt-5 text-[0.8rem] text-white/52">
                    <span className="uppercase tracking-[0.16em] text-white/35 font-semibold text-[0.66rem] mr-2">Studios</span>
                    {activeSeason.studios.join(', ')}
                  </p>
                )}

                {activeSeason?.synopsis && (
                  <p className="mt-5 text-[0.88rem] leading-relaxed text-white/70">
                    {activeSeason.synopsis}
                  </p>
                )}
              </div>

              {/* ── Streams ──────────────────────────────────── */}
              <div className="mt-10 max-w-5xl">
                <div className="flex items-center justify-between mb-5">
                  <span className="text-[0.8rem] uppercase tracking-[0.15em] font-bold text-white/40">Available Sources</span>
                  <span className={`text-[0.7rem] font-semibold px-3 py-1.5 rounded-[10px] inline-flex items-center gap-1.5 ${streamLoading ? 'bg-white/5 border border-white/10 text-white/45' : 'bg-[#ff2d9b]/12 border border-[#ff2d9b]/20 text-[#ff71bd]'
                    }`}>
                    {streamLoading ? (
                      <><div className="w-5 h-5 border-2 border-[#ff2d9b]/10 border-t-[#ff2d9b] rounded-full animate-spin" /> Synchronizing…</>
                    ) : streamError ? (
                      'Search Failed'
                    ) : (
                      `${totalLinks} Signal${totalLinks !== 1 ? 's' : ''} Found`
                    )}
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  {/* Metadata links */}
                  {!streamLoading && !streamError && (streamPayload.metadata?.torrentioUrl || streamPayload.metadata?.tpbUrl) && (
                    <div className="px-5 py-3 rounded-2xl border border-white/5 bg-white/1 flex flex-wrap items-center gap-4 text-[0.7rem] text-white/35 font-semibold mb-2">
                      {streamPayload.metadata?.torrentioUrl && (
                        <span>
                          PRIMARY:
                          <a href={streamPayload.metadata.torrentioUrl} target="_blank" rel="noreferrer" className="text-[#ff2d9b] no-underline font-bold ml-1.5 hover:text-[#ff71bd] hover:underline transition-colors">
                            Torrentio ↗
                          </a>
                        </span>
                      )}
                      {streamPayload.metadata?.tpbUrl && (
                        <span>
                          FALLBACK:
                          <a href={streamPayload.metadata.tpbUrl} target="_blank" rel="noreferrer" className="text-[#ff2d9b] no-underline font-bold ml-1.5 hover:text-[#ff71bd] hover:underline transition-colors">
                            PirateBay ↗
                          </a>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Loading */}
                  {streamLoading && Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="p-3 px-5 rounded-2xl border border-white/6 bg-white/2 flex items-center gap-6 justify-between opacity-50 animate-pulse">
                      <div className="h-5 w-[60%] bg-white/5 rounded" />
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-20 bg-white/5 rounded-xl" />
                      </div>
                    </div>
                  ))}

                  {/* Error */}
                  {!streamLoading && streamError && (
                    <div className="p-12 text-center bg-white/2 rounded-3xl border border-dashed border-white/10">
                      <p className="text-red-500/60 text-[0.9rem] font-medium">{streamError}</p>
                    </div>
                  )}

                  {/* Empty */}
                  {!streamLoading && !streamError && streamPayload.results.length === 0 && (
                    <div className="p-16 text-center bg-white/2 rounded-3xl border border-dashed border-white/10">
                      <p className="text-white/30 text-[0.9rem] font-medium">No transmission found for this sector.</p>
                    </div>
                  )}

                  {/* Results */}
                  {!streamLoading && !streamError && streamPayload.results.length > 0 && (
                    streamPayload.results.slice(0, 8).map((entry, idx) => (
                      <div
                        key={`${entry.title}_${idx}`}
                        className="group p-3 px-5 rounded-2xl border border-white/6 bg-white/2 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 justify-between hover:bg-white/5 hover:border-white/12 hover:-translate-y-0.5 transition-all duration-300 ease-in-out"
                      >
                        <div className="flex items-start sm:items-center gap-3 sm:gap-4 flex-1 min-w-0 w-full">
                          <p className="text-[0.875rem] text-white/85 font-semibold wrap-break-word leading-snug flex-1 min-w-0">{entry.title}</p>
                          {entry.source && (
                            <span className="text-[0.65rem] px-2 py-1 rounded-md bg-[#ff2d9b]/10 border border-[#ff2d9b]/20 text-[#ff71bd] uppercase tracking-wider font-extrabold shrink-0">{entry.source}</span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:justify-end">
                          <button
                            onClick={() => handleStartStream(entry)}
                            disabled={streamBooting}
                            className="text-[0.7rem] px-3 py-2 rounded-xl border border-[#ff2d9b]/30 bg-[#ff2d9b]/15 text-[#ff8cc9] inline-flex items-center gap-1.5 font-bold whitespace-nowrap hover:bg-[#ff2d9b] hover:border-[#ff2d9b] hover:text-white hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(255,45,155,0.4)] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {streamBooting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                            Stream
                          </button>
                          {(entry.links || []).slice(0, 3).map((link, linkIdx) => (
                            <a
                              key={`${link.href || link.text}_${linkIdx}`}
                              href={link.href}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[0.7rem] px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white/70 inline-flex items-center gap-1.5 font-bold whitespace-nowrap hover:bg-[#ff2d9b] hover:border-[#ff2d9b] hover:text-white hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(255,45,155,0.4)] transition-all duration-200"
                            >
                              {link.isMagnet ? <Magnet size={14} /> : <ExternalLink size={14} />}
                              {link.text || (link.isMagnet ? 'Magnet' : 'Stream')}
                            </a>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* ═══ RIGHT: Sidebar ═════════════════════════════ */}
            <div
              className={`animate-in fade-in slide-in-from-bottom-2 duration-600 delay-200 ${isDesktop ? 'flex flex-col gap-12 sticky top-10 max-h-[calc(100vh-5rem)]' : ''}`}
            >

              {/* ── Franchise ─────────────────────────────────── */}
              <div className="rounded-3xl border border-white/8 bg-[#0a0014]/40 backdrop-blur-xl p-5 flex flex-col max-h-[35vh]">
                <h3 className="text-[0.75rem] uppercase tracking-[0.2em] font-extrabold text-white/40 mb-4 flex items-center gap-2.5 shrink-0">
                  <Tv size={14} className="opacity-60" />
                  Franchise
                </h3>
                <div className="overflow-y-auto flex flex-col gap-2 pr-1 scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20">
                  {meta.seasons.length === 0 ? (
                    <p className="text-[0.8rem] text-white/20 p-4 text-center">No timeline data</p>
                  ) : (
                    meta.seasons.map((s) => {
                      const isActive = s.malId === activeSeasonId;
                      return (
                        <button
                          key={s.malId}
                          onClick={() => navigateToSeason(s.malId)}
                          className={`group w-full shrink-0 flex items-center gap-3.5 p-3 rounded-2xl border border-transparent cursor-pointer text-left transition-all duration-300 ease-in-out relative overflow-hidden hover:bg-white/5 hover:border-white/10 ${isActive ? 'bg-[#ff2d9b]/10 border-[#ff2d9b]/15' : ''
                            }`}
                        >
                          {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 rounded-r-md bg-[#ff2d9b] shadow-[0_0_10px_rgba(255,45,155,0.6)]" />}
                          <div className={`flex flex-col gap-0.5 overflow-hidden ${isActive ? 'pl-2' : ''}`}>
                            <span className={`text-[0.65rem] uppercase tracking-wider font-bold opacity-60 ${isActive ? 'text-[#ff2d9b]' : 'text-white/30'}`}>
                              {s.format || 'TV'} • {s.year || 'TBA'}
                            </span>
                            <span className={`text-[0.875rem] font-semibold overflow-hidden text-ellipsis whitespace-nowrap leading-[1.4] ${isActive ? 'text-white' : 'text-white/50'}`}>
                              {s.title}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* ── Episodes ──────────────────────────────────── */}
              <div className="rounded-3xl border border-white/8 bg-[#0a0014]/40 backdrop-blur-xl flex flex-col flex-1 overflow-hidden min-h-112.5">
                <div className="p-5 border-b border-white/6 flex items-center justify-between shrink-0 bg-white/2">
                  <h3 className="text-[0.75rem] uppercase tracking-[0.2em] font-extrabold text-white/40 flex items-center gap-2.5">
                    <List size={14} className="opacity-60" />
                    Episodes
                  </h3>
                  <span className="text-[0.7rem] text-white/30 font-bold font-(family-name:--font-geist-mono) bg-white/5 px-2 py-1 rounded-md">
                    {episodesLoading ? 'SYNCING' : `${episodes.length} INDEXED`}
                  </span>
                </div>

                <div
                  ref={episodeListRef}
                  className="flex-1 overflow-y-auto p-3 scrollbar-thin scrollbar-thumb-white/10 hover:scrollbar-thumb-white/20"
                >
                  {episodesLoading && episodes.length === 0 ? (
                    <div className="flex items-center justify-center h-full py-12">
                      <div className="w-5 h-5 border-2 border-[#ff2d9b]/10 border-t-[#ff2d9b] rounded-full animate-spin" />
                    </div>
                  ) : episodes.length === 0 ? (
                    <div className="flex items-center justify-center h-full py-12 text-white/15 text-[0.8rem] font-medium">
                      Episode list unavailable
                    </div>
                  ) : (
                    visibleEpisodes.map((ep, idx) => {
                      const displayEpisodeNumber = startIndex + idx + 1;
                      const isEpActive = ep.mal_id === activeEpisodeNum;
                      return (
                        <button
                          key={ep.mal_id}
                          data-active={isEpActive}
                          onClick={() => selectEpisode(ep.mal_id)}
                          className={`group w-full flex items-center gap-4 p-3 px-4 rounded-2xl border border-transparent cursor-pointer text-left transition-all duration-200 ease-in-out mb-1 hover:bg-white/5 hover:border-white/10 ${isEpActive ? 'bg-[#ff2d9b]/10 border-[#ff2d9b]/20' : ''
                            }`}
                        >
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[0.8rem] font-extrabold shrink-0 transition-all duration-300 group-hover:bg-white/10 group-hover:text-white/80 ${isEpActive ? 'bg-[#ff2d9b] text-white shadow-[0_4px_12px_rgba(255,45,155,0.3)]' : 'bg-white/5 text-white/40'
                            }`}>
                            {isEpActive ? <Play size={14} fill="#fff" /> : displayEpisodeNumber}
                          </div>
                          <div className="flex flex-col overflow-hidden flex-1 min-w-0">
                            <span className={`text-[0.875rem] overflow-hidden text-ellipsis whitespace-nowrap transition-colors duration-200 ${isEpActive ? 'font-bold text-white' : 'font-medium text-white/65'}`}>
                              {ep.title || `Episode ${displayEpisodeNumber}`}
                            </span>
                            <span className="text-[0.65rem] text-white/30 uppercase tracking-wider font-semibold mt-0.5">
                              {formatSeasonEpisodeCode(activeSeasonNumber, displayEpisodeNumber)}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-3 p-4 border-t border-white/6 bg-white/1">
                    <button
                      disabled={episodePageIndex === 1}
                      onClick={handlePrevPage}
                      className="w-8 h-8 rounded-lg border border-white/8 bg-white/4 text-white/60 flex items-center justify-center cursor-pointer transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 hover:text-white"
                    >
                      <SkipBack size={12} fill="currentColor" />
                    </button>
                    <div className="text-[0.7rem] font-bold text-white/40 tracking-widest uppercase">
                      <span className="text-[#ff2d9b] mr-1">{episodePageIndex}</span>
                      <span>/ {totalPages}</span>
                    </div>
                    <button
                      disabled={episodePageIndex >= totalPages && !activeSeason?.episodesHasNext}
                      onClick={handleNextPage}
                      className="w-8 h-8 rounded-lg border border-white/8 bg-white/4 text-white/60 flex items-center justify-center cursor-pointer transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/10 hover:text-white"
                    >
                      <SkipForward size={12} fill="currentColor" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
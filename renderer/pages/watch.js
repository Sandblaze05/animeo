import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { resolveAnime, getAnimeEpisodes, searchAnimeSources } from '../utils/actions';
import { useToast } from '../providers/toast-provider';
import { Play } from 'lucide-react';

// Retry helper with exponential backoff
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

export default function WatchPage() {
  const router = useRouter();
  const { mal_id, season, episode } = router.query;
  const { toast } = useToast();

  // Keep toast in a ref so it never destabilizes useEffect dependency arrays
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState({ title: '', rootMalId: null, matchedMalId: null, seasons: [] });
  const [activeSeasonId, setActiveSeasonId] = useState(null);
  const [activeEpisodeNum, setActiveEpisodeNum] = useState(1);
  const [episodes, setEpisodes] = useState([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState(null);
  const [streamPayload, setStreamPayload] = useState({ count: 0, results: [], metadata: {} });

  // Tracks in-flight requests — keyed so we never double-fire the same fetch
  const fetchingRef = useRef(new Set());
  const metaRef = useRef(meta);
  useEffect(() => { metaRef.current = meta; }, [meta]);

  // ─── 1. RESOLVE FRANCHISE ────────────────────────────────────────────────
  // Only re-runs when the *anime* (mal_id) changes, NOT when the episode changes.
  // Removing `episode` and `toast` from deps stops unnecessary re-resolves.
  useEffect(() => {
    if (!router.isReady || !mal_id) return;

    let mounted = true;
    const resolve = async () => {
      setLoading(true);
      setError(null);
      try {
        const resolvedData = await retryWithBackoff(() =>
          resolveAnime({ id: parseInt(mal_id, 10) })
        );
        if (!mounted) return;

        setMeta({
          title: resolvedData.title || 'Anime',
          rootMalId: resolvedData.rootMalId,
          matchedMalId: resolvedData.matchedMalId,
          seasons: resolvedData.seasons || [],
        });

        setActiveSeasonId(parseInt(mal_id, 10));
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
    // ⚠️ intentionally omitting `episode` — episode changes must NOT re-resolve the anime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, mal_id]);

  // ─── 2. SYNC EPISODE NUMBER FROM URL (separate from resolve) ─────────────
  // Runs whenever the URL episode param changes (e.g. shallow navigation or
  // direct link). Kept separate so it doesn't force a full anime re-resolve.
  useEffect(() => {
    if (!router.isReady) return;
    const epNum = episode ? Math.max(1, parseInt(episode, 10)) : 1;
    setActiveEpisodeNum(epNum);
  }, [router.isReady, episode]);

  // ─── 3. FETCH EPISODES FOR ACTIVE SEASON ─────────────────────────────────
  useEffect(() => {
    if (!activeSeasonId) return;

    let mounted = true;
    const key = `episodes_${activeSeasonId}`;
    if (fetchingRef.current.has(key)) return;
    fetchingRef.current.add(key);

    const fetchEpisodes = async () => {
      setEpisodesLoading(true);
      try {
        const result = await retryWithBackoff(() =>
          getAnimeEpisodes(activeSeasonId, 1)
        );
        if (!mounted) return;
        const eps = result.episodes || result || [];
        setEpisodes(Array.isArray(eps) ? eps : []);
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
  const currentEpisode = episodes.find(e => e.mal_id === activeEpisodeNum);

  // ─── 4. FETCH STREAMS ─────────────────────────────────────────────────────
  // Depends on title + season + episode. Clears stale data immediately on
  // episode change so the UI never shows stale links while loading.
  useEffect(() => {
    if (!meta.title || !activeSeasonId || !activeEpisodeNum) return;

    let mounted = true;
    const key = `streams_${activeSeasonId}_${activeEpisodeNum}`;

    // Clear stale payload immediately so the user sees a loading state
    setStreamPayload({ count: 0, results: [], metadata: {} });
    setStreamError(null);

    if (fetchingRef.current.has(key)) return;
    fetchingRef.current.add(key);

    setStreamLoading(true);

    const fetchStreams = async () => {
      try {
        const seasonInput = Number.isFinite(parseInt(season, 10))
          ? parseInt(season, 10)
          : activeSeason?.title;

        const params = {
          title: meta.title,
          season: seasonInput,
          episode: activeEpisodeNum,
          options: {
            strict: true,
            includeLooseNumeric: false,
            includeNonPadded: true,
            excludeTerms: ['dub'],
          },
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
    // `season` (query param) is intentionally included because it feeds the search
  }, [meta.title, activeSeasonId, activeSeason?.title, activeEpisodeNum, season]);

  // ─── NAVIGATION HELPERS ───────────────────────────────────────────────────

  // Changing only the episode: use shallow routing so Next.js does NOT
  // unmount/remount the page or re-run server-side data fetching.
  // The URL updates, the episode useEffect picks up the new value, done.
  const selectEpisode = useCallback((episodeNum) => {
    const query = { mal_id: activeSeasonId };
    if (episodeNum > 1) query.episode = episodeNum;
    router.replace({ pathname: '/watch', query }, undefined, { shallow: true });
  }, [router, activeSeasonId]);

  // Changing the season (different mal_id) requires a full navigation because
  // the franchise data itself changes.
  const navigateToSeason = useCallback((seasonMalId) => {
    router.push({ pathname: '/watch', query: { mal_id: seasonMalId } });
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0b001f] text-[#ffffff] pb-24 relative selection:bg-[#e60076]/30">

      {/* Ambient Background */}
      <div className="fixed top-0 left-0 w-full h-[60vh] overflow-hidden pointer-events-none z-0">
        {activeSeason?.image ? (
          <img src={activeSeason.image} alt="Backdrop" className="w-full h-full object-cover opacity-10 blur-3xl scale-125" />
        ) : (
          <div className="w-full h-full bg-linear-to-br from-[#0b001f] to-[#e60076]/5" />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-[#0b001f] via-[#0b001f]/80 to-transparent" />
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 pt-24 relative z-10">

        {/* Header */}
        <div className="mb-6 flex items-center gap-3 text-sm">
          <span className="text-[#e60076] font-semibold tracking-wider uppercase text-[11px]">{meta.title || 'Loading...'}</span>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-12 h-12 border-2 border-[#e60076]/30 border-t-[#e60076] rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-white/60">Resolving anime...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center mb-8">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">

            {/* LEFT/MAIN CONTENT */}
            <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-8">

              {/* VIDEO PLAYER */}
              <div className="w-full rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(230,0,118,0.1)] border border-white/5 bg-black relative group aspect-video">
                <div className="absolute inset-0 flex items-center justify-center bg-[#050010]">
                  <span className="text-white/10 font-mono text-2xl tracking-widest">VIDEO RENDERER</span>
                </div>

                {showStats && (
                  <div className="absolute top-4 left-4 bg-[#0b001f]/90 backdrop-blur-md border border-[#e60076]/40 p-4 rounded-xl shadow-[0_0_30px_rgba(230,0,118,0.2)] text-xs font-mono w-72 z-40 transition-all" />
                )}

                <div className="absolute bottom-0 left-0 w-full bg-linear-to-t from-black/90 via-black/50 to-transparent pt-24 pb-4 px-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="w-full h-1.5 bg-white/20 rounded-full mb-4 cursor-pointer relative group/seek">
                    <div className="top-0 left-0 h-full bg-[#e60076] w-1/3 rounded-full relative">
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full scale-0 group-hover/seek:scale-100 transition-transform shadow-[0_0_10px_#e60076]"></div>
                    </div>
                    <div className="absolute top-0 left-0 h-full bg-white/40 w-1/2 rounded-full -z-10"></div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6">
                      <button className="text-white hover:text-[#e60076] transition-colors">
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                      </button>
                      <div className="flex items-center gap-3">
                        <button className="text-white hover:text-[#e60076] transition-colors">
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
                        </button>
                        <span className="text-xs font-medium text-white/80 font-mono">08:14 / 23:50</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-5">
                      <button
                        onClick={() => setShowStats(!showStats)}
                        className={`text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded border transition-colors ${showStats ? 'bg-[#e60076]/20 border-[#e60076] text-[#e60076]' : 'border-white/20 text-white/60 hover:text-white hover:border-white/50'}`}
                      >
                        Stats
                      </button>
                      <button className="text-white/80 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* EPISODE INFO & SOURCES */}
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-2 flex flex-col md:flex-row md:items-baseline gap-1 md:gap-3">
                  <span className="text-[#e60076] whitespace-nowrap">Episode {activeEpisodeNum}</span>
                  <span className="text-white/90">{currentEpisode?.title || 'Episode Info'}</span>
                </h1>
                <p className="text-sm text-white/50 mb-8 font-medium">
                  {meta.title} • {currentEpisode?.aired ? new Date(currentEpisode.aired).toLocaleDateString() : 'TBA'}
                </p>

                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm uppercase tracking-[0.15em] text-white/70 font-semibold">Available Streams</h3>
                  <span className="text-xs text-[#e60076] bg-[#e60076]/10 px-2 py-1 rounded border border-[#e60076]/20 font-medium">
                    {streamLoading
                      ? 'Fetching...'
                      : streamError
                        ? 'Error'
                        : `${streamPayload.count || streamPayload.results.reduce((acc, entry) => acc + (entry.links?.length || 0), 0)} links`}
                  </span>
                </div>

                <div className="bg-white/3 border border-white/5 rounded-xl p-4 md:p-5 hover:bg-white/5 transition-colors space-y-3">
                  {streamLoading && (
                    <div className="flex items-center justify-center py-6">
                      <div className="w-6 h-6 border-2 border-[#e60076]/30 border-t-[#e60076] rounded-full animate-spin"></div>
                    </div>
                  )}

                  {!streamLoading && streamError && (
                    <p className="text-red-300 text-sm">{streamError}</p>
                  )}

                  {!streamLoading && !streamError && streamPayload.results.length === 0 && (
                    <p className="text-white/40 text-sm">No links found for this episode yet.</p>
                  )}

                  {!streamLoading && !streamError && streamPayload.results.length > 0 && (
                    <>
                      {streamPayload.metadata?.animeToshoUrl || streamPayload.metadata?.tpbUrl ? (
                        <div className="text-[11px] text-white/40 font-mono break-all space-y-1">
                          {streamPayload.metadata?.animeToshoUrl && (
                            <p>AnimeTosho: <a href={streamPayload.metadata.animeToshoUrl} target="_blank" rel="noreferrer" className="text-[#ff8dc8] hover:text-white">open search</a></p>
                          )}
                          {streamPayload.metadata?.tpbUrl && (
                            <p>ThePirateBay: <a href={streamPayload.metadata.tpbUrl} target="_blank" rel="noreferrer" className="text-[#ff8dc8] hover:text-white">open search</a></p>
                          )}
                        </div>
                      ) : null}

                      {streamPayload.results.slice(0, 4).map((entry, entryIdx) => (
                        <div key={`${entry.title}_${entryIdx}`} className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-xs text-white/70 line-clamp-2">{entry.title}</p>
                            {entry.source && (
                              <span className="shrink-0 text-[10px] px-2 py-0.5 rounded border border-white/20 text-white/50 uppercase tracking-wider">
                                {entry.source}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(entry.links || []).slice(0, 6).map((link, linkIdx) => (
                              <a
                                key={`${link.href || link.text}_${linkIdx}`}
                                href={link.href}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs px-2.5 py-1 rounded border border-[#e60076]/30 text-[#ff8dc8] hover:text-white hover:bg-[#e60076]/15 transition-colors"
                              >
                                {link.text || (link.isMagnet ? 'Magnet' : 'Open')}
                              </a>
                            ))}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT SIDEBAR */}
            <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-6 lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)]">

              {/* Seasons Selector */}
              <div className="bg-white/2 border border-white/5 rounded-xl p-5 backdrop-blur-sm">
                <h3 className="text-xs uppercase tracking-[0.15em] text-white/40 font-semibold mb-4">Franchise</h3>
                {meta.seasons.length === 0 ? (
                  <p className="text-xs text-white/40">No seasons available</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {meta.seasons.map((s) => {
                      const isActive = s.malId === activeSeasonId;
                      return (
                        <button
                          key={s.malId}
                          onClick={() => navigateToSeason(s.malId)}
                          className={`flex items-center justify-between p-3 rounded-lg transition-all text-left group ${isActive ? 'bg-[#e60076]/10 shadow-[inset_2px_0_0_#e60076] text-white' : 'hover:bg-white/5 text-white/60 hover:text-white'}`}
                        >
                          <div className="flex flex-col gap-1">
                            <span className={`text-[9px] uppercase tracking-widest font-bold ${isActive ? 'text-[#e60076]' : 'text-white/40 group-hover:text-white/60'}`}>
                              {s.format} • {s.year}
                            </span>
                            <span className="text-sm font-medium line-clamp-1">{s.title}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Episodes List */}
              <div className="bg-white/2 border border-white/5 rounded-xl flex flex-col flex-1 overflow-hidden backdrop-blur-sm min-h-100">
                <div className="p-5 border-b border-white/5 flex items-center justify-between shrink-0 bg-[#0b001f]/50">
                  <h3 className="text-xs uppercase tracking-[0.15em] text-white/70 font-semibold">Episodes</h3>
                  <span className="text-xs text-white/40 font-medium">
                    {episodesLoading ? 'Loading...' : `1 - ${episodes.length}`}
                  </span>
                </div>

                <div className="overflow-y-auto flex-1 p-2 custom-scrollbar">
                  {episodesLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="w-6 h-6 border-2 border-[#e60076]/30 border-t-[#e60076] rounded-full animate-spin mx-auto"></div>
                    </div>
                  ) : episodes.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-center text-white/40 text-xs">
                      No episodes found
                    </div>
                  ) : (
                    episodes.map((ep) => {
                      const isEpActive = ep.mal_id === activeEpisodeNum;
                      return (
                        <button
                          key={ep.mal_id}
                          // ✅ Uses selectEpisode (shallow) instead of full navigation
                          onClick={() => selectEpisode(ep.mal_id)}
                          className={`w-full flex items-center gap-3 p-2.5 rounded-lg transition-all text-left group mb-0.5 ${isEpActive ? 'bg-[#e60076]/10' : 'hover:bg-white/5'}`}
                        >
                          <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold transition-colors ${isEpActive ? 'bg-[#e60076] text-white' : 'text-white/40 group-hover:text-white'}`}>
                            {isEpActive ? <Play size={15} /> : ep.mal_id}
                          </div>
                          <div className="flex flex-col overflow-hidden flex-1 min-w-0">
                            <span className={`text-sm truncate font-medium ${isEpActive ? 'text-white' : 'text-white/60 group-hover:text-white/90'}`}>
                              {ep.title || `Episode ${ep.mal_id}`}
                            </span>
                            <span className="text-[10px] text-white/30 uppercase tracking-widest mt-0.5">
                              {ep.aired ? new Date(ep.aired).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'TBA'}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useRef } from 'react';
import DetailsDisplaySkeleton from './Skeletons/DetailsDisplaySkeleton';
import { useToast } from '../providers/toast-provider';
import { resolveAnime, getAnimeEpisodes } from '../utils/actions';

export default function DetailsDisplay({ initialTitle, initialId }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState({ title: initialTitle || '', matchedMalId: initialId ?? null, rootMalId: null, seasons: [], isAdult: false });
  const [activeSeasonId, setActiveSeasonId] = useState(null);
  const router = useRouter();
  const { toast } = useToast();
  const fetchingRef = useRef(new Set());
  const fetchingMaxRef = useRef(new Map());
  const metaRef = useRef(meta);

  useEffect(() => {
    metaRef.current = meta;
  }, [meta]);

  const PAGE_SIZE = 12;

  // Resolve franchise and basic season metadata (no episodes) on mount
  useEffect(() => {
    let mounted = true;
    const resolve = async () => {
      setLoading(true);
      try {
        const data = await resolveAnime({ title: initialTitle, id: initialId });
        if (!mounted) return;
        // initialize seasons with lazy episode-loading flags
        const seasonsInit = (data.seasons || []).map(s => ({
          ...s,
          episodes: s.episodes ?? [],
          episodesLoading: false,
          episodesError: null,
          episodesPage: 0, // last fetched Jikan page for this season
          episodesHasNext: true, // assume more until API says otherwise
          episodesTotalCount: null, // total episodes reported by Jikan (if available)
          episodesTotalPages: null, // derived client-side pages (PAGE_SIZE)
        }));
        setMeta(prev => ({
          ...prev,
          title: data.title || prev.title,
          matchedMalId: data.matchedMalId,
          rootMalId: data.rootMalId,
          seasons: seasonsInit,
          isAdult: data.isAdult === true
        }));
        // pick default active season
        const defaultId = data.matchedMalId ?? data.rootMalId ?? (seasonsInit[0]?.malId ?? null);
        setActiveSeasonId(defaultId);
      } catch (err) {
        console.error(err);
        toast(err.message || 'Error resolving anime', 'error');
        setError(err.message || 'Error resolving anime');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    resolve();
    return () => { mounted = false; };
  }, [initialTitle, initialId]);

  // Create a stable string like "1234,5678,91011"
  // This only changes when the actual list of seasons changes, not when episodes load.
  const seasonIds = meta.seasons?.map(s => s.malId).join(',') || '';

  // derive season/active season info early so hooks remain stable
  const { seasons, matchedMalId, rootMalId, title: searchTitle } = meta;
  const defaultId = matchedMalId ?? rootMalId ?? seasons?.[0]?.malId ?? null;
  const activeId = activeSeasonId ?? defaultId;
  const activeSeason = (seasons || []).find(s => s.malId === activeId) ?? (seasons || [])[0] ?? {};
  const isFranchise = (seasons?.length || 0) > 1;

  // Helper to fetch a single Jikan page for a season with a per-season in-flight guard
  const fetchEpisodesFor = async (season, jikanPage = 1) => {
    const keyBase = season?.malId;
    if (!keyBase) return { episodes: [], pagination: { has_next_page: false, current_page: jikanPage }, error: 'missing malId' };

    // include page in the key so different pages can fetch concurrently,
    // but identical page requests are deduplicated.
    const key = `${keyBase}:${jikanPage}`;

    if (fetchingRef.current.has(key)) {
      return { episodes: [], pagination: { has_next_page: false, current_page: jikanPage }, error: 'already fetching' };
    }

    // record that we've requested up to this page for this season to avoid regressing
    try {
      const prevMax = fetchingMaxRef.current.get(keyBase) || 0;
      if (jikanPage > prevMax) fetchingMaxRef.current.set(keyBase, jikanPage);
    } catch (e) {
      // ignore
    }

    fetchingRef.current.add(key);
    try {
      const json = await getAnimeEpisodes(season.malId, jikanPage);
      // normalize returned shapes: { episodes, pagination } or array
      const episodes = (json && json.episodes) ? json.episodes : (Array.isArray(json) ? json : []);
      const pagination = (json && json.pagination) ? json.pagination : { has_next_page: false, current_page: jikanPage };
      return { episodes, pagination, error: null };
    } catch (e) {
      console.error(e);
      return { episodes: [], pagination: { has_next_page: false, current_page: jikanPage }, error: e.message || 'fetch error' };
    } finally {
      fetchingRef.current.delete(key);
    }
  };

  // Normalize pagination: determine if there's a next page from various Jikan pagination shapes
  const paginationHasNext = (pagination) => {
    if (!pagination) return false;
    if (typeof pagination.has_next_page === 'boolean') return pagination.has_next_page;
    const current = pagination.current_page ?? pagination.page ?? null;
    const last = pagination.last_visible_page ?? pagination.lastVisiblePage ?? null;
    if (current != null && last != null) return Number(current) < Number(last);
    return false;
  };

  // Compute next Jikan page for a season by incrementing the last fetched Jikan page.
  // If `episodesPage` is missing/null, treat it as 0 and fetch page 1. Do NOT infer from client PAGE_SIZE
  // because the Jikan page size may differ from our client page size.
  const computeNextJikanPage = (season) => {
    // If API explicitly reports there is no next page, don't compute one.
    if (season?.episodesHasNext === false) return null;
    const prevFromState = Number.isInteger(season?.episodesPage) ? season.episodesPage : (Number.isInteger(season?.episodesPrevPage) ? season.episodesPrevPage : 0);
    const maxRequested = fetchingMaxRef.current.get(season?.malId) || 0;
    const prev = Math.max(prevFromState, maxRequested);
    return prev + 1;
  };


  // Load episodes lazily only for the currently viewed season.
  const ensureEpisodesForSeason = useCallback(async (seasonMalId) => {
    if (!seasonMalId) return;

    const season = metaRef.current?.seasons?.find(s => s.malId === seasonMalId);
    if (!season) return;

    const hasLoadedEpisodes = Array.isArray(season.episodes) && season.episodes.length > 0;
    const hasFetchedAnyPage = Number.isInteger(season.episodesPage) && season.episodesPage > 0;
    if (season.episodesLoading || hasLoadedEpisodes || hasFetchedAnyPage) return;

    const nextPage = computeNextJikanPage(season) ?? 1;

    setMeta(prev => ({
      ...prev,
      seasons: prev.seasons.map(s =>
        s.malId === seasonMalId
          ? { ...s, episodesLoading: true, episodesError: null }
          : s
      ),
    }));

    const { episodes: eps, pagination, error } = await fetchEpisodesFor(season, nextPage);

    if (error) {
      if (error !== 'already fetching' && !String(error).includes('429')) {
        toast(error, 'error');
      }

      setMeta(prev => ({
        ...prev,
        seasons: prev.seasons.map(s =>
          s.malId === seasonMalId
            ? { ...s, episodesLoading: false, episodesError: error === 'already fetching' ? null : error }
            : s
        ),
      }));
      return;
    }

    const totalItems = pagination?.items?.total ?? pagination?.total ?? null;
    const perPage = pagination?.items?.per_page ?? pagination?.items?.perPage ?? null;
    const lastVisible = pagination?.last_visible_page ?? null;
    const episodesTotalCount = totalItems ?? (lastVisible && perPage ? lastVisible * perPage : null);
    const episodesTotalPages = episodesTotalCount ? Math.max(1, Math.ceil(episodesTotalCount / PAGE_SIZE)) : null;

    setMeta(prev => ({
      ...prev,
      seasons: prev.seasons.map(s =>
        s.malId === seasonMalId
          ? {
            ...s,
            episodes: [...(s.episodes || []), ...(eps || [])],
            episodesLoading: false,
            episodesError: null,
            episodesPrevPage: s.episodesPage ?? s.episodesPrevPage ?? null,
            episodesPage: pagination?.current_page ?? nextPage,
            episodesHasNext: paginationHasNext(pagination),
            episodesTotalCount,
            episodesTotalPages,
          }
          : s
      ),
    }));
  }, [toast]);

  useEffect(() => {
    if (!activeId || !meta.seasons?.length) return;
    ensureEpisodesForSeason(activeId);
  }, [activeId, seasonIds, ensureEpisodesForSeason]);


  const [episodePageIndex, setEpisodePageIndex] = useState(1);
  useEffect(() => {
    setEpisodePageIndex(1);
  }, [activeId]);

  if (loading) return <DetailsDisplaySkeleton />;

  if (error) {
    return (
      <div className="min-h-screen bg-[#0b001f] text-white flex items-center justify-center">
        <div className="text-white/50 tracking-widest uppercase text-sm font-semibold">{error}</div>
      </div>
    );
  }

  if (!seasons || seasons.length === 0) {
    return (
      <div className="min-h-screen bg-[#0b001f] text-white flex items-center justify-center">
        <div className="text-white/50 tracking-widest uppercase text-sm font-semibold">No data found for this anime.</div>
      </div>
    );
  }

  const loadMoreEpisodesFor = async (seasonMalId) => {
    const season = metaRef.current?.seasons?.find(s => s.malId === seasonMalId);
    if (!season || !season.episodesHasNext || fetchingRef.current.has(`${seasonMalId}:loading`)) return;

    // 1. Determine next page based on what we actually have in state
    const lastFetchedPage = season.episodesPage || 0;
    const nextPage = lastFetchedPage + 1;

    // 2. Optimistic Update: Set loading and "lock" this page fetch
    setMeta(prev => ({
      ...prev,
      seasons: prev.seasons.map(s =>
        s.malId === seasonMalId
          ? { ...s, episodesLoading: true, episodesError: null }
          : s
      ),
    }));

    try {
      const { episodes: eps = [], pagination, error } = await fetchEpisodesFor(season, nextPage);

      if (error === 'already fetching') return;
      if (error) throw new Error(error);

      // 3. Apply results and advance the page counter
      setMeta(prev => ({
        ...prev,
        seasons: prev.seasons.map(s => {
          if (s.malId !== seasonMalId) return s;

          const newEpisodes = [...(s.episodes || []), ...eps];
          return {
            ...s,
            episodes: newEpisodes,
            episodesLoading: false,
            episodesPage: pagination?.current_page || nextPage,
            episodesHasNext: paginationHasNext(pagination),
            // Update total pages if the API gave us new info
            episodesTotalPages: s.episodesTotalPages
          };
        }),
      }));
    } catch (err) {
      console.error(err);
      toast(err.message || 'Fetch failed', 'error');
      setMeta(prev => ({
        ...prev,
        seasons: prev.seasons.map(s =>
          s.malId === seasonMalId ? { ...s, episodesLoading: false, episodesError: err.message } : s
        ),
      }));
    }
  };


  return (
    <div className="min-h-screen bg-[#0b001f] text-[#ffffff] pb-24">
      {/* Keep the original render structure but using meta from state */}
      <div className="relative w-full h-[45vh] md:h-[55vh] overflow-hidden bg-[#0b001f]">
        {activeSeason.banner ? (
          <img src={activeSeason.banner} alt="Banner" className="w-full h-full object-cover opacity-40" />
        ) : activeSeason.image ? (
          <img src={activeSeason.image} alt="Backdrop fallback" className="w-full h-full object-cover opacity-20 blur-2xl scale-110" />
        ) : (
          <div className="w-full h-full bg-linear-to-br from-[#0b001f] to-[#e60076]/10" />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-[#0b001f] via-[#0b001f]/80 to-transparent" />
      </div>

      <div className="max-w-350 mx-auto px-6 md:px-12 -mt-40 relative z-10">
        {isFranchise && (
          <div className="mb-10">
            <h3 className="text-xs uppercase tracking-[0.2em] text-white/40 font-semibold mb-4 ml-1">Franchise Timeline • {decodeURIComponent(searchTitle)}</h3>
            <div className="flex overflow-x-auto pb-4 gap-3 hide-scrollbar snap-x">
              {seasons.map((season, index) => {
                const isActive = season.malId === activeId;
                const isRoot = season.malId === rootMalId;
                return (
                  <button key={season.malId} onClick={() => setActiveSeasonId(season.malId)} className={`snap-start shrink-0 px-5 py-3 rounded-xl border transition-all duration-300 flex flex-col items-start gap-1 min-w-50 max-w-65 text-left ${isActive ? 'bg-[#e60076]/10 border-[#e60076] shadow-[0_0_20px_rgba(230,0,118,0.15)]' : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/30'}`}>
                    <span className={`text-[10px] uppercase tracking-widest font-bold ${isActive ? 'text-[#e60076]' : 'text-white/40'}`}>{isRoot ? '◆ ' : ''}{season.format ?? `Part ${index + 1}`} • {season.year ?? 'TBA'}</span>
                    <span className={`text-sm font-medium line-clamp-2 ${isActive ? 'text-white' : 'text-white/70'}`}>{season.title}</span>
                    {season.episodesCount && <span className="text-[10px] text-white/30 mt-0.5">{season.episodesCount} eps</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14">
          <div className="lg:col-span-3 flex flex-col gap-6">
            <div className="w-56 md:w-full max-w-75 rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(230,0,118,0.15)] border border-white/20 mx-auto lg:mx-0 bg-[#150a2b]">
              {activeSeason.image ? <img src={activeSeason.image} alt={activeSeason.title} className="w-full h-auto object-cover" /> : <div className="w-full aspect-2/3 flex items-center justify-center text-white/20">No Image</div>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col items-center text-center">
                <span className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Score</span>
                <span className="text-xl font-bold text-[#e60076] flex items-center gap-1">{activeSeason.score ?? 'N/A'}</span>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col items-center text-center">
                <span className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Rank</span>
                <span className="text-xl font-bold text-white/90">{activeSeason.rank ? `#${activeSeason.rank}` : '—'}</span>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-sm space-y-3 hidden md:block">
              <h3 className="text-[#e60076] font-semibold tracking-widest uppercase text-[11px] mb-3">Information</h3>
              {[{ label: 'Format', value: activeSeason.format }, { label: 'Episodes', value: activeSeason.episodesCount }, { label: 'Duration', value: activeSeason.duration }, { label: 'Status', value: activeSeason.status }, { label: 'Aired', value: activeSeason.aired ? new Date(activeSeason.aired).getFullYear() : null }, { label: 'Studio', value: activeSeason.studios?.join(', ') }, { label: 'Source', value: activeSeason.source }, { label: 'Rating', value: activeSeason.rating }].map((item, i) => item.value ? (<div key={i} className="flex justify-between border-b border-white/10 pb-2 last:border-0 last:pb-0 gap-4"><span className="text-white/40 shrink-0">{item.label}</span><span className="text-white/80 text-right truncate">{item.value}</span></div>) : null)}
            </div>
          </div>

          <div className="lg:col-span-9 flex flex-col gap-10">
            <div className="flex flex-col gap-4">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.1]">{activeSeason.title}</h1>
              {activeSeason.titleJapanese && <h2 className="text-lg md:text-xl text-white/40 font-medium tracking-wide">{activeSeason.titleJapanese}</h2>}
              {activeSeason.genres?.length > 0 && <div className="flex flex-wrap gap-2 mt-2">{activeSeason.genres.map(genre => <span key={genre} className="px-3 py-1 text-[11px] font-semibold uppercase tracking-widest border border-white/20 rounded-full text-white/70 bg-white/5">{genre}</span>)}</div>}
            </div>

            {activeSeason.synopsis && <div><h3 className="text-sm uppercase tracking-[0.15em] text-[#e60076] font-semibold mb-3">Synopsis</h3><p className="text-white/70 leading-relaxed text-sm md:text-base text-justify font-light">{activeSeason.synopsis}</p></div>}

            {activeSeason.trailerId && (<div><h3 className="text-sm uppercase tracking-[0.15em] text-[#e60076] font-semibold mb-4">Trailer</h3><div className="aspect-video w-full max-w-3xl rounded-xl overflow-hidden border border-white/20 shadow-2xl bg-black"><iframe src={`https://www.youtube.com/embed/${activeSeason.trailerId}?rel=0`} title="Trailer" className="w-full h-full" allowFullScreen /></div></div>)}

            {activeSeason.characters?.length > 0 && (<div><h3 className="text-sm uppercase tracking-[0.15em] text-[#e60076] font-semibold mb-4">Main Cast</h3><div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">{activeSeason.characters.slice(0, 8).map((char, i) => (<div key={char.node?.id ?? i} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg p-2.5"><div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 shrink-0 border border-white/20">{char.node?.image?.large && <img src={char.node.image.large} alt={char.node.name?.full} className="w-full h-full object-cover" />}</div><div className="flex flex-col overflow-hidden"><span className="text-white/90 font-medium text-xs truncate">{char.node?.name?.full}</span><span className="text-[#e60076]/80 text-[10px] uppercase tracking-wider mt-0.5">{char.role}</span></div></div>))}</div></div>)}

            <hr className="border-t border-white/10" />

            <div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm uppercase tracking-[0.15em] text-[#e60076] font-semibold">Episodes</h3>
                <span className="text-xs text-white/40 font-medium uppercase tracking-widest">{activeSeason.episodes?.length ?? 0} Total</span>
              </div>

              {activeSeason.episodesLoading ? (
                /* --- SKELETON LOADER --- */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...Array(12)].map((_, i) => (
                    <div key={i} className="p-5 rounded-xl bg-white/5 border border-white/10 flex flex-col justify-between min-h-35 animate-pulse">
                      <div className="pr-10 mb-4">
                        <div className="w-20 h-3 bg-[#e60076]/40 rounded mb-3"></div>
                        <div className="w-3/4 h-4 bg-white/20 rounded mb-2"></div>
                        <div className="w-1/2 h-3 bg-white/10 rounded"></div>
                      </div>
                      <div className="pt-3 border-t border-white/10 mt-auto">
                        <div className="w-24 h-3 bg-white/10 rounded"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : activeSeason.episodes?.length > 0 ? (
                /* --- EPISODES GRID --- */
                (() => {
                  const total = activeSeason.episodes.length;
                  // If Jikan provided a total count we can compute exact client pages.
                  const knownTotalPages = activeSeason.episodesTotalPages ?? (activeSeason.episodesHasNext ? null : Math.max(1, Math.ceil(total / PAGE_SIZE)));
                  // If we don't have a known total pages and API reports more, assume there's +1 page available.
                  const totalPages = knownTotalPages ?? Math.max(1, Math.ceil(total / PAGE_SIZE) + (activeSeason.episodesHasNext ? 1 : 0));
                  const start = (episodePageIndex - 1) * PAGE_SIZE;
                  const end = start + PAGE_SIZE;
                  const visible = activeSeason.episodes.slice(start, end);

                  return (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {visible.map((ep) => (
                          <div 
                            key={ep.mal_id} 
                            onClick={() => router.push(`/watch?mal_id=${activeId}&episode=${ep.mal_id}`)}
                            className="group relative p-5 rounded-xl bg-white/5 border border-white/10 hover:bg-[#e60076]/10 hover:border-[#e60076]/50 transition-all duration-300 cursor-pointer overflow-hidden flex flex-col justify-between min-h-35"
                          >
                            <div className="absolute top-5 right-5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                              <div className="w-8 h-8 rounded-full bg-[#e60076] flex items-center justify-center shadow-[0_0_15px_rgba(230,0,118,0.5)]">
                                <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                              </div>
                            </div>
                            <div className="pr-10 mb-4">
                              <span className="text-[10px] text-[#e60076] font-bold tracking-widest mb-1.5 block uppercase">Episode {ep.mal_id}</span>
                              <h4 className="text-white/90 font-medium line-clamp-2 leading-snug text-sm">{ep.title ?? 'Untitled'}</h4>
                              {ep.title_romaji && ep.title_romaji !== ep.title && (
                                <span className="text-xs text-white/40 block mt-1.5 line-clamp-1 italic font-light">{ep.title_romaji}</span>
                              )}
                            </div>
                            {ep.aired && (
                              <div className="pt-3 border-t border-white/10 group-hover:border-[#e60076]/30 transition-colors mt-auto text-[10px] text-white/30 uppercase tracking-widest font-semibold">
                                {new Date(ep.aired).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* --- PAGINATION CONTROLS --- */}
                      <div className="mt-10 flex items-center justify-center gap-4">
                        <button
                          disabled={episodePageIndex === 1}
                          onClick={() => setEpisodePageIndex(p => Math.max(1, p - 1))}
                          className="group flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 border border-white/10 text-sm font-medium text-white/80 hover:bg-white/10 hover:border-white/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path></svg>
                          Prev
                        </button>

                        <div className="px-5 py-2 rounded-full bg-[#150a2b] border border-white/10 shadow-[inset_0_0_10px_rgba(0,0,0,0.5)] flex items-center gap-2">
                          <span className="text-[11px] uppercase tracking-widest text-white/40 font-semibold">Page</span>
                          <span className="text-sm font-bold text-[#e60076]">{episodePageIndex}</span>
                          {(activeSeason.episodesTotalPages || (!activeSeason.episodesHasNext && Math.ceil(total / PAGE_SIZE))) && (
                            <>
                              <span className="text-white/20">/</span>
                              <span className="text-sm font-bold text-white/60">{activeSeason.episodesTotalPages ?? Math.ceil(total / PAGE_SIZE)}</span>
                            </>
                          )}
                        </div>

                        <button
                          disabled={activeSeason.episodesLoading || (knownTotalPages ? episodePageIndex >= knownTotalPages : (!activeSeason.episodesHasNext && episodePageIndex >= Math.ceil(total / PAGE_SIZE)))}
                          onClick={async () => {
                            const nextClientPage = episodePageIndex + 1;
                            const neededEnd = nextClientPage * PAGE_SIZE;

                            // If we don't have enough episodes locally but the API has more, fetch them
                            if (activeSeason.episodes.length < neededEnd && (activeSeason.episodesHasNext || (knownTotalPages && nextClientPage <= knownTotalPages))) {
                              await loadMoreEpisodesFor(activeSeason.malId);
                            }

                            // Proceed to next page (if loadMore failed, user can try again)
                            setEpisodePageIndex(nextClientPage);
                          }}
                          className="group flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 border border-white/10 text-sm font-medium text-white/80 hover:bg-white/10 hover:border-white/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          Next
                          <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                        </button>
                      </div>
                    </>
                  );
                })()
              ) : (
                /* --- EMPTY STATE --- */
                <div className="py-16 text-center border border-white/10 border-dashed rounded-xl flex flex-col items-center justify-center bg-white/2">
                  <svg className="w-10 h-10 mb-4 opacity-20 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                  <p className="text-white/40 text-sm font-light">No episodes found for this installment.</p>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
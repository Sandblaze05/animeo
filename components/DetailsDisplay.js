"use client"
import React, { useState } from 'react';

export default function DetailsDisplay({ payload }) {
  if (!payload || !payload.seasons || payload.seasons.length === 0) {
    return (
      <div className="min-h-screen bg-[#0b001f] text-white flex items-center justify-center">
        <div className="text-white/50 animate-pulse tracking-widest uppercase text-sm font-semibold">
          No data found for this anime.
        </div>
      </div>
    );
  }

  const { seasons, matchedMalId, rootMalId, title: searchTitle } = payload;

  // Default to the season the user actually searched for, not the franchise root
  const defaultId = matchedMalId ?? rootMalId ?? seasons[0].malId;
  const [activeSeasonId, setActiveSeasonId] = useState(defaultId);
  const activeSeason = seasons.find(s => s.malId === activeSeasonId) ?? seasons[0];

  const isFranchise = seasons.length > 1;

  return (
    <div className="min-h-screen bg-[#0b001f] text-[#ffffff] pb-24">

      {/* ---------------- HERO BANNER ---------------- */}
      <div className="relative w-full h-[45vh] md:h-[55vh] overflow-hidden bg-[#0b001f]">
        {activeSeason.banner ? (
          <img
            src={activeSeason.banner}
            alt="Banner"
            className="w-full h-full object-cover opacity-40"
          />
        ) : activeSeason.image ? (
          <img
            src={activeSeason.image}
            alt="Backdrop fallback"
            className="w-full h-full object-cover opacity-20 blur-2xl scale-110"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#0b001f] to-[#e60076]/10" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b001f] via-[#0b001f]/80 to-transparent" />
      </div>

      {/* ---------------- MAIN CONTAINER ---------------- */}
      <div className="max-w-[1400px] mx-auto px-6 md:px-12 -mt-40 relative z-10">

        {/* FRANCHISE TIMELINE */}
        {isFranchise && (
          <div className="mb-10">
            <h3 className="text-xs uppercase tracking-[0.2em] text-white/40 font-semibold mb-4 ml-1">
              Franchise Timeline • {decodeURIComponent(searchTitle)}
            </h3>
            <div className="flex overflow-x-auto pb-4 gap-3 hide-scrollbar snap-x">
              {seasons.map((season, index) => {
                const isActive = season.malId === activeSeasonId;
                // Highlight the franchise root differently so it's clear which is "Season 1"
                const isRoot = season.malId === rootMalId;
                return (
                  <button
                    key={season.malId}
                    onClick={() => setActiveSeasonId(season.malId)}
                    className={`
                      snap-start flex-shrink-0 px-5 py-3 rounded-xl border transition-all duration-300
                      flex flex-col items-start gap-1 min-w-[200px] max-w-[260px] text-left
                      ${isActive
                        ? 'bg-[#e60076]/10 border-[#e60076] shadow-[0_0_20px_rgba(230,0,118,0.15)]'
                        : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/30'}
                    `}
                  >
                    <span className={`text-[10px] uppercase tracking-widest font-bold ${isActive ? 'text-[#e60076]' : 'text-white/40'}`}>
                      {isRoot ? '◆ ' : ''}{season.format ?? `Part ${index + 1}`} • {season.year ?? 'TBA'}
                    </span>
                    <span className={`text-sm font-medium line-clamp-2 ${isActive ? 'text-white' : 'text-white/70'}`}>
                      {season.title}
                    </span>
                    {season.episodesCount && (
                      <span className="text-[10px] text-white/30 mt-0.5">
                        {season.episodesCount} eps
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14">

          {/* ---------------- LEFT SIDEBAR ---------------- */}
          <div className="lg:col-span-3 flex flex-col gap-6">

            {/* Poster */}
            <div className="w-56 md:w-full max-w-[300px] rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(230,0,118,0.15)] border border-white/20 mx-auto lg:mx-0 bg-[#150a2b]">
              {activeSeason.image ? (
                <img src={activeSeason.image} alt={activeSeason.title} className="w-full h-auto object-cover" />
              ) : (
                <div className="w-full aspect-[2/3] flex items-center justify-center text-white/20">No Image</div>
              )}
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col items-center text-center">
                <span className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Score</span>
                <span className="text-xl font-bold text-[#e60076] flex items-center gap-1">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  {activeSeason.score ?? 'N/A'}
                </span>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col items-center text-center">
                <span className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Rank</span>
                <span className="text-xl font-bold text-white/90">
                  {activeSeason.rank ? `#${activeSeason.rank}` : '—'}
                </span>
              </div>
            </div>

            {/* Info Card */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-sm space-y-3 hidden md:block">
              <h3 className="text-[#e60076] font-semibold tracking-widest uppercase text-[11px] mb-3">Information</h3>
              {[
                { label: 'Format',    value: activeSeason.format },
                { label: 'Episodes',  value: activeSeason.episodesCount },
                { label: 'Duration',  value: activeSeason.duration },
                { label: 'Status',    value: activeSeason.status },
                { label: 'Aired',     value: activeSeason.aired ? new Date(activeSeason.aired).getFullYear() : null },
                { label: 'Studio',    value: activeSeason.studios?.join(', ') },
                { label: 'Source',    value: activeSeason.source },
                { label: 'Rating',    value: activeSeason.rating },
              ].map((item, i) => item.value ? (
                <div key={i} className="flex justify-between border-b border-white/10 pb-2 last:border-0 last:pb-0 gap-4">
                  <span className="text-white/40 shrink-0">{item.label}</span>
                  <span className="text-white/80 text-right truncate">{item.value}</span>
                </div>
              ) : null)}
            </div>
          </div>

          {/* ---------------- RIGHT CONTENT AREA ---------------- */}
          <div className="lg:col-span-9 flex flex-col gap-10">

            {/* Titles & Genres */}
            <div className="flex flex-col gap-4">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.1]">
                {activeSeason.title}
              </h1>
              {activeSeason.titleJapanese && (
                <h2 className="text-lg md:text-xl text-white/40 font-medium tracking-wide">
                  {activeSeason.titleJapanese}
                </h2>
              )}
              {activeSeason.genres?.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {activeSeason.genres.map(genre => (
                    <span key={genre} className="px-3 py-1 text-[11px] font-semibold uppercase tracking-widest border border-white/20 rounded-full text-white/70 bg-white/5">
                      {genre}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Synopsis */}
            {activeSeason.synopsis && (
              <div>
                <h3 className="text-sm uppercase tracking-[0.15em] text-[#e60076] font-semibold mb-3">Synopsis</h3>
                <p className="text-white/70 leading-relaxed text-sm md:text-base text-justify font-light">
                  {activeSeason.synopsis}
                </p>
              </div>
            )}

            {/* Trailer */}
            {activeSeason.trailerId && (
              <div>
                <h3 className="text-sm uppercase tracking-[0.15em] text-[#e60076] font-semibold mb-4">Trailer</h3>
                <div className="aspect-video w-full max-w-3xl rounded-xl overflow-hidden border border-white/20 shadow-2xl bg-black">
                  <iframe
                    src={`https://www.youtube.com/embed/${activeSeason.trailerId}?rel=0`}
                    title="Trailer"
                    className="w-full h-full"
                    allowFullScreen
                  />
                </div>
              </div>
            )}

            {/* Characters */}
            {activeSeason.characters?.length > 0 && (
              <div>
                <h3 className="text-sm uppercase tracking-[0.15em] text-[#e60076] font-semibold mb-4">Main Cast</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                  {activeSeason.characters.slice(0, 8).map((char, i) => (
                    <div key={char.node?.id ?? i} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg p-2.5">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 shrink-0 border border-white/20">
                        {char.node?.image?.large && (
                          <img src={char.node.image.large} alt={char.node.name?.full} className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-white/90 font-medium text-xs truncate">{char.node?.name?.full}</span>
                        <span className="text-[#e60076]/80 text-[10px] uppercase tracking-wider mt-0.5">{char.role}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <hr className="border-t border-white/10" />

            {/* Episodes */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm uppercase tracking-[0.15em] text-[#e60076] font-semibold">Episodes</h3>
                <span className="text-xs text-white/40 font-medium uppercase tracking-widest">
                  {activeSeason.episodes?.length ?? 0} Total
                </span>
              </div>

              {activeSeason.episodes?.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeSeason.episodes.map((ep) => (
                    <div
                      key={ep.mal_id}
                      className="group relative p-5 rounded-xl bg-white/5 border border-white/10 hover:bg-[#e60076]/10 hover:border-[#e60076]/50 transition-all duration-300 cursor-pointer overflow-hidden flex flex-col justify-between min-h-[140px]"
                    >
                      <div className="absolute top-5 right-5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <div className="w-8 h-8 rounded-full bg-[#e60076] flex items-center justify-center shadow-[0_0_15px_rgba(230,0,118,0.5)]">
                          <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>

                      <div className="pr-10 mb-4">
                        {/* Use ep.mal_id as episode number fallback */}
                        <span className="text-[10px] text-[#e60076] font-bold tracking-widest mb-1.5 block uppercase">
                          Episode {ep.mal_id}
                        </span>
                        <h4 className="text-white/90 font-medium line-clamp-2 leading-snug text-sm">
                          {ep.title ?? 'Untitled'}
                        </h4>
                        {ep.title_romaji && ep.title_romaji !== ep.title && (
                          <span className="text-xs text-white/40 block mt-1.5 line-clamp-1 italic font-light">
                            {ep.title_romaji}
                          </span>
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
              ) : (
                <div className="py-16 text-center border border-white/10 border-dashed rounded-xl flex flex-col items-center justify-center bg-white/[0.02]">
                  <svg className="w-10 h-10 mb-4 opacity-20 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
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
import React, { useState } from 'react';

export default function WatchPage() {
  const [showStats, setShowStats] = useState(false);
  const [activeSeasonId, setActiveSeasonId] = useState(1);
  const [activeEpisodeId, setActiveEpisodeId] = useState(1);

  // Mocked Data for demonstration
  const searchTitle = "Jujutsu Kaisen";
  const episodeTitle = "Ryomen Sukuna";
  const activeSeason = { image: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx113415-bbBWj4pEFseh.jpg" };

  const seasons = [
    { malId: 1, title: "Season 1", format: "TV", year: 2020 },
    { malId: 2, title: "0", format: "Movie", year: 2021 },
    { malId: 3, title: "Season 2", format: "TV", year: 2023 }
  ];

  const episodes = Array.from({ length: 24 }, (_, i) => ({
    mal_id: i + 1,
    title: i === 0 ? "Ryomen Sukuna" : `Episode ${i + 1}`,
    aired: "2020-10-03T00:00:00+00:00"
  }));

  const torrentSources = [
    { id: 1, name: "[SubsPlease] 1080p (HEVC)", size: "1.2 GB", seeds: 142, peers: 34, quality: "1080p" },
    { id: 2, name: "[Erai-raws] 1080p", size: "1.4 GB", seeds: 89, peers: 12, quality: "1080p" },
    { id: 3, name: "[SubsPlease] 720p", size: "750 MB", seeds: 210, peers: 45, quality: "720p" },
    { id: 4, name: "[Judas] 1080p Mini", size: "320 MB", seeds: 56, peers: 8, quality: "1080p" },
  ];

  return (
    <div className="min-h-screen bg-[#0b001f] text-[#ffffff] pb-24 relative selection:bg-[#e60076]/30">

      {/* Ambient Background matching the reference */}
      <div className="fixed top-0 left-0 w-full h-[60vh] overflow-hidden pointer-events-none z-0">
        {activeSeason.image ? (
          <img src={activeSeason.image} alt="Backdrop" className="w-full h-full object-cover opacity-10 blur-3xl scale-125" />
        ) : (
          <div className="w-full h-full bg-linear-to-br from-[#0b001f] to-[#e60076]/5" />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-[#0b001f] via-[#0b001f]/80 to-transparent" />
      </div>

      <div className="max-w-400 mx-auto px-4 md:px-8 pt-6 relative z-10">

        {/* Breadcrumb / Header */}
        <div className="mb-6 flex items-center gap-3 text-sm">
          <button className="text-white/40 hover:text-white transition-colors flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Back to details
          </button>
          <span className="text-white/20">•</span>
          <span className="text-[#e60076] font-semibold tracking-wider uppercase text-[11px]">{searchTitle}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">

          {/* LEFT/MAIN CONTENT (Player + Links) */}
          <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-8">

            {/* --- VIDEO PLAYER --- */}
            <div className="w-full rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(230,0,118,0.15)] border border-white/10 bg-black relative group aspect-video">

              {/* Mock Video Layer */}
              <div className="absolute inset-0 flex items-center justify-center bg-[#050010]">
                <span className="text-white/10 font-mono text-2xl tracking-widest">VIDEO RENDERER</span>
              </div>

              {/* Stats Popup */}
              {showStats && (
                <div className="absolute top-4 left-4 bg-[#0b001f]/90 backdrop-blur-md border border-[#e60076]/40 p-4 rounded-xl shadow-[0_0_30px_rgba(230,0,118,0.2)] text-xs font-mono w-72 z-40 transition-all">
                  <div className="flex justify-between items-center border-b border-white/10 pb-2 mb-3">
                    <h4 className="text-[#e60076] font-bold uppercase tracking-widest">Torrent Stats</h4>
                    <button onClick={() => setShowStats(false)} className="text-white/40 hover:text-white">✕</button>
                  </div>
                  <div className="space-y-2 text-white/70">
                    <div className="flex justify-between"><span>Peers:</span> <span className="text-white font-semibold">34 (12 seeds)</span></div>
                    <div className="flex justify-between"><span>Download speed:</span> <span className="text-[#00ffcc] font-semibold">8.4 MB/s</span></div>
                    <div className="flex justify-between"><span>Buffer health:</span> <span className="text-white font-semibold">42 sec</span></div>
                    <div className="flex justify-between"><span>Bitrate:</span> <span className="text-white font-semibold">5.2 Mbps</span></div>
                    <div className="flex justify-between"><span>Resolution:</span> <span className="text-white font-semibold">1920x1080</span></div>
                    <div className="flex justify-between"><span>Codec:</span> <span className="text-white font-semibold">H264</span></div>
                    <div className="flex justify-between"><span>Dropped frames:</span> <span className="text-red-400 font-semibold">2</span></div>

                    <div className="pt-2 mt-2 border-t border-white/10">
                      <div className="flex justify-between mb-1"><span>Torrent progress:</span> <span className="text-[#e60076] font-semibold">18%</span></div>
                      <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-[#e60076] w-[18%] shadow-[0_0_10px_#e60076]"></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Player Controls (Bottom Gradient) */}
              <div className="absolute bottom-0 left-0 w-full bg-linear-to-t from-black/90 via-black/50 to-transparent pt-24 pb-4 px-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300">

                {/* Seek Bar */}
                <div className="w-full h-1.5 bg-white/20 rounded-full mb-4 cursor-pointer relative group/seek">
                  <div className="top-0 left-0 h-full bg-[#e60076] w-1/3 rounded-full relative">
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full scale-0 group-hover/seek:scale-100 transition-transform shadow-[0_0_10px_#e60076]"></div>
                  </div>
                  {/* Buffer Bar */}
                  <div className="absolute top-0 left-0 h-full bg-white/40 w-1/2 rounded-full -z-10"></div>
                </div>

                {/* Controls */}
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

            {/* --- EPISODE INFO & SOURCES --- */}
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-2">Episode {activeEpisodeId}: {episodeTitle}</h1>
              <p className="text-sm text-white/50 mb-8">{searchTitle} • Aired Oct 3, 2020</p>

              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm uppercase tracking-[0.15em] text-[#e60076] font-semibold">Available Streams / Magnets</h3>
                <span className="text-xs text-white/40 bg-white/5 px-2 py-1 rounded border border-white/10">Auto-selecting fastest</span>
              </div>

              {/* Magnet Links Table */}
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <div className="grid grid-cols-12 gap-4 p-4 border-b border-white/10 bg-white/2 text-[10px] uppercase tracking-widest text-white/40 font-semibold">
                  <div className="col-span-6 md:col-span-5">Release Name</div>
                  <div className="col-span-2 hidden md:block text-center">Size</div>
                  <div className="col-span-3 md:col-span-2 text-center">Health</div>
                  <div className="col-span-3 text-right">Action</div>
                </div>

                <div className="flex flex-col">
                  {torrentSources.map((torrent, idx) => (
                    <div key={torrent.id} className={`grid grid-cols-12 gap-4 p-4 items-center border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors ${idx === 0 ? 'bg-[#e60076]/5 border-l-2 border-l-[#e60076]' : 'border-l-2 border-l-transparent'}`}>
                      <div className="col-span-6 md:col-span-5 flex flex-col gap-1">
                        <span className="text-sm text-white/90 font-medium truncate">{torrent.name}</span>
                        <span className="text-[10px] text-white/40 px-1.5 py-0.5 border border-white/10 rounded-md w-fit bg-white/5">{torrent.quality}</span>
                      </div>
                      <div className="col-span-2 hidden md:block text-center text-sm text-white/60 font-mono">
                        {torrent.size}
                      </div>
                      <div className="col-span-3 md:col-span-2 flex flex-col items-center justify-center">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-[#00ffcc] font-mono">{torrent.seeds}</span>
                          <span className="text-white/20">/</span>
                          <span className="text-red-400 font-mono">{torrent.peers}</span>
                        </div>
                      </div>
                      <div className="col-span-3 text-right">
                        <button className="px-4 py-2 bg-white/5 hover:bg-[#e60076] border border-white/10 hover:border-[#e60076] text-white rounded-lg text-xs font-semibold tracking-wider transition-all duration-300 shadow-[0_0_15px_rgba(230,0,118,0)] hover:shadow-[0_0_15px_rgba(230,0,118,0.4)]">
                          {idx === 0 ? 'PLAYING' : 'PLAY'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT SIDEBAR (Seasons & Episodes) */}
          <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-6">

            {/* Franchise / Seasons Selector */}
            <div className="bg-[#150a2b]/50 border border-white/10 rounded-xl p-5 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
              <h3 className="text-xs uppercase tracking-[0.15em] text-white/40 font-semibold mb-4">Franchise</h3>
              <div className="flex flex-col gap-2">
                {seasons.map((season) => {
                  const isActive = season.malId === activeSeasonId;
                  return (
                    <button
                      key={season.malId}
                      onClick={() => setActiveSeasonId(season.malId)}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-all text-left ${isActive ? 'bg-[#e60076]/10 border-[#e60076]/50 text-white' : 'bg-white/5 border-white/5 text-white/60 hover:bg-white/10 hover:text-white'}`}
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className={`text-[10px] uppercase tracking-widest font-bold ${isActive ? 'text-[#e60076]' : 'text-white/40'}`}>{season.format} • {season.year}</span>
                        <span className="text-sm font-medium line-clamp-1">{season.title}</span>
                      </div>
                      {isActive && <div className="w-1.5 h-1.5 rounded-full bg-[#e60076] shadow-[0_0_8px_#e60076]"></div>}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Episodes List */}
            <div className="bg-[#150a2b]/50 border border-white/10 rounded-xl flex flex-col h-150 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
              <div className="p-5 border-b border-white/10 flex items-center justify-between shrink-0">
                <h3 className="text-sm uppercase tracking-[0.15em] text-[#e60076] font-semibold">Episodes</h3>
                <span className="text-xs text-white/40 font-medium">1 - {episodes.length}</span>
              </div>

              <div className="overflow-y-auto flex-1 p-2 custom-scrollbar">
                {episodes.map((ep) => {
                  const isEpActive = ep.mal_id === activeEpisodeId;
                  return (
                    <button
                      key={ep.mal_id}
                      onClick={() => setActiveEpisodeId(ep.mal_id)}
                      className={`w-full flex items-center gap-4 p-3 rounded-lg transition-all text-left group ${isEpActive ? 'bg-[#e60076]/20 border border-[#e60076]/30' : 'hover:bg-white/5 border border-transparent'}`}
                    >
                      <div className={`w-8 h-8 rounded shrink-0 flex items-center justify-center text-xs font-bold ${isEpActive ? 'bg-[#e60076] text-white shadow-[0_0_10px_rgba(230,0,118,0.5)]' : 'bg-white/10 text-white/50 group-hover:bg-white/20 group-hover:text-white'}`}>
                        {isEpActive ? (
                          <svg className="w-3 h-3 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                        ) : ep.mal_id}
                      </div>
                      <div className="flex flex-col overflow-hidden">
                        <span className={`text-sm truncate font-medium ${isEpActive ? 'text-white' : 'text-white/70 group-hover:text-white'}`}>{ep.title}</span>
                        <span className="text-[10px] text-white/30 uppercase tracking-widest mt-0.5">
                          {new Date(ep.aired).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Basic Custom Scrollbar Styles for the episode list */}
      <style dangerouslySetInnerHTML={{
        __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(230, 0, 118, 0.5);
        }
      `}} />
    </div>
  );
}
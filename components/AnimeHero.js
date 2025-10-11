import { useState, useEffect, useRef } from 'react'; 
import Image from "next/image";
import { StarIcon, PlayIcon, PlusIcon } from "lucide-react";

export default function AnimeHero({ animeList }) {
  const [activeIndex, setActiveIndex] = useState(0);

  const scrollContainerRef = useRef(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = parseInt(entry.target.dataset.index, 10);
            setActiveIndex(index);
          }
        });
      },
      {
        root: container,
        threshold: 0.5,
      }
    );

    const slides = container.querySelectorAll('section');
    slides.forEach((slide) => observer.observe(slide));

    return () => observer.disconnect();
  }, [animeList]);

  return (
    <div className="relative w-full h-[60svh] md:h-[50svh] overflow-visible">
      <div
        ref={scrollContainerRef}
        className="overflow-x-auto snap-x snap-mandatory scrollbar-hide h-full"
      >
        <div className="flex h-full">
          {animeList.map((animeData, index) => (
            <section
              key={animeData.title}
              data-index={index}
              className="relative min-w-full h-full text-white snap-center flex-shrink-0 overflow-visible"
            >
              <Image
                src={animeData.bannerImage}
                alt={`${animeData.title} banner`}
                className="object-cover brightness-50"
                fill
                priority={index === 0} // Prioritize loading the first image
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
              <div className="relative h-full flex items-end p-4 sm:p-8 md:p-12 overflow-visible">
                <div className="w-full flex flex-col md:flex-row items-center md:items-end gap-6">
                  {/* COVER IMAGE */}
                  <div className="flex-shrink-0 w-40 md:w-56 mb-0 md:-mb-4 transform hover:scale-105 transition-transform duration-300">
                    <div className="relative aspect-[2/3] rounded-xl overflow-hidden ring-2 ring-pink-500/70 shadow-lg shadow-pink-500/20">
                      <Image
                        src={animeData.coverImage}
                        alt={`${animeData.title} cover`}
                        className="object-cover"
                        fill
                      />
                      <div className="absolute bottom-0 left-0 flex items-center justify-center gap-1 w-full p-1 bg-black/50 backdrop-blur-sm text-sm font-bold">
                        <StarIcon className="w-4 h-4 text-amber-400 fill-current" />
                        <span>{animeData.score}</span>
                      </div>
                    </div>
                  </div>
                  {/* TEXT & ACTION CONTENT */}
                  <div className="flex flex-col items-center md:items-start gap-4 text-center md:text-left">
                    <h1 className="text-3xl md:text-5xl font-extrabold tracking-tighter text-balance">
                      {animeData.title}
                    </h1>
                    <div className="flex flex-wrap justify-center md:justify-start items-center gap-2 text-sm">
                      <span className="font-semibold bg-pink-500/80 px-3 py-1 rounded-full">{"Airing"}</span>
                      {animeData.genres.slice(0, 3).map((genre) => (
                        <span key={genre} className="bg-white/10 px-3 py-1 rounded-full backdrop-blur-sm">{genre}</span>
                      ))}
                    </div>
                    <p className="hidden md:block max-w-2xl text-white/80 text-sm leading-relaxed line-clamp-3">
                      {animeData.description}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <button className="flex items-center gap-2 px-5 py-2.5 bg-pink-600 rounded-lg font-semibold hover:bg-pink-500 transition-colors">
                        <PlusIcon className="w-5 h-5" />
                        Add to List
                      </button>
                      <button className="flex items-center gap-2 px-5 py-2.5 bg-white/10 rounded-lg font-semibold backdrop-blur-sm hover:bg-white/20 transition-colors">
                        <PlayIcon className="w-5 h-5" />
                        Watch Trailer
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* PAGINATION DOTS */}
      {animeList.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {animeList.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === activeIndex ? 'w-8 bg-pink-500' : 'w-2 bg-white/40'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
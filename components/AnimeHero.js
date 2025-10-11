import { useState, useEffect, useRef } from 'react';
import Image from "next/image";
import { StarIcon, PlayIcon, PlusIcon } from "lucide-react";
import { motion } from 'motion/react';
import { useToast } from '@/providers/toast-provider';

export default function AnimeHero({ animeList }) {
  const { toast } = useToast();

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

  const buttonVariants = {
    initial: { gap: "0px" },
    hover: { gap: "8px" },
  };

  const iconVariants = {
    initial: {
      width: 0,
      opacity: 0,
      transition: { duration: 0.2 },
    },
    hover: {
      width: "20px",
      opacity: 1,
      transition: { duration: 0.2, delay: 0.1 },
    },
  };

  return (
    <div className="relative w-full h-[60svh] md:h-[50svh] overflow-visible">
      <div
        ref={scrollContainerRef}
        className="overflow-x-auto snap-x snap-mandatory scrollbar-hide h-full"
      >
        <div className="flex h-full">
          {animeList.slice(0, 7).map((animeData, index) => (
            <section
              key={animeData.title}
              data-index={index}
              className="relative min-w-full h-full text-white snap-center flex-shrink-0 overflow-visible"
            >
              {/* Mobile: Show cover image as background */}
              <Image
                src={animeData.coverImage}
                alt={`${animeData.title} cover`}
                className="md:hidden object-cover brightness-70"
                fill
                priority={index === 0}
              />
              {/* Desktop: Show banner image as background */}
              <Image
                src={animeData.bannerImage}
                alt={`${animeData.title} banner`}
                className="hidden md:block object-cover brightness-50"
                fill
                priority={index === 0}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[rgb(11,0,31)]/90 via-[rgb(11,0,31)]/50 to-transparent" />
              <div className="relative h-full flex items-end p-4 sm:p-8 md:p-12 overflow-visible">
                <div className="w-full flex flex-col md:flex-row items-center md:items-end gap-6">
                  {/* COVER IMAGE */}
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    transition={{ ease: "linear" }}
                    className="hidden md:block flex-shrink-0 w-56 -mb-4"
                  >
                    <div
                      className="relative aspect-[2/3] rounded-xl overflow-hidden shadow-lg hover:[box-shadow:0px_0px_200px_#e60076b3] transition-shadow duration-900 delay-100"
                    >
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
                  </motion.div>
                  {/* TEXT & ACTION CONTENT */}
                  <div className="flex flex-col items-center md:items-start gap-4 text-center md:text-left">
                    <h1 className="text-5xl font-extrabold tracking-tighter text-balance max-w-[300px] md:max-w-none">
                      {animeData.title}
                    </h1>
                    <div className="flex flex-wrap justify-center md:justify-start items-center gap-2 text-sm">
                      <span className="font-semibold bg-pink-500/80 px-3 py-1 rounded-full">{"Airing"}</span>
                      {animeData.genres.slice(0, 3).map((genre) => (
                        <span key={genre} className="bg-white/10 px-3 py-1 rounded-full backdrop-blur-sm">{genre}</span>
                      ))}
                      {/* Show score on mobile */}
                      {/* <span className="md:hidden flex items-center gap-1 bg-white/10 px-3 py-1 rounded-full backdrop-blur-sm">
                        <StarIcon className="w-4 h-4 text-amber-400 fill-current" />
                        {animeData.score}
                      </span> */}
                    </div>
                    <p className="hidden md:block max-w-2xl text-white/80 text-sm leading-relaxed line-clamp-3">
                      {animeData.description}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <motion.button
                        initial="initial"
                        whileHover="hover"
                        whileTap={{ scale: 0.95, y: 1 }}
                        variants={buttonVariants}
                        onClick={() => toast('Yoooo', 'info')}
                        className="sm:flex hidden items-center px-5 py-2.5 bg-pink-600 rounded-full font-semibold hover:bg-pink-500 transition-colors"
                      >
                        <motion.div variants={iconVariants} className="overflow-hidden">
                          <PlusIcon className="w-5 h-5" />
                        </motion.div>
                        <span>Add to List</span>
                      </motion.button>
                      <motion.button
                        initial="initial"
                        whileHover="hover"
                        whileTap={{ scale: 0.95, y: 1 }}
                        variants={buttonVariants}
                        className="sm:flex hidden items-center gap-2 px-5 py-2.5 bg-white/10 rounded-full font-semibold backdrop-blur-sm hover:bg-white/20 transition-colors"
                      >
                        <motion.div variants={iconVariants} className="overflow-hidden">
                          <PlayIcon className="w-5 h-5" />
                        </motion.div>
                        <span>Watch Trailer</span>
                      </motion.button>

                      <motion.button
                        whileTap={{ scale: 0.95, y: 1 }}
                        className="sm:hidden flex items-center gap-2 px-5 py-2.5 bg-pink-600 rounded-full font-semibold hover:bg-pink-500 transition-colors"
                      >
                        <PlusIcon className="w-5 h-5" />
                        Add to List
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.95, y: 1 }}
                        className="sm:hidden flex items-center gap-2 px-5 py-2.5 bg-white/10 rounded-full font-semibold backdrop-blur-sm hover:bg-white/20 transition-colors"
                      >
                        <PlayIcon className="w-5 h-5" />
                        Watch Trailer
                      </motion.button>
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
        <div className="absolute -bottom-4 md:bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {animeList.map((_, i) => (
            <div
              key={i}
              className={
                `h-2 rounded-full backdrop-blur-md transition-all duration-300 ${i === activeIndex ? 'w-8 bg-pink-500/70' : 'w-2 bg-white/40'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
import { useState, useEffect, useRef, useCallback } from 'react';
import { PlayIcon, PlusIcon } from "lucide-react";
import { motion } from 'motion/react';
import { useToast } from '../providers/toast-provider';
import { useRouter } from 'next/router';
import ParallaxCoverImage from './ParallaxCoverImage';
import { addAnimeToDefaultList, isAnimeInDefaultList } from '../utils/actions';
import gsap from 'gsap';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';

gsap.registerPlugin(ScrollToPlugin);

export default function AnimeHero({ animeList }) {
  const { toast } = useToast();
  const router = useRouter();

  const [activeIndex, setActiveIndex] = useState(0);
  const [isUserInteracting, setIsUserInteracting] = useState(false);
  const [addingToList, setAddingToList] = useState(false);
  const [optimisticAdded, setOptimisticAdded] = useState([]);

  const addingRef = useRef(false);
  const scrollContainerRef = useRef(null);
  const scrollTimeoutRef = useRef(null);
  const gsapTweenRef = useRef(null);
  const isProgrammaticRef = useRef(false);
  const activeIndexRef = useRef(0);

  const slidesToDisplay = animeList.slice(0, 7);

  const scrollToIndex = useCallback((index) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (gsapTweenRef.current) gsapTweenRef.current.kill();
    isProgrammaticRef.current = true;

    const tl = gsap.timeline({
      onComplete: () => { isProgrammaticRef.current = false; },
    });

    tl.to(container, {
      scrollTo: { x: index * container.clientWidth },
      duration: 0.75,
      ease: 'power2.inOut',
    });

    const incomingSlide = container.querySelector(`section[data-index='${index}']`);
    if (incomingSlide) {
      const targets = incomingSlide.querySelectorAll('.gsap-content');
      gsap.fromTo(
        targets,
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out', stagger: 0.08, delay: 0.35 },
      );
    }

    gsapTweenRef.current = tl;
  }, []);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  const handleAutoAdvance = useCallback(() => {
    setActiveIndex((prev) => {
      const next = (prev + 1) % slidesToDisplay.length;
      scrollToIndex(next);
      activeIndexRef.current = next;
      return next;
    });
  }, [scrollToIndex, slidesToDisplay.length]);

  const handlePause = useCallback(() => setIsUserInteracting(true), []);
  const handleResume = useCallback(() => setIsUserInteracting(false), []);

  const handleScroll = useCallback(() => {
    if (isProgrammaticRef.current) return;

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const newIndex = Math.round(container.scrollLeft / container.clientWidth);
      if (newIndex !== activeIndexRef.current) {
        setActiveIndex(newIndex);
        activeIndexRef.current = newIndex;
      }
    }, 100);
  }, []);

  const handleDotClick = useCallback((index) => {
    if (index === activeIndexRef.current) return;
    setActiveIndex(index);
    activeIndexRef.current = index;
    scrollToIndex(index);
  }, [scrollToIndex]);

  const handleAddToList = async (animeData) => {
    if (addingRef.current) return;
    const id = animeData.id || animeData.mal_id || animeData.title;
    if (optimisticAdded.includes(id)) { toast('Already added', 'info'); return; }

    const profileId = typeof window !== 'undefined' ? localStorage.getItem('profileId') : null;
    try {
      const exists = await isAnimeInDefaultList(animeData, profileId || undefined);
      if (exists) { toast('Already added', 'info'); return; }
    } catch { /* continue */ }

    addingRef.current = true;
    setOptimisticAdded(prev => [...prev, id]);
    setAddingToList(true);
    toast('Added to your list!', 'success');

    try {
      await addAnimeToDefaultList(animeData, profileId || undefined);
      try { router.replace(router.asPath, undefined, { scroll: false }); } catch { }
    } catch (error) {
      setOptimisticAdded(prev => prev.filter(x => x !== id));
      toast(error.message || 'Unable to add to list', 'error');
    } finally {
      addingRef.current = false;
      setAddingToList(false);
    }
  };

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (gsapTweenRef.current) gsapTweenRef.current.kill();
    };
  }, []);

  const buttonVariants = {
    initial: { gap: '0px' },
    hover: { gap: '8px' },
  };
  const iconVariants = {
    initial: { width: 0, opacity: 0, transition: { duration: 0.2 } },
    hover: { width: '20px', opacity: 1, transition: { duration: 0.2, delay: 0.1 } },
  };

  return (
    <div className="relative w-full h-[60svh] md:h-[50svh] overflow-visible">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onMouseEnter={handlePause}
        onMouseLeave={handleResume}
        onTouchStart={handlePause}
        onTouchEnd={handleResume}
        className="overflow-hidden h-full"
      >
        <div className="flex h-full">
          {slidesToDisplay.map((animeData, index) => (
            <section
              key={animeData.title}
              data-index={index}
              className="relative min-w-full h-full text-white shrink-0 overflow-visible"
            >
              <img
                src={animeData.coverImage}
                alt={`${animeData.title} cover`}
                className="md:hidden object-cover brightness-70 absolute inset-0 w-full h-full"
              />
              <img
                src={animeData.bannerImage}
                alt={`${animeData.title} banner`}
                className="hidden md:block object-cover brightness-50 absolute inset-0 w-full h-full"
              />
              <div className="absolute inset-0 bg-linear-to-t from-[rgb(11,0,31)]/90 via-[rgb(11,0,31)]/50 to-transparent" />

              <div className="relative h-full flex items-end p-4 sm:p-8 md:p-12 overflow-visible">
                <div className="w-full flex flex-col md:flex-row items-center md:items-end gap-6 perspective-[1000px]">
                  <ParallaxCoverImage animeData={animeData} />

                  <div className="flex flex-col items-center md:items-start gap-4 text-center md:text-left">
                    <h1 className="gsap-content text-5xl font-extrabold tracking-tighter text-balance max-w-75 md:max-w-[70svw] line-clamp-4 sm:line-clamp-2">
                      {animeData.title}
                    </h1>
                    <div className="gsap-content flex flex-wrap justify-center md:justify-start items-center gap-2 text-sm">
                      <span className="font-semibold bg-pink-500/80 px-3 py-1 rounded-full">Airing</span>
                      {animeData.genres.slice(0, 3).map((genre) => (
                        <span key={genre} className="bg-white/10 px-3 py-1 rounded-full backdrop-blur-sm">{genre}</span>
                      ))}
                    </div>
                    <p className="gsap-content hidden md:block max-w-2xl text-white/80 text-sm leading-relaxed line-clamp-3">
                      {animeData.description}
                    </p>
                    <div className="gsap-content flex items-center gap-3 mt-2">
                      {/* Desktop buttons */}
                      <motion.button
                        initial="initial" whileHover="hover" whileTap={{ scale: 0.95, y: 1 }}
                        variants={buttonVariants}
                        onClick={() => handleAddToList(animeData)}
                        disabled={addingToList || optimisticAdded.includes(animeData.id || animeData.mal_id || animeData.title)}
                        className="sm:flex hidden items-center px-5 py-2.5 bg-pink-600 rounded-full font-semibold hover:bg-pink-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <motion.div variants={iconVariants} className="overflow-hidden">
                          <PlusIcon className="w-5 h-5" />
                        </motion.div>
                        <span>{addingToList ? 'Adding...' : 'Add to List'}</span>
                      </motion.button>
                      <motion.button
                        initial="initial" whileHover="hover" whileTap={{ scale: 0.95, y: 1 }}
                        variants={buttonVariants}
                        onClick={() => router.push(`/watch?mal_id=${animeData.id}&season=1&episode=1`)}
                        className="sm:flex hidden items-center gap-2 px-5 py-2.5 bg-white/10 rounded-full font-semibold backdrop-blur-sm hover:bg-white/20 transition-colors"
                      >
                        <motion.div variants={iconVariants} className="overflow-hidden">
                          <PlayIcon className="w-5 h-5" />
                        </motion.div>
                        <span>Watch</span>
                      </motion.button>

                      {/* Mobile buttons */}
                      <motion.button
                        whileTap={{ scale: 0.95, y: 1 }}
                        onClick={() => handleAddToList(animeData)}
                        disabled={addingToList || optimisticAdded.includes(animeData.id || animeData.mal_id || animeData.title)}
                        className="sm:hidden flex items-center gap-2 px-5 py-2.5 bg-pink-600 rounded-full font-semibold hover:bg-pink-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <PlusIcon className="w-5 h-5" />
                        {addingToList ? 'Adding...' : 'Add to List'}
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.95, y: 1 }}
                        onClick={() => router.push(`/watch?mal_id=${animeData.id}&season=1&episode=1`)}
                        className="sm:hidden flex items-center gap-2 px-5 py-2.5 bg-white/10 rounded-full font-semibold backdrop-blur-sm hover:bg-white/20 transition-colors"
                      >
                        <PlayIcon className="w-5 h-5" />
                        Watch
                      </motion.button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes slide-progress {
          0% { transform: scaleX(0); }
          100% { transform: scaleX(1); }
        }
        .progress-bar {
          width: 100%;
          transform-origin: left center;
          will-change: transform;
        }
      `}</style>

      {/* PAGINATION DOTS */}
      {slidesToDisplay.length > 1 && (
        <div className="absolute -bottom-4 md:bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {slidesToDisplay.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => handleDotClick(i)}
              onMouseEnter={handlePause}
              onMouseLeave={handleResume}
              className={`relative overflow-hidden h-2 rounded-full backdrop-blur-md transition-all duration-300 ${i === activeIndex ? 'w-8 bg-white/30' : 'w-2 bg-white/40'
                }`}
            >
              {i === activeIndex && (
                <div
                  key={activeIndex}
                  onAnimationEnd={handleAutoAdvance}
                  className="absolute top-0 left-0 h-full bg-pink-500/80 progress-bar rounded-full"
                  style={{
                    transformOrigin: 'left center',
                    transform: 'scaleX(0)',
                    animation: 'slide-progress 5s linear forwards',
                    animationPlayState: isUserInteracting ? 'paused' : 'running'
                  }}
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
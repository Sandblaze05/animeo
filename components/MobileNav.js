'use client'

import { Clapperboard, Flame, Home, Tv, NewspaperIcon, User2Icon, SearchIcon } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from 'motion/react';
import gsap from "gsap"
import Image from "next/image"
import { useToast } from "@/providers/toast-provider"

const navItems = [
  { name: 'Home', href: '/', icon: Home },
  { name: 'Movies', href: '/movies', icon: Clapperboard },
  { name: 'TV', href: '/tv', icon: Tv },
  { name: 'News', href: '/news', icon: NewspaperIcon },
]

const formatDuration = (s = '') => {
  const hr = /(\d+)\s*h(?:r|ours?)?/i.exec(s);
  const min = /(\d+)\s*m(?:in(?:utes)?)?/i.exec(s);
  const parts = [];
  if (hr) parts.push(`${hr[1]}h`);
  if (min) parts.push(`${min[1]}m`);
  return parts.join(' ');
};

const searchCache = new Map();

const MobileNav = () => {
  const router = useRouter();
  const pathname = usePathname();
  const navRef = useRef(null);
  const selectedPillRef = useRef(null);
  const inputRef = useRef(null);
  const searchBoxRef = useRef(null);
  const tl = useRef(null);
  const { toast } = useToast();

  const [inputFocus, setInputFocus] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestionData, setSuggestionData] = useState(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);

  const fetchQuery = async (query) => {
    const now = Date.now();

    if (searchCache.has(query)) {
      const { data, expiry } = searchCache.get(query);
      if (now < expiry) {
        setSuggestionData(data);
        return;
      } else {
        searchCache.delete(query);
      }
    }

    setSuggestionLoading(true);
    try {
      const response = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=5`);
      if (!response.ok) {
        toast('Error in search', 'error');
        return;
      }
      const data = await response.json();
      searchCache.set(query, {
        data: data.data,
        expiry: now + 3 * 1000 * 60
      });
      setSuggestionData(data.data);
    } catch (err) {
      toast(`${err.message}`, 'error');
      setSuggestionData([]);
    } finally {
      setSuggestionLoading(false)
      if (searchCache.size > 100) {
        searchCache.delete(searchCache.keys().next().value);
      }
    }
  }

  useEffect(() => {
    if (!query || query.trim().length === 0) {
      setSuggestionData(null);
      return;
    }

    const timer = setTimeout(() => {
      fetchQuery(query);
    }, 1000);

    return () => clearTimeout(timer);
  }, [query]);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      tl.current = gsap.timeline({ paused: true })
        .to(searchBoxRef.current, {
          width: '65svw',
          duration: 0.4,
          ease: 'power2.inOut'
        });
    }, searchBoxRef);

    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (inputFocus) {
      tl.current?.play();
    } else {
      tl.current?.reverse();
    }
  }, [inputFocus]);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const activePill = selectedPillRef.current;
    if (!nav || !activePill) return;

    const targetLink = nav.querySelector(`a[href='${pathname}']`);

    if (targetLink) {
      gsap.to(activePill, {
        x: targetLink.offsetLeft,
        width: targetLink.offsetWidth,
        opacity: 1,
        duration: 0.4,
        ease: 'power2.inOut'
      });
    }

  }, [pathname]);

  return (
    <div className="w-screen z-9000 sm:hidden">
      <div aria-label="menu" className="fixed left-5 top-5 p-2 h-12 w-12 flex items-center justify-center rounded-full bg-black/20 border-white/20 border-1 shadow-2xl backdrop-blur-lg">
        <svg width="30px" height="30px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 18H10" stroke="#FFF" strokeWidth="2" strokeLinecap="round" />
          <path d="M4 12L16 12" stroke="#FFF" strokeWidth="2" strokeLinecap="round" />
          <path d="M4 6L20 6" stroke="#FFF" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <div className="fixed right-5 top-5 gap-1 flex items-center justify-between ">
        <motion.form
          whileTap={{ scale: 0.95, y: 0.5 }}
          ref={searchBoxRef}
          onClick={() => inputRef.current?.focus()}
          onSubmit={(e) => {
            e.preventDefault();
            if (query) router.push(`/anime/${encodeURIComponent(query)}`);
            inputRef.current?.blur();
          }}
          className="flex cursor-pointer px-3 gap-3 items-center justify-start text-white w-[35svw] max-w-[calc(100svw-10rem)] h-12 rounded-full border-1 border-white/20 bg-black/20 backdrop-blur-lg overflow-clip"
        >
          <SearchIcon className="text-white/70 w-5 h-5" />
          <input
            ref={inputRef}
            onFocus={() => setInputFocus(true)}
            onBlur={() => setTimeout(() => setInputFocus(false), 200)}
            onChange={(e) => setQuery(e.target.value)}
            value={query}
            type="search"
            enterKeyHint="search"
            placeholder="Search..."
            className="flex-1 w-[10svw] h-full ring-0 outline-0 text-xs bg-transparent"
          />
        </motion.form>

        <div aria-label="profile" className="h-12 w-12 flex justify-center items-center rounded-full bg-black/20 border-white/20 border-1 shadow-2xl backdrop-blur-lg">
          <User2Icon className="text-white fill-white" />
        </div>

        <AnimatePresence>
          {inputFocus && suggestionData && suggestionData.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -20, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -20, height: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="fixed top-18 left-1/2 -translate-x-1/2 w-[80svw] bg-black/60 backdrop-blur-xl rounded-2xl border border-white/20 overflow-hidden shadow-2xl flex flex-col z-50"
            >
              {suggestionData.map((anime, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 border-b border-white/20 last:border-none hover:bg-white/10 transition-colors cursor-pointer">
                  <div className="h-12 w-12 relative shrink-0 rounded-md overflow-hidden bg-white/10">
                    <Image src={anime.images.webp.small_image_url} alt={anime.title} fill className="object-cover" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm text-white truncate font-medium">{anime.title}</span>
                    <span className="text-xs text-white/50 truncate">
                      {anime.type} • {anime.year || 'N/A'} • {formatDuration(anime.duration)}
                    </span>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <footer
        ref={navRef}
        className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[60vw] h-13 border-[1px] border-white/20 bg-black/30 backdrop-blur-lg flex sm:hidden justify-around items-center rounded-full shadow-2xl p-1 z-[9999]"
      >
        <div
          ref={selectedPillRef}
          className="absolute left-0 h-[calc(100%-0.5rem)] bg-white/40 rounded-full opacity-0 -z-10"
        ></div>

        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              aria-label={item.name}
              key={item.name}
              href={item.href}
              className="flex-1 h-full flex justify-center items-center"
            >
              <item.icon className={`h-6 w-6 transition-colors ${isActive ? 'text-white' : 'text-gray-400'}`} />
            </Link>
          )
        })}
      </footer>
    </div>
  )
}

export default MobileNav
import React, { useEffect, useRef, useState } from 'react'
import { SearchIcon } from 'lucide-react';
import { useToast } from '@/providers/toast-provider';
import Image from 'next/image';
import gsap from 'gsap';

const formatDuration = (s = '') => {
  const hr = /(\d+)\s*h(?:r|ours?)?/i.exec(s);
  const min = /(\d+)\s*m(?:in(?:utes)?)?/i.exec(s);
  const parts = [];
  if (hr) parts.push(`${hr[1]}h`);
  if (min) parts.push(`${min[1]}m`);
  return parts.join(' ');
};

const SearchBox = ({ onClose }) => {
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const highlightRef = useRef(null);
  const listRef = useRef(null);
  const [query, setQuery] = useState('');
  const [suggestionData, setSuggestionData] = useState(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [inputFocus, setInputFocus] = useState(true);
  const [focusedSuggestion, setFocusedSuggestion] = useState(null);
  const { toast } = useToast();
  const ITEM_HEIGHT = 80;
  const lastNavAtRef = useRef(0);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        onClose();
      }
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    }
  }, []);

  useEffect(() => {
    const handleArrowInput = (e) => {
      const len = suggestionData?.length ?? 0;
      if (!len) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();

        const now = performance.now();
        if (e.repeat && now - lastNavAtRef.current < 200) return;
        lastNavAtRef.current = now;

        if (e.key === 'ArrowDown') {
          if (inputFocus) {
            setFocusedSuggestion(0);
            inputRef.current?.blur();
          } else {
            setFocusedSuggestion(prev => (prev === null ? 0 : (prev + 1) % len));
          }
        } else if (e.key === 'ArrowUp' && !inputFocus) {
          setFocusedSuggestion(prev => (prev === null ? len - 1 : (prev - 1 + len) % len));
        }

        if (e.key === '/' && !inputFocus) {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleArrowInput);
    return () => window.removeEventListener('keydown', handleArrowInput);
  }, [suggestionData, inputFocus]);

  const fetchQuery = async (query) => {
    setSuggestionLoading(true);
    try {
      const response = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=5`);
      if (!response.ok) {
        toast('Error in search', 'error');
        return;
      }
      const data = await response.json();
      setSuggestionData(data.data);
      // toast(`${data.data[0].title}`, 'info');
    } catch (err) {
      toast(`${err.message}`, 'error');
      setSuggestionData([]);
    } finally {
      setSuggestionLoading(false)
    }
  }

  useEffect(() => {
    if (!query || query.trim().length === 0) return;

    const timer = setTimeout(() => {
      fetchQuery(query);
    }, 2000);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (focusedSuggestion === null || !highlightRef.current) return;

    const top = focusedSuggestion * ITEM_HEIGHT;

    gsap.to(highlightRef.current, {
      opacity: 1,
      duration: 0.2,
      ease: 'power2.out'
    });

    gsap.to(highlightRef.current, {
      top,
      duration: 0.35,
      ease: 'power2.inOut'
    });

    // Ensure the focused item is visible
    const container = listRef.current;
    if (container) {
      const viewTop = container.scrollTop;
      const viewBottom = viewTop + container.clientHeight;
      const itemTop = top;
      const itemBottom = top + ITEM_HEIGHT;

      if (itemTop < viewTop) {
        container.scrollTo({ top: itemTop, behavior: 'smooth' });
      } else if (itemBottom > viewBottom) {
        container.scrollTo({ top: itemBottom - container.clientHeight, behavior: 'smooth' });
      }
    }
  }, [focusedSuggestion]);

  return (
    <>
      <div className='fixed inset-0 bg-black/50 z-9998' />
      <div
        ref={boxRef}
        className='z-9999 transition-all w-[40svw] h-[35svh] bg-black/20 fixed 
        left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white
        border-1 border-white/20 shadow-2xl backdrop-blur-lg rounded-md
        flex flex-col items-center justify-start py-2'
      >
        <div className='flex items-center justify-center w-full h-13 px-2 shrink-0'>
          <SearchIcon className='text-[grey] h-8 w-8 pb-3' />
          <input
            type="text"
            name="search"
            id="search"
            placeholder='Search...'
            value={query}
            ref={inputRef}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setInputFocus(true)}
            onBlur={() => setInputFocus(false)}
            autoFocus
            className='w-[95%] ring-0 outline-0 px-4 pt-2 pb-4'
          />
        </div>

        <div className='w-full h-[1px] bg-white/20' />

        <div className='relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden w-full scroll-smooth scrollbar-hide' ref={listRef}>
          <>
            {suggestionData === null && (
              <span className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/20 text-sm cursor-default'>Search to see Suggestions</span>
            )}
            {/* Highlight pill */}
            <div
              ref={highlightRef}
              className='absolute left-0 w-full h-20 bg-white/90 rounded-sm pointer-events-none z-9998'
              style={{ opacity: 0, top: 0 }}
            />

            {suggestionData?.map((anime, idx) => (
              <div
                key={idx}
                className='cursor-pointer w-full h-20 flex items-center justify-between text-sm shrink-0 px-4 py-2 border-b-1 border-white/20 z-9999 transition-colors duration-500'
                style={{
                  color: idx === focusedSuggestion ? 'black' : 'inherit',
                }}
              >
                <div className='flex flex-col justify-center items-start gap-1 max-w-[80%]'>
                  <span className='line-clamp-1'>{anime.title}</span>
                  <span className='text-xs flex items-center gap-1'>
                    <p>{anime.aired.string.split('to')[0].trim()}</p>
                    •
                    <p>{anime.type}</p>
                    •
                    <p>{formatDuration(anime.duration)}</p>
                  </span>
                </div>

                <div className='h-10 w-10 mb-4 bg-white/20'>
                  <Image alt='' src={anime.images.webp.small_image_url} width={100} height={100} objectFit='contain' />
                </div>
              </div>
            ))}
            {suggestionData !== null && (
              <div className='w-full h-20 p-10 text-sm flex items-center justify-center cursor-pointer hover:bg-white/20'>
                More results
              </div>
            )}
          </>
        </div>
      </div>
    </>
  )
}

export default SearchBox
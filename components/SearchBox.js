import React, { useEffect, useRef, useState } from 'react'
import { SearchIcon } from 'lucide-react';
import { useToast } from '@/providers/toast-provider';

const SearchBox = ({ onClose }) => {
  const boxRef = useRef(null);
  const [query, setQuery] = useState('');
  const [suggestionData, setSuggestionData] = useState(null);
  const { toast } = useToast();

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
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    };
  }, []);

  const fetchQuery = async (query) => {
    try {
      const response = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=5`);
      if (!response.ok) {
        toast('Error in search', 'error');
        return;
      }
      const data = await response.json();
      setSuggestionData(data.data || []);
      // toast(`${data.data[0].title}`, 'info');
    } catch (err) {
      toast(`${err.message}`, 'error');
      setSuggestionData([]);
    }
  }

  useEffect(() => {
    if (!query || query.trim().length === 0) return;

    const timer = setTimeout(() => {
      fetchQuery(query);
    }, 2000);

    return () => clearTimeout(timer);
  }, [query]);

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
        <div className='flex items-center justify-center w-full px-2'>
          <SearchIcon className='text-[grey] h-8 w-8 pb-3' />
          <input 
            type="text" 
            name="search" 
            id="search" 
            placeholder='Search...' 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className='w-[95%] ring-0 outline-0 px-4 pt-2 pb-4' 
          />
        </div>
        <div className='w-full h-[1px] bg-white/20' />
      </div>
    </>
  )
}

export default SearchBox
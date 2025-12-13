'use client'

import { useToast } from '@/providers/toast-provider';
import { Star, PlusIcon, PlayIcon, Grid2X2Icon, ListIcon, Loader2, ChevronRight, ChevronLeft } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { motion } from 'motion/react';

const SearchClient = ({ title, initialData, initialPagination }) => {
  const { toast } = useToast();

  const [listOfAnime, setListOfAnime] = useState(initialData || []);
  const [pagination, setPagination] = useState(initialPagination || {});
  const [layoutType, setLayoutType] = useState('grid');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showReadMore, setShowReadMore] = useState(false);
  const synopsisRef = useRef(null);

  useEffect(() => {
    if (synopsisRef.current) {
      setShowReadMore(synopsisRef.current.clientHeight > 150);
    }
  }, [selectedEntry, listOfAnime]);

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

  const loadMore = async () => {
    if (!pagination.has_next_page) return;

    setIsLoadingMore(true);
    const nextPage = (pagination.current_page || 1) + 1;

    try {
      const response = await fetch(`https://api.jikan.moe/v4/anime?q=${title}&limit=20&page=${nextPage}`);
      if (!response.ok) {
        toast('Error fetching more data', 'error');
        return;
      }
      const data = await response.json();
      setListOfAnime(prev => [...prev, ...data.data]);
      setPagination(data.pagination);
    } catch (err) {
      toast(`${err.message}`, 'error');
    } finally {
      setIsLoadingMore(false);
    }
  };

  const goToPage = async (page) => {
    if (page < 1 || page > pagination.last_visible_page) return;

    setIsLoadingMore(true);

    try {
      const response = await fetch(`https://api.jikan.moe/v4/anime?q=${title}&limit=20&page=${page}`);
      if (!response.ok) {
        toast('Error fetching data', 'error');
        return;
      }
      const data = await response.json();
      setListOfAnime(data.data);
      setPagination(data.pagination);
    } catch (err) {
      toast(`${err.message}`, 'error');
    } finally {
      setIsLoadingMore(false);
    }
  };

  return (
    <div className='mt-20 border-t-1 border-white/20 w-screen flex flex-col text-white'>
      <div className='w-screen h-20 flex items-center px-4'>
        <h2 className='text-xl font-bold text-white flex'>Search:&ensp;<span className='text-lg font-normal'>{decodeURIComponent(title)}</span></h2>
      </div>

      <div className='w-screen flex'>
        {/* Result container */}
        <div
          className='relative flex flex-col items-center justify-start w-screen lg:w-[70%] 
          h-screen rounded-none border-r-0 lg:rounded-tr-xl border-t-1 
          lg:border-r-1 border-white/20'
          >
          {/* Header of search results */}
          <div className='flex items-center bg-[#0b001f]/50 justify-between px-3 py-1 absolute top-0 left-0 w-full h-10 rounded-none lg:rounded-tr-xl border-b-1 border-white/20 backdrop-blur-lg z-10'>
            <span className='text-xs'>
              {pagination?.items?.total || listOfAnime?.length}&ensp;Results
            </span>

            {/* Layout toggle */}
            <div className='relative flex p-1 rounded-md items-center justify-center border-1 border-white/40 gap-2'>
              <Grid2X2Icon onClick={() => setLayoutType('grid')} style={{ color: layoutType === 'grid' ? 'black' : 'grey' }} className='h-5 w-5 z-1 transition-colors' />
              <div
                style={{
                  transform: layoutType === 'grid' ? 'translateX(-50%)' : 'translateX(50%)',
                  borderTopLeftRadius: layoutType === 'grid' ? 'calc(var(--radius) - 2px)' : '0px',
                  borderTopRightRadius: layoutType !== 'grid' ? 'calc(var(--radius) - 2px)' : '0px',
                  borderBottomLeftRadius: layoutType === 'grid' ? 'calc(var(--radius) - 2px)' : '0px',
                  borderBottomRightRadius: layoutType !== 'grid' ? 'calc(var(--radius) - 2px)' : '0px',
                }}
                className='absolute h-full w-[50%] bg-white -z-1 transition-all'
              />
              <div className='absolute top-1/2 left-1/2 -translate-1/2 h-full w-[1px] bg-white/20' />
              <ListIcon onClick={() => setLayoutType('list')} style={{ color: layoutType !== 'grid' ? 'black' : 'grey' }} className='h-5 w-5 z-1 transition-colors' />
            </div>
          </div>

          {/* Main results */}
          <div className='flex flex-wrap scrollbar-hide scroll-smooth content-start gap-4 overflow-x-hidden overflow-y-scroll px-4 pb-6 pt-14 w-full h-full lg:rounded-tr-xl rounded-none'>
            {listOfAnime?.map((anime, i) => (
              <div
                key={`${anime.mal_id}-${i}`}
                onClick={() => {setSelectedEntry(i); setIsExpanded(false);}}
                style={{
                  borderColor: selectedEntry === i ? 'oklch(59.2% 0.249 0.584)' : 'color-mix(in oklab, var(--color-white) 20%, transparent)',
                  borderWidth: selectedEntry === i ? '4px' : '1px',
                }}
                className='relative aspect-[2/3] w-[calc(33.33%-0.7rem)] sm:w-[calc(25%-0.75rem)]
                xl:w-[calc(20%-0.8rem)] bg-white/5 hover:bg-white/10 border-1 transition-all rounded-xl overflow-hidden 
                group flex flex-col justify-end cursor-pointer'
              >
                <Image
                  src={anime.images.webp.large_image_url}
                  alt={anime.title}
                  width={100}
                  height={100}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                />

                <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />

                <h1 className='relative max-w-[80%] mx-auto max-h-10 text-sm font-bold text-white text-center px-2 pb-3 line-clamp-2'>
                  {anime.title}
                </h1>
              </div>
            ))}

            {/* Pages */}
            {pagination?.has_next_page && (
              <div className="w-full flex justify-center py-4 gap-2 flex-wrap mb-15">
                <button
                  onClick={() => goToPage(pagination.current_page - 1)}
                  disabled={pagination.current_page === 1 || isLoadingMore}
                  className='px-3 py-2 bg-white/10 hover:bg-white/20 
                  disabled:opacity-50 disabled:cursor-not-allowed rounded-lg 
                  text-sm font-semibold transition-colors group flex 
                  items-center justify-center border-1 border-white/20'
                >
                  <ChevronLeft className='group-hover:-translate-x-1 transition-transform' />
                  Prev
                </button>

                {Array.from({ length: pagination.last_visible_page }).map((_, idx) => {
                  const pageNum = idx + 1;
                  const currentPage = pagination.current_page || 1;

                  // Show first page, last page, current page, and pages around current
                  const shouldShow =
                    pageNum === 1 ||
                    pageNum === pagination.last_visible_page ||
                    Math.abs(pageNum - currentPage) <= 1;

                  // Show ellipsis
                  const showEllipsisBefore = pageNum === currentPage - 2 && pageNum > 1;
                  const showEllipsisAfter = pageNum === currentPage + 2 && pageNum < pagination.last_visible_page;

                  if (showEllipsisBefore || showEllipsisAfter) {
                    return <span key={`ellipsis-${idx}`} className='p-2 text-white/50'>...</span>
                  }

                  if (!shouldShow) return null;

                  return (
                    <button
                      key={pageNum}
                      onClick={() => goToPage(pageNum)}
                      disabled={isLoadingMore}
                      className={`px-3 py-2 aspect-square w-10 h-10 rounded-lg border-1 border-white/20 text-sm font-semibold transition-colors ${currentPage === pageNum
                        ? 'bg-pink-600 text-white'
                        : 'bg-white/10 hover:bg-white/20'
                        }`}
                    >
                      {pageNum}
                    </button>
                  )
                })}

                <button
                  onClick={() => goToPage(pagination.current_page + 1)}
                  disabled={!pagination.has_next_page || isLoadingMore}
                  className="px-3 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 
                  disabled:cursor-not-allowed group rounded-lg text-sm font-semibold 
                  transition-colors flex items-center justify-center gap-1 border-1 border-white/20"
                >
                  Next
                  <ChevronRight className='group-hover:translate-x-1 transition-transform' />
                </button>
              </div>
            )}
          </div>
        </div>
        {/* Side content - visisble only on desktop */}
        {selectedEntry !== null && (
          <div className='lg:flex flex-col lg:flex-1 hidden p-4 justify-start items-center gap-3'>
            <div className='relative border-1 border-white/20 rounded-xl aspect-[9/16] h-60 w-40'>
              <Image
                src={listOfAnime[selectedEntry].images.webp.large_image_url}
                alt={listOfAnime[selectedEntry].title}
                width={100}
                height={100}
                className="absolute inset-0 rounded-xl w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
              />
              <h1 className='absolute w-[20rem] -bottom-3 left-1/2 -translate-x-1/2 text-lg text-center font-bold [text-shadow:0px_0px_2px_black] leading-4.5 tracking-tight line-clamp-2'>
                {listOfAnime[selectedEntry].title}
              </h1>
            </div>

            <div className='flex gap-2 items-center justify-center text-xs text-white/40 mt-1'>
              <span className='flex items-center justify-around gap-1 font-bold'><Star className='text-white/40 fill-white/40 inline-block h-3 w-3' />{listOfAnime[selectedEntry].score}</span>
              |
              <span className='font-bold'>{listOfAnime[selectedEntry].type}</span>
              |
              <span
                className='rounded-md font-bold bg-white/40 text-black flex items-center justify-center px-1'
              >
                {listOfAnime[selectedEntry].rating.match(/^[A-Za-z0-9+-]+/)[0]}
              </span>
            </div>

            {/* Buttons */}
            <div className='h-10 w-[80%] mx-auto flex flex-row-reverse gap-2 items-center justify-center mt-2'>
              <motion.button
                initial="initial"
                whileHover="hover"
                whileTap={{ scale: 0.95, y: 1 }}
                variants={buttonVariants}
                onClick={() => toast('Adding to list', 'info')}
                className="flex items-center px-5 py-2.5 bg-pink-600 rounded-full font-semibold hover:bg-pink-500 transition-colors"
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
                className="flex items-center gap-2 px-5 py-2.5 bg-white/10 rounded-full font-semibold backdrop-blur-sm hover:bg-white hover:text-black transition-colors"
              >
                <motion.div variants={iconVariants} className="overflow-hidden">
                  <PlayIcon className="w-5 h-5" />
                </motion.div>
                <span>Watch</span>
              </motion.button>
            </div>

            <div className='relative h-fit w-full px-2'>
              <div className='absolute top-2 left-5 bg-white border-1 border-white/40 rounded-md px-1 z-10'>
                <span className='text-xs text-black font-bold'>Synopsis</span>
              </div>
              
              <div 
                className='relative border-1 border-white/40 rounded-md mt-5 overflow-hidden transition-all duration-300'
                style={{
                  height: isExpanded ? '400px' : '150px'
                }}
              >
                <div 
                  className='h-full w-full overflow-y-auto scrollbar-hide'
                  style={{ overflowY: isExpanded ? 'auto' : 'hidden' }}
                >
                  <div 
                    ref={synopsisRef}
                    className='text-sm tracking-wide leading-6 px-3 pt-6 pb-10 w-full text-white/80'
                  >
                    {listOfAnime[selectedEntry].synopsis}
                  </div>
                </div>

                {!isExpanded && showReadMore && (
                  <div className='absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-[#0b001f]/40 via-[#0b001f]/20 to-transparent pointer-events-none' />
                )}

                {showReadMore && (
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className='absolute bottom-0 left-0 w-full py-1.5 bg-gradient-to-t from-[#0b001f] to-[#0b001f]/50 hover:bg-black/60 backdrop-blur-md text-xs font-bold text-white transition-colors z-20'
                  >
                    {isExpanded ? 'Show Less' : 'Show More'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SearchClient
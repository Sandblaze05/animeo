import React, { useEffect, useState } from 'react'
import Image from 'next/image'
import { X } from 'lucide-react';
import { AnimatePresence, hover, motion } from 'motion/react';
import SeasonFlyCard from './SeasonFlyCard';

const colorMap = {
  0: '#fff893',
  1: '#ff93db',
  2: '#93e8ff',
  3: '#96ff93'
};

const CurrentSeason = ({ currentSeason }) => {

  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [popupAnime, setPopupAnime] = useState(null);

  return (
    <div className='flex relative w-full min-h-[50svh] mt-10 md:mt-0 border-t-1 border-b-1 border-pink-500'>
      <div
        className='absolute -top-2 -left-2 bg-[#0b001f] p-3 text-2xl sm:text-4xl 
        font-extrabold tracking-widest text-[#f6339a] border-1 border-pink-500
        [box-shadow:5px_5px_0px_#f6339a]'
      >
        <h1>{"Current Airing"}</h1>
      </div>

      <div className='flex items-center justify-start px-10 min-w-full overflow-x-auto overflow-y-hidden mt-14 scrollbar-hide scroll-smooth'>
        <div className='flex gap-15'>
          {currentSeason.map((anime, idx) => (
            <div
              key={idx}
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={() => setPopupAnime(anime)}
              className='flex relative h-73 w-53 transition-all duration-[800ms] z-10'
              style={{ 
                filter: `${hoveredIndex !== null && hoveredIndex !== idx ? 'brightness(50%)' : 'brightness(100%)'}`,
                zIndex: hoveredIndex === idx ? 50 : 10
              }}
            >
              <div
                style={{ borderColor: `${colorMap[(idx % 4)]}` }}
                className='flex relative h-full w-full overflow-clip border-3 bg-[#0b001f] hover:-translate-[4px] transform transition-all z-20'
              >
                <Image src={anime.coverImage} width={300} height={100} alt={""} objectFit='cover' className='absolute inset-0' />
              </div>
              <div style={{ boxShadow: `4px 4px 0px ${colorMap[(idx % 4)]}` }} className='-z-1  absolute inset-0' />

              <AnimatePresence>
                {hoveredIndex === idx && 
                  <div 
                    className='absolute left-52 top-2 z-1'
                  >
                    <SeasonFlyCard anime={anime} color={colorMap[(idx % 4)]} />
                  </div>
                }
              </AnimatePresence>

            </div>
          ))}

        </div>
      </div>

      <AnimatePresence>
        {popupAnime !== null ? (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            className='bg-[#2e041e] fixed inset-0 flex sm:hidden z-[9000]'
          >
            <div className='absolute top-5 right-5 cursor-pointer' onClick={() => setPopupAnime(null)}>
              <X />
            </div>
            <h1>{popupAnime?.title}</h1>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export default CurrentSeason
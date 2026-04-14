import React, { useEffect, useState, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react';
import SeasonFlyCard from './SeasonFlyCard';
import { useRouter } from 'next/router';

const colorMap = {
  0: '#fff893',
  1: '#ff93db',
  2: '#93e8ff',
  3: '#96ff93'
};

const AnimeSection = ({ title, animeList, sectionColor }) => {

  const router = useRouter();

  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [flyCardPosition, setFlyCardPosition] = useState('right');
  const cardRefs = useRef([]);

  const handleMouseEnter = (idx) => {
    setHoveredIndex(idx);
    
    // Check if the fly card would go out of bounds
    if (cardRefs.current[idx]) {
      const rect = cardRefs.current[idx].getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const flyCardWidth = 228; // w-57 = 14.25rem = ~228px
      
      // If the right edge of the card + fly card width exceeds viewport, show on left
      if (rect.right + flyCardWidth + 20 > viewportWidth) {
        setFlyCardPosition('left');
      } else {
        setFlyCardPosition('right');
      }
    }
  };

  if (!animeList || animeList.length === 0) return null;

  return (
    <div 
      style={{ borderTopColor: sectionColor }}
      className='flex relative w-full min-h-[50svh] mt-10 md:mt-0 border-t border-pink-500 last:mb-10'
    >
      <div
        style={{ 
          borderColor: sectionColor, 
          boxShadow: `5px 5px 0px ${sectionColor}`,
          color: sectionColor 
        }}
        className='absolute -top-2 -left-2 bg-[#0b001f] p-3 text-2xl sm:text-4xl 
        font-extrabold tracking-widest border z-30'
      >
        <h1>{title}</h1>
      </div>

      <div className='flex items-center justify-start px-10 py-5 min-w-full overflow-x-auto overflow-y-hidden mt-14 scrollbar-hide scroll-smooth'>
        <div className='flex gap-15'>
          {animeList.map((anime, idx) => (
            <div
              key={idx}
              ref={(el) => (cardRefs.current[idx] = el)}
              onMouseEnter={() => handleMouseEnter(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={(e) => { e.stopPropagation(); router.push(`/anime?id=${anime.id}&title=${anime.title}`); }}
              className='flex relative h-73 w-53 transition-all duration-800 z-10 cursor-pointer'
              style={{ 
                filter: `${hoveredIndex !== null && hoveredIndex !== idx ? 'brightness(50%)' : 'brightness(100%)'}`,
                zIndex: hoveredIndex === idx ? 50 : 10
              }}
            >
              <div
                style={{ borderColor: `${colorMap[(idx % 4)]}` }}
                className='flex relative h-full w-full overflow-clip border-3 bg-[#0b001f] hover:-translate-1 transform transition-all z-20'
              >
                <img src={anime.coverImage} width={300} height={100} alt={""} className='absolute inset-0 object-cover w-full h-full' />
              </div>
              <div style={{ boxShadow: `4px 4px 0px ${colorMap[(idx % 4)]}` }} className='-z-1  absolute inset-0' />

              <AnimatePresence>
                {hoveredIndex === idx && 
                  <div 
                    className={`absolute top-2 z-1 ${flyCardPosition === 'left' ? 'right-52' : 'left-52'}`}
                  >
                    <SeasonFlyCard anime={anime} color={colorMap[(idx % 4)]} isOnLeft={flyCardPosition === 'left'} />
                  </div>
                }
              </AnimatePresence>

            </div>
          ))}

        </div>
      </div>
    </div>
  )
}

export default AnimeSection

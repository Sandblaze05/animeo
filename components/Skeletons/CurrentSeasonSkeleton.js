import React from 'react'

const colorMap = {
  0: '#fff893',
  1: '#ff93db',
  2: '#93e8ff',
  3: '#96ff93'
};

const CurrentSeasonSkeleton = () => {
  // Create 8 skeleton cards
  const skeletonCards = Array.from({ length: 8 }, (_, idx) => idx);

  return (
    <div className='flex relative w-full min-h-[50svh] mt-10 md:mt-0 border-t-1 border-b-1 border-pink-500'>
      <div
        className='absolute -top-2 -left-2 bg-[#0b001f] p-3 text-2xl sm:text-4xl 
        font-extrabold tracking-widest text-[#f6339a] border-1 border-pink-500
        [box-shadow:5px_5px_0px_#f6339a]'
      >
        <h1>{"Current Airing"}</h1>
      </div>

      <div className='flex items-center justify-start px-10 py-5 min-w-full overflow-x-auto overflow-y-hidden mt-14 scrollbar-hide scroll-smooth'>
        <div className='flex gap-15'>
          {skeletonCards.map((idx) => (
            <div
              key={idx}
              className='flex relative h-73 w-53 transition-all duration-[800ms] z-10'
            >
              <div
                style={{ borderColor: `${colorMap[(idx % 4)]}` }}
                className='flex relative h-full w-full overflow-clip border-3 bg-[#0b001f]'
              >
                {/* Skeleton shimmer effect with color tint */}
                <div 
                  className='absolute inset-0 animate-pulse'
                  style={{
                    background: `linear-gradient(90deg, 
                      rgba(38, 38, 38, 0.8) 0%, 
                      ${colorMap[(idx % 4)]}40 50%, 
                      rgba(38, 38, 38, 0.8) 100%)`
                  }}
                />
              </div>
              <div style={{ boxShadow: `4px 4px 0px ${colorMap[(idx % 4)]}` }} className='-z-1 absolute inset-0' />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default CurrentSeasonSkeleton
import React from 'react'

const CurrentSeason = ({ currentSeason }) => {

  return (
    <div className='relative w-full min-h-[50svh] border-1 border-pink-500 [box-shadow:5px_5px_0px_#f6339a] mt-10 md:mt-0'>
      <div 
        className='absolute -top-2 -left-2 bg-[#0b001f] p-3 text-2xl sm:text-4xl 
        font-extrabold tracking-widest text-[#f6339a] border-1 border-pink-500
        [box-shadow:5px_5px_0px_#f6339a]'
      >
        <h1>{"Current Airing"}</h1>
        {/* <div className='absolute bg-[#f6339a] inset-0 transform translate-1 -z-1' /> */}
      </div>
    </div>
  )
}

export default CurrentSeason
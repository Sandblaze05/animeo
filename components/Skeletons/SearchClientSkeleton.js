import React from 'react'

const SearchClientSkeleton = () => {
  return (
    <div className='mt-20 border-t border-white/20 w-screen flex flex-col text-white'>
      <div className='w-screen h-20 flex items-center px-4'>
        <h2 className='text-xl font-bold text-white'>Loading results…</h2>
      </div>

      <div className='w-screen flex'>
        <div className='relative flex flex-col items-center justify-start w-screen lg:w-[70%] h-screen rounded-none border-r-0 lg:rounded-tr-xl border-t lg:border-r border-white/20'>
          <div className='flex flex-wrap gap-4 overflow-hidden px-4 pt-14 pb-6 w-full h-full'>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className='animate-pulse relative aspect-2/3 w-[calc(33.33%-0.7rem)] sm:w-[calc(25%-0.75rem)] xl:w-[calc(20%-0.8rem)] bg-white/5 rounded-xl overflow-hidden'>
                <div className='absolute inset-0 bg-linear-to-br from-gray-800 via-gray-700 to-gray-800' />
                <div className='absolute bottom-0 left-0 w-full h-1/2 bg-linear-to-t from-black/70 to-transparent' />
                <div className='relative p-3'>
                  <div className='h-4 bg-white/20 rounded w-3/4 mb-2' />
                  <div className='h-3 bg-white/10 rounded w-1/2' />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className='lg:flex flex-col lg:flex-1 hidden p-4 justify-start items-center gap-3'>
          <div className='h-60 w-40 bg-white/5 rounded-xl animate-pulse' />
          <div className='h-6 w-48 bg-white/10 rounded animate-pulse' />
          <div className='h-3 w-32 bg-white/10 rounded animate-pulse' />
        </div>
      </div>
    </div>
  )
}

export default SearchClientSkeleton

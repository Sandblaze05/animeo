import React from 'react'

const AnimeHeroSkeleton = () => {
  return (
    <div className="relative w-full h-[60svh] md:h-[50svh] bg-transparent overflow-hidden">
      <div className="w-full h-full animate-pulse">
        {/* Background Placeholder */}
        <div className="w-full h-full bg-transparent"></div>

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />

        {/* Content Layout */}
        <div className="absolute inset-0 h-full flex items-end p-4 sm:p-8 md:p-12">
          <div className="w-full flex flex-col md:flex-row items-center md:items-end gap-6">

            {/* COVER IMAGE SKELETON - Only visible on desktop */}
            <div className="hidden md:block flex-shrink-0 w-56 -mb-4">
              <div className="relative aspect-[2/3] rounded-xl bg-neutral-700"></div>
            </div>

            {/* TEXT & ACTION CONTENT SKELETON */}
            <div className="flex w-full max-w-lg flex-col items-center md:items-start gap-4 text-center md:text-left">

              {/* Title Skeleton */}
              <div className="h-8 md:h-14 w-3/4 bg-neutral-700 rounded-lg"></div>

              {/* Genres Skeleton */}
              <div className="flex items-center gap-2">
                <div className="h-7 w-20 bg-neutral-700 rounded-full"></div>
                <div className="h-7 w-24 bg-neutral-700 rounded-full"></div>
                <div className="h-7 w-20 bg-neutral-700 rounded-full"></div>
                {/* Score skeleton - only on mobile */}
                <div className="md:hidden h-7 w-16 bg-neutral-700 rounded-full"></div>
              </div>

              {/* Description Skeleton */}
              <div className="hidden md:flex flex-col gap-2 w-full mt-1">
                <div className="h-4 w-full bg-neutral-700 rounded-md"></div>
                <div className="h-4 w-full bg-neutral-700 rounded-md"></div>
                <div className="h-4 w-5/6 bg-neutral-700 rounded-md"></div>
              </div>

              {/* Buttons Skeleton */}
              <div className="flex items-center gap-3 mt-2">
                <div className="h-11 w-36 bg-neutral-700 rounded-full"></div>
                <div className="h-11 w-40 bg-neutral-700 rounded-full"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AnimeHeroSkeleton
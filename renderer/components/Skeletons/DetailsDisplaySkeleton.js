import React from 'react';

// Reusable visual skeleton for DetailsDisplay while loading
export default function DetailsDisplaySkeleton() {
  return (
    <div className="min-h-screen bg-[#0b001f] text-white pb-24">
      <div className="relative w-full h-[45vh] md:h-[55vh] bg-[#0b001f]">
        <div className="w-full h-full bg-white/6 animate-pulse" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b001f] via-[#0b001f]/80 to-transparent" />
      </div>

      <div className="max-w-[1400px] mx-auto px-6 md:px-12 -mt-40 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14">
          <div className="lg:col-span-3 flex flex-col gap-6">
            <div className="w-56 md:w-full max-w-[300px] h-[420px] rounded-2xl bg-white/6 animate-pulse mx-auto lg:mx-0" />

            <div className="grid grid-cols-2 gap-3">
              <div className="h-16 bg-white/6 rounded-xl animate-pulse" />
              <div className="h-16 bg-white/6 rounded-xl animate-pulse" />
            </div>

            <div className="hidden md:block bg-white/6 rounded-xl p-5 text-sm space-y-3 animate-pulse h-40" />
          </div>

          <div className="lg:col-span-9 flex flex-col gap-10">
            <div className="h-12 w-3/4 bg-white/6 rounded animate-pulse" />
            <div className="h-6 w-1/3 bg-white/6 rounded animate-pulse" />
            <div className="h-24 bg-white/6 rounded animate-pulse" />

            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="h-6 w-32 bg-white/6 rounded animate-pulse" />
                <div className="h-4 w-12 bg-white/6 rounded animate-pulse" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="p-5 rounded-xl bg-white/6 animate-pulse h-36" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

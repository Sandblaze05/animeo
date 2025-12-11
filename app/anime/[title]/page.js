'use client'

import { useToast } from '@/providers/toast-provider';
import { Star } from 'lucide-react';
import { useParams } from 'next/navigation'
import React, { useState } from 'react'


const page = () => {
  const { title } = useParams();
  const { toast } = useToast();

  const [curPage, setCurPage] = useState(1);
  const [lastPage, setLastPage] = useState(null);
  const [listOfAnime, setListOfAnime] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=10&page=${curPage}`);
      if (!response.ok) {
        toast('Error fetching data', 'error');
        return;
      }
      const data = await response.json();
      setLastPage(data.pagination.last_visible_page);
      setListOfAnime(data.data);
    } catch (err) {
      toast(`${err.message}`, 'error');
      setListOfAnime([]);
    } finally {
      setIsLoading(false);
    }
  }


  return (
    <div className='mt-20 border-t-1 border-white/20 w-screen flex flex-col text-white'>
      <div className='w-screen h-20 flex items-center px-4'>
        <h2 className='text-xl font-bold text-white flex'>Search:&ensp;<span className='text-lg font-normal'>{title}</span></h2>
      </div>

      <div className='w-screen flex'>
        <div 
          className='flex flex-col items-center justify-start w-screen lg:w-[70%] 
          min-h-screen rounded-none border-r-0 lg:rounded-tr-xl border-t-1 
          lg:border-r-1 border-white/20'
        >

        </div>

        <div className='lg:flex flex-col lg:flex-1 hidden p-4 justify-start items-center gap-3'>
          <div className='relative border-1 border-white/20 rounded-xl aspect-auto h-60 w-[40%]'>
            <h1 className='absolute max-w-[70%] -bottom-4 left-1/2 -translate-x-1/2 text-lg text-center font-bold [text-shadow:0px_0px_15px_black] line-clamp-2'>
              Absurdly Big Title
            </h1>
          </div>

          <div className='flex gap-2 items-center justify-center text-xs text-white/40 mt-1'>
            <span className='flex items-center justify-around gap-1 font-bold'><Star className='text-white/40 fill-white/40 inline-block h-3 w-3' /> 7.9</span>
            |
            <span className='font-bold'>TV</span>
            |
            <span 
              className='rounded-md font-bold bg-white/40 text-black flex items-center justify-center px-1'
            >
                R-17+
            </span>
          </div>

        </div>
      </div>
    </div>
  )
}

export default page
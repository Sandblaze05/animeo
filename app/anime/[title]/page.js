'use client'

import { useToast } from '@/providers/toast-provider';
import { Star, PlusIcon, PlayIcon, Grid2X2Icon, ListIcon } from 'lucide-react';
import { useParams } from 'next/navigation';
import React, { useState } from 'react';
import { motion } from 'motion/react';


const page = () => {
  const { title } = useParams();
  const { toast } = useToast();

  const [curPage, setCurPage] = useState(1);
  const [lastPage, setLastPage] = useState(null);
  const [listOfAnime, setListOfAnime] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

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
        <h2 className='text-xl font-bold text-white flex'>Search:&ensp;<span className='text-lg font-normal'>{decodeURIComponent(title)}</span></h2>
      </div>

      <div className='w-screen flex'>
        <div
          className='relative flex flex-col items-center justify-start w-screen lg:w-[70%] 
          min-h-screen rounded-none border-r-0 lg:rounded-tr-xl border-t-1 
          lg:border-r-1 border-white/20'
        >
          <div className='flex items-center justify-between px-3 py-1 absolute top-0 left-0 w-full h-10 rounded-none lg:rounded-tr-xl border-b-1 border-white/20 backdrop-blur-lg'>
            <span className='text-xs'>
              {42}&ensp;Results
            </span>

            <div className='relative flex p-1 rounded-md items-center justify-center border-1 border-white/20 gap-2'>
              <Grid2X2Icon className='h-5 w-5 text-gray-400' />
              <div className='absolute top-1/2 left-1/2 -translate-1/2 h-full w-[1px] bg-white/20' />
              <ListIcon className='h-5 w-5 text-gray-400' />
            </div>
          </div>
        </div>

        <div className='lg:flex flex-col lg:flex-1 hidden p-4 justify-start items-center gap-3'>
          <div className='relative border-1 border-white/20 rounded-xl aspect-[9/16] h-60 w-40'>
            <h1 className='absolute max-w-[97%] -bottom-4 left-1/2 -translate-x-1/2 text-lg text-center font-bold [text-shadow:0px_0px_15px_black] line-clamp-2'>
              Absurdly Long Title
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
              className="flex items-center gap-2 px-5 py-2.5 bg-white/10 rounded-full font-semibold backdrop-blur-sm hover:bg-white/20 transition-colors"
            >
              <motion.div variants={iconVariants} className="overflow-hidden">
                <PlayIcon className="w-5 h-5" />
              </motion.div>
              <span>Watch</span>
            </motion.button>
          </div>

          <div className='text-sm tracking-wide leading-6 px-3 mt-5'>
            Lorem ipsum dolor sit amet consectetur adipisicing elit.
            Odit commodi tempore sint excepturi nobis corrupti similique unde corporis quidem,
            velit quibusdam minima, impedit quia nemo eum non nulla ex qui?
            Lorem ipsum dolor sit amet consectetur adipisicing elit.
            Ullam eum, dolorum at, reiciendis facilis vero eligendi eaque tempora perferendis
            harum exercitationem voluptate iusto expedita a reprehenderit architecto. Consectetur, harum odio.
          </div>

          {/* <div className='flex items-center gap-1 justify-center mt-5'>
            <span className='text-xs rounded-full bg-red-500/50 px-2 py-1 flex items-center justify-center'>Fantasy</span>
            <span className='text-xs rounded-full bg-violet-500/50 px-2 py-1 flex items-center justify-center'>Isekai</span>
            <span className='text-xs rounded-full bg-green-500/50 px-2 py-1 flex items-center justify-center'>Psychological</span>
            <span className='text-xs text-black py-1 px-2 font-bold bg-white/40 rounded-full'>+2</span>
          </div> */}

        </div>
      </div>
    </div>
  )
}

export default page
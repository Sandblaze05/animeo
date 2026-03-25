'use client'

import React, { useState } from 'react'
import { motion } from 'motion/react'
import { PlayIcon, PlusIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/providers/toast-provider'
import { addAnimeToDefaultList } from '@/app/actions'

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2
    }
  },
  exit: {
    transition: {
      staggerChildren: 0.1,
      staggerDirection: -1
    }
  }
}

const itemVariants = {
  hidden: (isOnLeft) => ({ x: isOnLeft ? '50%' : '-50%', opacity: 0 }),
  visible: { x: 0, opacity: 1 },
  exit: (isOnLeft) => ({ x: isOnLeft ? '50%' : '-50%', opacity: 0 })
}

const SeasonFlyCard = ({ anime, color, isOnLeft = false }) => {
  const router = useRouter();
  const { toast } = useToast();
  const [addingToList, setAddingToList] = useState(false);

  const handleAddToList = async (animeData) => {
    if (addingToList) return;
    setAddingToList(true);
    try {
      const profileId = typeof window !== 'undefined' ? localStorage.getItem('profileId') : null;
      await addAnimeToDefaultList(animeData, profileId || undefined);
      toast('Added to your list!', 'success');
    } catch (error) {
      toast(error?.message || 'Unable to add to list', 'error');
    } finally {
      setAddingToList(false);
    }
  };
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className='flex flex-col'
    >
      <motion.div
        custom={isOnLeft}
        variants={itemVariants}
        transition={{ duration: 0.3, ease: 'anticipate' }}
        style={{ border: `1px solid ${color}`, boxShadow: isOnLeft ? `-6px 6px 0px ${color}` : `6px 6px 0px ${color}` }}
        className='h-23 w-57 px-4 py-2 overflow-clip bg-[#0b001f] flex flex-col items-start justify-center'
      >
        <h1
          style={{
            WebkitTextStroke: `1px ${color}`,
            textShadow: `-1px -1px 0px ${color}`,
          }}
          className='text-2xl font-extrabold text-ellipsis text-transparent line-clamp-2'
        >
          {anime.title}
        </h1>

      </motion.div>
      <motion.div
        custom={isOnLeft}
        variants={itemVariants}
        transition={{ duration: 0.3, ease: 'anticipate' }}
        className='w-57 h-13 relative flex items-center gap-1'
      >
        {/* Useless info */}
        <span
          style={{ border: `1px solid ${color}`, boxShadow: isOnLeft ? `-6px 6px 0px ${color}` : `6px 6px 0px ${color}` }}
          className='h-full w-29 px-4 py-2 overflow-clip bg-[#0b001f] flex items-center justify-center text-xs'
        >
          {anime.type} • {(anime.length !== 0) ? anime.season?.charAt(0).toUpperCase() + anime.season?.slice(1) : null} {anime.year}
        </span>

        {/* Play */}
        <div className='relative h-13 w-13'>
          <motion.div
            whileTap={{ x: 4, y: 4 }}
            style={{ border: `1px solid ${color}` }}
            onClick={() => router.push(`/anime/${encodeURIComponent(anime.title)}/${anime.id}`)}
            className='relative h-full w-full bg-[#0b001f] flex items-center justify-center text-xs z-20'
          >
            <PlayIcon size={20} stroke={color} />
          </motion.div>
          <div style={{ backgroundColor: `${color}`, translate: isOnLeft ? '-6px 6px' : '6px 6px' }} className='absolute inset-0 -z-10' />
        </div>

        {/* Add to list */}
        <div className='relative h-13 w-13'>
          <motion.div
            whileTap={{ x: 4, y: 4 }}
            style={{ border: `1px solid ${color}` }}
            onClick={() => handleAddToList(anime)}
            className={`relative h-full w-full bg-[#0b001f] flex items-center justify-center text-xs z-20 ${addingToList ? 'opacity-60 pointer-events-none' : ''}`}
          >
            <PlusIcon size={20} fill={color} stroke={color} />
          </motion.div>
          <div style={{ backgroundColor: `${color}`, translate: isOnLeft ? '-6px 6px' : '6px 6px' }} className='absolute inset-0 -z-10' />
        </div>
      </motion.div>
    </motion.div>
  )
}

export default SeasonFlyCard
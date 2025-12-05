'use client'

import React from 'react'
import { motion } from 'motion/react'

const SeasonFlyCard = ({ anime, color }) => {
  return (
    <motion.div
      initial={{ x: '-50%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '-50%', opacity: 0 }}
      transition={{ duration: 0.3, ease: 'anticipate', delay: 0.2 }}
      style={{ border: `1px solid ${color}`, boxShadow: `6px 6px 0px ${color}` }}
      className='h-23 w-57 px-4 py-2 overflow-clip bg-[#0b001f]'
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
  )
}

export default SeasonFlyCard
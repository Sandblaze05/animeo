'use client'

import { useParams } from 'next/navigation'
import React from 'react'


const page = () => {
  const { title } = useParams();

  return (
    <div className='text-2xl text-white'>{title}</div>
  )
}

export default page
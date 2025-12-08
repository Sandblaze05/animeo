import React from 'react'

const SearchBox = ({ onClose = () => { } }) => {
  return (
    <div 
      className='z-9999 w-30 h-30 bg-black/20 fixed 
      left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 
      border-1 border-white rounded-md'
    >
      SearchBox
    </div>
  )
}

export default SearchBox
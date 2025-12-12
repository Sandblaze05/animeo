import SearchClient from '@/components/SearchClient';
import React from 'react';

const page = async ({ params }) => {
  const { title } = await  params;
  
  let listOfAnime = [];
  let pagination = {};

  try {
    const response = await fetch(`https://api.jikan.moe/v4/anime?q=${title}&limit=20&page=1`, {
        next: { revalidate: 300 }
    });
    if (response.ok) {
      const data = await response.json();
      listOfAnime = data.data;
      pagination = data.pagination;
    }
  } catch (err) {
    console.error("Error fetching anime:", err);
  }

  return (
    <SearchClient title={title} initialData={listOfAnime} initialPagination={pagination} />
  )
}

export default page
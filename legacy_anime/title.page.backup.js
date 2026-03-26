import SearchData from './SearchData';
import React, { Suspense } from 'react';
import SearchClientSkeleton from '@/components/Skeletons/SearchClientSkeleton';

const page = async ({ params }) => {
  const { title } = await  params;
  return (
    <Suspense fallback={<SearchClientSkeleton/>}>
      <SearchData title={title}  />
    </Suspense>
  )
}

export default page

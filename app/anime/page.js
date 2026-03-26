"use client"; 

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

import SearchData from './SearchData';
import DetailsDisplay from '@/components/DetailsDisplay';
import SearchClientSkeleton from '@/components/Skeletons/SearchClientSkeleton';

function PageContent() {
  const searchParams = useSearchParams();
  
  const title = searchParams.get('title');
  const id = searchParams.get('id');

  if (id) {
    return <DetailsDisplay initialTitle={title} initialId={id} />;
  }

  return <SearchData title={title} />;
}

const Page = () => {
  return (
    // Next.js REQUIRES a Suspense boundary when using useSearchParams in a static export
    <Suspense fallback={<SearchClientSkeleton />}>
      <PageContent />
    </Suspense>
  );
};

export default Page;
import React from 'react';
import { useRouter } from 'next/router';

import SearchData from '../components/SearchData'; // Adjust import path if needed
import DetailsDisplay from '../components/DetailsDisplay';
import SearchClientSkeleton from '../components/Skeletons/SearchClientSkeleton';

const AnimePage = () => {
  const router = useRouter();

  // In the Pages Router, query parameters are empty on the first render
  // during hydration. We use `router.isReady` to show the skeleton!
  if (!router.isReady) {
    return <SearchClientSkeleton />;
  }

  // Extract query parameters directly from the router
  const { title, id } = router.query;

  if (id) {
    return <DetailsDisplay initialTitle={title} initialId={id} />;
  }

  return <SearchData title={title} />;
};

export default AnimePage;
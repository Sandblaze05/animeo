import React, { Suspense } from 'react'
import DetailsDisplay from '@/components/DetailsDisplay';

const page = async ({ params }) => {
  const { title, id } = await params;

  return (
    <Suspense fallback={<>Loading...</>}>
      <DetailsDisplay initialTitle={title} initialId={id} />
    </Suspense>
  )
}

export default page

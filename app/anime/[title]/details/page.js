import React, { Suspense } from 'react'
import Details from './Details';

const page = async ({ params }) => {
  const { title } = await params;

  return (
    <Suspense fallback={<>Loading...</>}>
      <Details title={title} />
    </Suspense>
  )
}

export default page
import React, { Suspense } from 'react'
import Details from './Details';

const page = async ({ params }) => {
  const { title, id } = await params;

  return (
    <Suspense fallback={<>Loading...</>}>
      <Details title={title} id={id} />
    </Suspense>
  )
}

export default page
import React, { Suspense } from 'react'
import WatchPage from './WatchPage';

const page = async ({ params }) => {

  const { title, id } = await params;

  return (
    <Suspense fallback={<></>}>
      <WatchPage title={title} id={id} />
    </Suspense>
  )
}

export default page
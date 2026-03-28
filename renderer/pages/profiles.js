import { useEffect } from 'react'
import { useRouter } from 'next/router' 
import ProfileSelector from '../components/ProfileSelector'

export default function ProfilesPage() {
  const router = useRouter();

  useEffect(() => {
    try {
      const profileId = localStorage.getItem('profileId');
      if (profileId) {
        router.replace('/');
      }
    } catch {
      // Ignore localStorage access issues in non-browser contexts.
    }
  }, [router]);

  const handleSelect = () => {
    router.replace('/');
  };

  return <ProfileSelector onSelect={handleSelect} />;
}
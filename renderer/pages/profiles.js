import { useRouter } from 'next/router'
import ProfileSelector from '../components/ProfileSelector'

export default function ProfilesPage() {
  const router = useRouter();

  const handleSelect = () => {
    router.replace('/');
  };

  return <ProfileSelector onSelect={handleSelect} />;
}
'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Header from '@/components/Header'
import MobileNav from '@/components/MobileNav'
import { ToastProvider } from '@/providers/toast-provider'

export default function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();

  const [isHydrated, setIsHydrated] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);

  useEffect(() => {
    setIsHydrated(true);

    try {
      const profileId = localStorage.getItem('profileId');
      setHasProfile(Boolean(profileId));
    } catch {
      setHasProfile(false);
    }
  }, [pathname]);

  const isProfileRoute = pathname === '/profiles';

  useEffect(() => {
    if (!isHydrated) return;

    if (!isProfileRoute && !hasProfile) {
      router.replace('/profiles');
    }
  }, [hasProfile, isHydrated, isProfileRoute, router]);

  const showNavigation = !isProfileRoute && hasProfile;
  const shouldBlockContent = isHydrated && !isProfileRoute && !hasProfile;

  return (
    <ToastProvider>
      {showNavigation && <Header />}
      {!shouldBlockContent && children}
      {showNavigation && <MobileNav />}
    </ToastProvider>
  );
}

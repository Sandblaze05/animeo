'use client'

import { Clapperboard, Flame, Home, Tv } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useLayoutEffect, useRef } from "react"
import gsap from "gsap"

const navItems = [
  { name: 'Home', href: '/', icon: Home },
  { name: 'Movies', href: '/movies', icon: Clapperboard },
  { name: 'TV', href: '/tv', icon: Tv },
  { name: 'Top', href: '/top', icon: Flame },
]

const MobileNav = () => {
  const pathname = usePathname();
  const navRef = useRef(null);
  const selectedPillRef = useRef(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const activePill = selectedPillRef.current;
    if (!nav || !activePill) return;

    const targetLink = nav.querySelector(`a[href='${pathname}']`);
    
    if (targetLink) {
      gsap.to(activePill, {
        x: targetLink.offsetLeft,
        width: targetLink.offsetWidth,
        opacity: 1,
        duration: 0.4,
        ease: 'power2.inOut'
      });
    }

  }, [pathname]);

  return (
    <footer
      ref={navRef}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[90vw] h-16 border-[1px] border-white/20 bg-black/30 backdrop-blur-lg flex sm:hidden justify-around items-center rounded-2xl shadow-2xl p-1 z-[9999]"
    >
      <div
        ref={selectedPillRef}
        className="absolute left-0 h-[calc(100%-0.5rem)] bg-white/20 rounded-xl opacity-0 -z-10"
      ></div>

      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.name}
            href={item.href}
            className="flex-1 h-full flex justify-center items-center"
          >
            <item.icon className={`h-6 w-6 transition-colors ${isActive ? 'text-white' : 'text-gray-400'}`} />
          </Link>
        )
      })}
    </footer>
  )
}

export default MobileNav
'use client'

import gsap from "gsap"
import { SearchIcon } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

const Header = () => {
  const headerRef = useRef(null);
  const activePillRef = useRef(null);
  const selectedPillRef = useRef(null);
  const previousLinkRef = useRef(null);
  const [selected, setSelected] = useState('Home');
  const pathname = usePathname();

  // This effect handles the selection animation
  useLayoutEffect(() => {
    const selectedPill = selectedPillRef.current;
    if (!selectedPill) return;

    let selected;
    switch (pathname) {
      case '/movies':
        selected = 'Movies';
        break;
      case '/tv':
        selected = 'TV';
        break;
      case '/news':
        selected = 'News';
        break;
      default:
        selected = 'Home';
    }

    const navLinks = gsap.utils.toArray(".nav-link");
    const targetLink = navLinks.find(link => link.textContent === selected);

    if (previousLinkRef.current) {
      gsap.to(previousLinkRef.current, {
        backgroundColor: "transparent",
        color: "#E5E7EB",
        duration: 0.3,
        ease: "power2.inOut"
      });
    }

    if (targetLink) {
      const tl = gsap.timeline();

      tl.to(selectedPill, {
        x: targetLink.offsetLeft,
        width: targetLink.offsetWidth,
        opacity: 1,
        ease: "power2.inOut",
        duration: 0.4
      });

      tl.to(selectedPill, {
        opacity: 0,
        duration: 0.3,
        ease: "power2.inOut"
      }, "-=0.2"); // Overlap with the end of the previous animation

      tl.to(targetLink, {
        backgroundColor: "#FFFFFF",
        color: "#000000",
        duration: 0.3,
        ease: "power2.inOut"
      }, "<");

      previousLinkRef.current = targetLink;
    }

  }, [pathname]);

  useEffect(() => {
    const header = headerRef.current;
    const activePill = activePillRef.current;
    if (!header || !activePill) return;

    const navLinks = gsap.utils.toArray(".nav-link");

    const headerTimeline = gsap.timeline({ paused: true });
    headerTimeline.to(header, {
      width: "517px",
      ease: "power2.inOut",
      duration: 0.4
    })
      .to('.search', {
        scale: 1.2,
        ease: 'power2.inOut',
        duration: 0.4
      }, '<');

    const playAnimation = () => headerTimeline.play();
    const reverseAnimation = () => headerTimeline.reverse();
    header.addEventListener("mouseenter", playAnimation);
    header.addEventListener("mouseleave", reverseAnimation);

    navLinks.forEach((link) => {
      link.addEventListener("mouseenter", () => {
        gsap.to(activePill, {
          x: link.offsetLeft,
          width: link.offsetWidth,
          opacity: 1,
          ease: "power2.inOut",
          duration: 0.4
        });
      });
    });

    const hidePill = () => {
      gsap.to(activePill, {
        opacity: 0,
        ease: "power2.inOut",
        duration: 0.3
      });
    };
    header.addEventListener("mouseleave", hidePill);

    return () => {
      header.removeEventListener("mouseenter", playAnimation);
      header.removeEventListener("mouseleave", reverseAnimation);
      header.removeEventListener("mouseleave", hidePill);
      headerTimeline.kill();
    }
  }, []);

  return (
    <header
      ref={headerRef}
      className="fixed top-5 left-1/2 -translate-x-1/2 overflow-hidden hidden w-[456px] h-10 border-[1px] border-white/20 backdrop-blur-lg bg-black/20 sm:flex justify-between gap-3 items-center rounded-full shadow-2xl p-1 font-semibold z-[9999]"
    >

      <div ref={activePillRef} className="absolute left-0 h-[calc(100%-0.5rem)] w-0 bg-white/40 rounded-full opacity-0 -z-10"></div>
      <div ref={selectedPillRef} className="absolute left-0 h-[calc(100%-0.5rem)] w-0 bg-white/90 rounded-full opacity-0 -z-10"></div>

      <Link className="nav-link flex-1 text-center font-poppins text-sm px-5 py-1 rounded-full text-gray-200 cursor-pointer" href='/'>Home</Link>
      <Link className="nav-link flex-1 text-center font-poppins text-sm px-5 py-1 rounded-full text-gray-200 cursor-pointer" href='/movies'>Movies</Link>

      <div className="opacity-0 flex justify-center items-center text-white rounded-2xl px-3 py-1 flex-1"></div>
      <div className="search absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex justify-center items-center text-white rounded-2xl px-3 py-1 flex-1"><SearchIcon /></div>

      <Link className="nav-link flex-1 text-center font-poppins text-sm px-5 py-1 rounded-full text-gray-200 cursor-pointer" href='/tv'>TV</Link>
      <Link className="nav-link flex-1 text-center font-poppins text-sm px-5 py-1 rounded-full text-gray-200 cursor-pointer" href='/news'>News</Link>
    </header>
  )
}

export default Header
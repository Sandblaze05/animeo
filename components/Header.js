'use client'

import gsap from "gsap"
import { SearchIcon, User2Icon } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { motion } from 'motion/react'
import Link from "next/link"
import { usePathname } from "next/navigation"
import SearchBox from "./SearchBox"
import { createClient } from "@/utils/supabase/client"
import { useToast } from "@/providers/toast-provider"

const Header = () => {
  const headerRef = useRef(null);
  const activePillRef = useRef(null);
  const selectedPillRef = useRef(null);
  const previousLinkRef = useRef(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showAuthForm, setShowAuthForm] = useState(false);
  const pathname = usePathname();

  // Auth states
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(true);

  // Check auth state on mount
  useEffect(() => {
    const supabase = createClient();

    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    };
    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();

    try {
      if (isLoginMode) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast("Logged in successfully", "success");
        setIsProfileOpen(false);
        setShowAuthForm(false);
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        toast("Check your email for confirmation link", "success");
        setIsProfileOpen(false);
        setShowAuthForm(false);
      }
    } catch (error) {
      toast(error.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast("Logged out successfully", "success");
    setIsProfileOpen(false);
  };

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
    let currentLink = null;

    const headerTimeline = gsap.timeline({
      paused: true,
      onUpdate: () => {
        if (currentLink) {
          gsap.set(activePill, {
            x: currentLink.offsetLeft,
            width: currentLink.offsetWidth
          });
        }
      }
    });
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

    let isCtrlPressed = false;
    let ctrlTween = null;

    const handleKeyDown = (e) => {
      if (isSearchOpen) return;

      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        console.log('open search');
        setIsSearchOpen(prev => !prev);
        return;
      }

      if (e.key === 'Control') {
        e.preventDefault();
        if (isCtrlPressed) return;
        isCtrlPressed = true;

        ctrlTween = gsap.to(header, {
          y: -3,
          duration: 0.3,
          delay: 0.5,
          ease: "expo.out",
          scale: 0.9,
          overwrite: "auto"
        });
      }
    };

    const handleKeyUp = (e) => {
      if (isSearchOpen) return;

      if (e.key === 'Control') {
        e.preventDefault();
        isCtrlPressed = false;

        const currentScale = gsap.getProperty(header, "scale");

        if (currentScale < 1) {
          gsap.to(header, {
            y: 0,
            scale: 1,
            duration: 0.5,
            ease: "elastic.out(1, 0.3)",
            overwrite: "auto"
          });
        } else {
          if (ctrlTween) {
            ctrlTween.kill();
            ctrlTween = null;
          }
        }
      }
    };

    const playAnimation = () => headerTimeline.play();
    const reverseAnimation = () => headerTimeline.reverse();
    header.addEventListener("mouseenter", playAnimation);
    header.addEventListener("mouseleave", reverseAnimation);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    navLinks.forEach((link) => {
      link.addEventListener("mouseenter", () => {
        currentLink = link;
        if (headerTimeline.isActive()) {
          gsap.killTweensOf(activePill, { x: true, width: true });
          gsap.to(activePill, {
            opacity: 1,
            ease: "power2.inOut",
            duration: 0.4,
          });
        } else {
          gsap.to(activePill, {
            x: link.offsetLeft,
            width: link.offsetWidth,
            opacity: 1,
            ease: "power2.inOut",
            duration: 0.4,
          });
        }
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
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      header.removeEventListener("mouseenter", playAnimation);
      header.removeEventListener("mouseleave", reverseAnimation);
      header.removeEventListener("mouseleave", hidePill);
      headerTimeline.kill();
    }
  }, []);

  return (
    <div className="w-screen z-9000 hidden sm:flex">
      <motion.div
        whileTap={{ scaleX: 0.95, scaleY: 0.9 }}
        aria-label="menu"
        className="fixed left-7 top-5 p-2 h-12 w-12 flex items-center justify-center 
        rounded-full bg-black/20 border-white/20 border-1 shadow-2xl backdrop-blur-lg"
      >
        <svg width="30px" height="30px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 18H10" stroke="#FFF" strokeWidth="2" strokeLinecap="round" />
          <path d="M4 12L16 12" stroke="#FFF" strokeWidth="2" strokeLinecap="round" />
          <path d="M4 6L20 6" stroke="#FFF" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </motion.div>

      <div className="fixed right-7 top-5 z-50">
        <motion.div
          onClick={() => setIsProfileOpen(prev => !prev)}
          whileTap={{ scaleX: 0.95, scaleY: 0.9 }}
          aria-label="profile"
          className="h-12 w-12 flex items-center justify-center 
          rounded-full bg-black/20 border-white/20 border-1 
          shadow-2xl backdrop-blur-lg cursor-pointer"
        >
          <User2Icon className="text-white fill-white" />
        </motion.div>
        {isProfileOpen && (
          <div
            className="absolute transition-all flex flex-col gap-5 justify-center items-center p-4 top-full mt-2 right-0 w-[clamp(16rem,20svw,24rem)] rounded-xl bg-black/20 backdrop-blur-xl border border-white/20 shadow-2xl"
          >
            {user ? (
              <div className="flex flex-col gap-2 text-white px-4 py-3 w-full items-center">
                <span className="text-white text-xs truncate max-w-full">{user.email}</span>
                <motion.button
                  onClick={handleSignOut}
                  whileTap={{ scale: 0.97, y: 1 }}
                  className="w-[90%] h-7 mx-auto mt-3 text-white text-xs text-nowrap flex items-center justify-center px-4 py-2 rounded-full bg-pink-600"
                >
                  Sign Out
                </motion.button>
              </div>
            ) : showAuthForm ? (
              <div className="flex flex-col gap-2 text-white px-4 py-3 w-full">
                <form onSubmit={handleAuth} className="flex flex-col gap-2">
                  <input
                    type="email"
                    name="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@gmail.com"
                    title="email"
                    className="ring-0 outline-1 outline-white/20 rounded-md px-2 py-1 text-sm focus:ring-0 bg-transparent placeholder:text-white/50"
                    required
                  />
                  <input
                    type="password"
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="password"
                    title="password"
                    className="ring-0 outline-1 mt-1 outline-white/20 rounded-md px-2 py-1 text-sm focus:ring-0 bg-transparent placeholder:text-white/50"
                    required
                  />
                  <motion.button
                    disabled={loading}
                    whileTap={{ scale: 0.97, y: 1 }}
                    className="w-[90%] h-7 mx-auto mt-3 text-white text-xs text-nowrap flex items-center justify-center px-4 py-2 rounded-full bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? "Loading..." : (isLoginMode ? "Login" : "Register")}
                  </motion.button>
                </form>
                <button
                  onClick={() => setIsLoginMode(!isLoginMode)}
                  className="text-[10px] text-gray-300 hover:text-white mt-2 text-center w-full underline decoration-dotted"
                >
                  {isLoginMode ? "Need an account? Register" : "Have an account? Login"}
                </button>
              </div>
            ) : (
              <>
                <span className="text-white text-xs">{":( Not logged in"}</span>
                <motion.button
                  onClick={() => setShowAuthForm(true)}
                  whileTap={{ scale: 0.97, y: 1 }}
                  className="w-[90%] h-7 text-white text-xs text-nowrap flex items-center justify-center px-4 py-2 rounded-full bg-pink-600"
                >
                  Login / Register
                </motion.button>
              </>
            )}
          </div>
        )}
      </div>

      <header
        ref={headerRef}
        className="fixed top-5 left-1/2 -translate-x-1/2 overflow-hidden hidden w-[456px] h-10 border-[1px] border-white/20 backdrop-blur-lg bg-black/20 sm:flex justify-between gap-3 items-center rounded-full shadow-2xl p-1 font-semibold z-[9999]"
      >

        <div ref={activePillRef} className="absolute left-0 h-[calc(100%-0.5rem)] w-0 bg-white/40 rounded-full opacity-0 -z-10"></div>
        <div ref={selectedPillRef} className="absolute left-0 h-[calc(100%-0.5rem)] w-0 bg-white/90 rounded-full opacity-0 -z-10"></div>

        <Link className="nav-link flex-1 text-center font-poppins text-sm px-5 py-1 rounded-full text-gray-200 cursor-pointer" href='/'>Home</Link>
        <Link className="nav-link flex-1 text-center font-poppins text-sm px-5 py-1 rounded-full text-gray-200 cursor-pointer" href='/movies'>Movies</Link>

        <div className="opacity-0 flex justify-center items-center text-white rounded-2xl px-3 py-1 flex-1"></div>
        <div onClick={() => setIsSearchOpen(prev => !prev)} className="search absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex justify-center items-center text-white rounded-2xl px-3 py-1 flex-1"><SearchIcon /></div>

        <Link className="nav-link flex-1 text-center font-poppins text-sm px-5 py-1 rounded-full text-gray-200 cursor-pointer" href='/tv'>TV</Link>
        <Link className="nav-link flex-1 text-center font-poppins text-sm px-5 py-1 rounded-full text-gray-200 cursor-pointer" href='/news'>News</Link>
      </header>

      {isSearchOpen && (
        <SearchBox onClose={() => setIsSearchOpen(false)} />
      )}
    </div>
  )
}

export default Header
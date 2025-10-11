'use client'

import { useEffect, useState } from "react"
import AnimeHero from "@/components/AnimeHero";
import AnimeHeroSkeleton from "@/components/Skeletons/AnimeHeroSkeleton";
import { AnimatePresence, motion } from "motion/react";
import { useToast } from "@/providers/toast-provider";

export default function Home() {
  const { toast } = useToast();

  const [animeData, setAnimeData] = useState([]);
  const [heroLoading, setHeroLoading] = useState(true);

  useEffect(() => {
    const getHeroItems = async () => {
      setHeroLoading(true);
      try {
        const res = await fetch('/api/hero-items');
        const data = await res.json();
        console.log(data);
        setAnimeData(data);
        setHeroLoading(false);
      }
      catch (err) {
        console.error(err);
      }
    }
    getHeroItems();
  }, []);

  return (
    <div className="relative w-screen min-h-screen flex flex-col z-0">
      <AnimatePresence mode="wait">
        {heroLoading ? (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <AnimeHeroSkeleton />
          </motion.div>
        ) : (
          <motion.div
            key="hero"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <AnimeHero animeList={animeData} />
          </motion.div>
        )}
      </AnimatePresence>
      <section className="min-h-screen mt-10"></section>
    </div>
  )
}
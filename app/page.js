'use client'

import { useEffect, useState } from "react"
import AnimeHero from "@/components/AnimeHero";
import AnimeHeroSkeleton from "@/components/Skeletons/AnimeHeroSkeleton";
import { AnimatePresence, motion } from "motion/react";
import { useToast } from "@/providers/toast-provider";
import TopAnime from "@/components/TopAnime";
import CurrentSeason from "@/components/CurrentSeason";
import CurrentSeasonSkeleton from "@/components/Skeletons/CurrentSeasonSkeleton";
import { getHeroItems, getAllAnimeData } from './actions';

export default function Home() {
  const { toast } = useToast();

  const [animeData, setAnimeData] = useState([]);
  const [allAnimeData, setAllAnimeData] = useState({});
  const [heroLoading, setHeroLoading] = useState(true);

  useEffect(() => {
    const getHeroItemsLocal = async () => {
      setHeroLoading(true);
      try {
        const data = await getHeroItems();
        setAnimeData(data);
      }
      catch (err) {
        toast(`An error occured: ${err}`, "error");
      }
      finally { setHeroLoading(false); }
    }

    const getAllData = async () => {
      try {
        const data = await getAllAnimeData();
        setAllAnimeData(data);
        console.log("All data: ", data);
      }
      catch (err) {
        toast(`An error occured: ${err}`, 'error');
      }
    }

    getHeroItemsLocal();
    getAllData();
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
      <section className="min-h-screen w-screen p-4 text-white">
        <AnimatePresence mode="wait">
          {
            allAnimeData.topAiring === undefined
              ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <CurrentSeasonSkeleton />
                </motion.div>
              )
              : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                >
                  <CurrentSeason currentSeason={allAnimeData.currentSeason} />
                </motion.div>
              )
          }
        </AnimatePresence>
      </section>
    </div>
  )
}
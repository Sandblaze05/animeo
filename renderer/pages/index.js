import { useEffect, useState } from "react"
import AnimeHero from "../components/AnimeHero";
import AnimeHeroSkeleton from "../components/Skeletons/AnimeHeroSkeleton";
import { AnimatePresence, motion } from "motion/react";
import { useToast } from "../providers/toast-provider";
import CurrentSeason from "../components/CurrentSeason";
import CurrentSeasonSkeleton from "../components/Skeletons/CurrentSeasonSkeleton";

export default function Home() {
  const { toast } = useToast();

  const [animeData, setAnimeData] = useState([]);
  const [allAnimeData, setAllAnimeData] = useState({});
  const [heroLoading, setHeroLoading] = useState(true);

  useEffect(() => {
    // 1. Fetch Hero Items via Electron IPC Bridge
    const getHeroItemsLocal = async () => {
      setHeroLoading(true);
      try {
        // Replaced server action with Electron preload bridge
        const data = await window.animeo.api.heroItems();
        setAnimeData(data);
      } catch (err) {
        toast(`An error occurred: ${err.message || err}`, "error");
      } finally {
        setHeroLoading(false);
      }
    };

    // 2. Fetch All Anime Data via Electron IPC Bridge
    const getAllData = async () => {
      try {
        // Replaced server action with Electron preload bridge
        const data = await window.animeo.api.allAnimeData();
        setAllAnimeData(data);
        console.log("All data: ", data);
      } catch (err) {
        toast(`An error occurred: ${err.message || err}`, 'error');
      }
    };

    // Ensure we are in the Electron environment before calling
    if (typeof window !== 'undefined' && window.animeo) {
      getHeroItemsLocal();
      getAllData();
    } else {
      console.warn("Electron IPC bridge not found! Are you running outside of Electron?");
    }
  }, [toast]);

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
          {allAnimeData.topAiring === undefined ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <CurrentSeasonSkeleton />
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <CurrentSeason currentSeason={allAnimeData.currentSeason} />
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  )
}
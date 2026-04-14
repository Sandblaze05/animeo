import { useEffect, useState } from "react"
import AnimeHero from "../components/AnimeHero";
import AnimeHeroSkeleton from "../components/Skeletons/AnimeHeroSkeleton";
import { AnimatePresence, motion } from "motion/react";
import { useToast } from "../providers/toast-provider";
import AnimeSection from "../components/AnimeSection";
import AnimeSectionSkeleton from "../components/Skeletons/AnimeSectionSkeleton";

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

  const sections = [
    { title: "Current Airing", data: allAnimeData.currentSeason, color: "#f6339a" },
    { title: "Action", data: allAnimeData.action, color: "#ff6b35" },
    { title: "Romance", data: allAnimeData.romance, color: "#ff93db" },
    { title: "Adventure", data: allAnimeData.adventure, color: "#4ecdc4" },
    { title: "Fantasy", data: allAnimeData.fantasy, color: "#a06cd5" },
  ];

  const isLoading = allAnimeData.topAiring === undefined;

  return (
    <div className="relative w-screen min-h-screen flex flex-col z-0 overflow-x-hidden">
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
          {isLoading ? (
            <motion.div
              key="skeletons"
              className="flex flex-col gap-5 md:gap-10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {sections.map((section, idx) => (
                <AnimeSectionSkeleton key={idx} title={section.title} sectionColor={section.color} />
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="content"
              className="flex flex-col gap-5 md:gap-10 mb-10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              {sections.map((section, idx) => (
                <AnimeSection key={idx} title={section.title} animeList={section.data} sectionColor={section.color} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  )
}
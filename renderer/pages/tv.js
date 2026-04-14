import { useEffect, useState } from "react"
import MovieHero from "../components/MovieHero";
import AnimeHeroSkeleton from "../components/Skeletons/AnimeHeroSkeleton";
import { AnimatePresence, motion } from "motion/react";
import { useToast } from "../providers/toast-provider";
import { getTV } from '../utils/actions';
import AnimeSection from "../components/AnimeSection";
import AnimeSectionSkeleton from "../components/Skeletons/AnimeSectionSkeleton";

export default function TVPage() {
  const { toast } = useToast();

  const [allTvData, setAllTvData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getTvItems = async () => {
      setLoading(true);
      try {
        const data = await getTV();
        setAllTvData(data);
      }
      catch (err) {
        toast(`An error occurred: ${err.message || err}`, "error");
      }
      finally { setLoading(false); }
    }

    if (typeof window !== 'undefined' && window.animeo) {
      getTvItems();
    }
  }, [toast]);

  const sections = [
    { title: "New Releases", data: allTvData.trending, color: "#a06cd5" },
    { title: "Action Series", data: allTvData.action, color: "#ff6b35" },
    { title: "Romance Series", data: allTvData.romance, color: "#ff93db" },
    { title: "Adventure Series", data: allTvData.adventure, color: "#4ecdc4" },
    { title: "Fantasy Series", data: allTvData.fantasy, color: "#96ff93" },
    { title: "Sci-Fi Series", data: allTvData.scifi, color: "#93e8ff" },
    { title: "Drama Series", data: allTvData.drama, color: "#fff893" },
  ];

  return (
    <div className="relative w-screen min-h-screen flex flex-col z-0 overflow-x-hidden">
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="skeleton-hero"
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
            <MovieHero movieList={allTvData.hero} />
          </motion.div>
        )}
      </AnimatePresence>

      <section className="min-h-screen w-screen p-4 text-white">
        <AnimatePresence mode="wait">
          {loading ? (
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
import { useEffect, useState } from "react"
import MovieHero from "../components/MovieHero";
import AnimeHeroSkeleton from "../components/Skeletons/AnimeHeroSkeleton";
import { AnimatePresence, motion } from "motion/react";
import { useToast } from "../providers/toast-provider";
import { getHentai } from '../utils/actions';
import AnimeSection from "../components/AnimeSection";
import AnimeSectionSkeleton from "../components/Skeletons/AnimeSectionSkeleton";

export default function AdultPage() {
  const { toast } = useToast();

  const [allData, setAllData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getData = async () => {
      setLoading(true);
      try {
        const data = await getHentai();
        setAllData(data);
      }
      catch (err) {
        toast(`An error occurred: ${err.message || err}`, "error");
      }
      finally { setLoading(false); }
    }

    if (typeof window !== 'undefined' && window.animeo) {
      getData();
    }
  }, [toast]);

  const sections = [
    { title: "Hot Releases", data: allData.trending, color: "#ff004c" },
    { title: "Action", data: allData.action, color: "#d0006f" },
    { title: "Romance", data: allData.romance, color: "#7b2ff7" },
    { title: "Adventure", data: allData.adventure, color: "#5a189a" },
    { title: "Fantasy", data: allData.fantasy, color: "#9d4edd" },
    { title: "Sci-Fi", data: allData.scifi, color: "#3c096c" },
    { title: "Drama", data: allData.drama, color: "#9e0031" },
  ];

  return (
    <div className="relative w-screen min-h-screen flex flex-col z-0 overflow-x-hidden pb-10">
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
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <MovieHero movieList={allData.hero} />
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
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
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
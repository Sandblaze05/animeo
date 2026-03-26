"use client"

import { useEffect, useState } from "react"
import MovieHero from "@/components/MovieHero";
import AnimeHeroSkeleton from "@/components/Skeletons/AnimeHeroSkeleton";
import { AnimatePresence, motion } from "motion/react";
import { useToast } from "@/providers/toast-provider";
import { getMovies } from '../actions';

export default function MoviesPage() {
  const { toast } = useToast();

  const [movieData, setMovieData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getMovieItems = async () => {
      setLoading(true);
      try {
        const data = await getMovies();
        setMovieData(data);
      }
      catch (err) {
        toast(`An error occured: ${err}`, "error");
      }
      finally { setLoading(false); }
    }

    getMovieItems();
  }, [toast]);

  return (
    <div className="relative w-screen min-h-screen flex flex-col">
      <AnimatePresence mode="wait">
        {loading ? (
          <AnimeHeroSkeleton key="skeleton" />
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <MovieHero movieList={movieData} />
          </motion.div>
        )}
      </AnimatePresence>
      <section className="min-h-screen"></section>
    </div>
  )
}

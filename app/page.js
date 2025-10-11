'use client'

import { useEffect, useState } from "react"
import AnimeHero from "@/components/AnimeHero";

export default function Home() {
  const [animeData, setAnimeData] = useState([]);

  useEffect(() => {
    const getHeroItems = async () => {
      try {
        const res = await fetch('/api/hero-items');
        const data = await res.json();
        console.log(data);
        setAnimeData(data);
      }
      catch (err) {
        console.error(err);
      }
    }
    getHeroItems();
  }, []);

  const animeList = [
    {
      bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/181447-t1JZ4Yy2kv94.jpg',
      coverImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx181447-aCmaQmtdwuU5.jpg',
      title: 'May I Ask for One Final Thing?-1',
      score: '8.5',
      genres: ['Action', 'Fantasy', 'Comedy'],
      status: 'Airing',
      description: 'Scarlet, a duke\'s daughter, was known as the "Ice Princess" until a sudden betrayal by her fiancé, the prince. Condemned and broken, she unleashes a hidden, violent side of herself, vowing to get the last laugh... and one final thing.'
    },
    {
      bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/181447-t1JZ4Yy2kv94.jpg',
      coverImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx181447-aCmaQmtdwuU5.jpg',
      title: 'May I Ask for One Final Thing?-2',
      score: '8.5',
      genres: ['Action', 'Fantasy', 'Comedy'],
      status: 'Airing',
      description: 'Scarlet, a duke\'s daughter, was known as the "Ice Princess" until a sudden betrayal by her fiancé, the prince. Condemned and broken, she unleashes a hidden, violent side of herself, vowing to get the last laugh... and one final thing.'
    },
    {
      bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/181447-t1JZ4Yy2kv94.jpg',
      coverImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx181447-aCmaQmtdwuU5.jpg',
      title: 'May I Ask for One Final Thing?-3',
      score: '8.5',
      genres: ['Action', 'Fantasy', 'Comedy'],
      status: 'Airing',
      description: 'Scarlet, a duke\'s daughter, was known as the "Ice Princess" until a sudden betrayal by her fiancé, the prince. Condemned and broken, she unleashes a hidden, violent side of herself, vowing to get the last laugh... and one final thing.'
    },
    // Add more anime objects here for scrolling
  ];

  return (
    <div className="relative w-screen min-h-screen flex flex-col z-0">
      <AnimeHero animeList={animeData} />
      <section className="min-h-screen mt-10"></section>
    </div>
  )
}
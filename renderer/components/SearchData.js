import React, { useState, useEffect } from 'react';
import SearchClient from './SearchClient';
import SearchClientSkeleton from './Skeletons/SearchClientSkeleton';

const SearchData = ({ title }) => {
  const [listOfAnime, setListOfAnime] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // If there's no title, just stop loading and show an empty state
    if (!title) {
      setLoading(false);
      return;
    }

    let mounted = true;

    const fetchSearchData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Standard client-side fetch
        const response = await fetch(`https://api.jikan.moe/v4/anime?q=${title}&limit=20&page=1`);
        
        if (!response.ok) {
          throw new Error(`API Error: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (mounted) {
          setListOfAnime(data.data || []);
          setPagination(data.pagination || {});
        }
      } catch (err) {
        console.error("Error fetching anime:", err);
        if (mounted) {
          setError("Failed to fetch anime data. Please try again.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    // We add a tiny 500ms delay to prevent spamming the API if the user types quickly
    const delayTimer = setTimeout(() => {
      fetchSearchData();
    }, 500);

    return () => {
      mounted = false;
      clearTimeout(delayTimer);
    };
  }, [title]);

  if (loading) return <SearchClientSkeleton />;
  
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white bg-[#0b001f]">
        <p className="text-white/50">{error}</p>
      </div>
    );
  }

  return (
    <SearchClient title={title} initialData={listOfAnime} initialPagination={pagination} />
  );
}

export default SearchData;
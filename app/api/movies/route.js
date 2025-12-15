import { NextResponse } from "next/server";

export const revalidate = 3600;

export async function GET() {
  const query = `
    query GetPopularMovies {
      Page(page: 1, perPage: 20) {
        media(type: ANIME, format: MOVIE, sort: POPULARITY_DESC) {
          id
          title {
            romaji
            english
          }
          bannerImage
          coverImage {
            color,
            extraLarge
          }
          description(asHtml: false)
          genres
          averageScore
          startDate {
            year
          }
        }
      }
    }    
  `;

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      query: query,
    }),
  }

  try {
    const response = await fetch('https://graphql.anilist.co', options);
    const data = await response.json();

    if (!response.ok || data.errors) {
      console.error('Anilist API error', data.errors);
      throw new Error("Failed to fetch data from AniList");
    }

    const allMovies = data.data.Page.media;

    const movieItems = allMovies
      .map(anime => {
        const description = anime.description
          ? anime.description.replace(/<br\s*\/?>/gi, ' ').substring(0, 180) + '...'
          : 'No description available.';

        return {
          id: anime.id,
          title: anime.title.english || anime.title.romaji,
          bannerImage: anime.bannerImage,
          coverImage: anime.coverImage.extraLarge,
          description: description,
          genres: anime.genres,
          year: anime.startDate.year,
          score: anime.averageScore,
          color: anime.coverImage.color,
        };
      });

    return NextResponse.json(movieItems, {
      headers: {
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=60'
      }
    });
  }
  catch (err) {
    console.error('Error fetching movie items: ', err);
    return new NextResponse(
      JSON.stringify({ message: 'Internal Server Error', code: 'movie-item-fail' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

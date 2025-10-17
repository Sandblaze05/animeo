import { NextResponse } from "next/server";

export const revalidate = 3600;

export async function GET() {
  const query = `
    query GetTopAiringAnime {
      Page(page: 1, perPage: 10) {
        media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC) {
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
    const jikan_res = await fetch('https://api.jikan.moe/v4/seasons/now');

    const data1 = await response.json();
    const data2 = await jikan_res.json();

    if (!response.ok || data1.errors) {
      console.error('Anilist API error', data1.errors);
      throw new Error("Failed to fetch data from AniList");
    }
    if (!jikan_res.ok) {
      console.error('Jikan API error');
      throw new Error("Failed to fetch data from Jikan");  
    }

    const allAnime = data1.data.Page.media;
    const jikanData = data2.data;

    const topAiring = allAnime.map((anime) => ({
      id: anime.id,
      title: anime.title.english || anime.title.romaji,
      coverImage: anime.coverImage.extraLarge,
      score: anime.averageScore,
      year: anime.startDate.year
    }))

    const currentSeason = jikanData.slice(0, 11).map((anime) => ({
      id: anime.mal_id,
      coverImage: anime.images.webp.large_image_url,
      title: anime.title_english,
      type: anime.type,
      airing: anime.airing,
      score: anime.score
    }))

    return NextResponse.json({ topAiring, currentSeason });
  }
  catch (err) {
    console.error('Error fetching unified query: ', err);
    return new NextResponse(
      JSON.stringify({ message: 'Internal Server Error', code: 'all-data-failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
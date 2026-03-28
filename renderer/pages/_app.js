import Head from "next/head";
import { Geist, Geist_Mono, Poppins } from "next/font/google";
import "../styles/globals.css";
import AppShell from "../components/AppShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>AniMeo</title>
        <meta name="description" content="" />
        {/* Add any other global meta tags here */}
      </Head>

      <main
        className={`${geistSans.variable} ${geistMono.variable} ${poppins.variable} relative w-screen min-h-screen flex flex-col overflow-x-hidden`}
      >
        <AppShell>
          <Component {...pageProps} />
        </AppShell>
      </main>
    </>
  );
}
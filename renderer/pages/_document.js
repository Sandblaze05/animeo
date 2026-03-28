import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head />
      {/* antialiased can be safely applied directly to the body here */}
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
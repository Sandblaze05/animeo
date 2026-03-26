/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'export',
    images: {
        unoptimized: true,
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 's4.anilist.co',
                port: ''
            },
            {
                protocol: 'https',
                hostname: 'cdn.myanimelist.net',
                port: ''
            },
            {
                protocol: 'https',
                hostname: 'myanimelist.net',
                port: ''
            }
        ]
    }
};

export default nextConfig;

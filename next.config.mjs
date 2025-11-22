/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
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
            }
        ]
    }
};

export default nextConfig;

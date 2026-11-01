/** @type {import('next').NextConfig} */
const nextConfig = { poweredByHeader: false, distDir: process.env.MAHALLA_NEXT_DIST_DIR || '.next' };
export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Next 16 only serves qualities on this list. 40 is for the hero
    // photograph, which sits at 9% opacity behind the headline and cannot show
    // compression artefacts at that strength.
    qualities: [40, 75],
  },
};

export default nextConfig;

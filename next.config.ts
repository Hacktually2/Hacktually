import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Next 16 only serves qualities on this list. 40 is for the hero
    // photograph, which sits at 9% opacity behind the headline and cannot show
    // compression artefacts at that strength.
    qualities: [40, 75],
  },
  experimental: {
    serverActions: {
      // A branch-split upload is a whole sales export, not a form field. The
      // upload action refuses anything over 64 MB itself; this is the transport
      // limit that has to be at least as large.
      bodySizeLimit: "70mb",
    },
  },
};

export default nextConfig;

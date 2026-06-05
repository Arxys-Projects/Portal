import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The System Estimate PDF reads the Arxys logo and the VideoX hero images
  // off disk (src/lib/pdf/assets.ts) at request time. The hero path is
  // computed from the recommended product group, so @vercel/nft can't trace it
  // statically — bundle the assets explicitly for the PDF route.
  outputFileTracingIncludes: {
    "/api/submissions/*/pdf": [
      "public/email/arxys-logo.png",
      "public/price-book/**/*.png",
    ],
  },
};

export default nextConfig;

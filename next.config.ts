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
    // The datasheet route (ADR 0110) reads every one of its assets off disk
    // through join(process.cwd(), "public", ...), so @vercel/nft cannot trace a
    // single one of them — not even the two logos, whose public paths ARE string
    // literals, because the absolute path is assembled at runtime.
    //
    // THE FONTS ARE THE CRITICAL ENTRY. This is the first route to register local
    // TTFs (ADR 0106 committed them rather than fetching from Google at render
    // time). Font.register() pointed at a path that does not exist in the bundle
    // fails the render outright, which at least announces itself.
    //
    // The PNGs fail SILENTLY, which is worse: loadPng() catches the read error and
    // returns null, so an untraced photo renders a held frame that is
    // indistinguishable from "no photography shot yet", and an untraced warranty
    // seal renders the dashed held circle on a sheet that should carry the real
    // mark. Nothing in the response would say anything was wrong.
    //
    // price-book is included for the two warranty seals, and because ADR 0107
    // permits a spec row's photo path to point at a Price Book hero.
    "/api/datasheet/*": [
      "public/fonts/*.ttf",
      "public/datasheet/**/*.png",
      "public/price-book/**/*.png",
    ],
  },
};

export default nextConfig;

# Roota fonts

The site's existing families, Jost and Unbounded, are vendored here to make production builds independent of Google Fonts CSS/network responses. All weight ranges and Cyrillic/Latin glyphs are retained. `next/font/local` exposes the existing CSS variables.

Sources (retrieved 2026-11-07):
- https://github.com/google/fonts/tree/main/ofl/jost
- https://github.com/google/fonts/tree/main/ofl/unbounded

The original variable TrueType fonts were compressed to WOFF2 using Google's woff2 codec via the `wawoff2` package. No outlines were edited and no glyphs were removed. Both accompanying SIL Open Font License files are retained. Compression is a one-time preparation step; there is no new application dependency.

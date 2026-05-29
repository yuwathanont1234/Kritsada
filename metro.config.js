const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add 'bin' to the list of asset extensions to support linear probe weights bundling
config.resolver.assetExts.push('bin');

// Stop Metro from crawling huge non-JS directories on startup. Without
// watchman installed, Metro falls back to a node file crawler that walks the
// whole project tree — and this repo carries a 471 MB Python virtualenv
// (.venv), the .git store, scraper scripts, and scratch/output dumps that
// Metro never needs. Crawling them made `expo start` hang at "Starting
// project" before Metro could bind. blockList keeps the crawl out of them.
// (Single combined RegExp — the metro-config exclusionList helper subpath is
// not exported in this Metro version.)
//
// IMPORTANT: anchor the pattern to the project root (__dirname). An unanchored
// `/dist/` (etc.) also matched node_modules/*/dist — where most packages ship
// their compiled entrypoints — so Metro silently dropped memoize-one, sentry,
// posthog, supabase… and bundling failed with "main module could not be
// resolved". Anchoring blocks only the top-level dirs we actually mean.
const root = __dirname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = new RegExp(
  `^${root}/(\\.venv|\\.git|scratch|scripts|financial_model|marketing_assets|landing|dist|__pycache__)/.*`
);

module.exports = config;

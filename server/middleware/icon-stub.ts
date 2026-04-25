// iOS / browsers auto-request these favicon paths. Without a handler they hit
// the SPA router and emit "No match found" warnings on every page load.
// Return 204 No Content for any of them so the requests never reach the Vue Router.
const STUBBED = new Set([
  "/apple-touch-icon.png",
  "/apple-touch-icon-precomposed.png",
  "/apple-touch-icon-120x120.png",
  "/apple-touch-icon-120x120-precomposed.png",
  "/apple-touch-icon-152x152.png",
  "/apple-touch-icon-180x180.png",
  "/favicon.ico",
]);

export default defineEventHandler((event) => {
  const path = event.path?.split("?")[0] ?? "";
  if (STUBBED.has(path)) {
    setResponseStatus(event, 204);
    setHeader(event, "cache-control", "public, max-age=86400");
    return null;
  }
});

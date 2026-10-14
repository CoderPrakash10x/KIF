import '@testing-library/jest-dom/vitest';
if (!window.matchMedia) {
  window.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } });
}

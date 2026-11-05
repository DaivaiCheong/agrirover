/** Sample-data mode: open any page with ?mock=guava. It lasts for this browser tab, and ?mock=off or the
 *  banner's Exit button leaves it. With it off, nothing else in the app knows it exists. */
const KEY = "aaf_mock";

function readMode(): boolean {
  try {
    const asked = new URLSearchParams(window.location.search).get("mock");
    if (asked === "off") sessionStorage.removeItem(KEY);
    else if (asked) sessionStorage.setItem(KEY, asked);
    return sessionStorage.getItem(KEY) === "guava";
  } catch {
    return false;                                     // storage blocked, or no window (tests): the real app
  }
}

export const mockOn = readMode();

export function exitMock() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  window.location.assign("/");
}

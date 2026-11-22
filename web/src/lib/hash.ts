import { useSyncExternalStore } from "react";

// Hash routing where the query lives inside the hash (`#/transactions?category=food`), as the server's links and Back expect.
// wouter's own hash hook puts the query in the real URL search, so we keep our own.

const subscribe = (cb: () => void) => {
  addEventListener("hashchange", cb);
  return () => removeEventListener("hashchange", cb);
};
const raw = () => location.hash.replace(/^#\/?/, "");
const hashPath = () => "/" + raw().split("?")[0];
const hashSearch = () => {
  const r = raw();
  const i = r.indexOf("?");
  return i < 0 ? "" : r.slice(i + 1);
};

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const hash = "#" + (to.startsWith("/") ? to : "/" + to);
  if (opts.replace) {
    const oldURL = location.href;
    history.replaceState(null, "", location.pathname + location.search + hash);
    dispatchEvent(new HashChangeEvent("hashchange", { oldURL, newURL: location.href }));
  } else {
    location.hash = hash;
  }
}

export const useHashLocation = (): [string, (to: string, opts?: { replace?: boolean }) => void] => [useSyncExternalStore(subscribe, hashPath, () => "/"), navigate];
useHashLocation.hrefs = (href: string) => "#" + href;
export const useHashSearch = () => useSyncExternalStore(subscribe, hashSearch, () => "");

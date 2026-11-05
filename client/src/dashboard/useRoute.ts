// The dashboard's route from the location: read on load (a hash, else a notification's ?tab=), followed on hashchange,
// and changed by navigate(). A tapped notification ('cubefarm:open', notifications.ts / pwa.ts) navigates too.
import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_ROUTE, formatRoute, parseRoute, routeFromLink, type Route } from './route';

/** The address bar with `route` as its hash, and no ?tab= (it's been read). */
function urlWith(route: Route): string {
  const q = new URLSearchParams(location.search);
  q.delete('tab');
  const search = q.toString();
  return `${location.pathname}${search ? `?${search}` : ''}${formatRoute(route)}`;
}

function startRoute(): Route {
  return routeFromLink(location.href, location.origin) ?? DEFAULT_ROUTE;
}

export function useRoute(): [Route, (r: Route, opts?: { replace?: boolean }) => void] {
  const [route, setRoute] = useState(startRoute);

  const navigate = useCallback((r: Route, opts?: { replace?: boolean }) => {
    const url = urlWith(r);
    if (url !== `${location.pathname}${location.search}${location.hash}`) {
      if (opts?.replace) history.replaceState(history.state, '', url);
      else history.pushState(history.state, '', url);
    }
    setRoute(r);
  }, []);

  useEffect(() => {
    // The address bar says exactly the route shown (an unknown hash or a ?tab= link becomes its route's hash).
    history.replaceState(history.state, '', urlWith(startRoute()));
    const onHash = () => setRoute(parseRoute(location.hash));
    const onOpen = (e: Event) => {
      const r = routeFromLink((e as CustomEvent<string>).detail, location.origin);
      if (r) navigate(r);
    };
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    window.addEventListener('cubefarm:open', onOpen);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
      window.removeEventListener('cubefarm:open', onOpen);
    };
  }, [navigate]);

  return [route, navigate];
}

# Offline web training

`pnpm build:web` precaches all exported routes, bundled fonts, images, and scripts with a
versioned service worker. After one completed online visit, the web app can reload or open
a previously unvisited training route without a connection. Local progress survives reloads.
HTTPS or localhost is required by browsers. Native builds bundle these resources directly.

Run `verify.sh drive offline`. The flow waits for installation, disables the network, opens
a previously unvisited True Count drill, submits an answer, and checks that its saved session
survives a full offline reload. It then opens every game and Rules offline.

New versions wait until existing tabs close before activation. This avoids replacing the
code during a hand. Cache deletion removes only older `truecount-offline-*` caches and never
touches local storage or session history.

Run `verify.sh drive offline-updates` to test deployment changes. A private local server serves
the generated worker and labels successive builds, with long-lived HTTP caches. The browser
checks that a new worker fetches fresh HTML, waits for the old tab to close, activates, and
removes the old cache. A later install deliberately fails on one resource; the active build
must still reload offline. The flow closes its private server without changing `dist/` or the
shared verification instance.

# The mobile interface

A framework for putting this application on a phone, and what has already been
built inside it.

The application is a static site: a bundle of files, a browser, an IndexedDB and
a Dropbox file. There is no server and no account to sign up to. A phone can run
it, because a phone has a browser, an IndexedDB and the network — everything the
application already needs.

What this document settles is *how* a phone runs it, what a phone interface has
to satisfy, where the seams are for the work that is left, and how any of it is
tested without a phone in the room.

## 1. The decision

There are four ways to get this application onto a phone. Three of them are
recorded here so the decision is not made twice; the fourth is the one that was
made.

| Option | Decision | Why |
| --- | --- | --- |
| **A. The same bundle, arranged for a phone's width** | **Chosen** | No second codebase, no second implementation of the merge or the sync, and no new host to run. The document is already portable — it is a file in Dropbox — so the phone is simply a second device, and the one thing the app is missing on a phone is a layout that suits a thumb. |
| B. A progressive web app: a manifest and a service worker | Deferred | This is D53 again, and the reason for deferring it has not changed: a service worker brings a cache-invalidation problem — a released build has to evict the previous one, or a phone keeps running last week's bundle — and nobody has asked for offline. The manifest half is cheap and can be added alone; the service worker half is the decision. |
| C. A native shell (Capacitor and the like) around the same bundle | Deferred | The bundle would be reusable, but the OAuth redirect is derived from `window.location.origin` (`src/sync/redirect.ts`) and a shell's origin is something like `capacitor://localhost`, which is not a redirect URI Dropbox will take. A shell would need an https link on a domain of its own and a redirect URI registered for it. That is a piece of infrastructure, not a layout. |
| D. A separate native client, written against the document file | Rejected | It is a second implementation of the merge, the sync and the document — the three parts hardest to get right — and it would still be talking to the same Dropbox file, so the two would have to agree about every conflict rule. Option A gives a phone the whole application today. |

Option A is not the same as "the desktop layout on a small screen". A phone
interface is a different arrangement of the same behaviour, and §2 says what it
has to satisfy.

## 2. What a phone interface has to satisfy

Each of these is a thing a check can assert, which is why they are phrased this
way. The phone suite (`npm run test:mobile`) is where they are checked.

- **M1 — The same application.** The same routes, the same records and the same
  document. A record added on a phone is the same record as one added on a
  laptop, and the document is byte-identical either way. Nothing about the width
  changes what is written.
- **M2 — No sideways scrolling.** At 390px the page does not scroll
  horizontally. The document's paper is wider than a phone and scrolls inside
  its own box; the page around it does not.
- **M3 — The section links are where a thumb reaches.** They are a fixed bar at
  the foot of the screen, not links in the header at the top of it.
- **M4 — The links in that bar are tap targets.** At least 48px tall. A link
  that is a line of text is not something a finger can hit.
- **M5 — The buttons are tap targets.** At least 48px tall, for the same reason.
- **M6 — Nothing is lost under the bar.** The page keeps room for it, so the
  last thing on the page can be read and tapped.
- **M7 — The document's controls fold away.** On a laptop the rail sits beside
  the paper; on a phone there is no room beside it and above the paper it would
  push the document down the screen. It folds behind one line that says what is
  inside.
- **M8 — The document is still readable, and still measured.** The paper keeps
  its printed width and its type; it does not shrink to fit a phone. It scrolls
  inside its own box, and the fit report measures it at the measure it prints
  at — so the estimate on a phone is the estimate on a laptop. A document
  squeezed to the width of a phone wraps early, and the estimate then counts a
  document nobody would print.
- **M9 — Printing is the same.** The print stylesheet prints the document and
  not the editor, from either width and from either page.
- **M10 — The document does not change.** The width changes the arrangement of
  the interface, never the content, the order or the measurements.
- **M11 — It is reachable.** No axe violations at phone width.
- **M12 — One build.** The width is asked about at run time. There is no phone
  build and no desktop build, so what a reviewer reads is what a phone runs.
- **M13 — Nothing runs off the side of the screen.** Text with no spaces in it
  has nowhere to break, and a browser that is not told it may break it lets it
  run past the edge of the page and under the buttons beside it.

## 3. The header, on both sizes

The header is the same arrangement on a phone and on a laptop, because the
arrangement is not the problem — the width is.

- **The three pages a user moves between** — the work history, the questions
  and the document — are in the navigation, together. The document was a link
  in the corner of the header while the other two sat in the navigation, which
  made it look like an afterthought rather than one of the three.
- **The settings and the about page** are behind a menu. They are places one
  visits rather than works in, and one control is enough to reach them.
- **On a phone the navigation is the bar at the foot of the screen**, because a
  thumb does not reach the top of a phone; on a laptop it is where it has
  always been, in the header.

## 4. The seams

The places a change to the phone interface goes, so that a change has one home
rather than a habit.

- **`src/app/device.ts`** — the only place the width is asked about. It exposes
  `usePhoneLayout()`, which asks the browser the same question the stylesheet
  asks (`(max-width: 40rem)`), and it answers before the first paint: an answer
  read in an effect would lay the desktop interface out first and change it a
  frame later, which is a visible jump on every load. The constant and the
  stylesheet's media query have to move together, and the test says they do.
- **`src/styles.css`, the mobile block** — the layout itself: the bar at the
  foot, the tap targets, the room kept clear beneath it, and the header title
  that has to wrap.
- **`src/features/document/DocumentChrome.tsx`** — the one component that
  changes shape at phone width, and it does so through the device layer rather
  than by measuring the window itself.
- **`src/sync/redirect.ts`** — where a native shell would have to be plugged in.
  The OAuth redirect URI is derived from the origin the app is served from, and
  the three call sites that must agree are already together in that one file.
- **Everything else** — the domain layer, the storage layer, the sync engine and
  the exporters are already platform-neutral. They are plain TypeScript over
  browser APIs, with no DOM in them, which is why option D was rejected rather
  than deferred.

## 5. What is deliberately not here

- **No service worker**, so no offline, and so the home-screen shortcut needs
  the network to load the application. This is D53, unchanged.
- **No web app manifest**, so a phone that adds the site to its home screen
  uses the browser's icon and opens it with browser chrome. The manifest is the
  cheap half of option B and can be added on its own.
- **No native shell.** Option C, with the redirect URI problem it carries.
- **No separate routes for a phone.** The routes are the routes; M1 says so.
- **No smaller type on a phone.** The document is the document.

## 6. How it is tested

| | |
| --- | --- |
| `src/app/device.test.ts` | The device layer: the answer is read before the first paint, and it follows the width changing under it. |
| `npm run test:mobile` | The phone interface, in a browser at 390×844 with touch and a device pixel ratio of 3: the bar, the tap targets, the overlap, the sideways scroll, the folded rail, the estimate, and an axe audit on six routes. |
| `npm run test:e2e` | The application at the size it was designed at. Unchanged by any of this. |
| `npm run test:a11y` | The application at the size it was designed at. Unchanged by any of this. |

The phone suite runs without `isMobile`, deliberately: with it, Chrome widens
the layout viewport to fit content that overflows, which is what a phone does
with a page that is too wide and which hides the overflow the suite is looking
for.

A phone in the room is not needed for any of it. What a phone *does* add is the
one thing a viewport cannot fake: a real touch target under a real thumb, and the
platform's own behaviour for a home-screen shortcut. §7 is about that.

## 7. Trying it on a phone

Four ways, and what each one is good for.

**A. The built site over the local network — the whole interface, no sync.**

```bash
npm run build
npm run preview -- --host --port 4173
```

Then open `http://<this machine's address>:4173/career-management/` on the
phone. The path matters: the site is served under `/career-management/`, which
is the base path the build derives from the package name, and opening the root
gives a 404.

What this gives: the entire application, running on the phone, with the phone's
own IndexedDB — a second device, holding nothing yet. Type a job into it and
the interface is fully exercised.

What it does not give: Dropbox. The OAuth redirect URI is the origin the app is
served from (`src/sync/redirect.ts`), and Dropbox will only take an https
redirect URI that is registered in the App Console. A plain-http LAN address is
neither, so the authorisation fails with `invalid_redirect_uri` and the app
carries on with the document unsynced.

**B. A tunnel — the whole application, with sync.**

```bash
npm run build
npm run preview -- --host --port 4173
cloudflared tunnel --url http://localhost:4173
```

The tunnel gives an https address; open `https://<the tunnel>/career-management/`
on the phone, and add that exact address to the Dropbox App Console as another
redirect URI (App Console → Settings → Redirect URIs). The phone then authorises
against the same Dropbox file as the laptop and the two devices sync.

The cost: a quick tunnel's address changes every time it starts, so it has to
be registered each time. A named tunnel has an address of its own and is
registered once.

**C. The deployed site.** The application is deployed to GitHub Pages and its
redirect URI is already registered, so a phone that opens it authorises and
syncs with no setup at all. What it gives is the released build, not the
branch: to try a branch on a phone this way, the branch has to be deployed.

**D. Without a phone.** `npm run test:mobile` runs the same checks in a browser
at the phone's size, and the browser's own device emulation (Chrome: toggle the
device toolbar) gives a hands-on look at any width without anything installed on
anything.

## 8. What is left

The framework is in place and the checks pass. What is not done is recorded in
`specs/todo.md`: the real-device pass, the decision about a manifest, and the
work that only a phone can show — the home-screen shortcut, the keyboard on a
phone covering a field, and what the print sheet does on a phone.

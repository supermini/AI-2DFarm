# The dashboard in your pocket

The cubefarm dashboard works from a phone. On a small screen its rail of roles becomes a tab bar at the bottom, and the
screens are the same as on a computer. The dashboard installs on your home screen, and the office tells you when
something needs you, on your devices or in the ntfy app.

## The screens

Each screen has its own address, so links and reloads land on it. The floor picker in the top bar chooses the floor.

| Screen | Address | On a phone |
| --- | --- | --- |
| 🧠 **CEO** | `#/ceo` (chat), `#/ceo/approvals` | Chat with the CEO, with ▶ to hear a message read aloud. Approvals: team changes waiting for you, stuck PRs and passed PRs. |
| 🔨 **Developer** | `#/dev/2` (board), `#/dev/2/terminals` (team & terminals), `#/dev` (all floors) | The floor's board, one column under the other: assign, send to QA, merge, close, file issues. The team and terminals, one terminal at a time. |
| 🔍 **Reviewer** | `#/review/1` (floor's queue), `#/review/1/42` (one PR) | The PR queue, then the PR: QA's report, its screenshots and its app. |
| 🛰️ **Metrics** | `#/metrics` | Mission control (Claude's usage, what needs you, the office doctor, each floor's numbers) and the 📼 Time-lapse. |
| ⚙️ **Settings** | `#/settings/notifications` (or `floors`, `team`, `issues`, `office`, `cloud`, `voice`, `accessibility`) | The manager's settings, and this device's notifications. |

What's on each screen:

- **CEO.** The CEO's status and job, the planning buttons (**Plan floor…**, **Onboard floor**, **Review the company now**),
  the chat, and on the right: **Interview** for a hire, **Triage** for stuck PRs, **File an issue**, and the CEO's
  settings. **Approvals** lists what waits on you: a new agent's setup (coding agent, model, effort) with **Hire** or
  **Decline**, an agent to let go, a stuck PR with **Retry QA**, **Send back for a fix**, **Merge anyway** or **Close PR**,
  and a passed PR on a floor without auto-merge, with **Merge**.
- **Developer.** Each floor's board: its pipeline, the team as drop targets, and the Kanban. Hand an issue to an agent with
  **Assign to…** or by dragging it onto them. **Team & terminals** shows up to six agents' live terminals and the workers
  list, with what each one is on. Each agent's drawer has **Message**, **■ Stop**, **↺ Clear desk**, assigning and
  **⚙️ Setup**. Below 760 px, one terminal shows at a time. The all-floors board also lists the team, with **💬 Message**,
  **■ Stop** and **↺ Clear desk** on each agent.
- **Reviewer.** The PR queue, grouped as Testing, Failed / fixing, Needs you, Passed and Merged today. A PR's tabs are its
  **Report** (QA's summary and checks), **Screenshots** (click to enlarge), **App** (main, the PR, or both side by side)
  and **Actions**.
- **Metrics.** Claude's usage meter with **⏩ Resume full speed**, the **Needs you** list, the office doctor's findings
  with their fixes, and a table of each floor's numbers. **📼 Time-lapse** replays past days.
- **Settings.** Floors and repos, team, issues, office (default coding agent, session limit, team changes from the CEO),
  notifications, cloud agents, voice and accessibility.

Accessibility choices are saved per browser, and so is this device's notifications setup (the browser's permission and
the push subscription).

## Install it

The office is an installable web app: Chrome and Edge offer **Install** in the address bar (on Android: ⋮ → **Add
to Home screen**), and Safari on iPhone has **Share → Add to Home Screen**. Installing needs the office to be served
over HTTPS, or opened as `localhost` on its own PC (see [phone access](#reach-the-office-from-your-phone)).

The app's service worker caches only the app shell (the page, its scripts and styles, the icons) so it opens quickly.
It never caches the office's data: everything you see comes live from the office. Every office update gives the
worker a new version, which replaces the old one and its cache, so the app never runs stale code.

## Notifications

Open **⚙️ Settings → 🔔 Notifications** and pick what you hear about:

- a pull request needs you (stuck, and the CEO has handed it to you)
- a message from the CEO
- a team change waits for your decision
- someone has been stuck in an error for over 10 minutes
- Claude's usage limit pauses the office, or a usage warning paces it
- every merge (off unless you turn it on)

You get at most one notification of each kind a minute. Whatever else of that kind happens in the minute arrives
together as one summary ("🔀 9 more merges"), so a burst of merges is two notifications, not ten.

**Office address for links:** set it to the address your phone opens the office at (for example your Tailscale
Serve URL) and every chat message ends with it, so a tap takes you there.

Every channel has an **On** switch and a **Test** button. A demo office (`--demo`) sends nothing: it starts with
every chat app set up with fake addresses and prints what each would get in the server's log.

A notification opens the screen it's about: a PR that needs you or a team change opens the CEO's approvals, a message
from the CEO opens its chat, an agent stuck in an error opens the team's terminals, and anything else (a merge, usage)
opens Metrics. Links from before the dashboard (`?tab=chat`, `?tab=approvals`, `?tab=kanban`, `?tab=team`,
`?tab=company`) still open the matching screen.

### Desktop notifications

Any browser with the office open in a background tab shows notifications, once you click **Allow in this
browser**. A tab you're looking at doesn't: the office chimes and shows the toast there anyway.

### Push to your phone (Web Push)

Push reaches a device even when the office isn't open on it. On each phone or PC, open the office over HTTPS (or as
`localhost` on the office's own PC), go to **⚙️ Settings → 🔔 Notifications** and tap **Push to this device**, then
**Send test**. On an iPhone (iOS 16.4 or later), add the office to the home screen first and turn push on from the
installed app: Safari only allows Web Push there.

The office signs its pushes with its own VAPID key pair, made the first time a device signs up and kept in
`<SWARM_HOME>/push.json` with the devices' subscriptions (owner-only file permissions). Messages are encrypted for
each device (RFC 8291) and go through the browser maker's push service (Google, Mozilla, Apple), which can't read
them. A device that unsubscribes, or whose browser data is cleared, is dropped the next time a push to it fails.

### ntfy

[ntfy](https://ntfy.sh) pushes to its own phone app with no account. Anyone who knows a topic's name can read it, so
pick a long random one.

1. In the ntfy app, subscribe to a topic such as `cubefarm-7f3k9q2m`.
2. Enter `https://ntfy.sh/cubefarm-7f3k9q2m` (or your own ntfy server's topic URL) under **Phone app → ntfy**. For a topic
   with access control, add its access token (`tk_…`). **Save** and **Test**.

### Where the secrets live

The ntfy topic and token are kept in `<SWARM_HOME>/secrets.json`
(`~/.cubefarm/secrets.json` by default) next to the ElevenLabs key: owner-only file permissions, never in
`state.json`, never logged, never sent to a browser (the settings show the last 4 characters) and never given to
agents. **Remove** deletes them. A demo office keeps its own `demo-secrets.json` and `demo-push.json`.

## Reach the office from your phone

The office listens on `127.0.0.1` only, on purpose: it can start agents that run commands on your PC, so it must
never be open to your network or the internet as it is. It never changes that or opens ports itself unless you start
it with `--host <address>` (or `SWARM_HOST`), which has no sign-in: only for a network you trust. To use it from your
phone, put something that authenticates you in front of it:

- **Tailscale Serve (recommended).** Install [Tailscale](https://tailscale.com) on the office's PC and your phone,
  signed in to the same tailnet. On the PC run:

  ```
  tailscale serve --bg 4317
  ```

  It prints an address such as `https://office-pc.your-tailnet.ts.net`, with a real HTTPS certificate, reachable
  only from your own devices. Open it on your phone: the dashboard, installing and push all work. Put the same address
  in **Office address for links**. `tailscale serve reset` stops it. Don't use `tailscale funnel`, which publishes the
  office to the whole internet.
- **Cloudflare Tunnel with Cloudflare Access**, or another tunnel that makes you sign in before anything reaches the
  office, also works. A tunnel without its own sign-in is not safe.

Floors' apps (**View app** on the board, the PR theatre's **App** tab, **Open in new tab**) run on the office PC's own
ports, which your phone can't reach. Away from that PC, the office shows them through its own address at
`/preview/<port>/` instead, for running previews only. Most apps work as they are; a client-side router sees
`/preview/<port>/` in the address, and a dev server's hot reload doesn't connect. On the office PC itself they open
directly, as before.

Over plain `http://` on your LAN (say `http://192.168.1.20:4317`, which needs the office to listen there, which it
doesn't without `--host`) browsers refuse service workers and push, so there's no install and no push: another reason to use HTTPS.

# Deploying CADL

CADL is a static Vite build (TypeScript + Babylon.js). It is **not** on GitHub
Pages — it is served from the shared **lab980 droplet** at
**https://cadl.lab980.com**, following the standard lab980 shape: one dir per
site, a pm2 app on a local port, an nginx vhost proxying to it, and a per-site
certbot cert. See `lab980.com/CLAUDE.md` for the platform conventions.

- Web dir on the droplet: `/var/www/cadl`
- Build output: `dist/` (served, not committed)
- Process: pm2 app `cadl` (`server.mjs` under node, registered by `cadl deploy`; port from `.env`)
- Subdomain: `cadl.lab980.com`

## First-time provisioning (once, on the droplet)

Scaffold DNS + dir + repo clone + nginx + TLS with the lab980 provisioner, then
do the app-specific build/run it deliberately leaves to each site:

```bash
# DNS A record + /var/www/cadl clone + nginx vhost + certbot cert
provision-site cadl ivjames/cadl

# build and start it (provision-site stops before this on purpose)
cd /var/www/cadl
ln -sf /var/www/cadl/bin/cadl /usr/local/bin/cadl   # install the operate CLI
cadl deploy                                         # npm ci, build, first pm2 start (server.mjs --name cadl), probe, save
```

The app is a tiny dependency-free static server (`server.mjs`) run under pm2.
`cadl deploy` sees that nothing named `cadl` is registered and does the first
`pm2 start server.mjs --name cadl` itself, from a scrubbed environment (see
below); every later deploy is a `pm2 restart cadl`. The port is the `PORT`
`provision-site` reserved in `/var/www/cadl/.env` (8060+) and pointed the
nginx vhost at: `server.mjs` reads that file itself on every (re)start, and
pm2 hands the process nothing — no `PORT`, no env at all, exactly the live
registration — so the app and nginx can't disagree on the port, and changing
it in `.env` takes effect on the next restart. (Handing `PORT` in at start
would pin it in pm2's dump and defeat that.) The CLI reads the same `.env`
line only to know where to probe; it has no built-in port of its own on
purpose — with no `PORT` in `.env` (and no `CADL_PORT`) `deploy` and `restart`
refuse rather than guess. Reboot
survival relies on the pm2 startup hook already installed on the droplet
(`systemctl is-enabled pm2-root` → enabled); the `pm2 save` at the end of
`deploy` writes the dump it replays.

## Routine deploys

Once provisioned, deploying a new commit is one command on the droplet:

```bash
cadl deploy
```

That runs: `git fetch` + `reset --hard origin/main` → `npm ci` (only when
`node_modules/` is missing or `package-lock.json` changed between the old and
new commit — it is the slowest step and pure waste otherwise) → `npm run
build` → `pm2 restart cadl` (or the first `pm2 start server.mjs --name cadl`)
→ probe → `pm2 save`. Other operate commands:

```bash
cadl restart   # pm2 restart + probe, no rebuild (refuses when dist/ is missing)
cadl logs      # tail pm2 logs
cadl status    # HEAD, dist/ present?, pm2 state, local + public probe, cert days
cadl deploy --no-build   # sync + restart without rebuilding (dist/ must exist)
```

`bin/cadl` is the merged lab980 app-CLI template with this site's steps
folded in, so it behaves like every other `<stub>` on the box:

- **Every pm2 call runs from a scrubbed environment** — `env -i` plus `PATH`,
  `HOME`, `LANG`, and `PM2_HOME`/`TERM` if set; never `--update-env`. pm2
  copies the environment of the `pm2 start` call into the process and into
  `~/.pm2/dump.pm2`, so nothing exported in the shell that ran `deploy` can
  reach the process or the dump. Unlike the other lab980 CLIs this one does
  not hand in `PORT` either: `server.mjs` reads it from `.env`, and the live
  registration carries no env.
- **`deploy` fails, and saves nothing, when `127.0.0.1:<PORT>` does not answer
  HTTP** (any status code counts; up to `CADL_PROBE_TRIES`, default 10, tries
  a second apart). `pm2 save` runs only after that and only when every
  registered pm2 process is `online` — otherwise it warns and leaves the
  previous dump alone.
- A tracked file edited on the droplet is destroyed silently by the next
  deploy's hard reset — fix it in the repo. `.env`, `dist/` and
  `node_modules/` are gitignored and survive.
- Must run as root with root's `HOME` (`sudo -i` / `su -`), because the pm2
  daemon and dump are root's.

Deploy from `main` — keep it the source of truth. To deploy a feature branch
for testing, set `CADL_BRANCH=<branch> cadl deploy`. Other overrides:
`CADL_FQDN`, `CADL_PORT` (the probe port, instead of reading `.env`),
`CADL_PROBE_TRIES`.

## Verify

```bash
curl -sI https://cadl.lab980.com | head -1                 # 200 OK
curl -s  https://cadl.lab980.com | grep -o 'src="/assets/[^"]*"'  # hashed asset under /
```

Because `base` is `/` (not the old `/cadl/`), built asset URLs resolve from the
subdomain root. If you ever see 404s for `/cadl/assets/...`, a stale
GitHub-Pages-era build is being served — rebuild.

## Troubleshooting a 502

A 502 means nginx is up but can't reach the app on its local port. Check, in
order:

```bash
cadl status                          # pm2 'online' or 'errored'? dist/ present? does 127.0.0.1:$PORT answer?
cadl logs                            # why it crashed, if it did
grep proxy_pass /etc/nginx/sites-available/cadl.lab980.com   # nginx's port
```

The app and nginx both derive the port from `/var/www/cadl/.env`, so they should
always match. If the local probe in `cadl status` works but the site still 502s, reload
nginx (`nginx -t && systemctl reload nginx`). If the app isn't listening, run
`cadl restart` and re-check `cadl logs`. (Earlier revisions used `pm2 serve`,
whose port lived only in pm2's args and could revert to 8080 on a
`--update-env` restart — the `.env`-driven `server.mjs` removes that trap.)

## Local development

```bash
npm install
npm run dev      # vite dev server
npm run build    # production build to dist/
npm test         # vitest
```

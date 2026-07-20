# Deploying CADL

CADL is a static Vite build (TypeScript + Babylon.js). It is **not** on GitHub
Pages — it is served from the shared **lab980 droplet** at
**https://cadl.lab980.com**, following the standard lab980 shape: one dir per
site, a pm2 app on a local port, an nginx vhost proxying to it, and a per-site
certbot cert. See `lab980.com/CLAUDE.md` for the platform conventions.

- Web dir on the droplet: `/var/www/cadl`
- Build output: `dist/` (served, not committed)
- Process: pm2 app `cadl` (`pm2 serve dist <port> --spa`)
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
npm ci
npm run build
pm2 startOrReload ecosystem.config.cjs              # or just: cadl restart
pm2 save
```

The app is a tiny dependency-free static server (`server.mjs`) run under pm2 via
`ecosystem.config.cjs`. It reads its port from `/var/www/cadl/.env` — the same
`PORT` `provision-site` reserved (8060+) and pointed the nginx vhost at — so the
app and nginx can't disagree on the port. Reboot survival relies on the pm2
startup hook already installed on the droplet (`systemctl is-enabled pm2-root` →
enabled); `pm2 save` writes the dump it replays.

## Routine deploys

Once provisioned, deploying a new commit is one command on the droplet:

```bash
cadl deploy
```

That runs: `git fetch` + `reset --hard origin/main` → `npm ci` → `npm run
build` → `pm2 startOrReload` → `pm2 save`. Other operate commands:

```bash
cadl restart   # start/reload the pm2 app without rebuilding
cadl logs      # tail pm2 logs
cadl status    # pm2 describe cadl
```

Deploy from `main` — keep it the source of truth. To deploy a feature branch
for testing, set `CADL_BRANCH=<branch> cadl deploy`.

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
pm2 describe cadl                    # is it 'online', or 'errored'/stopped?
cadl logs                            # why it crashed, if it did
PORT="$(grep -oE 'PORT=[0-9]+' /var/www/cadl/.env | cut -d= -f2)"
curl -sI "http://127.0.0.1:$PORT/"   # does the app answer directly?
grep proxy_pass /etc/nginx/sites-available/cadl.lab980.com   # nginx's port
```

The app and nginx both derive the port from `/var/www/cadl/.env`, so they should
always match. If `curl` to the local port works but the site still 502s, reload
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

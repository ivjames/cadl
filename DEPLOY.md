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
PORT="$(grep -oE 'PORT=[0-9]+' .env | cut -d= -f2)"
pm2 serve /var/www/cadl/dist "$PORT" --name cadl --spa
pm2 save
```

`provision-site` seeds `/var/www/cadl/.env` with the local `PORT` it reserved
(8060+) and points the nginx vhost at it, so the `pm2 serve` port must match
that `.env` (the snippet above reads it back). Reboot survival relies on the
pm2 startup hook already installed on the droplet (`systemctl is-enabled
pm2-root` → enabled); `pm2 save` writes the dump it replays.

## Routine deploys

Once provisioned, deploying a new commit is one command on the droplet:

```bash
cadl deploy
```

That runs: `git fetch` + `reset --hard origin/main` → `npm ci` → `npm run
build` → `pm2 restart cadl` → `pm2 save`. Other operate commands:

```bash
cadl restart   # restart without rebuilding (or first-time pm2 serve)
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

## Local development

```bash
npm install
npm run dev      # vite dev server
npm run build    # production build to dist/
npm test         # vitest
```

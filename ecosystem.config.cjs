// pm2 process definition for the CADL static server on the lab980 droplet.
// The port is resolved by server.mjs from the app-dir .env (written by
// provision-site), so it always matches the nginx proxy_pass — deploy with
// `cadl deploy`, or `pm2 startOrReload ecosystem.config.cjs`.
module.exports = {
  apps: [
    {
      name: "cadl",
      script: "server.mjs",
      cwd: __dirname,
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
    },
  ],
};

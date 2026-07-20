# CADL

California Driver Learning is a browser-based 3D driver-training simulator.

## Live simulator

https://ivjames.github.io/cadl/

The live site is deployed from the compiled Vite `dist` artifact through GitHub Actions.

## Initial stack

- TypeScript
- Vite
- Babylon.js
- Vitest

## Local development

```bash
npm install
npm run dev
```

## Controls

- `W` / `Arrow Up`: accelerate
- `S` / `Arrow Down`: brake/reverse
- `A` / `Arrow Left`: steer left
- `D` / `Arrow Right`: steer right
- `C`: switch camera

The first milestone is a deterministic training vehicle and a single test intersection. Realistic vehicle physics will come later, after the rule and lesson systems are established.

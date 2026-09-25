# vite-template

GitHub template for a Vite + TypeScript browser app. Tooling matches the stack used in [kakascope](https://github.com/Ari-Kishon/kakascope): Node 24, strict TypeScript, ESLint `strictTypeChecked`, and a typecheck/lint/build CI workflow.

## Use as a GitHub template

1. Create a new GitHub repo from this template (or push this folder and enable **Template repository** in Settings).
2. Rename `name` in `package.json` and the page `<title>` in `index.html`.
3. Point Cursor at the repo; `.cursor/settings.json` enables the `ai-sweatshop` plugin from [universal-cursor-rules](https://github.com/Ari-Kishon/universal-cursor-rules) if you have that marketplace installed.

## Scripts

```bash
npm install
npm run dev        # Vite on :2222
npm run typecheck
npm run lint
npm run build      # static site → build/
npm run start      # build + preview
```

## What’s included

| Piece | Role |
|-------|------|
| `.nvmrc` / `engines.node` | Node ≥ 24 |
| `tsconfig.json` | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly` |
| `eslint.config.js` | `@eslint/js` recommended + `typescript-eslint` strict type-checked on `src/` |
| `vite.config.ts` | ES2022 build, `build/` outDir, assets under `app/` |
| `.github/workflows/ci.yml` | `npm ci` → typecheck → lint → build |
| `.cursor/settings.json` | Enable ai-sweatshop Cursor plugin |

Deploy workflows are **not** included — wire S3/CloudFront (or anything else) per project.

## Stub app

`index.html`, `styles.css`, and `src/main.ts` are a blank page so CI passes. Delete or rewrite them for the real product.

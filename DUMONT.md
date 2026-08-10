# Dumont Meet

Dumont's deployment of [LaSuite Meet](https://github.com/suitenumerique/meet) (DINUM, MIT).

- `main` tracks clean upstream. Never commit here, never push upstream.
- `dumont` holds Dumont customizations only, branched from the deployed upstream tag.

## What the `dumont` branch changes

Branding assets only, no application source is patched:

- `src/frontend/public/` favicons, apple-touch-icon, android-chrome icons, `favicon.ico`, `icon.png` — generated from `dumont_green_icon.png`
- `src/frontend/public/assets/logo.svg` — the Dumont lockup, embedded, replaces the La Suite logo in the header
- `src/frontend/public/assets/dumont-styles.css` — brand palette, loaded at runtime via `FRONTEND_CUSTOM_CSS_URL`

The app title comes from the stock build arg, not a patch:

```bash
docker build -f src/frontend/Dockerfile --target frontend-production \
  --build-arg VITE_APP_TITLE="Dumont Meet" --build-arg DOCKER_USER=1000 \
  -t dumont/meet-frontend:<upstream-tag> .
```

Keeping the diff to assets means rebasing onto a new upstream tag is a fast-forward
in practice. Do not start patching components: use the CSS file and the build arg.

## Upgrading

1. `git fetch upstream --tags && git checkout main && git merge --ff-only upstream/main`
2. Rebase `dumont` onto the new tag, rebuild the frontend image with the same build args
3. Bump the backend image to the matching tag and run `manage.py migrate`

Backend runs the stock `lasuite/meet-backend` image: its branding is entirely
env-driven (`DJANGO_EMAIL_BRAND_NAME`, `DJANGO_EMAIL_LOGO_IMG`), so there is
nothing to fork.

## Deployment

`/opt/meet` on airbase-hel1. See the `dumont-meet-deployment` note for the
LiveKit sharing constraints.

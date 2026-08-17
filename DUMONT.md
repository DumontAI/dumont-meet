# Dumont Meet

Dumont's deployment of [LaSuite Meet](https://github.com/suitenumerique/meet) (DINUM, MIT).

- `main` tracks clean upstream. Never commit here, never push upstream.
- `dumont` holds Dumont customizations only, branched from the deployed upstream tag.

## What the `dumont` branch changes

Branding assets, plus the document head. No React component is patched:

- `src/frontend/public/` favicons, apple-touch-icon, android-chrome icons, `favicon.ico`, `icon.png` — generated from `dumont_green_icon.png`
- `src/frontend/public/assets/logo.svg` — the Dumont lockup, embedded, replaces the La Suite logo in the header
- `src/frontend/public/assets/dumont-styles.css` — brand palette, loaded at runtime via `FRONTEND_CUSTOM_CSS_URL`
- `src/frontend/index.html` — Open Graph and Twitter card tags, so a pasted room link unfurls with the Dumont icon instead of a bare URL
- `src/frontend/site.webmanifest` — `name`/`short_name`. `vite.config.ts` injects the title into the copy it emits at `/site.webmanifest`, but the `<link rel="manifest">` in `index.html` makes Vite emit a *second*, untransformed copy at `/assets/site-<hash>.webmanifest`, and that hashed one is what the browser actually loads. Without a name in the source file an installed PWA has no name.

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

## Recording (COR-5)

Enabled 2026-08-17. Nothing here is in this repo: the whole thing is compose,
env and nginx under `/opt/meet`. Written down because three details are not
guessable.

**One storage endpoint, three network namespaces.** Recording needs MinIO
reachable from the Django backend and the nginx frontend (both on the `meet`
bridge) *and* from `livekit-egress` (host network). MinIO therefore runs in
host mode bound to `172.17.0.1:9100`, the docker0 address, which is the only
address all three can name. A published port does not work: `DOCKER-USER` on
this host drops all forwarded traffic except 8443, so bridge to DNAT'd port is
dead. The bridge subnet is pinned to `192.168.192.0/20` in `compose.yaml` and a
ufw rule allows that subnet to `172.17.0.1:9100`; without the pin, Docker could
hand back a different subnet and the firewall rule would silently stop matching.

**Moveezi is not affected.** Meet builds its own `S3Upload` from
`AWS_S3_*` and passes it on every egress request
(`core/recording/worker/factories.py`), so the shared `livekit-egress` keeps its
own R2 config and never had to be restarted. Do not "consolidate" the two.

**Cloudflare will leak recordings if you let it.** Downloads go through
`/media/recordings/`, where nginx asks Django for SigV4 headers via
`auth_request` and proxies to MinIO. Cloudflare caches `.mp4` by extension: the
first authorised download populated the edge and subsequent *anonymous*
requests to the same URL got a `HIT` without the origin's 401 ever being
consulted. The location sends `Cache-Control: private, no-store, max-age=0`.
Confirm `cf-cache-status: BYPASS` on any change to that block.

Finalization is a MinIO bucket notification to
`/api/v1.0/recordings/storage-hook/`, authenticated with a bearer token. Django
`SECURE_SSL_REDIRECT` 301s anything not claiming https and MinIO cannot add
headers, so that one location injects `X-Forwarded-Proto: https`. Celery is
*not* needed: `core/tasks/_task.py` runs tasks inline when it is absent.

Smoke test: an egress with no published tracks aborts with "Start signal not
received". Joining a room with camera and mic off is not enough. Publish a real
track first:

```bash
docker run -d --rm --network host --name lk-publisher \
  -e LIVEKIT_URL=ws://127.0.0.1:7880 -e LIVEKIT_API_KEY=meet \
  -e LIVEKIT_API_SECRET=<from /opt/meet/env.d/secrets> \
  livekit/livekit-cli:latest room join --identity smoke --publish-demo <room-uuid>
```

# Dumont Meet

Dumont's deployment of [LaSuite Meet](https://github.com/suitenumerique/meet) (DINUM, MIT).

- `main` tracks clean upstream. Never commit here, never push upstream.
- `dumont` holds Dumont customizations only, branched from the deployed upstream tag.

## What the `dumont` branch changes

Branding assets, the document head, a handful of React components, and one backend feature (pre-join presence, below):

- `src/frontend/public/` favicons, apple-touch-icon, android-chrome icons, `favicon.ico`, `icon.png` — generated from `dumont_green_icon.png`
- `src/frontend/public/assets/logo.svg` — the Dumont lockup, embedded, replaces the La Suite logo in the header
- `src/frontend/public/assets/dumont-styles.css` — brand palette, loaded at runtime via `FRONTEND_CUSTOM_CSS_URL`
- `src/frontend/index.html` — Open Graph and Twitter card tags, so a pasted room link unfurls with the Dumont icon instead of a bare URL
- `src/frontend/src/features/rooms/livekit/components/ScreenShareErrorModal.tsx` — drops the "for more information" link to `lasuite.crisp.help`, DINUM's French Crisp desk. The last user-visible La Suite URL. The System Preferences deep link that survives it is the actual fix, so nothing useful was lost and no Dumont help page had to be invented. The now-unused `helpLinkText`/`helpLinkLabel` locale strings are deliberately left in all four locales: inert, and cheaper than a four-file diff to conflict on at every rebase
- `src/frontend/site.webmanifest` — `name`/`short_name`. `vite.config.ts` injects the title into the copy it emits at `/site.webmanifest`, but the `<link rel="manifest">` in `index.html` makes Vite emit a *second*, untransformed copy at `/assets/site-<hash>.webmanifest`, and that hashed one is what the browser actually loads. Without a name in the source file an installed PWA has no name.

The app title comes from the stock build arg, not a patch:

```bash
docker build -f src/frontend/Dockerfile --target frontend-production \
  --build-arg VITE_APP_TITLE="Dumont Meet" --build-arg VITE_APP_WORDMARK="Meet" \
  --build-arg DOCKER_USER=1000 \
  -t dumont/meet-frontend:<upstream-tag> .
```

`VITE_APP_RECORDING_TRANSCRIPT=false` hides the transcript checkbox on the
recording panel. That checkbox sets `transcribe: true`, which makes the backend
POST the finished recording to `SUMMARY_SERVICE_ENDPOINT`. Dumont runs no
summary service, so ticking it recorded audio and delivered nothing; a French
recording on 2026-09-11 did exactly that. Live captions are the transcript
feature here. Leave the arg unset to keep upstream behaviour.

`VITE_APP_WORDMARK` draws the product name next to the logo mark, the way
"Google Meet" is set. The logo asset is the Dumont mark on its own, so without
it the header reads just "Dumont" and nothing names the product. When it is set
the `<img>` alt goes empty and the link carries `VITE_APP_TITLE` as its
accessible name, so a screen reader reads the lockup once.

A push that carries a rebase onto a new upstream tag will be **rejected over
HTTPS** for lacking `workflow` scope, because upstream's own
`.github/workflows` edits ride along. Push over SSH instead.

Keeping the diff to assets means rebasing onto a new upstream tag is a fast-forward
in practice. Prefer the CSS file and the build args over patching components; the presence feature below is the deliberate exception, because it needs backend data upstream does not expose.

### Backend: pre-join presence (Dumont builds its own backend image)

The pre-join screen shows who is already in the call ("Carlos Ferri and 2
others are in this call", with initials), polled every 10s. Stock Meet has no
API for this, so the backend is patched and is **no longer the stock image**:

- `GET /api/v1.0/rooms/{id-or-slug}/participants-preview/` (`core/api/viewsets.py`)
  returns `{"count", "participants": [{"name", "color"}], "available"}`. It is
  gated by `Room.can_join_directly` (`core/models.py`), the same condition that
  hands out the LiveKit token in `RoomSerializer`, so anyone bound for the lobby
  gets a 403 and learns nothing. Identities never leave the backend; agents,
  egress/recorders and hidden participants are filtered out
  (`core/utils.py list_participants_preview`). A room LiveKit has not created
  yet is empty; any LiveKit failure is a 200 with `available: false`.
- Frontend: `src/frontend/src/features/rooms/components/ParticipantsPreview.tsx`,
  rendered under the "Join the meeting?" heading in `Lobby.tsx`.

Build the backend from this branch, from the repo root:

```bash
docker build -f Dockerfile --target backend-production \
  --build-arg DOCKER_USER=1000 \
  -t dumont/meet-backend:<upstream-tag>-dumont .
```

Every service in `/opt/meet` that runs `lasuite/meet-backend` (the API and any
celery worker) must switch to that tag together.

## Upgrading

1. `git fetch upstream --tags && git checkout main && git merge --ff-only upstream/main`
2. Rebase `dumont` onto the new tag, rebuild the frontend and backend images with the commands above
3. Deploy the new backend image and run `manage.py migrate`

Backend branding is entirely env-driven (`DJANGO_EMAIL_BRAND_NAME`,
`DJANGO_EMAIL_LOGO_IMG`), but the backend is no longer stock: the pre-join
presence endpoint is a patch, so after a rebase rebuild the backend image with
the command above instead of bumping `lasuite/meet-backend`.

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

Finalization changed at v1.31.0. Upstream removed the S3 storage-event webhook
in v1.30 and now finalizes **only** on the LiveKit `egress_ended` webhook, so
the MinIO bucket notification is gone and LiveKit posts to
`/api/v1.0/rooms/webhooks-livekit/` instead. Django `SECURE_SSL_REDIRECT` 301s
anything not claiming https and LiveKit cannot add headers beyond its signed
token, so that one nginx location injects `X-Forwarded-Proto: https`, exactly as
the MinIO hook used to need. Celery is *not* needed: `core/tasks/_task.py` runs
tasks inline when it is absent.

**Meet uses Moveezi's LiveKit key pair, on purpose.** LiveKit signs every
webhook with a single key and each receiver verifies the JWT `iss` against its
own configured key, so two products cannot verify one signature with different
keys. hel1's LiveKit was already signing with Moveezi's `API7M3rRv8MiSxc` for
DU-442, and that hook is production, so Meet moved to the shared pair rather
than the reverse. `LIVEKIT_WEBHOOK_EVENTS_FILTER_REGEX` keeps Meet from acting
on Moveezi's rooms: Meet names LiveKit rooms after the room UUID, Moveezi names
its `survey-<taskId>`. Rotating that Moveezi credential breaks Meet recording.

**`RECORDING_DOWNLOAD_BASE_URL` has no default and is not optional.** Unset, the
"your recording is ready" email ships a link of literally `None/<uuid>`, which
is how recording looked broken for a month while the mp4s sat in MinIO. It must
be `https://meet.dumont.cloud/recording`; the frontend route is
`/recording/<uuid>`.

**An ABORTED egress wedges the room, and a cron cleans it up.** Upstream
finalizes only on `EGRESS_COMPLETE` or `EGRESS_LIMIT_REACHED`. An egress that
aborts (the usual cause: Record pressed while nobody is publishing) fires
`egress_ended`, matches neither branch, and leaves the row `ACTIVE` forever.
One active recording per room is a unique constraint, so that room then returns
"a recording is already in progress" for good. Seen in production 2026-09-11,
found on 2026-09-17. `/opt/meet/ops/reconcile_recordings.py` reconciles stale
rows against real LiveKit egress state every 15 minutes via
`/etc/cron.d/meet-reconcile-recordings`, logging to `/var/log/meet-reconcile.log`.
It writes only with `RECONCILE_APPLY=1` and is a dry run otherwise. Note a
vanished egress returns a 404 from LiveKit, which the script treats as gone for
good rather than as a transient error: treating it as transient is what leaves
the row wedged.

**A finished recording does not stop at `saved`.** It advances to
`notification_succeeded` once the owner has been emailed, so anything filtering
on `saved` alone lists nothing. A `HEAD` on `/media/recordings/<id>.mp4` returns
403 even for the owner because Django signs the SigV4 headers for GET; that is
not a fault, `GET` returns 200/206.

The stock `transcript` recording mode is hidden here. It is an audio-only egress
whose output is POSTed to `SUMMARY_SERVICE_ENDPOINT`, a LaSuite Docs stack
Dumont does not run, so choosing it recorded audio and delivered nothing.
`RECORDING_WORKER_CLASSES` is pinned to `screen_recording` alone. Live captions
below are the transcript feature on this deployment.

Smoke test: an egress with no published tracks aborts with "Start signal not
received". Joining a room with camera and mic off is not enough. Publish a real
track first:

```bash
docker run -d --rm --network host --name lk-publisher \
  -e LIVEKIT_URL=ws://127.0.0.1:7880 -e LIVEKIT_API_KEY=meet \
  -e LIVEKIT_API_SECRET=<from /opt/meet/env.d/secrets> \
  livekit/livekit-cli:latest room join --identity smoke --publish-demo <room-uuid>
```

## Live captions

The transcriber agent (`src/agents/multi_user_transcriber.py`) is a separate
LiveKit worker: one process, one job per room, one `AgentSession` per
participant. It is not part of the backend or frontend images.

Its container needs `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`
(same credentials as egress, LiveKit is shared with two other products),
`TRANSCRIBER_AGENT_NAME`, `STT_PROVIDER=groq` and `GROQ_API_KEY`. The backend
needs `ROOM_SUBTITLE_ENABLED=True` and `ROOM_SUBTITLE_AGENT_NAME`.

**The two agent names are one string in two places.** Dispatch is explicit:
`core/services/subtitle.py` calls `create_dispatch(agent_name=ROOM_SUBTITLE_AGENT_NAME)`
and the worker only receives jobs for the name it registered as. Both default to
`multi-user-transcriber`, so set neither or set both. A mismatch is silent: the
API returns 200, the dispatch is created, no worker ever claims it, and the
caption button in the UI does nothing forever.

**Groq, because the alternatives do not exist on this host.** `deepgram` needs a
Deepgram key that Dumont does not have. `kyutai` and `voxtral-vllm` both need a
GPU, and hel1 has integrated AMD graphics. Groq serves
`whisper-large-v3-turbo` on an OpenAI-compatible `/audio/transcriptions` route
with a key already in the vault (`hel1: enzo`, `GROQ_API_KEY`). Overridable with
`GROQ_STT_MODEL` and `GROQ_STT_LANGUAGE`; the language is a single ISO-639-1
code, Deepgram's `multi` is not a thing Whisper accepts.

`livekit-plugins-openai` 1.6.7 has no `with_groq` helper (only `with_azure` and
`with_ovhcloud`), so the branch points `openai.STT` at
`https://api.groq.com/openai/v1` and passes `api_key` explicitly. Without the
explicit key the plugin falls back to `OPENAI_API_KEY` and quietly talks to the
wrong provider. Adding that plugin also pinned `websockets` down from 17.1 to
15.0.1: `openai[realtime]` caps it below 16. `voxtral_vllm_stt.py` is the only
websockets user here and only touches the new asyncio client, which is unchanged
since 14.0.

**Captions arrive per utterance, not per word.** Groq's endpoint transcribes
discrete audio segments, so the plugin advertises `streaming=False` and
`Agent.default.stt_node` wraps it in a VAD-driven `stt.StreamAdapter`. Silero
buffers the whole utterance, waits out 0.55s of silence, then makes one HTTP
round trip: roughly a second of lag after the speaker stops, and no interim
results at all. Deepgram would stream partials in a few hundred ms. That is the
price of not having a key or a GPU, and it is fine for a caption track nobody
reads while they are talking.

The VAD is loaded once per worker process in `prewarm()` and reused by every
session, so a joining participant costs no model load. `ENABLE_SILERO_VAD=false`
is therefore not compatible with `STT_PROVIDER=groq`: with no session VAD the
stream adapter cannot be built and `stt_node` raises on the first frame.

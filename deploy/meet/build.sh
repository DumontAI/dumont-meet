#!/usr/bin/env bash
# Build the three Dumont Meet images from this checkout.
#
# Run this ON the host that runs the images (airbase-hel1), from a checkout or a
# copy of this branch, because compose pulls them from the local image store and
# there is no registry in front. The images are version-tagged; the compose file
# at /opt/meet/compose.yaml is what pins which tag runs.
#
# Usage:
#   deploy/meet/build.sh v1.33.0-dumont-1
#
# Then, on hel1:
#   cd /opt/meet && sudo docker compose up -d backend frontend transcriber
#   cd /opt/meet && sudo docker compose run --rm --no-deps backend python manage.py migrate
#
# The build args are not cosmetic: VITE_APP_TITLE / VITE_APP_WORDMARK set the
# header lockup and VITE_APP_RECORDING_TRANSCRIPT=false hides the transcript
# checkbox (Dumont runs no summary service). See DUMONT.md.
set -euo pipefail

TAG="${1:?usage: deploy/meet/build.sh <tag>}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "==> dumont/meet-backend:$TAG"
DOCKER_BUILDKIT=1 docker build -f Dockerfile --target backend-production \
  --build-arg DOCKER_USER=1000 \
  -t "dumont/meet-backend:$TAG" .

echo "==> dumont/meet-frontend:$TAG"
DOCKER_BUILDKIT=1 docker build -f src/frontend/Dockerfile --target frontend-production \
  --build-arg VITE_APP_TITLE="Dumont Meet" \
  --build-arg VITE_APP_WORDMARK="Meet" \
  --build-arg VITE_APP_RECORDING_TRANSCRIPT=false \
  --build-arg DOCKER_USER=1000 \
  -t "dumont/meet-frontend:$TAG" .

echo "==> dumont/meet-transcriber:$TAG"
DOCKER_BUILDKIT=1 docker build -f src/agents/Dockerfile --target production \
  -t "dumont/meet-transcriber:$TAG" src/agents

cat <<EOF

Built:
  dumont/meet-backend:$TAG
  dumont/meet-frontend:$TAG
  dumont/meet-transcriber:$TAG

Deploy on hel1:
  sudo sed -i -e 's#dumont/meet-backend:.*#dumont/meet-backend:$TAG#' \\
              -e 's#dumont/meet-frontend:.*#dumont/meet-frontend:$TAG#' \\
              -e 's#dumont/meet-transcriber:.*#dumont/meet-transcriber:$TAG#' /opt/meet/compose.yaml
  cd /opt/meet && sudo docker compose up -d backend frontend transcriber
  sudo docker compose run --rm --no-deps backend python manage.py migrate
EOF


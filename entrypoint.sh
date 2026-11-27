#!/bin/sh
# 컨테이너 시작 스크립트: PUID/PGID 사용자로 웹 서버를 실행한다.
set -e

PUID="${PUID:-0}"
PGID="${PGID:-0}"
umask "${UMASK:-022}"

mkdir -p "$BAIDUPCS_GO_CONFIG_DIR" "$DOWNLOAD_DIR" "$UPLOAD_DIR"
export HOME="$BAIDUPCS_GO_CONFIG_DIR/home"
mkdir -p "$HOME"

echo "baidupcs-webui $(cat /app/VERSION 2>/dev/null) 시작: 포트 ${WEB_PORT:-8777}, 사용자 ${PUID}:${PGID}"
echo "  설정    : $BAIDUPCS_GO_CONFIG_DIR"
echo "  다운로드: $DOWNLOAD_DIR ${HOST_DOWNLOAD_DIR:+(NAS: $HOST_DOWNLOAD_DIR)}"
echo "  업로드  : $UPLOAD_DIR ${HOST_UPLOAD_DIR:+(NAS: $HOST_UPLOAD_DIR)}"
[ -z "$WEB_PASSWORD" ] && echo "[주의] WEB_PASSWORD 가 비어 있어 누구나 웹 UI 에 접속할 수 있습니다."
[ "$WEB_PASSWORD" = "change-this-password" ] && echo "[주의] WEB_PASSWORD 가 예시 값 그대로입니다. docker-compose.yml 에서 바꾸세요."

cd /app

if [ "$PUID" != "0" ]; then
  chown -R "$PUID:$PGID" "$BAIDUPCS_GO_CONFIG_DIR" 2>/dev/null || true
  for d in "$DOWNLOAD_DIR" "$UPLOAD_DIR"; do
    # docker 가 새로 만든(root 소유) 폴더만 소유자를 바꾼다. 기존 NAS 폴더 권한은 건드리지 않음.
    if [ "$(stat -c %u "$d")" = "0" ]; then chown "$PUID:$PGID" "$d" 2>/dev/null || true; fi
    if ! setpriv --reuid="$PUID" --regid="$PGID" --clear-groups test -w "$d"; then
      echo "[경고] ${PUID}:${PGID} 사용자가 $d 에 쓸 수 없습니다."
      echo "       DSM 제어판 > 공유 폴더 권한 또는 docker-compose.yml 의 PUID/PGID 를 확인하세요."
    fi
  done
  exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups \
    python -m uvicorn app.main:app --host 0.0.0.0 --port "${WEB_PORT:-8777}" --proxy-headers
fi

exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${WEB_PORT:-8777}" --proxy-headers

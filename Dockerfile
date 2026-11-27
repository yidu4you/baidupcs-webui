# BaiduPCS-Go Web UI — https://github.com/yidu4you/baidupcs-webui
FROM python:3.12-slim-bookworm

ARG PCS_VERSION=v4.0.2
ARG APP_VERSION=0.0.1

LABEL org.opencontainers.image.title="baidupcs-webui" \
      org.opencontainers.image.description="Web UI for BaiduPCS-Go (Synology DSM friendly)" \
      org.opencontainers.image.source="https://github.com/yidu4you/baidupcs-webui" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.licenses="MIT"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    LANG=C.UTF-8 \
    TZ=Asia/Seoul \
    PCS_BIN=/usr/local/bin/BaiduPCS-Go \
    BAIDUPCS_GO_CONFIG_DIR=/config \
    DOWNLOAD_DIR=/downloads \
    UPLOAD_DIR=/uploads \
    WEB_PORT=8777

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl unzip tzdata \
 && rm -rf /var/lib/apt/lists/*

# 동봉된 바이너리(bin/)를 우선 사용하고, 없는 아키텍처면 GitHub 릴리즈에서 받는다.
COPY bin/ /tmp/pcsbin/
RUN set -eux; \
    case "$(uname -m)" in \
      x86_64)  arch=amd64 ;; \
      aarch64|arm64) arch=arm64 ;; \
      armv7l|armv6l) arch=arm ;; \
      i386|i686) arch=386 ;; \
      *) echo "지원하지 않는 아키텍처: $(uname -m)"; exit 1 ;; \
    esac; \
    if [ -f "/tmp/pcsbin/BaiduPCS-Go-linux-${arch}" ]; then \
      install -m 0755 "/tmp/pcsbin/BaiduPCS-Go-linux-${arch}" "$PCS_BIN"; \
    else \
      curl -fsSL -o /tmp/pcs.zip "https://github.com/qjfoidnh/BaiduPCS-Go/releases/download/${PCS_VERSION}/BaiduPCS-Go-${PCS_VERSION}-linux-${arch}.zip"; \
      mkdir -p /tmp/pcs && unzip -q /tmp/pcs.zip -d /tmp/pcs; \
      install -m 0755 /tmp/pcs/*/BaiduPCS-Go "$PCS_BIN"; \
      rm -rf /tmp/pcs /tmp/pcs.zip; \
    fi; \
    rm -rf /tmp/pcsbin; \
    BAIDUPCS_GO_CONFIG_DIR=/tmp/pcscheck "$PCS_BIN" --version; rm -rf /tmp/pcscheck; \
    command -v setpriv; command -v setsid

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY static ./static
COPY VERSION ./VERSION
COPY entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

EXPOSE 8777
VOLUME ["/config", "/downloads", "/uploads"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/api/health' % os.environ.get('WEB_PORT','8777'), timeout=4)" || exit 1

ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]

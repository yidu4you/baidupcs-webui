# Third-party notices

이 프로젝트(baidupcs-webui) 자체는 [MIT License](LICENSE)를 따릅니다.
아래 구성 요소는 각자의 라이선스를 따릅니다.

## 저장소에 포함된 것

| 구성 요소 | 버전 | 라이선스 | 위치 |
|---|---|---|---|
| [xterm.js](https://github.com/xtermjs/xterm.js) (`@xterm/xterm`) | 5.5.0 | MIT | `static/vendor/xterm.js`, `xterm.css` — 고지: `static/vendor/LICENSE.xterm.txt` |
| [@xterm/addon-fit](https://github.com/xtermjs/xterm.js) | 0.10.0 | MIT | `static/vendor/addon-fit.js` — 고지: `static/vendor/LICENSE.xterm-addon-fit.txt` |

## 빌드·실행 시 받아오는 것 (저장소에 포함하지 않음)

| 구성 요소 | 버전 | 라이선스 | 받는 방법 |
|---|---|---|---|
| [BaiduPCS-Go](https://github.com/qjfoidnh/BaiduPCS-Go) | v4.0.2 | Apache License 2.0 | Docker 빌드 때 GitHub 릴리즈에서 내려받아 별도 실행 파일로 실행 |
| [FastAPI](https://github.com/fastapi/fastapi) | 0.115.6 | MIT | pip |
| [Uvicorn](https://github.com/encode/uvicorn) | 0.32.1 | BSD-3-Clause | pip |
| [python-multipart](https://github.com/Kludex/python-multipart) | 0.0.20 | Apache License 2.0 | pip |
| [IBM Plex Sans KR / IBM Plex Mono](https://github.com/IBM/plex) | - | SIL Open Font License 1.1 | 브라우저가 Google Fonts 에서 불러옴 |

BaiduPCS-Go 는 이 프로젝트와 별개의 프로그램이며, 이 웹 UI 는 그 명령줄을 실행해 결과를 보여줍니다.
`bin/` 폴더에 BaiduPCS-Go 바이너리를 직접 넣어 배포할 경우, 원 프로젝트의 LICENSE 파일을 함께 넣어 주세요
(Apache License 2.0 제4조).

## 상표

Baidu, 百度网盘 은 Baidu, Inc. 의 상표입니다. 이 프로젝트는 Baidu 및 BaiduPCS-Go 원 저작자와 관련이 없는 비공식 도구입니다.

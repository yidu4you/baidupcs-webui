# bin/

이 폴더는 비어 있어도 됩니다. Docker 빌드 때 BaiduPCS-Go 를 GitHub 릴리즈에서 내려받습니다.

GitHub 에 접속할 수 없는 환경에서 빌드하려면, 아래 이름으로 바이너리를 넣어 두면 그 파일을 씁니다.

- `BaiduPCS-Go-linux-amd64` (Intel/AMD — 대부분의 Synology Plus 모델)
- `BaiduPCS-Go-linux-arm64` (ARM64)

바이너리는 <https://github.com/qjfoidnh/BaiduPCS-Go/releases> 의 `BaiduPCS-Go-v4.0.2-linux-*.zip` 에 들어 있습니다.
배포할 때는 원 프로젝트의 LICENSE(Apache-2.0)도 함께 넣어 주세요. 이 폴더의 바이너리는 git 에 커밋되지 않습니다.

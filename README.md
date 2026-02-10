# Vaddict Auto Updater

매일 오전 9시(GMT+9)에 자동으로 Sound Voltex 플레이 데이터를 수집하여 [Vaddict](https://vaddict.b35.jp/)를 갱신하는 봇입니다. GitHub Actions를 통해 실행됩니다.

## 기능

- **자동 로그인**: Konami 사이트의 로그인 쿠키(`M573SSID`)를 사용하여 캡챠 없이 접속합니다.
- **데이터 수집**: 프로필 및 곡 데이터를 자동으로 수집합니다.
- **자동 갱신**: 수집된 데이터를 Vaddict로 전송하고 등록을 완료합니다.
- **스케줄링**: 매일 오전 9시(한국 시간 기준)에 자동으로 실행됩니다.

## 설정 방법

이 프로젝트를 자신의 GitHub 저장소로 복사(Fork)하거나 코드를 업로드한 후, 다음 설정을 진행해주세요.

### 1. `M573SSID` 쿠키 값 구하기

봇이 Sound Voltex 공식 홈페이지에 로그인하기 위해서는 사용자의 세션 쿠키가 필요합니다.

1. 웹 브라우저에서 [SOUND VOLTEX 공식 홈페이지](https://p.eagate.573.jp/game/sdvx/vii/playdata/profile/index.html)에 접속하여 로그인합니다.
2. `F12`를 눌러 개발자 도구를 엽니다.
3. **Application** (또는 Storage) 탭으로 이동합니다.
4. 좌측 메뉴의 **Cookies** -> `https://p.eagate.573.jp`를 선택합니다.
5. 이름이 `M573SSID`인 쿠키를 찾아 **Value** 값을 복사합니다.

### 2. GitHub Secrets 등록

1. GitHub 저장소의 **Settings** 탭으로 이동합니다.
2. 좌측 메뉴에서 **Secrets and variables** -> **Actions**를 선택합니다.
3. **New repository secret** 버튼을 클릭합니다.
4. 정보를 입력하고 저장합니다:
   - **Name**: `M573SSID`
   - **Secret**: (위에서 복사한 쿠키 값)

## 실행 방법

### 자동 실행
설정이 완료되면 매일 오전 9시에 자동으로 실행됩니다.

### 수동 실행
1. **Actions** 탭으로 이동합니다.
2. **Daily Vaddict Update** 워크플로우를 선택합니다.
3. **Run workflow** 버튼을 클릭하여 즉시 실행할 수 있습니다.

## 주의사항

- **e-amusement 베이직 코스**: Sound Voltex 공식 홈페이지의 데이터 열람 기능을 사용하므로, 베이직 코스 가입이 필요합니다.
- **쿠키 만료**: `M573SSID` 쿠키는 일정 시간이 지나거나 다른 브라우저에서 로그아웃하면 만료될 수 있습니다. 봇 작동이 실패하면 쿠키를 새로 갱신해주세요.

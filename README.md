# AsungOrgChart — Teams 조직도 앱 프론트엔드

## 0. Info

- 작성일 : 2026-01-15
- 수정일 : 2026-10-29
- 작성자 : 박여명 주임
- 내용 : Teams 조직도 탭 앱 프론트엔드(React/Vite) 개발 문서. 구조·실행·테스트·화면 동작·필터·캐시 정리

---

## 1. 먼저 알아둘 것 (주의사항)

| 항목 | 내용 |
|---|---|
| `.env`는 로컬 전용 | 프로젝트 루트 `.env`는 git에 안 올라간다. 로컬 브라우저 테스트용 값만 넣는다 (→ 4.1). 운영 서버에는 두지 않는다. |
| 운영 주소 | 백엔드 주소는 `src/Tab/config.ts`의 `API_BASE_URL`에 있다. `.env`가 없으면(운영) 이 주소를 쓴다. |
| Teams 밖에서는 멈춤 | 일반 브라우저에서 `app.initialize()`(teams-js)는 끝나지 않는다. 로컬 테스트는 반드시 4.1의 Mock 모드로 한다. |
| git 제외 | `src/Tab/TempData/*.ts`(더미 데이터), `.env`, `node_modules`, `dist`, `build`, `.localConfigs`, `env/.env.*` |
| 컬럼 추가·삭제 | 임직원 목록 컬럼은 `OrgChart.tsx` 상단 `GRID_COLUMNS` 배열 하나로 관리한다 (→ 6). 다른 곳은 손대지 않는다. |
| 데이터가 안 바뀔 때 | 조직도 데이터는 브라우저에 12시간 캐시된다 (→ 8). 서버 데이터를 바꿨는데 화면이 그대로면 `localStorage.clear()` 후 새로고침. |

---

## 2. 프로젝트 개요

기존 외부 솔루션 조직도 앱을 대체하려고 자체 개발한 Microsoft Teams 탭 앱이다. 조직도 트리, 임직원 목록, 접속 상태(Presence), 즐겨찾기, 통화·채팅·모임 바로가기를 제공한다.

데이터와 인증은 백엔드(`AsungOrgChartServer`)가 담당한다. 프론트는 Teams SSO 토큰을 받아 백엔드에 넘기고, 백엔드가 DB 조회와 Graph API 호출을 한다. 백엔드 구조는 `AsungOrgChartServer/README.md`를 본다.

### 2.1 기술 스택

| 구분 | 내용 | 버전 (package.json) |
|---|---|---|
| 프레임워크 | React | ^18.3.1 |
| 언어 | TypeScript | ^5.4.5 |
| 빌드 | Vite | ^6.2.0 |
| UI | @fluentui/react-components, @fluentui/react-icons | ^9.72.10 |
| Teams | @microsoft/teams-js | ^2.48.0 |
| Teams 개발 도구 | Microsoft 365 Agents Toolkit (구 Teams Toolkit) | `m365agents.yml` |

### 2.2 용어

| 용어 | 뜻 |
|---|---|
| SSO 토큰 | Teams가 발급하는 사용자 토큰. `Authorization: Bearer`로 백엔드에 보낸다 |
| Presence | Teams 접속 상태(대화 가능·다른 용무 중 등). 아바타 옆 색 점 |
| viewMode | 임직원 목록이 무엇을 보여주는지. `BROWSE`(부서 선택) / `SEARCH`(검색 결과) / `FAVORITES`(즐겨찾기) |
| 사번(empId) | 즐겨찾기 식별 키. 백엔드가 주는 `id`(EMPLOYEENUMBER)를 프론트에서 `empId`로 옮겨 쓴다 |
| Mock 모드 | `.env`에 `VITE_USE_MOCK=true`. Teams 없이 일반 브라우저에서 로컬 백엔드에 붙는 모드 |

---

## 3. 폴더 구조 (`src/Tab`)

| 경로 | 역할 | git |
|---|---|---|
| `client.tsx` | 진입점. `App` 렌더링 | O |
| `App.tsx` | Teams 초기화 후 PC/모바일 화면 분기 (`clientType`이 android/ios/iPadOS면 모바일) | O |
| `OrgChart.tsx` | PC 화면. 트리 + 임직원 목록 + 선택 패널 + 상세 팝업. 컬럼 정의·필터 포함 | O |
| `MobileOrgChart.tsx` | 모바일 화면. 트리와 직원을 한 목록으로 표시 | O |
| `config.ts` | 백엔드 주소, Mock 모드 플래그 | O |
| `types.ts` | `Employee`, `OrgData`, `OrgTreeNode`, `UserPresence`, Presence 색 표 | O |
| `components/OrgTree.tsx` | 조직도 트리 (회사 선택, 검색, 재귀 렌더링) | O |
| `components/StatusAvatar.tsx` | 사진 + Presence 점 아바타 | O |
| `components/PresenceBadge.tsx` | Presence 배지 | O |
| `components/Toast.tsx`, `Spinner.tsx` | 알림, 로딩 | O |
| `hooks/useTeamsAuth.ts` | SSO 토큰·로그인 이메일 획득. Mock 모드 분기 | O |
| `hooks/useOrgChartData.ts` | `/api/orgChartData` 호출 + 12시간 캐시 + 필드 보정 | O |
| `hooks/useUserPresence.ts` | `/api/users/presence` 호출 | O |
| `hooks/useFavorites.ts` | `/api/favorites` 조회·등록·해제 | O |
| `utils/authFetch.ts` | fetch 래퍼. 401이면 SSO 토큰 재발급 후 1회 재시도 | O |
| `utils/orgTreeUtils.ts` | 트리 생성, 하위·상위 부서 ID 수집, 인원수 집계, 트리 검색 | O |
| `utils/storageUtils.ts` | localStorage 캐시 (`setCache`/`getCache`, 기본 만료 12시간) | O |
| `constants/theme.ts` | 색·둥글기·그림자. `brandColor` 하나로 파생 | O |
| `TempData/` | 프로토타입 때 쓰던 더미 데이터. 지금은 사용 안 함 | X |

---

## 4. 실행·테스트

### 4.1 로컬 브라우저 테스트 (Mock 모드)

Teams에 올리지 않고 일반 브라우저에서 확인하는 방법이다. 백엔드도 로컬에서 Mock 모드로 띄운다.

준비 (최초 1회)

1. 프론트 루트에 `.env` 파일을 만든다 (git 제외됨).
   ```
   VITE_USE_MOCK=true
   VITE_MOCK_USER_EMAIL=본인이메일@daiso.co.kr
   ```
   이메일은 백엔드 더미 데이터(`AsungOrgChartServer/data/empDummyData.ts`)에 있는 사람이어야 본인 부서가 기본 선택된다.
2. 백엔드 `.env`에 `USE_MOCK_DB=true`, `PORT=3000`이 있는지 확인한다.

실행

```cmd
:: 터미널 1 — 백엔드
cd C:\dev\teams\AsungOrgChartServer
npm run dev

:: 터미널 2 — 프론트
cd C:\dev\teams\AsungOrgChart
npm start
```

브라우저에서 `http://localhost:53000`.

Mock 모드에서 달라지는 것

| 항목 | 동작 |
|---|---|
| Teams SDK | 부르지 않는다. `app.initialize()`·SSO 생략 |
| 토큰 | `VITE_MOCK_USER_EMAIL` 값을 그대로 토큰 자리에 보낸다. 백엔드 Mock 모드가 이걸 받아 통과시킨다 |
| 백엔드 주소 | `http://localhost:3000` |
| 데이터 | 백엔드 더미 데이터 |
| Presence | 전원 "대화 가능" |
| 사진 | 전부 빈 아바타(이니셜) |
| 통화·채팅·모임 | Teams 딥링크가 새 탭으로 열린다 |
| 화면 | PC 화면만. 모바일 화면은 Teams 모바일에서만 분기된다 |

`.env`는 `npm start` 시작할 때 읽는다. 파일을 고치면 프론트를 껐다 켠다.

운영 빌드(`npm run build`)에는 Mock 모드가 들어가지 않는다. `config.ts`의 `IS_MOCK`이 `import.meta.env.DEV`(개발 서버에서만 true)로 묶여 있어서, PC에 `.env`가 있어도 빌드 결과물은 운영 주소를 쓴다.

### 4.2 Teams에서 테스트 (기존 방식)

Teams 안에서의 SSO·Presence·딥링크 동작은 Mock 모드로 볼 수 없다. 이건 Microsoft 365 Agents Toolkit(구 Teams Toolkit)으로 빌드해 Teams 테스트 앱으로 올려서 확인한다. 관련 파일은 `m365agents.yml`, `m365agents.local.yml`, `appPackage/`, `aad.manifest.json`이다.

평소 기능 확인은 4.1로 하고, Teams 연동 부분을 건드렸을 때만 이 방법을 쓴다.

### 4.3 빌드·운영 반영

```cmd
git pull
npm run build
```

`dist/`에 빌드 결과가 생기고, IIS가 이 폴더를 `/new/*`로 서빙한다. 별도 복사 없이 빌드만 하면 반영된다. IIS 설정은 `AsungOrgChartServer/docs/operations-guide.md`를 본다.

---

## 5. 화면 구조와 상태

PC 화면은 3단이다. 왼쪽 조직도 트리(폭 조절 가능), 오른쪽 위 임직원 목록, 오른쪽 아래 선택된 대화상대 패널.

### 5.1 viewMode

| 값 | 언제 | 임직원 목록 내용 |
|---|---|---|
| `BROWSE` | 트리에서 부서 클릭 | 그 부서 + 하위 부서 전원 |
| `SEARCH` | 검색 실행 | 검색 조건에 맞는 사람 |
| `FAVORITES` | "즐겨찾는 멤버" 클릭 | 내 즐겨찾기 |

### 5.2 부서 클릭 → 임직원 목록

1. 트리 노드 클릭 → `handleOrgSelect` → `selectedOrgId` 설정.
2. `updateEmployeeList(orgId)`가 `getAllDescendantIds`로 하위 부서 ID를 모두 모은다.
3. 전체 직원 중 그 부서들에 속한 사람만 `users`에 넣는다.

### 5.3 직원 클릭 → 트리 자동 펼침

1. 행 클릭 → `handleRowClick` → 상세 팝업 열림.
2. 그 직원의 `orgId`를 `selectedOrgId`로 설정하고, `getAllAncestorIds`로 상위 부서를 모두 `expandedIds`에 추가한다.
3. `OrgTree`가 `selectedOrgId` 변화를 보고 해당 노드(`id="org-node-{orgId}"`)로 `scrollIntoView` 한다.

### 5.4 선택 패널 동기화

체크된 직원은 `checkedIds`(Set) 하나로만 관리한다. 아래 패널은 자기 상태를 따로 두지 않고 `checkedIds`를 돌며 전체 직원에서 찾아 그린다. 그래서 부서를 바꾸거나 검색해도 이미 체크한 사람은 유지된다.

---

## 6. 임직원 목록 그리드

### 6.1 컬럼 정의 (`GRID_COLUMNS`)

`OrgChart.tsx` 상단의 배열 하나로 헤더·본문·필터를 전부 그린다.

```ts
const GRID_COLUMNS: GridColumn[] = [
  { key: "name",       label: "이름",     width: "22%", filterable: false },
  { key: "position",   label: "직위",     width: "12%", filterable: true },
  { key: "role",       label: "직책",     width: "12%", filterable: true },
  { key: "department", label: "부서명",   width: "24%", filterable: true },
  { key: "extension",  label: "내선전화", width: "15%", filterable: false },
  { key: "mobile",     label: "휴대전화", width: "15%", filterable: false },
];
```

| 필드 | 뜻 |
|---|---|
| `key` | `Employee` 필드명. 셀 값과 필터 값을 여기서 꺼낸다 |
| `label` | 헤더 표시명 |
| `width` | 열 너비 (`colgroup`). 헤더와 본문이 같은 너비를 쓴다 |
| `filterable` | true면 필터 창에 나온다. 사람마다 값이 다른 컬럼(이름·전화)은 false |

컬럼을 추가·삭제·순서 변경할 때는 이 배열만 고친다. `name` 컬럼만 별(즐겨찾기)·아바타·이름을 함께 그리는 특수 처리가 있다.

### 6.2 정렬·표시

- 헤더와 본문 모두 왼쪽 정렬, 같은 padding. 헤더 열 사이에 세로 경계선.
- 셀 내용이 길면 말줄임(…) 처리하고, 마우스를 올리면 전체 값이 뜬다.
- 전체 선택 체크박스는 화면에 보이는(필터 적용된) 목록 기준이다.

### 6.3 빈 결과

| 상황 | 표시 |
|---|---|
| 검색 결과 0명 | 목록 가운데 "검색 결과 없음" |
| 필터로 0명 | "필터 조건에 맞는 임직원 없음" |
| 모바일 검색 0명 | 트리 자리에 "검색 결과 없음" |

---

## 7. 컬럼 필터

목록 제목 오른쪽 [필터] 버튼. 현재 목록을 컬럼 값으로 한 번 더 거른다.

| 동작 | 내용 |
|---|---|
| 값 목록 | `filterable` 컬럼마다 **현재 목록**에서 중복 없이 뽑는다. 하드코딩 없음. 빈 값과 `-`는 "(없음)" 하나로 묶는다 |
| 컬럼 머리 체크박스 | 그 컬럼 값 전체 선택/해제. 일부만 선택이면 `−` 표시 |
| 여러 컬럼 | AND. 직위 "과장" + 직책 "팀장"이면 둘 다 맞는 사람만 |
| 전부 해제 | 0명 표시 (빈 결과 문구) |
| 초기화 | 모든 컬럼 필터 해제. 창은 열린 채 |
| ✕ | 창만 닫음. 필터는 유지 |
| 적용 중 표시 | 버튼에 적용 컬럼 수 배지, 해당 헤더에 깔때기 아이콘, 제목에 `표시 수 / 전체 수` |

필터가 풀리는 때: 부서 클릭, 검색 실행, 회사 변경, 즐겨찾기 탭 클릭. 목록 자체가 바뀌는 동작이면 전부 풀린다.

필터가 유지되는 때: 새로고침, 탭을 나갔다 돌아옴. 같은 목록이 복원되는 경우라 필터도 같이 복원된다 (→ 8.2). 복원된 값이 현재 목록에 하나도 없으면 그 컬럼 필터는 무시한다.

---

## 8. 데이터·인증·캐시

### 8.1 백엔드 호출

| 훅 | API | 비고 |
|---|---|---|
| `useTeamsAuth` | — | `app.initialize()` → `authentication.getAuthToken()` → `app.getContext()`로 로그인 이메일. Mock 모드면 전부 생략 |
| `useOrgChartData` | `GET /api/orgChartData` | 응답을 12시간 캐시. `position`·`role` 등 빈 값은 `-`로, `id`는 `email-orgId` UI 키로, 사번은 `empId`로 옮긴다 |
| `useUserPresence` | `POST /api/users/presence` | 화면에 보이는 사람 이메일만 보낸다. 모바일은 이미 조회한 사람 제외 |
| `useFavorites` | `GET/POST/DELETE /api/favorites` | 헤더 `x-user-empid`에 본인 사번. 사번이 없으면(HR 미등록) 즐겨찾기 사용 불가 표시 |
| (img 태그) | `GET /api/users/photo/:email` | 인증 없음. 브라우저가 12시간 캐시. 사진 없으면 1×1 투명 → 이니셜 아바타로 대체 |

모든 호출은 `authFetch`를 거친다. 401이면 SSO 토큰을 다시 받아 1회 재시도한다.

### 8.2 localStorage 캐시

| 키 | 내용 | 만료 |
|---|---|---|
| `orgChartDataCache_v1` | 조직·직원 전체 데이터 | 12시간 |
| `orgChartUserState` | UI 상태: viewMode, 회사, 선택 부서, 펼친 노드, 체크한 사람, 사이드바 폭, 검색어, **컬럼 필터** | 12시간 |

`orgChartUserState`는 상태가 바뀔 때마다 저장하고, 앱이 뜰 때 복원한다. 복원 순서: 공통 상태 → viewMode별(검색이면 검색 재실행, 즐겨찾기면 목록 재조회, 아니면 부서 재선택). 저장된 상태가 없거나 부서 ID가 데이터에 없으면 내 부서(로그인 이메일로 찾음) → 없으면 기본값 `14636` → 없으면 첫 루트 순으로 간다.

---

## 9. 모바일 화면 (`MobileOrgChart.tsx`)

| 항목 | PC | 모바일 |
|---|---|---|
| 구조 | 트리 / 목록 / 선택 패널 3단 | 트리 안에 직원이 바로 들어간 한 목록 |
| 검색 | 카테고리 선택 + 검색어, 결과를 목록에 표시 | 통합 검색, 맞는 부서만 트리에 남김 |
| 상세 | 가운데 팝업 | 아래에서 올라오는 시트 (아래로 끌어 닫기) |
| 컬럼 필터 | 있음 | 없음 |
| 선택 액션 | 아래 패널 | 화면 하단 고정 바 |

---

## 10. 성능

- `orgMap`: `orgId → OrgData` Map을 `useMemo`로 한 번 만들어 두고, 부모 찾기·부서명 조회에 `Array.find` 대신 `Map.get`을 쓴다.
- `filterTree`: 트리 검색 시 맞는 노드만 남기지 않고 상위 경로를 살려서 "회사 → 본부 → 팀" 구조가 유지된다.
- Presence는 화면에 보이는 사람만 조회한다. PC는 목록이 바뀔 때마다 다시 묻고, 모바일은 펼친 부서가 늘어날 때 새 사람만 묻는다 (`incrementalOnly`).

---

## 11. 문제 해결

| 증상 | 원인 · 조치 |
|---|---|
| 로컬에서 화면이 흰색, 요청이 안 나감 | Mock 모드가 안 켜진 것. `.env` 파일명·위치 확인 후 프론트 재시작 |
| 로컬에서 목록이 비어 있고 백엔드 호출이 없음 | 이전에 빈 응답이 캐시된 것. 콘솔에서 `localStorage.clear()` 후 새로고침 |
| 백엔드 터미널에 `더미 데이터 로드 실패` | `data/empDummyData.ts`가 `types/orgChart.ts` 타입과 안 맞아 ts-node가 못 읽는 것. 타입 또는 더미 데이터를 맞춘다 |
| "Library has not yet been initialized" | teams-js 호출 전에 `app.initialize()`가 먼저 끝나야 한다. `useTeamsAuth` 맨 앞에 있다 |
| 트리가 안 펼쳐짐 | `selectedOrgId`·회사 코드가 `orgList`에 실제로 있는지 확인. 없는 ID면 조상 탐색이 바로 끝난다 |
| 서버 데이터를 바꿨는데 화면이 그대로 | `orgChartDataCache_v1` 12시간 캐시. `localStorage.clear()` |

---

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-01-15 | 최초 작성 (프로토타입) |
| 2026-10-29 | 백엔드 연동 이후 구조로 전면 갱신. 로컬 브라우저 테스트(Mock 모드) 추가. 임직원 목록 컬럼 정의(`GRID_COLUMNS`)·컬럼 필터·빈 결과 표시·정렬 수정 반영. 캐시·모바일·문제 해결 정리 |

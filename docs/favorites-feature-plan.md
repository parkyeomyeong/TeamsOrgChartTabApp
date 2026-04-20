# 즐겨찾기 기능 Plan (초안 v0.1)

> 이 문서는 즐겨찾기 기능 도입을 위한 초기 제안서입니다.
> 결정된 사항이 아니라 **논의를 위한 출발점**이며, 질문을 하나씩 풀어가며 업데이트됩니다.

---

## 🗂 현재 논의 상태 / Open Questions

| # | 질문 | 상태 | 결정 |
|---|------|------|------|
| Q1 | 저장 위치 — 서버 vs localStorage | ✅ 결정 | **서버 DB (localStorage는 캐시)** |
| Q2 | 즐겨찾기 대상 — 사람만 vs 사람+부서 | ✅ 결정 | **사람만 (1차). 부서는 2차 검토** |
| Q3 | 즐겨찾기 진입 지점 | ✅ 결정 | **좌측 최상단 회사 선택기 옆 ⭐ 버튼 → 중앙 그리드에 즐겨찾기 인원 목록 표시** |
| Q4 | 개별 등록/해제 UI | ✅ 결정 | **(1) 그리드 행 맨 오른쪽 ⭐ 버튼 + (2) 직원 상세보기 팝업 내 ⭐ 버튼 — 하단 선택 대화상대 카드는 아님** |
| Q5 | 정렬 기준 | ✅ 결정 | **별도 정렬 없음. 서버에서 가져온 순서 그대로** |
| Q6 | 폴더/그룹 기능 1차 포함 여부 | ❓ 미결정 | - |

---

## 프로젝트 사전 파악 요약

- 데스크탑: `OrgChart.tsx` (3단 레이아웃: 트리 / 그리드 / 카드)
- 모바일: `MobileOrgChart.tsx` (단일 컬럼 + Bottom Sheet)
- 인증: Teams SSO (upn 기반)
- 백엔드: 별도 서버 (`teamsorg.daiso.co.kr`), API = `/api/orgChartData`, `/api/users/presence`, `/api/users/photo`
- 상태관리: React hooks + localStorage (12h TTL)
- UI: `@fluentui/react-components`
- 사용자 식별: `userPrincipalName` (이메일)
- emp.id = email + orgId 조합

---

## 📋 1. 기획 (UX / 사용자 경험)

### 1-1. 즐겨찾기 대상 ✅ 결정: **사람만 (1차)**

- 1차 스코프: 직원(사람)만 즐겨찾기 대상
- **부서 즐겨찾기는 1차 제외** — 실무에서 니치 수요(인사팀/임원 일부). 복잡도 대비 사용자 적음. 피드백 받고 2차 검토.
- 단, DB 스키마의 `TARGET_TYPE` 필드는 남겨둠 — 추후 부서 추가 시 테이블 변경 없이 대응 가능

### 1-2. 저장 범위 ✅ 결정: **서버 DB**

- 서버 저장 (이메일/사번 기반)
  - 회사 프로젝트 → PC/모바일 동기화 필수
  - 기기 교체, Teams 재설치 시에도 유지
  - 이미 Teams SSO로 사용자 식별 가능
- localStorage는 **캐시 레이어**로만 활용 (기존 orgChartData 패턴 재사용)

### 1-3. 유저 플로우

**즐겨찾기 등록/해제 — 두 가지 경로 모두 제공**

**경로 A. 직원 목록 그리드에서 직접 토글**
- 그리드 각 행 **맨 오른쪽**에 ⭐ 버튼 상시 노출
- 미등록(회색 별) ↔ 등록됨(황색 채워진 별) 클릭으로 즉시 토글
- 성공 시 Toast "즐겨찾기에 추가됨" / "즐겨찾기에서 제거됨"

**경로 B. 직원 상세보기 팝업에서 토글**
- 직원 그리드/트리의 행을 클릭하면 뜨는 **직원 상세보기 팝업(Modal)** 내부에 ⭐ 등록/해제 버튼 배치
- 라벨: 현재 상태에 따라 "즐겨찾기 등록" / "즐겨찾기 해제"
- 모바일도 동일하게 직원 상세 화면 내부에 동일 버튼 배치

> ⚠️ 주의: 데스크탑 하단 "선택된 대화상대 카드"는 **다중 선택 후 일괄 채팅/통화/모임용 영역**이며 즐겨찾기와 무관. 여기엔 ⭐ 토글 UI 넣지 않음.

**공통 동작**
- Optimistic UI: 클릭 즉시 상태 변경 → 서버 실패 시 롤백 + Toast 에러
- 등록/해제 결과는 즉시 `[⭐ 즐겨찾기]` 목록에 반영

**조회 (진입 지점)** ✅ 결정
- **데스크탑: 좌측 최상단 회사 선택기 영역에 ⭐ "즐겨찾기" 버튼 배치**
  - 클릭 시 중앙 직원 그리드가 **즐겨찾기 인원 목록**으로 전환
  - 다시 회사/부서 선택하면 원래 모드로 복귀
- 모바일: 상단 헤더에 동일한 ⭐ 버튼 → 탭 시 화면을 즐겨찾기 리스트로 전환

**관리**
- 정렬: 별도 정렬 UI 없음. 서버 응답 순서대로 표시
- 1차 제외: 드래그 수동 정렬, 폴더/그룹

### 1-4. 엣지 케이스

| 상황 | 동작 |
|---|---|
| 즐겨찾기한 사람이 퇴사 | 회색 + "퇴사" 뱃지, 해제 안내 |
| 부서 이동 | orgChartData 최신값 자동 반영 (email 기반이면 OK) |
| 부서 폐지 | 비활성 상태 표시, 수동 삭제 유도 |
| 오프라인 | localStorage 캐시로 조회, 변경은 큐잉 후 재시도 |

---

## 🎨 2. 디자인

### 2-1. 공통 원칙

- Fluent UI 컴포넌트 그대로 사용
- 아이콘: `StarRegular` (미등록) / `StarFilled` (등록됨)
- 색상: `tokens.colorPaletteMarigoldForeground1` 계열(황색)

### 2-2. 데스크탑 (OrgChart.tsx)

**좌측 최상단 (회사 선택기 영역):**
```
┌─────────────────────────────┐
│ [전체 ▼]  [⭐ 즐겨찾기]      │ ← 회사 필터 옆에 별 버튼
├─────────────────────────────┤
│ 📂 대성홀딩스                │
│ 📂 대성산업                  │
│ 📂 대성셀틱                  │
└─────────────────────────────┘
```
- ⭐ 버튼 클릭 → 중앙 직원 그리드가 "즐겨찾기 인원 목록"으로 전환
- 트리에서 다른 부서 클릭 → 해당 부서 인원으로 복귀 (즐겨찾기 모드 해제)
- 버튼 상태: 활성(즐겨찾기 모드 ON) / 비활성 구분 (Fluent `ToggleButton` 또는 색상 톤 차이)

**개별 등록/해제 UI (두 경로 동시 제공):**

1. **직원 그리드 맨 오른쪽 별 컬럼**
   - 기존 컬럼 [체크박스][이름][부서][직위]... 의 **맨 오른쪽에 [⭐]** 컬럼 추가
   - 모든 행에 상시 노출 (hover 불필요, 한눈에 상태 확인 가능)
   - 클릭 → 미등록 ↔ 등록 즉시 토글

2. **직원 상세보기 팝업(Modal) 내 토글 버튼**
   - 직원 행 클릭 시 뜨는 상세 팝업 안에 ⭐ 등록/해제 버튼 배치
   - 라벨: 현재 상태에 따라 "즐겨찾기 등록" / "즐겨찾기 해제"
   - 클릭 → 동일한 토글 동작

> ⚠️ 하단 "선택된 대화상대 카드"는 다중 선택자 대상 일괄 액션(채팅/통화/모임) 전용 영역. 즐겨찾기 UI는 여기에 넣지 않음.

### 2-3. 모바일 (MobileOrgChart.tsx)

**진입 지점:**
- 상단 헤더: [검색] [회사▼] [⭐ 즐겨찾기]
- ⭐ 탭 시 화면 전환 → 즐겨찾기 인원 리스트 표시

**개별 등록/해제 UI (두 경로 동시 제공):**

1. **트리 노드(직원 행) 우측에 ⭐ 버튼**
   - 모바일 단일 컬럼 리스트의 각 직원 행 우측에 별 아이콘 상시 노출
   - 탭으로 즉시 토글

2. **직원 상세 화면 내 토글 버튼**
   - 직원 행 탭 시 뜨는 상세 화면 상단 또는 정보 영역에 ⭐ 등록/해제 버튼
   - 라벨: "즐겨찾기 등록" / "즐겨찾기 해제"
   - 데스크탑의 상세 팝업과 UX 일관성 유지

### 2-4. 상태 표시

- 미등록: 회색 외곽선 별
- 등록: 황색 채워진 별 + 0.2s fade/scale 애니메이션
- 저장 중: 별에 얕은 spinner overlay

### 2-5. viewMode 상태 확장

기존 `viewMode: 'BROWSE' | 'SEARCH'` → `'BROWSE' | 'SEARCH' | 'FAVORITE'` 추가
- ⭐ 버튼 클릭 시 `setViewMode('FAVORITE')`
- 트리에서 부서 선택 시 `setViewMode('BROWSE')`로 복귀
- 검색 입력 시 `setViewMode('SEARCH')`로 전환 (기존 동작 유지)

---

## 🛠 3. 개발

### 3-1. DB 설계

```sql
CREATE TABLE TB_ORGCHART_FAVORITE (
    FAVORITE_ID     BIGINT       IDENTITY(1,1) PRIMARY KEY,
    USER_EMAIL      VARCHAR(200) NOT NULL,         -- 소유자 (Teams upn)
    TARGET_TYPE     VARCHAR(10)  NOT NULL,         -- 'EMP' | 'ORG'
    TARGET_ID       VARCHAR(100) NOT NULL,         -- EMP=email, ORG=orgId
    SORT_ORDER      INT          NOT NULL DEFAULT 0,
    CREATED_AT      DATETIME     NOT NULL DEFAULT GETDATE(),
    UPDATED_AT      DATETIME     NOT NULL DEFAULT GETDATE(),

    CONSTRAINT UK_FAVORITE UNIQUE (USER_EMAIL, TARGET_TYPE, TARGET_ID)
);

CREATE INDEX IX_FAVORITE_USER ON TB_ORGCHART_FAVORITE(USER_EMAIL);
```

**설계 근거:**
- `USER_EMAIL`을 키로 — 현재 코드가 `userPrincipalName` 기반 (사번 컬럼이 따로 있으면 교체)
- `TARGET_ID`에 FK 안 걸음 — 외부 HR 동기화 충돌 방지, 조회 시 orgChartData와 join으로 유효성 확인
- `TARGET_TYPE` 분리 — 사람/부서/향후 '회사' 확장 대응
- `UNIQUE` 제약 — 중복 등록 방지 (프론트 + DB 이중화)
- `SORT_ORDER` 미리 컬럼 확보 — 스키마 변경 비용이 더 큼

### 3-2. API 설계

기존 `/api/orgChartData` 패턴에 맞춤:

| Method | Path | Body/Query | Response |
|---|---|---|---|
| `GET` | `/api/favorites` | - | `{ items: Favorite[] }` |
| `POST` | `/api/favorites` | `{ targetType, targetId }` | `{ favoriteId, ... }` |
| `DELETE` | `/api/favorites/:id` | - | `204` |
| `DELETE` | `/api/favorites` | `?targetType=EMP&targetId=xxx` | `204` (토글용 편의 API) |

- Teams SSO 토큰 필수 (`authFetch` 그대로)
- `USER_EMAIL`은 토큰에서 서버가 추출 (클라가 못 건드림)

### 3-3. 프론트엔드 구현 전략

**신규 파일:**
```
src/Tab/
├── hooks/
│   └── useFavorites.ts         ← 핵심 훅
├── utils/
│   └── favoritesApi.ts         ← authFetch 래핑
└── components/
    └── FavoriteButton.tsx      ← 재사용 토글 버튼
```

**`useFavorites.ts` 시그니처:**
```typescript
function useFavorites(userEmail: string) {
  return {
    favorites: Set<string>,         // "EMP:email" 또는 "ORG:orgId" 키
    isFavorite: (type, id) => boolean,
    toggle: (type, id) => Promise<void>,
    loading: boolean,
  };
}
```

**캐싱 전략:**
- 초기 `/api/favorites` 1회 호출 → localStorage 12h TTL (기존 패턴 재사용)
- 토글은 optimistic → 성공 시 캐시 갱신, 실패 시 롤백 + Toast

**개발 순서 (권장):**
1. DB 테이블 + 백엔드 API 3종
2. `favoritesApi.ts` + `useFavorites` 훅
3. `FavoriteButton` 컴포넌트
4. 데스크탑 그리드 통합 → (진입 지점 확정 후 해당 UI) → 카드 패널
5. 모바일 Bottom Sheet + 헤더 토글
6. 엣지케이스 (퇴사자 회색 처리, 네트워크 실패)
7. QA: Teams 데스크탑/모바일/웹 각각

---

## 📌 변경 이력

| 날짜 | 변경 내용 |
|---|---|
| 2026-04-20 | 초안 작성 (v0.1) |
| 2026-04-20 | Q3 사용자 피드백 반영 — 트리 상단 가상 노드 방식 반려, 대안 4종(A/B/C/D) 추가 |
| 2026-04-20 | Q1 결정(서버 DB), Q2 결정(사람만), Q3에 D안 추천 정리 |
| 2026-04-20 | Q3 최종 결정 — 좌측 회사 선택기 영역에 ⭐ 버튼, 클릭 시 중앙 그리드에 즐겨찾기 목록 표시 (viewMode에 'FAVORITE' 추가) |
| 2026-04-20 | Q4 결정 — 개별 등록/해제는 그리드 행 맨 오른쪽 ⭐ 버튼 + 상세 팝업/카드 내 ⭐ 버튼 이중 제공. Q5 결정 — 정렬 없이 서버 순서대로 |
| 2026-04-20 | Q4 정정 — 하단 "선택된 대화상대 카드"는 다중 선택 일괄 액션 전용이므로 제외. 즐겨찾기 토글은 직원 상세보기 팝업(Modal) 내부에 배치 |

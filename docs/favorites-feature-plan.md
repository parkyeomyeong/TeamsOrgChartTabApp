# ⭐️ 즐겨찾기(Favorites) 기능 최종 구현 명세 및 완료 보고서

> **문서 상태**: 🚀 최종 구현 및 검증 완료 (v1.0.0)  
> **최종 수정일**: 2026-05-20  
> **관련 컴포넌트**: 데스크톱(`OrgChart.tsx`), 모바일(`MobileOrgChart.tsx`), 커스텀 훅(`useFavorites.ts`)

---

## 📂 1. 개요 (Overview)
본 문서는 아성그룹 Microsoft Teams 조직도 탭 앱 내 **"즐겨찾는 멤버(Favorites)"** 기능의 프론트엔드 및 백엔드 최종 구현 명세입니다. 
기존의 이메일(UPN) 기반 매핑의 한계(동명이인, 복수 사번, 이메일 누락 등)를 원천적으로 차단하기 위해 **인사 사번(`emp.id` / `targetEmpId`)을 유니크 키로 채택**하여 모바일과 데스크톱 환경 모두에서 무결점 연동이 가능하도록 구축되었습니다.

---

## 🛠️ 2. 시스템 아키텍처 & 데이터 흐름

### 2-1. 데이터베이스 설계 (Oracle DB)
실제 운영 및 개발 서버에 반영된 실물 물리 테이블 설계는 다음과 같으며, 트리거 없이 오라클 `DEFAULT` 값 지정을 통해 시퀀스의 `NEXTVAL`을 호출하는 심플하고 성능 지향적인 스키마를 구성했습니다.

```sql
CREATE TABLE USER_FAVORITES (
    -- 트리거 없이 DEFAULT 값으로 시퀀스의 NEXTVAL을 직접 호출
    ID            NUMBER DEFAULT SEQ_USER_FAVORITES.NEXTVAL,
    USER_EMP_ID   VARCHAR2(50) NOT NULL,            -- 로그인 유저 본인의 사번 (예: '2306051' 형태의 숫자 문자열)
    TARGET_EMP_ID VARCHAR2(50) NOT NULL,            -- 즐겨찾기 대상 사번 (예: '2306052' 형태의 숫자 문자열)
    CREATED_AT    TIMESTAMP DEFAULT SYSTIMESTAMP,
    CONSTRAINT PK_USER_FAVORITES PRIMARY KEY (ID),  
    CONSTRAINT UQ_USER_FAVORITES UNIQUE (USER_EMP_ID, TARGET_EMP_ID)
);  
```

### 2-2. 백엔드 API 규격 (Vite / Express)
모든 API는 SSO Bearer 토큰 인증(`authFetch` 래핑)을 필수로 요구합니다. 클라이언트 위조를 방지하기 위해 서버 단에서 토큰(UPN/이메일)을 해독한 후 내부적으로 **로그인한 유저 본인의 인사 사번(`USER_EMP_ID`)**으로 변환하여 안전하게 적재 및 조회합니다.

| HTTP Method | API Endpoint | Request Body / Param | Response | 설명 |
| :--- | :--- | :--- | :--- | :--- |
| **GET** | `/api/favorites` | 없음 | `FavoriteItem[]` | 로그인 유저의 즐겨찾기 리스트 조회 |
| **POST** | `/api/favorites` | `{ targetEmpId: string }` | `FavoriteItem` | 신규 사원 즐겨찾기 추가 |
| **DELETE** | `/api/favorites/:targetEmpId` | 경로 변수 (`:targetEmpId`) | `{ success: true }` | 사원 즐겨찾기 삭제 |

---

## 💎 3. 프론트엔드 핵심 구현 내용

### 3-1. 핵심 비즈니스 훅: `useFavorites.ts`
- **SSO 토큰 연동 및 자동 갱신**: Teams SSO 토큰이 만료된 경우 API 요청 실패 시 자동으로 `updateToken()`을 트리거하여 신선한 토큰으로 요청을 재시도합니다.
- **TTL 로컬 캐싱 (12시간)**: 트래픽 최소화를 위해 로컬 스토리지에 데이터를 캐싱하며, 신규 등록/해제 이벤트 발생 시 실시간으로 캐시를 갱신합니다.
- **Optimistic UI 및 정밀한 토스트 피드백**: API 응답 대기 중 화면 상의 별 아이콘 상태를 즉시 반전시키고, 요청이 실패하면 이전 상태로 롤백 및 에러 피드백을 제공합니다. 즐겨찾기 추가/삭제 성공 시 `"박여명님을 즐겨찾기에 추가했습니다."`와 같이 대상 이름이 포함된 명확한 다이얼로그를 토스트로 안내합니다.

### 3-2. 데스크톱 UI/UX (`OrgChart.tsx`, `OrgTree.styles.ts`)
- **컴팩트한 상단 고정(Sticky) 즐겨찾기 버튼**:
  - 좌측 트리 영역 스크롤 내부가 아닌, 회사 선택기 우측 상단에 고정 배치되어 스크롤을 내려도 항상 노출됩니다.
  - 여백(패딩/마진/Gap)을 최소화하여 컴팩트한 간격(`gap: 6px`, 버튼 패딩 `6px 10px`, 아이콘 `20px`)을 유지합니다.
- **다중 진입 경로**:
  - 중앙 테이블 그리드의 각 사원 행 우측 `⭐` 버튼으로 즉시 등록/해제 가능.
  - 사원 상세 정보 팝업 모달 내부 성명 옆 `⭐` 버튼으로 즉시 등록/해제 가능.
- **레이아웃 깨짐 방지**: Flex 레이아웃 구조 내에서 트리가 비정상적으로 부풀어 즐겨찾기 영역을 밀어내던 현상을 `flex: 1`, `minHeight: 0`을 통해 완벽히 방어했습니다.

### 3-3. 모바일 UI/UX (`MobileOrgChart.tsx`)
- **이중 탭 뷰 모드**: 
  - 상단 탭 메뉴(`[전체 조직도] | [즐겨찾는 멤버 (N)]`)를 도입하여 한 탭 터치로 즐겨찾기 목록을 빠른 필터 뷰로 전환할 수 있습니다.
- **정밀한 사번 기반 필터링**:
  - 모바일에서도 `selectedUser.id` 및 `emp.id`를 사용하여 상세 Bottom Sheet, 트리 노드, 즐겨찾기 탭 화면 전체에서 이메일 누락 사원에 대해서도 한 오차 없이 즐겨찾기 조작이 가능합니다.

---

## 🚨 4. 주요 트러블슈팅 및 피드백

### 4-1. UPN/이메일 기반에서 사번(EmpId) 기반으로의 대전환
- **문제점**: 초기 설계 시 UPN(이메일)을 고유식별자로 사용했으나, 그룹사 내 이메일 정보가 아직 바인딩되지 않은 임시 사원이나 아르바이트 직원, 혹은 동명이인의 경우 이메일 매핑이 비정상 동작하여 즐겨찾기 추가가 실패하거나 오작동하는 치명적 엣지 케이스가 식별되었습니다.
- **해결책**: 백엔드와 프론트엔드의 즐겨찾기 기준 고유 식별키를 전격 **사번(`emp.id` / `targetEmpId`)**으로 전환하고, `MobileOrgChart.tsx` 내의 잔존 코드까지 전수 사번 매칭으로 개편을 완료했습니다.

### 4-2. Flex Container 자식 오버플로우 현상
- **문제점**: 데스크톱 트리 컴포넌트(`OrgTree.styles.ts`)에서 `height: "100%"`를 강제 부여하여 즐겨찾기 고정 영역이 화면 하단 밖으로 밀려 스크롤 시 사라지던 렌더링 결함이 발생했습니다.
- **해결책**: CSS Flexbox 규칙을 엄격히 적용하여 `flex: 1`, `minHeight: 0`으로 높이를 자동 분배하고, 스크롤 영역은 트리 컨테이너 내부에만 생성되도록 재설정하여 사이드바 레이아웃이 항상 안정적으로 표시됩니다.

### 4-3. Azure AD 테넌트 `invalid_resource (400)` 에러
- **문제점**: SSO 로그인 요청 시 Application ID URI 매치 실패로 인한 리소스 미찾음 예외가 발생했습니다.
- **해결책**: 로컬 테스트 도메인(`api://localhost/...`)과 운영 도메인(`api://teamsorg.daiso.co.kr/...`) 설정을 클라이언트 `config.ts` 및 백엔드 서버 JWT 디코더 양쪽에 완벽히 일치시키고, 토큰 발급 갱신 주기를 정합성 있게 제어하여 토큰 갱신 이슈를 완전 해결했습니다.

---

## 📈 5. 최종 배포 전 안전 체크리스트
1. **운영 DB DDL 적용**: 오라클 DB 운영 환경에 `USER_FAVORITES` 테이블 및 `SEQ_USER_FAVORITES` 시퀀스가 정확히 생성되어 있고 테스트 인서트가 정상 작동하는지 확인합니다.
2. **백엔드 `.env` 스위칭**: 운영 배포 시 `USE_MOCK_DB=false` 설정 및 Oracle DB Connection Pool 설정이 유효한지 검증합니다.
3. **Azure Portal 구성**: Azure AD의 노출된 API(Scope)가 운영용 도메인 주소와 일치하는지 최종 대조합니다.

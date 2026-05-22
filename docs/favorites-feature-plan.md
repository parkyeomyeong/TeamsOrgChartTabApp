# 🌟 즐겨찾기 기능 최종 설계 및 연동 가이드 (v1.0 - 완결본)

이 문서는 Microsoft Teams 조직도 앱의 즐겨찾기 기능에 대한 기획, UI/UX 설계, DB 스펙, API 정의, 그리고 최종 연동 구현 사양 및 최적화 조언을 총 망라한 문서입니다.
초기 이메일 식별 방식에서 발생하던 한계를 보완하여 **사원 ID(사번, empId)** 기반으로 전면 리팩토링 및 구현 완료되었습니다.

---

## 📅 변경 이력

| 날짜 | 버전 | 변경 내용 | 작성자 / 기여 |
|---|---|---|---|
| 2026-04-20 | v0.1 | 즐겨찾기 기능 초안 (이메일 기반, localStorage/DB 하이브리드 제안) | 기획/개발팀 |
| 2026-05-22 | v1.0 | **사번(empId) 식별자 기반 전면 리팩토링 및 백엔드/프론트엔드 연동 완료**<br>- Oracle 11g 호환 DDL DDL 설계 반영<br>- HR 시스템 미등록 예외 처리(400 에러 & 고대비 경고 배너 ⚠️) 설계 반영<br>- Mock DB 모드 추가 및 운영 빌드 런타임 안정화 반영 | Antigravity (AI Co-Pilot) |

---

## 🗂 즐겨찾기 핵심 아키텍처 및 결정 사항

### Q1. 고유 식별자 설계: **사번(empId) 기반**
- **기존 문제**: SSO 토큰에서 파싱되는 UPN(이메일)은 부서 이동이나 퇴사/재입사, 영문명 변경 등에 따라 유연하지 못하고, 무엇보다 HR 사내 시스템의 핵심 마스터 키인 사번(empId)과 일치하지 않아 원천 데이터 조인 시 정합성 문제가 상시 존재함.
- **결정**: 로그인 유저(본인) 및 즐겨찾기 대상(타인) 모두 **사번(empId)**을 식별 키로 사용하도록 전면 리팩토링 완료. 

### Q2. 본인 사번 획득 실패 시 엣지 케이스 안전장치 (UX ⚠️)
- **상황**: 외부 협력업체 직원, 계약직, 신규 입사자 등 SSO 토큰 메일은 존재하나 **HR 사원 목록에 사번이 매핑되어 있지 않은 예외 케이스** 발생.
- **백엔드 예외 처리**: API 호출(조회/추가/삭제) 시 로그인한 유저의 사번 정보가 공백이거나 누락되어 있으면 `400 Bad Request` 에러와 함께 `"HR 시스템에 사원 정보가 등록되어 있지 않습니다."` 메시지를 클라이언트에 반환.
- **프론트엔드 UI 처리**: API 통신 중 400 에러를 감지하면, 전체 화면 최상단에 **고대비 경고 배너(⚠️ "HR 시스템에 사원 정보가 등록되어 있지 않아 즐겨찾기 기능을 사용할 수 없습니다. 관리자에게 문의하세요.")**를 렌더링하고, 즐겨찾기 추가/해제 이벤트를 안전하게 비활성화 및 토글 방지함.

---

## 🗄 1. 데이터베이스(DB) 설계 (Oracle 11g 규격)

한 유저가 여러 명을 즐겨찾기할 수 있는 1:N 관계이므로, `USER_EMP_ID`와 `TARGET_EMP_ID` 쌍에 대해 중복을 막는 복합 유니크 제약조건을 정의했습니다. 또한 Oracle 11g 환경에서 PK 자동 증가(Auto Increment)를 완벽히 구현하기 위해 시퀀스와 INSERT 트리거를 적용했습니다.

### 1-1. DDL SQL (최종안)
```sql
-- 1. 즐겨찾기 테이블 생성
CREATE TABLE USER_FAVORITES (
    ID              NUMBER(19, 0) NOT NULL, -- PK (시퀀스로 자동 주입)
    USER_EMP_ID     VARCHAR2(50)  NOT NULL, -- 본인 사번
    TARGET_EMP_ID   VARCHAR2(50)  NOT NULL, -- 대상자 사번
    CREATED_AT      VARCHAR2(30)  NOT NULL, -- 등록일시 (YYYY-MM-DD HH:MI:SS KST)
    CONSTRAINT PK_USER_FAVORITES PRIMARY KEY (ID),
    CONSTRAINT UQ_USER_TARGET_EMP UNIQUE (USER_EMP_ID, TARGET_EMP_ID)
);

-- 2. 자동 증가 PK를 위한 시퀀스 생성
CREATE SEQUENCE SEQ_USER_FAVORITES
START WITH 1
INCREMENT BY 1
NOCACHE
NOCYCLE;

-- 3. BEFORE INSERT 트리거 생성 (Insert 전 시퀀스 값 자동 바인딩)
CREATE OR REPLACE TRIGGER TRG_USER_FAVORITES_ID
BEFORE INSERT ON USER_FAVORITES
FOR EACH ROW
BEGIN
    IF :NEW.ID IS NULL THEN
        SELECT SEQ_USER_FAVORITES.NEXTVAL INTO :NEW.ID FROM DUAL;
    END IF;
END;
/

-- 4. 조회 성능 최적화를 위한 인덱스 생성
CREATE INDEX IX_FAVORITES_USER ON USER_FAVORITES(USER_EMP_ID);
```

---

## 🔌 2. 백엔드 API 명세 (/api/favorites)

모든 API 호출 시, Teams SSO 토큰을 검증하고 서버에서 안전하게 SSO 이메일을 파싱한 뒤, DB에서 해당 유저의 사번을 매핑하여 검증합니다.

### 2-1. API 목록 및 명세

| Method | Path | Headers/Body | Response | 비고 |
|---|---|---|---|---|
| **GET** | `/api/favorites` | Header: `x-user-empid` | `200 OK`<br>`[ { "targetEmpId": "12345", "createdAt": "2026-05-20..." }, ... ]` | 로그인 유저의 즐겨찾기 리스트 조회 |
| **POST** | `/api/favorites` | Body: `{ "targetEmpId": "12345" }`<br>Header: `x-user-empid` | `201 Created`<br>`{ "targetEmpId": "12345", "createdAt": "2026-05-20..." }` | 즐겨찾기 신규 등록 |
| **DELETE** | `/api/favorites/:targetEmpId` | Header: `x-user-empid` | `204 No Content` | 즐겨찾기 단건 해제 |

### 2-2. 주요 에러 응답 코드
- **`400 Bad Request`**: 본인 사번(`USER_EMP_ID`)이 누락되었거나 빈 값일 때 (HR 시스템 미등록 사용자 대응)
  ```json
  {
    "success": false,
    "requestId": "kz3x91a-5k9a1",
    "message": "HR 시스템에 사원 정보가 등록되어 있지 않습니다."
  }
  ```
- **`409 Conflict`**: 이미 즐겨찾기에 등록된 사원을 중복 추가하려 할 때
  ```json
  {
    "success": false,
    "requestId": "kz3x91a-5k9a1",
    "message": "이미 즐겨찾기에 등록된 사원입니다."
  }
  ```

---

## 🎨 3. 프론트엔드 연동 및 UX 시나리오

### 3-1. 신규 상태 및 뷰 모드 확장 (`viewMode`)
- `viewMode` 상태를 기존 `'BROWSE' | 'SEARCH'`에서 `'FAVORITE'`를 추가 지원하여 확장하였습니다.
- 좌측 최상단 회사 필터 우측에 ⭐ **"즐겨찾기" 토글 버튼**을 배치하여, 클릭 시 `setViewMode('FAVORITE')`로 상태가 전환되며 중앙 그리드에 즐겨찾기 인원만 필터링되어 노출됩니다.

### 3-2. 즐겨찾기 토글 2-Way UI 지원
1. **직원 그리드 테이블**: 행 맨 오른쪽에 ⭐ 컬럼 상시 노출하여 직관적으로 즉시 토글(등록: 황색 채워진 별, 미등록: 빈 회색 별)
2. **직원 상세보기 팝업**: 그리드 클릭 시 뜨는 상세 Modal 내부 우측에 "즐겨찾기 등록" / "즐겨찾기 해제" 버튼 제공.

### 3-3. 프론트엔드 훅 아키텍처 (`useFavorites.ts`)
- 백엔드 API와의 실시간 통신 및 상태 변수를 독립적으로 캡슐화.
- API 400 에러 발생 시 `isHrRegistered` 플래그를 `false`로 격리하여 최상단에 고대비 경고 배너 렌더링.
- 낙관적 업데이트(Optimistic UI)를 수행하여 클릭 즉시 별표를 토글하고, 서버 응답이 실패할 때에만 이전 상태로 롤백하고 Toast 경고 알림을 표시함.

---

## 💡 4. Antigravity의 아키텍처 & UX 개선 피드백 및 조언 (핵심)

사용자의 보다 나은 아키텍처와 제품 완성도를 위해 Antigravity가 제공하는 가감 없는 피드백하고 조언합니다.

### 💡 피드백 A. Mock 더미데이터 런타임 동적 require 로딩 구조 (반영 완료)
- **지적**: 개발용 대용량 mock 데이터인 `empDummyData.ts`, `orgDummyData.ts`가 `.gitignore`에 등록되어 운영 배포 시 소스 트리에 포함되지 않아 빌드 컴파일 단계(`tsc`)에서 파일을 못 찾아 에러가 발생하는 치명적인 취약점이 있었습니다.
- **조언 및 개선**: `server.ts`의 최상단 정적 `import`를 과감히 지우고, `USE_MOCK_DB === 'true'`일 때만 런타임에 동적으로 로드되도록 `require` 및 `try-catch` 감싸기 방식으로 리팩토링했습니다. 이로 인해 운영 배포 시 빌드 안정성이 100% 확보되었고, 로컬 개발 시에는 여전히 Mock 데이터가 원활하게 지원됩니다.

### 💡 피드백 B. Mock DB 파일 입출력 경로 동적 격리 처리 (반영 완료)
- **지적**: `mockFavorites.json`의 저장 경로 상수가 소스 코드에 하드코딩되어 있어, 실제 운영 서버 배포 시 `data/` 디렉토리가 없거나 운영 체제의 보안 쓰기 권한이 막혀 있는 상황이 발생하면 불필요한 예외나 크래시를 유발할 위험이 있었습니다.
- **조언 및 개선**: `favoritesRepository.ts` 내부의 경로 설정을 동적 구조로 고도화하여, `USE_MOCK_DB=false`인 운영 환경에서는 폴더 조회 및 입출력을 완전히 생략 및 원천 차단하도록 리팩토링했습니다. 또한 권한 차단 등의 비상 상황에 대처하도록 OS 임시 폴더(`temp/`) 폴백 장치를 추가하여 극한의 안정성을 챙겼습니다.

### 💡 피드백 C. DB 성능 최적화: Sequence 쿼리 직접 주입 (향후 권장)
- **지적**: 오라클 11g 호환을 위해 설정한 BEFORE INSERT 트리거(`TRG_USER_FAVORITES_ID`)는 데이터 입력 시 행 단위로 컴파일 오버헤드가 발생하며, 추후 디버깅 시 개발자가 파악하기 까다롭습니다.
- **조언**: 테이블 생성 후 트리거를 아예 생성하지 않고, 백엔드 repository의 insert SQL 쿼리를 아래와 같이 작성하여 시퀀스를 명시적으로 사용하는 방향이 성능과 단순함 모두에 더 유리합니다.
  ```sql
  -- 트리거 없이 시퀀스 값을 직접 바인딩하여 쿼리 전송
  INSERT INTO USER_FAVORITES (ID, USER_EMP_ID, TARGET_EMP_ID, CREATED_AT)
  VALUES (SEQ_USER_FAVORITES.NEXTVAL, :userEmpId, :targetEmpId, :createdAt)
  ```

### 💡 피드백 D. 즐겨찾기 동적 특성을 고려한 캐시 TTL(12시간) 단축 (향후 권장)
- **지적**: 현재 즐겨찾기 조회 API의 결과는 `orgChartData`(조직도)의 패턴을 그대로 차용하여 로컬스토리지에 12시간 동안 캐싱하도록 스펙이 설정되어 있습니다.
- **조언**: 조직도는 빈번히 변하지 않으나, 즐겨찾기는 "지금 PC에서 즐겨찾기한 직원이 폰(모바일)에서도 즉시 보여야 하는" 실시간 동적 데이터입니다. 12시간 캐시는 UX 동기화 문제를 유발하므로, 즐겨찾기 조회는 캐싱 주기를 아주 짧게(예: 5분) 설계하거나, **앱 로드 최초 1회는 무조건 서버에서 실시간 패치**하도록 프론트엔드 캐싱 로직을 분리 보완하는 것을 강력 권장합니다.

### 💡 피드백 E. HR 미등록 사원을 위한 임시 Fallback 지원 (향후 권장)
- **지적**: HR DB에 매핑이 안 되는 신규 입사자나 임시/계약직 사용자는 현재 ⚠️ 경고 배너와 함께 즐겨찾기 기능이 완전히 차단되어 사용이 불가능합니다.
- **조언**: 100% 차단하기보다, 사번 매핑 실패 시 로그인 토큰의 `UPN` 혹은 `Email` 값을 임시 가상 사번으로 간주하여 `USER_EMP_ID` 컬럼에 적재할 수 있도록 서버 예외를 조절한다면, HR 시스템 동기화 전의 임시 사원들도 차별 없이 즉시 즐겨찾기 혜택을 누릴 수 있습니다.

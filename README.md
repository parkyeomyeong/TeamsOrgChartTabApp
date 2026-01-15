# Teams 조직도 앱 개발문서

> **문서 버전**: v1.0 (프로토타입)  
> **작성일**: 2026-01-15  
> **목적**: 본 문서는 프로젝트의 인수인계 및 유지보수를 위해 핵심 아키텍처, 구현 로직, 최적화 기법을 기술합니다.

---

## 1. 프로젝트 환경 및 스펙

### 개요
> 기존 Teams 서드파티 앱 솔루션의 불편 사항과 비용 절감을 위해 조직도 기획 했으며 지금은 프로토타입 버전입니다.
기존 앱은 요구사항 미반영, 피드백 수용시간 오래걸림, 초기 로딩시간 오래 걸림 등 여러 불편 사항이 있었으며 이를 해결하기위해  
CSR와 유지보수에 쉬운 구조를 고민하며 프로젝트를 진행했습니다.
### 환경

| 항목 | 버전 / 상세 |
| :--- | :--- |
| **Node.js** | v22.x (Type Definitions: `@types/node` ^22.5.4) |
| **Framework** | **React v18.3.1** |
| **Language** | TypeScript v5.4.5 |
| **Build Tool** | Vite v6.2.0 |
| **Teams Toolkit** | Microsoft 365 Agents Toolkit v6.4.2 |
| **Core Libraries** | `@microsoft/teams-js` (SSO 및 Teams Client SDK) |

---

## 2. 핵심 로직 및 구조

이 애플리케이션은 **`selectedOrgId`**(현재 선택된 부서)를 중심으로 모든 컴포넌트가 유기적으로 동작하도록 설계되었습니다.

### 2.1 조직도 트리 구현 (`OrgTree.tsx`)
조직도는 데이터의 계층 구조를 시각화하기 위해 **재귀** 방식을 사용합니다.

*   **렌더링 원리**:
    *   `OrgTreeItem` 컴포넌트는 자신이 표현할 부서노드를 렌더링한 후, **자식 배열(`children`)을 순회하며 다시 자식 노드들이  (`OrgTreeItem`)로  렌더링하며** 표시 합니다.
    *   이때, 상위에서 전달받은 **`expandedIds` (Set)** 에 자신의 ID가 포함되어 있는지 확인하여, 포함된 경우에만 자식 컴포넌트들을 렌더링(DOM 출력)합니다.
    *   이를 통해 불필요한 렌더링을 막고, 펼쳐지고 접혀있는 상태를 표시할 수 있습니다.

### 2.2 조직도(왼쪽 컴포넌트) <-> 직원 목록 연동(오른쪽 상단 컴포넌트)
조직도와 직원 목록은 서로 긴밀하게 연결되어 있으며, 두 가지 흐름이 존재합니다.

#### Flow A: 조직도에서 부서 클릭 시 : 클릭 부서를 포함한 하위 모든 부서에 속한 직원목록을 표시
1.  사용자가 트리 노드를 클릭합니다.
2.  `handleSelect` 핸들러가 실행되어 상위(`OrgChart.tsx`)의 `setSelectedOrgId`를 호출합니다.
3.  **동시에** `updateEmployeeList(orgId)` 함수가 실행됩니다.
    *   이 함수는 `getAllDescendantIds` 유틸리티를 사용해 **하위 모든 부서 ID**를 재귀적으로 수집합니다.
    *   전체 직원 목록(`empList`) 중, 수집된 부서 ID에 속한 직원들만 필터링하여 우측 그리드에 표시합니다.

#### Flow B: 직원 목록에서 직원 클릭 시 : 조직도에 해당 직원의 조직이 표시되도록 최상위부터 해당 조직까지 자동으로 펼침
직원을 클릭했을 때 해당 직원의 소속 부서로 트리가 자동으로 찾아가는 기능입니다.

1.  직원 행 클릭 (`handleRowClick`)
2.  해당 직원의 `orgId`를 `selectedOrgId`로 설정합니다.
3.  **트리 자동 확장 & 포커스 (`OrgTree.tsx`의 useEffect)**:
    *   `selectedOrgId` 변경을 감지하면 `orgMap`을 사용하여 부모(조상) 노드들을 역추적합니다.
    *   찾아낸 모든 조상 ID를 `expandedIds` Set에 추가(Merge)하여 경로를 엽니다.
4.  **자동 스크롤**:
    *   각 트리 노드는 `id="org-node-{orgId}"` 속성을 가집니다.
    *   트리가 펼쳐진 직후, `document.getElementById`로 해당 요소를 찾아 `scrollIntoView({ block: 'center' })`를 호출하여 화면 중앙으로 정렬합니다.

---

## 3. 선택 패널 상태 동기화

"선택된 사용자 목록"(우측 하단 패널)과 "메인 직원 목록"(우측 상단 패널)의 체크여부 상태는 데이터 일관성을 유지하기 위해 서로간 같은 state를 공유하는 방식을 사용합니다.

*   **상태 관리 (`checkedIds`)**:
    *   `Set<string>` 자료구조로 체크된 사원 ID들만 관리합니다. 
*   **동기화 메커니즘**:
    *   직원 목록에서 체크박스를 클릭하면 `checkedIds` Set에 추가/삭제됩니다.
    *   하단 패널은 별도의 리스트 상태(State)를 가지지 않고, **`checkedIds`를 순회하며 전체 직원 목록(`empList`)에서 해당 사원 정보를 실시간으로 맵핑**하여 표시합니다.
    *   **효과**: 
        *   검색을 해서 직원 목록 화면이 바뀌거나 다른 부서로 이동하더라도, `checkedIds`에 남아있는(이미 선택한) 사원은 **체크 상태가 유지**되며 하단 패널에서도 사라지지 않습니다.

---

## 4. 성능 최적화

### 4.1 `Map` 인덱싱
*   **배경**: 트리 확장 시 부모 찾기, 또는 직원 목록 렌더링 시 부서명 조회(`find`)가 반복되면 데이터 양 증가 시 성능 저하가 발생합니다.
*   **해결**: `OrgChart.tsx` 초기화 시 `useMemo`를 통해 **`orgId`를 Key로 하는 `Map` 객체(`orgMap`)**를 생성합니다.
*   **적용**: 모든 조회 로직에서 `Array.find()`(O(N)) 대신 `Map.get()`(O(1))을 사용하여 조회 성능을 획기적으로 개선했습니다.

### 4.2 부서명 검색 시 결과 경로 유지
*   `filterTree` 함수는 단순히 검색어에 매칭된 노드만 반환하지 않고, **Bottom-up** 방식으로 부모 노드까지 살려둡니다.
*   이를 통해 검색 결과가 뜬금없이 나타나는 것이 아니라, **"최상위 회사 -> 본부 -> 팀"**으로 이어지는 계층 구조가 유지된 상태로 표시됩니다.

---

## 5. 향후 로드맵 및 백엔드 연동 계획

현재 버전은 Frontend 단독으로 동작하는 프로토타입이며, 실제 배포를 위해서는 백엔드 연동이 필수적입니다.  
현재 프로토타입으로 개발됐기 때문에 데이터는 TempData에 포함시켜 가져오며 이는 .gitignore에 포함되어 있습니다.

### 5.1 SSO 및 Graph API 연동
현재 코드는 접속 사용자의 인증을 확인하는 SSO 까지 개발 된 상태입니다.
원래는 접속한 사용자의 인증토큰에서 사용자 정보(이름, 부서, Email, id 등)를 가져와 초기 화면을 그리는 데이터로 활용할 계획이지만
우선 시뮬레이션을 위해 하드코딩된 값(`targetOrgId="14636"`)을 사용하고 있습니다. 정식 배포 시 다음 단계로 고도화해야 합니다.

1.  **Backend Server 구축**: Teams 앱의 SSO 토큰을 검증하고, On-Behalf-Of (OBO) 흐름을 처리할 서버가 필요합니다. 
(MS공식 방침 참조 [링크](https://learn.microsoft.com/ko-kr/microsoftteams/platform/tabs/how-to/authentication/tab-sso-overview#best-practices) ["Use server-side code for Microsoft Graph calls" 부분 참조])


2.  **API 연동 수정**:
    *   `useTeamsAuth`에서 프론트엔드 토큰 획득 -> 백엔드로 전송.
    *   백엔드: OBO Flow로 Graph API Access Token 획득 -> MS Graph API 호출 (사용자 Profile, Presence, Photo).
    *   `OrgChart.tsx`의 초기화 로직(`useEffect`)을 백엔드 API 응답값을 사용하도록 교체합니다.

---
## 6. 추가 참조 (문제 해결)

*   **"Library has not yet been initialized" 에러**:
    *   Teams SDK 호출 전 반드시 `app.initialize()`가 선행되어야 함을 보장해야 합니다. 현재 `useTeamsAuth` 훅 내부 최상단에 배치되어 있습니다.
*   **트리가 안 펼쳐짐**:
    *   `initialCompanyCode` 또는 `selectedOrgId`가 `orgList` 데이터에 실제로 존재하는지 확인하십시오. 존재하지 않는 ID면 `while` 루프가 즉시 종료되어 아무것도 펼쳐지지 않습니다.

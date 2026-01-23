import React, { useState, useMemo, useEffect, useContext, useCallback, useRef, CSSProperties } from "react";
import { app } from "@microsoft/teams-js";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
// import { TeamsFxContext } from "../Context"; // 현재 사용하지 않음 (필요 시 주석 해제)
import { AvatarWithStatus } from "./components/StatusAvatar";
import { OrgTreeView } from "./components/OrgTree";
import { Toast } from "./components/Toast";
import { Spinner } from "./components/Spinner";
import { useOrgChartData } from "./hooks/useOrgChartData"; // API Hook
import { Employee, OrgData, OrgTreeNode } from "./types"; // 공통 타입
import { getAllDescendantIds, buildOrgTree, calculateTotalCounts, getAllAncestorIds } from "./utils/orgTreeUtils";
import { getCache, setCache } from "./utils/storageUtils"; // 캐시 유틸리티 import
import { theme } from "./constants/theme";
// 이미지 에셋 임포트
import copyIcon from "../assets/copy.png";
import { useUserPresence } from "./hooks/useUserPresence"; // Presence Hook
import { PresenceBadge } from "./components/PresenceBadge"; // Badge Component
import { useTeamsAuth } from "./hooks/useTeamsAuth";

/**
 * OrgChart 컴포넌트 메인
 * - 3단 레이아웃 구조: [트리 영역] - [그리드 영역] - [선택된 사용자 목록 패널]
 */
export default function OrgChart() {
  // const { themeString } = useContext(TeamsFxContext);

  // SSO 토큰 (1회성 호출)
  const { token, currentUserEmail, isAuthLoading } = useTeamsAuth();

  // --- API 데이터 조회 ---
  const { data, isLoading: isApiLoading } = useOrgChartData(token); // 맨 처음 SSO 인증 + 조직정보 + 직원정보 가져오는 출발 훅 
  const orgList = data?.orgList || [];
  const empList = data?.empList || [];

  // --- State 관리 영역 ---

  // 0. View Mode (BROWSE | SEARCH)
  const [viewMode, setViewMode] = useState<'BROWSE' | 'SEARCH'>('BROWSE');

  // 1. 중앙 그리드에 표시될 사용자 목록
  const [users, setUsers] = useState<Employee[]>([]);

  // 1.1 현재 표시된 사용자의 이메일 목록 추출 (Presence 조회를 위해)
  // [변수명 변경] userEmails -> gridUserEmails
  const gridUserEmails = useMemo(() => users.map(u => u.email).filter(Boolean), [users]);

  // --- 커스텀 훅 (Custom Hooks) ---
  // Presence Hook 사용
  const { presenceMap } = useUserPresence(gridUserEmails, token);
  const userPhotos: { [email: string]: string } = {}; // 나중에 구현 예정

  // 2. 팝업(상세 정보)에 표시할 선택된 사용자
  const [selectedUser, setSelectedUser] = useState<Employee | null>(null);

  // 3. 현재 왼쪽 트리에서 선택된 조직(부서) 정보
  const [currentOrg, setCurrentOrg] = useState<OrgData | null>(null);

  // 트리 데이터 State (인원수 계산을 위해 필요)
  const [treeData, setTreeData] = useState<OrgTreeNode[]>([]);

  // 4. 선택된 Org ID 관리
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");

  // [새로운] OrgTree에서 상태 끌어올리기 (State Lifted)
  const [companyCode, setCompanyCode] = useState("AD");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // 트리 검색 상태
  const [treeSearchTerm, setTreeSearchTerm] = useState("");
  const [treeSearchCategory, setTreeSearchCategory] = useState("user");
  const [activeTreeSearchTerm, setActiveTreeSearchTerm] = useState("");

  // 그리드 검색 상태 (검색 결과 복원용)
  const [gridSearchTerm, setGridSearchTerm] = useState("");
  const [gridSearchCategory, setGridSearchCategory] = useState("user");


  // 4. 중앙 그리드에서 체크박스로 선택된 사용자의 ID 집합 (-> 우측 패널로 이동됨)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  // 5. 우측 패널 내부에서 '선택 삭제' 등을 수행하기 위해 체크된 ID 집합
  const [rightPanelCheckedIds, setRightPanelCheckedIds] = useState<Set<string>>(new Set());

  // 6. 사이드바 크기 조절 상태
  const [sidebarWidth, setSidebarWidth] = useState(320); // 기본 너비 220px
  const [isResizing, setIsResizing] = useState(false);

  // 7. 검색 모드 상태 (viewMode로 대체될 예정이나 하위 호환을 위해 유지하거나 viewMode derived로 변경)
  const isSearchMode = viewMode === 'SEARCH';

  // 8. Toast 상태
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 9. Bottom Panel 자동 스크롤을 위한 Ref
  const bottomPanelRef = useRef<HTMLDivElement>(null);

  // 10. 로딩 상태 (내부 처리용 + API 로딩 + 인증 로딩)
  const [isProcessing, setIsProcessing] = useState(false);
  const isLoading = isApiLoading || isProcessing || isAuthLoading;

  // 11. 컨테이너 간 정확한 리사이즈 계산을 위해 메인 컨테이너 Ref
  const containerRef = useRef<HTMLDivElement>(null);

  // --- 메모이제이션 (Memos) ---

  // orgList 검색 성능을 위해 Map으로 변환 (O(1) Lookup)
  const orgMap = useMemo(() => {
    return new Map(orgList.map(org => [org.orgId, org]));
  }, [orgList]); // orgList 변경 시 재계산

  // 부서별 인원수 계산 (Bottom-up Recursive Aggregation)
  const memberCountMapForOrgTree = useMemo(() => {
    if (!orgList.length || !empList.length) return new Map<string, number>();

    // 1. 직속 직원 수 계산 (Direct Counts)
    const directCounts = new Map<string, number>();
    empList.forEach((emp: Employee) => {
      const current = directCounts.get(emp.orgId) || 0;
      directCounts.set(emp.orgId, current + 1);
    });

    // 2. 트리 구조를 순회하며 하위 부서 인원 누적
    if (treeData.length > 0) {
      return calculateTotalCounts(treeData, directCounts);
    }
    return new Map<string, number>();
  }, [treeData, empList, orgList]); // 데이터 변경 시 재계산

  // --- 헬퍼 함수 (Helper Functions) ---

  // 부서 선택 시 해당 부서 및 하위 부서의 모든 임직원 목록 가져오기
  const updateEmployeeList = (orgId: string) => {
    // 선택된 부서 및 하위 부서의 모든 ID 수집
    const targetIds = getAllDescendantIds(orgId, orgList);

    // 해당 ID 목록에 포함된 부서의 직원만 필터링
    const filtered = empList
      .filter((emp) => targetIds.has(emp.orgId))
      .map((emp) => ({
        ...emp, // 이미 API에서 Employee 형태로 받아왔다고 가정
        orgFullName: orgMap.get(emp.orgId)?.orgFullName || "-",
        companyName: emp.companyName || (emp.orgId.startsWith("AD") ? "아성다이소" : "아성"), // 회사명 폴백 로직 필요 시 유지
      }));
    setUsers(filtered);
  };

  // --- 이펙트 (Effects) ---

  // 1. API 데이터 로드 후 초기화 및 상태 복원 (State Restoration)
  useEffect(() => {
    if (!isLoading && data) {
      // 초기 트리 구성 (메모리 내 트리 구조용)
      const tree = buildOrgTree(orgList);
      setTreeData(tree);

      // --- 상태 복원 로직 ---
      const savedState = getCache<any>("orgChartUserState");
      let restored = false;

      if (savedState) {
        try {



          // 1. 공통 상태 복원
          if (savedState.companyCode) setCompanyCode(savedState.companyCode);
          if (savedState.expandedIds) setExpandedIds(new Set(savedState.expandedIds));
          if (savedState.sidebarWidth) setSidebarWidth(savedState.sidebarWidth);
          if (savedState.checkedIds) setCheckedIds(new Set(savedState.checkedIds));

          // 트리 검색 상태
          if (savedState.treeSearch) {
            setTreeSearchTerm(savedState.treeSearch.term || "");
            setTreeSearchCategory(savedState.treeSearch.category || "user");
            setActiveTreeSearchTerm(savedState.treeSearch.activeTerm || "");
          }

          // 2. 모드별 복원
          if (savedState.viewMode === 'SEARCH') {
            // 검색 모드 복원
            setViewMode('SEARCH');
            const sTerm = savedState.search?.term || "";
            const sCat = savedState.search?.category || "user";

            setGridSearchTerm(sTerm);
            setGridSearchCategory(sCat);

            // Trigger Search immediately
            if (sTerm) {
              // Duplicate Search Logic (Should be extracted but doing inline for now to access closures)
              const lowerTerm = sTerm.toLowerCase();
              const filtered = empList.filter((emp: Employee) => {
                let value = "";
                switch (sCat) {
                  case 'user': value = emp.name; break;
                  case 'extension': value = emp.extension; break;
                  case 'mobile': value = emp.mobile; break;
                  case 'position': value = emp.position; break;
                  case 'jobTitle': value = emp.role; break;
                  default: return false;
                }
                return value && String(value).toLowerCase().includes(lowerTerm);
              });
              setUsers(filtered);
            }
            restored = true;

          } else {
            // 탐색(BROWSE) 모드 복원 (기본값)
            setViewMode('BROWSE');
            const targetOrgId = savedState.selectedOrgId;

            // Validate OrgId
            if (targetOrgId && orgMap.has(targetOrgId)) {
              setSelectedOrgId(targetOrgId);
              const orgInfo = orgMap.get(targetOrgId);
              if (orgInfo) setCurrentOrg(orgInfo);
              updateEmployeeList(targetOrgId);
              restored = true;
            }
          }

        } catch (e) { console.error("Failed to restore state", e); }
      }

      // 대체 로직: 복원되지 않았을 경우 (첫 로드 또는 캐시 무효), 기본값 설정
      if (!restored) {
        // [수정] '내 조직' 우선 선택 로직
        let defaultOrgId = "14636"; // 기본값 (인사총무팀)

        // 1. 로그인한 사용자 찾기
        if (currentUserEmail) {
          const me = empList.find(e => e.email.toLowerCase() === currentUserEmail.toLowerCase());
          if (me && orgMap.has(me.orgId)) {
            defaultOrgId = me.orgId;
            // 회사 코드도 내 회사로 변경
            const myOrg = orgMap.get(me.orgId);
            if (myOrg && myOrg.companyCode) {
              setCompanyCode(myOrg.companyCode);
            } else if (me.companyName) {
              if (me.companyName.includes("아성다이소")) setCompanyCode("AD");
              else if (me.companyName.includes("HMP")) setCompanyCode("AH");
              else if (me.companyName === "아성") setCompanyCode("AS");
            }
          }
        }

        if (orgMap.has(defaultOrgId)) {
          setSelectedOrgId(defaultOrgId);
          updateEmployeeList(defaultOrgId);
          const orgInfo = orgMap.get(defaultOrgId);
          if (orgInfo) setCurrentOrg(orgInfo);

          // [수정] 선택된 부서의 상위 경로 모두 펼치기 (getAllAncestorIds 사용)
          const ancestors = getAllAncestorIds(defaultOrgId, orgList);
          setExpandedIds(ancestors);

        } else if (tree.length > 0) {
          const rootId = tree[0].orgId;
          setSelectedOrgId(rootId);
          updateEmployeeList(rootId);
          setCurrentOrg(tree[0]);

          // 루트 노드 확장
          setExpandedIds(new Set([rootId]));
        }
      }

    }
  }, [data, isLoading, currentUserEmail]); // currentUserEmail dependency 추가

  // 2. 상태 저장 (Save State on Change)
  useEffect(() => {
    //로딩중이거나 데이터 없으면 캐시 저장 X
    if (isLoading || !data) return;

    const stateToSave = {
      viewMode,
      companyCode,
      selectedOrgId,
      expandedIds: Array.from(expandedIds),
      checkedIds: Array.from(checkedIds),
      sidebarWidth,
      search: {
        term: gridSearchTerm,
        category: gridSearchCategory
      },
      treeSearch: {
        term: treeSearchTerm,
        category: treeSearchCategory,
        activeTerm: activeTreeSearchTerm
      },
      timestamp: Date.now()
    };

    // [수정] setCache 사용
    setCache("orgChartUserState", stateToSave);

    console.log("캐시 저장됨", stateToSave);

  }, [viewMode, companyCode, selectedOrgId, expandedIds, checkedIds, sidebarWidth, gridSearchTerm, gridSearchCategory, treeSearchTerm, treeSearchCategory, activeTreeSearchTerm, isLoading, data]);

  // 3. 사이드바 리사이징 이벤트 리스너 (Existing Logic)
  const resizeStart = useRef<{ x: number, w: number }>({ x: 0, w: 0 });

  const startResizing = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    resizeStart.current = { x: e.clientX, w: sidebarWidth };
  }, [sidebarWidth]);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (mouseMoveEvent: MouseEvent) => {
      if (isResizing) {
        const delta = mouseMoveEvent.clientX - resizeStart.current.x;
        const newWidth = Math.min(400, Math.max(220, resizeStart.current.w + delta));
        setSidebarWidth(newWidth);
      }
    },
    [isResizing]
  );

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, resize, stopResizing]);

  // 4. 선택된 대화상대 추가 시 오른쪽으로 자동 스크롤 (Existing Logic)
  const prevCheckedSize = useRef(0);
  useEffect(() => {
    if (checkedIds.size > prevCheckedSize.current) {
      // 추가된 경우: 오른쪽 끝으로 스크롤
      if (bottomPanelRef.current) {
        bottomPanelRef.current.scrollTo({ left: bottomPanelRef.current.scrollWidth, behavior: "smooth" });
      }
    }
    prevCheckedSize.current = checkedIds.size;
  }, [checkedIds]);


  // --- 이벤트 핸들러 (Event Handlers) ---

  // 5. 왼쪽 트리에서 조직 선택 시 해당 조직의 직원 목록을 가져오며 로딩 스피너 표시
  const handleOrgSelect = (org: OrgData) => {
    setIsProcessing(true);

    setCurrentOrg(org);
    setSelectedOrgId(org.orgId);

    // 탐색 모드로 전환
    setViewMode('BROWSE');

    console.log("선택된 부서:", org);
    updateEmployeeList(org.orgId);

    setIsProcessing(false);
  };

  // 회사 변경 핸들러
  const handleCompanyChange = (code: string) => {
    setCompanyCode(code);

    // 회사 변경 시 해당 회사의 루트 노드들을 기본적으로 펼침
    const relevantTree = buildOrgTree(orgList, code === 'ALL' ? undefined : code);
    const rootIds = relevantTree.map(node => node.orgId);
    setExpandedIds(new Set(rootIds));

    // 선택 초기화
    setSelectedOrgId("");
    setCurrentOrg(null);
    setUsers([]); // 그리드 초기화
  };

  const handleSearch = (category: string, term: string) => {
    // 검색 상태 저장
    setGridSearchTerm(term);
    setGridSearchCategory(category);

    if (!term) {
      // 검색어가 비어있으면 탐색 모드로 복귀
      if (selectedOrgId) {
        setViewMode('BROWSE');
        updateEmployeeList(selectedOrgId);
        const orgInfo = orgList.find(o => o.orgId === selectedOrgId);
        if (orgInfo) setCurrentOrg(orgInfo);
      } else {
        setUsers([]);
        setCurrentOrg(null);
      }
      return;
    }

    const lowerTerm = term.toLowerCase();

    setIsProcessing(true);

    // 검색 로직
    const filtered = empList.filter((emp: Employee) => {
      let value = "";
      switch (category) {
        case 'user': value = emp.name; break;
        case 'extension': value = emp.extension; break;
        case 'mobile': value = emp.mobile; break;
        case 'position': value = emp.position; break;
        case 'jobTitle': value = emp.role; break;
        default: return false;
      }
      return value && String(value).toLowerCase().includes(lowerTerm);
    });

    setUsers(filtered);
    setCurrentOrg(null);

    // 검색 모드로 전환
    setViewMode('SEARCH');

    setIsProcessing(false);
  };

  const isAllCheckedGrid = users.length > 0 && users.every(u => checkedIds.has(u.id));

  const toggleAllGrid = () => {
    const newSet = new Set(checkedIds);
    if (isAllCheckedGrid) {
      // 이미 현재 목록이 모두 선택된 상태라면 -> 현재 목록만 선택 해제
      users.forEach(u => newSet.delete(u.id));
    } else {
      // 하나라도 선택 안 된 게 있다면 -> 현재 목록 모두 추가 (기존 선택 유지)
      users.forEach(u => newSet.add(u.id));
    }
    setCheckedIds(newSet);
  };

  const toggleCheckGrid = (id: string) => {
    const newSet = new Set(checkedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
      if (rightPanelCheckedIds.has(id)) {
        const newRightSet = new Set(rightPanelCheckedIds);
        newRightSet.delete(id);
        setRightPanelCheckedIds(newRightSet);
      }
    } else {
      newSet.add(id);
    }
    setCheckedIds(newSet);
  };

  const isCheckedGrid = (id: string) => checkedIds.has(id);

  const toggleCheckRightPanel = (id: string) => {
    const newSet = new Set(rightPanelCheckedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setRightPanelCheckedIds(newSet);
  };

  const deleteSelectedRightPanel = () => {
    const newCheckedIds = new Set(checkedIds);
    rightPanelCheckedIds.forEach(id => {
      newCheckedIds.delete(id);
    });
    setCheckedIds(newCheckedIds);
    setRightPanelCheckedIds(new Set());
  };

  const isCheckedRight = (id: string) => rightPanelCheckedIds.has(id);

  const handleRowClick = (emp: Employee) => {
    setSelectedUser(emp);
    // 해당 사용자의 소속 부서를 트리에 반영 (전체 접고 해당 경로만 펼침)
    setSelectedOrgId(emp.orgId);
  };

  const openDeepLink = (type: 'chat' | 'call' | 'meeting' | 'mail', targetUsers?: string[]) => {
    if (!targetUsers || targetUsers.length === 0) {
      setToastMessage("선택된 사용자가 없습니다.");
      return;
    }
    const rawUserString = targetUsers.join(',');

    let url = "";
    switch (type) {
      case 'chat':
        url = `https://teams.microsoft.com/l/chat/0/0?users=${rawUserString}`;
        break;
      case 'call':
        url = `https://teams.microsoft.com/l/call/0/0?users=${rawUserString}`;
        break;
      case 'meeting':
        url = `https://teams.microsoft.com/l/meeting/new?attendees=${rawUserString}`;
        break;
      case 'mail':
        window.location.href = `mailto:${rawUserString}`;
        return;
    }

    if (url) {
      app.openLink(url).catch(() => {
        window.open(url, '_blank');
      });
    }
  };

  const handleCopy = (text: string) => {
    if (!text || text === "-") return;
    navigator.clipboard.writeText(text).then(() => {
      setToastMessage(`"${text}" 내용을 복사했습니다.`);
    }).catch(err => {
      console.error("복사 실패:", err);
    });
  };

  const getCheckedEmployees = () => {
    // checkedIds(Set)의 순서(추가된 순서)를 보장하기 위해
    // empList를 필터링하는 대신 checkedIds를 순회하며 데이터를 찾습니다.
    return Array.from(checkedIds)
      .map(id => empList.find((emp: Employee) => emp.id === id))
      .filter((emp): emp is Employee => !!emp);
  };

  return (
    <FluentProvider theme={webLightTheme} style={{ display: "flex", height: "100vh", backgroundColor: theme.colors.bgMain }}>
      <div
        ref={containerRef}
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          fontFamily: "Segoe UI, sans-serif",
          overflow: "hidden",
          userSelect: isResizing ? "none" : "auto",
          cursor: isResizing ? "col-resize" : "auto"
        }}
      >
        {/* 스크롤바 커스텀 스타일 주입 */}
        <style>{`
          ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
          }
          ::-webkit-scrollbar-thumb {
            background: #c8c6c4; 
            border-radius: 4px;
          }
          ::-webkit-scrollbar-thumb:hover {
            background: #888; 
          }
          ::-webkit-scrollbar-track {
            background: #f3f2f1; 
          }
        `}</style>

        {/* 1. Left Sidebar (조직도 트리 영역) - Resizable */}
        <div
          style={{
            width: `${sidebarWidth}px`,
            minWidth: "220px",
            maxWidth: "400px",
            backgroundColor: theme.colors.bgWhite,
            // borderRight: `1px solid ${theme.colors.border}`, // 핸들로 대체
            display: "flex",
            flexDirection: "column",
            padding: "16px",
            // overflowY: "hidden", // OrgTree 내부 스크롤 사용
            flexShrink: 0,
          }}
        >
          <h2 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "16px", color: theme.colors.textMain, whiteSpace: "nowrap" }}>
            조직도
          </h2>

          <div style={{ flex: 1, overflow: "auto" }}>
            {/* OrgTreeView 컴포넌트를 사용하여 조직 계층 구조 표시 */}
            {/* OrgTreeView 컴포넌트를 사용하여 조직 계층 구조 표시 */}
            <OrgTreeView
              onSelectOrg={handleOrgSelect}
              selectedOrgId={selectedOrgId}
              onSearch={handleSearch}
              memberCounts={memberCountMapForOrgTree} // 인원수 Map 전달
              orgList={orgList} // 데이터 전달

              // [새로운] 끌어올려진 상태 Props
              companyCode={companyCode}
              onCompanyChange={handleCompanyChange}
              expandedIds={expandedIds}
              onExpandChange={setExpandedIds}
              searchTerm={treeSearchTerm}
              onSearchTermChange={setTreeSearchTerm}
              searchCategory={treeSearchCategory}
              onSearchCategoryChange={setTreeSearchCategory}
              activeSearchTerm={activeTreeSearchTerm}
              onActiveSearchTermChange={setActiveTreeSearchTerm}
            />
          </div>
        </div>

        {/* Resizer Handle (드래그 핸들) */}
        <div
          onMouseDown={startResizing}
          style={{
            width: "5px",
            height: "100%",
            cursor: "col-resize",
            backgroundColor: isResizing ? theme.colors.primary : theme.colors.border,
            zIndex: 10,
            transition: "background-color 0.2s",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#c8c6c4"}
          onMouseLeave={(e) => !isResizing && (e.currentTarget.style.backgroundColor = "#edebe9")}
        />

        {/* 2. Right Container (Grid + Bottom Panel) */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* 2-1. Center Content (사용자 목록 그리드 영역) - 상단 80% */}
          <div style={{ flex: 4, padding: "10px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "15px", color: theme.colors.textMain }}>
              {isSearchMode ? "검색 결과" : (currentOrg ? currentOrg.orgName : "전체 조직")} <span style={{ color: theme.colors.primary }}>{users.length}</span>
            </h2>

            <div style={{ backgroundColor: theme.colors.bgWhite, boxShadow: theme.shadow.default, borderRadius: theme.radius.small, overflow: "hidden", display: "flex", flexDirection: "column", flex: 1, position: "relative" }}>
              {/* 로딩 스피너 */}
              {isLoading && <Spinner />}

              <div style={{ flex: 1, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
                    <tr style={{ borderBottom: "1px solid #edebe9", backgroundColor: "#f3f2f1", textAlign: "left" }}>
                      <th style={{ ...thStyle, width: "40px", textAlign: "center", verticalAlign: "middle" }}>
                        <input
                          type="checkbox"
                          checked={isAllCheckedGrid}
                          onChange={toggleAllGrid}
                          style={{ cursor: "pointer", transform: "scale(1.5)", margin: "0" }}
                        />
                      </th>
                      <th style={thStyle}>이름</th>
                      <th style={thStyle}>직위</th>
                      <th style={thStyle}>직책</th>
                      <th style={thStyle}>부서명</th>
                      <th style={thStyle}>내선전화</th>
                      <th style={thStyle}>휴대전화</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((emp) => (
                      <tr
                        key={emp.id}
                        onClick={() => handleRowClick(emp)}
                        style={{ borderBottom: "1px solid #edebe9", backgroundColor: "white", cursor: "pointer" }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#faf9f8"}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "white"}
                      >
                        <td style={{ textAlign: "center", padding: "10px", verticalAlign: "middle" }} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isCheckedGrid(emp.id)}
                            onChange={() => toggleCheckGrid(emp.id)}
                            style={{ cursor: "pointer", transform: "scale(1.5)", margin: "0" }}
                          />
                        </td>
                        <td style={{ ...tdStyle, display: "flex", alignItems: "center", gap: "12px" }}>
                          <AvatarWithStatus name={emp.name} photoUrl={userPhotos[emp.email]} status={presenceMap[emp.email]} size={32} />
                          {emp.name}
                        </td>
                        <td style={tdStyle}>{emp.position}</td>
                        <td style={tdStyle}>{emp.role}</td>
                        <td style={tdStyle}>{emp.department}</td>
                        <td style={tdStyle}>{emp.extension}</td>
                        <td style={tdStyle}>{emp.mobile}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 2-2. Bottom Panel (선택된 대화상대 패널) - 하단 20% */}
          <div style={{
            flex: 1,
            backgroundColor: theme.colors.bgWhite,
            borderTop: `1px solid ${theme.colors.border}`,
            padding: "15px",
            display: "flex",
            flexDirection: "column",
            minHeight: "150px" // 최소 높이 확보
          }}>

            {/* 패널 헤더 */}
            <div style={{ marginBottom: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "16px", fontWeight: "bold", color: "#323130" }}>
                  선택된 대화상대 <span style={{ color: "#6264A7" }}>{checkedIds.size}명</span>
                </span>
                {rightPanelCheckedIds.size > 0 && (
                  <button
                    onClick={deleteSelectedRightPanel}
                    style={{ border: "none", background: "none", color: "#d13438", fontSize: "12px", cursor: "pointer", fontWeight: "600" }}
                  >
                    선택 삭제 ({rightPanelCheckedIds.size})
                  </button>
                )}
              </div>

              <div style={{ display: "flex", gap: "5px" }}>
                <IconButton onClick={() => openDeepLink('call', getCheckedEmployees().map(e => e.email))} icon="📞" text="통화" color={theme.colors.primary} />
                <IconButton onClick={() => openDeepLink('chat', getCheckedEmployees().map(e => e.email))} icon="💬" text="채팅" color={theme.colors.primary} />
                <IconButton onClick={() => openDeepLink('meeting', getCheckedEmployees().map(e => e.email))} icon="📅" text="모임" color={theme.colors.primary} />
                {checkedIds.size > 0 && (
                  <button
                    onClick={() => setCheckedIds(new Set())}
                    style={{ border: `1px solid ${theme.colors.danger}`, background: "white", color: theme.colors.danger, borderRadius: "4px", padding: "4px 8px", fontSize: "12px", cursor: "pointer", marginLeft: "10px" }}
                  >
                    전체 삭제
                  </button>
                )}
              </div>
            </div>

            {/* 가로 스크롤 카드 영역 */}
            <div
              ref={bottomPanelRef}
              style={{
                flex: 1,
                display: "flex",
                gap: "10px",
                overflowX: "auto",
                paddingBottom: "5px",
                alignItems: "flex-start"
              }}>
              {checkedIds.size === 0 ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#605e5c", fontSize: "13px" }}>
                  선택된 사용자가 없습니다. 목록에서 체크박스를 선택하세요.
                </div>
              ) : (
                getCheckedEmployees().map(emp => (
                  <div key={emp.id} style={{
                    minWidth: "160px",
                    padding: "8px",
                    border: isCheckedRight(emp.id) ? "1px solid #6264A7" : "1px solid #edebe9", // 선택 시 테두리 강조
                    backgroundColor: isCheckedRight(emp.id) ? "#f3f2f1" : "white",
                    borderRadius: "4px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
                    position: "relative",
                    cursor: "pointer"
                  }}
                    onClick={() => toggleCheckRightPanel(emp.id)} // 카드 클릭 시 선택 토글
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {/* 체크박스 추가 */}
                      <input
                        type="checkbox"
                        checked={isCheckedRight(emp.id)}
                        onChange={(e) => { e.stopPropagation(); toggleCheckRightPanel(emp.id); }}
                        style={{ cursor: "pointer" }}
                      />
                      <AvatarWithStatus name={emp.name} photoUrl={userPhotos[emp.email]} status={presenceMap[emp.email]} size={24} />
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: "bold", fontSize: "13px", color: "#323130" }}>{emp.name}</div>
                        <div style={{ fontSize: "11px", color: "#605e5c" }}>{emp.position}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: "11px", color: "#605e5c", marginTop: "auto", paddingLeft: "4px" }}>
                      {emp.department}
                    </div>
                    {/* 개별 삭제 버튼 ('X') */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleCheckGrid(emp.id); }}
                      style={{ position: "absolute", top: "2px", right: "2px", border: "none", background: "none", cursor: "pointer", color: "#a19f9d", fontSize: "14px" }}
                    >
                      ✕
                    </button>
                  </div>
                )))}
            </div>
          </div>
          {/* End of Bottom Panel */}
        </div>
        {/* End of Right Container */}

        {/* 4. 사용자 상세 정보 팝업 (Modal) */}
        {selectedUser && (
          <div style={overlayStyle}>
            <div style={popupStyle}>
              <button onClick={() => setSelectedUser(null)} style={closeBtnStyle}>✕</button>
              {/* padding: 30px, flex layout with centered vertical alignment */}
              <div style={{ padding: "30px", display: "flex", gap: "20px", alignItems: "center" }}>
                {/* 프로필 사진 (크게) - 중앙 정렬 */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: "130px" }}>
                  <AvatarWithStatus
                    name={selectedUser.name}
                    photoUrl={userPhotos[selectedUser.email]}
                    status={presenceMap[selectedUser.email]}
                    size={96} // Fluent UI Standard Size
                    hideBadge={true} // 팝업에서는 아바타 옆 배지 숨김
                  />
                  {/* 팝업에서는 상태 텍스트도 표시 (하단) */}
                  <div style={{ marginTop: "12px" }}>
                    <PresenceBadge status={presenceMap[selectedUser.email]} showText={true} />
                  </div>
                </div>
                {/* 정보 텍스트 */}
                <div style={{ flex: 1, color: "#323130" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "20px" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                      <span style={{ fontSize: "20px", fontWeight: "bold", color: "#323130" }}>{selectedUser.name}</span>
                      <span style={{ fontSize: "14px", color: "#605e5c" }}>{selectedUser.position}</span>
                    </div>
                    <div style={{ fontSize: "14px", color: "#605e5c" }}>
                      <strong>{selectedUser.companyName}</strong> | {selectedUser.department} | {selectedUser.role}
                    </div>
                    {/* 전체 부서 경로 표시 */}
                    <div
                      style={{
                        fontSize: "13px",
                        color: "#a19f9d",
                        marginTop: "4px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: "400px",
                        display: "block"
                      }}
                      title={selectedUser.orgFullName.replace(/ /g, " > ")}
                    >
                      {selectedUser.orgFullName.replace(/ /g, " > ")}
                    </div>
                  </div>

                  {/* 퀵 액션 버튼들 */}
                  <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                    <CircleButton onClick={() => openDeepLink('call', [selectedUser.email])} icon="📞" />
                    <CircleButton onClick={() => openDeepLink('mail', [selectedUser.email])} icon="✉️" />
                    <CircleButton onClick={() => openDeepLink('chat', [selectedUser.email])} icon="💬" />
                    <CircleButton onClick={() => openDeepLink('meeting', [selectedUser.email])} icon="📅" />
                  </div>

                  {/* 상세 연락처 정보 그리드 */}
                  <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: "8px", fontSize: "13px" }}>
                    <InfoRow label="핸드폰" value={selectedUser.mobile} onCopy={handleCopy} />
                    <InfoRow label="이메일" value={selectedUser.email} onCopy={handleCopy} />
                    <InfoRow label="전화번호" value={selectedUser.extension} onCopy={handleCopy} />
                    <InfoRow label="주소" value="서울특별시 강남구 남부순환로 2748 (도곡동)" onCopy={handleCopy} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Toast Notification */}
        <Toast
          message={toastMessage || ""}
          visible={!!toastMessage}
          onClose={() => setToastMessage(null)}
        />
      </div>
    </FluentProvider>
  );
}

// --- 하위 스타일 컴포넌트 및 상수 ---

const thStyle: CSSProperties = { padding: "10px", fontWeight: "600", color: theme.colors.textMain, fontSize: "13px", borderBottom: `1px solid ${theme.colors.border}` };
const tdStyle: CSSProperties = { padding: "10px", color: "#201f1e", fontSize: "14px" };
const overlayStyle: CSSProperties = {
  position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
};
const popupStyle: CSSProperties = {
  width: "650px", backgroundColor: theme.colors.bgWhite, borderRadius: theme.radius.medium,
  boxShadow: theme.shadow.popup, position: "relative", overflow: "hidden"
};
const closeBtnStyle: CSSProperties = {
  position: "absolute", top: "15px", right: "15px", background: "none", border: "none",
  fontSize: "20px", cursor: "pointer", color: theme.colors.textSecondary
};

// 세련된 버튼 스타일로 변경 (Outline Style + Icon)
const IconButton = ({ onClick, icon, text, color }: { onClick: () => void, icon: string, text: string, color: string }) => {
  const [hover, setHover] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        backgroundColor: hover ? theme.colors.bgHover : "white",
        color: color || theme.colors.textMain,
        border: `1px solid ${color || theme.colors.border}`,
        borderRadius: "20px",
        padding: "6px 12px",
        fontSize: "13px",
        fontWeight: "600",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        transition: "all 0.2s ease",
        boxShadow: hover ? "0 2px 8px rgba(0,0,0,0.1)" : "none",
        outline: "none",
      }}
    >
      <span style={{ fontSize: "14px" }}>{icon}</span> {text}
    </button>
  );
};

// 원형 버튼도 스타일 통일
const CircleButton = ({ onClick, icon }: { onClick: () => void, icon: string }) => {
  const [hover, setHover] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: "36px",
        height: "36px",
        borderRadius: "50%",
        border: `1px solid ${theme.colors.border}`,
        backgroundColor: hover ? theme.colors.bgHover : "white",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "16px",
        color: theme.colors.primary,
        transition: "all 0.2s ease",
        boxShadow: hover ? "0 2px 8px rgba(0,0,0,0.1)" : "none",
      }}
    >
      {icon}
    </button>
  );
};

// 정보 행 컴포넌트 (라벨 + 값 + 복사 버튼)
const InfoRow = ({ label, value, onCopy }: { label: string, value: string, onCopy: (text: string) => void }) => (
  <div style={{ display: "contents" }}>
    <div style={{ color: theme.colors.textSecondary }}>{label}</div>
    <div style={{ color: theme.colors.textMain, display: "flex", alignItems: "center", gap: "6px" }}>
      {value}
      {value && value !== "-" && (
        <button
          onClick={() => onCopy(value)}
          title="복사하기"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "2px",
            display: "flex",
            alignItems: "center",
            opacity: 0.7
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = "1"}
          onMouseLeave={(e) => e.currentTarget.style.opacity = "0.7"}
        >
          <img src={copyIcon} alt="copy" style={{ width: "13px", height: "13px" }} />
        </button>
      )}
    </div>
  </div>
);

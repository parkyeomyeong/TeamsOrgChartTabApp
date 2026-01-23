import React, { useState, useMemo, useEffect, useContext, useCallback, useRef, CSSProperties } from "react";
import { app } from "@microsoft/teams-js";
// import { TeamsFxContext } from "../Context"; // 현재 사용하지 않음 (필요 시 주석 해제)
import { AvatarWithStatus } from "./components/StatusAvatar";
import { OrgTreeView } from "./components/OrgTree";
import { Toast } from "./components/Toast";
import { Spinner } from "./components/Spinner";
import { useOrgChartData } from "./hooks/useOrgChartData"; // [NEW] API Hook
import { Employee, OrgData, OrgTreeNode } from "./types"; // [NEW] Centralized Types
import { getAllDescendantIds, buildOrgTree, calculateTotalCounts } from "./utils/orgTreeUtils";
import { theme } from "./constants/theme";
// 이미지 에셋 임포트
import copyIcon from "../assets/copy.png";

/**
 * OrgChart 컴포넌트 메인
 * - 3단 레이아웃 구조: [트리 영역] - [그리드 영역] - [선택된 사용자 목록 패널]
 */
export default function OrgChart() {
  // const { themeString } = useContext(TeamsFxContext);

  // --- API Data Fetching ---
  const { data, isLoading: isApiLoading, error } = useOrgChartData();
  const orgList = data?.orgList || [];
  const empList = data?.empList || [];

  // --- State 관리 영역 ---

  // 1. 중앙 그리드에 표시될 사용자 목록
  const [users, setUsers] = useState<Employee[]>([]);

  // 2. 팝업(상세 정보)에 표시할 선택된 사용자
  const [selectedUser, setSelectedUser] = useState<Employee | null>(null);

  // 3. 현재 왼쪽 트리에서 선택된 조직(부서) 정보
  const [currentOrg, setCurrentOrg] = useState<OrgData | null>(null);

  // 트리 데이터 State (인원수 계산을 위해 필요)
  const [treeData, setTreeData] = useState<OrgTreeNode[]>([]);

  // 4. 선택된 Org ID 관리
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");

  // 4. 중앙 그리드에서 체크박스로 선택된 사용자의 ID 집합 (-> 우측 패널로 이동됨)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  // 5. 우측 패널 내부에서 '선택 삭제' 등을 수행하기 위해 체크된 ID 집합
  const [rightPanelCheckedIds, setRightPanelCheckedIds] = useState<Set<string>>(new Set());

  // 6. 사이드바 크기 조절 상태
  const [sidebarWidth, setSidebarWidth] = useState(320); // 기본 너비 220px
  const [isResizing, setIsResizing] = useState(false);

  // 7. 검색 모드 상태
  const [isSearchMode, setIsSearchMode] = useState(false);

  // 8. Toast 상태
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 9. Bottom Panel 자동 스크롤을 위한 Ref
  const bottomPanelRef = useRef<HTMLDivElement>(null);

  // 10. 로딩 상태 (내부 처리용 + API 로딩)
  const [isProcessing, setIsProcessing] = useState(false);
  const isLoading = isApiLoading || isProcessing;

  // 11. 컨테이너 간 정확한 리사이즈 계산을 위해 메인 컨테이너 Ref
  const containerRef = useRef<HTMLDivElement>(null);

  // --- Custom Hooks ---

  // 사용자 상태/사진 데이터 (백엔드 API 연동 예정 - 현재는 빈 값)
  const userPresence: { [email: string]: string } = {};
  const userPhotos: { [email: string]: string } = {};

  // --- Memos ---
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
      // emp.orgId 매핑 확인 필요. 
      // 만약 백엔드 Employee의 orgId 필드명이 'deptCode' 등으로 다르다면 여기서 맞춰줘야 함.
      // 현재는 types.ts의 Employee 인터페이스에 orgId가 있다고 가정.
      const current = directCounts.get(emp.orgId) || 0;
      directCounts.set(emp.orgId, current + 1);
    });

    // 2. 트리 구조를 순회하며 하위 부서 인원 누적
    if (treeData.length > 0) {
      return calculateTotalCounts(treeData, directCounts);
    }
    return new Map<string, number>();
  }, [treeData, empList, orgList]); // 데이터 변경 시 재계산

  // --- Helper Functions ---

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
        companyName: emp.companyName || (emp.orgId.startsWith("AD") ? "아성다이소" : "아성"), // 회사명 fallback 로직 필요 시 유지
      }));
    setUsers(filtered);
  };

  // --- Effects ---

  // 1. API 데이터 로드 후 초기화
  useEffect(() => {
    if (!isLoading && data) {
      // 초기 트리 구성
      const tree = buildOrgTree(orgList);
      setTreeData(tree);

      // LocalStorage 복원
      const saved = localStorage.getItem("orgChartCheckedIds");
      if (saved) {
        try {
          const ids = JSON.parse(saved);
          setCheckedIds(new Set(ids));
        } catch (e) { console.error("Failed to load saved state", e); }
      }

      // 초기 선택 부서 설정 
      // "박여명" (또는 "14636" HR/DMS시스템팀) 설정 로직 유지
      // 실제 운영 환경에서는 로그인한 사용자의 부서 정보를 받아와야 함
      const targetOrgId = "14636";

      // 데이터가 존재하는지 확인 후 설정
      if (orgMap.has(targetOrgId)) {
        setSelectedOrgId(targetOrgId);
        updateEmployeeList(targetOrgId);

        const orgInfo = orgList.find(o => o.orgId === targetOrgId);
        if (orgInfo) setCurrentOrg(orgInfo);
      } else {
        // 타겟 부서가 없으면 최상위 루트 선택 등 fallback 처리
        if (tree.length > 0) {
          const rootId = tree[0].orgId;
          setSelectedOrgId(rootId);
          updateEmployeeList(rootId);
          setCurrentOrg(tree[0]);
        }
      }
    }
  }, [data, isLoading, orgList, empList, orgMap]); // 데이터가 준비되면 실행

  // 2. 상태 저장

  useEffect(() => {
    // 체크된 사용자 목록이 변경될 때마다 LocalStorage에 저장
    localStorage.setItem("orgChartCheckedIds", JSON.stringify(Array.from(checkedIds)));
  }, [checkedIds]);

  // 3. 사이드바 리사이징 이벤트 리스너
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

  // 4. 선택된 대화상대 추가 시 오른쪽으로 자동 스크롤
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


  // --- Event Handlers ---

  // 5. 왼쪽 트리에서 조직 선택 시 해당 조직의 직원 목록을 가져오며 로딩 스피너 표시
  const handleOrgSelect = (org: OrgData) => {
    setIsProcessing(true); // 로딩 시작

    // 실제 데이터 로딩 (비동기 시 await 필요하지만 현재는 동기 처리)
    setCurrentOrg(org);
    setSelectedOrgId(org.orgId);
    setIsSearchMode(false);
    console.log("Selected Org:", org);
    updateEmployeeList(org.orgId);

    setIsProcessing(false); // 로딩 종료
  };

  const handleSearch = (category: string, term: string) => {
    // 검색어가 없으면 현재 선택된 부서 기준으로 다시 로드 (이부분은 그냥 검색어 없으면 아무것도 안하도록 할까 고민중)
    if (!term) {
      setIsSearchMode(false);
      if (selectedOrgId) {
        updateEmployeeList(selectedOrgId);
        // 복구: 현재 선택된 Org 정보를 다시 currentOrg에 세팅해야 함
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
    setIsSearchMode(true);

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
      app.openLink(url).catch((err) => {
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
    <div
      ref={containerRef}
      style={{
        display: "flex",
        height: "100vh",
        backgroundColor: theme.colors.bgMain,
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
          <OrgTreeView
            onSelectOrg={handleOrgSelect}
            selectedOrgId={selectedOrgId}
            onSearch={handleSearch}
            orgMap={orgMap}
            memberCounts={memberCountMapForOrgTree} // 인원수 Map 전달
            orgList={orgList} // [NEW] 데이터 전달
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
        <div style={{ flex: 4, padding: "20px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <h2 style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "15px", color: theme.colors.textMain }}>
            {isSearchMode ? "검색 결과" : (currentOrg ? currentOrg.orgName : "전체 조직")} <span style={{ color: theme.colors.primary }}>{users.length}</span>
          </h2>

          <div style={{ backgroundColor: theme.colors.bgWhite, boxShadow: theme.shadow.default, borderRadius: theme.radius.small, overflow: "hidden", display: "flex", flexDirection: "column", flex: 1, position: "relative" }}>
            {/* 로딩 스피너 */}
            {isLoading && <Spinner />}

            <div style={{ flex: 1, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
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
                      <td style={{ ...tdStyle, display: "flex", alignItems: "center", gap: "8px" }}>
                        <AvatarWithStatus name={emp.name} photoUrl={userPhotos[emp.email]} status={userPresence[emp.email]} size={24} />
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
              alignItems: "flex-start" // 카드 높이 자동 조절보다는 상단 정렬
            }}>
            {checkedIds.size === 0 ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#605e5c", fontSize: "13px" }}>
                선택된 사용자가 없습니다. 목록에서 체크박스를 선택하세요.
              </div>
            ) : (
              getCheckedEmployees().map(emp => (
                <div key={emp.id} style={{
                  minWidth: "160px", // 사이즈 축소
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
                    <AvatarWithStatus name={emp.name} photoUrl={userPhotos[emp.email]} status={userPresence[emp.email]} size={24} />
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
              ))
            )}
          </div>
        </div>

      </div>

      {/* 4. 사용자 상세 정보 팝업 (Modal) */}
      {selectedUser && (
        <div style={overlayStyle}>
          <div style={popupStyle}>
            <button onClick={() => setSelectedUser(null)} style={closeBtnStyle}>✕</button>
            <div style={{ padding: "30px", display: "flex", gap: "20px" }}>
              {/* 프로필 사진 (크게) */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <AvatarWithStatus name="" photoUrl={userPhotos[selectedUser.email]} status={userPresence[selectedUser.email]} size={80} showStatusText={false} />
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
                  {/* 전체 부서 경로 표시 (긴 경우 말줄임표) */}
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
                  <div style={{ fontSize: "13px", color: "#a19f9d" }}>담당업무 : 전산직</div>
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
  );
}

// --- 하위 스타일 컴포넌트 ---

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
        color: color || theme.colors.textMain, // color prop이 있으면 사용(브랜드 컬러 등), 없으면 기본 텍스트
        border: `1px solid ${color || theme.colors.border}`,
        borderRadius: "20px", // 둥근 캡슐 형태
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


const thStyle: CSSProperties = { padding: "10px", fontWeight: "600", color: theme.colors.textMain, fontSize: "13px", borderBottom: `1px solid ${theme.colors.border}` };
const tdStyle: CSSProperties = { padding: "10px", color: "#201f1e", fontSize: "14px" }; // keep specific dark gray for grid text
const overlayStyle: CSSProperties = {
  position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
};
const popupStyle: CSSProperties = {
  width: "550px", backgroundColor: theme.colors.bgWhite, borderRadius: theme.radius.medium,
  boxShadow: theme.shadow.popup, position: "relative", overflow: "hidden"
};
const closeBtnStyle: CSSProperties = {
  position: "absolute", top: "15px", right: "15px", background: "none", border: "none",
  fontSize: "20px", cursor: "pointer", color: theme.colors.textSecondary
};
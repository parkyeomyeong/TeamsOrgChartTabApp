import React, { useState, useMemo, useEffect, useCallback, useRef, CSSProperties } from "react";
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
import { getCache, setCache } from "./utils/storageUtils";
import { API_BASE_URL } from "./config";
import { theme } from "./constants/theme";
// 이미지 에셋 임포트
import copyIcon from "../assets/copy.png";
import { useUserPresence } from "./hooks/useUserPresence"; // Presence Hook
import { PresenceBadge } from "./components/PresenceBadge"; // Badge Component
import { useTeamsAuth } from "./hooks/useTeamsAuth";
// Fluent Icons
import { Call24Regular, Chat24Regular, Calendar24Regular, Mail24Regular, Star24Filled, Star24Regular, Filter24Regular, Dismiss16Regular } from "@fluentui/react-icons";
import { useFavorites } from "./hooks/useFavorites";

// ================================================================
// 임직원 그리드 컬럼 정의
// - 컬럼을 추가/삭제/순서 변경하려면 이 배열만 고치면 된다. (헤더·본문·필터 전부 이 배열로 그린다)
// - filterable: true 인 컬럼만 [필터] 버튼에 나타난다. 값 목록은 현재 표시된 목록에서 자동으로 뽑는다.
// - 이름·내선·휴대전화처럼 사람마다 값이 다른 컬럼은 filterable: false 로 둔다.
// ================================================================
interface GridColumn {
  key: keyof Employee;   // Employee 필드명
  label: string;         // 헤더 표시명
  width?: string;        // 열 너비 (colgroup). 없으면 자동
  filterable: boolean;   // 필터 버튼 대상 여부
}

const GRID_COLUMNS: GridColumn[] = [
  { key: "name", label: "이름", width: "22%", filterable: false },
  { key: "position", label: "직위", width: "12%", filterable: true },
  { key: "role", label: "직책", width: "12%", filterable: true },
  { key: "department", label: "부서명", width: "24%", filterable: true },
  { key: "extension", label: "내선전화", width: "15%", filterable: false },
  { key: "mobile", label: "휴대전화", width: "15%", filterable: false },
];

// 필터 값 비교용: 빈 값·"-"는 "(없음)" 하나로 묶는다
const EMPTY_FILTER_LABEL = "(없음)";
const toFilterValue = (v: unknown): string => {
  const s = v == null ? "" : String(v).trim();
  return s === "" || s === "-" ? EMPTY_FILTER_LABEL : s;
};

// 컬럼별 선택된 필터 값. { position: ["과장","대리"], department: [...] } 형태. 비어 있으면 그 컬럼은 필터 없음.
type ColumnFilters = Partial<Record<keyof Employee, string[]>>;


/**
 * OrgChart 컴포넌트 메인
 * - 3단 레이아웃 구조: [트리 영역] - [그리드 영역] - [선택된 사용자 목록 패널]
 */
export default function OrgChart() {
  // const { themeString } = useContext(TeamsFxContext);

  // SSO 토큰 (1회성 호출)
  const { token, updateToken, currentUserEmail, isAuthLoading } = useTeamsAuth(); // 맨 처음 SSO 인증 + 본인 정보 가져오기

  // --- API 데이터 조회 ---
  const { data, isLoading: isApiLoading } = useOrgChartData(token, updateToken); // 조직정보 + 직원정보 가져오는 출발 훅
  const orgList = data?.orgList || [];
  const empList = data?.empList || [];

  // 로그인한 사용자의 사번 매핑 (emp.empId = DB의 EMPLOYEENUMBER)
  const myEmpId = useMemo(() => {
    if (!currentUserEmail || !empList.length) return null;
    const me = empList.find(e => e.email && e.email.toLowerCase() === currentUserEmail.toLowerCase());
    return me ? me.empId : null;
  }, [currentUserEmail, empList]);

  // HR 미등록 여부: 이메일이 사원 목록에 아예 없는 경우만 true
  // (사번이 null이라도 이메일이 어나이나 업는 미등록으로 반응하지 않음)
  const isHrUnregistered = useMemo(() => {
    if (!currentUserEmail || !empList.length) return false;
    const found = empList.some(e => e.email && e.email.toLowerCase() === currentUserEmail.toLowerCase());
    return !found;
  }, [currentUserEmail, empList]);

  // 8. Toast 상태 (useFavorites가 사용하므로 위로 끌어올림)
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // --- 즐겨찾기 API 연동 (사번 기반) ---
  const { favorites, addFavorite, removeFavorite, isFavorite } = useFavorites(
    token,
    myEmpId,
    updateToken,
    setToastMessage
  );

  // --- State 관리 영역 ---

  // 0. View Mode (BROWSE | SEARCH | FAVORITES)
  const [viewMode, setViewMode] = useState<'BROWSE' | 'SEARCH' | 'FAVORITES'>('BROWSE');


  // 1. 중앙 그리드에 표시될 사용자 목록
  const [users, setUsers] = useState<Employee[]>([]);

  // 1.0 컬럼 필터 상태 (부서 선택/검색으로 나온 users 위에 한 겹 더 거르는 용도)
  //     목록이 바뀌는 동작(부서 선택·검색·회사 변경·즐겨찾기 탭)에서는 초기화하고, 새로고침/탭 복귀 때만 캐시에서 복원한다
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterPanelRef = useRef<HTMLDivElement>(null);

  // 필터 후보 값: filterable 컬럼마다 현재 users 에서 중복 제거한 값 목록 (하드코딩 없음)
  const filterOptions = useMemo(() => {
    const result = new Map<keyof Employee, string[]>();
    GRID_COLUMNS.filter(c => c.filterable).forEach(col => {
      const values = new Set<string>();
      users.forEach(u => values.add(toFilterValue(u[col.key])));
      // "(없음)"은 맨 뒤로, 나머지는 가나다순
      const sorted = Array.from(values).sort((a, b) => {
        if (a === EMPTY_FILTER_LABEL) return 1;
        if (b === EMPTY_FILTER_LABEL) return -1;
        return a.localeCompare(b, "ko");
      });
      result.set(col.key, sorted);
    });
    return result;
  }, [users]);

  // 실제로 적용되는 필터: 저장된 값 중 현재 목록에 존재하는 값만 쓴다.
  // (부서를 옮긴 뒤 캐시에서 복원된 값이 새 목록에 없으면 그 컬럼 필터는 무시 → 0건 사고 방지)
  const effectiveFilters = useMemo(() => {
    const result: ColumnFilters = {};
    (Object.keys(columnFilters) as (keyof Employee)[]).forEach(key => {
      const options = filterOptions.get(key);
      const saved = columnFilters[key];
      if (!options || saved === undefined) return;
      const selected = saved.filter(v => options.includes(v));
      if (saved.length === 0) {
        result[key] = [];                 // 사용자가 전부 해제한 상태 → 0건 표시
      } else if (selected.length === 0) {
        return;                           // 저장된 값이 현재 목록에 하나도 없음(오래된 캐시) → 무시
      } else if (selected.length < options.length) {
        result[key] = selected;
      }
    });
    return result;
  }, [columnFilters, filterOptions]);

  const activeFilterCount = Object.keys(effectiveFilters).length;

  // 1.1 그리드에 실제로 그려지는 목록 = users ∩ 컬럼 필터
  const displayedUsers = useMemo(() => {
    const keys = Object.keys(effectiveFilters) as (keyof Employee)[];
    if (keys.length === 0) return users;
    return users.filter(u => keys.every(key => effectiveFilters[key]!.includes(toFilterValue(u[key]))));
  }, [users, effectiveFilters]);

  // 1.2 현재 표시된 사용자의 이메일 목록 추출 (Presence 조회를 위해)
  const gridUserEmails = useMemo(() => displayedUsers.map(u => u.email).filter(Boolean), [displayedUsers]);

  // --- 커스텀 훅 (Custom Hooks) ---
  // Presence Hook 사용
  const { presenceMap } = useUserPresence(gridUserEmails, token, false, updateToken); // gridUserEmails가 바뀌면 useUserPresence가 호출됨
  const getPhotoUrl = (email: string) => email ? `${API_BASE_URL}/api/users/photo/${encodeURIComponent(email)}` : undefined;

  // 2. 팝업(상세 정보)에 표시할 선택된 사용자
  const [selectedUser, setSelectedUser] = useState<Employee | null>(null);

  // 3. 현재 왼쪽 트리에서 선택된 조직(부서) 정보
  const [currentOrg, setCurrentOrg] = useState<OrgData | null>(null);

  // 트리 데이터 State (인원수 계산을 위해 필요)
  const [treeData, setTreeData] = useState<OrgTreeNode[]>([]);

  // 4. 선택된 Org ID 관리
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");

  // OrgTree에서 상태 끌어올리기 (State Lifted)
  const [companyCode, setCompanyCode] = useState("AD");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // 트리 검색 상태
  const [treeSearchTerm, setTreeSearchTerm] = useState(""); //입력창에 실시간으로 타이핑되는거
  const [treeSearchCategory, setTreeSearchCategory] = useState("all"); //드롭다운에서 선택한 검색 카테고리
  const [activeTreeSearchTerm, setActiveTreeSearchTerm] = useState(""); // 실제로 검색실행된 검색어(검색버튼 눌릴때만 업데이트!)

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

    // empList 사용 → orgFullName, companyName 이미 채워져 있음
    const filtered = empList.filter((emp) => targetIds.has(emp.orgId));
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
          // 컬럼 필터 복원 (현재 컬럼 정의에 없는 키는 버림)
          if (savedState.columnFilters && typeof savedState.columnFilters === "object") {
            const restoredFilters: ColumnFilters = {};
            GRID_COLUMNS.filter(c => c.filterable).forEach(col => {
              const v = savedState.columnFilters[col.key];
              if (Array.isArray(v) && v.length > 0) restoredFilters[col.key] = v.map(String);
            });
            setColumnFilters(restoredFilters);
          }

          // 트리 검색 상태
          if (savedState.treeSearch) {
            setTreeSearchTerm(savedState.treeSearch.term || "");
            setTreeSearchCategory(savedState.treeSearch.category || "all");
            setActiveTreeSearchTerm(savedState.treeSearch.activeTerm || "");
          }

          // 2. 모드별 복원
          if (savedState.viewMode === 'SEARCH') {
            // 검색 모드 복원
            setViewMode('SEARCH');
            const sTerm = savedState.search?.term || "";
            const sCat = savedState.search?.category || "all";

            setGridSearchTerm(sTerm);
            setGridSearchCategory(sCat);

            // 검색어 있으면
            if (sTerm) {
              // 중복된 검색 로직 (나중에 추출해야 하지만 클로저 접근을 위해 인라인으로 유지)
              const lowerTerm = sTerm.toLowerCase();
              const filtered = empList.filter((emp: Employee) => {
                const savedCompany = savedState.companyCode || companyCode;
                if (savedCompany !== 'ALL' && emp.companyCode !== savedCompany) {
                  return false;
                }

                let value = "";
                switch (sCat) {
                  case 'all':
                    return [
                      emp.name, emp.department, emp.extension, emp.mobile,
                      emp.position, emp.role, emp.email, emp.description
                    ].some(v => v && String(v).toLowerCase().includes(lowerTerm));
                  case 'user': value = emp.name; break;
                  case 'extension': value = emp.extension; break;
                  case 'mobile': value = emp.mobile; break;
                  case 'position': value = emp.position; break;
                  case 'jobTitle': value = emp.role; break;
                  case 'email': value = emp.email; break;
                  case 'dept': value = emp.department; break;
                  case 'description': value = emp.description; break;
                  default: return false;
                }
                return value && String(value).toLowerCase().includes(lowerTerm);
              });
              setUsers(filtered);
            }
            restored = true;

          } else if (savedState.viewMode === 'FAVORITES') {
            // 즐겨찾기 모드 복원
            setViewMode('FAVORITES');
            setSelectedOrgId("");
            setCurrentOrg(null);
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
        // '내 조직' 우선 선택 로직
        let defaultOrgId = "14636"; // 기본값 (HR/DMS시스템팀)

        // 1. 로그인한 사용자 찾기
        if (currentUserEmail) {
          const me = empList.find(e => e.email.toLowerCase() === currentUserEmail.toLowerCase());
          if (me && orgMap.has(me.orgId)) {
            defaultOrgId = me.orgId;
            // 회사 코드도 내 회사로 변경
            const myOrg = orgMap.get(me.orgId);
            if (myOrg && myOrg.companyCode) {
              setCompanyCode(myOrg.companyCode);
            }
            // else if (me.companyName) {
            //   if (me.companyName.includes("아성다이소")) setCompanyCode("AD");
            //   else if (me.companyName.includes("HMP")) setCompanyCode("AH");
            //   else if (me.companyName === "아성") setCompanyCode("AS");
            // }
          }
        }

        if (orgMap.has(defaultOrgId)) {
          setSelectedOrgId(defaultOrgId);
          updateEmployeeList(defaultOrgId);
          const orgInfo = orgMap.get(defaultOrgId);
          if (orgInfo) setCurrentOrg(orgInfo);

          // 선택된 부서의 상위 경로 모두 펼치기 (getAllAncestorIds 사용)
          const ancestors = getAllAncestorIds(defaultOrgId, orgMap);
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

  // [즐겨찾기 전용] 즐겨찾기 목록이 갱신되거나 viewMode가 FAVORITES로 전환될 때 테이블의 users 목록을 실시간 동기화
  useEffect(() => {
    if (viewMode === 'FAVORITES') {
      const favEmpIds = new Set(favorites.map(f => f.targetEmpId));
      const filtered = empList.filter(emp => emp.empId && favEmpIds.has(emp.empId));
      setUsers(filtered);
    }
  }, [favorites, viewMode, empList]);

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
      columnFilters,
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

    // setCache 사용
    setCache("orgChartUserState", stateToSave);

    console.log("캐시 저장됨", stateToSave);

  }, [viewMode, companyCode, selectedOrgId, expandedIds, checkedIds, sidebarWidth, columnFilters, gridSearchTerm, gridSearchCategory, treeSearchTerm, treeSearchCategory, activeTreeSearchTerm, isLoading, data]);

  // 2-1. 필터 팝오버 바깥 클릭 시 닫기
  useEffect(() => {
    if (!isFilterOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [isFilterOpen]);

  // 필터 값 토글 / 컬럼 전체 선택·해제 / 전체 초기화
  const toggleFilterValue = (key: keyof Employee, value: string) => {
    setColumnFilters(prev => {
      const options = filterOptions.get(key) || [];
      // 키가 없으면 "전체 선택" 상태로 보고 거기서 하나를 빼는 것으로 시작. 빈 배열(전부 해제)이면 거기에 하나를 더한다
      const current = prev[key] !== undefined ? prev[key]! : options;
      const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
      const copy = { ...prev };
      // 전부 선택이면 필터 없는 것과 같으므로 키를 지운다. 전부 해제면 빈 배열(0건 표시)
      if (next.length === options.length) delete copy[key];
      else copy[key] = next;
      return copy;
    });
  };
  const setColumnAll = (key: keyof Employee, selectAll: boolean) => {
    setColumnFilters(prev => {
      const copy = { ...prev };
      if (selectAll) delete copy[key];
      else copy[key] = [];   // 빈 배열 = 아무것도 선택 안 함 → 0건 표시
      return copy;
    });
  };
  const clearAllFilters = () => setColumnFilters({});

  // 특정 값이 현재 체크된 상태인지 (선택 없음 = 전체 체크)
  const isFilterChecked = (key: keyof Employee, value: string) => {
    const sel = columnFilters[key];
    if (sel === undefined) return true;
    return sel.includes(value);
  };

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
    setColumnFilters({}); // 목록이 바뀌므로 컬럼 필터 초기화

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
    setColumnFilters({}); // 목록이 바뀌므로 컬럼 필터 초기화

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
    setColumnFilters({}); // 목록이 바뀌므로 컬럼 필터 초기화

    if (!term) {
      // 검색어가 비어있으면 탐색 모드로 복귀
      if (selectedOrgId) {
        setViewMode('BROWSE');
        updateEmployeeList(selectedOrgId);
        const orgInfo = orgMap.get(selectedOrgId); //여기 map으로 변경
        if (orgInfo) setCurrentOrg(orgInfo);
      } else {
        setUsers([]);
        setCurrentOrg(null);
      }
      return;
    }

    const lowerTerm = term.toLowerCase();

    setIsProcessing(true);

    let filtered: Employee[] = [];

    if (category === 'dept') {
      // 부서명 검색: 부서명이 매칭되는 조직의 모든 직원을 표시
      const matchedOrgIds = new Set<string>();
      orgList.forEach(org => {
        if (companyCode !== 'ALL' && org.companyCode !== companyCode) return;
        if (org.orgName.toLowerCase().includes(lowerTerm)) {
          matchedOrgIds.add(org.orgId);
          // // 매칭된 조직 + 하위 조직의 ID 모두 수집
          // const descendants = getAllDescendantIds(org.orgId, orgList);
          // descendants.forEach(id => matchedOrgIds.add(id));
        }
      });

      filtered = empList.filter(emp => {
        if (companyCode !== 'ALL' && emp.companyCode !== companyCode) return false;
        return matchedOrgIds.has(emp.orgId);
      });
    } else {
      // 기존 검색 로직 (사용자명, 내선번호, 핸드폰, 통합검색 등)
      filtered = empList.filter((emp: Employee) => {
        if (companyCode !== 'ALL' && emp.companyCode !== companyCode) {
          return false;
        }

        let value = "";
        switch (category) {
          case 'all':
            return [
              emp.name, emp.department, emp.extension, emp.mobile,
              emp.position, emp.role, emp.email, emp.description
            ].some(v => v && String(v).toLowerCase().includes(lowerTerm));
          case 'user': value = emp.name; break;
          case 'extension': value = emp.extension; break;
          case 'mobile': value = emp.mobile; break;
          case 'position': value = emp.position; break;
          case 'jobTitle': value = emp.role; break;
          case 'email': value = emp.email; break;
          case 'description': value = emp.description; break;
          default: return false;
        }
        return value && String(value).toLowerCase().includes(lowerTerm);
      });
    }

    setUsers(filtered);
    setCurrentOrg(null);

    // 검색 모드로 전환
    setViewMode('SEARCH');

    setIsProcessing(false);
  };

  // 전체 선택은 화면에 보이는(필터 적용된) 목록 기준
  const isAllCheckedGrid = displayedUsers.length > 0 && displayedUsers.every(u => checkedIds.has(u.id));

  const toggleAllGrid = () => {
    const newSet = new Set(checkedIds);
    if (isAllCheckedGrid) {
      // 이미 현재 목록이 모두 선택된 상태라면 -> 현재 목록만 선택 해제
      displayedUsers.forEach(u => newSet.delete(u.id));
    } else {
      // 하나라도 선택 안 된 게 있다면 -> 현재 목록 모두 추가 (기존 선택 유지)
      displayedUsers.forEach(u => newSet.add(u.id));
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
    // 해당 부서의 상위 경로를 찾아 펼쳐주어야 트리에서 포커싱/스크롤이 가능함
    // 기존 expandedIds에 추가하는 것이 자연스러움 (또는 다 접고 여기만 펼칠 수도 있음. 정책에 따라 결정)
    // 여기서는 "사용자가 찾아서 들어간 것"이므로 기존 것을 유지하면서 추가하는 방향으로 구현
    const ancestors = getAllAncestorIds(emp.orgId, orgMap);
    setExpandedIds(prev => {
      const next = new Set(prev);
      ancestors.forEach(id => next.add(id));
      return next;
    });

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
    <FluentProvider theme={webLightTheme} style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: theme.colors.bgMain }}>

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
            background: theme.colors.bgMain; 
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
            padding: "12px",
            // overflowY: "hidden", // OrgTree 내부 스크롤 사용
            flexShrink: 0,
          }}
        >
          {/* <h2 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "16px", color: theme.colors.textMain, whiteSpace: "nowrap", display: "flex", alignItems: "baseline", gap: "8px" }}>
            조직도
          </h2> */}

          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", gap: "6px" }}>
            {/* ⭐ 즐겨찾는 멤버 고정 버튼 */}
            <div
              onClick={() => {
                setViewMode('FAVORITES');
                setSelectedOrgId("");
                setCurrentOrg(null);
                setColumnFilters({}); // 목록이 바뀌므로 컬럼 필터 초기화
                // 즐겨찾기 목록 필터링 (empId 기반)
                const favEmpIds = new Set(favorites.map(f => f.targetEmpId));
                const filtered = empList.filter(emp => emp.empId && favEmpIds.has(emp.empId));
                setUsers(filtered);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 10px",
                cursor: "pointer",
                borderRadius: "4px",
                backgroundColor: viewMode === 'FAVORITES' ? "#F3F2F1" : "transparent",
                border: `1px solid ${viewMode === 'FAVORITES' ? "#6264A7" : "transparent"}`,
                transition: "all 0.15s ease-in-out",
                userSelect: "none",
                flexShrink: 0
              }}
              onMouseEnter={(e) => {
                if (viewMode !== 'FAVORITES') e.currentTarget.style.backgroundColor = "#faf9f8";
              }}
              onMouseLeave={(e) => {
                if (viewMode !== 'FAVORITES') e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <Star24Filled color="#FDB913" style={{ width: "20px", height: "20px" }} />
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#242424" }}>
                즐겨찾는 멤버 ({favorites.length})
              </span>
              {/* 오른쪽 끝: 즐겨찾기 사용 가능 상태 표시기 */}
              <span style={{ marginLeft: "auto" }}>
                {isHrUnregistered ? (
                  // HR 미등록: 주황 경고 아이콘 — hover 시 이유 설명
                  <span
                    title="HR 시스템에 본인 사원 정보가 등록되어 있지 않아 즐겨찾기를 사용할 수 없습니다. 인사담당자에게 문의해 주세요."
                    onClick={e => e.stopPropagation()}
                    style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: "18px", height: "18px", borderRadius: "50%",
                      backgroundColor: "#FFF4CE", border: "1.5px solid #F7A924",
                      cursor: "help", fontSize: "11px", fontWeight: "700",
                      color: "#C47A00", lineHeight: 1, flexShrink: 0,
                    }}
                  >
                    !
                  </span>
                ) : (
                  // 정상: 초록 점
                  <span
                    title="모든 기능 정상적으로 사용할 수 있습니다."
                    onClick={e => e.stopPropagation()}
                    style={{
                      display: "inline-block",
                      width: "8px", height: "8px", borderRadius: "50%",
                      backgroundColor: "#6BB700", flexShrink: 0,
                    }}
                  />
                )}
              </span>
            </div>

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
            {/* 제목 줄: 왼쪽 제목+건수, 오른쪽 [필터] 버튼 */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "15px", position: "relative" }}>
              <h2 style={{ fontSize: "18px", fontWeight: "bold", margin: 0, color: theme.colors.textMain }}>
                {viewMode === 'FAVORITES'
                  ? "즐겨찾는 멤버"
                  : (isSearchMode ? "검색 결과" : (currentOrg ? currentOrg.orgName : "전체 조직"))}{" "}
                <span style={{ color: theme.colors.primary }}>{displayedUsers.length}</span>
                {activeFilterCount > 0 && (
                  <span style={{ fontSize: "13px", fontWeight: "normal", color: theme.colors.textSecondary, marginLeft: "6px" }}>
                    / 전체 {users.length}
                  </span>
                )}
              </h2>

              {/* 필터 버튼 + 팝오버 (filterable 컬럼이 하나도 없으면 버튼 자체를 숨김) */}
              {GRID_COLUMNS.some(c => c.filterable) && (
                <div ref={filterPanelRef} style={{ position: "relative" }}>
                  <button
                    onClick={() => setIsFilterOpen(o => !o)}
                    title="컬럼별 값으로 목록 거르기"
                    style={{
                      display: "flex", alignItems: "center", gap: "6px",
                      padding: "6px 12px", fontSize: "13px", fontWeight: "600",
                      border: `1px solid ${theme.colors.primary}`,
                      borderRadius: theme.radius.small,
                      backgroundColor: activeFilterCount > 0 || isFilterOpen ? theme.colors.primaryLight : "white",
                      color: theme.colors.primary,
                      cursor: "pointer",
                    }}
                  >
                    <Filter24Regular style={{ width: "18px", height: "18px" }} />
                    필터
                    {activeFilterCount > 0 && (
                      <span style={{
                        minWidth: "18px", height: "18px", padding: "0 5px", borderRadius: "9px",
                        backgroundColor: theme.colors.primary, color: "white",
                        fontSize: "11px", display: "inline-flex", alignItems: "center", justifyContent: "center"
                      }}>
                        {activeFilterCount}
                      </span>
                    )}
                  </button>

                  {isFilterOpen && (
                    <div style={{
                      position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 100,
                      backgroundColor: theme.colors.bgWhite, border: `1px solid ${theme.colors.border}`,
                      borderRadius: theme.radius.small, boxShadow: theme.shadow.popup,
                      display: "flex", flexDirection: "column",
                      maxWidth: "min(900px, 80vw)",
                    }}>
                      {/* 상단 바: 제목 + 초기화 */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: `1px solid ${theme.colors.border}` }}>
                        <span style={{ fontSize: "13px", fontWeight: "600", color: theme.colors.textMain }}>
                          필터 {activeFilterCount > 0 && <span style={{ color: theme.colors.primary }}>({activeFilterCount}개 적용 중)</span>}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          {/* 초기화: 모든 컬럼 필터 해제 (창은 닫지 않음) */}
                          <button
                            onClick={clearAllFilters}
                            disabled={Object.keys(columnFilters).length === 0}
                            style={Object.keys(columnFilters).length === 0
                              ? { border: `1px solid ${theme.colors.border}`, background: "white", color: theme.colors.textDisabled, cursor: "default", padding: "3px 10px", fontSize: "12px", fontWeight: "600", borderRadius: theme.radius.small }
                              : { border: `1px solid ${theme.colors.primary}`, background: "white", color: theme.colors.primary, cursor: "pointer", padding: "3px 10px", fontSize: "12px", fontWeight: "600", borderRadius: theme.radius.small }}
                          >
                            초기화
                          </button>
                          {/* 닫기: 창만 닫음 (필터는 유지) */}
                          <button
                            onClick={() => setIsFilterOpen(false)}
                            title="닫기"
                            style={{ border: "none", background: "none", padding: "2px", display: "flex", alignItems: "center", color: theme.colors.textSecondary, cursor: "pointer" }}
                          >
                            <Dismiss16Regular />
                          </button>
                        </div>
                      </div>

                      {/* 컬럼별 값 목록 */}
                      <div style={{ display: "flex", padding: "8px 4px" }}>
                        {GRID_COLUMNS.filter(c => c.filterable).map((col, idx) => {
                          const options = filterOptions.get(col.key) || [];
                          const checkedCount = options.filter(v => isFilterChecked(col.key, v)).length;
                          const allChecked = options.length > 0 && checkedCount === options.length;
                          return (
                            <div key={col.key} style={{ width: "220px", display: "flex", flexDirection: "column", padding: "0 8px", borderLeft: idx === 0 ? "none" : `1px solid ${theme.colors.border}` }}>
                              {/* 컬럼 머리: 전체 체크박스 + 컬럼명 + (선택/전체) */}
                              <label style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px", marginBottom: "4px", borderBottom: `1px solid ${theme.colors.border}`, cursor: "pointer", flexShrink: 0 }}>
                                <TriStateCheckbox
                                  checked={allChecked}
                                  indeterminate={checkedCount > 0 && !allChecked}
                                  onChange={() => setColumnAll(col.key, !allChecked)}
                                />
                                <span style={{ fontSize: "13px", fontWeight: "600", color: theme.colors.textMain }}>{col.label}</span>
                                <span style={{ fontSize: "12px", color: theme.colors.textSecondary }}>({checkedCount}/{options.length})</span>
                              </label>
                              {/* 값 목록 (항목이 많아도 눌리지 않도록 flexShrink 0 + 스크롤) */}
                              <div style={{ overflowY: "auto", maxHeight: "300px" }}>
                                {options.length === 0 && (
                                  <div style={{ fontSize: "12px", color: theme.colors.textDisabled, padding: "4px" }}>표시할 값이 없습니다</div>
                                )}
                                {options.map(v => (
                                  <label key={v} title={v} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", lineHeight: "20px", padding: "3px 4px", borderRadius: "3px", cursor: "pointer", flexShrink: 0 }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.colors.bgHover}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isFilterChecked(col.key, v)}
                                      onChange={() => toggleFilterValue(col.key, v)}
                                      style={{ cursor: "pointer", accentColor: theme.colors.primary, flexShrink: 0, margin: 0 }}
                                    />
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, color: v === EMPTY_FILTER_LABEL ? theme.colors.textDisabled : theme.colors.textMain }}>{v}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>


            <div style={{ backgroundColor: theme.colors.bgWhite, boxShadow: theme.shadow.default, borderRadius: theme.radius.small, overflow: "hidden", display: "flex", flexDirection: "column", flex: 1, position: "relative" }}>
              {/* 로딩 스피너 */}
              {isLoading && <Spinner />}

              <div style={{ flex: 1, overflowY: "auto", position: "relative" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                  {/* 열 너비를 헤더·본문이 같이 쓰도록 colgroup으로 고정 */}
                  <colgroup>
                    <col style={{ width: "48px" }} />
                    {GRID_COLUMNS.map(col => <col key={col.key} style={{ width: col.width }} />)}
                  </colgroup>
                  <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
                    <tr style={{ backgroundColor: "#f3f2f1" }}>
                      <th style={{ ...thStyle, textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={isAllCheckedGrid}
                          onChange={toggleAllGrid}
                          style={{ cursor: "pointer", transform: "scale(1.5)", margin: "0" }}
                        />
                      </th>
                      {GRID_COLUMNS.map((col, idx) => (
                        <th key={col.key} style={{ ...thStyle, ...(idx === GRID_COLUMNS.length - 1 ? { borderRight: "none" } : {}) }}>
                          {col.label}
                          {effectiveFilters[col.key] !== undefined && (
                            <Filter24Regular style={{ width: "14px", height: "14px", marginLeft: "4px", verticalAlign: "-2px", color: theme.colors.primary }} />
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayedUsers.map((emp) => (
                      <tr
                        key={emp.id}
                        onClick={() => handleRowClick(emp)}
                        style={{ borderBottom: "1px solid #edebe9", backgroundColor: "white", cursor: "pointer" }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#faf9f8"}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "white"}
                      >
                        <td style={{ ...tdStyle, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isCheckedGrid(emp.id)}
                            onChange={() => toggleCheckGrid(emp.id)}
                            style={{ cursor: "pointer", transform: "scale(1.5)", margin: "0" }}
                          />
                        </td>
                        {GRID_COLUMNS.map(col => (
                          <td key={col.key} style={tdStyle} title={col.key === "name" ? undefined : String(emp[col.key] ?? "")}>
                            {col.key === "name" ? (
                              // 이름 칸: 별 + 아바타 + 이름. (td 자체에 flex를 주면 테이블 셀이 깨져서 안쪽 div에 준다)
                              <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (emp.empId) {
                                      if (isFavorite(emp.empId)) {
                                        removeFavorite(emp.empId, emp.name);
                                      } else {
                                        addFavorite(emp.empId, emp.name);
                                      }
                                    } else {
                                      setToastMessage("사번 정보가 없어 즐겨찾기 등록이 불가능합니다.");
                                    }
                                  }}
                                  style={{ display: "flex", alignItems: "center", cursor: "pointer", transition: "transform 0.1s", flexShrink: 0 }}
                                  onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.2)"}
                                  onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
                                >
                                  {emp.empId && isFavorite(emp.empId) ? (
                                    <Star24Filled color="#FDB913" />
                                  ) : (
                                    <Star24Regular color="#c8c6c4" />
                                  )}
                                </div>
                                <AvatarWithStatus name={emp.name} photoUrl={getPhotoUrl(emp.email)} status={presenceMap[emp.email]} size={32} />
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={emp.name}>{emp.name}</span>
                              </div>
                            ) : (
                              emp[col.key]
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* 빈 결과 안내: 검색 결과 없음 / 필터 결과 없음 */}
                {!isLoading && displayedUsers.length === 0 && (isSearchMode || activeFilterCount > 0) && (
                  <div style={{
                    position: "absolute", top: "44px", left: 0, right: 0, bottom: 0,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    gap: "10px", color: theme.colors.textSecondary, pointerEvents: "none",
                  }}>
                    <div style={{ fontSize: "28px", fontWeight: "700", color: theme.colors.textDisabled, letterSpacing: "1px" }}>
                      {users.length === 0 ? "검색 결과 없음" : "필터 조건에 맞는 임직원 없음"}
                    </div>
                  </div>
                )}
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
                <span style={{ fontSize: "16px", fontWeight: "bold", color: theme.colors.textMain }}>
                  선택된 대화상대 <span style={{ color: "#6264A7" }}>{checkedIds.size}명</span>
                </span>
                {rightPanelCheckedIds.size > 0 && (
                  <button
                    onClick={deleteSelectedRightPanel}
                    style={{ border: "none", background: "none", color: theme.colors.danger, fontSize: "12px", cursor: "pointer", fontWeight: "600" }}
                  >
                    선택 삭제 ({rightPanelCheckedIds.size})
                  </button>
                )}
              </div>

              <div style={{ display: "flex", gap: "5px" }}>
                <IconButton onClick={() => openDeepLink('call', getCheckedEmployees().map(e => e.email))} icon={<Call24Regular />} text="통화" color={theme.colors.primary} />
                <IconButton onClick={() => openDeepLink('chat', getCheckedEmployees().map(e => e.email))} icon={<Chat24Regular />} text="채팅" color={theme.colors.primary} />
                <IconButton onClick={() => openDeepLink('meeting', getCheckedEmployees().map(e => e.email))} icon={<Calendar24Regular />} text="모임" color={theme.colors.primary} />
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
              onWheel={(e) => {
                // 일반 마우스 휠(세로)을 가로 스크롤로 변환
                if (e.deltaY !== 0) {
                  e.currentTarget.scrollLeft += e.deltaY;
                  e.preventDefault();
                }
              }}
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
                      <AvatarWithStatus name={emp.name} photoUrl={getPhotoUrl(emp.email)} status={presenceMap[emp.email]} size={24} />
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: "bold", fontSize: "13px", color: theme.colors.textMain }}>{emp.name}</div>
                        <div style={{ fontSize: "11px", color: theme.colors.textSecondary }}>{emp.position}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: "11px", color: "#605e5c", marginTop: "auto", paddingLeft: "4px" }}>
                      {emp.department}
                    </div>
                    {/* 개별 삭제 버튼 ('X') */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleCheckGrid(emp.id); }}
                      style={{ position: "absolute", top: "2px", right: "2px", border: "none", background: "none", cursor: "pointer", color: theme.colors.textDisabled, fontSize: "14px" }}
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
                    photoUrl={getPhotoUrl(selectedUser.email)}
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
                <div style={{ flex: 1, color: theme.colors.textMain }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "20px", fontWeight: "bold", color: theme.colors.textMain }}>{selectedUser.name}</span>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          if (selectedUser.empId) {
                            if (isFavorite(selectedUser.empId)) {
                              removeFavorite(selectedUser.empId, selectedUser.name);
                            } else {
                              addFavorite(selectedUser.empId, selectedUser.name);
                            }
                          } else {
                            setToastMessage("사번 정보가 없어 즐겨찾기 등록이 불가능합니다.");
                          }
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          cursor: "pointer",
                          transition: "transform 0.1s ease",
                          userSelect: "none"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.2)"}
                        onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
                        title={selectedUser.empId && isFavorite(selectedUser.empId) ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                      >
                        {selectedUser.empId && isFavorite(selectedUser.empId) ? (
                          <Star24Filled color="#FDB913" />
                        ) : (
                          <Star24Regular color="#c8c6c4" />
                        )}
                      </div>
                      <span style={{ fontSize: "14px", color: theme.colors.textSecondary, marginLeft: "4px" }}>{selectedUser.position}</span>
                    </div>
                    <div style={{ fontSize: "14px", color: theme.colors.textSecondary }}>
                      <strong>{selectedUser.companyName}</strong> | {selectedUser.department} | {selectedUser.role}
                    </div>
                    {/* 전체 부서 경로 표시 */}
                    <div
                      style={{
                        fontSize: "13px",
                        color: theme.colors.textDisabled,
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
                    {/* 담당업무 */}
                    <div style={{ fontSize: "13px", color: theme.colors.textSecondary, marginTop: "4px" }}>
                      <strong>담당업무</strong> : {selectedUser.description || "-"}
                    </div>
                    <div style={{ fontSize: "10px", color: theme.colors.textDisabled, marginTop: "2px", wordBreak: "keep-all", lineHeight: "1.4" }}>
                      ※ 담당업무는 HR시스템 [개인인사정보] 메뉴에서 직접 등록하실 수 있으며, 미등록 시에는 기본 직무가 표기됩니다.
                    </div>
                  </div>

                  {/* 퀵 액션 버튼들 */}
                  <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                    <CircleButton onClick={() => openDeepLink('call', [selectedUser.email])} icon={<Call24Regular />} />
                    <CircleButton onClick={() => openDeepLink('mail', [selectedUser.email])} icon={<Mail24Regular />} />
                    <CircleButton onClick={() => openDeepLink('chat', [selectedUser.email])} icon={<Chat24Regular />} />
                    <CircleButton onClick={() => openDeepLink('meeting', [selectedUser.email])} icon={<Calendar24Regular />} />
                  </div>

                  {/* 상세 연락처 정보 그리드 */}
                  <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: "8px", fontSize: "13px" }}>
                    <InfoRow label="핸드폰" value={selectedUser.mobile} onCopy={handleCopy} />
                    <InfoRow label="이메일" value={selectedUser.email} onCopy={handleCopy} />
                    <InfoRow label="전화번호" value={selectedUser.extension} onCopy={handleCopy} />
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

// 헤더·본문 정렬 통일: 둘 다 왼쪽 정렬 + 같은 padding. 헤더는 열 사이에 세로 경계선.
const thStyle: CSSProperties = {
  padding: "10px 12px", fontWeight: "600", color: theme.colors.textMain, fontSize: "13px",
  textAlign: "left", verticalAlign: "middle", whiteSpace: "nowrap",
  borderBottom: `1px solid ${theme.colors.border}`,
  borderRight: `1px solid #e1dfdd`,
};
const tdStyle: CSSProperties = {
  padding: "10px 12px", color: "#201f1e", fontSize: "14px",
  textAlign: "left", verticalAlign: "middle",
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};
const overlayStyle: CSSProperties = {
  position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
};
const popupStyle: CSSProperties = {
  width: "700px", backgroundColor: theme.colors.bgWhite, borderRadius: theme.radius.medium,
  boxShadow: theme.shadow.popup, position: "relative", overflow: "hidden"
};
const closeBtnStyle: CSSProperties = {
  position: "absolute", top: "15px", right: "15px", background: "none", border: "none",
  fontSize: "20px", cursor: "pointer", color: theme.colors.textSecondary
};

// 전체/일부/없음 3상태 체크박스 (필터 컬럼 머리용). indeterminate는 속성이 아니라 DOM 프로퍼티라 ref로 넣는다
const TriStateCheckbox = ({ checked, indeterminate, onChange }: { checked: boolean, indeterminate: boolean, onChange: () => void }) => {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      style={{ cursor: "pointer", accentColor: theme.colors.primary, flexShrink: 0, margin: 0 }}
    />
  );
};

// [Styles] Fluent Icons 에서 사용
const IconButton = ({ onClick, icon, text, color }: { onClick: () => void, icon: React.ReactNode, text: string, color: string }) => {
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
      <span style={{ display: "flex", alignItems: "center" }}>{icon}</span> {text}
    </button>
  );
};

// Circle Button Style
const CircleButton = ({ onClick, icon }: { onClick: () => void, icon: React.ReactNode }) => {
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

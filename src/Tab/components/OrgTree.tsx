import React, { useState, useEffect, useMemo } from "react";
import { buildOrgTree, filterTree, getAllIds } from "../utils/orgTreeUtils";
import { OrgData, OrgTreeNode } from "../types"; // [Update] Import from centralized types
import folderIcon from "../../assets/folder_icon.png";
import { theme } from "../constants/theme";

// --- 스타일 상수 (CSS-in-JS 방식) ---
const treeContainerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#f9f9f9",
    fontFamily: "'Segoe UI', 'Malgun Gothic', sans-serif",
    boxSizing: "border-box",
    // borderRight 제거됨
};

const topControlAreaStyle: React.CSSProperties = {
    // padding: "10px",
    backgroundColor: "#fff",
    borderBottom: "1px solid #e1e1e1",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
};

const companySelectStyle: React.CSSProperties = {
    width: "100%",
    padding: "6px",
    border: "1px solid #ddd",
    borderRadius: "4px",
    fontSize: "13px",
    outline: "none",
    color: "#333",
    backgroundColor: "#fff",
};

const searchRowStyle: React.CSSProperties = {
    display: "flex",
    gap: "5px",
};

const searchSelectStyle: React.CSSProperties = {
    padding: "5px",
    border: "1px solid #ddd",
    borderRadius: "4px",
    fontSize: "12px",
    outline: "none",
    cursor: "pointer",
    color: "#333",
    backgroundColor: "#fff",
    width: "80px",
};

const searchInputWrapperStyle: React.CSSProperties = {
    position: "relative",
    flex: 1,
    display: "flex",
    alignItems: "center",
};

const searchInputStyle: React.CSSProperties = {
    width: "100%",
    padding: "6px 30px 6px 8px",
    border: "1px solid #ddd",
    borderRadius: "4px",
    fontSize: "13px",
    outline: "none",
    boxSizing: "border-box",
};

const searchButtonStyle: React.CSSProperties = {
    position: "absolute",
    right: "5px",
    background: "none",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#666",
    width: "24px",
    height: "24px",
};

const treeContentStyle: React.CSSProperties = {
    flex: 1,
    overflowY: "auto",
    padding: "5px 0",
};

const itemContainerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    cursor: "pointer",
    padding: "4px 8px",
    position: "relative",
    userSelect: "none",
    minWidth: "fit-content", // 내용에 맞게 늘어나도록 함
};

const itemContentStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    whiteSpace: "nowrap", // 줄바꿈 방지
};

const folderIconContainerStyle: React.CSSProperties = {
    position: "relative",
    width: "24px",
    height: "24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0, // 아이콘 찌그러짐 방지
};

const folderImgStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "contain",
};

const overlayIndicatorStyle: React.CSSProperties = {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -70%)",
    color: "#000",
    fontSize: "14px",
    fontWeight: "bold",
    pointerEvents: "none",
    lineHeight: 1,
    marginTop: "2px",
};

// 검색 카테고리
const SEARCH_CATEGORIES = [
    { value: "user", label: "사용자" },
    { value: "dept", label: "부서명" },
    { value: "extension", label: "내선번호" },
    { value: "mobile", label: "핸드폰" },
    { value: "position", label: "직위" },
    { value: "jobTitle", label: "직책" },
];

export interface OrgTreeViewProps {
    onSelectOrg: (org: OrgData) => void;
    selectedOrgId?: string;
    onSearch?: (category: string, term: string) => void;
    orgMap?: Map<string, OrgData>; // O(1) 조회를 위한 Map
    memberCounts?: Map<string, number>; // 부서원 수
    orgList: OrgData[]; // [NEW] 트리 구성용 데이터 (부모로부터 전달받음)
}

// 왼쪽 조직도 전체 컴포넌트 (검색, 조직도 맵)
export const OrgTreeView: React.FC<OrgTreeViewProps> = ({
    onSelectOrg,
    selectedOrgId,
    onSearch,
    orgMap,
    memberCounts,
    orgList // [NEW]
}) => {
    const [data, setData] = useState<OrgTreeNode[]>([]);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set()); // 펼쳐진 부서 ID 목록
    const [searchTerm, setSearchTerm] = useState(""); // 검색어
    const [activeSearchTerm, setActiveSearchTerm] = useState(""); // 실제 검색에 사용되는 검색어
    const [searchCategory, setSearchCategory] = useState("user"); // 검색 카테고리
    const [companyCode, setCompanyCode] = useState("AD"); // 회사 코드

    // 데이터 로드 (회사 코드 변경 시)
    useEffect(() => {
        if (!orgList || orgList.length === 0) return;

        const tree: OrgTreeNode[] = buildOrgTree(orgList, companyCode === 'ALL' ? undefined : companyCode);
        setData(tree);

        // 기본적으로 1레벨(루트) 확장
        const newExpanded = new Set<string>();
        tree.forEach(root => {
            newExpanded.add(root.orgId);
        });
        setExpandedIds(newExpanded);
    }, [companyCode, orgList]); // orgList 의존성 추가

    // 마운트 시 저장된 펼침 상태 불러오기
    useEffect(() => {
        const saved = localStorage.getItem("orgTree_expandedIds");
        if (saved) {
            try {
                const idsArray = JSON.parse(saved);
                setExpandedIds(new Set(idsArray));
            } catch (e) { console.error(e); }
        }
    }, []);

    // 펼침 상태가 바뀔 때마다 저장
    useEffect(() => {
        if (expandedIds.size > 0) {
            const idsArray = Array.from(expandedIds);
            localStorage.setItem("orgTree_expandedIds", JSON.stringify(idsArray));
        }
    }, [expandedIds]);

    // 선택된 조직 자동 확장
    useEffect(() => {
        if (!selectedOrgId) return;

        setExpandedIds(prev => {
            // 기존 펼침 상태 유지
            const nextExpanded = new Set<string>(prev);
            let currentId = selectedOrgId;
            let safety = 0;

            // 부모 경로를 찾아 확장 목록에 추가
            while (currentId && safety < 100) {
                // Map이 있으면 O(1), 없으면 O(N)
                const node = orgMap ? orgMap.get(currentId) : orgList.find(o => o.orgId === currentId);

                if (node && node.parentId) {
                    nextExpanded.add(node.parentId);
                    currentId = node.parentId;
                } else {
                    break;
                }
                safety++; //안전장치...! 무한루프 돌면 안되니까 
            }
            return nextExpanded;
        });
    }, [selectedOrgId]);

    // 선택된 조직으로 자동 스크롤
    useEffect(() => {
        if (selectedOrgId) {
            // 트리 확장이 반영된 후 스크롤하기 위해 약간의 지연 시간 부여
            setTimeout(() => {
                const element = document.getElementById(`org-node-${selectedOrgId}`);
                if (element) {
                    element.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            }, 100);
        }
    }, [selectedOrgId]);

    // 검색 트리거 (엔터 또는 버튼 클릭 시)
    const triggerSearch = () => {
        const term = searchTerm.trim();
        setActiveSearchTerm(term);

        // 부서 외 검색이면 이벤트 전달
        if (searchCategory !== 'dept') {
            if (onSearch) {
                onSearch(searchCategory, term);
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            triggerSearch();
        }
    };

    // 검색 필터링 (부서명인 경우 우측에 표시되는 임직원 목록이 아닌 조직도 맵에 찾는 부서가 포함된 트리만 표시)
    const filteredTree = useMemo(() => {
        if (searchCategory === 'dept' && activeSearchTerm) {
            return filterTree(data, activeSearchTerm, ['orgName', 'orgId']);
        }
        return data; // 다른 카테고리일 때는 전체 트리 표시 (필터링 안함)
    }, [data, activeSearchTerm, searchCategory]);

    // 노드 토글
    const handleToggle = (node: OrgTreeNode) => {
        const newExpanded = new Set(expandedIds);
        if (newExpanded.has(node.orgId)) {
            newExpanded.delete(node.orgId);
        } else {
            newExpanded.add(node.orgId);
        }
        setExpandedIds(newExpanded);
    };

    // 선택
    const handleSelect = (node: OrgTreeNode) => {
        onSelectOrg(node);
    };

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value);
    };

    // 검색 시 자동 펼침/초기화 (activeSearchTerm 기준)
    useEffect(() => {
        if (searchCategory === 'dept') {
            if (activeSearchTerm) {
                setExpandedIds(getAllIds(filteredTree));
            } else {
                // 초기화 시 1레벨만
                const initialExpanded = new Set<string>();
                data.forEach(root => {
                    initialExpanded.add(root.orgId);
                });
                setExpandedIds(initialExpanded);
            }
        }
    }, [activeSearchTerm, filteredTree, searchCategory, data]);

    return (
        <div style={treeContainerStyle}>
            {/* 상단 제어 영역 */}
            <div style={topControlAreaStyle}>

                {/* 회사 선택 */}
                <select
                    style={companySelectStyle}
                    value={companyCode}
                    onChange={(e) => setCompanyCode(e.target.value)}
                >
                    <option value="ALL">그룹사 전체</option>
                    <option value="AD">아성 다이소</option>
                    <option value="AH">아성HMP</option>
                    <option value="AS">아성</option>
                    <option value="HW">한웰</option>
                    <option value="HE">한웰이쇼핑</option>
                    <option value="HS">한웰국제무역(상해)</option>
                </select>

                {/* 검색 row */}
                <div style={searchRowStyle}>
                    <select
                        style={searchSelectStyle}
                        value={searchCategory}
                        onChange={(e) => setSearchCategory(e.target.value)}
                    >
                        {SEARCH_CATEGORIES.map(cat => (
                            <option key={cat.value} value={cat.value}>{cat.label}</option>
                        ))}
                    </select>
                    <div style={searchInputWrapperStyle}>
                        <input
                            type="text"
                            placeholder=""
                            style={searchInputStyle}
                            value={searchTerm}
                            onChange={handleSearchChange}
                            onKeyDown={handleKeyDown}
                        />
                        <button style={searchButtonStyle} onClick={triggerSearch}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            {/* 트리 영역 */}
            <div style={treeContentStyle}>
                {filteredTree.map((node, index) => (
                    <OrgTreeItem
                        key={node.orgId}
                        node={node}
                        depth={0}
                        expandedIds={expandedIds}
                        selectedId={selectedOrgId}
                        onToggle={handleToggle}
                        onSelect={handleSelect}
                        highlightTerm={searchCategory === 'dept' ? activeSearchTerm : undefined}
                        memberCounts={memberCounts}
                    />
                ))}
            </div>
        </div>
    );
};

interface OrgTreeItemProps {
    node: OrgTreeNode;
    depth: number;
    expandedIds: Set<string>;
    selectedId?: string;
    onToggle: (node: OrgTreeNode) => void;
    onSelect: (node: OrgTreeNode) => void;
    highlightTerm?: string; // 하이라이트 할 검색어
    memberCounts?: Map<string, number>; // 부서원 수 Map
}

// 텍스트 하이라이트 함수
const highlightText = (text: string, term?: string) => {
    if (!term || term.trim() === '') {
        return <span>{text}</span>;
    }
    const parts = text.split(new RegExp(`(${term})`, 'gi'));
    return (
        <span>
            {parts.map((part, i) =>
                part.toLowerCase() === term.toLowerCase() ? (
                    <span key={i} style={{ backgroundColor: theme.colors.highlight, fontWeight: 'bold' }}>
                        {part}
                    </span>
                ) : (
                    part
                )
            )}
        </span>
    );
};

const OrgTreeItem: React.FC<OrgTreeItemProps> = ({ node, depth, expandedIds, selectedId, onToggle, onSelect, highlightTerm, memberCounts }) => {
    const isExpanded = expandedIds.has(node.orgId);
    const isSelected = selectedId === node.orgId;
    const hasChildren = node.children && node.children.length > 0;
    const count = memberCounts?.get(node.orgId) || 0; // 인원수 조회

    const handleIconClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (hasChildren) {
            onToggle(node);
        }
    };

    const handleTextClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSelect(node);
    };

    // Hover State
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div>
            <div
                id={`org-node-${node.orgId}`} // 스크롤 타겟팅용 ID
                style={{
                    ...itemContainerStyle,
                    paddingLeft: `${depth * 20 + 10}px`,
                    backgroundColor: isSelected ? theme.colors.bgSelected : "transparent",
                    transition: "background-color 0.2s",
                }}
            >
                <div style={itemContentStyle}>
                    <div style={folderIconContainerStyle} onClick={handleIconClick}>
                        <img src={folderIcon} alt="folder" style={folderImgStyle} />
                        {hasChildren && (
                            <span style={overlayIndicatorStyle}>
                                {isExpanded ? "-" : "+"}
                            </span>
                        )}
                    </div>

                    <span
                        style={{
                            fontSize: "14px",
                            color: isSelected || isHovered ? theme.colors.primary : theme.colors.textMain,
                            fontWeight: isSelected ? "bold" : "normal",
                            cursor: "pointer",
                            transition: "color 0.2s"
                        }}
                        onClick={handleTextClick}
                        onMouseEnter={() => setIsHovered(true)}
                        onMouseLeave={() => setIsHovered(false)}
                    >
                        <div style={{ marginLeft: "8px" }}>
                            {highlightText(node.orgName, highlightTerm)}
                            {/* 인원수 표시 */}
                            <span style={{ fontSize: "12px", color: theme.colors.textSecondary, marginLeft: "4px" }}>
                                ({count})
                            </span>
                        </div>
                    </span>
                </div>
            </div>

            {hasChildren && isExpanded && (
                <div>
                    {node.children.map((child, index) => (
                        <OrgTreeItem
                            key={child.orgId}
                            node={child}
                            depth={depth + 1}
                            expandedIds={expandedIds}
                            selectedId={selectedId}
                            onToggle={onToggle}
                            onSelect={onSelect}
                            highlightTerm={highlightTerm}
                            memberCounts={memberCounts} // Prop Drilling
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

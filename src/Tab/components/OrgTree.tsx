import React, { useState, useEffect, useMemo } from "react";
import { buildOrgTree, filterTree, getAllIds } from "../utils/orgTreeUtils";
import { OrgData, OrgTreeNode } from "../types";
import { Folder24Regular, FolderOpen24Regular, PeopleTeam24Regular, Building24Regular } from "@fluentui/react-icons";
import { theme } from "../constants/theme";
import {
    treeContainerStyle, topControlAreaStyle, companySelectStyle,
    searchRowStyle, searchSelectStyle, searchInputWrapperStyle,
    searchInputStyle, searchButtonStyle, treeContentStyle,
    itemContainerStyle, itemContentStyle, folderIconContainerStyle,
} from "./OrgTree.styles";


// 검색 카테고리
const SEARCH_CATEGORIES = [
    { value: "user", label: "사용자" },
    { value: "dept", label: "부서명" },
    { value: "extension", label: "내선번호" },
    { value: "mobile", label: "핸드폰" },
    { value: "position", label: "직위" },
    { value: "jobTitle", label: "직책" },
    { value: "email", label: "이메일" },
];

export interface OrgTreeViewProps {
    onSelectOrg: (org: OrgData) => void;
    selectedOrgId?: string;
    // 충돌 시 여기서 onSearch를 제거하지만, 검색 트리거가 필요합니다.
    onSearchTrigger?: (category: string, term: string) => void; // 필요한 경우 부모의 메인 검색(그리드) 또는 트리 검색용?
    // 그리드(전역 검색)에 대한 부모의 검색 핸들러는 onSearch입니다.
    // 하지만 여기에는 트리 검색(하이라이트)도 있습니다.
    // "전역 검색"(임직원 그리드 업데이트)의 트리거로 onSearch를 유지합시다.
    onSearch?: (category: string, term: string) => void;


    memberCounts?: Map<string, number>;
    orgList: OrgData[];

    // [제어 컴포넌트를 위한 새로운 Props]
    companyCode: string;
    onCompanyChange: (code: string) => void;

    expandedIds: Set<string>;
    onExpandChange: (ids: Set<string>) => void;

    // 트리 검색 Props (트리 내 시각적 필터링)
    searchTerm: string;
    onSearchTermChange: (term: string) => void;
    searchCategory: string;
    onSearchCategoryChange: (category: string) => void;

    // 트리 노드 필터링을 위한 활성 검색어
    activeSearchTerm: string;
    onActiveSearchTermChange: (term: string) => void;
}

// 왼쪽 조직도 전체 컴포넌트 (검색, 조직도 맵)
export const OrgTreeView: React.FC<OrgTreeViewProps> = ({
    onSelectOrg,
    selectedOrgId,
    onSearch,
    memberCounts,
    orgList,
    companyCode,
    onCompanyChange,
    expandedIds,
    onExpandChange,
    searchTerm,
    onSearchTermChange,
    searchCategory,
    onSearchCategoryChange,
    activeSearchTerm,
    onActiveSearchTermChange
}) => {
    const [data, setData] = useState<OrgTreeNode[]>([]);

    // 데이터 로드 (회사 코드 변경 시)
    useEffect(() => {
        if (!orgList || orgList.length === 0) return;

        const tree: OrgTreeNode[] = buildOrgTree(orgList, companyCode === 'ALL' ? undefined : companyCode);
        setData(tree);

        // [참고] 초기 확장 로직은 부모 컴포넌트에서 담당하거나, 여기서 데이터 변경 시에만 제한적으로 수행합니다.
        // State Lifting(상태 끌어올리기)의 목적에 따라, 데이터가 변경되었을 때 트리를 다시 그리는 것은 맞지만,
        // '어떤 노드를 펼칠지'는 부모의 State(expandedIds)가 결정합니다.
        // 단, 회사 코드가 변경되었을 때 "루트 노드 자동 펼침" 같은 편의 기능은 여기서 수행해도 됩니다.
        // 하지만 복원 로직과 충돌하지 않도록 주의해야 합니다.
        // -> 복원 시에는 expandedIds가 이미 채워져서 전달될 것입니다.
        // -> 따라서 여기서는 "데이터 변경 시 expandedIds가 비어있다면 루트만 펼친다" 정도로 타협하거나
        // -> 아예 부모 컴포넌트가 데이터 로드 시점에 결정하도록 위임하는 것이 가장 깔끔합니다.
        // -> 우선 여기서는 Data(트리 구조)만 갱신합니다.

    }, [companyCode, orgList]);



    // 자동 스크롤 로직: selectedOrgId가 변경되면 해당 노드로 스크롤 이동
    // (단, 해당 노드가 화면에 렌더링되어 있어야 하므로 expandedIds가 선행 업데이트 되어야 함)
    useEffect(() => {
        if (selectedOrgId) {
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
        onActiveSearchTermChange(term); // 부모의 활성 검색어 업데이트

        // 검색 이벤트 부모에 전달 (부서명 검색 포함)
        if (onSearch) {
            onSearch(searchCategory, term);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            triggerSearch();
        }
    };

    // 검색 필터링 (부서명인 경우, 우측에 표시되는 임직원 목록이 아닌 조직도 맵에 찾는 부서가 포함된 트리만 표시)
    const filteredTree = useMemo(() => {
        if (searchCategory === 'dept' && activeSearchTerm) {
            return filterTree(data, activeSearchTerm, ['orgName', 'orgId']);
        }
        return data;
    }, [data, activeSearchTerm, searchCategory]);

    // 노드 토글
    const handleToggle = (node: OrgTreeNode) => {
        const newExpanded = new Set(expandedIds);
        if (newExpanded.has(node.orgId)) {
            newExpanded.delete(node.orgId);
        } else {
            newExpanded.add(node.orgId);
        }
        onExpandChange(newExpanded);
    };

    // 선택
    const handleSelect = (node: OrgTreeNode) => {
        // 부서 선택 시 "검색 모드"가 아니면(또는 부서 검색 중이면) 해당 경로를 펼칠지 여부?
        // 부모 컴포넌트가 onSelectOrg 내부에서 처리하거나, 여기서 처리해서 전달할 수 있습니다.
        // 부모 컴포넌트가 로직을 취합하는 것이 좋습니다.
        onSelectOrg(node);
    };

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onSearchTermChange(e.target.value);
    };

    // 검색 시 자동 확장 (부모/Effect 로직)
    // 필터링된 트리가 변경되었을 때 "모두 펼치기"는 UI 로직에 가깝습니다.
    // filteredTree가 변할 때 -> expandedIds 업데이트
    // 이것도 부모 컴포넌트로 올릴 수 있지만, filteredTree가 여기서 계산되므로
    // 여기서 계산된 ID들을 부모로 올려주는 Effect를 사용합니다.
    useEffect(() => {
        if (searchCategory === 'dept') {
            if (activeSearchTerm) {
                onExpandChange(getAllIds(filteredTree));
            } else {
                // 검색어가 지워지면? -> 초기화 또는 유지? 
                // 기존 로직: 초기화 (루트만)
                // 부모 State 변경
                // 복원 시나리오 고려: 검색어 있는 상태로 로드 -> filteredTree 계산됨 -> 이 Effect 발동 -> 모두 펼쳐짐 (OK)
            }
        }
    }, [activeSearchTerm, filteredTree, searchCategory]); // data 의존성 제외 (무한루프 주의)


    return (
        <div style={treeContainerStyle}>
            {/* 상단 제어 영역 */}
            <div style={topControlAreaStyle}>

                {/* 회사 선택 */}
                <select
                    style={companySelectStyle}
                    value={companyCode}
                    onChange={(e) => onCompanyChange(e.target.value)}
                >
                    <option value="ALL">그룹사 전체</option>
                    <option value="AD">아성다이소</option>
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
                        onChange={(e) => onSearchCategoryChange(e.target.value)}
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
                    <span key={i} style={{ fontWeight: 'bold' }}>
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

    // Hover 상태
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
                        {node.orgLevel === 0 ? (
                            // 회사 (Root)
                            <Building24Regular color={theme.colors.primary} />
                        ) : hasChildren ? (
                            isExpanded ? (
                                <FolderOpen24Regular color={theme.colors.primary} />
                            ) : (
                                <Folder24Regular color={theme.colors.primary} />
                            )
                        ) : (
                            // 자식이 없는 경우 (팀/말단 조직)
                            <PeopleTeam24Regular color={theme.colors.primary} />
                        )}
                    </div>

                    <span
                        style={{
                            fontSize: "14px",
                            color: isSelected || isHovered ? theme.colors.primary : theme.colors.textMain,
                            fontWeight: isSelected || isHovered ? "bold" : "normal",
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
                            <span style={{ fontSize: "12px", color: isSelected || isHovered ? theme.colors.primary : theme.colors.textSecondary, marginLeft: "4px" }}>
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

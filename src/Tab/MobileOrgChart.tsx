import React, { useState, useMemo, useEffect, useCallback } from "react";
import { app } from "@microsoft/teams-js";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { useTeamsAuth } from "./hooks/useTeamsAuth";
import { useOrgChartData } from "./hooks/useOrgChartData";
import { useUserPresence } from "./hooks/useUserPresence";
import { PresenceBadge } from "./components/PresenceBadge";
import { Toast } from "./components/Toast";
import { Spinner } from "./components/Spinner";
import { Employee, OrgData, OrgTreeNode, UserPresence } from "./types";
import { buildOrgTree, calculateTotalCounts, getAllAncestorIds } from "./utils/orgTreeUtils";
import { theme } from "./constants/theme";
import copyIcon from "../assets/copy.png";
import { Folder24Regular, FolderOpen24Regular, PeopleTeam24Regular, Building24Regular } from "@fluentui/react-icons";
import { Call24Regular, Chat24Regular, Calendar24Regular, Mail24Regular, Search24Regular } from "@fluentui/react-icons";

// ============================
// 모바일 조직도 메인 컴포넌트
// ============================
export default function MobileOrgChart() {
    // --- 인증 & 데이터 ---
    const { token, currentUserEmail, isAuthLoading } = useTeamsAuth();
    const { data, isLoading: isApiLoading } = useOrgChartData(token);
    const orgList: OrgData[] = data?.orgList || [];
    const empList: Employee[] = data?.empList || [];

    // --- 상태 ---
    const [companyCode, setCompanyCode] = useState("AD");
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [searchInput, setSearchInput] = useState(""); // 입력창 실시간 값
    const [activeSearchTerm, setActiveSearchTerm] = useState(""); // 실제 검색 실행된 값 (엔터/버튼 클릭 시)
    const [selectedUser, setSelectedUser] = useState<Employee | null>(null);
    const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const isLoading = isApiLoading || isAuthLoading;

    // --- 메모 ---
    const orgMap = useMemo(() => new Map(orgList.map(o => [o.orgId, o])), [orgList]);

    const treeData = useMemo(() => buildOrgTree(orgList, companyCode === "ALL" ? undefined : companyCode), [orgList, companyCode]);

    // 회사 목록을 데이터에서 동적으로 추출
    const companyOptions = useMemo(() => {
        const map = new Map<string, string>(); // code -> name
        orgList.forEach(o => {
            if (o.orgLevel === 0 && o.companyCode) {
                // 회사(root) 노드에서 추출
                map.set(o.companyCode, o.orgName);
            }
        });
        return Array.from(map.entries()); // [[code, name], ...]
    }, [orgList]);

    const memberCounts = useMemo(() => {
        if (!orgList.length || !empList.length || !treeData.length) return new Map<string, number>();
        const direct = new Map<string, number>();
        empList.forEach(emp => {
            if (companyCode !== "ALL" && emp.companyCode !== companyCode) return;
            direct.set(emp.orgId, (direct.get(emp.orgId) || 0) + 1);
        });
        return calculateTotalCounts(treeData, direct);
    }, [treeData, empList, orgList, companyCode]);

    // 조직별 직원 빠른 조회용 Map
    const empByOrgId = useMemo(() => {
        const map = new Map<string, Employee[]>();
        empList.forEach(emp => {
            if (companyCode !== "ALL" && emp.companyCode !== companyCode) return;
            const list = map.get(emp.orgId) || [];
            list.push(emp);
            map.set(emp.orgId, list);
        });
        return map;
    }, [empList, companyCode]);

    // 통합 검색 필터 (이름/부서/핸드폰/내선/이메일/직위/직책)
    const searchFilter = useCallback((emp: Employee) => {
        if (!activeSearchTerm) return true;
        const t = activeSearchTerm.toLowerCase();
        return (
            emp.name?.toLowerCase().includes(t) ||
            emp.department?.toLowerCase().includes(t) ||
            emp.mobile?.includes(t) ||
            emp.extension?.includes(t) ||
            emp.email?.toLowerCase().includes(t) ||
            emp.position?.toLowerCase().includes(t) ||
            emp.role?.toLowerCase().includes(t)
        );
    }, [activeSearchTerm]);

    // 검색 시 매칭되는 조직 ID 집합
    const matchedOrgIds = useMemo(() => {
        if (!activeSearchTerm) return null;
        const ids = new Set<string>();
        empList.forEach(emp => {
            if (companyCode !== "ALL" && emp.companyCode !== companyCode) return;
            if (searchFilter(emp)) ids.add(emp.orgId);
        });
        return ids;
    }, [activeSearchTerm, empList, companyCode, searchFilter]);

    // Presence용 이메일 목록 (펼쳐진 조직의 직원들만)
    const visibleEmails = useMemo(() => {
        const emails: string[] = [];
        expandedIds.forEach(orgId => {
            const emps = empByOrgId.get(orgId) || [];
            emps.forEach(e => { if (e.email) emails.push(e.email); });
        });
        if (selectedUser?.email) emails.push(selectedUser.email);
        return [...new Set(emails)];
    }, [expandedIds, empByOrgId, selectedUser]);

    const { presenceMap } = useUserPresence(visibleEmails, token, true); // 모바일: 새 이메일만 요청

    // --- 루트(회사) 노드 ID 수집 헬퍼 ---
    const getRootIds = useCallback((tree: OrgTreeNode[]) => {
        const ids = new Set<string>();
        tree.forEach(root => {
            ids.add(root.orgId); // 회사(루트)만
        });
        return ids;
    }, []);

    // --- 초기화: 내 회사 자동 선택 + 내 부서까지 펼쳐서 표시 ---
    useEffect(() => {
        if (isLoading || !data || !currentUserEmail) return;
        const me = empList.find(e => e.email.toLowerCase() === currentUserEmail.toLowerCase());
        if (me) {
            const myOrg = orgMap.get(me.orgId);
            if (myOrg?.companyCode) {
                setCompanyCode(myOrg.companyCode);
                // 내 부서까지 경로 자동 펼침
                const tree = buildOrgTree(orgList, myOrg.companyCode);
                const level1 = getRootIds(tree);
                const ancestors = getAllAncestorIds(me.orgId, orgMap);
                ancestors.add(me.orgId); // 내 부서 자체도 펼치기
                setExpandedIds(new Set([...level1, ...ancestors]));
            }
        } else {
            // 사용자 못 찾으면 기본 레벨 1까지 펼침
            const tree = buildOrgTree(orgList, companyCode === "ALL" ? undefined : companyCode);
            setExpandedIds(getRootIds(tree));
        }
    }, [data, isLoading, currentUserEmail]);

    // --- 회사 변경 시 레벨 1까지 자동 펼침 ---
    const handleCompanyChange = (code: string) => {
        setCompanyCode(code);
        const tree = buildOrgTree(orgList, code === "ALL" ? undefined : code);
        setExpandedIds(getRootIds(tree));
    };

    // --- 검색 실행 ---
    const executeSearch = () => {
        setActiveSearchTerm(searchInput.trim());
        // 검색 실행 시 트리 전체 펼침 (검색 결과 보이도록)
        if (searchInput.trim()) {
            // 매칭되는 조직들의 상위 경로 전부 펼침
            const ids = new Set<string>();
            empList.forEach(emp => {
                if (companyCode !== "ALL" && emp.companyCode !== companyCode) return;
                const t = searchInput.trim().toLowerCase();
                const matched =
                    emp.name?.toLowerCase().includes(t) ||
                    emp.department?.toLowerCase().includes(t) ||
                    emp.mobile?.includes(t) ||
                    emp.extension?.includes(t) ||
                    emp.email?.toLowerCase().includes(t) ||
                    emp.position?.toLowerCase().includes(t) ||
                    emp.role?.toLowerCase().includes(t);
                if (matched) {
                    ids.add(emp.orgId);
                    const ancestors = getAllAncestorIds(emp.orgId, orgMap);
                    ancestors.forEach(a => ids.add(a));
                }
            });
            setExpandedIds(ids);
        }
    };

    // --- 핸들러 ---
    const handleToggle = (orgId: string) => {
        const next = new Set(expandedIds);
        if (next.has(orgId)) next.delete(orgId);
        else next.add(orgId);
        setExpandedIds(next);
    };

    const handleCheck = (empId: string) => {
        const next = new Set(checkedIds);
        if (next.has(empId)) next.delete(empId);
        else next.add(empId);
        setCheckedIds(next);
    };

    const handleCopy = (text: string) => {
        if (!text || text === "-") return;
        navigator.clipboard.writeText(text).then(() => {
            setToastMessage(`"${text}" 복사 완료`);
        });
    };

    const openDeepLink = (type: 'chat' | 'call' | 'meeting' | 'mail', emails: string[]) => {
        if (!emails.length) return;
        const joined = emails.join(',');
        let url = "";
        switch (type) {
            case 'chat': url = `https://teams.microsoft.com/l/chat/0/0?users=${joined}`; break;
            case 'call': url = `https://teams.microsoft.com/l/call/0/0?users=${joined}`; break;
            case 'meeting': url = `https://teams.microsoft.com/l/meeting/new?attendees=${joined}`; break;
            case 'mail': window.location.href = `mailto:${joined}`; return;
        }
        if (url) app.openLink(url).catch(() => window.open(url, '_blank'));
    };

    const getCheckedEmails = () => empList.filter(e => checkedIds.has(e.id)).map(e => e.email).filter(Boolean);

    // --- 로딩 ---
    if (isLoading) {
        return (
            <FluentProvider theme={webLightTheme}>
                <div style={{ width: "100vw", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Spinner />
                </div>
            </FluentProvider>
        );
    }

    // ============================
    // 렌더링
    // ============================
    return (
        <FluentProvider theme={webLightTheme}>
            <div style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column", fontFamily: "'Segoe UI', 'Malgun Gothic', sans-serif", backgroundColor: theme.colors.bgMain }}>

                {/* ── 상단: 검색 + 회사 선택 ── */}
                <div style={{ padding: "12px", backgroundColor: theme.colors.bgWhite, borderBottom: `1px solid ${theme.colors.border}`, display: "flex", gap: "8px", flexShrink: 0 }}>
                    <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center" }}>
                        <input
                            type="text"
                            placeholder="이름, 부서, 전화번호 등 통합 검색"
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") executeSearch(); }}
                            style={{ width: "100%", padding: "10px 40px 10px 12px", border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.medium, fontSize: "14px", outline: "none" }}
                        />
                        <button
                            onClick={executeSearch}
                            style={{ position: "absolute", right: "4px", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", padding: "6px", color: theme.colors.primary }}
                        >
                            <Search24Regular />
                        </button>
                    </div>
                    <select
                        value={companyCode}
                        onChange={e => handleCompanyChange(e.target.value)}
                        style={{ padding: "10px 8px", border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.medium, fontSize: "13px", backgroundColor: theme.colors.bgWhite }}
                    >
                        <option value="ALL">전체</option>
                        {companyOptions.map(([code, name]) => (
                            <option key={code} value={code}>{name}</option>
                        ))}
                    </select>
                </div>

                {/* ── 메인: 조직도 + 직원 통합 트리 ── */}
                <div style={{ flex: 1, overflowY: "auto", paddingBottom: checkedIds.size > 0 ? "64px" : "0" }}>
                    {treeData.map(node => (
                        <MobileTreeNode
                            key={node.orgId}
                            node={node}
                            depth={0}
                            expandedIds={expandedIds}
                            onToggle={handleToggle}
                            empByOrgId={empByOrgId}
                            memberCounts={memberCounts}
                            presenceMap={presenceMap}
                            checkedIds={checkedIds}
                            onCheck={handleCheck}
                            onSelectUser={setSelectedUser}
                            searchFilter={searchFilter}
                            matchedOrgIds={matchedOrgIds}
                        />
                    ))}
                </div>

                {/* ── 하단 선택 액션바 ── */}
                {checkedIds.size > 0 && (
                    <div style={{
                        position: "fixed", bottom: 0, left: 0, right: 0,
                        backgroundColor: theme.colors.bgWhite,
                        borderTop: `1px solid ${theme.colors.border}`,
                        padding: "10px 16px",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        boxShadow: "0 -2px 8px rgba(0,0,0,0.1)",
                        animation: "slideUp 0.2s ease-out",
                        zIndex: 100,
                    }}>
                        <button onClick={() => setCheckedIds(new Set())} style={{ background: "none", border: "none", fontSize: "14px", color: theme.colors.danger, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
                            ✕ 모두해제
                        </button>
                        <span style={{ fontSize: "14px", fontWeight: "600", color: theme.colors.textMain }}>{checkedIds.size}명 선택</span>
                        <div style={{ display: "flex", gap: "12px" }}>
                            <ActionBtn icon={<Call24Regular />} onClick={() => openDeepLink('call', getCheckedEmails())} />
                            <ActionBtn icon={<Chat24Regular />} onClick={() => openDeepLink('chat', getCheckedEmails())} />
                            <ActionBtn icon={<Calendar24Regular />} onClick={() => openDeepLink('meeting', getCheckedEmails())} />
                        </div>
                    </div>
                )}

                {/* ── Bottom Sheet: 직원 상세 ── */}
                {selectedUser && (
                    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                        <div onClick={() => setSelectedUser(null)} style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.4)" }} />
                        <div style={{
                            position: "relative", backgroundColor: theme.colors.bgWhite,
                            borderTopLeftRadius: "16px", borderTopRightRadius: "16px",
                            padding: "24px 20px", maxHeight: "75vh", overflowY: "auto",
                            animation: "slideUp 0.3s ease-out",
                        }}>
                            <div style={{ width: "40px", height: "4px", backgroundColor: theme.colors.border, borderRadius: "2px", margin: "0 auto 16px" }} />
                            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                                <PresenceBadge status={presenceMap[selectedUser.email]} showText={false} />
                                <div>
                                    <div style={{ fontSize: "18px", fontWeight: "bold", color: theme.colors.textMain }}>
                                        {selectedUser.name}
                                        <span style={{ fontSize: "14px", fontWeight: "normal", color: theme.colors.textSecondary, marginLeft: "8px" }}>
                                            {selectedUser.position}{selectedUser.role && selectedUser.role !== "-" ? ` (${selectedUser.role})` : ""}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: "13px", color: theme.colors.textSecondary, marginTop: "2px" }}>
                                        {selectedUser.companyName} | {selectedUser.department}
                                    </div>
                                </div>
                            </div>
                            <div style={{ fontSize: "12px", color: theme.colors.textDisabled, marginBottom: "4px" }}>
                                {selectedUser.orgFullName.replace(/ /g, " > ")}
                            </div>
                            <div style={{ fontSize: "13px", color: theme.colors.textSecondary, marginBottom: "16px" }}>
                                <strong>담당업무</strong> : {selectedUser.description || "-"}
                            </div>
                            <div style={{ display: "flex", gap: "12px", marginBottom: "20px", justifyContent: "center" }}>
                                <ActionBtnLabeled icon={<Call24Regular />} label="전화" onClick={() => openDeepLink('call', [selectedUser.email])} />
                                <ActionBtnLabeled icon={<Mail24Regular />} label="메일" onClick={() => openDeepLink('mail', [selectedUser.email])} />
                                <ActionBtnLabeled icon={<Chat24Regular />} label="채팅" onClick={() => openDeepLink('chat', [selectedUser.email])} />
                                <ActionBtnLabeled icon={<Calendar24Regular />} label="모임" onClick={() => openDeepLink('meeting', [selectedUser.email])} />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: "10px", fontSize: "13px" }}>
                                <MobileInfoRow label="핸드폰" value={selectedUser.mobile} onCopy={handleCopy} />
                                <MobileInfoRow label="이메일" value={selectedUser.email} onCopy={handleCopy} />
                                <MobileInfoRow label="내선번호" value={selectedUser.extension} onCopy={handleCopy} />
                            </div>
                        </div>
                    </div>
                )}

                <Toast message={toastMessage || ""} visible={!!toastMessage} onClose={() => setToastMessage(null)} />
                <style>{`
          @keyframes slideUp {
            from { transform: translateY(100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `}</style>
            </div>
        </FluentProvider>
    );
}

// ============================
// 하위 컴포넌트
// ============================

/** 모바일 트리 노드 (조직 + 직원 통합) */
const MobileTreeNode: React.FC<{
    node: OrgTreeNode; depth: number;
    expandedIds: Set<string>; onToggle: (id: string) => void;
    empByOrgId: Map<string, Employee[]>; memberCounts: Map<string, number>;
    presenceMap: Record<string, UserPresence>;
    checkedIds: Set<string>; onCheck: (id: string) => void;
    onSelectUser: (emp: Employee) => void;
    searchFilter: (emp: Employee) => boolean;
    matchedOrgIds: Set<string> | null;
}> = ({ node, depth, expandedIds, onToggle, empByOrgId, memberCounts, presenceMap, checkedIds, onCheck, onSelectUser, searchFilter, matchedOrgIds }) => {
    const isExpanded = expandedIds.has(node.orgId);
    const hasChildren = node.children && node.children.length > 0;
    const count = memberCounts.get(node.orgId) || 0;
    const directEmps = empByOrgId.get(node.orgId) || [];

    // 검색 중이면: 매칭 직원이 있는 조직만 표시
    if (matchedOrgIds) {
        const hasMatch = hasMatchInSubtree(node, matchedOrgIds);
        if (!hasMatch) return null;
    }

    const filteredEmps = matchedOrgIds ? directEmps.filter(searchFilter) : directEmps;


    return (
        <div>
            {/* 조직 노드 */}
            <div
                onClick={() => onToggle(node.orgId)}
                style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    padding: "10px 12px", paddingLeft: `${depth * 20 + 12}px`,
                    cursor: "pointer",
                    borderBottom: `1px solid ${theme.colors.border}`,
                    backgroundColor: isExpanded ? "#f5f5f5" : theme.colors.bgWhite,
                }}
            >
                <div style={{ flexShrink: 0, width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {node.orgLevel === 0 ? (
                        <Building24Regular color={theme.colors.primary} />
                    ) : hasChildren ? (
                        isExpanded ? <FolderOpen24Regular color={theme.colors.primary} /> : <Folder24Regular color={theme.colors.primary} />
                    ) : (
                        <PeopleTeam24Regular color={theme.colors.primary} />
                    )}
                </div>
                <span style={{ fontSize: "14px", fontWeight: "600", color: theme.colors.textMain, flex: 1 }}>
                    {node.orgName}
                </span>
                <span style={{ fontSize: "12px", color: theme.colors.textSecondary }}>({count})</span>
                {/* 펼침 화살표 */}
                {(hasChildren || directEmps.length > 0) && (
                    <span style={{ fontSize: "16px", color: theme.colors.textDisabled, transition: "transform 0.2s", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", lineHeight: 1 }}>›</span>
                )}
            </div>

            {/* 직원 목록: 리프 노드는 항상, 비리프는 펼쳤을 때만 */}
            {isExpanded && filteredEmps.map(emp => (
                <div
                    key={emp.id}
                    style={{
                        display: "flex", alignItems: "center", gap: "10px",
                        padding: "10px 12px", paddingLeft: `${(depth + 1) * 20 + 12}px`,
                        borderBottom: `1px solid ${theme.colors.border}`,
                        backgroundColor: theme.colors.bgWhite,
                    }}
                >
                    <div onClick={() => onSelectUser(emp)} style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, cursor: "pointer" }}>
                        <PresenceBadge status={presenceMap[emp.email]} showText={false} />
                        <div>
                            <span style={{ fontSize: "14px", color: theme.colors.textMain, fontWeight: "500" }}>{emp.name}</span>
                            <span style={{ fontSize: "13px", color: theme.colors.textSecondary, marginLeft: "6px" }}>
                                {emp.position}{emp.role && emp.role !== "-" ? ` (${emp.role})` : ""}
                            </span>
                        </div>
                    </div>
                    <input
                        type="checkbox"
                        checked={checkedIds.has(emp.id)}
                        onChange={() => onCheck(emp.id)}
                        style={{ width: "20px", height: "20px", cursor: "pointer", accentColor: theme.colors.primary }}
                    />
                </div>
            ))}

            {/* 하위 조직 (펼쳤을 때만) */}
            {isExpanded && hasChildren && node.children.map(child => (
                <MobileTreeNode
                    key={child.orgId} node={child} depth={depth + 1}
                    expandedIds={expandedIds} onToggle={onToggle}
                    empByOrgId={empByOrgId} memberCounts={memberCounts}
                    presenceMap={presenceMap}
                    checkedIds={checkedIds} onCheck={onCheck}
                    onSelectUser={onSelectUser}
                    searchFilter={searchFilter} matchedOrgIds={matchedOrgIds}
                />
            ))}
        </div>
    );
};

/** 서브트리에 매칭 직원이 있는지 재귀 확인 */
function hasMatchInSubtree(node: OrgTreeNode, matchedOrgIds: Set<string>): boolean {
    if (matchedOrgIds.has(node.orgId)) return true;
    return node.children?.some(child => hasMatchInSubtree(child, matchedOrgIds)) || false;
}

/** 액션 버튼 (아이콘만) */
const ActionBtn: React.FC<{ icon: React.ReactNode; onClick: () => void }> = ({ icon, onClick }) => (
    <button onClick={onClick} style={{
        background: "none", border: "none", cursor: "pointer",
        color: theme.colors.primary, display: "flex", alignItems: "center",
        padding: "6px",
    }}>
        {icon}
    </button>
);

/** 액션 버튼 (아이콘 + 라벨) */
const ActionBtnLabeled: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void }> = ({ icon, label, onClick }) => (
    <button onClick={onClick} style={{
        background: "none", border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radius.medium, cursor: "pointer",
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: "10px 16px", gap: "4px", color: theme.colors.primary,
        minWidth: "60px",
    }}>
        {icon}
        <span style={{ fontSize: "11px", color: theme.colors.textSecondary }}>{label}</span>
    </button>
);

/** 모바일 정보 행 (라벨 + 값 + 복사) */
const MobileInfoRow: React.FC<{ label: string; value: string; onCopy: (t: string) => void }> = ({ label, value, onCopy }) => (
    <div style={{ display: "contents" }}>
        <div style={{ color: theme.colors.textSecondary, fontWeight: "500" }}>{label}</div>
        <div style={{ color: theme.colors.textMain, display: "flex", alignItems: "center", gap: "6px" }}>
            {value || "-"}
            {value && value !== "-" && (
                <button onClick={() => onCopy(value)} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", display: "flex", alignItems: "center", opacity: 0.7 }}>
                    <img src={copyIcon} alt="copy" style={{ width: "13px", height: "13px" }} />
                </button>
            )}
        </div>
    </div>
);

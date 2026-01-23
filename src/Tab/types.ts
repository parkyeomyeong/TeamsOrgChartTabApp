// 직원 데이터 인터페이스
export interface Employee {
    id: string; // 고유 ID (User Principal Name 또는 GUID) - 프론트엔드용 매핑
    name: string; // 이름
    position: string; // 직위 (e.g. 과장, 대리)
    role: string; // 직책 (e.g. 팀장)
    department: string; // 부서명
    orgFullName: string; // 조직 전체 경로명 (예: 아성다이소 > 인사본부 > 인사총무부)
    orgId: string; // 부서 ID (트리 연동용)
    extension: string; // 내선 번호
    mobile: string; // 휴대폰 번호
    email: string; // 이메일 주소
    companyName: string; // 회사명 (e.g. 아성다이소)
}

// 조직도 데이터 인터페이스
export interface OrgData {
    orgId: string;        // ORG_ID
    orgName: string;      // ORG_NM
    orgFullName: string;  // ORG_FULL_NM
    orgLevel: number;     // ORG_LVL
    parentId: string;     // PARENT_ID
    sortCode: string;     // SORT_CD
    companyCode: string;  // COMP_CD
}

// 트리 노드 인터페이스 definition
export interface OrgTreeNode extends OrgData {
    children: OrgTreeNode[];
    hasChildren: boolean; // UI에서 + 아이콘 표시 여부 판단용
}

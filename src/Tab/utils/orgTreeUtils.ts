// 임직원 데이터
export interface empData {
    empId: string,
    empNm: string,
    jobTitleDesc: string,
    jobTitileCd: string,
    posisionDesc: string,
    posisionCd: string,
    compCd: string,
    orgId: string,
    orgNm: string,
    offcTelNo: string,
    moblTelNo: string,
    emailAddr: string
}

// 조직도 데이터 타입 정의
export interface OrgData {
    orgId: string;        // ORG_ID
    orgName: string;      // ORG_NM
    orgFullName: string;  // ORG_FULL_NM
    orgLevel: number;     // ORG_LVL
    parentId: string; // PARENT_ID (이미지상에 숫자와 'AD'같은 문자가 섞여 있음)
    sortCode: string;     // SORT_CD
    companyCode: string;  // COMP_CD (이미지 상 7번째 컬럼으로 추정)
}

// 트리 노드 인터페이스 정의
export interface OrgTreeNode extends OrgData {
    children: OrgTreeNode[];
    hasChildren: boolean; // UI에서 + 아이콘 표시 여부 판단용
}

/**
 * 평탄한(Flat) 리스트를 트리 구조로 변환합니다.
 * @param list 전체 조직 목록
 * @param companyCode 필터링할 회사 코드 (선택 사항)
 */
export const buildOrgTree = (list: OrgData[], companyCode?: string): OrgTreeNode[] => {
    const nodeMap = new Map<string, OrgTreeNode>();
    const roots: OrgTreeNode[] = [];

    // 1. 모든 노드를 Map에 등록 및 초기화
    list.forEach((item) => {
        // 회사 코드가 지정되어 있고, 해당 회사의 데이터가 아니면 건너뜀 (단, orgLevel 0인 회사 자체는 포함할 수도 있음 로직에 따라 결정)
        // 여기서는 회사 선택 시 해당 회사 하위 트리만 보여주는 것을 가정
        // 단, "전체" 선택 시 모든 회사(Level 0)가 Root가 됨

        // 회사 코드 필터링 로직:
        // 만약 특정 회사(예: 'AD')가 선택되었다면, companyCode가 'AD'인 것들만 처리
        // 단, 'companyCode' 만으로는 계층이 끊길 수 있으므로 주의 필요. 
        // 다행히 더미데이터는 동일 companyCode끼리 묶여있는 것으로 보임.

        if (companyCode && companyCode !== 'ALL' && item.companyCode !== companyCode) {
            return;
        }

        nodeMap.set(item.orgId, { ...item, children: [], hasChildren: false });
    });

    // 2. 부모-자식 연결
    nodeMap.forEach((node) => {
        // Level 0은 최상위 (회사)
        if (node.orgLevel === 0) {
            roots.push(node);
        } else {
            const parent = nodeMap.get(node.parentId);
            if (parent) {
                parent.children.push(node);
                parent.hasChildren = true;
            } else {
                // 부모가 없는데 Level 0이 아니면? (혹은 필터링으로 부모가 잘린 경우)
                // 이 경우 고아 노드가 되는데, 회사 필터링 시 흔히 발생할 수 있음.
                // 여기서는 일단 무시하거나, 상황에 따라 Root로 취급해야 함.
                // 현재 로직상 CompanyCode로 필터하면 부모(회사)도 포함되므로 문제 없을 것으로 예상.
            }
        }
    });


    return roots;
};

/**
 * 검색어에 따라 트리를 필터링합니다.
 * 검색어가 포함된 노드와 그 상위부서를 남깁니다.
 */
export const filterTree = (nodes: OrgTreeNode[], keyword: string, searchFields?: (keyof OrgData)[]): OrgTreeNode[] => {
    if (!keyword) return nodes;

    const lowerKeyword = keyword.toLowerCase();

    const filterRecursive = (node: OrgTreeNode): OrgTreeNode | null => {
        // 1. 자식들 먼저 필터링
        const filteredChildren = node.children
            .map(child => filterRecursive(child))
            .filter((child): child is OrgTreeNode => child !== null);

        // 2. 검색 조건 매칭 확인 (검색조건이 부서이름, 부서 코드가 있으며 추후 추가 될 수도 있음)
        let isMatch = false;
        if (searchFields && searchFields.length > 0) {
            // 지정된 필드들 내에서 검색
            isMatch = searchFields.some(field => {
                const val = node[field];
                return typeof val === 'string' && val.toLowerCase().includes(lowerKeyword);
            });
        } else {
            // 기본 동작: 이름 또는 전체이름 (기존 로직)
            isMatch = node.orgName.toLowerCase().includes(lowerKeyword) ||
                node.orgFullName.toLowerCase().includes(lowerKeyword);
        }

        // 현재 노드가 검색어에 매칭되거나 자식 노드가 있는 경우 살아남음
        // => 자식 노드가 있는 경우 살아남 는 이유는 살아남은 자식이 검색어에 매칭되는 경우이기 때문에
        // Boottom-Up 방식으로!! 했음
        if (isMatch || filteredChildren.length > 0) {
            return { ...node, children: filteredChildren, hasChildren: filteredChildren.length > 0 };
        }

        return null;
    };

    return nodes
        .map(root => filterRecursive(root))
        .filter((root): root is OrgTreeNode => root !== null);
};

/**
 * 트리의 모든 노드 ID를 수집합니다. (검색 시 전체 확장용)
 */
export const getAllIds = (nodes: OrgTreeNode[]): Set<string> => {
    const ids = new Set<string>();
    const traverse = (node: OrgTreeNode) => {
        ids.add(node.orgId);
        node.children.forEach(traverse);
    };
    nodes.forEach(traverse);
    return ids;
};

/**
 * 특정 부서(orgId)의 하위 모든 부서 ID 목록을 반환합니다. (본인 포함)
 * => 부서 선택 시 하위 모든 부서에 속하는 임직원 목록을 가져오기 위한 용도
 * @param targetOrgId 기준 부서 ID
 * @param allOrgList 전체 조직 데이터 목록 (Flat List)
 */
export const getAllDescendantIds = (targetOrgId: string, allOrgList: OrgData[]): Set<string> => {
    const descendants = new Set<string>();
    descendants.add(targetOrgId);

    // 1. 부모 -> 자식들 매핑 생성 (Adjacency List)
    // 매번 생성하는 것이 비효율적일 수 있으나, 현재 데이터 규모(~1000건)에서는 
    // 성능 이슈가 거의 없으므로 구현 단순성을 위해 함수 내에서 생성.
    // 추후 필요 시 최적화 진행 (조직 클릭할때마다 트리를 만들어서 하위 조직들 목록을 가져오는 구조라서..)
    const childrenMap = new Map<string, string[]>();

    allOrgList.forEach(org => {
        if (org.parentId) {
            const children = childrenMap.get(org.parentId) || [];
            children.push(org.orgId);
            childrenMap.set(org.parentId, children);
        }
    });

    // 2. BFS 탐색
    const queue = [targetOrgId];
    while (queue.length > 0) {
        const currentId = queue.shift()!;
        const children = childrenMap.get(currentId);

        if (children) {
            children.forEach(childId => {
                // 순환 참조 방지 (혹시 모를 더미 데이터 오류 대비)
                if (!descendants.has(childId)) {
                    descendants.add(childId);
                    queue.push(childId);
                }
            });
        }
    }

    return descendants;
};

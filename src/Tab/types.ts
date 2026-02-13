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
    companyCode: string; // 회사 코드 (e.g. AD)
    description: string; // 담당업무
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

export interface UserPresence {
    email: string;
    availability: "Available" | "AvailableIdle" | "Away" | "BeRightBack" | "Busy" | "BusyIdle" | "DoNotDisturb" | "Offline" | "PresenceUnknown";
    activity: "Available" | "Away" | "BeRightBack" | "Busy" | "DoNotDisturb" | "InACall" | "InAConferenceCall" | "Inactive" | "InAMeeting" | "Offline" | "OffWork" | "OutOfOffice" | "PresenceUnknown" | "Presenting" | "UrgentInterruptionsOnly";
}

// 구 버전
// export const PRESENCE_STATUS_MAP: Record<string, { text: string, color: string, icon?: string }> = {
//     "Available": { text: "대화 가능", color: "#6BB700" }, // Green
//     "Busy": { text: "다른 용무 중", color: "#C50F1F" },    // Red
//     "DoNotDisturb": { text: "방해 금지", color: "#C50F1F" }, // Red
//     "BeRightBack": { text: "곧 돌아올게", color: "#FFA500" }, // Yellow/Orange
//     "Away": { text: "자리 비움", color: "#FFA500" },          // Yellow/Orange
//     "OffWork": { text: "오프라인", color: "#8A8886" },         // Grey
//     "PresenceUnknown": { text: "상태 알 수 없음", color: "#8A8886" }, // Grey
//     "OutOfOffice": { text: "외출 중", color: "#B4009E" }, // Purple
// };

export const PRESENCE_STATUS_MAP: Record<string, { text: string, color: string, icon?: string }> = {
    // 🟢 녹색 계열 (가능)
    "Available": { text: "대화 가능", color: "#92C353" },
    "AvailableIdle": { text: "대화 가능 (유휴)", color: "#92C353" }, // 컴퓨터 안 쓰고 있지만 녹색인 경우

    // 🔴 빨간색 계열 (바쁨/방해금지)
    "Busy": { text: "다른 용무 중", color: "#C50F1F" },
    "OnThePhone": { text: "통화 중", color: "#C50F1F" },      // (구버전 호환)
    "InACall": { text: "통화 중", color: "#C50F1F" },         // 📞 팀즈 통화 중
    "InAMeeting": { text: "회의 중", color: "#C50F1F" },      // 📅 아웃룩 일정상 회의
    "DoNotDisturb": { text: "방해 금지", color: "#C50F1F" },
    "Presenting": { text: "발표 중", color: "#C50F1F" },      // 📺 화면 공유 중 (자동 방해금지)
    "UrgentInterruptionsOnly": { text: "방해 금지 (급한 용무만)", color: "#C50F1F" },

    // 🟡 노란색 계열 (자리 비움)
    "BeRightBack": { text: "곧 돌아옴", color: "#FDB913" },
    "Away": { text: "자리 비움", color: "#FDB913" },
    "Inactive": { text: "활동 없음", color: "#FDB913" },      // 잠수 탄 지 오래됨

    // 🟣 보라색 계열 (외출)
    "OutOfOffice": { text: "외출 중", color: "#B4009E" },

    // ⚪ 회색 계열 (오프라인)
    "Offline": { text: "오프라인", color: "#888888" },        // ⚠️ API는 'OffWork'가 아니라 'Offline'을 줍니다
    "OffWork": { text: "퇴근", color: "#888888" },            // (혹시 몰라 남겨둠)
    "PresenceUnknown": { text: "상태 알 수 없음", color: "#888888" }
};
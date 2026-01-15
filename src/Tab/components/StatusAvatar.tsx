import React from "react";

// 상태 아이콘 컴포넌트
export const StatusIcon = ({ status, size }: { status?: string, size: number }) => {
    const s = (status || "").toLowerCase();

    // 입력된 상태가 없으면 아무것도 표시하지 않음 (고객 요청)
    if (!s) return null;

    if (s === "available") { // 대화 가능 (Green Check)
        return <div style={{ width: size, height: size, borderRadius: "50%", backgroundColor: "#6bb700", border: "2px solid white", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "white", fontSize: size * 0.7, fontWeight: "bold", lineHeight: 1 }}>✓</span>
        </div>;
    }
    else if (s === "busy") { // 다른 용무 중 (Red Circle)
        return <div style={{ width: size, height: size, borderRadius: "50%", backgroundColor: "#c50f1f", border: "2px solid white" }}></div>;
    }
    else if (s === "donotdisturb" || s === "donotdisturb") { // 방해 금지 (Red Minus)
        return <div style={{ width: size, height: size, borderRadius: "50%", backgroundColor: "#c50f1f", border: "2px solid white", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: "60%", height: "2px", backgroundColor: "white" }}></div>
        </div>;
    }
    else if (s === "berightback" || s === "away") { // 곧 돌아올게 / 자리 비움 (Yellow Clock)
        return <div style={{ width: size, height: size, borderRadius: "50%", backgroundColor: "#ffb900", border: "2px solid white", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "white", fontSize: size * 0.6, lineHeight: 1 }}>🕒</span>
        </div>;
    }

    // Offline (Grey X) - 상태가 명시적으로 'offline'일 때만 표시하도록 변경
    if (s === 'offline') {
        return <div style={{ width: size, height: size, borderRadius: "50%", backgroundColor: "#ffffff", border: "1px solid #8a8886", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#8a8886", fontSize: size * 0.7, fontWeight: "bold", lineHeight: 1 }}>×</span>
        </div>;
    }

    return null;
};

// 프로필 사진 + 상태 아이콘 컴포넌트
export const AvatarWithStatus = ({ name, photoUrl, status, size, showStatusText }: { name: string, photoUrl?: string, status?: string, size: number, showStatusText?: boolean }) => {
    return (
        <div style={{ position: "relative", width: size, height: size }}>
            {photoUrl ? (
                <img src={photoUrl} alt={name} style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
            ) : (
                <div style={{ width: "100%", height: "100%", borderRadius: "50%", backgroundColor: "#e1dfdd", display: "flex", alignItems: "center", justifyContent: "center", fontSize: `${size / 2.5}px` }}>👤</div>
            )}
            <div style={{ position: "absolute", bottom: 0, right: 0 }}>
                <StatusIcon status={status} size={Math.max(10, size / 3)} />
            </div>
        </div>
    );
};

// 상태 텍스트 컴포넌트 (예: 대화 가능, 다른 용무 중)
export const StatusText = ({ status }: { status?: string }) => {
    if (!status) return null;
    const map: any = {
        "available": "대화 가능",
        "busy": "다른 용무 중",
        "donotdisturb": "방해 금지",
        "berightback": "곧 돌아올게",
        "away": "자리 비움",
        "offline": "오프라인"
    };
    const text = map[status.toLowerCase()] || status;
    return <span style={{ fontSize: "12px", color: "#605e5c", border: "1px solid #edebe9", borderRadius: "10px", padding: "2px 8px" }}>{text}</span>;
}

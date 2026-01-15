/**
 * App Theme Configuration
 * - brandColor 하나만 변경하면 전체 테마(Hover, Active, Border 등)가 자동으로 계산됩니다.
 */

// 1. 사용자 설정: 원하는 테마색으로 변경 
const brandColor = "#6264A7"; // Teams Basic Purple

// --- Color Utility Helper ---
// Hex 색상의 밝기를 조절하는 함수 (amount: -100 ~ 100)
// ex) lightenDarkenColor("#6264A7", 20) -> 밝게
// ex) lightenDarkenColor("#6264A7", -20) -> 어둡게
function adjustColor(col: string, amt: number) {
    let usePound = false;
    if (col[0] === "#") {
        col = col.slice(1);
        usePound = true;
    }
    const num = parseInt(col, 16);
    let r = (num >> 16) + amt;
    if (r > 255) r = 255; else if (r < 0) r = 0;
    let b = ((num >> 8) & 0x00FF) + amt;
    if (b > 255) b = 255; else if (b < 0) b = 0;
    let g = (num & 0x0000FF) + amt;
    if (g > 255) g = 255; else if (g < 0) g = 0;

    return (usePound ? "#" : "") + (g | (b << 8) | (r << 16)).toString(16).padStart(6, '0');
}

// 2. 자동 생성된 테마 객체
export const theme = {
    colors: {
        // Brand Colors (Auto Generated)
        primary: brandColor,
        primaryHover: adjustColor(brandColor, -20), // 20만큼 어둡게 (Hover)
        primaryActive: adjustColor(brandColor, -40), // 40만큼 어둡게 (Click)
        primaryLight: adjustColor(brandColor, 130), // 아주 밝게 (배경용 등)

        // Backgrounds
        bgMain: "#f3f2f1",
        bgWhite: "#ffffff",
        bgHover: "#faf9f8",
        bgSelected: "#f0f0f0",

        // Text
        textMain: "#323130",
        textSecondary: "#605e5c",
        textDisabled: "#a19f9d",
        textOnPrimary: "#ffffff",

        // Borders & Lines
        border: "#edebe9",
        borderFocus: brandColor, // 포커스 시 브랜드 컬러 사용

        // Functional
        danger: "#d13438",

        // Button specific
        btnText: "#ffffff",
    },
    // 공통 UI 요소 스타일
    radius: {
        small: "4px",
        medium: "8px",
        round: "50%",
        capsule: "20px",
    },
    shadow: {
        default: "0 2px 4px rgba(0,0,0,0.1)",
        card: "0 2px 4px rgba(0,0,0,0.05)",
        popup: "0 8px 24px rgba(0,0,0,0.2)",
    }
};

// ================================================================
// 로컬 Mock 모드 (백엔드의 USE_MOCK_DB=true 와 같은 역할)
// - 프로젝트 루트 .env(git 제외)에 VITE_USE_MOCK=true 가 있을 때만 켜진다.
// - 켜지면 Teams SDK 없이 브라우저에서 바로 띄울 수 있고, API는 로컬 백엔드(localhost:3000)로 직접 호출한다.
// - 운영 빌드(vite build)는 .env에 이 값이 없으므로 평소대로 운영 주소를 쓴다.
// ================================================================
export const IS_MOCK = import.meta.env.VITE_USE_MOCK === "true";

// Mock 모드에서 로그인한 것으로 칠 이메일 (.env의 VITE_MOCK_USER_EMAIL). 백엔드 MOCK_BYPASS가 이 값을 토큰 자리에서 받는다.
export const MOCK_USER_EMAIL: string = import.meta.env.VITE_MOCK_USER_EMAIL || "";

export const API_BASE_URL = IS_MOCK ? "http://localhost:3000" : "https://teamsorg.daiso.co.kr"; // 로컬 Mock / 운영

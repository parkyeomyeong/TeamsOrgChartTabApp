import { authentication } from "@microsoft/teams-js";

/**
 * SSO 토큰 자동 갱신 fetch 래퍼
 * - 요청 실패 시 (401) SSO 토큰을 재발급 받아 1회 재시도
 * - onTokenRefreshed 콜백으로 갱신된 토큰을 상위에 전달
 */
export async function authFetch(
    url: string,
    options: RequestInit & { headers: Record<string, string> },
    onTokenRefreshed?: (newToken: string) => void
): Promise<Response> {
    let res = await fetch(url, options);

    // 401 → SSO 토큰 만료 → 재발급 후 1회 재시도
    if (res.status === 401) {
        try {
            console.log("🔄 SSO 토큰 만료 감지 — 재발급 시도");
            const newToken = await authentication.getAuthToken();
            console.log("✅ SSO 토큰 재발급 성공");

            options.headers["Authorization"] = `Bearer ${newToken}`;
            onTokenRefreshed?.(newToken); //기존 토큰 갱신!

            res = await fetch(url, options);
        } catch (err) {
            console.error("SSO 토큰 재발급 실패:", err);
        }
    }

    return res;
}

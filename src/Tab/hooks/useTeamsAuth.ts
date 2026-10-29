import { useState, useEffect, useCallback } from "react";
import { app, authentication } from "@microsoft/teams-js";
import { IS_MOCK, MOCK_USER_EMAIL } from "../config";

/**
 * useTeamsAuth Hook
 * - 앱 초기 구동 시 Teams SSO 토큰을 1회 발급받습니다.
 * - 이 토큰은 향후 백엔드 서버(OBO Flow) 통신에 사용됩니다.
 */
export const useTeamsAuth = () => {
    const [token, setToken] = useState<string>("");
    const [currentUserEmail, setCurrentUserEmail] = useState<string>("");
    const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true); // 인증 로딩 상태 추가

    useEffect(() => {
        // [로컬 Mock 모드] Teams 밖(일반 브라우저)에서는 SSO를 받을 수 없으므로
        // 이메일 평문을 토큰 자리에 넣는다. 백엔드(USE_MOCK_DB=true)의 MOCK_BYPASS가 이걸 받아 통과시킨다.
        if (IS_MOCK) {
            if (!MOCK_USER_EMAIL) console.error("[Mock] .env에 VITE_MOCK_USER_EMAIL 이 없습니다.");
            setToken(MOCK_USER_EMAIL);
            setCurrentUserEmail(MOCK_USER_EMAIL);
            setIsAuthLoading(false);
            return;
        }

        const getAuthToken = async () => {
            try {
                // 0. Teams 앱 초기화 보장 (필수)
                await app.initialize();

                // 1. Teams SSO Token 획득
                const t = await authentication.getAuthToken();
                console.log("✅ SSO Token Acquired (OBO Prep)");
                setToken(t);

                // 사용자 컨텍스트에서 이메일 가져오기
                const context = await app.getContext();
                if (context.user && context.user.userPrincipalName) {
                    setCurrentUserEmail(context.user.userPrincipalName);
                }
            } catch (err) {
                console.error("SSO Token Failure:", err);
            } finally {
                setIsAuthLoading(false); // 로딩 끝
            }
        };

        getAuthToken();
        // 의존성 배열 [] : 마운트 시 최초 1회만 실행
    }, []);

    // authFetch 콜백용: 갱신된 토큰을 상태에 반영
    const updateToken = useCallback((newToken: string) => setToken(newToken), []);

    return { token, updateToken, currentUserEmail, isAuthLoading };
};

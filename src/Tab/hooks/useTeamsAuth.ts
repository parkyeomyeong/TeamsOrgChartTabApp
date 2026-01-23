import { useState, useEffect } from "react";
import { app, authentication } from "@microsoft/teams-js";

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
        const getAuthToken = async () => {
            try {
                // 0. Teams 앱 초기화 보장 (필수)
                await app.initialize();

                // 1. Teams SSO Token 획득
                const t = await authentication.getAuthToken();
                console.log("✅ SSO Token Acquired (OBO Prep)");
                setToken(t);

                // [추가] 사용자 컨텍스트에서 이메일 가져오기
                const context = await app.getContext();
                if (context.user && context.user.userPrincipalName) {
                    setCurrentUserEmail(context.user.userPrincipalName);
                    // console.log("✅ User Email: " + context.user.userPrincipalName);
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

    return { token, currentUserEmail, isAuthLoading };
};

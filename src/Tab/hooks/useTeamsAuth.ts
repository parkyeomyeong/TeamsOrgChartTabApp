import { useState, useEffect } from "react";
import { app, authentication } from "@microsoft/teams-js";

/**
 * useTeamsAuth Hook
 * - 앱 초기 구동 시 Teams SSO 토큰을 1회 발급받습니다.
 * - 이 토큰은 향후 백엔드 서버(OBO Flow) 통신에 사용됩니다.
 */
export const useTeamsAuth = () => {
    const [token, setToken] = useState<string>("");

    useEffect(() => {
        const getAuthToken = async () => {
            try {
                // 0. Teams 앱 초기화 보장 (필수)
                // 토큰 호출 전 확실히 초기화가 완료되어야 함. (팀즈에게 나 준비 됐어! 라고 하는 핸드셰이크 과정이라고 함)
                await app.initialize();

                // 1. Teams SSO Token 획득
                const t = await authentication.getAuthToken();
                console.log("✅ SSO Token Acquired (OBO Prep)");
                setToken(t);
            } catch (err) {
                console.error("SSO Token Failure:", err);
            }
        };

        getAuthToken();
        // 의존성 배열 [] : 마운트 시 최초 1회만 실행
    }, []);

    return { token };
};

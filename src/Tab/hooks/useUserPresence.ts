import { useState, useEffect, useCallback } from "react";
import { API_BASE_URL } from "../config";
import { UserPresence } from "../types";

export const useUserPresence = (emails: string[], token: string) => {
    const [presenceMap, setPresenceMap] = useState<Record<string, UserPresence>>({});
    const [isLoading, setIsLoading] = useState(false);

    const fetchPresence = useCallback(async () => {
        if (!token || emails.length === 0) return;

        try {
            // setIsLoading(true); // 너무 빈번한 깜빡임 방지를 위해 로딩 상태는 선택적으로 사용 or 스켈레톤 UI

            const response = await fetch(`${API_BASE_URL}/api/users/presence`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ ids: emails }),
            });

            if (!response.ok) {
                console.warn(`Presence API Error: ${response.status}`);
                return;
            }

            const data: UserPresence[] = await response.json();

            // 배열을 Map 형태로 변환
            const nextMap: Record<string, UserPresence> = {};
            data.forEach(p => {
                nextMap[p.email] = p;
            });

            setPresenceMap(prev => ({ ...prev, ...nextMap })); // 이전 상태와 새로운 상태를 병합 (뒤에 nextMap이 더 높은 우선순위)

        } catch (err) {
            console.error("Failed to fetch presence:", err);
        } finally {
            setIsLoading(false);
        }
    }, [token, JSON.stringify(emails)]); // emails 배열 내용이 바뀔 때마다

    // 토큰이 있고 이메일 목록이 변경되면 호출
    useEffect(() => {
        fetchPresence();

        // 폴링(Polling)이 필요하다면 여기서 setInterval 설정
        // const interval = setInterval(fetchPresence, 60000); // 1분마다 갱신
        // return () => clearInterval(interval);

    }, [fetchPresence]);

    return { presenceMap, refetch: fetchPresence };
};

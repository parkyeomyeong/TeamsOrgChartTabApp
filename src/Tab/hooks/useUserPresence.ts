import { useState, useEffect, useCallback, useRef } from "react";
import { API_BASE_URL } from "../config";
import { UserPresence } from "../types";

/**
 * @param emails 접속상태를 조회할 이메일 목록
 * @param token 인증 토큰
 * @param incrementalOnly true면 이미 조회한 이메일은 건너뜀 (모바일용), false/미지정이면 매번 전체 요청 (데스크탑용)
 */
export const useUserPresence = (emails: string[], token: string, incrementalOnly = false) => {
    const [presenceMap, setPresenceMap] = useState<Record<string, UserPresence>>({});
    const fetchedEmailsRef = useRef<Set<string>>(new Set());

    const fetchPresence = useCallback(async () => {
        if (!token || emails.length === 0) return;

        // incrementalOnly 모드: 이미 조회한 이메일 제외
        const targetEmails = incrementalOnly
            ? emails.filter(e => !fetchedEmailsRef.current.has(e))
            : emails;

        if (targetEmails.length === 0) return;

        try {
            const response = await fetch(`${API_BASE_URL}/api/users/presence`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ ids: targetEmails }),
            });

            if (!response.ok) {
                console.warn(`Presence API Error: ${response.status}`);
                return;
            }

            const data: UserPresence[] = await response.json();

            const nextMap: Record<string, UserPresence> = {};
            data.forEach(p => {
                nextMap[p.email] = p;
            });

            setPresenceMap(prev => ({ ...prev, ...nextMap })); // 이전 상태와 새로운 상태를 병합 (뒤에 nextMap이 더 높은 우선순위)

            // 조회 완료 기록 (incrementalOnly 모드에서만 의미 있음)
            if (incrementalOnly) {
                targetEmails.forEach(e => fetchedEmailsRef.current.add(e));
            }

        } catch (err) {
            console.error("Failed to fetch presence:", err);
        }
    }, [token, JSON.stringify(emails), incrementalOnly]);

    useEffect(() => {
        fetchPresence();
    }, [fetchPresence]);

    return { presenceMap, refetch: fetchPresence };
};



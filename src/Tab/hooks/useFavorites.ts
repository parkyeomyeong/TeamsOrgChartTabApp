import { useState, useEffect, useCallback } from "react";
import { API_BASE_URL } from "../config";
import { authFetch } from "../utils/authFetch";

export interface FavoriteItem {
    targetEmpId: string;
    createdAt: string;
}

/**
 * 즐겨찾기(Favorites) 연동 커스텀 훅
 * - OBO 토큰 인증 및 로컬(localhost) 개발 시 헤더 우회 자동 처리
 * - GET /api/favorites, POST /api/favorites, DELETE /api/favorites/:targetEmpId API 매핑
 */
export const useFavorites = (
    token: string,
    myEmpId: string | null,
    updateToken?: (t: string) => void,
    setToastMessage?: (msg: string | null) => void
) => {
    const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // 1. 공통 Request Headers 빌드 헬퍼 (SSO 토큰 + 사번 헤더 주입)
    const getHeaders = useCallback(() => {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };

        if (token) {
            // 실제 팀즈 SSO/OBO 토큰 주입
            headers["Authorization"] = `Bearer ${token}`;
        }
        if (myEmpId) {
            // 사번 식별자 전달
            headers["x-user-empid"] = myEmpId;
        }

        return headers;
    }, [token, myEmpId]);

    // 2. 즐겨찾기 목록 조회 (GET)
    const fetchFavorites = useCallback(async () => {
        if (!token) return;

        // 로그인한 사용자 사번이 매핑되지 않는 경우 (HR 사원 정보 누락 예외)
        if (!myEmpId) {
            setError("HR 시스템에 사원 정보가 등록되어 있지 않습니다.");
            return;
        }

        try {
            setIsLoading(true);
            setError(null);

            const headers = getHeaders();
            const response = await authFetch(
                `${API_BASE_URL}/api/favorites`,
                { headers, method: "GET" },
                updateToken
            );

            if (!response.ok) {
                // 400 Bad Request 등 백엔드 에러 메시지 추출 시도
                let errorMsg = `목록 조회 실패: ${response.status}`;
                try {
                    const errData = await response.json();
                    if (errData && errData.message) {
                        errorMsg = errData.message;
                    }
                } catch {}
                throw new Error(errorMsg);
            }

            const data: FavoriteItem[] = await response.json();
            setFavorites(data || []);
            console.log("✅ 즐겨찾기 목록 로드 완료:", data);
        } catch (err: any) {
            console.error("❌ 즐겨찾기 목록 로드 에러:", err);
            setError(err.message || "즐겨찾기를 불러오지 못했습니다.");
        } finally {
            setIsLoading(false);
        }
    }, [token, myEmpId, getHeaders, updateToken]);

    // 3. 즐겨찾기 등록 (POST)
    const addFavorite = useCallback(async (targetEmpId: string, name?: string) => {
        if (!myEmpId) {
            setToastMessage?.("HR 시스템에 본인 사원 정보가 등록되어 있지 않아 즐겨찾기 등록이 불가능합니다.");
            return false;
        }

        if (!targetEmpId) {
            setToastMessage?.("사번 정보가 없어 즐겨찾기 등록이 불가능합니다.");
            return false;
        }

        try {
            setIsLoading(true);
            setError(null);

            const headers = getHeaders();
            const response = await authFetch(
                `${API_BASE_URL}/api/favorites`,
                {
                    headers,
                    method: "POST",
                    body: JSON.stringify({ targetEmpId }),
                },
                updateToken
            );

            if (response.status === 409) {
                const errMsg = name ? `${name}님은 이미 즐겨찾기에 등록된 사원입니다.` : "이미 즐겨찾기에 등록된 사원입니다.";
                setToastMessage?.(errMsg);
                return false;
            }

            if (!response.ok) {
                let errorMsg = `등록 실패: ${response.status}`;
                try {
                    const errData = await response.json();
                    if (errData && errData.message) {
                        errorMsg = errData.message;
                    }
                } catch {}
                throw new Error(errorMsg);
            }

            // 실시간 상태 업데이트 (성공 시 최신순으로 정렬되도록 맨 앞에 추가)
            const newItem: FavoriteItem = {
                targetEmpId,
                createdAt: new Date().toISOString()
            };
            setFavorites(prev => [newItem, ...prev.filter(item => item.targetEmpId !== targetEmpId)]);
            setToastMessage?.(name ? `${name}님을 즐겨찾기에 추가했습니다.` : "즐겨찾기에 등록되었습니다.");
            return true;
        } catch (err: any) {
            console.error("❌ 즐겨찾기 추가 에러:", err);
            setToastMessage?.(err.message || "즐겨찾기 등록 중 오류가 발생했습니다.");
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [myEmpId, getHeaders, updateToken, setToastMessage]);

    // 4. 즐겨찾기 삭제 (DELETE)
    const removeFavorite = useCallback(async (targetEmpId: string, name?: string) => {
        if (!myEmpId) {
            setToastMessage?.("HR 시스템에 본인 사원 정보가 등록되어 있지 않아 즐겨찾기 해제가 불가능합니다.");
            return false;
        }

        if (!targetEmpId) {
            setToastMessage?.("사번 정보가 없어 즐겨찾기 해제가 불가능합니다.");
            return false;
        }

        try {
            setIsLoading(true);
            setError(null);

            const headers = getHeaders();
            const response = await authFetch(
                `${API_BASE_URL}/api/favorites/${encodeURIComponent(targetEmpId)}`,
                {
                    headers,
                    method: "DELETE",
                },
                updateToken
            );

            if (!response.ok) {
                let errorMsg = `삭제 실패: ${response.status}`;
                try {
                    const errData = await response.json();
                    if (errData && errData.message) {
                        errorMsg = errData.message;
                    }
                } catch {}
                throw new Error(errorMsg);
            }

            // 실시간 상태 업데이트
            setFavorites(prev => prev.filter(item => item.targetEmpId !== targetEmpId));
            setToastMessage?.(name ? `${name}님을 즐겨찾기에서 삭제했습니다.` : "즐겨찾기에서 삭제되었습니다.");
            return true;
        } catch (err: any) {
            console.error("❌ 즐겨찾기 삭제 에러:", err);
            setToastMessage?.(err.message || "즐겨찾기 해제 중 오류가 발생했습니다.");
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [myEmpId, getHeaders, updateToken, setToastMessage]);

    // 5. 특정 사원이 즐겨찾기 등록되어 있는지 체크하는 헬퍼
    const isFavorite = useCallback((targetEmpId: string) => {
        if (!targetEmpId) return false;
        return favorites.some(item => item.targetEmpId === targetEmpId);
    }, [favorites]);

    // 토큰이 주입되었고 사번 매핑이 확인되면 목록 자동 로드
    useEffect(() => {
        if (token && myEmpId) {
            fetchFavorites();
        }
    }, [token, myEmpId, fetchFavorites]);

    return {
        favorites,
        isLoading,
        error,
        refetch: fetchFavorites,
        addFavorite,
        removeFavorite,
        isFavorite,
    };
};

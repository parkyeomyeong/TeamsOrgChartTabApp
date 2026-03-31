import { useState, useEffect } from "react";
import { API_BASE_URL } from "../config";
import { Employee, OrgData } from "../types";
import { getCache, setCache } from "../utils/storageUtils";
import { authFetch } from "../utils/authFetch";

interface OrgChartData {
    orgList: OrgData[];
    empList: Employee[];
}

const CACHE_KEY = "orgChartDataCache_v1";

export const useOrgChartData = (token: string, onTokenRefreshed?: (t: string) => void) => {
    const [data, setData] = useState<OrgChartData | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            if (!token) return;

            // 1. 캐시 확인
            const cachedData = getCache<OrgChartData>(CACHE_KEY);
            if (cachedData) {
                console.log("캐시된 조직도 데이터를 사용합니다.");
                setData(cachedData);
                setIsLoading(false);
                return;
            }

            try {
                setIsLoading(true);
                const response = await authFetch(
                    `${API_BASE_URL}/api/orgChartData`,
                    { headers: { Authorization: `Bearer ${token}` } },
                    onTokenRefreshed
                );

                if (!response.ok) {
                    throw new Error(`API 오류: ${response.status}`);
                }

                const result = await response.json();

                const orgMap = new Map<string, OrgData>(result.orgList.map((org: OrgData) => [org.orgId, org]));

                const mappedEmpList: Employee[] = result.empList.map((item: any, index: number) => {
                    const org = orgMap.get(item.orgId);
                    // email은 사람마다 고유하므로 가장 안전한 key 재료.
                    // 유저 id가 없거나 "0" 같은 공유 값일 수 있어서 id 우선 믿으면 안 됨.
                    const stableId = item.email
                        ? `${item.email}-${item.orgId}`
                        : item.id || `no-id-${item.orgId}-${index}`;
                    return {
                        ...item,
                        id: stableId,
                        position: item.position || '-',
                        role: item.role || '-',
                        department: item.department || '-',
                        orgFullName: org?.orgFullName || item.orgFullName || '-',
                        extension: item.extension || '-',
                        mobile: item.mobile || '-',
                        email: item.email || '',
                        companyName: item.companyName || item.companyCode,
                        description: item.description || '-',
                    };
                });

                const finalData = {
                    orgList: result.orgList,
                    empList: mappedEmpList
                };

                setData(finalData);
                setCache(CACHE_KEY, finalData);

            } catch (err: any) {
                console.error("조직도 데이터 가져오기 실패:", err);
                setError(err.message || "데이터 로드 실패");
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [token]);

    return { data, isLoading, error };
};
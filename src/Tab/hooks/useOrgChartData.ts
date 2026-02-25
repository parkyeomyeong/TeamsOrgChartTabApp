import { useState, useEffect } from "react";
import { API_BASE_URL } from "../config";
import { Employee, OrgData } from "../types";
import { getCache, setCache } from "../utils/storageUtils";

interface OrgChartData {
    orgList: OrgData[];
    empList: Employee[];
}

const CACHE_KEY = "orgChartDataCache_v1";

export const useOrgChartData = (token: string) => {
    const [data, setData] = useState<OrgChartData | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            // API 호출을 위해서는 토큰이 필요합니다.
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
                const response = await fetch(`${API_BASE_URL}/api/orgChartData`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                if (!response.ok) {
                    throw new Error(`API 오류: ${response.status}`);
                }

                const result = await response.json();

                // orgList → orgMap (O(1) 조회용)
                const orgMap = new Map<string, OrgData>(result.orgList.map((org: OrgData) => [org.orgId, org]));

                // API 응답 매핑 + 조직정보 Enrich (orgFullName, companyName)
                const mappedEmpList: Employee[] = result.empList.map((item: any) => {
                    const org = orgMap.get(item.orgId);
                    return {
                        ...item,
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

                // 2. 캐시에 저장
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

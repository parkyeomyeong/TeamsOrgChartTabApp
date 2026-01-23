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

                // API 응답 매핑 (레거시 DB 컬럼 -> 프론트엔드 타입)
                const mappedEmpList: Employee[] = result.empList.map((item: any) => ({
                    id: item.empId || item.id,
                    name: item.empNm || item.name,
                    position: item.jobTitleDesc || item.position || "-",
                    role: item.posisionDesc || item.role || "-",
                    department: item.orgNm || item.department || "-",
                    orgFullName: item.orgFullName || "-",
                    orgId: item.orgId,
                    extension: item.offcTelNo || item.extension || "-",
                    mobile: item.moblTelNo || item.mobile || "-",
                    email: item.emailAddr || item.email || "",
                    companyName: item.compCd === "AD" ? "아성다이소"
                        : item.compCd === "AS" ? "아성"
                            : item.compCd === "AH" ? "아성HMP"
                                : item.companyName || item.compCd || "아성다이소",
                }));

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

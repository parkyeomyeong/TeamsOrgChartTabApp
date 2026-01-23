import { useState, useEffect } from "react";
import { useTeamsAuth } from "./useTeamsAuth";
import { API_BASE_URL } from "../config";
import { Employee, OrgData } from "../types";

interface OrgChartData {
    orgList: OrgData[];
    empList: Employee[];
}

export const useOrgChartData = () => {
    const { token } = useTeamsAuth();
    const [data, setData] = useState<OrgChartData | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            if (!token) return;

            try {
                setIsLoading(true);
                const response = await fetch(`${API_BASE_URL}/api/orgChartData`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                if (!response.ok) {
                    throw new Error(`API Error: ${response.status}`);
                }

                const result = await response.json();

                // API 응답 매핑 (Legacy DB Columns -> Frontend Type)
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

                setData({
                    orgList: result.orgList,
                    empList: mappedEmpList
                });

            } catch (err: any) {
                console.error("Failed to fetch org chart data:", err);
                setError(err.message || "Failed to load data");
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [token]);

    return { data, isLoading, error };
};

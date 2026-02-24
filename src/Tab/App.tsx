import React, { useState, useEffect } from "react";
import { app } from "@microsoft/teams-js";
import OrgChart from "./OrgChart";
import MobileOrgChart from "./MobileOrgChart";

import "./App.css";

// 모바일 플랫폼 판별
const MOBILE_CLIENT_TYPES = ["android", "ios", "iPadOS"];

export default function App() {
  const [clientType, setClientType] = useState<string>("");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const detect = async () => {
      try {
        await app.initialize(); // 딥링크 등 팀즈 기능을 쓰기 위해 초기화는 필수
        const context = await app.getContext();
        const type = context.app?.host?.clientType || "desktop";
        setClientType(type);
        console.log("* Client Type:", type);
      } catch (err) {
        console.error("Platform detection failed:", err);
        setClientType("desktop"); // 실패 시 데스크탑으로 폴백
      } finally {
        setIsReady(true);
      }
    };
    detect();
  }, []);

  if (!isReady) return null;

  const isMobile = MOBILE_CLIENT_TYPES.includes(clientType);

  return (
    <div className="App" style={{ width: "100vw", height: "100vh", margin: 0, padding: 0, overflow: "hidden" }}>
      {isMobile ? <MobileOrgChart /> : <OrgChart />}
    </div>
  );
}

import React from "react";
import * as teamsJs from "@microsoft/teams-js";
import OrgChart from "./OrgChart";

import "./App.css";

export default function App() {
  React.useEffect(() => {
    // 딥링크 등 팀즈 기능을 쓰기 위해 초기화는 필수입니다.
    teamsJs.app.initialize();
  }, []);

  return (
    <div className="App" style={{ width: "100vw", height: "100vh", margin: 0, padding: 0, overflow: "hidden" }}>
      <OrgChart />
    </div>
  );
}

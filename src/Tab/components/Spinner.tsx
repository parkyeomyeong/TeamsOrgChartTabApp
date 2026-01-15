import React from "react";
import { theme } from "../constants/theme";

export const Spinner = () => {
    return (
        <div
            style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(255, 255, 255, 0.7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 10,
                backdropFilter: "blur(1px)"
            }}
        >
            <div className="spinner-ring"></div>
            <style>{`
        .spinner-ring {
          width: 40px;
          height: 40px;
          border: 4px solid ${theme.colors.border};
          border-top: 4px solid ${theme.colors.primary};
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
};

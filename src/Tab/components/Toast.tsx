import React, { useEffect } from "react";
import { theme } from "../constants/theme";
import checkIcon from "../../assets/check.png";

interface ToastProps {
    message: string;
    visible: boolean;
    onClose: () => void;
    duration?: number;
}

export const Toast: React.FC<ToastProps> = ({ message, visible, onClose, duration = 2000 }) => {
    useEffect(() => {
        if (visible) {
            const timer = setTimeout(() => {
                onClose();
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [visible, duration, onClose]);

    if (!visible) return null;

    return (
        <div
            style={{
                position: "fixed",
                bottom: "80px", // 바텀 패널 위쪽
                left: "50%",
                transform: "translateX(-50%)",
                backgroundColor: "rgba(0, 0, 0, 0.8)",
                color: "white",
                padding: "10px 20px",
                borderRadius: theme.radius.medium,
                zIndex: 2000,
                fontSize: "14px",
                boxShadow: theme.shadow.card,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                animation: "fadeIn 0.3s ease-out"
            }}
        >
            <img src={checkIcon} alt="success" style={{ width: "20px", height: "20px" }} /> {message}
            <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translate(-50%, 10px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
        </div>
    );
};

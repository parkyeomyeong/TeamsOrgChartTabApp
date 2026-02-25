import React from "react";
import { theme } from "../constants/theme";

// --- OrgTree 스타일 상수 (CSS-in-JS) ---

export const treeContainerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#f9f9f9",
    fontFamily: "'Segoe UI', 'Malgun Gothic', sans-serif",
    boxSizing: "border-box",
};

export const topControlAreaStyle: React.CSSProperties = {
    backgroundColor: "#fff",
    borderBottom: "1px solid #e1e1e1",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
};

export const companySelectStyle: React.CSSProperties = {
    width: "100%",
    padding: "6px",
    border: "1px solid #ddd",
    borderRadius: "4px",
    fontSize: "13px",
    outline: "none",
    color: theme.colors.textMain,
    backgroundColor: theme.colors.bgWhite,
};

export const searchRowStyle: React.CSSProperties = {
    display: "flex",
    gap: "5px",
};

export const searchSelectStyle: React.CSSProperties = {
    padding: "5px",
    border: "1px solid #ddd",
    borderRadius: "4px",
    fontSize: "12px",
    outline: "none",
    cursor: "pointer",
    color: "#333",
    backgroundColor: "#fff",
    width: "80px",
};

export const searchInputWrapperStyle: React.CSSProperties = {
    position: "relative",
    flex: 1,
    display: "flex",
    alignItems: "center",
};

export const searchInputStyle: React.CSSProperties = {
    width: "100%",
    padding: "6px 30px 6px 8px",
    border: "1px solid #ddd",
    borderRadius: "4px",
    fontSize: "13px",
    outline: "none",
    boxSizing: "border-box",
};

export const searchButtonStyle: React.CSSProperties = {
    position: "absolute",
    right: "5px",
    background: "none",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: theme.colors.textSecondary,
    width: "24px",
    height: "24px",
};

export const treeContentStyle: React.CSSProperties = {
    flex: 1,
    overflowY: "auto",
    padding: "5px 0",
};

export const itemContainerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    cursor: "pointer",
    padding: "4px 8px",
    position: "relative",
    userSelect: "none",
    minWidth: "fit-content",
};

export const itemContentStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    whiteSpace: "nowrap",
};

export const folderIconContainerStyle: React.CSSProperties = {
    position: "relative",
    width: "24px",
    height: "24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
};

import React from 'react';
import { PresenceBadge as FluentPresenceBadge, PresenceBadgeStatus } from '@fluentui/react-components';
import { UserPresence, PRESENCE_STATUS_MAP } from '../types';

interface PresenceBadgeProps {
    status?: UserPresence; // UserPresence 객체
    size?: "tiny" | "extra-small" | "small" | "medium" | "large" | "extra-large"; // Fluent UI sizes
    showText?: boolean; // 텍스트 표시 여부 (팝업용)
    className?: string;
}

export const PresenceBadge: React.FC<PresenceBadgeProps> = ({ status, size = "extra-small", showText = false, className }) => {
    // Fluent UI Status Mapping
    let fluentStatus: PresenceBadgeStatus = "unknown";
    const activity = status?.activity || "unknown";

    switch (activity) {
        case "Available": fluentStatus = "available"; break;
        case "Busy": fluentStatus = "busy"; break;
        case "DoNotDisturb": fluentStatus = "do-not-disturb"; break;
        case "Away": fluentStatus = "away"; break;
        case "BeRightBack": fluentStatus = "away"; break;
        case "OffWork": fluentStatus = "offline"; break;
        default: fluentStatus = "unknown"; break;
    }

    const statusText = PRESENCE_STATUS_MAP[activity]?.text || '알수없음';

    if (showText) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FluentPresenceBadge status={fluentStatus} />
                <span style={{ fontSize: '14px', color: '#424242' }}>{statusText}</span>
            </div>
        );
    }

    // 아이콘만 표시
    return <FluentPresenceBadge status={fluentStatus} size={size} className={className} />;
};

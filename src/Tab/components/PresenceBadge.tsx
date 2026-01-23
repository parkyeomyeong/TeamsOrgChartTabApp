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
    let fluentStatus: PresenceBadgeStatus = mapAvailabilityToStatus(status?.availability); //아이콘 (availability) 
    const activity = status?.activity || "PresenceUnknown"; // 상태 메시지 (activity)

    // switch (activity) {
    //     case "Available": fluentStatus = "available"; break;
    //     case "Busy": fluentStatus = "busy"; break;
    //     case "DoNotDisturb": fluentStatus = "do-not-disturb"; break;
    //     case "Away": fluentStatus = "away"; break;
    //     case "BeRightBack": fluentStatus = "away"; break;
    //     case "OffWork": fluentStatus = "offline"; break;
    //     case "InAMeeting": fluentStatus = "busy"; break;
    //     case "PresenceUnknown": fluentStatus = "unknown"; break;
    //     default: fluentStatus = "unknown"; break;
    // }

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

export const mapAvailabilityToStatus = (availability: string | null | undefined) => {
    if (!availability) return 'unknown'; // 값이 없으면 알 수 없음 취급

    switch (availability) {
        // 🟢 대화 가능 그룹
        case 'Available':
        case 'AvailableIdle': // (컴퓨터 안 쓰고 있지만 대화 가능)
            return 'available';

        // 🟡 자리 비움 그룹
        case 'Away':
        case 'BeRightBack':   // (곧 돌아옴도 away로 통합)
            return 'away';

        // 🔴 바쁨 그룹
        case 'Busy':
        case 'BusyIdle':      // (바쁜데 컴퓨터 안 쓰는 중)
            return 'busy';

        // ⛔ 방해 금지
        case 'DoNotDisturb':
            return 'do-not-disturb';

        // ⚪ 오프라인
        case 'Offline':
            return 'offline';

        // 🟣 외출 (참고: 보통 availability보다는 activity 필드로 확인하지만, 매핑에 포함)
        case 'OutOfOffice':
            return 'out-of-office';

        // ❓ 알 수 없음
        case 'PresenceUnknown':
            return 'unknown';

        // 그 외 정의되지 않은 값
        default:
            return 'unknown';
    }
};
import React from 'react';
import { Avatar } from '@fluentui/react-components';
import { UserPresence } from '../types';
import { PresenceBadge } from './PresenceBadge';

interface AvatarWithStatusProps {
    name: string;
    photoUrl?: string;
    status?: UserPresence;
    size?: number; // 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 96, 120, 128
    hideBadge?: boolean;
}

export const AvatarWithStatus: React.FC<AvatarWithStatusProps> = ({ name, photoUrl, status, size = 32, hideBadge = false }) => {

    // Fluent UI Avatar takes 'image' prop for URL, 'name' for initials/color fallback.
    // If we want default icon instead of initials, we can omit 'name' or set 'icon' prop, 
    // but Avatar handles name-based color nicely. User asked for "default profile icon" if weird colors.
    // Let's use the `icon` prop if we want to force an icon, or just rely on image.
    // Actually, Fluent UI Avatar defaults to a person icon if name is NOT provided and image is missing.
    // But we usually want name for screen readers. 
    // To suppress initials and show icon: pass `icon` prop (e.g. <PersonRegular />) or just let it handle image.
    // The user said "Why weird colors", so they probably prefer the standard gray person icon or image.

    return (
        <div style={{ position: 'relative', display: 'inline-block' }}>
            <Avatar
                name={name}
                image={photoUrl ? { src: photoUrl } : undefined}
                size={size as any} // Cast to any to accept number, though strict types exist
                color="colorful" // or "neutral" for gray
            />

            {!hideBadge && (
                <div style={{
                    position: 'absolute',
                    bottom: -2,
                    right: -2,
                    zIndex: 1,
                    backgroundColor: 'white', // 배지 배경 (테두리 역할)
                    borderRadius: '50%',
                    padding: '2px', // 흰색 테두리 두께
                    lineHeight: 0
                }}>
                    <PresenceBadge
                        status={status}
                        size={size >= 48 ? "small" : "extra-small"}
                    />
                </div>
            )}
        </div>
    );
};

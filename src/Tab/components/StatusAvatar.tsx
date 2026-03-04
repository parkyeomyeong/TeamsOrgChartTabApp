import React, { useState, useEffect } from 'react';
import { Avatar } from '@fluentui/react-components';
import { UserPresence } from '../types';
import { PresenceBadge } from './PresenceBadge';

interface AvatarWithStatusProps {
    name: string;
    photoUrl?: string;
    status?: UserPresence;
    size?: number;
    hideBadge?: boolean;
}

export const AvatarWithStatus: React.FC<AvatarWithStatusProps> = ({ name, photoUrl, status, size = 32, hideBadge = false }) => {
    const [imgFailed, setImgFailed] = useState(false);
    useEffect(() => { setImgFailed(false); }, [photoUrl]);

    const showPhoto = photoUrl && !imgFailed;

    return (
        <div style={{ position: 'relative', display: 'inline-block' }}>
            <Avatar
                name={name}
                image={showPhoto ? {
                    src: photoUrl,
                    // @ts-ignore
                    onError: () => setImgFailed(true)
                } : undefined}
                size={size as any}
                color="colorful"
            />
            {!hideBadge && (
                <div style={{
                    position: 'absolute', bottom: -2, right: -2, zIndex: 1,
                    backgroundColor: 'white', borderRadius: '50%', padding: '2px', lineHeight: 0
                }}>
                    <PresenceBadge status={status} size={size >= 48 ? "small" : "extra-small"} />
                </div>
            )}
        </div>
    );
};

interface CacheData<T> {
    timestamp: number;
    data: T;
}

/**
 * 로컬 스토리지에 데이터를 저장합니다. (타임스탬프 포함)
 * @param key 저장할 키
 * @param data 저장할 데이터
 */
export const setCache = <T>(key: string, data: T): void => {
    try {
        const cacheData: CacheData<T> = {
            timestamp: Date.now(),
            data: data
        };
        localStorage.setItem(key, JSON.stringify(cacheData));
    } catch (e) {
        console.error("캐시 저장 실패:", e);
    }
};

/**
 * 로컬 스토리지에서 데이터를 가져옵니다. (만료 시간 체크)
 * @param key 가져올 키
 * @returns 유효한 데이터가 있으면 데이터 반환, 없거나 만료되었으면 null 반환
 */
// 12시간 (밀리초 단위) - UI 상태 기본 보존 기간
// export const USER_STATE_DURATION = 12 * 60 * 60 * 1000;
export const USER_STATE_DURATION = 1 * 60 * 1000; // 1분

/**
 * 로컬 스토리지에서 데이터를 가져옵니다. (만료 시간 체크)
 * @param key 가져올 키
 * @param duration (옵션) 만료 기간 (ms). 값이 없으면 USER_STATE_DURATION을 기본값으로 사용합니다.
 * @returns 유효한 데이터가 있으면 데이터 반환, 없거나 만료되었으면 null 반환
 */
export const getCache = <T>(key: string, duration: number = USER_STATE_DURATION): T | null => {
    try {
        const cached = localStorage.getItem(key);
        if (!cached) return null;

        const parsed: CacheData<T> = JSON.parse(cached);
        const age = Date.now() - parsed.timestamp;

        // duration 체크
        if (duration > 0) {
            if (age < duration) {
                return parsed.data;
            } else {
                console.log(`캐시 만료됨: ${key}`);
                localStorage.removeItem(key); // 만료된 캐시 삭제
                return null;
            }
        }

        // duration이 0 이나 음수면 무제한으로 간주 (또는 즉시 만료? 정책 나름이지만 여기선 무제한 반환)
        return parsed.data;
    } catch (e) {
        console.error("캐시 불러오기 실패:", e);
        return null;
    }
};

/**
 * 특정 키의 캐시를 삭제합니다.
 * @param key 
 */
export const removeCache = (key: string): void => {
    localStorage.removeItem(key);
};

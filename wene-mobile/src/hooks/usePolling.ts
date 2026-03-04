import { useEffect, useRef, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * 一定間隔でコールバック関数を呼び出す汎用ポーリングhook。
 *
 * - `intervalMs` 間隔（デフォルト15秒）で callback を呼び出す
 * - `enabled` が false の場合はポーリングを一時停止
 * - アプリがバックグラウンドに移行すると自動停止、復帰時に再開
 * - コンポーネントのアンマウント時に自動クリーンアップ
 * - `immediate` が true (デフォルト false) の場合、マウント時に即実行
 */
export function usePolling(
    callback: () => void | Promise<void>,
    options: {
        /** ポーリング間隔（ミリ秒）。デフォルト: 15000 */
        intervalMs?: number;
        /** ポーリングを有効にするかどうか。デフォルト: true */
        enabled?: boolean;
        /** マウント時に即時実行するかどうか。デフォルト: false */
        immediate?: boolean;
    } = {}
) {
    const { intervalMs = 15_000, enabled = true, immediate = false } = options;
    const callbackRef = useRef(callback);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // コールバックを最新の参照に保つ（再レンダリング時にポーリングを再起動しない）
    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    const startPolling = useCallback(() => {
        if (timerRef.current !== null) return;
        timerRef.current = setInterval(() => {
            void callbackRef.current();
        }, intervalMs);
    }, [intervalMs]);

    const stopPolling = useCallback(() => {
        if (timerRef.current !== null) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (!enabled) {
            stopPolling();
            return;
        }

        // マウント時に即時実行（オプション）
        if (immediate) {
            void callbackRef.current();
        }

        startPolling();

        // AppState 監視: バックグラウンドでは停止、フォアグラウンドで再開
        const handleAppStateChange = (nextState: AppStateStatus) => {
            if (nextState === 'active') {
                // フォアグラウンド復帰 → 即時データ取得 + ポーリング開始
                void callbackRef.current();
                startPolling();
            } else {
                // バックグラウンド → ポーリング停止
                stopPolling();
            }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            stopPolling();
            subscription.remove();
        };
    }, [enabled, immediate, startPolling, stopPolling]);
}

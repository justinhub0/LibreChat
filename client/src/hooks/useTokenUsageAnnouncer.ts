import { useEffect, useRef } from 'react';
import { useRecoilValue } from 'recoil';
import { useLiveAnnouncer } from '~/Providers';
import { useLocalize } from '~/hooks';
import store from '~/store';

const ANNOUNCE_INTERVAL_MS = 20_000;

/** Announces token usage periodically during long-running streams. */
export default function useTokenUsageAnnouncer() {
  const localize = useLocalize();
  const { announcePolite } = useLiveAnnouncer();
  const tokenUsage = useRecoilValue(store.tokenUsageData);
  const streamStartTime = useRecoilValue(store.streamStartTime);
  const tokenUsageRef = useRef(tokenUsage);
  const lastAnnouncedUsedRef = useRef<number | null>(null);
  tokenUsageRef.current = tokenUsage;

  useEffect(() => {
    if (streamStartTime == null) {
      lastAnnouncedUsedRef.current = null;
      return;
    }

    const intervalId = setInterval(() => {
      const usage = tokenUsageRef.current;
      if (!usage || usage.maxContextTokens <= 0) {
        return;
      }

      const used = usage.promptTokens + usage.completionTokens;
      if (used === lastAnnouncedUsedRef.current) {
        return;
      }

      lastAnnouncedUsedRef.current = used;
      announcePolite({
        message: localize('com_a11y_context_usage_update', {
          0: used.toLocaleString(),
          1: usage.maxContextTokens.toLocaleString(),
        }),
      });
    }, ANNOUNCE_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [streamStartTime, announcePolite, localize]);
}

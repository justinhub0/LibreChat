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
  const lastAnnouncementRef = useRef(0);
  const prevTokenUsageRef = useRef(tokenUsage);

  useEffect(() => {
    if (streamStartTime == null) {
      lastAnnouncementRef.current = 0;
    }
  }, [streamStartTime]);

  useEffect(() => {
    if (!tokenUsage || tokenUsage.maxContextTokens <= 0 || streamStartTime == null) {
      return;
    }

    const prevUsage = prevTokenUsageRef.current;
    prevTokenUsageRef.current = tokenUsage;

    const now = Date.now();
    const elapsed = now - streamStartTime;
    const sinceLast = now - lastAnnouncementRef.current;

    if (
      elapsed >= ANNOUNCE_INTERVAL_MS &&
      sinceLast >= ANNOUNCE_INTERVAL_MS &&
      tokenUsage !== prevUsage
    ) {
      const used = tokenUsage.promptTokens + tokenUsage.completionTokens;
      lastAnnouncementRef.current = now;
      announcePolite({
        message: localize('com_a11y_context_usage_update', {
          0: used.toLocaleString(),
          1: tokenUsage.maxContextTokens.toLocaleString(),
        }),
      });
    }
  }, [tokenUsage, streamStartTime, announcePolite, localize]);
}

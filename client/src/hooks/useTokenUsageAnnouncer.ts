import { useEffect, useRef } from 'react';
import { useRecoilValue } from 'recoil';
import { useLiveAnnouncer } from '~/Providers';
import { useLocalize } from '~/hooks';
import store from '~/store';

const ANNOUNCE_INTERVAL_MS = 30_000;

export default function useTokenUsageAnnouncer() {
  const localize = useLocalize();
  const { announcePolite } = useLiveAnnouncer();
  const tokenUsage = useRecoilValue(store.tokenUsageData);
  const streamStartTime = useRecoilValue(store.streamStartTime);
  const lastAnnouncementRef = useRef(0);
  const prevTokenUsageRef = useRef(tokenUsage);
  const isStreamingRef = useRef(false);

  useEffect(() => {
    isStreamingRef.current = streamStartTime != null;
    if (streamStartTime == null) {
      lastAnnouncementRef.current = 0;
    }
  }, [streamStartTime]);

  useEffect(() => {
    if (!tokenUsage || tokenUsage.maxContextTokens <= 0) {
      return;
    }

    const wasStreaming = isStreamingRef.current;
    const prevUsage = prevTokenUsageRef.current;
    prevTokenUsageRef.current = tokenUsage;

    const used = tokenUsage.promptTokens + tokenUsage.completionTokens;
    const remaining = Math.max(0, tokenUsage.maxContextTokens - used);

    if (!wasStreaming || streamStartTime == null) {
      announcePolite({
        message: localize('com_a11y_context_usage_final', {
          0: used.toLocaleString(),
          1: remaining.toLocaleString(),
          2: tokenUsage.maxContextTokens.toLocaleString(),
        }),
      });
      return;
    }

    const now = Date.now();
    const elapsed = now - streamStartTime;
    const sinceLast = now - lastAnnouncementRef.current;

    if (
      elapsed >= ANNOUNCE_INTERVAL_MS &&
      sinceLast >= ANNOUNCE_INTERVAL_MS &&
      tokenUsage !== prevUsage
    ) {
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

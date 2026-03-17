import { memo, useEffect, useRef, useState } from 'react';
import { useRecoilValue } from 'recoil';
import { useLocalize } from '~/hooks';
import store from '~/store';

const TICK_INTERVAL_MS = 20_000;

function ContextWindowProgressBar() {
  const localize = useLocalize();
  const tokenUsage = useRecoilValue(store.tokenUsageData);
  const streamStartTime = useRecoilValue(store.streamStartTime);
  const lastRenderedUsedRef = useRef<number | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (streamStartTime == null) {
      lastRenderedUsedRef.current = null;
      return;
    }
    const intervalId = setInterval(() => {
      if (!tokenUsage) {
        return;
      }
      const used = tokenUsage.promptTokens + tokenUsage.completionTokens;
      if (used !== lastRenderedUsedRef.current) {
        lastRenderedUsedRef.current = used;
        setTick((t) => t + 1);
      }
    }, TICK_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [streamStartTime, tokenUsage]);

  if (!tokenUsage || tokenUsage.maxContextTokens <= 0) {
    return null;
  }

  const used = tokenUsage.promptTokens + tokenUsage.completionTokens;
  const percent = Math.min(100, Math.round((used / tokenUsage.maxContextTokens) * 100));

  let barColor = 'bg-green-500';
  if (percent > 85) {
    barColor = 'bg-red-500';
  } else if (percent > 60) {
    barColor = 'bg-yellow-500';
  }

  const label = localize('com_ui_context_window', {
    0: used.toLocaleString(),
    1: tokenUsage.maxContextTokens.toLocaleString(),
    2: String(percent),
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-1 xl:max-w-4xl">
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-1 w-full overflow-hidden rounded-full bg-surface-tertiary"
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-0.5 text-right text-xs text-text-secondary" aria-hidden="true">
        {label}
      </p>
    </div>
  );
}

export default memo(ContextWindowProgressBar);

import { atom } from 'recoil';
import type { TokenUsageData } from 'librechat-data-provider';

const tokenUsageData = atom<TokenUsageData | null>({
  key: 'tokenUsageData',
  default: null,
});

const streamStartTime = atom<number | null>({
  key: 'streamStartTime',
  default: null,
});

export default {
  tokenUsageData,
  streamStartTime,
};

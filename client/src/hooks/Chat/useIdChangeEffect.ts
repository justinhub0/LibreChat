import { useEffect, useRef } from 'react';
import { useResetRecoilState } from 'recoil';
import { Constants } from 'librechat-data-provider';
import { logger } from '~/utils';
import store from '~/store';

/**
 * Hook to reset visible artifacts when the conversation ID changes
 * @param conversationId - The current conversation ID
 */
export default function useIdChangeEffect(conversationId: string) {
  const lastConvoId = useRef<string | null>(null);
  const resetVisibleArtifacts = useResetRecoilState(store.visibleArtifacts);
  const resetTokenUsageData = useResetRecoilState(store.tokenUsageData);

  useEffect(() => {
    if (conversationId !== lastConvoId.current) {
      logger.log('conversation', 'Conversation ID change');
      resetVisibleArtifacts();
      const isNewConvoTransition =
        lastConvoId.current === Constants.NEW_CONVO || lastConvoId.current == null;
      if (!isNewConvoTransition) {
        resetTokenUsageData();
      }
    }
    lastConvoId.current = conversationId;
  }, [conversationId, resetVisibleArtifacts, resetTokenUsageData]);
}

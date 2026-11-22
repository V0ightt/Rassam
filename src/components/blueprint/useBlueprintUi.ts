'use client';

import { useCallback, useMemo, useState } from 'react';

export type BlueprintTab = 'attention' | 'components' | 'rules' | 'intent' | 'reach';

export interface BlueprintUiState {
  tab: BlueprintTab;
  selectedComponentId: string | null;
  /** Non-zero (and bumped) when the intent field of the selected component should take focus. */
  intentFocusToken: number;
  editingRuleId: string | null;
  /** Non-zero (and bumped) when the reason field of the edited rule should take focus. */
  ruleFocusToken: number;
  /** Components the canvas should centre on; `token` changes on every request. */
  focus: { ids: string[]; token: number } | null;
}

export interface BlueprintUi extends BlueprintUiState {
  setTab(tab: BlueprintTab): void;
  /** Select a component for the canvas inspector and the Components tab. */
  selectComponent(id: string | null, options?: { openTab?: boolean; focusIntent?: boolean }): void;
  editRule(id: string | null, options?: { focusReason?: boolean }): void;
  focusComponents(ids: string[]): void;
  clearFocus(): void;
}

const INITIAL: BlueprintUiState = {
  tab: 'attention',
  selectedComponentId: null,
  intentFocusToken: 0,
  editingRuleId: null,
  ruleFocusToken: 0,
  focus: null,
};

/** UI state shared by the Blueprint panel and the Blueprint canvas. */
export function useBlueprintUi(): BlueprintUi {
  const [state, setState] = useState<BlueprintUiState>(INITIAL);

  const setTab = useCallback((tab: BlueprintTab) => setState((current) => ({ ...current, tab })), []);

  const selectComponent = useCallback<BlueprintUi['selectComponent']>((id, options = {}) => {
    setState((current) => ({
      ...current,
      selectedComponentId: id,
      tab: id && options.openTab ? 'components' : current.tab,
      intentFocusToken: id && options.focusIntent ? current.intentFocusToken + 1 : 0,
    }));
  }, []);

  const editRule = useCallback<BlueprintUi['editRule']>((id, options = {}) => {
    setState((current) => ({
      ...current,
      editingRuleId: id,
      tab: id ? 'rules' : current.tab,
      ruleFocusToken: id && options.focusReason ? current.ruleFocusToken + 1 : 0,
    }));
  }, []);

  const focusComponents = useCallback((ids: string[]) => {
    if (!ids.length) return;
    setState((current) => ({ ...current, focus: { ids, token: Date.now() + Math.random() } }));
  }, []);

  const clearFocus = useCallback(() => setState((current) => (current.focus ? { ...current, focus: null } : current)), []);

  return useMemo(
    () => ({ ...state, setTab, selectComponent, editRule, focusComponents, clearFocus }),
    [clearFocus, editRule, focusComponents, selectComponent, setTab, state],
  );
}

// The blueprint UI codes against the data-layer contract of `useBlueprint`.
// Components take the session as a prop so they can be rendered with a fake.
import type { BlueprintActions, BlueprintSessionState } from '@/hooks/useBlueprint';

export type { BlueprintActions, BlueprintSessionState, BlueprintSource } from '@/hooks/useBlueprint';

export type BlueprintSession = BlueprintSessionState & BlueprintActions;

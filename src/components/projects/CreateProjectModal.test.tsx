// @vitest-environment jsdom
import { createRef } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  saveModelSettings,
  saveProviderStatus,
} from '@/lib/model-settings';
import CreateProjectModal from './CreateProjectModal';

function renderModal(options: {
  enrichWithAi?: boolean;
  onEnrich?: (enabled: boolean) => void;
  onCreate?: (url: string, enrichWithAi?: boolean) => void;
} = {}) {
  return render(
    <CreateProjectModal
      mode="github"
      onModeChange={vi.fn()}
      newProjectUrl="https://github.com/openai/example"
      onUrlChange={vi.fn()}
      newProjectRef=""
      onRefChange={vi.fn()}
      enrichWithAi={options.enrichWithAi ?? false}
      onEnrichWithAiChange={options.onEnrich ?? vi.fn()}
      newProjectName=""
      onNameChange={vi.fn()}
      loading={false}
      analysisProgress={null}
      analysisError={null}
      importError={null}
      importFileRef={createRef<HTMLInputElement>()}
      onClose={vi.fn()}
      onCancelAnalysis={vi.fn()}
      onCreateFromGitHub={options.onCreate ?? vi.fn()}
      onCreateEmpty={vi.fn()}
      onImportFile={vi.fn()}
      onClearImportError={vi.fn()}
    />,
  );
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('CreateProjectModal AI enrichment choice', () => {
  test('shows the exact selected model while preserving deterministic-only analysis', async () => {
    saveModelSettings({
      enabledModels: { openai: ['approved-model'] },
      selectedProvider: 'openai',
      selectedModel: 'approved-model',
      maxOutputTokens: 2_000,
      temperature: 0.2,
    });
    saveProviderStatus({
      providers: [{
        id: 'openai',
        label: 'OpenAI',
        envKey: 'OPENAI_API_KEY',
        models: ['approved-model'],
        hasApiKey: true,
        validated: false,
        available: true,
      }],
      checkedAt: new Date().toISOString(),
    });

    renderModal();
    expect(await screen.findByText('Enrich labels with OpenAI / approved-model')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeEnabled();
    expect(screen.getByText('Leave this off to analyze without AI.')).toBeInTheDocument();
  });

  test('forces deterministic-only analysis for a stale unavailable selection and explains how to recover', async () => {
    const onEnrich = vi.fn();
    const onCreate = vi.fn();
    renderModal({ enrichWithAi: true, onEnrich, onCreate });

    expect(await screen.findByText('AI enrichment unavailable')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByText('No default model is selected. Choose one in Settings.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Analyze repository' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('https://github.com/openai/example', false));
    expect(onEnrich).not.toHaveBeenCalled();
  });
});

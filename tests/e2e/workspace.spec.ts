import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Start every test from a clean browser profile; later navigations in the same test keep their state.
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem('e2e-cleared')) return;
    window.sessionStorage.setItem('e2e-cleared', '1');
    window.localStorage.clear();
    indexedDB.deleteDatabase('rassam-workspace');
    indexedDB.deleteDatabase('repo-agent-files');
    indexedDB.deleteDatabase('rassam-blueprints');
  });
});

// ── Studio (/) ────────────────────────────────────────────────

async function openSample(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Is the project on track?' })).toBeVisible();
  await page.getByRole('button', { name: 'Try the sample' }).click();
  await expect(page.getByTestId('blueprint-node-web')).toBeVisible();
}

const intentBox = (page: Page) => page.getByRole('combobox', { name: 'Tell Rassam what to change' });

test('studio: first run to a previewed, applied and undone change', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Is the project on track?' })).toBeVisible();
  await expect(page.getByPlaceholder('Paste a GitHub repository URL')).toBeFocused();

  await page.getByRole('button', { name: 'Try the sample' }).click();
  for (const id of ['web', 'api', 'domain', 'auth', 'billing', 'storage']) {
    await expect(page.getByTestId(`blueprint-node-${id}`)).toBeVisible();
  }
  await expect(page.getByTestId('source-pill')).toContainText('Orbit Notes');
  await expect(page.getByTestId('health-pill')).toContainText('1 needs a ruling');
  await expect(page.getByRole('button', { name: /Web to Storage: undeclared dependency/ })).toBeVisible();

  // Say what should change: it is staged on the canvas, not applied.
  await intentBox(page).click();
  await intentBox(page).fill('forbid web from importing storage');
  await page.keyboard.press('Enter');
  const proposal = page.getByTestId('proposal-card');
  await expect(proposal).toBeVisible();
  await expect(proposal).toContainText('Forbade "Web" from depending on "Storage"');
  await expect(proposal.getByTestId('findings-change')).toContainText('Introduces 1 finding');
  await expect(page.getByRole('button', { name: /Web to Storage: forbidden dependency.*Proposed change, was undeclared/ })).toBeVisible();
  await expect(page.getByTestId('health-pill')).toContainText('1 needs a ruling');

  // Enter applies; the receipt offers the way back.
  await page.keyboard.press('Enter');
  await expect(proposal).toBeHidden();
  const receipt = page.getByTestId('receipt');
  await expect(receipt).toContainText('Forbade "Web" from depending on "Storage"');
  await expect(page.getByTestId('health-pill')).toContainText('2 need a ruling');
  await expect(page.getByRole('button', { name: /^Web to Storage: forbidden dependency, 1 import$/ })).toBeVisible();

  await receipt.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('health-pill')).toContainText('1 needs a ruling');
  await expect(page.getByRole('button', { name: /^Web to Storage: undeclared dependency, 1 import$/ })).toBeVisible();
});

test('studio: the whole loop works from the keyboard', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByPlaceholder('Paste a GitHub repository URL')).toBeFocused();
  // URL field → Open (disabled, skipped) → Open a local folder → Try the sample.
  for (let step = 0; step < 6; step += 1) {
    await page.keyboard.press('Tab');
    if (await page.getByRole('button', { name: 'Try the sample' }).evaluate((element) => element === document.activeElement)) break;
  }
  // Safari does not tab to buttons unless the system setting is on; reach it directly there.
  await page.getByRole('button', { name: 'Try the sample' }).focus();
  await expect(page.getByRole('button', { name: 'Try the sample' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('blueprint-node-web')).toBeVisible();

  await page.keyboard.press('Control+k');
  await expect(intentBox(page)).toBeFocused();
  await expect(page.getByRole('listbox', { name: 'Suggestions' })).toBeVisible();

  await page.keyboard.type('declare web -> storage');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('proposal-card')).toContainText('Fixes 1 finding');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('proposal-card')).toBeHidden();
  await expect(page.getByTestId('health-pill')).toContainText('1 needs a ruling');

  await page.keyboard.type('declare web -> storage');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('proposal-card')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('receipt')).toBeVisible();
  await expect(page.getByTestId('health-pill')).toContainText('On track');

  // Commands live in the same box.
  await page.keyboard.type('>undo');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('health-pill')).toContainText('1 needs a ruling');

  // The attention sheet is a modal: Escape closes it and focus returns to the pill.
  await page.getByTestId('health-pill').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Attention' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Attention' })).toBeHidden();
  await expect(page.getByTestId('health-pill')).toBeFocused();
});

test('studio: selecting a component opens the inspector and scopes the intent bar', async ({ page }) => {
  await openSample(page);
  await page.getByTestId('blueprint-node-billing').click();
  const inspector = page.getByRole('complementary', { name: 'Billing details' });
  await expect(inspector).toBeVisible();
  await expect(page.getByRole('list', { name: 'Scope' })).toContainText('Billing');

  await inspector.getByRole('button', { name: 'Write intent' }).click();
  await inspector.getByRole('textbox', { name: 'Intent of Billing' }).fill('Plans and limits. Owns the Stripe key.');
  await inspector.getByRole('button', { name: 'Save intent' }).click();
  await expect(page.getByTestId('blueprint-node-billing')).toContainText('Plans and limits.');
  await expect(page.getByTestId('receipt')).toContainText('Set intent of Billing');

  await page.keyboard.press('Escape');
  await expect(inspector).toBeHidden();
});

test('studio: a reload returns to the sample with the unsaved draft', async ({ page }) => {
  await openSample(page);
  await intentBox(page).click();
  await intentBox(page).fill('declare web -> storage');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('proposal-card')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('health-pill')).toContainText('On track');
  // Drafts are written after a short debounce.
  await page.waitForTimeout(900);

  await page.reload();
  await expect(page.getByTestId('blueprint-node-web')).toBeVisible();
  await expect(page.getByTestId('health-pill')).toContainText('On track');
});

test('studio: light theme is one switch away and persists', async ({ page }) => {
  await openSample(page);
  await page.getByTestId('source-pill').click();
  const sheet = page.getByRole('dialog', { name: 'Orbit Notes' });
  await sheet.getByRole('radio', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(sheet.getByRole('link', { name: 'Classic map' })).toHaveAttribute('href', '/map');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

// ── Classic map (/map) ────────────────────────────────────────

test('opens the offline sample, inspects a node, and restores it after reload', async ({ page }) => {
  await page.goto('/map');

  await expect(page.getByRole('heading', { name: 'The architecture contract your coding agents must obey' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Analyze GitHub repository/i })).toBeVisible();

  await page.getByRole('button', { name: /Explore sample/i }).click();
  await expect(page.getByText('Web client', { exact: true })).toBeVisible();
  await page.getByText('Web client', { exact: true }).click();

  await expect(page.getByRole('tab', { name: 'Inspector' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Web client' })).toBeVisible();
  await expect(page.getByText('src/app/page.tsx', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText('Web client', { exact: true })).toBeVisible();
});

test('supports the first-run blank-project flow with keyboard focus', async ({ page }) => {
  await page.goto('/map');
  await page.getByRole('button', { name: /Blank diagram/i }).focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: /Create/i })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Create empty project/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('the classic map links back to the Studio', async ({ page }) => {
  await page.goto('/map');
  await expect(page.getByRole('link', { name: 'Open the Studio (blueprint)' })).toHaveAttribute('href', '/');
});

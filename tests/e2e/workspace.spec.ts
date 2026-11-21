import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    indexedDB.deleteDatabase('rassam-workspace');
    indexedDB.deleteDatabase('repo-agent-files');
  });
});

test('opens the offline sample, inspects a node, and restores it after reload', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Understand a repository through its architecture' })).toBeVisible();
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
  await page.goto('/');
  await page.getByRole('button', { name: /Blank diagram/i }).focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: /Create/i })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Create empty project/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});


import { test, expect, type Page } from '@playwright/test';

// Sample dataset (preview mode) is deterministic: 102 leads
// (34 won, 26 lost, 16 quote, 14 consult, 12 new) -> win rate 34/60 = 56.7%.
const TOTAL = '102';
const WIN_RATE = '56.7%';
const NEW_CURRENT = '12';

const funnelBars = (page: Page) =>
  page.locator('section').filter({ hasText: 'Leads by stage' }).locator('g.mark-rect path, path[aria-label]');

test.describe('Board', () => {
  test('loads header, nav, KPI strip, columns, snapshot', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Pipeline', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Board', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Guide', exact: true })).toBeVisible();
    for (const l of ['Open leads', 'Win rate', 'Pipeline value', 'Won value', 'Avg deal']) {
      await expect(page.getByText(l, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: 'New lead' })).toBeVisible();
    await expect(page.getByText('Pipeline at a glance')).toBeVisible();
    await expect(page.getByText('By stage')).toBeVisible();
    await expect(page.getByText('Top sources')).toBeVisible();
    await expect(page.getByText('By rep')).toBeVisible();
  });

  test('add a lead through the drawer', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New lead' }).click();
    await page.getByLabel('Customer name').fill('UAT Test Customer');
    await page.getByLabel('Project type').fill('Walk-in closet');
    await page.getByLabel('Estimated value (USD)').fill('9000');
    await page.getByRole('button', { name: 'Add lead' }).click();
    await expect(page.getByText('UAT Test Customer')).toBeVisible();
  });
});

test.describe('Dashboard', () => {
  test('loads KPIs, charts, slicers, table', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Sales pipeline' })).toBeVisible();
    await expect(page.getByTestId('kpi-total-leads')).toHaveText(TOTAL);
    await expect(page.getByTestId('kpi-win-rate')).toHaveText(WIN_RATE);
    for (const t of ['Leads by stage', 'Leads by month', 'Win rate by rep', 'Leads by source']) {
      await expect(page.getByRole('heading', { name: t })).toBeVisible();
    }
    await expect(page.locator('section').filter({ hasText: 'Leads by stage' }).locator('svg')).toBeVisible();
    await expect(page.getByText('Needs follow-up')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Lead details' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export' })).toBeVisible();
  });

  test('slicer filters everything then clears', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('kpi-total-leads')).toHaveText(TOTAL);
    await page.getByRole('button', { name: 'Rep' }).click();
    await page.getByRole('checkbox').first().check();
    await expect(page.getByTestId('kpi-total-leads')).not.toHaveText(TOTAL);
    await page.getByRole('button', { name: 'Clear all' }).click();
    await expect(page.getByTestId('kpi-total-leads')).toHaveText(TOTAL);
  });

  test('funnel click filters consistently to the current-stage count', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(funnelBars(page).first()).toBeVisible();
    await funnelBars(page).first().click();
    await expect(page.getByTestId('cross-chip')).toContainText('Stage:');
    await expect(page.getByTestId('kpi-total-leads')).toHaveText(NEW_CURRENT);
  });

  test('table search and pagination', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/Page 1 \/ 5/)).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText(/Page 2 \/ 5/)).toBeVisible();
    await page.getByRole('button', { name: 'Prev' }).click();
    await expect(page.getByText(/Page 1 \/ 5/)).toBeVisible();
    await page.getByPlaceholder('Search leads').fill('zzzznomatch');
    await expect(page.getByText('No leads match your search')).toBeVisible();
  });

  test('export downloads a CSV', async ({ page }) => {
    await page.goto('/dashboard');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('lead-pipeline.csv');
  });

  test('right-click a funnel stage drills through', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(funnelBars(page).first()).toBeVisible();
    await funnelBars(page).first().click({ button: 'right' });
    await expect(page).toHaveURL(/\/dashboard\/drill\/stage\//);
    await expect(page.getByText(/drill-through/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to dashboard' })).toBeVisible();
  });
});

test.describe('Drill-through', () => {
  test('direct nav to a rep drill renders', async ({ page }) => {
    await page.goto('/dashboard/drill/rep/Maria%20Lopez');
    await expect(page.getByText(/Rep drill-through/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Maria Lopez', exact: true })).toBeVisible();
    await expect(page.getByText(/Maria Lopez ·/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to dashboard' })).toBeVisible();
  });
});

test('Guide page renders the walkthrough', async ({ page }) => {
  await page.goto('/guide');
  await expect(page.getByRole('heading', { name: 'How Pipeline works' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Where the work happens' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The health of the pipeline' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Plain-language glossary' })).toBeVisible();
});

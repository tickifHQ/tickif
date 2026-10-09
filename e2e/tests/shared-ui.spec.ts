import { expect, test } from '@playwright/test';

test('shared typography uses loaded brand fonts instead of the system fallback', async ({
  page,
}) => {
  await page.goto('/design-system');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole('button', { name: 'Primary', exact: true })).toHaveCSS(
    'font-family',
    /Inter/,
  );
  await expect(page.locator('#badges [data-slot="badge"]').first()).toHaveCSS(
    'font-family',
    /Inter/,
  );
  await expect(
    page.locator('#badges [data-slot="badge"]').filter({ hasText: 'Compact / code' }),
  ).toHaveCSS('font-family', /JetBrains Mono/);
  expect(
    await page.evaluate(() =>
      [...document.fonts].some((font) => font.family.includes('Inter') && font.status === 'loaded'),
    ),
  ).toBe(true);
});

test('button and badge labels share a tight centered line box at every size', async ({ page }) => {
  await page.goto('/design-system');
  const controls = page.locator('#buttons [data-slot="button"], #badges [data-slot="badge"]');
  const measurements = await controls.evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return {
        label: element.textContent?.trim(),
        fontSize: Number.parseFloat(style.fontSize),
        lineHeight: Number.parseFloat(style.lineHeight),
        alignItems: style.alignItems,
      };
    }),
  );
  for (const measurement of measurements) {
    expect(measurement.lineHeight, measurement.label).toBe(measurement.fontSize);
    expect(measurement.alignItems, measurement.label).toBe('center');
  }
});

test('shared form controls reset native and controlled values together', async ({ page }) => {
  await page.goto('/design-system');
  const name = page.getByRole('textbox', { name: /^Project name/ });
  await name.fill('Shared UI preview');
  await page.getByRole('combobox', { name: 'Location', exact: true }).click();
  await page.getByRole('option', { name: 'Mumbai', exact: true }).click();
  await page.getByRole('checkbox', { name: /Publish immediately/ }).check();
  await page.getByRole('switch', { name: /Email notifications/ }).click();
  await page.getByRole('button', { name: /Save preview/ }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Preview saved: Shared UI preview.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(name).toHaveValue('A home in Indiranagar');
  await expect(page.getByRole('combobox', { name: 'Location', exact: true })).toHaveText(
    'Bengaluru',
  );
  await expect(page.getByRole('checkbox', { name: /Publish immediately/ })).not.toBeChecked();
  await expect(page.getByRole('switch', { name: /Email notifications/ })).toBeChecked();
  expect(
    await page
      .locator('form')
      .evaluate((form: HTMLFormElement) => new FormData(form).get('location')),
  ).toBe('bengaluru');
});

test('select opens a themed popup with keyboard selection and dismissal', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/design-system');
  const select = page.getByRole('combobox', { name: 'Location', exact: true });
  expect(await select.evaluate((element) => element.tagName)).toBe('BUTTON');
  await select.focus();
  await select.press('ArrowDown');
  const list = page.getByRole('listbox');
  await expect(list).toBeVisible();
  await expect(list).toHaveCSS('animation-name', 'none');
  await expect(page.getByRole('option', { name: 'Bengaluru', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(select).toHaveText('Mumbai');
  await expect(select).toBeFocused();
  await select.click();
  await page.keyboard.press('Escape');
  await expect(list).not.toBeVisible();
  await expect(select).toBeFocused();
  await expect(page.getByRole('combobox', { name: 'Disabled select', exact: true })).toBeDisabled();
  await expect(page.getByRole('combobox', { name: 'Invalid select', exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  const optionalSelect = page.getByRole('combobox', { name: 'Optional select', exact: true });
  await optionalSelect.click();
  await expect(page.getByRole('option', { name: 'Unavailable', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.keyboard.press('Home');
  await expect(page.getByRole('option', { name: 'All statuses', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option', { name: 'Active', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option', { name: 'Archived', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(optionalSelect).toHaveText('Archived');
  await optionalSelect.click();
  await page.getByRole('option', { name: 'All statuses', exact: true }).click();
  await expect(optionalSelect).toHaveText('All statuses');
});

test('a select inside a dialog keeps both focus scopes usable', async ({ page }) => {
  await page.goto('/design-system');
  const dialogTrigger = page.getByRole('button', { name: 'Open dialog' });
  await dialogTrigger.click();
  const select = page.getByRole('combobox', { name: 'Consultation format', exact: true });
  await select.click();
  await page.getByRole('option', { name: 'Studio visit', exact: true }).click();
  await expect(select).toHaveText('Studio visit');
  await expect(select).toBeFocused();
  await select.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).not.toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Preview consultation' })).toBeVisible();
  await expect(select).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialogTrigger).toBeFocused();
});

test('month selection can be cleared with a pointer and selected again', async ({ page }) => {
  await page.goto('/design-system');
  const month = page.getByLabel('Completion month', { exact: true });
  // A text field cannot launch the browser's competing native month picker.
  await expect(month).toHaveAttribute('type', 'text');
  await expect(month).toHaveValue('2026-10');
  await page.getByRole('button', { name: 'Clear Completion month' }).click();
  await expect(month).toHaveValue('');
  await month.fill('2026-03');
  const picker = page.getByRole('dialog', { name: 'Completion month month picker' });
  await expect(picker.getByText('2026', { exact: true })).toBeVisible();
  await picker.getByRole('button', { name: 'Apr', exact: true }).click();
  await expect(month).toHaveValue('2026-04');
  await expect(picker).not.toBeVisible();
  await month.fill('2026-13');
  expect(
    await month.evaluate((element: HTMLInputElement) => element.validity.patternMismatch),
  ).toBe(true);
  await month.fill('2026-11');
  expect(await month.evaluate((element: HTMLInputElement) => element.checkValidity())).toBe(true);
  await month.press('Escape');
  await expect(picker).not.toBeVisible();
});

test('shared overlays respect reduced motion and preserve keyboard dismissal', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/design-system');
  const trigger = page.getByRole('button', { name: 'Open dialog' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Preview consultation' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS('animation-name', 'none');
  await expect(page.locator('[data-slot="dialog-overlay"]')).toHaveCSS('animation-name', 'none');
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();

  const menuTrigger = page.getByRole('button', { name: 'Open menu' });
  await menuTrigger.click();
  await expect(page.getByRole('menu')).toHaveCSS('animation-name', 'none');
  await page.keyboard.press('Escape');
  await expect(menuTrigger).toBeFocused();

  await page.getByRole('button', { name: 'Hover or focus for tooltip' }).focus();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await expect(page.locator('[data-slot="tooltip-content"]')).toHaveCSS('animation-name', 'none');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).not.toBeVisible();
});

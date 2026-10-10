import { expect, test } from '@playwright/test';

test('homepage and sign-in use the measured Figma text styles', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const hero = page.getByRole('heading', { name: /Real Indian homes/ });
  await expect(hero).toHaveCSS('font-size', '88px');
  await expect(hero).toHaveCSS('line-height', '96px');
  await expect(hero).toHaveCSS('letter-spacing', '-4px');
  const footer = page.getByRole('contentinfo');
  await expect(footer.getByRole('heading', { name: 'Company' })).toHaveCSS(
    'letter-spacing',
    '0.48px',
  );
  await expect(footer.getByRole('link', { name: 'About' })).toHaveCSS('font-weight', '500');
  await expect(footer.getByRole('link', { name: 'About' })).toHaveCSS('line-height', '18px');

  await page.getByRole('link', { name: 'Log in', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to continue' });
  await expect(dialog.getByText('Discover real homes and their designers')).toHaveCSS(
    'font-size',
    '13px',
  );
  await expect(
    dialog.getByText('Save the homes you love, message designers, and send enquiries directly.'),
  ).toHaveCSS('line-height', '21px');
  await expect(
    dialog.getByRole('heading', { name: /Log in to keep exploring|Login to continue/ }),
  ).toHaveCSS('line-height', '24px');
  const submit = dialog.getByRole('button', { name: 'Get OTP', exact: true });
  await expect(submit).toHaveCSS('font-size', '16px');
  await expect(submit).toHaveCSS('line-height', '20px');
  await expect(submit).toHaveCSS('font-weight', '500');
  await expect(dialog.getByText(/By continuing you agree/)).toHaveCSS('font-size', '13px');
  await expect(dialog.getByText(/By continuing you agree/)).toHaveCSS('line-height', '19px');
  await expect(dialog.getByRole('textbox', { name: 'Phone number' })).toHaveCSS(
    'font-size',
    '16px',
  );
});

test('a loaded display font reaches both the homepage and its portalled sign-in', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--font-display-base', '"Tickif display test"');
  });
  await expect(page.getByRole('heading', { name: /Real Indian homes/ })).toHaveCSS(
    'font-family',
    '"Tickif display test"',
  );
  await page.getByRole('link', { name: 'Log in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: /Log in to keep exploring|Login to continue/ }),
  ).toHaveCSS('font-family', '"Tickif display test"');
});

for (const width of [320, 390, 489]) {
  test(`mobile sign-in retains readable typography and touch targets at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.goto('/designers');
    await page.getByRole('link', { name: 'Sign in', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Sign in to continue' });
    const phone = dialog.getByRole('textbox', { name: 'Phone number' });
    await expect(phone).toHaveCSS('font-size', '16px');
    await expect(dialog.getByRole('tab', { name: "I'm browsing" })).toHaveCSS(
      'line-height',
      '18px',
    );
    expect((await phone.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await phone.fill('9876543210');
    await dialog.getByRole('tab', { name: "I'm a designer" }).click();
    const email = dialog.getByRole('textbox', { name: 'Email', exact: true });
    await expect(email).toHaveCSS('font-size', '16px');
    await expect(dialog.getByText(/By continuing you agree/)).toBeInViewport({ ratio: 1 });
    expect(
      await dialog.evaluate((element) => element.scrollHeight - element.clientHeight),
    ).toBeLessThanOrEqual(1);
    await dialog.getByRole('tab', { name: "I'm browsing" }).click();
    await expect(phone).toHaveValue('9876543210');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  });
}

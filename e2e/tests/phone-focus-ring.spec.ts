import '../lib/environment';
import { randomInt, randomUUID } from 'node:crypto';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { db, inArray, schema } from '@repo/db';
import { assertTestDb, makeDesigner, makeOrganization, makeUser } from '@repo/db/testing';
import { signInPhone } from '../lib/auth';
import { apiUrl, webUrl } from '../lib/environment';

async function expectUnifiedPhoneFocus(page: Page, inputId: string) {
  const input = page.locator(`#${inputId}`);
  const group = input.locator('xpath=..');
  const countryButton = group.getByRole('button', { name: /Country code/ });

  for (const control of [countryButton, input]) {
    await control.focus();
    await expect(control).toBeFocused();
    await expect
      .poll(() =>
        group.evaluate((element) => {
          const style = getComputedStyle(element);
          return [style.outlineStyle, style.outlineWidth, style.outlineOffset];
        }),
      )
      .toEqual(['solid', '2px', '-2px']);
  }
}

async function expectCompositeFocus(control: Locator, group: Locator) {
  const unfocusedShadow = await group.evaluate((element) => getComputedStyle(element).boxShadow);
  await control.focus();
  await expect(control).toBeFocused();
  await expect
    .poll(() => group.evaluate((element) => getComputedStyle(element).boxShadow))
    .not.toBe(unfocusedShadow);
  if ((await control.getAttribute('data-slot')) === 'input') {
    await expect
      .poll(() => control.evaluate((element) => getComputedStyle(element).boxShadow))
      .not.toMatch(/0px 0px 0px [1-9]/);
  }
}

async function expectSectionFocus(control: Locator) {
  // Enter keyboard modality even when the previous interaction was a pointer click.
  await control.press('Tab');
  await control.focus();
  await expect(control).toBeFocused();
  await expect
    .poll(() => control.evaluate((element) => getComputedStyle(element).boxShadow))
    .toMatch(/0px 0px 0px [24]px/);
}

test('composite fields show one visible focus indicator across login and designer workflows', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.goto('/login');
  await expectUnifiedPhoneFocus(page, 'phone');
  await page.screenshot({
    path: testInfo.outputPath('login-phone-focus-desktop.png'),
    animations: 'disabled',
  });
  await page.locator('#phone').fill('123');
  await expect(page.getByRole('button', { name: 'Get OTP', exact: true })).toBeDisabled();
  await page.locator('#phone').fill('9876543210');
  await expect(page.getByRole('button', { name: 'Get OTP', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: /Country code, India/ }).click();
  await page.getByPlaceholder('Search countries...').fill('United States');
  await page.getByText('United States', { exact: true }).click();
  await expect(page.getByRole('button', { name: /Country code, United States/ })).toBeVisible();
  await page.locator('#phone').fill('2025550123');
  await expect(page.getByRole('button', { name: 'Get OTP', exact: true })).toBeEnabled();

  await page.getByRole('tab', { name: /I'm a designer/ }).click();
  const email = page.getByRole('textbox', { name: 'Email', exact: true });
  await expect(email).toBeVisible();
  await expect(page.locator('#phone')).toBeHidden();
  await email.focus();
  await expect(email).toBeFocused();
  await page.screenshot({
    path: testInfo.outputPath('login-email-focus-desktop.png'),
    animations: 'disabled',
  });

  await assertTestDb();
  const suffix = randomUUID();
  const owner = await makeUser({
    name: 'Focus Ring Owner',
    email: `focus-ring-${suffix}@example.test`,
    phoneNumber: `+9194${randomInt(10_000_000, 100_000_000)}`,
    phoneNumberVerified: true,
    role: 'designer',
    status: 'active',
  });
  const organization = await makeOrganization({ name: `Focus Ring Studio ${suffix}` });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  try {
    const profile = await makeDesigner({ userId: owner.id, orgId: organization.id });
    await db.insert(schema.member).values({
      id: randomUUID(),
      userId: owner.id,
      organizationId: organization.id,
      role: 'owner',
      createdAt: new Date(),
    });
    await signInPhone(context, owner.phoneNumber);
    const selection = await context.request.put(`${apiUrl}/api/orgs/context`, {
      headers: { origin: webUrl },
      data: { kind: 'organization', organizationId: organization.id, teamId: profile.teamId },
    });
    expect(selection.ok()).toBeTruthy();

    await page.goto('/designer/profile');
    await expect(page.getByRole('heading', { name: 'Edit your profile' })).toBeVisible();
    await page.locator('#profile-website').focus();
    await expect(page.locator('#profile-website')).toBeFocused();
    await expectUnifiedPhoneFocus(page, 'profile-phone');
    await page.locator('#profile-phone').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath('designer-profile-phone-focus-desktop.png'),
      animations: 'disabled',
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#profile-phone').scrollIntoViewIfNeeded();
    await expectUnifiedPhoneFocus(page, 'profile-phone');
    await page.screenshot({
      path: testInfo.outputPath('designer-profile-phone-focus-mobile.png'),
      animations: 'disabled',
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/designer/portfolio');
    await expect(page.getByRole('heading', { name: 'Portfolio', exact: true })).toBeVisible();
    // Both accordion triggers must expose the same semantic keyboard ring as form controls.
    for (const control of [
      page.getByRole('button', { name: 'Trust & credentials Showcase your trust signals here' }),
      page.getByRole('button', { name: 'Toggle Trust & credentials details' }),
    ]) {
      await expectSectionFocus(control);
    }
    await page.screenshot({
      path: testInfo.outputPath('designer-portfolio-section-focus.png'),
      animations: 'disabled',
    });
    const socialToggle = page.getByRole('button', { name: 'Toggle Social links details' });
    await socialToggle.click();
    await expect(socialToggle).toHaveAttribute('aria-expanded', 'true');
    for (const placeholder of ['Instagram handle', 'Linkedin handle...', 'YouTube handle...']) {
      const socialInput = page.getByPlaceholder(placeholder, { exact: true });
      await expect(socialInput).toBeVisible();
      await expectCompositeFocus(socialInput, socialInput.locator('xpath=..'));
    }
    await page.getByPlaceholder('Instagram handle', { exact: true }).focus();
    await page
      .getByPlaceholder('Instagram handle', { exact: true })
      .evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await page.screenshot({
      path: testInfo.outputPath('designer-portfolio-social-focus-desktop.png'),
      animations: 'disabled',
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByPlaceholder('Instagram handle', { exact: true }).focus();
    await page
      .getByPlaceholder('Instagram handle', { exact: true })
      .evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await page.screenshot({
      path: testInfo.outputPath('designer-portfolio-social-focus-mobile.png'),
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.goto('/designer/new-organization');
    await page.getByRole('button', { name: /Just me/ }).click();
    await page.getByRole('textbox', { name: /Display name/ }).fill('Focus Ring Studio');
    await page.getByRole('button', { name: 'Continue' }).click();
    const onboardingSocial = page.locator('input[id$="-instagram"]');
    await expect(onboardingSocial).toBeVisible();
    await expectCompositeFocus(onboardingSocial, onboardingSocial.locator('xpath=..'));
    await page.screenshot({
      path: testInfo.outputPath('designer-onboarding-social-focus-desktop.png'),
      animations: 'disabled',
    });

    await page.goto('/designer/projects/new');
    const apartment = page.getByRole('combobox', { name: 'Apartment / Building name' });
    await apartment.fill('Prestige');
    await page.getByRole('option', { name: /Prestige Lakeside/i }).click();
    await expect(apartment).toHaveValue('Prestige Lakeside');
    await apartment.click();
    const apartmentMenu = page.getByRole('listbox');
    await expect(apartmentMenu).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('apartment-selector-desktop.png'),
      animations: 'disabled',
    });
    await apartment.press('Tab');
    await expect(apartmentMenu).toBeHidden();
    await expect(apartment).not.toBeFocused();
    await apartment.fill('Casa');
    await apartment.press('Enter');
    await expect(apartment).toHaveValue('Casagrand First City');
    const selectedLogo = page.getByRole('img', { name: 'Casagrand First City logo' });
    await expect(selectedLogo).toBeVisible();
    await expect
      .poll(() => selectedLogo.evaluate((element: HTMLImageElement) => element.naturalWidth))
      .toBeGreaterThan(0);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const logoRight = await selectedLogo.evaluate(
        (element) => element.getBoundingClientRect().right,
      );
      const textLeft = await apartment.evaluate((element) => {
        const style = getComputedStyle(element);
        return (
          element.getBoundingClientRect().left +
          Number.parseFloat(style.borderLeftWidth) +
          Number.parseFloat(style.paddingLeft)
        );
      });
      expect(textLeft).toBeGreaterThan(logoRight);
    }
    await apartment.fill('Independent Residency');
    await expect(page.getByText(/keep this custom apartment name/)).toBeVisible();

    await page.setViewportSize({ width: 320, height: 568 });
    await apartment.fill('');
    await apartment.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(apartmentMenu).toBeVisible();
    await expect
      .poll(() =>
        apartmentMenu.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left >= 0 && rect.right <= window.innerWidth;
        }),
      )
      .toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('apartment-selector-mobile.png'),
      animations: 'disabled',
    });

    await page.setViewportSize({ width: 320, height: 360 });
    await apartment.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await apartment.press('ArrowDown');
    await apartment.press('ArrowDown');
    await apartment.press('ArrowDown');
    await expect
      .poll(() =>
        apartmentMenu.evaluate((element) => {
          const menu = element.getBoundingClientRect();
          const last = element.querySelector('[role="option"]:last-child')!.getBoundingClientRect();
          return last.top >= menu.top && last.bottom <= menu.bottom;
        }),
      )
      .toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('apartment-selector-short-mobile.png'),
      animations: 'disabled',
    });
    await apartment.press('Enter');
    await expect(apartment).toHaveValue('Sea View');
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByRole('button', { name: /Step 4 Project images/ })).toBeVisible();
    await page.getByRole('button', { name: /Step 4 Project images/ }).click();
    for (const control of [
      page.getByRole('button', { name: 'Kitchen No photos yet', exact: true }),
      page.getByRole('button', { name: 'Toggle Kitchen', exact: true }),
    ]) {
      await expectSectionFocus(control);
    }
    const projectUpload = page.locator('input[type="file"]').first();
    await expectCompositeFocus(projectUpload, projectUpload.locator('xpath=..'));
    await projectUpload
      .locator('xpath=..')
      .evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await page.screenshot({
      path: testInfo.outputPath('designer-project-upload-focus-desktop.png'),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: /Add new room type/ }).click();
    const roomSearch = page.getByPlaceholder('Search room types');
    await roomSearch.evaluate((element) => (element as HTMLElement).blur());
    await expectCompositeFocus(roomSearch, roomSearch.locator('xpath=..'));
    await page.screenshot({
      path: testInfo.outputPath('designer-room-search-focus-desktop.png'),
      animations: 'disabled',
    });
    expect(pageErrors).toEqual([]);
  } finally {
    await assertTestDb();
    await db.delete(schema.organization).where(inArray(schema.organization.id, [organization.id]));
    await db.delete(schema.user).where(inArray(schema.user.id, [owner.id]));
  }
});

import { expect, test, type BrowserContext } from '@playwright/test';
import { config } from '../../packages/config/src/index';
import { db, eq, schema } from '../../packages/db/src/index';
import { createReviewParticipantFixture } from '../lib/review-participant-fixtures';

const apiUrl = config.NEXT_PUBLIC_API_URL;
const reviewText = 'The studio listened closely and delivered a thoughtful and practical design.';

async function signIn(context: BrowserContext, phoneNumber: string) {
  const sent = await context.request.post(`${apiUrl}/api/auth/phone-number/send-otp`, {
    headers: { origin: 'http://localhost:3000' },
    data: { phoneNumber },
  });
  expect(sent.ok()).toBeTruthy();
  const [otp] = await db
    .select()
    .from(schema.verification)
    .where(eq(schema.verification.identifier, phoneNumber));
  const code = otp?.value.match(/^\d{4,8}/)?.[0];
  expect(code).toBeTruthy();
  expect(
    (
      await context.request.post(`${apiUrl}/api/auth/phone-number/verify`, {
        headers: { origin: 'http://localhost:3000' },
        data: { phoneNumber, code },
      })
    ).ok(),
  ).toBeTruthy();
}

test('visitor submits and edits, admin publishes, designer disputes, and admin resolves', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120000);
  const fixture = await createReviewParticipantFixture();
  const { author, owner, admin, organization, profile } = fixture;
  const visitorContext = await browser.newContext({ baseURL: 'http://localhost:3000' });
  const designerContext = await browser.newContext({ baseURL: 'http://localhost:3000' });
  const adminContext = await browser.newContext({ baseURL: 'http://localhost:3000' });
  const visitor = await visitorContext.newPage();
  const designer = await designerContext.newPage();
  const moderator = await adminContext.newPage();
  const errors: string[] = [];
  for (const page of [visitor, designer, moderator])
    page.on('pageerror', (error) => errors.push(error.message));
  try {
    await signIn(visitorContext, author.phoneNumber!);
    await signIn(designerContext, owner.phoneNumber!);
    await signIn(adminContext, admin.phoneNumber!);
    expect(
      (
        await designerContext.request.post(`${apiUrl}/api/auth/organization/set-active`, {
          headers: { origin: 'http://localhost:3000' },
          data: { organizationId: organization.id },
        })
      ).ok(),
    ).toBeTruthy();
    expect(
      (
        await designerContext.request.post(`${apiUrl}/api/auth/organization/set-active-team`, {
          headers: { origin: 'http://localhost:3000' },
          data: { teamId: profile.teamId },
        })
      ).ok(),
    ).toBeTruthy();
    await visitor.goto(`/d/${profile.slug}#tickif-reviews`);
    await expect(visitor.getByRole('heading', { name: 'Tickif community reviews' })).toBeVisible();
    await visitor.getByLabel('Your rating').selectOption('4');
    await visitor.getByLabel('Your experience (optional)').fill(reviewText);
    await visitor.getByRole('button', { name: 'Submit review' }).click();
    await expect(visitor.getByRole('status')).toContainText('awaiting moderation');
    await visitor.reload();
    await expect(visitor.getByRole('region', { name: 'Your review' })).toContainText('pending');
    await visitor.getByRole('button', { name: 'Edit your review' }).click();
    await visitor.getByLabel('Your rating').selectOption('5');
    await visitor.getByRole('button', { name: 'Save review changes' }).click();
    await expect(visitor.getByRole('status')).toContainText('awaiting moderation');
    await moderator.goto('/review-moderation?status=pending');
    await moderator
      .getByRole('button', { name: 'Review feedback by Review Journey Visitor' })
      .click();
    await moderator.getByRole('button', { name: 'Publish review', exact: true }).click();
    await expect(moderator.getByRole('dialog')).not.toBeVisible();
    await visitor.getByRole('button', { name: 'Refresh reviews' }).click();
    await expect(visitor.getByLabel('5 star reviews')).toHaveAttribute('value', '1');
    await designer.goto('/designer/reviews');
    await designer.getByRole('button', { name: 'Dispute review' }).click();
    await designer
      .getByLabel('Dispute reason')
      .fill('The project handover details need verification.');
    await designer.getByRole('button', { name: 'Submit dispute' }).click();
    await expect(designer.getByText('disputed', { exact: true }).last()).toBeVisible();
    await moderator.goto('/review-moderation?status=disputed');
    await moderator
      .getByRole('button', { name: 'Review feedback by Review Journey Visitor' })
      .click();
    await moderator
      .getByLabel('Resolution note (required)')
      .fill('The review is supported by the consultation record.');
    await moderator.getByRole('button', { name: 'Resolve and publish' }).click();
    await expect(moderator.getByRole('dialog')).not.toBeVisible();
    await designer.reload();
    await expect(
      designer.getByText(/The review is supported by the consultation record/),
    ).toBeVisible();
    await visitor.getByRole('button', { name: 'Refresh reviews' }).click();
    await expect(visitor.getByLabel('5 star reviews')).toHaveAttribute('value', '1');
    await visitor.screenshot({
      path: testInfo.outputPath('tickif-reviews-desktop.png'),
      fullPage: true,
    });
    await visitor.setViewportSize({ width: 390, height: 844 });
    await visitor.locator('#tickif-reviews').scrollIntoViewIfNeeded();
    expect(
      await visitor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
    await visitor.screenshot({ path: testInfo.outputPath('tickif-reviews-mobile.png') });
    expect(errors).toEqual([]);
  } finally {
    await Promise.allSettled([
      visitorContext.close(),
      designerContext.close(),
      adminContext.close(),
    ]);
    await fixture.cleanup();
  }
});

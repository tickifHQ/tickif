import { expect, test } from '@playwright/test';
import { apiUrl, webUrl } from '../lib/environment';
import { signInPhone as signIn } from '../lib/auth';
import { createReviewParticipantFixture } from '../lib/review-participant-fixtures';

const reviewText = 'The studio listened closely and delivered a thoughtful and practical design.';

test('review lifecycle: visitor edits, admin rejects and publishes, designer disputes, admin publishes and removes', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120000);
  const fixture = await createReviewParticipantFixture();
  const { author, rejectedAuthor, owner, admin, organization: org, profile } = fixture;
  const visitorContext = await browser.newContext({ baseURL: webUrl });
  const designerContext = await browser.newContext({ baseURL: webUrl });
  const adminContext = await browser.newContext({ baseURL: webUrl });
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
          headers: { origin: webUrl },
          data: { organizationId: org.id },
        })
      ).ok(),
    ).toBeTruthy();
    expect(
      (
        await designerContext.request.post(`${apiUrl}/api/auth/organization/set-active-team`, {
          headers: { origin: webUrl },
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
    await designer.getByRole('button', { name: 'Dispute review' }).click();
    await designer
      .getByLabel('Dispute reason')
      .fill('New evidence shows this review references a different project.');
    await designer.getByRole('button', { name: 'Submit dispute' }).click();
    await moderator.goto('/review-moderation?status=disputed');
    await moderator
      .getByRole('button', { name: 'Review feedback by Review Journey Visitor' })
      .click();
    await moderator
      .getByLabel('Resolution note (required)')
      .fill('Removed after confirming the project attribution was incorrect.');
    await moderator.getByRole('button', { name: 'Resolve and remove' }).click();
    await expect(moderator.getByRole('dialog')).not.toBeVisible();
    await visitor.getByRole('button', { name: 'Refresh reviews' }).click();
    await expect(visitor.getByRole('region', { name: 'Your review' })).toContainText('removed');
    await expect(visitor.getByLabel('5 star reviews')).toHaveAttribute('value', '0');
    await visitorContext.request.post(`${apiUrl}/api/auth/sign-out`, {
      headers: { origin: webUrl },
    });
    await signIn(visitorContext, rejectedAuthor.phoneNumber);
    await visitor.goto(`/d/${profile.slug}#tickif-reviews`);
    await visitor.getByLabel('Your rating').selectOption('2');
    await visitor
      .getByLabel('Your experience (optional)')
      .fill('Synthetic rejection branch for an incorrectly attributed project.');
    await visitor.getByRole('button', { name: 'Submit review' }).click();
    await moderator.goto('/review-moderation?status=pending');
    await moderator
      .getByRole('button', { name: 'Review feedback by Review Rejection Visitor' })
      .click();
    await moderator.getByLabel('Rejection reason code').fill('incorrect-attribution');
    await moderator
      .getByLabel('Rejection note (required to reject)')
      .fill('This feedback describes a different organization.');
    await moderator.getByRole('button', { name: 'Reject review', exact: true }).click();
    await expect(moderator.getByRole('dialog')).not.toBeVisible();
    await visitor.getByRole('button', { name: 'Refresh reviews' }).click();
    await expect(visitor.getByRole('region', { name: 'Your review' })).toContainText('rejected');
    await expect(visitor.getByRole('button', { name: 'Edit your review' })).toHaveCount(0);
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

import { apiUrl as stackApiUrl, webUrl as stackWebUrl } from '../lib/environment';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test } from '@playwright/test';
import { verificationStateResponseSchema } from '@repo/contracts';
import {
  createVerificationFixture,
  signInVerificationUser,
  verificationApiUrl,
} from '../lib/verification-fixtures';

test('verification lifecycle: rejected documents are resubmitted, approved and renewed', async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const fixture = await createVerificationFixture();
  const designerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const designer = await designerContext.newPage();
  const admin = await adminContext.newPage();
  const runtimeErrors: string[] = [];
  for (const page of [designer, admin])
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
  const document = {
    name: 'synthetic-registration.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4d0AAAAASUVORK5CYII=',
      'base64',
    ),
  };
  const readState = async () => {
    const response = await designerContext.request.get(`${verificationApiUrl}/api/verifications`);
    expect(response.ok()).toBeTruthy();
    return verificationStateResponseSchema.parse(await response.json());
  };
  const openApplication = () =>
    admin
      .getByRole('button', { name: `Open verification for ${fixture.organization.name}` })
      .click();
  const screenshot = async (name: string) => {
    const path = join(tmpdir(), `tickif-kyc-${testInfo.workerIndex}-${name}.png`);
    await admin.screenshot({ path, fullPage: false, animations: 'disabled' });
    await testInfo.attach(name, { path, contentType: 'image/png' });
  };
  try {
    await signInVerificationUser(designerContext, fixture.owner.phoneNumber);
    const selectedContext = await designerContext.request.put(
      `${verificationApiUrl}/api/orgs/context`,
      {
        headers: { origin: stackWebUrl },
        data: { kind: 'organization', organizationId: fixture.organization.id },
      },
    );
    expect(
      selectedContext.ok(),
      'Designer selects their studio through the real context API',
    ).toBeTruthy();
    await signInVerificationUser(adminContext, fixture.admin.phoneNumber);
    await designer.goto(`${stackWebUrl}/designer/verification`);
    await expect(designer.getByRole('heading', { name: 'Get Verified' })).toBeVisible();
    await designer.locator('#business-document').setInputFiles(document);
    await designer.getByRole('button', { name: 'Submit for verification', exact: true }).click();
    await expect.poll(async () => (await readState()).status).toBe('pending');
    const applicationId = (await readState()).applicationId;

    await admin.goto(`${stackWebUrl}/verifications`);
    await expect(admin).toHaveTitle('Profile verification · Tickif');
    await openApplication();
    const popupPromise = admin.waitForEvent('popup');
    await admin.getByRole('button', { name: 'View MSME/Udyam registration', exact: true }).click();
    const documentPreview = await popupPromise;
    await documentPreview.waitForURL((url) => url.hostname === 'localhost' && url.port === '9000');
    const signedUrl = new URL(documentPreview.url());
    expect(signedUrl.searchParams.get('X-Amz-Expires')).toBe('60');
    const privateObject = await adminContext.request.get(signedUrl.toString());
    expect(privateObject.ok(), 'Admin signed URL opens the uploaded private object').toBeTruthy();
    expect(await privateObject.body()).toEqual(document.buffer);
    const unsignedObject = await adminContext.request.get(
      `${signedUrl.origin}${signedUrl.pathname}`,
    );
    expect(unsignedObject.status(), 'Anonymous unsigned object access remains denied').toBe(403);
    await documentPreview.close();
    await admin.getByRole('button', { name: 'Request changes', exact: true }).click();
    const feedback = admin.getByRole('dialog', { name: 'Request changes', exact: true });
    await feedback.getByRole('checkbox', { name: 'MSME/Udyam registration' }).check();
    await feedback
      .getByLabel('Feedback for the designer')
      .fill('Upload a clearer synthetic registration document.');
    await feedback.getByRole('button', { name: 'Send feedback' }).click();
    await expect.poll(async () => (await readState()).status).toBe('rejected');

    await designer.reload();
    await expect(designer.getByText('Resubmit document', { exact: true })).toBeVisible();
    await designer.locator('#business-document').setInputFiles(document);
    await designer.getByRole('button', { name: 'Resubmit for verification', exact: true }).click();
    await expect.poll(async () => (await readState()).attempt).toBe(2);
    await expect.poll(async () => (await readState()).status).toBe('pending');
    await admin.getByRole('tab', { name: /Re-review/ }).click();
    await openApplication();
    await expect(
      admin.getByText('Upload a clearer synthetic registration document.'),
    ).toBeVisible();
    await admin.getByRole('button', { name: 'Approve verification', exact: true }).click();
    await admin.getByRole('button', { name: 'Confirm approval', exact: true }).click();
    await expect.poll(async () => (await readState()).status).toBe('verified');
    const approved = await readState();
    expect(approved.documents[0]?.version).toBe(2);
    expect(approved.expiresAt).not.toBeNull();
    await admin.getByRole('tab', { name: /Accepted/ }).click();
    await openApplication();
    await expect(admin.getByText('Approval expires', { exact: true })).toBeVisible();
    await screenshot('approved');
    await admin.getByRole('button', { name: 'Close', exact: true }).first().click();

    await fixture.expireApproval(applicationId);
    await admin.reload();
    await admin.getByRole('tab', { name: /Expired/ }).click();
    await openApplication();
    await expect(admin.getByText(/The verified badge is inactive/)).toBeVisible();
    await expect(admin.getByRole('button', { name: 'Revoke approval' })).toHaveCount(0);
    await screenshot('expired-desktop');
    await admin.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        admin
          .locator('[data-slot="dialog-content"]')
          .first()
          .evaluate((element) => element.scrollWidth - element.clientWidth),
      )
      .toBeLessThanOrEqual(1);
    await screenshot('expired-mobile');
    await admin.getByRole('button', { name: 'Close', exact: true }).first().click();
    await designer.reload();
    await expect(designer.getByText('Verification expired', { exact: true })).toBeVisible();
    await designer.getByRole('button', { name: 'Resubmit for verification', exact: true }).click();
    await expect.poll(async () => (await readState()).attempt).toBe(3);
    await admin.setViewportSize({ width: 1440, height: 1000 });
    await admin.getByRole('tab', { name: /Re-review/ }).click();
    await openApplication();
    await expect(admin.getByText(/Renewal review: this designer resubmitted/)).toBeVisible();
    await screenshot('renewal');
    await admin.getByRole('button', { name: 'Approve verification', exact: true }).click();
    await admin.getByRole('button', { name: 'Confirm approval', exact: true }).click();
    await expect.poll(async () => (await readState()).status).toBe('verified');
    expect(runtimeErrors).toEqual([]);
  } finally {
    await designerContext.close();
    await adminContext.close();
    await fixture.cleanup();
  }
});

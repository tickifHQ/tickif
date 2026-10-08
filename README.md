# PR #713 review evidence

Review-only media for https://github.com/tickifHQ/tickif/pull/713.
This separate evidence branch has no application code or workflow files and is not a merge target.

## Screenshots

The Studio Meraki captures show the actual local portfolio and owner/visitor audit, using explicitly synthetic demo content. The enquiry fixture was removed after verification. Mobile cover cropping is from the successful CI cover-publication journey.

## Videos

These are unedited browser recordings from passing tests in CI run 37833559156, application commit 2cd1381e266d51a2daf7e54c1eb13d75fbf86a71. The later 32e1b30e commit changes two other test fixtures/assertions only. Videos use synthetic accounts and show desktop/mobile viewport switches; grey recording padding is expected.

- [Cover upload and publication (16 seconds)](cover-upload-and-publication.webm): crop, save/retry states, editor and public portfolio.
- [Published portfolio and canonical links (12 seconds)](published-portfolio-and-canonical-links.webm): owner dashboard/editor links and responsive public page.
- [Accent configuration (18 seconds)](accent-configuration.webm): saved colour reflected in editor and public desktop/mobile views.

Source CI: https://github.com/tickifHQ/tickif/actions/runs/37833559156
These clips document their passing journeys, not a claim that that entire CI run passed (136/138 passed; two separate test setup issues were subsequently corrected).

export function reasonLabel(reason: string | null) {
  switch (reason) {
    case 'cancellation_scheduled':
      return 'Continue after your current subscription ends. Your existing access remains available until the verified end date.';
    case 'payment_mode_change_unsupported':
      return 'Your payment method does not support this plan change. Keep your target and switch after your current subscription ends.';
    case 'payment_method_unverified':
      return 'Your payment method has not been verified for in-place plan changes. Keep your target and switch after your current subscription ends.';
    case 'amount_authorization_unavailable':
      return 'An immediate adjustment cannot be authorized safely. Keep your target and switch after your current subscription ends.';
    case 'unfinished_checkout_conflict':
    case 'checkout_target_conflict':
      return 'Another plan has an unfinished checkout. Resume that checkout or contact support before purchasing a different plan.';
    case 'payment_recovery_required':
      return 'Update your payment method before changing plans.';
    case 'activation_pending':
      return 'Payment activation is pending. Refresh billing to check its status.';
    case 'cancellation_requested':
      return 'Cancellation has been requested. Wait for provider confirmation before continuing.';
    case 'provider_outcome_unconfirmed':
    case 'reconciliation_pending':
      return 'The provider outcome is still being reconciled. Refresh billing status before taking another action.';
    case 'provider_outcome_support_required':
      return 'The provider outcome could not be confirmed automatically. Contact support before retrying.';
    case 'scheduled_change_pending':
      return 'A plan change is already scheduled. Your current access remains until the confirmed transition.';
    case 'review_required':
      return 'Billing details changed. Review the saved target again before confirming.';
    case 'intent_dismissed_provider_schedule_unchanged':
      return 'The saved target was dismissed. Any existing provider cancellation or scheduled plan change remains in place.';
    case 'provider_unavailable':
    case 'subscription_state_unverified':
      return 'Billing status could not be verified. Refresh billing before choosing a plan.';
    default:
      return 'This operation is unavailable until billing eligibility is confirmed. Refresh billing or contact support.';
  }
}

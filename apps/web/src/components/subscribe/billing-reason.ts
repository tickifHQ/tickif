export function reasonLabel(reason: string | null) {
  switch (reason) {
    case 'source_subscription_terminated':
      return 'Your previous subscription has ended.';
    case 'another_plan_activated':
      return 'Another plan is now active, so this saved selection no longer applies.';
    case 'cancellation_scheduled':
      return 'You can buy your selected plan after your current subscription ends. Until then, keep using your current plan.';
    case 'payment_mode_change_unsupported':
      return 'Your payment method does not support this plan change. You can buy the new plan after your current subscription ends.';
    case 'payment_method_unverified':
      return 'We cannot confirm this change with your payment method. You can buy the new plan after your current subscription ends.';
    case 'amount_authorization_unavailable':
      return 'We cannot confirm the charge for changing plans now. You can buy the new plan after your current subscription ends.';
    case 'unfinished_checkout_conflict':
    case 'checkout_target_conflict':
      return 'Another plan has an unfinished checkout. Resume that checkout or contact support before purchasing a different plan.';
    case 'payment_recovery_required':
      return 'Update your payment method before changing plans.';
    case 'activation_pending':
      return 'Payment activation is pending. This status updates automatically.';
    case 'cancellation_requested':
      return 'Cancellation requested. Wait for confirmation before continuing.';
    case 'provider_outcome_unconfirmed':
    case 'reconciliation_pending':
      return 'We are checking your billing change. This status updates automatically.';
    case 'provider_outcome_support_required':
      return 'We could not confirm this change. Contact support before trying again.';
    case 'scheduled_change_pending':
      return 'A plan change is scheduled. Keep using your current plan until it takes effect.';
    case 'review_required':
      return 'Billing details changed. Review your saved plan before confirming.';
    case 'intent_dismissed_provider_schedule_unchanged':
      return 'Saved plan removed. Any scheduled cancellation or plan change still applies.';
    case 'provider_unavailable':
    case 'subscription_state_unverified':
      return 'Billing status could not be verified. We will keep checking automatically.';
    default:
      return 'This change is not available yet. We will keep checking automatically. Contact support if you need help.';
  }
}

export const OUTBOUND_EMAILS_DISABLED_MESSAGE =
  "Outbound emails disabled, skipping send";

export type OutboundEmailBlockedResult = {
  blocked: true;
  reason: typeof OUTBOUND_EMAILS_DISABLED_MESSAGE;
};

export function canSendOutboundEmails(): boolean {
  return process.env.SELION_OUTBOUND_EMAILS_ENABLED === "true";
}

export function getOutboundEmailBlockedResult(): OutboundEmailBlockedResult {
  console.log(OUTBOUND_EMAILS_DISABLED_MESSAGE);
  return {
    blocked: true,
    reason: OUTBOUND_EMAILS_DISABLED_MESSAGE,
  };
}

export function assertOutboundEmailsEnabled(): void {
  if (!canSendOutboundEmails()) {
    console.log(OUTBOUND_EMAILS_DISABLED_MESSAGE);
    throw new Error(OUTBOUND_EMAILS_DISABLED_MESSAGE);
  }
}

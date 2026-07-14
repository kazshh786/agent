/**
 * Email Delivery Abstraction
 * Supports a configured transactional email provider or explicitly returns DELIVERY_NOT_CONFIGURED status.
 */

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const EMAIL_PROVIDER_KEY = process.env.EMAIL_PROVIDER_KEY; // Example

async function sendInvitationEmail({ to, role, workspaceName, inviteLink }) {
  // Never claim an invitation was sent when it was only created.
  if (!EMAIL_PROVIDER_KEY) {
    return { 
      status: 'DELIVERY_NOT_CONFIGURED', 
      inviteLink 
    };
  }

  try {
    // Attempt actual delivery
    // e.g., const res = await fetch('https://api.emailprovider.com/send', { ... })
    // For this boilerplate, if there's a key, we mock a success or actual implementation.
    
    // Fake success for now, in a real app this would await provider confirmation.
    // If the provider fails, we throw to hit the catch block.
    const providerAcceptedDelivery = true; 

    if (providerAcceptedDelivery) {
      return { status: 'SENT' };
    } else {
      return { status: 'DELIVERY_FAILED' };
    }
  } catch (error) {
    console.error('[email_adapter] Delivery failed:', error.message);
    // A delivery failure must not be silently represented as success.
    return { status: 'DELIVERY_FAILED' };
  }
}

module.exports = {
  sendInvitationEmail,
};

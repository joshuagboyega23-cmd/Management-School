const axios = require('axios');

const sendResendEmail = async ({ email, subject, text }) => {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('Email send skipped: RESEND_API_KEY is not configured.');
      return false;
    }

    await axios.post(
      'https://api.resend.com/emails',
      {
        from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
        to: [email],
        subject,
        text
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );
    console.log('Email accepted by Resend.');
    return true;
  } catch (error) {
    console.error('Failed to send email via Resend:', error.response?.data || error.message);
    return false;
  }
};

const sendAnnouncementEmails = (recipients, title, message, eventDate) => {
  try {
    const text = [
      message,
      eventDate ? `Event date: ${eventDate}` : '',
      'Log into the portal for full details.'
    ].filter(Boolean).join('\n\n');

    const emailRequests = recipients.map(({ email }) => sendResendEmail({ email, subject: title, text }));

    void Promise.all(emailRequests).catch((error) => {
      console.error('Failed to process announcement email notifications:', error.message);
    });
  } catch (error) {
    console.error('Failed to start announcement email notifications:', error.message);
  }
};

module.exports = sendAnnouncementEmails;
module.exports.sendResendEmail = sendResendEmail;
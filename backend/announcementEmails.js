const axios = require('axios');

const sendAnnouncementEmails = (recipients, title, message, eventDate) => {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('Announcement email notifications skipped: RESEND_API_KEY is not configured.');
      return;
    }

    const text = [
      message,
      eventDate ? `Event date: ${eventDate}` : '',
      'Log into the portal for full details.'
    ].filter(Boolean).join('\n\n');

    const emailRequests = recipients.map(async ({ email }) => {
      try {
        await axios.post(
          'https://api.resend.com/emails',
          {
            from: 'onboarding@resend.dev',
            to: [email],
            subject: title,
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
        console.log('Announcement email accepted by Resend.');
      } catch (error) {
        console.error('Failed to send announcement email:', error.response?.data || error.message);
      }
    });

    void Promise.all(emailRequests).catch((error) => {
      console.error('Failed to process announcement email notifications:', error.message);
    });
  } catch (error) {
    console.error('Failed to start announcement email notifications:', error.message);
  }
};

module.exports = sendAnnouncementEmails;
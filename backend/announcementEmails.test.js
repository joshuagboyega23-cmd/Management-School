const assert = require('node:assert/strict');
const test = require('node:test');
const axios = require('axios');
const sendAnnouncementEmails = require('./announcementEmails');

test('announcement email failures are logged and do not block the caller', async () => {
  const originalPost = axios.post;
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalConsoleError = console.error;
  const requests = [];

  process.env.RESEND_API_KEY = 'fake-resend-key';
  axios.post = (...args) => {
    requests.push(args);
    return Promise.reject(new Error('Simulated Resend failure'));
  };
  console.error = () => {};

  try {
    const result = sendAnnouncementEmails(
      [{ email: 'parent@example.test' }, { email: 'teacher@example.test' }],
      'Term dates',
      'The new term begins soon.',
      '2026-10-01'
    );

    assert.equal(result, undefined);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(requests.length, 2);
    assert.equal(requests[0][0], 'https://api.resend.com/emails');
    assert.equal(requests[0][1].from, 'onboarding@resend.dev');
    assert.deepEqual(requests[0][1].to, ['parent@example.test']);
    assert.equal(requests[0][1].subject, 'Term dates');
    assert.match(requests[0][1].text, /Event date: 2026-10-01/);
    assert.match(requests[0][1].text, /Log into the portal for full details\./);
    assert.equal(requests[0][2].timeout, 5000);
  } finally {
    axios.post = originalPost;
    console.error = originalConsoleError;
    if (originalApiKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalApiKey;
    }
  }
});
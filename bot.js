require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const messages = require('./messages');
const { appendLead, getRepresentativePhone } = require('./googleSheets');

const app = express();
const port = Number(process.env.PORT || 3000);
const apiVersion = process.env.WHATSAPP_API_VERSION || 'v26.0';

function whatsappUrl() {
  return `https://graph.facebook.com/${apiVersion}/${process.env.PHONE_NUMBER_ID}/messages`;
}

async function sendWhatsAppMessage(to, payload) {
  const response = await fetch(whatsappUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, ...payload })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`WhatsApp API request failed (${response.status}): ${errorBody}`);
  }
}

async function sendText(to, body) {
  return sendWhatsAppMessage(to, { type: 'text', text: { body } });
}

async function sendRepresentativeTemplate(to, data, type) {
  const details = [
    data.help_type && `סוג עזרה: ${data.help_type}`,
    data.urgency && `דחיפות: ${data.urgency}`,
    data.phone && `טלפון: ${data.phone}`
  ].filter(Boolean).join(' | ');

  return sendWhatsAppMessage(to, {
    type: 'template',
    template: {
      name: process.env.WHATSAPP_TEMPLATE_NAME || 'new_lead_notification',
      language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'he' },
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: data.name || 'לא צוין' },
          { type: 'text', text: data.district || 'לא צוין' },
          { type: 'text', text: type },
          { type: 'text', text: details || 'לא נמסרו פרטים נוספים' }
        ]
      }]
    }
  });
}

const sessions = new Map();
const districts = { '1': 'צפון', '2': 'ירושלים', '3': 'מרכז-שומרון', '4': 'דרום' };
const paymentMethods = { '1': 'העברה בנקאית', '2': 'ביט' };
const keywords = { עזרה: 'help', 'בקשת עזרה': 'help', הצטרפות: 'join', 'הצטרפות לתנועה': 'join', תרומה: 'donation', מידע: 'info' };

function normalizeText(text) {
  return text.trim().toLowerCase().replace(/[׳״]/g, '');
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  return digits.startsWith('0') ? `972${digits.slice(1)}` : digits;
}

function adminChatId() {
  return normalizePhone(process.env.ADMIN_PHONE);
}

function getSession(phone) {
  if (!sessions.has(phone)) {
    sessions.set(phone, { stage: 'MENU', data: { phone } });
  }
  return sessions.get(phone);
}

function resetSession(phone) {
  const session = { stage: 'MENU', data: { phone } };
  sessions.set(phone, session);
  return session;
}

function getMenuChoice(text) {
  if (/^[1-4]$/.test(text)) return text;
  return keywords[text];
}

function getDistrict(text) {
  return districts[text] || (Object.values(districts).includes(text) ? text : null);
}

function getStagePrompt(stage) {
  return {
    HELP_NAME: messages.namePrompt,
    HELP_DISTRICT: messages.helpDistrictPrompt,
    HELP_TYPE: messages.helpTypePrompt,
    HELP_URGENCY: messages.urgencyPrompt,
    JOIN_DISTRICT: messages.joinDistrictPrompt,
    DONATION_PAYMENT: messages.paymentPrompt,
    DONATION_DEDICATION: messages.dedicationPrompt,
    DONATION_DEDICATION_NAME: messages.dedicationNamePrompt
  }[stage] || messages.menu;
}

async function notifyRepresentative(session, type) {
  const phone = await getRepresentativePhone(session.data.district, type);
  if (!phone) {
    await sendText(
      adminChatId(),
      messages.adminMissingRepresentative(session.data.district, type)
    );
    return false;
  }

  await sendRepresentativeTemplate(phone, session.data, type);
  return true;
}

async function completeHelp(session, chat) {
  await appendLead({ ...session.data, request_type: 'בקשת עזרה' });
  const representativeFound = await notifyRepresentative(session, 'עזרה');
  await chat.sendMessage(representativeFound
    ? messages.helpSummary(session.data)
    : messages.helpReceivedFallback);
  resetSession(session.data.phone);
}

async function completeJoin(session, chat) {
  await appendLead({ ...session.data, request_type: 'הצטרפות לתנועה' });
  const representativeFound = await notifyRepresentative(session, 'הצטרפות');
  await chat.sendMessage(messages.joinForm(process.env.JOIN_FORM_URL));
  await chat.sendMessage(representativeFound ? messages.joinReceived : messages.helpReceivedFallback);
  resetSession(session.data.phone);
}

async function completeDonation(session, chat) {
  await appendLead({ ...session.data, request_type: 'תרומה' });
  const details = {
    'העברה בנקאית': process.env.PAYMENT_BANK_DETAILS,
    ביט: process.env.PAYMENT_BIT_DETAILS
  }[session.data.payment_method];
  await chat.sendMessage(messages.donationDetails(details || 'פרטי התשלום טרם הוגדרו.'));
  resetSession(session.data.phone);
}

async function handleMessage(message) {
  if (message.from.endsWith('@g.us') || message.fromMe) return;

  const phone = message.from.replace('@c.us', '');
  const text = normalizeText(message.body);
  const existingSession = sessions.get(phone);

  if (!existingSession || text === 'תפריט' || text === 'היי' || text === '0') {
    resetSession(phone);
    await message.reply(messages.menu);
    return;
  }

  const session = existingSession;
  const chat = await message.getChat();

  if (session.stage === 'MENU') {
    const choice = getMenuChoice(text);
    if (choice === '1' || choice === 'help') {
      session.stage = 'HELP_NAME';
      await message.reply(messages.namePrompt);
    } else if (choice === '2' || choice === 'join') {
      session.stage = 'JOIN_DISTRICT';
      await message.reply(messages.joinDistrictPrompt);
    } else if (choice === '3' || choice === 'donation') {
      session.stage = 'DONATION_PAYMENT';
      await message.reply(messages.paymentPrompt);
    } else if (choice === '4' || choice === 'info') {
      await message.reply(messages.information(process.env.WEBSITE_URL));
      await message.reply(messages.menu);
    } else {
      await message.reply(`${messages.unexpected}\n\n${messages.menu}`);
    }
    return;
  }

  if (session.stage === 'HELP_NAME') {
    session.data.name = message.body.trim();
    session.stage = 'HELP_DISTRICT';
    await message.reply(messages.helpDistrictPrompt);
  } else if (session.stage === 'HELP_DISTRICT') {
    const district = getDistrict(text);
    if (!district) return message.reply(`${messages.unexpected}\n\n${messages.helpDistrictPrompt}`);
    session.data.district = district;
    session.stage = 'HELP_TYPE';
    await message.reply(messages.helpTypePrompt);
  } else if (session.stage === 'HELP_TYPE') {
    session.data.help_type = message.body.trim();
    session.stage = 'HELP_URGENCY';
    await message.reply(messages.urgencyPrompt);
  } else if (session.stage === 'HELP_URGENCY') {
    session.data.urgency = message.body.trim();
    await completeHelp(session, chat);
  } else if (session.stage === 'JOIN_DISTRICT') {
    const district = getDistrict(text);
    if (!district) return message.reply(`${messages.unexpected}\n\n${messages.joinDistrictPrompt}`);
    session.data.district = district;
    session.stage = 'JOIN_DONE';
    await completeJoin(session, chat);
  } else if (session.stage === 'DONATION_PAYMENT') {
    const paymentMethod = paymentMethods[text];
    if (!paymentMethod) return message.reply(`${messages.unexpected}\n\n${messages.paymentPrompt}`);
    session.data.payment_method = paymentMethod;
    session.stage = 'DONATION_DEDICATION';
    await message.reply(messages.dedicationPrompt);
  } else if (session.stage === 'DONATION_DEDICATION') {
    if (text === 'כן' || text === 'כן.') {
      session.stage = 'DONATION_DEDICATION_NAME';
      await message.reply(messages.dedicationNamePrompt);
    } else if (text === 'לא' || text === 'לא.') {
      session.data.dedication = 'לא';
      await completeDonation(session, chat);
    } else {
      await message.reply(`${messages.unexpected}\n\n${messages.dedicationPrompt}`);
    }
  } else if (session.stage === 'DONATION_DEDICATION_NAME') {
    session.data.dedication = message.body.trim();
    await completeDonation(session, chat);
  } else {
    session.stage = 'MENU';
    await message.reply(messages.menu);
  }
}

function isValidWebhookSignature(rawBody, signature) {
  if (!signature || !process.env.APP_SECRET) return false;
  const expected = `sha256=${crypto.createHmac('sha256', process.env.APP_SECRET)
    .update(rawBody).digest('hex')}`;
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

app.get('/webhook', (request, response) => {
  if (request.query['hub.verify_token'] !== process.env.WEBHOOK_VERIFY_TOKEN) {
    return response.sendStatus(403);
  }
  return response.status(200).send(request.query['hub.challenge']);
});

app.post('/webhook', express.raw({ type: 'application/json' }), (request, response) => {
  const signature = request.get('X-Hub-Signature-256');
  if (!isValidWebhookSignature(request.body, signature)) return response.sendStatus(403);

  let payload;
  try {
    payload = JSON.parse(request.body.toString('utf8'));
  } catch (error) {
    return response.sendStatus(400);
  }

  response.sendStatus(200);
  const incomingMessages = (payload.entry || [])
    .flatMap((entry) => entry.changes || [])
    .flatMap((change) => change.value && change.value.messages || [])
    .filter((message) => message.type === 'text' && message.text && message.from);

  for (const incoming of incomingMessages) {
    const message = {
      from: `${incoming.from}@c.us`,
      fromMe: false,
      body: incoming.text.body,
      reply: (body) => sendText(incoming.from, body),
      getChat: async () => ({ sendMessage: (body) => sendText(incoming.from, body) })
    };

    handleMessage(message).catch(async (error) => {
      console.error('Message handling failed:', error);
      try {
        await sendText(incoming.from, messages.error);
      } catch (replyError) {
        console.error('Could not send error message:', replyError);
      }
    });
  }
});

app.listen(port, () => console.log(`WhatsApp webhook server listening on port ${port}.`));

const { google } = require('googleapis');
require('dotenv').config();

const CACHE_TTL_MS = 5 * 60 * 1000;
let representativesCache = { expiresAt: 0, rows: [] };

function getAuth() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is missing');
  }

  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
}

function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuth() });
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  return digits.startsWith('0') ? `972${digits.slice(1)}` : digits;
}

async function loadRepresentatives() {
  if (representativesCache.expiresAt > Date.now()) {
    return representativesCache.rows;
  }

  const sheets = getSheetsClient();
  const spreadsheetId = process.env.REPS_SPREADSHEET_ID;
  const range = `${process.env.REPS_SHEET_NAME || 'נציגים'}!A:D`;
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const [headers = [], ...values] = response.data.values || [];
  const index = Object.fromEntries(headers.map((header, position) => [String(header).trim(), position]));
  const requiredHeaders = ['מחוז', 'סוג (עזרה/הצטרפות)', 'שם נציג', 'טלפון'];
  const missingHeader = requiredHeaders.find((header) => index[header] === undefined);
  if (missingHeader) {
    throw new Error(`Missing representatives sheet header: ${missingHeader}`);
  }

  representativesCache = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    rows: values.map((row) => ({
      district: String(row[index['מחוז']] || '').trim(),
      type: String(row[index['סוג (עזרה/הצטרפות)']] || '').trim(),
      name: String(row[index['שם נציג']] || '').trim(),
      phone: normalizePhone(row[index['טלפון']])
    }))
  };
  return representativesCache.rows;
}

async function getRepresentativePhone(district, type) {
  const rows = await loadRepresentatives();
  const representative = rows.find((row) => row.district === district && row.type === type);
  return representative ? representative.phone : null;
}

async function appendLead(data) {
  const sheets = getSheetsClient();
  const values = [[
    data.phone,
    new Date().toISOString(),
    data.request_type,
    data.name || '',
    data.district || '',
    data.help_type || '',
    data.urgency || '',
    data.payment_method || '',
    data.dedication || ''
  ]];

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.LEADS_SPREADSHEET_ID,
    range: `${process.env.LEADS_SHEET_NAME || 'פניות'}!A:I`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values }
  });
}

module.exports = { appendLead, getRepresentativePhone };

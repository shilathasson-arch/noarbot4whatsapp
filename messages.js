const messages = {
  menu: `הגעתם לנוער המתנדב. איך אפשר לעזור?\n1️⃣ בקשת עזרה\n2️⃣ הצטרפות לתנועה\n3️⃣ תרומה\n4️⃣ מידע`,
  unexpected: 'לא הבנתי, נסה שוב',
  namePrompt: 'אנא רשום את שמך',
  helpDistrictPrompt: 'באיזה מחוז אתה מתגורר?\n1. צפון\n2. ירושלים\n3. מרכז-שומרון\n4. דרום',
  helpTypePrompt: 'איזו עזרה תצטרך?',
  urgencyPrompt: 'מהי רמת הדחיפות ומתי יהיה נח להגיע?',
  joinDistrictPrompt: 'איזה כיף שבחרת להצטרף אלינו! מהו מחוז מגוריך?\n1. צפון\n2. ירושלים\n3. מרכז-שומרון\n4. דרום',
  joinForm: (url) => `כדי להשלים את ההצטרפות, מלא/י את הטופס:\n${url}`,
  joinReceived: 'תודה! הפרטים הועברו לרכז המחוז.',
  paymentPrompt: 'איך תרצה לתרום?\n1. העברה בנקאית\n2. ביט',
  dedicationPrompt: 'תרצה להקדיש את התרומה למישהו? כתוב כן או לא.',
  dedicationNamePrompt: 'למי תרצה להקדיש את התרומה? כתוב את השם.',
  donationDetails: (details) => `תודה על הרצון לתרום!\n${details}`,
  information: (websiteUrl) => `נוער המתנדב פועל למען בני נוער וקהילות באמצעות התנדבות, סיוע וחיבור בין אנשים.\nלמידע נוסף ולשאלות: ${websiteUrl}`,
  helpSummary: (data) => `קיבלנו את בקשת העזרה שלך:\nשם: ${data.name}\nמחוז: ${data.district}\nסוג עזרה: ${data.help_type}\nרמת דחיפות וזמן הגעה: ${data.urgency}`,
  helpReceivedFallback: 'קיבלנו את הפנייה, ניצור קשר בהקדם',
  adminMissingRepresentative: (district, type) => `שגיאה: לא נמצא נציג עבור מחוז "${district}" וסוג "${type}".`,
  representativeNotification: (data, type) => `פנייה חדשה (${type})\nטלפון: ${data.phone}\nמחוז: ${data.district}\n${data.name ? `שם: ${data.name}\n` : ''}${data.help_type ? `סוג עזרה: ${data.help_type}\n` : ''}${data.urgency ? `דחיפות: ${data.urgency}` : ''}`,
  error: 'אירעה שגיאה זמנית. נסה שוב מאוחר יותר.'
};

module.exports = messages;

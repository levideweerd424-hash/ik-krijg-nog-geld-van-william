/**
 * Automatische deadlineherinneringen voor Ik krijg nog geld van William.
 * Stel SUPABASE_URL en SUPABASE_ANON_KEY in via Project Settings > Script properties.
 * Gebruik de Supabase publishable/anon key; NOOIT de service_role key.
 */
function sendClaimReminders() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('SUPABASE_URL');
  const key = props.getProperty('SUPABASE_ANON_KEY');
  if (!url || !key) throw new Error('Vul SUPABASE_URL en SUPABASE_ANON_KEY in bij Script properties.');

  const today = Utilities.formatDate(new Date(), 'Europe/Amsterdam', 'yyyy-MM-dd');
  const endpoint = url.replace(/\/$/, '') +
    '/rest/v1/claims?select=id,name,amount,reason,due_date,notification_email,reminder_deadline_sent_at,reminder_followup_sent_at' +
    '&status=eq.open&due_date=not.is.null&notification_email=not.is.null';

  const response = UrlFetchApp.fetch(endpoint, {
    method: 'get',
    headers: { apikey: key, Authorization: 'Bearer ' + key },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) {
    throw new Error('Supabase ophalen mislukt: ' + response.getResponseCode() + ' ' + response.getContentText());
  }

  const claims = JSON.parse(response.getContentText());
  claims.forEach(function(claim) {
    if (!claim.notification_email || !claim.due_date) return;
    const due = claim.due_date;
    const followupDate = new Date(due + 'T12:00:00Z');
    followupDate.setUTCDate(followupDate.getUTCDate() + 3);
    const followupDue = Utilities.formatDate(followupDate, 'UTC', 'yyyy-MM-dd');

    if (due <= today && !claim.reminder_deadline_sent_at) {
      sendOneReminder(claim, 'deadline');
      markReminderSent(url, key, claim.id, 'reminder_deadline_sent_at');
    }

    if (followupDue <= today && !claim.reminder_followup_sent_at) {
      // Status wordt opnieuw gecontroleerd voordat de tweede mail wordt verstuurd.
      if (isStillOpen(url, key, claim.id)) {
        sendOneReminder(claim, 'followup');
        markReminderSent(url, key, claim.id, 'reminder_followup_sent_at');
      }
    }
  });
}

function sendOneReminder(claim, kind) {
  const amount = Number(claim.amount).toLocaleString('nl-NL', {style:'currency', currency:'EUR'});
  const subject = kind === 'deadline'
    ? 'Herinnering: de betaaldatum is vandaag/verstreken'
    : 'Tweede herinnering: betaling staat nog open';
  const intro = kind === 'deadline'
    ? 'De uiterste betaaldatum voor onderstaande claim is bereikt.'
    : 'Er zijn drie dagen verstreken sinds de uiterste betaaldatum. De claim staat volgens het overzicht nog open.';
  const body = intro + '\n\nNaam: ' + claim.name +
    '\nBedrag: ' + amount +
    '\nOmschrijving: ' + claim.reason +
    '\nUiterste betaaldatum: ' + claim.due_date +
    '\n\nBekijk het overzicht: https://levideweerd424-hash.github.io/ik-krijg-nog-geld-van-william/\n\nAutomatisch bericht van Ik krijg nog geld van William.';
  GmailApp.sendEmail(claim.notification_email, subject, body);
}

function isStillOpen(url, key, id) {
  const endpoint = url.replace(/\/$/, '') + '/rest/v1/claims?select=id&id=eq.' +
    encodeURIComponent(id) + '&status=eq.open';
  const r = UrlFetchApp.fetch(endpoint, {
    headers: { apikey: key, Authorization: 'Bearer ' + key },
    muteHttpExceptions: true
  });
  if (r.getResponseCode() !== 200) throw new Error('Statuscontrole mislukt voor claim ' + id);
  return JSON.parse(r.getContentText()).length > 0;
}

function markReminderSent(url, key, id, column) {
  const endpoint = url.replace(/\/$/, '') + '/rest/v1/claims?id=eq.' + encodeURIComponent(id);
  const patch = {};
  patch[column] = new Date().toISOString();
  const r = UrlFetchApp.fetch(endpoint, {
    method: 'patch',
    contentType: 'application/json',
    headers: { apikey: key, Authorization: 'Bearer ' + key, Prefer: 'return=minimal' },
    payload: JSON.stringify(patch),
    muteHttpExceptions: true
  });
  if (r.getResponseCode() < 200 || r.getResponseCode() >= 300) {
    throw new Error('Herinnering verstuurd, maar registratie mislukt: ' + r.getContentText());
  }
}

/** Eenmalig handmatig uitvoeren om een dagelijkse trigger rond 09:00 te maken. */
function installDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'sendClaimReminders') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('sendClaimReminders').timeBased().everyDays(1).atHour(9).create();
}

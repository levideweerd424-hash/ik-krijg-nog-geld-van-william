/**
 * Gratis deadline-herinneringen voor Ik krijg nog geld van William.
 * Draait dagelijks vanuit Google Apps Script en verstuurt via jouw Gmail-account.
 * Gebruik alleen de Supabase publishable/anon key; nooit een service_role key.
 */
const SUPABASE_URL = 'https://dwtnvprsgvhvmlacxgpp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_dWSc7QnWFuhHi5UUePnUnw_JvgI6VYl';
const RECIPIENT_FALLBACK = 'bulletproofgert@gmail.com';
const TIME_ZONE = 'Europe/Amsterdam';

function checkClaimReminders() {
  const today = Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy-MM-dd');
  const url = SUPABASE_URL +
    '/rest/v1/claims?select=id,name,amount,reason,status,due_date,notification_email' +
    '&status=eq.open&due_date=not.is.null&notification_email=not.is.null';

  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY
    },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    throw new Error('Supabase gaf HTTP ' + response.getResponseCode() + ': ' + response.getContentText());
  }

  const claims = JSON.parse(response.getContentText());
  const props = PropertiesService.getScriptProperties();

  claims.forEach(function(claim) {
    if (!claim.due_date || !claim.notification_email || claim.status !== 'open') return;

    const due = claim.due_date.substring(0, 10);
    const duePlus3 = addDays(due, 3);
    const recipient = claim.notification_email || RECIPIENT_FALLBACK;
    const keyBase = 'claim_' + claim.id + '_';

    // Eerste herinnering: op de deadline. Bij een gemiste dagelijkse run
    // wordt deze alsnog binnen de eerste drie dagen na de deadline verstuurd.
    if (today >= due && today < duePlus3 && !props.getProperty(keyBase + 'deadline_sent')) {
      GmailApp.sendEmail(
        recipient,
        'Deadline verstreken: claim bij William',
        'Hallo,\n\nDe deadline voor deze claim is vandaag verstreken. Volgens het overzicht staat de claim nog open.\n\nNaam: ' +
          claim.name + '\nBedrag: € ' + Number(claim.amount).toFixed(2).replace('.', ',') +
          '\nReden: ' + claim.reason + '\nUiterste betaaldatum: ' + due +
          '\n\nAls de betaling inmiddels is gedaan, kan de claim als betaald worden gemarkeerd.\n\nAutomatische herinnering van Ik krijg nog geld van William.'
      );
      props.setProperty(keyBase + 'deadline_sent', today);
    }

    // Tweede herinnering: vanaf drie dagen na de deadline, alleen als de
    // claim in Supabase nog steeds de status 'open' heeft.
    if (today >= duePlus3 && !props.getProperty(keyBase + 'three_day_sent')) {
      GmailApp.sendEmail(
        recipient,
        'Tweede herinnering: claim bij William staat nog open',
        'Hallo,\n\nDrie dagen zijn verstreken sinds de deadline. Deze claim staat volgens het overzicht nog steeds open.\n\nNaam: ' +
          claim.name + '\nBedrag: € ' + Number(claim.amount).toFixed(2).replace('.', ',') +
          '\nReden: ' + claim.reason + '\nUiterste betaaldatum: ' + due +
          '\n\nAls de betaling inmiddels is gedaan, kan de claim als betaald worden gemarkeerd.\n\nAutomatische herinnering van Ik krijg nog geld van William.'
      );
      props.setProperty(keyBase + 'three_day_sent', today);
    }
  });
}

function addDays(isoDate, days) {
  const parts = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));
  return Utilities.formatDate(date, 'UTC', 'yyyy-MM-dd');
}

/**
 * Eenmalig uitvoeren om de dagelijkse controle in te stellen.
 * Verwijdert eerst bestaande triggers voor deze functie om dubbele mails te voorkomen.
 */
function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'checkClaimReminders') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger('checkClaimReminders')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .create();
}

/** Optionele handmatige test: voer checkClaimReminders uit vanuit de editor. */

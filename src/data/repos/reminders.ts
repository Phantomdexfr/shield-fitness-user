// Reminders repo (Phase 63): the saved reminder choice, one device-only prefs row. Nothing here sends a notification.
import { prefsRepo } from '../local';
import { DEFAULT_REMINDERS, REMINDER_ID, parseReminders, type ReminderPrefs } from '../../shared/reminders';

export async function readReminders(): Promise<ReminderPrefs> {
  try {
    return parseReminders((await prefsRepo.get(REMINDER_ID))?.value);
  } catch {
    return DEFAULT_REMINDERS;
  }
}

/** Saves the choice (made valid first) and returns what was stored. */
export async function writeReminders(next: ReminderPrefs): Promise<ReminderPrefs> {
  const value = parseReminders(next);
  await prefsRepo.put({ client_id: REMINDER_ID, value } as never);
  return value;
}

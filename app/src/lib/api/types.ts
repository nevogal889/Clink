// The app's data layer contract. Screens talk to this interface only. Today it is served by the
// in-memory mock (./mock.ts); the Supabase implementation replaces it behind the same methods
// (ARCHITECTURE.md 5 and 6). The server owns time and shared truth: the client sends durations
// and tap times, never a clock time it computed.
import type { AutoSettings, DrinkDetails, FlareCategory, LogCategory, XpKind } from '@clink/shared';

export type AuthMethod = 'apple' | 'google' | 'phone';

export interface Session {
  userId: string;
  method: AuthMethod;
}

/** Onboarding steps 2 to 6 (PRD 3.2). Step 1 is sign-in itself. */
export const ONBOARDING_STEPS = ['name', 'usual', 'invite', 'notifications', 'widget'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number] | 'done';

export interface Me {
  displayName: string;
  photoUri: string | null;
  /** Name the identity provider gave us, used to pre-fill step 2. */
  providerName: string | null;
  hasPhone: boolean;
  onboarding: OnboardingStep;
}

/** One usual 3 slot: a catalog drink or a custom one, with its saved details. */
export interface UsualDrink {
  /** Catalog id (`category.slug`), or null for a custom drink. */
  drinkId: string | null;
  customName: string | null;
  category: FlareCategory;
  details: DrinkDetails;
}

export interface LogEntry {
  id: string;
  drinkId: string | null;
  customName: string | null;
  category: LogCategory;
  details: DrinkDetails;
  /** Server time of the log, ISO 8601. */
  loggedAt: string;
}

export interface LogInput {
  drinkId: string | null;
  customName: string | null;
  category: LogCategory;
  details: DrinkDetails;
}

export interface XpEntry {
  id: string;
  kind: XpKind;
  amount: number;
  /** First name of the other person, where the line names one. */
  name: string | null;
  at: string;
}

export interface XpState {
  total: number;
  history: XpEntry[];
  /** Highest level the user has already seen on the profile (drives the top-bar dot). */
  levelSeen: number;
}

export interface Group {
  id: string;
  name: string;
  emoji: string;
  memberCount: number;
}

export interface Audience {
  friendCount: number;
  groups: Group[];
  auto: AutoSettings;
}

/** What the To: chip holds. */
export type AudienceChoice =
  { kind: 'auto' } | { kind: 'everyone' } | { kind: 'group'; id: string };

export interface FlareRequest {
  category: FlareCategory;
  place: string;
  /** 0 for Now, else 5 to 60 in steps of 5. */
  timingMin: number;
  audience: AudienceChoice;
  /** When the user tapped Who joins?; Automatic resolves at this moment (PRD 3.10). */
  tappedAt: string;
}

export interface SnapRequest {
  /** Local file of the photo, already stripped of EXIF. */
  photoUri: string;
  place: string;
}

export interface LiveFlare {
  id: string;
  category: FlareCategory;
  place: string;
  createdAt: string;
  expiresAt: string;
}

export interface ContactMatch {
  id: string;
  name: string;
  state: 'none' | 'requested' | 'added';
}

export type ShareChannel = 'whatsapp' | 'messages' | 'more';
export type PermissionResult = 'granted' | 'denied';

export interface ClinkApi {
  getSession(): Promise<Session | null>;
  signIn(method: AuthMethod): Promise<Session>;
  signOut(): Promise<void>;

  getMe(): Promise<Me>;
  updateMe(patch: Partial<Pick<Me, 'displayName' | 'photoUri' | 'onboarding'>>): Promise<Me>;
  addPhone(e164: string): Promise<Me>;

  getUsual(): Promise<UsualDrink[]>;
  setUsual(drinks: UsualDrink[]): Promise<UsualDrink[]>;

  getToday(): Promise<LogEntry[]>;
  logDrink(input: LogInput): Promise<LogEntry>;
  removeLog(id: string): Promise<void>;
  /** Puts back an entry removed a moment ago (the snackbar's Undo). */
  restoreLog(entry: LogEntry): Promise<void>;

  getXp(): Promise<XpState>;
  markLevelSeen(level: number): Promise<void>;

  getAudience(): Promise<Audience>;
  getLastPlace(): Promise<string>;
  getLiveFlare(): Promise<LiveFlare | null>;
  sendFlare(req: FlareRequest): Promise<LiveFlare>;
  /** Sends the photo just taken to all friends for 24 hours (PRD 3.4). The photo upload itself
   * goes through Storage in the Supabase build; the mock keeps only a count. */
  shareSnap(req: SnapRequest): Promise<void>;

  /** The invite URL. It only ever goes inside a share message; it is never shown (guideline 6). */
  getInviteUrl(): Promise<string>;
  recordInviteShare(channel: ShareChannel): Promise<void>;
  requestContacts(): Promise<PermissionResult>;
  getContactMatches(): Promise<ContactMatch[]>;
  addContact(id: string): Promise<ContactMatch>;

  requestNotifications(): Promise<PermissionResult>;
  isWidgetInstalled(): Promise<boolean>;
}

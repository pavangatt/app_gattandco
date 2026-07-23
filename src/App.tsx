import React, { useEffect, useRef, useState } from 'react';

type Role = 'admin' | 'buddy' | 'client';

type ClientOnboardingType = 'self_service' | 'kin_requested';

type ServicePlanType = 'short_term' | 'long_term';

type ApprovalState = 'pending_approval' | 'approved' | 'rejected' | 'rescheduled';

type CareShift = 'morning_10h' | 'night_10h' | 'full_day';

type ServiceCode =
  | 'walking_companion'
  | 'conversation_emotional_support'
  | 'hospital_accompaniment'
  | 'medicine_pickup'
  | 'grocery_shopping_assistance'
  | 'technology_help'
  | 'monthly_family_updates';

type CarePlanService = {
  id?: number;
  service_code: ServiceCode;
  service_name: string;
  is_required?: boolean;
};

type RequestStatus = 'new' | 'viewed' | 'read' | 'awaiting_assignee' | 'assigned' | 'resolved' | 'closed';

type User = {
  id: number;
  user_id?: string;
  name: string;
  email: string;
  role: Role;
  client_onboarding_type?: ClientOnboardingType | null;
  phone?: string;
  address?: string;
};

type ApiUser = {
  id: number;
  user_id?: string;
  name?: string;
  full_name?: string;
  email: string;
  role: Role;
  client_onboarding_type?: ClientOnboardingType | null;
  phone?: string;
  address?: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type Visit = {
  id: number;
  assignment_id?: number | null;
  buddy_id: number;
  elderly_id: number;
  scheduled_date: string;
  visit_status?: string;
  arrival_time: string | null;
  departure_time: string | null;
  arrival_lat_lng: string | null;
  status_check: string | null;
  buddy_notes: string | null;
  client_visible_notes?: string | null;
  buddy_name: string;
  client_name: string;
  age?: number;
  address?: string;
};

type Task = {
  id: number;
  visit_id: number;
  task_name: string;
  status: string;
  measured_value: string | null;
  buddy_remarks: string | null;
  updated_at: string | null;
  buddy_name: string;
  client_name: string;
};

type RequestEntry = {
  id?: number;
  timestamp: string;
  user_id: number;
  user_name?: string;
  request_type: string;
  message: string;
  status: RequestStatus | string;
  resolved_at?: string | null;
  elderly_id?: number | null;
};

type RequestOpsEntry = RequestEntry & {
  age_hours: number;
  sla_target_hours: number | null;
  sla_breached: boolean;
};

type RequestOpsMetrics = {
  totals_by_status: Record<RequestStatus, number>;
  active_aging_buckets: {
    lt_24h: number;
    h24_to_48: number;
    gt_48h: number;
  };
  overdue_requests: RequestOpsEntry[];
  generated_at: string;
};

type DailyRecord = {
  id: number;
  assignment_id: number;
  visit_id: number | null;
  session_date: string;
  intime: string | null;
  outtime: string | null;
  entry_notes: string;
  exit_notes: string;
  backfilled: boolean;
  backfill_reason: string | null;
  created_at: string;
  updated_at: string;
};

type VisitSessionHistoryEntry = DailyRecord & {
  buddy_id?: number | null;
  elderly_id?: number | null;
  buddy_name?: string;
  client_name?: string;
};

type FamilyContact = {
  id: number;
  client_id: number;
  elderly_id: number;
  contact_name: string;
  relation_label: string;
  phone: string;
  whatsapp_opt_in: boolean;
  is_primary: boolean;
};

type FamilyContactAuditEntry = {
  id: number;
  family_contact_id: number | null;
  client_id: number;
  elderly_id: number | null;
  actor_user_id: number | null;
  actor_name: string;
  action_type: 'created' | 'updated' | 'deleted' | 'primary_changed';
  contact_name: string;
  relation_label: string;
  phone: string;
  whatsapp_opt_in: boolean;
  is_primary: boolean;
  created_at: string;
};

type NotificationActionLogEntry = {
  id: number;
  client_id: number;
  family_contact_id: number | null;
  actor_user_id: number | null;
  actor_name: string;
  recipient_role: 'client' | 'family';
  recipient_name: string;
  recipient_phone: string;
  channel: 'notify' | 'whatsapp' | 'sms' | 'call';
  template_key: NotificationTemplateKey;
  message_preview: string;
  created_at: string;
};

type ArchivePurgeLogEntry = {
  id: number;
  client_id: number;
  actor_user_id: number | null;
  actor_name: string;
  archive_month: string;
  assignments_deleted: number;
  visits_deleted: number;
  tasks_deleted: number;
  requests_deleted: number;
  contact_audits_deleted: number;
  assignment_lifecycle_audits_deleted: number;
  notifications_deleted: number;
  created_at: string;
};

type AuditOverlayFilter = 'all' | 'contact' | 'notifications';

type ArchivedCaseHistory = {
  month: string;
  elderlyMembers: ElderlyMember[];
  assignments: Assignment[];
  visits: Visit[];
  tasks: Task[];
  requests: RequestEntry[];
  contactAudits: FamilyContactAuditEntry[];
  assignmentAudits: AssignmentLifecycleAuditEntry[];
  notifications: NotificationActionLogEntry[];
  purgeLogs: ArchivePurgeLogEntry[];
};

type ArchiveAnalyticsMonth = {
  month: string;
  assignments: number;
  visits: number;
  tasks: number;
  requests: number;
  assignment_lifecycle: number;
};

type ArchiveAnalyticsData = {
  months: ArchiveAnalyticsMonth[];
  totals: Omit<ArchiveAnalyticsMonth, 'month'>;
  generated_at: string;
};

type FamilyContactDraft = {
  contact_name: string;
  relation_label: string;
  phone: string;
  whatsapp_opt_in: boolean;
  is_primary: boolean;
};

type NotificationTemplateKey = 'auto' | 'general_update' | 'visit_update' | 'task_completed' | 'follow_up' | 'visit_reminder_d1' | 'backfilled_visit_notice' | 'family_monthly_update' | 'custom';

type ReminderTemplateKey = 'visit_reminder_d1' | 'backfilled_visit_notice' | 'family_monthly_update';

type ReminderConfigEntry = {
  template_key: ReminderTemplateKey;
  enabled: boolean;
  preview_template: string;
};

type MonthlyReportMode = 'all' | 'short_term' | 'long_term';

type MonthlySummaryPayload = {
  month: string;
  start_date: string;
  end_date: string;
  filters: {
    buddy_id: number | null;
    client_id: number | null;
    status: string | null;
    mode: 'short_term' | 'long_term' | null;
  };
  totals: {
    planned: number;
    completed: number;
    rescheduled: number;
    missed: number;
    reminders_sent: number;
  };
  short_term_package_utilization: {
    totals: {
      planned_visits: number;
      completed_visits: number;
      utilization_percent: number;
    };
    assignments: Array<{
      assignment_id: number;
      buddy_name: string;
      client_name: string;
      elderly_name: string;
      monthly_package_visits: number;
      completed_visits: number;
      utilization_percent: number;
    }>;
  };
  long_term_slot_utilization: {
    totals: {
      expected_coverage_days: number;
      recorded_session_days: number;
      utilization_percent: number;
    };
    by_shift: Array<{
      shift: string;
      expected_coverage_days: number;
      recorded_session_days: number;
    }>;
    assignments: Array<{
      assignment_id: number;
      buddy_name: string;
      client_name: string;
      elderly_name: string;
      care_shift: string | null;
      expected_coverage_days: number;
      recorded_session_days: number;
      utilization_percent: number;
    }>;
  };
  by_buddy: Array<{
    id: number;
    name: string;
    planned: number;
    completed: number;
    missed: number;
    rescheduled: number;
  }>;
  by_client: Array<{
    id: number;
    name: string;
    planned: number;
    completed: number;
    missed: number;
    rescheduled: number;
  }>;
  by_status: Array<{
    status: string;
    count: number;
  }>;
  by_mode: Array<{
    mode: 'short_term' | 'long_term';
    planned: number;
    completed: number;
    missed: number;
    rescheduled: number;
  }>;
  generated_at: string;
};

type MonthlyCalendarPayload = {
  month: string;
  start_date: string;
  end_date: string;
  first_weekday_utc: number;
  days_in_month: number;
  days: Array<{
    date: string;
    visits: Array<{
      visit_id: number;
      assignment_id: number | null;
      buddy_name: string;
      client_name: string;
      elderly_name: string;
      mode: 'short_term' | 'long_term';
      visit_status: string;
    }>;
    long_term_coverage: Array<{
      assignment_id: number;
      buddy_name: string;
      client_name: string;
      elderly_name: string;
      care_shift: string | null;
      coverage_status: 'covered' | 'pending';
      backfilled: boolean;
    }>;
  }>;
  generated_at: string;
};

type Assignment = {
  id: number;
  buddy_id: number;
  elderly_id: number;
  status: string;
  term_type?: string;
  service_plan_type?: ServicePlanType | null;
  approval_state?: ApprovalState | null;
  care_shift?: CareShift | null;
  monthly_visit_plan?: number | null;
  planned_visit_duration_minutes?: number | null;
  service_for_client_id?: number | null;
  start_date?: string | null;
  extension_end_date?: string | null;
  admin_notes?: string | null;
  end_date?: string | null;
  services?: CarePlanService[];
  short_term_slots?: Array<{
    id?: number;
    visit_date: string;
    start_time: string;
    end_time: string;
    start_at: string;
    end_at: string;
  }>;
  buddy_name: string;
  elderly_name: string;
  age?: number;
  address?: string;
};

type AssignmentLifecycleAuditEntry = {
  id: number;
  assignment_id: number;
  from_status: string | null;
  to_status: string;
  actor_user_id: number | null;
  actor_name: string;
  notes: string;
  created_at: string;
  buddy_name?: string;
  elderly_name?: string;
};

type LocationSnapshot = {
  lat: string;
  lng: string;
  updated_at: string;
};

type AssignmentLocationState = {
  currentLocation: LocationSnapshot | null;
  active: boolean;
  guarded: boolean;
  guard_reason_code?: string | null;
  message?: string | null;
};

type ElderlyMember = {
  id: number;
  client_id: number;
  full_name: string;
  age: number;
  address: string;
  email: string;
};

type ShortTermSlotDraft = {
  visit_date: string;
  start_time: string;
};

type ClientCoordinateDraft = {
  lat: string;
  lng: string;
};

type AssignmentVisitAssignDraft = {
  scheduled_date: string;
  start_time: string;
};

const createShortTermSlotDrafts = (count: number): ShortTermSlotDraft[] => (
  Array.from({ length: Math.max(0, count) }, () => ({
    visit_date: '',
    start_time: '',
  }))
);

const CLIENT_COORDS_TAG_REGEX = /\[CLIENT_COORDS:([-+]?\d+(?:\.\d+)?),([-+]?\d+(?:\.\d+)?)\]/;

const parseClientCoordsFromAdminNotes = (notes: string | null | undefined): { lat: number; lng: number } | null => {
  const text = String(notes || '');
  const match = text.match(CLIENT_COORDS_TAG_REGEX);
  if (!match) {
    return null;
  }

  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng };
};

const stripClientCoordsTag = (notes: string | null | undefined): string => {
  return String(notes || '').replace(CLIENT_COORDS_TAG_REGEX, '').trim();
};

const upsertClientCoordsTag = (notes: string | null | undefined, latRaw: string, lngRaw: string): string => {
  const cleanedNotes = stripClientCoordsTag(notes);
  const lat = Number(latRaw);
  const lng = Number(lngRaw);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return cleanedNotes;
  }

  const normalizedLat = lat.toFixed(6);
  const normalizedLng = lng.toFixed(6);
  const tag = `[CLIENT_COORDS:${normalizedLat},${normalizedLng}]`;

  return cleanedNotes ? `${cleanedNotes} ${tag}` : tag;
};

const parseLatLngFromText = (value: string | null | undefined): { lat: number; lng: number } | null => {
  if (!value) {
    return null;
  }
  const [latRaw, lngRaw] = String(value).split(',').map((part) => part.trim());
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng };
};

const haversineKm = (from: { lat: number; lng: number }, to: { lat: number; lng: number }): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
};

const initialAuthState = {
  identifier: '',
  password: '',
};

const initialCreateForm = {
  user_id: '',
  name: '',
  email: '',
  phone: '',
  address: '',
  password: '',
  role: 'buddy' as 'buddy' | 'client',
  client_onboarding_type: 'kin_requested' as ClientOnboardingType,
};

const initialAssignmentForm = {
  buddy_id: '',
  elderly_id: '',
  service_plan_type: 'short_term' as ServicePlanType,
  approval_state: 'pending_approval' as ApprovalState,
  care_shift: '' as '' | CareShift,
  monthly_visit_plan: '3',
  planned_visit_duration_minutes: '60',
  service_for_client_id: '',
  start_date: '',
  end_date: '',
  extension_end_date: '',
  admin_notes: '',
  services: [] as ServiceCode[],
  short_term_slots: createShortTermSlotDrafts(3),
};

const isValidEmailAddress = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());

const isValidSupportedPhoneNumber = (phone: string) => {
  const digitsOnly = phone.replace(/\D/g, '');
  return digitsOnly.length >= 10;
};

const initialRequestForm = {
  request_type: 'task_request' as 'task_request' | 'feedback',
  feedback_assignment_id: '',
  message: '',
};

const createEmptyContactDraft = (): FamilyContactDraft => ({
  contact_name: '',
  relation_label: '',
  phone: '',
  whatsapp_opt_in: true,
  is_primary: false,
});

const notificationTemplateOptions: Array<{ value: NotificationTemplateKey; label: string }> = [
  { value: 'auto', label: 'Auto template' },
  { value: 'general_update', label: 'General update' },
  { value: 'visit_update', label: 'Visit update' },
  { value: 'task_completed', label: 'Task completed' },
  { value: 'follow_up', label: 'Follow-up needed' },
  { value: 'visit_reminder_d1', label: 'Visit reminder (D-1)' },
  { value: 'backfilled_visit_notice', label: 'Backfilled visit notice' },
  { value: 'family_monthly_update', label: 'Family monthly update' },
  { value: 'custom', label: 'Custom template' },
];

const reminderTemplateMeta: Array<{ key: ReminderTemplateKey; label: string; description: string }> = [
  {
    key: 'visit_reminder_d1',
    label: 'Visit reminder D-1',
    description: 'Generates one-day-before reminders for short-term visits.',
  },
  {
    key: 'backfilled_visit_notice',
    label: 'Backfilled visit notice',
    description: 'Logs delayed-entry notices when a visit session is backfilled.',
  },
  {
    key: 'family_monthly_update',
    label: 'Family monthly update',
    description: 'Reserved monthly update template for family-facing summaries.',
  },
];

type AssignmentEditDraft = {
  status: string;
  service_plan_type: ServicePlanType;
  approval_state: ApprovalState;
  admin_notes: string;
};

type RequestAssignmentDraft = {
  buddy_id: string;
  elderly_id: string;
  service_plan_type: ServicePlanType;
  care_shift: '' | CareShift;
  monthly_visit_plan: '3' | '6' | '9';
  planned_visit_duration_minutes: '60' | '90';
  start_date: string;
  end_date: string;
};

function App() {
  type AdminTab = 'overview' | 'buddy-directory' | 'client-directory' | 'assignments' | 'visits' | 'requests' | 'calendar-reporting' | 'archived-history';
  type ClientTab = 'visits' | 'requests';
  type BuddyTab = 'location' | 'visits';

  const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? value : []);

  const [user, setUser] = useState<User | null>(null);
  const [authHydrated, setAuthHydrated] = useState(false);
  const [authForm, setAuthForm] = useState(initialAuthState);
  const [message, setMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [buddies, setBuddies] = useState<User[]>([]);
  const [clients, setClients] = useState<User[]>([]);
  const [elderlyMembers, setElderlyMembers] = useState<ElderlyMember[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [requests, setRequests] = useState<RequestEntry[]>([]);
  const [requestOpsMetrics, setRequestOpsMetrics] = useState<RequestOpsMetrics | null>(null);
  const [requestOpsLoading, setRequestOpsLoading] = useState(false);
  const [dailyRecordsByAssignment, setDailyRecordsByAssignment] = useState<Record<number, DailyRecord[]>>({});
  const [visitSessionHistory, setVisitSessionHistory] = useState<VisitSessionHistoryEntry[]>([]);
  const [visitSessionHistoryLoading, setVisitSessionHistoryLoading] = useState(false);
  const [assignmentExtensionDates, setAssignmentExtensionDates] = useState<Record<number, string>>({});
  const [assignmentReplacementBuddyByAssignment, setAssignmentReplacementBuddyByAssignment] = useState<Record<number, string>>({});
  const [assignmentReplacementReasonByAssignment, setAssignmentReplacementReasonByAssignment] = useState<Record<number, string>>({});
  const [dailyRecordDrafts, setDailyRecordDrafts] = useState<Record<number, { intime: string; outtime: string; entry_notes: string; exit_notes: string }>>({});
  const [assignmentAuditsByAssignment, setAssignmentAuditsByAssignment] = useState<Record<number, AssignmentLifecycleAuditEntry[]>>({});
  const [clientContactsByClient, setClientContactsByClient] = useState<Record<number, FamilyContact[]>>({});
  const [clientContactAuditByClient, setClientContactAuditByClient] = useState<Record<number, FamilyContactAuditEntry[]>>({});
  const [notificationLogsByClient, setNotificationLogsByClient] = useState<Record<number, NotificationActionLogEntry[]>>({});
  const [reminderConfigByKey, setReminderConfigByKey] = useState<Record<ReminderTemplateKey, boolean>>({
    visit_reminder_d1: true,
    backfilled_visit_notice: true,
    family_monthly_update: false,
  });
  const [reminderTemplatePreviewByKey, setReminderTemplatePreviewByKey] = useState<Record<ReminderTemplateKey, string>>({
    visit_reminder_d1: 'Reminder: {buddy_name} is scheduled to visit {elderly_name} on {visit_date}.',
    backfilled_visit_notice: 'Update: {buddy_name} visited on {visit_date} at {visit_time}. (Backfilled entry)',
    family_monthly_update: 'Monthly family update: care summary for {elderly_name} for {month_label} is available.',
  });
  const [reminderConfigLoading, setReminderConfigLoading] = useState(false);
  const [reminderRunnerLoading, setReminderRunnerLoading] = useState(false);
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [reportBuddyId, setReportBuddyId] = useState('');
  const [reportClientId, setReportClientId] = useState('');
  const [reportStatus, setReportStatus] = useState('');
  const [reportMode, setReportMode] = useState<MonthlyReportMode>('all');
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummaryPayload | null>(null);
  const [monthlyCalendar, setMonthlyCalendar] = useState<MonthlyCalendarPayload | null>(null);
  const [calendarDayDetailsDate, setCalendarDayDetailsDate] = useState<string | null>(null);
  const [monthlyReportsLoading, setMonthlyReportsLoading] = useState(false);
  const [location, setLocation] = useState<LocationSnapshot | null>(null);
  const [assignmentLocations, setAssignmentLocations] = useState<Record<number, AssignmentLocationState>>({});
  const [createForm, setCreateForm] = useState(initialCreateForm);
  const [assignmentForm, setAssignmentForm] = useState(initialAssignmentForm);
  const [requestForm, setRequestForm] = useState(initialRequestForm);
  const [requestStatusEdits, setRequestStatusEdits] = useState<Record<number, RequestStatus>>({});
  const [requestAssignmentDrafts, setRequestAssignmentDrafts] = useState<Record<number, RequestAssignmentDraft>>({});
  const [requestAssignmentResultByRequest, setRequestAssignmentResultByRequest] = useState<Record<number, string>>({});
  const [assignmentEdits, setAssignmentEdits] = useState<Record<number, AssignmentEditDraft>>({});
  const [assignmentDetailsId, setAssignmentDetailsId] = useState<number | null>(null);
  const [assignmentSlotDraftsByAssignment, setAssignmentSlotDraftsByAssignment] = useState<Record<number, ShortTermSlotDraft[]>>({});
  const [visitEdits, setVisitEdits] = useState<Record<number, { visit_status: string; status_check: string; buddy_notes: string; client_visible_notes: string }>>({});
  const [directorySearch, setDirectorySearch] = useState({ buddy: '', client: '' });
  const [directorySort, setDirectorySort] = useState<{ buddy: 'name' | 'email'; client: 'name' | 'email' }>({ buddy: 'name', client: 'name' });
  const [selectedAssignmentBuddyId, setSelectedAssignmentBuddyId] = useState('');
  const [selectedVisitClientId, setSelectedVisitClientId] = useState('');
  const [contactDrafts, setContactDrafts] = useState<Record<number, FamilyContactDraft>>({});
  const [editingContacts, setEditingContacts] = useState<Record<number, FamilyContactDraft>>({});
  const [expandedClientId, setExpandedClientId] = useState<number | null>(null);
  const [auditClientId, setAuditClientId] = useState<number | null>(null);
  const [auditOverlayFilter, setAuditOverlayFilter] = useState<AuditOverlayFilter>('all');
  const [archiveMonth, setArchiveMonth] = useState('');
  const [archivedHistoryClientId, setArchivedHistoryClientId] = useState('');
  const [archivedHistoryMonth, setArchivedHistoryMonth] = useState('');
  const [archivedHistoryData, setArchivedHistoryData] = useState<ArchivedCaseHistory | null>(null);
  const [archivedHistoryLoading, setArchivedHistoryLoading] = useState(false);
  const [archiveAnalyticsData, setArchiveAnalyticsData] = useState<ArchiveAnalyticsData | null>(null);
  const [archiveAnalyticsLoading, setArchiveAnalyticsLoading] = useState(false);
  const [purgeConfirmText, setPurgeConfirmText] = useState('');
  const [purgeArchivedLoading, setPurgeArchivedLoading] = useState(false);
  const [purgeReady, setPurgeReady] = useState(false);
  const [notificationTemplateByClient, setNotificationTemplateByClient] = useState<Record<number, NotificationTemplateKey>>({});
  const [customNotificationMessageByClient, setCustomNotificationMessageByClient] = useState<Record<number, string>>({});
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installPromptAvailable, setInstallPromptAvailable] = useState(false);
  const [isStandaloneInstalled, setIsStandaloneInstalled] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(window.navigator.onLine);
  const auditOverlayRef = useRef<HTMLDivElement | null>(null);
  const auditCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusedElementRef = useRef<HTMLElement | null>(null);
  const previousBodyOverflowRef = useRef('');
  const [adminTab, setAdminTab] = useState<AdminTab>('overview');
  const [clientTab, setClientTab] = useState<ClientTab>('visits');
  const [buddyTab, setBuddyTab] = useState<BuddyTab>('location');
  const [visitReassignmentModal, setVisitReassignmentModal] = useState<{ visit: Visit; selectedBuddyId: string } | null>(null);
  const [backfillConflictModal, setBackfillConflictModal] = useState<{ conflict_date: string; elderly_id: number; current_buddy_id: number; backfill_reason: string; selectedReassignBuddyId: string } | null>(null);
  const [assignmentVisitAssignDraftsByVisit, setAssignmentVisitAssignDraftsByVisit] = useState<Record<number, AssignmentVisitAssignDraft>>({});
  const [assignmentClientCoordinateByAssignment, setAssignmentClientCoordinateByAssignment] = useState<Record<number, ClientCoordinateDraft>>({});

  const normalizeUser = (apiUser: ApiUser): User => ({
    id: apiUser.id,
    user_id: apiUser.user_id,
    name: apiUser.name || apiUser.full_name || 'Unknown',
    email: apiUser.email,
    role: apiUser.role,
    client_onboarding_type: apiUser.client_onboarding_type,
    phone: apiUser.phone,
    address: apiUser.address,
  });

  const getAssignmentPlanSummary = (assignment: Assignment) => {
    const servicePlanType = assignment.service_plan_type || (assignment.term_type === 'long' ? 'long_term' : 'short_term');
    if (servicePlanType === 'long_term') {
      const careShiftLabel = assignment.care_shift === 'morning_10h'
        ? 'Morning 10h'
        : assignment.care_shift === 'night_10h'
          ? 'Night 10h'
          : assignment.care_shift === 'full_day'
            ? 'Full day'
            : 'Shift pending';
      return `Long term • ${careShiftLabel}`;
    }

    const visitPlan = assignment.monthly_visit_plan || '-';
    const duration = assignment.planned_visit_duration_minutes || '-';
    return `Short term • ${visitPlan} visits/month • ${duration} min`;
  };

  const getAssignmentServicesSummary = (assignment: Assignment) => {
    const services = assignment.services || [];
    if (services.length === 0) {
      return 'No services selected';
    }
    return services.map((entry) => entry.service_name).join(', ');
  };

  const CACHE_TTL_MS = 5 * 60 * 1000;
  const NOTIFICATION_TEMPLATE_STORAGE_KEY = 'gatt_notification_templates_by_client';
  const CUSTOM_NOTIFICATION_STORAGE_KEY = 'gatt_custom_notification_messages_by_client';

  const getDashboardCacheKey = (activeUser: User) => `gatt_dashboard_${activeUser.role}_${activeUser.id}`;

  useEffect(() => {
    const inStandaloneMode = window.matchMedia('(display-mode: standalone)').matches
      || ((window.navigator as Navigator & { standalone?: boolean }).standalone === true);
    setIsStandaloneInstalled(inStandaloneMode);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event as BeforeInstallPromptEvent);
      setInstallPromptAvailable(true);
    };

    const handleAppInstalled = () => {
      setDeferredInstallPrompt(null);
      setInstallPromptAvailable(false);
      setIsStandaloneInstalled(true);
      setStatusMessage('App installed successfully.');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    try {
      const storedTemplates = localStorage.getItem(NOTIFICATION_TEMPLATE_STORAGE_KEY);
      if (storedTemplates) {
        setNotificationTemplateByClient(JSON.parse(storedTemplates) as Record<number, NotificationTemplateKey>);
      }
    } catch {
      localStorage.removeItem(NOTIFICATION_TEMPLATE_STORAGE_KEY);
    }

    try {
      const storedCustomMessages = localStorage.getItem(CUSTOM_NOTIFICATION_STORAGE_KEY);
      if (storedCustomMessages) {
        setCustomNotificationMessageByClient(JSON.parse(storedCustomMessages) as Record<number, string>);
      }
    } catch {
      localStorage.removeItem(CUSTOM_NOTIFICATION_STORAGE_KEY);
    }

    void (async () => {
      try {
        const response = await fetch('/api/session');
        if (!response.ok) {
          throw new Error('Unable to verify session');
        }
        const result = await response.json();
        if (result?.user) {
          setUser(result.user as User);
          sessionStorage.setItem('gatt_user', JSON.stringify(result.user));
        } else {
          setUser(null);
          sessionStorage.removeItem('gatt_user');
        }
      } catch {
        setUser(null);
        sessionStorage.removeItem('gatt_user');
      } finally {
        setAuthHydrated(true);
      }
    })();
  }, []);

  useEffect(() => {
    localStorage.setItem(NOTIFICATION_TEMPLATE_STORAGE_KEY, JSON.stringify(notificationTemplateByClient));
  }, [notificationTemplateByClient]);

  useEffect(() => {
    localStorage.setItem(CUSTOM_NOTIFICATION_STORAGE_KEY, JSON.stringify(customNotificationMessageByClient));
  }, [customNotificationMessageByClient]);

  useEffect(() => {
    if (!authHydrated || !user) {
      return;
    }
    void (async () => {
      const visitData = await loadDashboard();
      if (user.role === 'buddy') {
        await refreshLocation(visitData);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authHydrated, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    if (user.role === 'admin') {
      const saved = localStorage.getItem('gatt_tab_admin');
      if (saved && ['overview', 'buddy-directory', 'client-directory', 'assignments', 'visits', 'tasks', 'requests', 'calendar-reporting', 'reminders', 'archived-history'].includes(saved)) {
        setAdminTab(saved as AdminTab);
      }
    } else if (user.role === 'client') {
      const saved = localStorage.getItem('gatt_tab_client');
      if (saved && ['visits', 'tasks', 'requests'].includes(saved)) {
        setClientTab(saved as ClientTab);
      }
    } else if (user.role === 'buddy') {
      const saved = localStorage.getItem('gatt_tab_buddy');
      if (saved && ['location', 'visits', 'tasks'].includes(saved)) {
        setBuddyTab(saved as BuddyTab);
      }
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem('gatt_tab_admin', adminTab);
  }, [adminTab]);

  useEffect(() => {
    localStorage.setItem('gatt_tab_client', clientTab);
  }, [clientTab]);

  useEffect(() => {
    localStorage.setItem('gatt_tab_buddy', buddyTab);
  }, [buddyTab]);

  useEffect(() => {
    if (!user || user.role !== 'admin' || adminTab !== 'requests') {
      return;
    }

    void autoAdvanceRequestsToViewed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, adminTab]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const shouldLoadForAdmin = user.role === 'admin' && adminTab === 'visits';
    const shouldLoadForBuddy = user.role === 'buddy' && buddyTab === 'visits';

    if (!shouldLoadForAdmin && !shouldLoadForBuddy) {
      return;
    }

    void loadVisitSessionHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, adminTab, buddyTab]);

  useEffect(() => {
    if (!user || user.role !== 'admin' || adminTab !== 'calendar-reporting') {
      return;
    }

    void loadMonthlyReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, adminTab]);

  useEffect(() => {
    if (!user || user.role !== 'buddy') {
      return;
    }

    if (getActiveCaseVisits(visits).length === 0) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshLocation();
    }, 5 * 60 * 1000);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, visits]);

  useEffect(() => {
    if (auditClientId === null) {
      return;
    }

    previousFocusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousBodyOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => {
      auditCloseButtonRef.current?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAuditClientId(null);
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const overlay = auditOverlayRef.current;
      if (!overlay) {
        return;
      }

      const focusableNodes = overlay.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const focusable = Array.from(focusableNodes).filter((node) => !node.hasAttribute('disabled'));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflowRef.current;
      previousFocusedElementRef.current?.focus();
    };
  }, [auditClientId]);

  useEffect(() => {
    const nextAssignmentEdits: Record<number, AssignmentEditDraft> = {};
    const nextReplacementBuddyDrafts: Record<number, string> = {};
    const nextReplacementReasonDrafts: Record<number, string> = {};
    const nextSlotDraftsByAssignment: Record<number, ShortTermSlotDraft[]> = {};
    const nextClientCoordsByAssignment: Record<number, ClientCoordinateDraft> = {};
    assignments.forEach((assignment) => {
      const parsedCoords = parseClientCoordsFromAdminNotes(assignment.admin_notes);
      nextAssignmentEdits[assignment.id] = {
        status: assignment.status || 'active',
        service_plan_type: assignment.service_plan_type || (assignment.term_type === 'long' ? 'long_term' : 'short_term'),
        approval_state: assignment.approval_state || 'pending_approval',
        admin_notes: stripClientCoordsTag(assignment.admin_notes),
      };
      nextClientCoordsByAssignment[assignment.id] = {
        lat: parsedCoords ? String(parsedCoords.lat) : '',
        lng: parsedCoords ? String(parsedCoords.lng) : '',
      };
      nextReplacementBuddyDrafts[assignment.id] = String(assignment.buddy_id || '');
      nextReplacementReasonDrafts[assignment.id] = '';

      const slotRows = (assignment.short_term_slots || []).map((slot) => ({
        visit_date: String(slot.visit_date || '').slice(0, 10),
        start_time: String(slot.start_time || '').slice(0, 5),
      }));
      const fallbackCount = Math.max(1, Number(assignment.monthly_visit_plan || 1));
      nextSlotDraftsByAssignment[assignment.id] = slotRows.length > 0 ? slotRows : createShortTermSlotDrafts(fallbackCount);
    });
    setAssignmentEdits(nextAssignmentEdits);
    setAssignmentReplacementBuddyByAssignment(nextReplacementBuddyDrafts);
    setAssignmentReplacementReasonByAssignment(nextReplacementReasonDrafts);
    setAssignmentSlotDraftsByAssignment(nextSlotDraftsByAssignment);
    setAssignmentClientCoordinateByAssignment(nextClientCoordsByAssignment);

    if (assignmentDetailsId !== null && !assignments.some((entry) => entry.id === assignmentDetailsId)) {
      setAssignmentDetailsId(null);
    }
  }, [assignments, assignmentDetailsId]);

  useEffect(() => {
    const nextVisitEdits: Record<number, { visit_status: string; status_check: string; buddy_notes: string; client_visible_notes: string }> = {};
    visits.forEach((visit) => {
      nextVisitEdits[visit.id] = {
        visit_status: visit.visit_status || 'scheduled',
        status_check: visit.status_check || '',
        buddy_notes: visit.buddy_notes || '',
        client_visible_notes: visit.client_visible_notes || '',
      };
    });
    setVisitEdits(nextVisitEdits);
  }, [visits]);

  useEffect(() => {
    const nextRequestStatusEdits: Record<number, RequestStatus> = {};
    const nextRequestAssignmentDrafts: Record<number, RequestAssignmentDraft> = {};
    const today = new Date();
    const todayText = today.toISOString().slice(0, 10);
    const monthLater = new Date(today);
    monthLater.setDate(monthLater.getDate() + 30);
    const monthLaterText = monthLater.toISOString().slice(0, 10);

    requests.forEach((request) => {
      if (request.id) {
        const inferredCase = request.elderly_id
          ? elderlyMembers.find((entry) => Number(entry.id) === Number(request.elderly_id))
          : elderlyMembers.find((entry) => Number(entry.client_id) === Number(request.user_id));

        nextRequestStatusEdits[request.id] = normalizeRequestStatusForUi(request.status);
        nextRequestAssignmentDrafts[request.id] = {
          buddy_id: '',
          elderly_id: inferredCase ? String(inferredCase.id) : '',
          service_plan_type: 'long_term',
          care_shift: 'morning_10h',
          monthly_visit_plan: '3',
          planned_visit_duration_minutes: '60',
          start_date: todayText,
          end_date: monthLaterText,
        };
      }
    });

    setRequestStatusEdits(nextRequestStatusEdits);
    setRequestAssignmentDrafts(nextRequestAssignmentDrafts);
  }, [requests, elderlyMembers]);

  const handleChange = (field: keyof typeof authForm) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setAuthForm({ ...authForm, [field]: event.target.value });
  };

  const handleCreateChange = (field: keyof typeof createForm) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const nextValue = event.target.value;
    setCreateForm((current) => ({
      ...current,
      [field]: nextValue,
      ...(field === 'role' && nextValue !== 'client' ? { client_onboarding_type: 'kin_requested' } : {}),
    }));
  };

  const handleAssignmentChange = (field: keyof typeof assignmentForm) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    setAssignmentForm((current) => {
      const next = { ...current, [field]: nextValue };
      if (field === 'service_plan_type') {
        const today = new Date();
        const todayText = today.toISOString().slice(0, 10);
        const monthLater = new Date(today);
        monthLater.setDate(monthLater.getDate() + 30);
        const monthLaterText = monthLater.toISOString().slice(0, 10);

        if (nextValue === 'short_term') {
          next.monthly_visit_plan = current.monthly_visit_plan || '3';
          next.planned_visit_duration_minutes = current.planned_visit_duration_minutes || '60';
          next.care_shift = '';
          next.start_date = '';
          next.end_date = '';
          next.extension_end_date = '';
          const shortTermCount = Number(current.monthly_visit_plan || '3');
          next.short_term_slots = createShortTermSlotDrafts(shortTermCount);
        }
        if (nextValue === 'long_term') {
          next.monthly_visit_plan = '';
          next.planned_visit_duration_minutes = '';
          next.start_date = current.start_date || todayText;
          next.end_date = current.end_date || monthLaterText;
          next.short_term_slots = [];
        }
      }
      if (field === 'monthly_visit_plan' && next.service_plan_type === 'short_term') {
        const shortTermCount = Number(nextValue || '0');
        const existingSlots = Array.isArray(current.short_term_slots) ? current.short_term_slots : [];
        const resizedSlots = createShortTermSlotDrafts(shortTermCount).map((entry, index) => ({
          ...entry,
          ...(existingSlots[index] || {}),
        }));
        next.short_term_slots = resizedSlots;
      }
      return next;
    });
  };

  const handleShortTermSlotChange = (slotIndex: number, field: keyof ShortTermSlotDraft) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;
    setAssignmentForm((current) => {
      const nextSlots = (current.short_term_slots || []).map((slot, index) => (
        index === slotIndex
          ? { ...slot, [field]: nextValue }
          : slot
      ));
      return {
        ...current,
        short_term_slots: nextSlots,
      };
    });
  };

  const handleRequestChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRequestForm({ ...requestForm, message: event.target.value });
  };

  const handleRequestTypeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextType = event.target.value as typeof initialRequestForm.request_type;
    setRequestForm((current) => ({
      ...current,
      request_type: nextType,
      feedback_assignment_id: nextType === 'feedback'
        ? (clientFeedbackTargets.some((entry) => String(entry.assignment_id) === String(current.feedback_assignment_id || ''))
          ? current.feedback_assignment_id
          : (clientFeedbackTargets.length === 1 ? String(clientFeedbackTargets[0].assignment_id) : ''))
        : '',
    }));
  };

  const handleRequestCaseChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setRequestForm((current) => ({ ...current, feedback_assignment_id: event.target.value }));
  };

  const normalizeRequestStatusForUi = (status: string): RequestStatus => {
    const normalized = String(status || '').trim().toLowerCase();
    if (normalized === 'open') {
      return 'new';
    }
    if (normalized === 'in_progress') {
      return 'viewed';
    }
    if (normalized === 'new' || normalized === 'viewed' || normalized === 'read' || normalized === 'awaiting_assignee' || normalized === 'assigned' || normalized === 'resolved' || normalized === 'closed') {
      return normalized;
    }
    return 'new';
  };

  const getRequestStatusLabel = (status: RequestStatus) => {
    if (status === 'awaiting_assignee') {
      return 'Waiting for assignee';
    }
    return status.replace(/_/g, ' ');
  };

  const handleRequestStatusDraftChange = (requestId: number | undefined, status: RequestStatus) => {
    if (!requestId) {
      return;
    }
    setRequestStatusEdits((current) => ({
      ...current,
      [requestId]: status,
    }));
  };

  const handleRequestStatusUpdate = async (requestId: number | undefined) => {
    if (!requestId) {
      setStatusMessage('Unable to update request status for this row.');
      return;
    }
    const nextStatus = requestStatusEdits[requestId];
    if (!nextStatus) {
      return;
    }

    try {
      const response = await fetch(`/api/requests/${requestId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to update request status.');
        return;
      }

      setStatusMessage(result.message || 'Request status updated.');
      await loadRequests(user?.id || null, true);
      await loadRequestOpsMetrics();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unable to connect to the server.';
      setStatusMessage(errorMessage);
    }
  };

  const getActiveCaseVisits = (visitList: Visit[]) => {
    const today = new Date().toISOString().slice(0, 10);
    return visitList.filter((visit) => {
      if (visit.scheduled_date !== today) {
        return false;
      }
      const status = visit.visit_status || 'scheduled';
      const assignment = assignments.find((entry) => entry.id === visit.assignment_id);
      const assignmentActive = !assignment || (
        (assignment.approval_state || 'pending_approval') === 'approved'
        && assignment.status === 'active'
      );
      return assignmentActive && status === 'in_progress';
    });
  };

  const getGuardReasonLabel = (guardCode?: string | null, guardMessage?: string | null) => {
    if (guardMessage) {
      return guardMessage;
    }
    if (guardCode === 'unapproved_assignment') {
      return 'Map hidden until assignment approval.';
    }
    if (guardCode === 'inactive_assignment') {
      return 'Map hidden for inactive assignment.';
    }
    if (guardCode === 'archived_assignment') {
      return 'Map hidden for archived assignment.';
    }
    return 'Map hidden (inactive case)';
  };

  const getSemanticStatusTone = (value?: string | null) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized || normalized === 'pending' || normalized === 'pending_approval' || normalized === 'scheduled' || normalized === 'in_progress' || normalized === 'active' || normalized === 'new' || normalized === 'viewed' || normalized === 'read' || normalized === 'awaiting_assignee' || normalized === 'assigned' || normalized === 'paused') {
      return 'pending';
    }
    if (normalized === 'completed' || normalized === 'approved' || normalized === 'resolved' || normalized === 'closed') {
      return 'completed';
    }
    if (normalized === 'rescheduled' || normalized === 'rejected' || normalized === 'cancelled' || normalized === 'missed' || normalized === 'carried_forward') {
      return 'rescheduled';
    }
    return 'pending';
  };

  const getSemanticStatusLabel = (value?: string | null) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) {
      return 'Pending';
    }
    return normalized.replace(/_/g, ' ');
  };

  const getSemanticStatusClassName = (value?: string | null) => {
    const tone = getSemanticStatusTone(value);
    if (tone === 'completed') {
      return 'pill status-completed';
    }
    if (tone === 'rescheduled') {
      return 'pill status-rescheduled';
    }
    return 'pill status-pending';
  };

  const renderStatusLegend = () => (
    <div className="status-legend" aria-label="Status color legend">
      <span className="pill status-completed">Completed</span>
      <span className="pill status-rescheduled">Rescheduled</span>
      <span className="pill status-pending">Pending / Unset</span>
    </div>
  );

  const getVisitActivityBadge = (visit: Visit) => {
    const today = new Date().toISOString().slice(0, 10);
    const status = visit.visit_status || 'scheduled';

    if (visit.scheduled_date === today && (status === 'scheduled' || status === 'in_progress')) {
      return { label: 'Active', className: 'pill badge-active' };
    }

    if (visit.scheduled_date === today) {
      return { label: 'Today', className: 'pill badge-today' };
    }

    if (visit.scheduled_date > today) {
      return { label: 'Up next', className: 'pill badge-upcoming' };
    }

    return { label: 'Past', className: 'pill badge-inactive' };
  };

  const getDistanceSummaryForVisit = (visit: Visit, liveLocation: LocationSnapshot | null) => {
    const assignment = safeAssignments.find((entry) => Number(entry.id) === Number(visit.assignment_id));
    const clientCoords = parseClientCoordsFromAdminNotes(assignment?.admin_notes || null);
    const caregiverCoords = liveLocation
      ? { lat: Number(liveLocation.lat), lng: Number(liveLocation.lng) }
      : parseLatLngFromText(visit.arrival_lat_lng || null);

    if (!clientCoords) {
      return { label: 'Set client coordinates in assignment details to enable distance check.', near: null as boolean | null };
    }

    if (!caregiverCoords || !Number.isFinite(caregiverCoords.lat) || !Number.isFinite(caregiverCoords.lng)) {
      return { label: 'Waiting for caregiver live location.', near: null as boolean | null };
    }

    const distanceKm = haversineKm(caregiverCoords, clientCoords);
    const near = distanceKm <= 0.5;
    return {
      label: `Distance to client: ${distanceKm.toFixed(2)} km (${near ? 'Near' : 'Far'})`,
      near,
    };
  };

  const handleAssignmentEditChange = (assignmentId: number, field: keyof AssignmentEditDraft, value: string) => {
    setAssignmentEdits((current) => ({
      ...current,
      [assignmentId]: {
        status: current[assignmentId]?.status || 'active',
        service_plan_type: current[assignmentId]?.service_plan_type || 'short_term',
        approval_state: current[assignmentId]?.approval_state || 'pending_approval',
        admin_notes: current[assignmentId]?.admin_notes || '',
        [field]: value,
      },
    }));
  };

  const handleVisitEditChange = (visitId: number, field: 'visit_status' | 'status_check' | 'buddy_notes' | 'client_visible_notes', value: string) => {
    setVisitEdits((current) => {
      const existingDraft = current[visitId];
      const visitData = visits.find((v) => v.id === visitId);
      
      return {
        ...current,
        [visitId]: {
          visit_status: existingDraft?.visit_status ?? visitData?.visit_status ?? 'scheduled',
          status_check: existingDraft?.status_check ?? visitData?.status_check ?? '',
          buddy_notes: existingDraft?.buddy_notes ?? visitData?.buddy_notes ?? '',
          client_visible_notes: existingDraft?.client_visible_notes ?? visitData?.client_visible_notes ?? '',
          [field]: value,
        },
      };
    });
  };

  const loadBuddyLocations = async (visitList: Visit[]) => {
    const assignmentIds = Array.from(new Set([
      ...visitList
        .map((visit) => Number(visit.assignment_id))
        .filter((assignmentId) => Number.isFinite(assignmentId) && assignmentId > 0),
      ...assignments
        .filter((assignment) => (
          (assignment.approval_state || 'pending_approval') === 'approved'
          && assignment.status === 'active'
        ))
        .map((assignment) => Number(assignment.id))
        .filter((assignmentId) => Number.isFinite(assignmentId) && assignmentId > 0),
    ]));
    const locationMap: Record<number, AssignmentLocationState> = {};

    await Promise.all(
      assignmentIds.map(async (assignmentId) => {
        try {
          const response = await fetch(`/api/location/current?assignment_id=${assignmentId}`);
          if (!response.ok) {
            locationMap[assignmentId] = {
              currentLocation: null,
              active: false,
              guarded: true,
              guard_reason_code: 'request_failed',
              message: 'Map unavailable for this assignment right now.',
            };
            return;
          }
          const result = await response.json() as AssignmentLocationState;
          locationMap[assignmentId] = {
            currentLocation: result.currentLocation || null,
            active: Boolean(result.active),
            guarded: Boolean(result.guarded),
            guard_reason_code: result.guard_reason_code || null,
            message: result.message || null,
          };
        } catch {
          locationMap[assignmentId] = {
            currentLocation: null,
            active: false,
            guarded: true,
            guard_reason_code: 'request_failed',
            message: 'Map unavailable for this assignment right now.',
          };
        }
      }),
    );

    setAssignmentLocations(locationMap);
  };

  const loadDashboard = async (forceRefresh = false) => {
    if (!user) {
      return [] as Visit[];
    }

    const cacheKey = getDashboardCacheKey(user);
    const cachedRaw = forceRefresh ? null : sessionStorage.getItem(cacheKey);
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw) as {
          ts: number;
          buddies?: User[];
          clients?: User[];
          elderlyMembers?: ElderlyMember[];
          assignments?: Assignment[];
          visits?: Visit[];
          tasks?: Task[];
          requests?: RequestEntry[];
          assignmentAuditsByAssignment?: Record<number, AssignmentLifecycleAuditEntry[]>;
          clientContactsByClient?: Record<number, FamilyContact[]>;
          clientContactAuditByClient?: Record<number, FamilyContactAuditEntry[]>;
          notificationLogsByClient?: Record<number, NotificationActionLogEntry[]>;
        };

        if (Date.now() - cached.ts < CACHE_TTL_MS) {
          if (user.role === 'admin') {
            setBuddies(cached.buddies || []);
            setClients(cached.clients || []);
            setElderlyMembers(cached.elderlyMembers || []);
            setAssignments(asArray<Assignment>(cached.assignments));
            setVisits(asArray<Visit>(cached.visits));
            setTasks(asArray<Task>(cached.tasks));
            setRequests(asArray<RequestEntry>(cached.requests));
            setAssignmentAuditsByAssignment(cached.assignmentAuditsByAssignment || {});
            setClientContactsByClient(cached.clientContactsByClient || {});
            setClientContactAuditByClient(cached.clientContactAuditByClient || {});
            setNotificationLogsByClient(cached.notificationLogsByClient || {});
          } else if (user.role === 'client') {
            setElderlyMembers(cached.elderlyMembers || []);
            setAssignments(asArray<Assignment>(cached.assignments));
            setVisits(asArray<Visit>(cached.visits));
            setTasks(asArray<Task>(cached.tasks));
            setRequests(asArray<RequestEntry>(cached.requests));
          } else if (user.role === 'buddy') {
            setAssignments(asArray<Assignment>(cached.assignments));
            setVisits(asArray<Visit>(cached.visits));
            setTasks(asArray<Task>(cached.tasks));
          }
        }
      } catch {
        sessionStorage.removeItem(cacheKey);
      }
    }

    try {
      if (user.role === 'admin') {
        const [buddyRes, clientRes, elderlyRes, assignmentRes, visitRes, taskRes, requestRes] = await Promise.all([
          fetch('/api/users?role=buddy'),
          fetch('/api/users?role=client'),
          fetch('/api/elderly-members'),
          fetch('/api/assignments'),
          fetch('/api/visits'),
          fetch('/api/tasks'),
          fetch('/api/requests?all=true'),
        ]);

        const [contactsRes, contactAuditRes, notificationLogsRes, assignmentAuditRes] = await Promise.all([
          fetch('/api/client-contacts?all=true'),
          fetch('/api/client-contacts/audit?all=true'),
          fetch('/api/notification-logs?all=true'),
          fetch('/api/assignment-lifecycle-audits'),
        ]);

        const buddyData = (await buddyRes.json()) as ApiUser[];
        const clientData = (await clientRes.json()) as ApiUser[];
        const elderlyData = (await elderlyRes.json()) as ElderlyMember[];
        const assignmentData = asArray<Assignment>(await assignmentRes.json());
        const visitData = asArray<Visit>(await visitRes.json());
        const taskData = asArray<Task>(await taskRes.json());
        const requestData = asArray<RequestEntry>(await requestRes.json());
        const contactData = (await contactsRes.json()) as FamilyContact[];
        const contactAuditData = (await contactAuditRes.json()) as FamilyContactAuditEntry[];
        const notificationLogData = (await notificationLogsRes.json()) as NotificationActionLogEntry[];
        const assignmentAuditData = (await assignmentAuditRes.json()) as AssignmentLifecycleAuditEntry[];
        const contactsByClient: Record<number, FamilyContact[]> = {};
        const contactAuditByClient: Record<number, FamilyContactAuditEntry[]> = {};
        const notificationLogsByClientMap: Record<number, NotificationActionLogEntry[]> = {};
        const assignmentAuditsByAssignmentMap: Record<number, AssignmentLifecycleAuditEntry[]> = {};
        contactData.forEach((entry) => {
          if (!contactsByClient[entry.client_id]) {
            contactsByClient[entry.client_id] = [];
          }
          contactsByClient[entry.client_id].push(entry);
        });
        contactAuditData.forEach((entry) => {
          if (!contactAuditByClient[entry.client_id]) {
            contactAuditByClient[entry.client_id] = [];
          }
          contactAuditByClient[entry.client_id].push(entry);
        });
        notificationLogData.forEach((entry) => {
          if (!notificationLogsByClientMap[entry.client_id]) {
            notificationLogsByClientMap[entry.client_id] = [];
          }
          notificationLogsByClientMap[entry.client_id].push(entry);
        });
        assignmentAuditData.forEach((entry) => {
          if (!assignmentAuditsByAssignmentMap[entry.assignment_id]) {
            assignmentAuditsByAssignmentMap[entry.assignment_id] = [];
          }
          assignmentAuditsByAssignmentMap[entry.assignment_id].push(entry);
        });

        setBuddies(buddyData.map(normalizeUser));
        setClients(clientData.map(normalizeUser));
        setElderlyMembers(elderlyData);
        setAssignments(assignmentData);
        setVisits(visitData);
        setTasks(taskData);
        setRequests(requestData);
        setAssignmentAuditsByAssignment(assignmentAuditsByAssignmentMap);
        setClientContactsByClient(contactsByClient);
        setClientContactAuditByClient(contactAuditByClient);
        setNotificationLogsByClient(notificationLogsByClientMap);
        await loadBuddyLocations(visitData);

        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({
            ts: Date.now(),
            buddies: buddyData.map(normalizeUser),
            clients: clientData.map(normalizeUser),
            elderlyMembers: elderlyData,
            assignments: assignmentData,
            visits: visitData,
            tasks: taskData,
            requests: requestData,
            assignmentAuditsByAssignment: assignmentAuditsByAssignmentMap,
            clientContactsByClient: contactsByClient,
            clientContactAuditByClient: contactAuditByClient,
            notificationLogsByClient: notificationLogsByClientMap,
          }),
        );
        return visitData;
      } else if (user.role === 'client') {
        const [assignmentRes, visitRes, taskRes, requestRes, elderlyRes] = await Promise.all([
          fetch(`/api/assignments?client_id=${user.id}`),
          fetch(`/api/visits?client_id=${user.id}`),
          fetch(`/api/tasks?client_id=${user.id}`),
          fetch(`/api/requests?user_id=${user.id}`),
          fetch('/api/elderly-members'),
        ]);
        const assignmentData = asArray<Assignment>(await assignmentRes.json());
        const visitData = asArray<Visit>(await visitRes.json());
        const taskData = asArray<Task>(await taskRes.json());
        const requestData = asArray<RequestEntry>(await requestRes.json());
        const elderlyData = asArray<ElderlyMember>(await elderlyRes.json())
          .filter((entry) => Number(entry.client_id) === Number(user.id));
        setElderlyMembers(elderlyData);
        setAssignments(assignmentData);
        setVisits(visitData);
        setTasks(taskData);
        setRequests(requestData);
        await loadDailyRecordsForAssignments(assignmentData);
        await loadBuddyLocations(visitData);

        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({
            ts: Date.now(),
            elderlyMembers: elderlyData,
            assignments: assignmentData,
            visits: visitData,
            tasks: taskData,
            requests: requestData,
          }),
        );
        return visitData;
      } else if (user.role === 'buddy') {
        const [assignmentRes, visitRes, taskRes] = await Promise.all([
          fetch(`/api/assignments?buddy_id=${user.id}`),
          fetch(`/api/visits?buddy_id=${user.id}`),
          fetch(`/api/tasks?buddy_id=${user.id}`),
        ]);
        const assignmentData = asArray<Assignment>(await assignmentRes.json());
        const visitData = asArray<Visit>(await visitRes.json());
        setAssignments(assignmentData);
        setVisits(visitData);
        const taskData = asArray<Task>(await taskRes.json());
        setTasks(taskData);
        await loadDailyRecordsForAssignments(assignmentData);

        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({
            ts: Date.now(),
            assignments: assignmentData,
            visits: visitData,
            tasks: taskData,
          }),
        );
        return visitData;
      }
    } catch (error) {
      setStatusMessage('Unable to load dashboard data.');
    }

    return [] as Visit[];
  };

  const loadRequests = async (userId: number | null, all = false) => {
    if (!userId) {
      return;
    }
    try {
      const response = await fetch(`/api/requests?${all ? 'all=true' : `user_id=${userId}`}`);
      if (!response.ok) {
        return;
      }
      const result = await response.json();
      setRequests(result);
    } catch {
      setStatusMessage('Unable to load request history.');
    }
  };

  const isLongTermAssignment = (assignment: Assignment) => (
    (assignment.service_plan_type || (assignment.term_type === 'long' ? 'long_term' : 'short_term')) === 'long_term'
  );

  const loadDailyRecordsForAssignments = async (assignmentList: Assignment[]) => {
    const longTermAssignments = assignmentList.filter(isLongTermAssignment);
    if (longTermAssignments.length === 0) {
      setDailyRecordsByAssignment({});
      return;
    }

    const map: Record<number, DailyRecord[]> = {};
    await Promise.all(
      longTermAssignments.map(async (assignment) => {
        try {
          const response = await fetch(`/api/assignments/${assignment.id}/daily-records`);
          if (!response.ok) {
            map[assignment.id] = [];
            return;
          }

          const result = (await response.json()) as DailyRecord[];
          map[assignment.id] = result;
        } catch {
          map[assignment.id] = [];
        }
      }),
    );

    setDailyRecordsByAssignment(map);
  };

  const loadVisitSessionHistory = async () => {
    if (!user || !['admin', 'buddy'].includes(user.role)) {
      return;
    }

    setVisitSessionHistoryLoading(true);
    try {
      const response = await fetch(user.role === 'admin' ? '/api/visit-sessions?all=true' : '/api/visit-sessions');
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to load visit session history.');
        return;
      }

      setVisitSessionHistory((result as VisitSessionHistoryEntry[]) || []);
    } catch {
      setStatusMessage('Unable to connect to the server for visit session history.');
    } finally {
      setVisitSessionHistoryLoading(false);
    }
  };

  const loadReminderConfig = async () => {
    if (!user || user.role !== 'admin') {
      return;
    }

    setReminderConfigLoading(true);
    try {
      const response = await fetch('/api/reminders/config');
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to load reminder config.');
        return;
      }

      const nextEnabled: Record<ReminderTemplateKey, boolean> = {
        visit_reminder_d1: true,
        backfilled_visit_notice: true,
        family_monthly_update: false,
      };
      const nextPreview: Record<ReminderTemplateKey, string> = {
        visit_reminder_d1: 'Reminder: {buddy_name} is scheduled to visit {elderly_name} on {visit_date}.',
        backfilled_visit_notice: 'Update: {buddy_name} visited on {visit_date} at {visit_time}. (Backfilled entry)',
        family_monthly_update: 'Monthly family update: care summary for {elderly_name} for {month_label} is available.',
      };

      ((result.reminders || []) as ReminderConfigEntry[]).forEach((entry) => {
        nextEnabled[entry.template_key] = Boolean(entry.enabled);
        nextPreview[entry.template_key] = String(entry.preview_template || '').trim() || nextPreview[entry.template_key];
      });

      setReminderConfigByKey(nextEnabled);
      setReminderTemplatePreviewByKey(nextPreview);
    } catch {
      setStatusMessage('Unable to connect to the server for reminder config.');
    } finally {
      setReminderConfigLoading(false);
    }
  };

  const handleReminderToggle = async (templateKey: ReminderTemplateKey, enabled: boolean) => {
    if (!user || user.role !== 'admin') {
      return;
    }

    setStatusMessage('');
    try {
      const response = await fetch('/api/reminders/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_key: templateKey,
          enabled,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to update reminder config.');
        return;
      }

      setReminderConfigByKey((current) => ({
        ...current,
        [templateKey]: enabled,
      }));
      setStatusMessage(result.message || 'Reminder setting updated.');
    } catch {
      setStatusMessage('Unable to connect to the server.');
    }
  };

  const runRemindersNow = async () => {
    if (!user || user.role !== 'admin') {
      return;
    }

    setReminderRunnerLoading(true);
    setStatusMessage('');
    try {
      const response = await fetch('/api/reminders/run', {
        method: 'POST',
      });
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to run reminder automation.');
        return;
      }

      const generated = Number(result?.stats?.visit_reminder_d1_generated || 0);
      const skipped = Number(result?.stats?.visit_reminder_d1_skipped_duplicates || 0);
      setStatusMessage(`${result.message || 'Reminder runner completed.'} Generated ${generated} reminder log(s), skipped ${skipped} duplicate(s).`);
      await loadDashboard(true);
    } catch {
      setStatusMessage('Unable to connect to the server.');
    } finally {
      setReminderRunnerLoading(false);
    }
  };

  const buildMonthlyReportQueryString = () => {
    const params = new URLSearchParams();
    params.set('month', reportMonth || new Date().toISOString().slice(0, 7));
    if (reportBuddyId) {
      params.set('buddy_id', reportBuddyId);
    }
    if (reportClientId) {
      params.set('client_id', reportClientId);
    }
    if (reportStatus) {
      params.set('status', reportStatus);
    }
    if (reportMode !== 'all') {
      params.set('mode', reportMode);
    }
    return params.toString();
  };

  const loadMonthlyReports = async () => {
    if (!user || user.role !== 'admin') {
      return;
    }

    setMonthlyReportsLoading(true);
    setStatusMessage('');
    try {
      const query = buildMonthlyReportQueryString();
      const [summaryResponse, calendarResponse] = await Promise.all([
        fetch(`/api/reports/monthly-summary?${query}`),
        fetch(`/api/reports/calendar?${query}`),
      ]);

      const summaryPayload = await summaryResponse.json();
      const calendarPayload = await calendarResponse.json();

      if (!summaryResponse.ok) {
        setStatusMessage(summaryPayload.message || 'Unable to load monthly summary.');
        return;
      }
      if (!calendarResponse.ok) {
        setStatusMessage(calendarPayload.message || 'Unable to load monthly calendar.');
        return;
      }

      setMonthlySummary(summaryPayload as MonthlySummaryPayload);
      setMonthlyCalendar(calendarPayload as MonthlyCalendarPayload);
    } catch {
      setStatusMessage('Unable to connect to the server for monthly reporting.');
    } finally {
      setMonthlyReportsLoading(false);
    }
  };

  const handleAssignmentExtend = async (assignmentId: number) => {
    const extendedUntil = String(assignmentExtensionDates[assignmentId] || '').trim();
    if (!extendedUntil) {
      setStatusMessage('Choose an extension date before extending the assignment.');
      return;
    }

    setStatusMessage('');
    try {
      const response = await fetch(`/api/assignments/${assignmentId}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extended_until: extendedUntil }),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to extend assignment.');
        return;
      }

      setStatusMessage(result.message || 'Assignment extended.');
      await loadDashboard(true);
    } catch {
      setStatusMessage('Unable to connect to the server.');
    }
  };

  const handleDailyRecordDraftChange = (assignmentId: number, field: 'intime' | 'outtime' | 'entry_notes' | 'exit_notes', value: string) => {
    setDailyRecordDrafts((current) => ({
      ...current,
      [assignmentId]: {
        intime: current[assignmentId]?.intime || '',
        outtime: current[assignmentId]?.outtime || '',
        entry_notes: current[assignmentId]?.entry_notes || '',
        exit_notes: current[assignmentId]?.exit_notes || '',
        [field]: value,
      },
    }));
  };

  const handleSaveDailyRecord = async (assignmentId: number) => {
    const draft = dailyRecordDrafts[assignmentId] || { intime: '', outtime: '', entry_notes: '', exit_notes: '' };
    setStatusMessage('');

    try {
      const getLocalToday = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const deriveSessionDateFromDraft = () => {
        const intimeValue = String(draft.intime || '').trim();
        const outtimeValue = String(draft.outtime || '').trim();
        if (intimeValue.length >= 10) {
          return intimeValue.slice(0, 10);
        }
        if (outtimeValue.length >= 10) {
          return outtimeValue.slice(0, 10);
        }
        return getLocalToday();
      };

      const toIsoOrNull = (value: string) => {
        const trimmed = String(value || '').trim();
        if (!trimmed) {
          return null;
        }
        const parsed = new Date(trimmed);
        if (Number.isNaN(parsed.getTime())) {
          throw new Error('Use a valid date/time for in and out fields.');
        }
        return parsed.toISOString();
      };

      const response = await fetch(`/api/assignments/${assignmentId}/daily-records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_date: deriveSessionDateFromDraft(),
          intime: toIsoOrNull(draft.intime),
          outtime: toIsoOrNull(draft.outtime),
          entry_notes: draft.entry_notes,
          exit_notes: draft.exit_notes,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to save daily record.');
        return;
      }

      setStatusMessage(result.message || 'Daily record saved.');
      setDailyRecordDrafts((current) => ({
        ...current,
        [assignmentId]: { intime: '', outtime: '', entry_notes: '', exit_notes: '' },
      }));
      await loadDashboard(true);
    } catch {
      setStatusMessage('Unable to connect to the server.');
    }
  };

  const getTodaySessionForAssignment = (assignmentId: number) => {
    const today = new Date().toISOString().slice(0, 10);
    const rows = dailyRecordsByAssignment[assignmentId] || [];
    const dailyRecordMatch = rows.find((entry) => entry.session_date === today) || null;
    if (dailyRecordMatch) {
      return dailyRecordMatch;
    }

    return visitSessionHistory.find((entry) => Number(entry.assignment_id) === Number(assignmentId) && entry.session_date === today) || null;
  };

  const getOpenSessionForVisit = (visit: Visit) => {
    if (!visit.assignment_id) {
      return null;
    }

    const today = new Date().toISOString().slice(0, 10);
    if (visit.scheduled_date !== today) {
      return null;
    }

    return visitSessionHistory.find((entry) => (
      Number(entry.assignment_id) === Number(visit.assignment_id)
      && (Number(entry.visit_id || 0) === Number(visit.id) || entry.session_date === today)
      && Boolean(entry.intime)
      && !entry.outtime
    )) || null;
  };

  const isVisitSessionStarted = (visit: Visit) => {
    if (visit.scheduled_date !== new Date().toISOString().slice(0, 10)) {
      return false;
    }

    const visitState = String(visitEdits[visit.id]?.visit_status || visit.visit_status || 'scheduled').toLowerCase();
    return visitState === 'in_progress' || Boolean(getOpenSessionForVisit(visit));
  };

  const isVisitSessionClosed = (visit: Visit) => {
    const visitState = String(visitEdits[visit.id]?.visit_status || visit.visit_status || 'scheduled').toLowerCase();
    return ['completed', 'cancelled', 'missed', 'rescheduled'].includes(visitState);
  };

  const handleStartVisitSession = async (visit: Visit) => {
    if (!visit.assignment_id) {
      setStatusMessage('This visit is not linked to an assignment session.');
      return;
    }

    setStatusMessage('');
    try {
      const response = await fetch('/api/visit-sessions/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignment_id: visit.assignment_id,
          visit_id: visit.id,
          entry_notes: '',
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to start visit session.');
        return;
      }

      setStatusMessage(result.message || 'Visit session started.');
      await loadDashboard(true);
      setVisitEdits((current) => {
        const next = { ...current };
        delete next[visit.id];
        return next;
      });
      await loadVisitSessionHistory();
    } catch {
      setStatusMessage('Unable to connect to the server.');
    }
  };

  const handleCompleteVisitSession = async (visit: Visit) => {
    if (!visit.assignment_id) {
      setStatusMessage('This visit is not linked to an assignment session.');
      return;
    }

    const sessionRow = getOpenSessionForVisit(visit) || getTodaySessionForAssignment(visit.assignment_id);
    if (!sessionRow) {
      setStatusMessage('Start the visit session before completing it.');
      return;
    }

    setStatusMessage('');
    try {
      const response = await fetch(`/api/visit-sessions/${sessionRow.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exit_notes: '' }),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to complete visit session.');
        return;
      }

      setStatusMessage(result.message || 'Visit session completed.');
      await loadDashboard();
      await loadVisitSessionHistory();
    } catch {
      setStatusMessage('Unable to connect to the server.');
    }
  };

  const handleBackfillVisitSession = async (visit: Visit) => {
    if (!visit.assignment_id) {
      setStatusMessage('This visit is not linked to an assignment session.');
      return;
    }

    const sessionRow = getOpenSessionForVisit(visit) || getTodaySessionForAssignment(visit.assignment_id);
    if (!sessionRow) {
      setStatusMessage('Start the visit session before backfilling it.');
      return;
    }

    const reason = window.prompt('Enter backfill reason');
    if (!reason || !reason.trim()) {
      setStatusMessage('Backfill reason is required.');
      return;
    }

    setStatusMessage('');
    try {
      const response = await fetch(`/api/visit-sessions/${sessionRow.id}/backfill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_date: sessionRow.session_date,
          intime: sessionRow.intime,
          outtime: sessionRow.outtime,
          entry_notes: sessionRow.entry_notes,
          exit_notes: sessionRow.exit_notes,
          backfill_reason: reason.trim(),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to backfill visit session.');
        return;
      }

      // Check if there's a conflict that needs reassignment
      if (result.conflict) {
        setBackfillConflictModal({
          conflict_date: result.conflict_date,
          elderly_id: result.elderly_id,
          current_buddy_id: result.current_buddy_id,
          backfill_reason: result.backfill_reason,
          selectedReassignBuddyId: '',
        });
        setStatusMessage('Caregiver is busy on ' + result.conflict_date + '. Choose to reassign to another caregiver or auto-carry-forward.');
        return;
      }

      setStatusMessage(result.message || 'Visit session backfilled.');
      await loadDashboard();
      await loadVisitSessionHistory();
    } catch {
      setStatusMessage('Unable to connect to the server.');
    }
  };

  const loadRequestOpsMetrics = async () => {
    if (!user || user.role !== 'admin') {
      return;
    }

    setRequestOpsLoading(true);
    try {
      const response = await fetch('/api/requests/ops-metrics');
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to load request ops metrics.');
        return;
      }

      setRequestOpsMetrics(result as RequestOpsMetrics);
    } catch {
      setStatusMessage('Unable to connect to the server for request ops metrics.');
    } finally {
      setRequestOpsLoading(false);
    }
  };

  const autoAdvanceRequestsToViewed = async () => {
    if (!user || user.role !== 'admin') {
      return;
    }

    try {
      const response = await fetch('/api/requests/auto-view', {
        method: 'POST',
      });
      if (!response.ok) {
        return;
      }

      await loadRequests(user.id, true);
      await loadRequestOpsMetrics();
    } catch {
      // Do not block tab rendering if auto-advance fails.
    }
  };

  const refreshLiveLocations = async () => {
    if (!user) {
      return;
    }
    if (user.role === 'admin' || user.role === 'client') {
      await loadBuddyLocations(visits);
      setStatusMessage('Live locations refreshed.');
    }
  };

  const refreshLocation = async (visitList: Visit[] = visits) => {
    if (!user || user.role !== 'buddy') {
      return;
    }

    const activeVisits = getActiveCaseVisits(visitList);
    if (activeVisits.length === 0) {
      setStatusMessage('Location updates are available only after a visit session starts.');
      return;
    }

    if (!navigator.geolocation) {
      setStatusMessage('Geolocation is not available in your browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude.toFixed(5);
        const lng = position.coords.longitude.toFixed(5);
        try {
          const response = await fetch('/api/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ buddy_id: user.id, assignment_id: activeVisits[0].assignment_id, lat, lng }),
          });
          const result = await response.json();
          setLocation(result.currentLocation || null);
          setStatusMessage('Location updated.');
          await loadDashboard();
        } catch (error) {
          setStatusMessage('Unable to update location.');
        }
      },
      () => {
        setStatusMessage('Unable to determine your location.');
      },
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');

    if (!authForm.identifier || !authForm.password) {
      setMessage('Please enter user ID, email, or phone and password.');
      return;
    }

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: authForm.identifier, password: authForm.password }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.message || 'Login failed.');
        return;
      }
      setUser(result.user);
      sessionStorage.setItem('gatt_user', JSON.stringify(result.user));
      setMessage('');
      setStatusMessage('');
      setAuthForm(initialAuthState);
      return;
    } catch (error) {
      setMessage('Unable to connect to the server.');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch {
      // Ignore network errors while clearing local session state.
    }

    setUser(null);
    setBuddies([]);
    setClients([]);
    setAssignments([]);
    setVisits([]);
    setTasks([]);
    setAssignmentAuditsByAssignment({});
    setDailyRecordsByAssignment({});
    setVisitSessionHistory([]);
    setAssignmentExtensionDates({});
    setDailyRecordDrafts({});
    setClientContactsByClient({});
    setClientContactAuditByClient({});
    setNotificationLogsByClient({});
    setReminderConfigByKey({
      visit_reminder_d1: true,
      backfilled_visit_notice: true,
      family_monthly_update: false,
    });
    setLocation(null);
    sessionStorage.removeItem('gatt_user');
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith('gatt_dashboard_'))
      .forEach((key) => sessionStorage.removeItem(key));
    setMessage('You have been logged out.');
    setStatusMessage('');
  };

  const handleInstallApp = async () => {
    if (!deferredInstallPrompt) {
      setStatusMessage('Install option is not available on this device/browser yet.');
      return;
    }

    try {
      await deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      setDeferredInstallPrompt(null);
      setInstallPromptAvailable(false);

      if (choice.outcome === 'accepted') {
        setStatusMessage('App install accepted.');
      } else {
        setStatusMessage('App install dismissed.');
      }
    } catch {
      setStatusMessage('Unable to open install prompt right now.');
    }
  };

  const handleCreateUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatusMessage('');

    const trimmedUserId = createForm.user_id.trim();
    const trimmedName = createForm.name.trim();
    const trimmedEmail = createForm.email.trim();
    const trimmedPhone = createForm.phone.trim();
    const trimmedAddress = createForm.address.trim();

    if (!trimmedUserId || !trimmedName || !trimmedEmail || !trimmedPhone || !trimmedAddress || !createForm.password) {
      setStatusMessage('User ID, full name, email, phone number, address, and password are required.');
      return;
    }

    if (!isValidEmailAddress(trimmedEmail)) {
      setStatusMessage('Enter a valid email address.');
      return;
    }

    if (!isValidSupportedPhoneNumber(trimmedPhone)) {
      setStatusMessage('Enter a phone number with at least 10 digits.');
      return;
    }

    if (createForm.role === 'client' && !createForm.client_onboarding_type) {
      setStatusMessage('Client onboarding type is required for client accounts.');
      return;
    }

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...createForm,
          user_id: trimmedUserId,
          name: trimmedName,
          email: trimmedEmail,
          phone: trimmedPhone,
          address: trimmedAddress,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to create user.');
        return;
      }
      setStatusMessage(result.message);
      setCreateForm(initialCreateForm);
      await loadDashboard();
    } catch (error) {
      setStatusMessage('Unable to connect to the server.');
    }
  };

  const handleCreateAssignment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatusMessage('');

    if (!assignmentForm.buddy_id || !assignmentForm.elderly_id) {
      setStatusMessage('Please select a caretaker and a client case.');
      return;
    }

    if (assignmentForm.service_plan_type === 'short_term') {
      if (!assignmentForm.monthly_visit_plan || !assignmentForm.planned_visit_duration_minutes) {
        setStatusMessage('Short-term service needs monthly visit plan and planned visit duration.');
        return;
      }

      const expectedSlots = Number(assignmentForm.monthly_visit_plan || '0');
      const selectedSlots = assignmentForm.short_term_slots || [];
      if (selectedSlots.length !== expectedSlots) {
        setStatusMessage(`Select exactly ${expectedSlots} short-term visit slots.`);
        return;
      }

      const missingSlot = selectedSlots.find((slot) => !slot.visit_date || !slot.start_time);
      if (missingSlot) {
        setStatusMessage('Each short-term slot requires a date and start time.');
        return;
      }

      const uniqueDates = new Set(selectedSlots.map((slot) => slot.visit_date));
      if (uniqueDates.size !== selectedSlots.length) {
        setStatusMessage('Short-term slots must use different dates.');
        return;
      }
    }

    if (assignmentForm.service_plan_type === 'long_term' && !assignmentForm.care_shift) {
      setStatusMessage('Long-term service needs a care shift.');
      return;
    }

    if (assignmentForm.service_plan_type === 'long_term') {
      if (!assignmentForm.start_date || !assignmentForm.end_date) {
        setStatusMessage('Long-term service needs cycle start and end dates.');
        return;
      }

      if (assignmentForm.end_date < assignmentForm.start_date) {
        setStatusMessage('Long-term cycle end date must be on or after start date.');
        return;
      }
    }

    try {
      const response = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assignmentForm),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to create assignment.');
        return;
      }
      setStatusMessage(result.message);
      setAssignmentForm(initialAssignmentForm);
      await loadDashboard();
    } catch (error) {
      setStatusMessage('Unable to connect to the server.');
    }
  };

  const handleTaskUpdate = async (taskId: number, newStatus: string) => {
    setStatusMessage('');
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to update task.');
        return;
      }
      setStatusMessage(result.message);
      await loadDashboard();
    } catch (error) {
      setStatusMessage('Unable to connect to the server.');
    }
  };

  const handleVisitUpdate = async (visitId: number, status_check: string, note: string) => {
    setStatusMessage('');
    try {
      const response = await fetch(`/api/visits/${visitId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_check, buddy_notes: note }),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to update visit.');
        return;
      }
      setStatusMessage(result.message);
      await loadDashboard();
    } catch (error) {
      setStatusMessage('Unable to connect to the server.');
    }
  };

  const handleAssignmentUpdate = async (assignmentId: number) => {
    const draft = assignmentEdits[assignmentId];
    if (!draft) {
      return;
    }

    const coordDraft = assignmentClientCoordinateByAssignment[assignmentId] || { lat: '', lng: '' };
    const hasAnyCoord = String(coordDraft.lat || '').trim() || String(coordDraft.lng || '').trim();
    if (hasAnyCoord) {
      const lat = Number(coordDraft.lat);
      const lng = Number(coordDraft.lng);
      const latValid = Number.isFinite(lat) && lat >= -90 && lat <= 90;
      const lngValid = Number.isFinite(lng) && lng >= -180 && lng <= 180;
      if (!latValid || !lngValid) {
        setStatusMessage('Client coordinates are invalid. Latitude must be between -90 and 90, longitude between -180 and 180.');
        return;
      }
    }

    const mergedAdminNotes = upsertClientCoordsTag(draft.admin_notes, coordDraft.lat, coordDraft.lng);
    const payload = {
      ...draft,
      admin_notes: mergedAdminNotes,
    };

    setStatusMessage('');
    try {
      const response = await fetch(`/api/assignments/${assignmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to update assignment.');
        return;
      }
      setStatusMessage(result.message);
      await loadDashboard();
    } catch (error) {
      setStatusMessage('Unable to connect to the server.');
    }
  };

  const handleClientAssignmentApprove = async (assignmentId: number) => {
    setStatusMessage('');
    try {
      const response = await fetch(`/api/assignments/${assignmentId}/client-approve`, {
        method: 'POST',
      });
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to approve assignment.');
        return;
      }

      setStatusMessage(result.message || 'Assignment approved.');
      await loadDashboard();
    } catch {
      setStatusMessage('Unable to connect to the server.');
    }
  };

  const handleAssignmentApprovalAction = async (assignmentId: number) => {
    const assignment = safeAssignments.find((entry) => Number(entry.id) === Number(assignmentId));
    if ((assignment?.approval_state || 'pending_approval') === 'approved') {
      setStatusMessage('This assignment is already approved.');
      return;
    }

    const notes = assignmentEdits[assignmentId]?.admin_notes || '';
    setStatusMessage('');
    try {
      const response = await fetch(`/api/assignments/${assignmentId}/approval-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', notes }),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to update assignment approval status.');
        return;
      }

      setStatusMessage(result.message || 'Assignment approval status updated.');
      await loadDashboard();
    } catch {
      setStatusMessage('Unable to connect to the server.');
    }
  };

  const handleDeleteAssignment = async (assignmentId: number) => {
    const confirmed = window.confirm('Delete this assigned work? This will remove linked visits and tasks.');
    if (!confirmed) {
      return;
    }

    setStatusMessage('');
    try {
      const response = await fetch(`/api/assignments/${assignmentId}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to delete assignment.');
        return;
      }

      setStatusMessage(result.message || 'Assignment deleted.');
      await loadDashboard();
    } catch {
      setStatusMessage('Unable to connect to the server.');
    }
  };

  const handleDeleteUser = async (item: User) => {
    const confirmed = window.confirm(`Delete ${item.role} ${item.name}? This action cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setStatusMessage('');
    try {
      const response = await fetch(`/api/users/${item.id}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to delete user.');
        return;
      }

      setStatusMessage(result.message || 'User deleted.');
      await loadDashboard();
    } catch {
      setStatusMessage('Unable to connect to the server.');
    }
  };

  const handleAssignmentBuddySwitch = async (assignment: Assignment) => {
    const replacementBuddyId = Number(assignmentReplacementBuddyByAssignment[assignment.id] || 0);
    const reason = assignmentReplacementReasonByAssignment[assignment.id] || '';

    if (!replacementBuddyId) {
      setStatusMessage('Select a caretaker for switch or replacement.');
      return;
    }

    setStatusMessage('');
    try {
      const response = await fetch(`/api/assignments/${assignment.id}/switch-buddy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_buddy_id: replacementBuddyId,
          reason,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to switch caretaker.');
        return;
      }

      setStatusMessage(result.message || 'Caretaker switched.');
      await loadDashboard();
    } catch {
      setStatusMessage('Unable to connect to the server.');
    }
  };

  const handleReassignVisitBuddy = async (visit: Visit) => {
    setVisitReassignmentModal({ visit, selectedBuddyId: '' });
  };

  const handleConfirmVisitReassignment = async () => {
    if (!visitReassignmentModal) return;

    const { visit, selectedBuddyId } = visitReassignmentModal;
    const newBuddyId = Number(selectedBuddyId);

    if (!newBuddyId) {
      setStatusMessage('Select a caretaker for this visit.');
      return;
    }

    setStatusMessage('');
    try {
      const response = await fetch('/api/visits/reassign-buddy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visit_id: visit.id,
          new_buddy_id: newBuddyId,
          elderly_id: visit.elderly_id,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to reassign visit.');
        return;
      }

      setStatusMessage(result.message || 'Visit reassigned to new caretaker.');
      setVisitReassignmentModal(null);
      await loadDashboard();
    } catch {
      setStatusMessage('Unable to connect to the server.');
    }
  };

  const handleConfirmBackfillReassignment = async () => {
    if (!backfillConflictModal) return;

    const { conflict_date, elderly_id, backfill_reason, selectedReassignBuddyId } = backfillConflictModal;
    const newBuddyId = Number(selectedReassignBuddyId);

    if (!newBuddyId) {
      setStatusMessage('Select a caretaker for the rescheduled visit.');
      return;
    }

    setStatusMessage('');
    try {
      const response = await fetch('/api/backfill-reassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conflict_date,
          new_buddy_id: newBuddyId,
          elderly_id,
          backfill_reason,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to reassign backfilled visit.');
        return;
      }

      setStatusMessage(result.message || 'Visit rescheduled to new caretaker.');
      setBackfillConflictModal(null);
      await loadDashboard();
      await loadVisitSessionHistory();
    } catch {
      setStatusMessage('Unable to connect to the server.');
    }
  };

  const handleAutoCarryForward = async () => {
    if (!backfillConflictModal) return;

    setStatusMessage('Auto-carrying forward to next available day...');
    setBackfillConflictModal(null);
    // The backend already handled auto-carry-forward by not returning conflict
    // This is just for UX - user confirms they want the system default behavior
    await loadDashboard();
    await loadVisitSessionHistory();
  };

  const handleAssignVisitToSameBuddy = async (assignment: Assignment, visit: Visit) => {
    const draft = assignmentVisitAssignDraftsByVisit[visit.id] || {
      scheduled_date: visit.scheduled_date,
      start_time: '09:00',
    };

    if (!draft.scheduled_date) {
      setStatusMessage('Select a date to assign this follow-up visit.');
      return;
    }

    try {
      const response = await fetch('/api/visits/assign-same-buddy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignment_id: assignment.id,
          buddy_id: assignment.buddy_id,
          elderly_id: assignment.elderly_id,
          scheduled_date: draft.scheduled_date,
          start_time: draft.start_time,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to assign follow-up visit.');
        return;
      }

      setStatusMessage(result.message || 'Follow-up visit assigned.');
      await loadDashboard();
    } catch {
      setStatusMessage('Unable to connect to the server.');
    }
  };

  const openAssignmentDetails = (assignmentId: number) => {
    setAssignmentDetailsId(assignmentId);
  };

  const closeAssignmentDetails = () => {
    setAssignmentDetailsId(null);
  };

  const getAssignmentSlotDrafts = (assignment: Assignment): ShortTermSlotDraft[] => {
    const rows = assignmentSlotDraftsByAssignment[assignment.id] || [];
    if (rows.length > 0) {
      return rows;
    }
    const fallbackCount = Math.max(1, Number(assignment.monthly_visit_plan || 1));
    return createShortTermSlotDrafts(fallbackCount);
  };

  const handleAssignmentSlotDraftChange = (assignmentId: number, slotIndex: number, field: keyof ShortTermSlotDraft, value: string) => {
    setAssignmentSlotDraftsByAssignment((current) => {
      const baseRows = current[assignmentId] || [];
      const nextRows = baseRows.map((row, index) => (
        index === slotIndex
          ? { ...row, [field]: value }
          : row
      ));
      return {
        ...current,
        [assignmentId]: nextRows,
      };
    });
  };

  const handleAddAssignmentSlotDraft = (assignment: Assignment) => {
    setAssignmentSlotDraftsByAssignment((current) => ({
      ...current,
      [assignment.id]: [...getAssignmentSlotDrafts(assignment), { visit_date: '', start_time: '' }],
    }));
  };

  const handleRemoveAssignmentSlotDraft = (assignment: Assignment, slotIndex: number) => {
    setAssignmentSlotDraftsByAssignment((current) => {
      const existingRows = getAssignmentSlotDrafts(assignment);
      if (existingRows.length <= 1) {
        return current;
      }

      return {
        ...current,
        [assignment.id]: existingRows.filter((_, index) => index !== slotIndex),
      };
    });
  };

  const handleSaveAssignmentSlots = async (assignment: Assignment) => {
    if (isLongTermAssignment(assignment)) {
      setStatusMessage('Slot editing applies to short-term assignments only.');
      return;
    }

    const slotRows = getAssignmentSlotDrafts(assignment);
    const expectedCount = Number(assignment.monthly_visit_plan || 0);
    if (!Number.isFinite(expectedCount) || expectedCount <= 0) {
      setStatusMessage('Monthly visit plan must be set before editing slots.');
      return;
    }

    if (slotRows.length !== expectedCount) {
      setStatusMessage(`This package needs exactly ${expectedCount} visit slots. Add or remove rows accordingly.`);
      return;
    }

    if (slotRows.some((slot) => !slot.visit_date || !slot.start_time)) {
      setStatusMessage('Each slot requires both visit date and start time.');
      return;
    }

    try {
      const response = await fetch(`/api/assignments/${assignment.id}/short-term-slots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ short_term_slots: slotRows }),
      });

      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to update short-term slots.');
        return;
      }

      setStatusMessage(result.message || 'Short-term slots updated.');
      await loadDashboard();
    } catch {
      setStatusMessage('Unable to connect to the server.');
    }
  };

  const handleVisitAdminUpdate = async (visitId: number) => {
    const draft = visitEdits[visitId];
    if (!draft) {
      return;
    }

    setStatusMessage('');
    try {
      const response = await fetch(`/api/visits/${visitId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to update visit.');
        return;
      }
      setStatusMessage(result.message);
      
      // Clear the draft immediately and force refresh from server
      setVisitEdits((current) => {
        const next = { ...current };
        delete next[visitId];
        return next;
      });
      await loadDashboard(true);
      await loadVisitSessionHistory();
    } catch (error) {
      setStatusMessage('Unable to connect to the server.');
    }
  };

  const handleRequestSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatusMessage('');

    if (!requestForm.message.trim() || !user) {
      setStatusMessage('Please enter your request message.');
      return;
    }

    if (requestForm.request_type === 'feedback' && !requestForm.feedback_assignment_id) {
      setStatusMessage('Select the case you are giving feedback for.');
      return;
    }

    if (requestForm.request_type === 'feedback') {
      const selectedTarget = clientFeedbackTargets.find((entry) => String(entry.assignment_id) === String(requestForm.feedback_assignment_id || ''));
      if (!selectedTarget) {
        setStatusMessage('Select a valid active caretaker plan linked to your profile for feedback.');
        return;
      }
    }

    try {
      const selectedFeedbackTarget = requestForm.request_type === 'feedback'
        ? clientFeedbackTargets.find((entry) => String(entry.assignment_id) === String(requestForm.feedback_assignment_id || ''))
        : null;
      const submittedMessage = requestForm.request_type === 'feedback' && selectedFeedbackTarget
        ? `Feedback on ${selectedFeedbackTarget.label}: ${requestForm.message}`
        : requestForm.message;

      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          elderly_id: requestForm.request_type === 'feedback' ? Number(selectedFeedbackTarget?.elderly_id || 0) || null : null,
          message: submittedMessage,
          request_type: requestForm.request_type,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to submit request.');
        return;
      }
      setStatusMessage(result.message);
      setRequestForm(initialRequestForm);
      await loadRequests(user.id);
    } catch (error) {
      setStatusMessage('Unable to connect to the server.');
    }
  };

  const handleRequestAssignmentDraftChange = (
    requestId: number | undefined,
    field: keyof RequestAssignmentDraft,
    value: string,
  ) => {
    if (!requestId) {
      return;
    }

    setRequestAssignmentDrafts((current) => {
      const fallback = current[requestId] || {
        buddy_id: '',
        elderly_id: '',
        service_plan_type: 'long_term' as ServicePlanType,
        care_shift: 'morning_10h' as '' | CareShift,
        monthly_visit_plan: '3' as '3' | '6' | '9',
        planned_visit_duration_minutes: '60' as '60' | '90',
        start_date: new Date().toISOString().slice(0, 10),
        end_date: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10),
      };

      const nextDraft: RequestAssignmentDraft = {
        ...fallback,
        [field]: value,
      } as RequestAssignmentDraft;

      if (field === 'service_plan_type') {
        if (value === 'long_term') {
          nextDraft.care_shift = nextDraft.care_shift || 'morning_10h';
        }
      }

      return {
        ...current,
        [requestId]: nextDraft,
      };
    });
  };

  const handleAssignRequestToCaretaker = async (request: RequestEntry) => {
    if (String(request.request_type || '').toLowerCase() !== 'task_request') {
      setStatusMessage('Only task requests can be assigned to a caretaker.');
      return;
    }

    if (!request.id) {
      setStatusMessage('Unable to assign this request because request id is missing.');
      return;
    }

    const requestId = Number(request.id);

    const effectiveRequestStatus = requestStatusEdits[requestId] || normalizeRequestStatusForUi(request.status);
    if (['assigned', 'resolved', 'closed'].includes(effectiveRequestStatus)) {
      setStatusMessage('This request is already finalized and is now view-only.');
      return;
    }

    const draft = requestAssignmentDrafts[requestId];
    const fallbackCase = request.elderly_id
      ? elderlyMembers.find((entry) => Number(entry.id) === Number(request.elderly_id))
      : elderlyMembers.find((entry) => Number(entry.client_id) === Number(request.user_id));
    const resolvedElderlyId = String(draft?.elderly_id || (fallbackCase ? fallbackCase.id : '')).trim();

    if (!draft || !draft.buddy_id) {
      setStatusMessage('Select caretaker before assigning this request.');
      return;
    }

    if (!resolvedElderlyId) {
      setStatusMessage('No case is linked to this client request. Add a client case first.');
      return;
    }

    const toLocalDateText = (value: Date) => {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const buildShortTermSlots = () => {
      const count = Number(draft.monthly_visit_plan || '0');
      const seedText = String(draft.start_date || '').trim() || toLocalDateText(new Date());
      const [year, month, day] = seedText.split('-').map((entry) => Number(entry));
      const seedDate = Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
        ? new Date(year, month - 1, day)
        : new Date();

      return Array.from({ length: Math.max(0, count) }, (_, index) => {
        const nextDate = new Date(seedDate);
        nextDate.setDate(seedDate.getDate() + (index * 2));
        return {
          visit_date: toLocalDateText(nextDate),
          start_time: '09:00',
        };
      });
    };

    const assignmentPayload: Record<string, unknown> = {
      buddy_id: Number(draft.buddy_id),
      elderly_id: Number(resolvedElderlyId),
      service_plan_type: draft.service_plan_type,
      admin_notes: `Request #${request.id} (${request.request_type}): ${request.message}`,
    };

    if (draft.service_plan_type === 'long_term') {
      if (!draft.care_shift || !draft.start_date || !draft.end_date) {
        setStatusMessage('Long-term assignment needs shift, start date, and end date.');
        return;
      }
      assignmentPayload.care_shift = draft.care_shift;
      assignmentPayload.start_date = draft.start_date;
      assignmentPayload.end_date = draft.end_date;
    } else {
      assignmentPayload.monthly_visit_plan = Number(draft.monthly_visit_plan);
      assignmentPayload.planned_visit_duration_minutes = Number(draft.planned_visit_duration_minutes);
      assignmentPayload.short_term_slots = buildShortTermSlots();
    }

    try {
      const createResponse = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assignmentPayload),
      });
      const createResult = await createResponse.json();
      if (!createResponse.ok) {
        setStatusMessage(createResult.message || 'Unable to create assignment from request.');
        return;
      }

      const statusResponse = await fetch(`/api/requests/${requestId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'assigned' }),
      });
      const statusResult = await statusResponse.json();
      if (!statusResponse.ok) {
        setStatusMessage(statusResult.message || 'Assignment created, but request status update failed.');
        await loadDashboard();
        return;
      }

      setRequestStatusEdits((current) => ({
        ...current,
        [requestId]: 'assigned',
      }));

      const selectedBuddy = buddies.find((entry) => Number(entry.id) === Number(draft.buddy_id));
      const selectedCase = elderlyMembers.find((entry) => Number(entry.id) === Number(resolvedElderlyId));
      const modeLabel = draft.service_plan_type === 'long_term' ? 'long-term' : 'short-term';
      const assignmentIdText = createResult?.id ? ` (assignment #${createResult.id})` : '';
      setRequestAssignmentResultByRequest((current) => ({
        ...current,
        [requestId]: `Assigned to ${selectedBuddy?.name || 'caretaker'} for ${selectedCase?.full_name || 'selected case'} as ${modeLabel}${assignmentIdText}.`,
      }));

      setStatusMessage('Request assigned and assignment created.');
      await loadDashboard();
    } catch {
      setStatusMessage('Unable to connect to the server.');
    }
  };

  const getContactDraft = (clientId: number) => contactDrafts[clientId] || createEmptyContactDraft();

  const getEditingContactDraft = (contact: FamilyContact) => editingContacts[contact.id] || {
    contact_name: contact.contact_name || '',
    relation_label: contact.relation_label || '',
    phone: contact.phone || '',
    whatsapp_opt_in: Boolean(contact.whatsapp_opt_in),
    is_primary: Boolean(contact.is_primary),
  };

  const updateContactDraft = (
    clientId: number,
    field: 'contact_name' | 'relation_label' | 'phone' | 'whatsapp_opt_in' | 'is_primary',
    value: string | boolean,
  ) => {
    setContactDrafts((current) => ({
      ...current,
      [clientId]: {
        ...(current[clientId] || createEmptyContactDraft()),
        [field]: value,
      },
    }));
  };

  const updateEditingContactDraft = (
    contactId: number,
    field: 'contact_name' | 'relation_label' | 'phone' | 'whatsapp_opt_in' | 'is_primary',
    value: string | boolean,
    sourceContact?: FamilyContact,
  ) => {
    setEditingContacts((current) => ({
      ...current,
      [contactId]: {
        ...(sourceContact ? getEditingContactDraft(sourceContact) : current[contactId] || createEmptyContactDraft()),
        [field]: value,
      },
    }));
  };

  const startEditingFamilyContact = (contact: FamilyContact) => {
    setEditingContacts((current) => ({
      ...current,
      [contact.id]: {
        contact_name: contact.contact_name || '',
        relation_label: contact.relation_label || '',
        phone: contact.phone || '',
        whatsapp_opt_in: Boolean(contact.whatsapp_opt_in),
        is_primary: Boolean(contact.is_primary),
      },
    }));
  };

  const cancelEditingFamilyContact = (contactId: number) => {
    setEditingContacts((current) => {
      const next = { ...current };
      delete next[contactId];
      return next;
    });
  };

  const handleAddFamilyContact = async (clientId: number) => {
    const draft = getContactDraft(clientId);
    const elderly = elderlyMembers.find((entry) => entry.client_id === clientId);

    if (!elderly) {
      setStatusMessage('No client case linked to this profile yet.');
      return;
    }

    if (!draft.phone.trim()) {
      setStatusMessage('Phone number is required for family contact.');
      return;
    }

    try {
      const response = await fetch('/api/client-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          elderly_id: elderly.id,
          contact_name: draft.contact_name,
          relation_label: draft.relation_label,
          phone: draft.phone,
          whatsapp_opt_in: draft.whatsapp_opt_in,
          is_primary: draft.is_primary,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to add family contact.');
        return;
      }

      setStatusMessage(result.message || 'Family contact added.');
      setContactDrafts((current) => ({
        ...current,
        [clientId]: createEmptyContactDraft(),
      }));
      await loadDashboard();
    } catch {
      setStatusMessage('Unable to connect to the server.');
    }
  };

  const handleUpdateFamilyContact = async (clientId: number, contact: FamilyContact) => {
    const draft = getEditingContactDraft(contact);

    if (!draft.phone.trim()) {
      setStatusMessage('Phone number is required for family contact.');
      return;
    }

    try {
      const response = await fetch(`/api/client-contacts/${contact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });

      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to update family contact.');
        return;
      }

      setStatusMessage(result.message || 'Family contact updated.');
      cancelEditingFamilyContact(contact.id);
      await loadDashboard();
    } catch {
      setStatusMessage('Unable to connect to the server.');
    }
  };

  const handleDeleteFamilyContact = async (clientId: number, contactId: number) => {
    try {
      const response = await fetch(`/api/client-contacts/${contactId}`, {
        method: 'DELETE',
      });

      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to remove family contact.');
        return;
      }

      setStatusMessage(result.message || 'Family contact removed.');
      cancelEditingFamilyContact(contactId);
      await loadDashboard();
    } catch {
      setStatusMessage('Unable to connect to the server.');
    }
  };

  const openContactHref = (href: string) => {
    window.open(href, '_blank', 'noopener,noreferrer');
  };

  const logNotificationAction = async (payload: {
    clientId: number;
    familyContactId?: number | null;
    recipientRole: 'client' | 'family';
    recipientName: string;
    recipientPhone: string;
    channel: 'notify' | 'whatsapp' | 'sms' | 'call';
    templateKey: NotificationTemplateKey;
    messagePreview: string;
  }) => {
    try {
      await fetch('/api/notification-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: payload.clientId,
          family_contact_id: payload.familyContactId || null,
          recipient_role: payload.recipientRole,
          recipient_name: payload.recipientName,
          recipient_phone: payload.recipientPhone,
          channel: payload.channel,
          template_key: payload.templateKey,
          message_preview: payload.messagePreview,
        }),
      });
    } catch {
      // Logging failure should not block the external notification action.
    }
  };

  const buildNotificationMessage = (
    subjectLabel: string,
    options?: {
      hasActiveVisitToday?: boolean;
      recipientName?: string;
      recipientRole?: 'client' | 'family';
      templateKey?: NotificationTemplateKey;
      customMessage?: string;
    },
  ) => {
    const resolvedTemplate = options?.templateKey === 'auto' || !options?.templateKey
      ? (options?.hasActiveVisitToday ? 'visit_update' : 'general_update')
      : options.templateKey;
    const customMessage = String(options?.customMessage || '').trim();
    const greetingTarget = options?.recipientName ? ` ${options.recipientName},` : ',';
    if (resolvedTemplate === 'custom' && customMessage) {
      return customMessage
        .replace(/\{client\}/gi, subjectLabel)
        .replace(/\{recipient\}/gi, options?.recipientName || 'there');
    }

    const visitContext = resolvedTemplate === 'visit_update'
      ? ` We are sharing an update related to today's scheduled visit for ${subjectLabel}.`
      : resolvedTemplate === 'task_completed'
        ? ` We are sharing a task completion update for ${subjectLabel}.`
        : resolvedTemplate === 'visit_reminder_d1'
          ? ` This is a one-day reminder for the scheduled visit for ${subjectLabel}.`
          : resolvedTemplate === 'backfilled_visit_notice'
            ? ` A delayed visit entry was added for ${subjectLabel}.`
            : resolvedTemplate === 'family_monthly_update'
              ? ` The monthly family summary for ${subjectLabel} is ready.`
        : resolvedTemplate === 'follow_up'
          ? ` We need a follow-up discussion regarding ${subjectLabel}.`
          : ` We are sharing a general care update for ${subjectLabel}.`;
    const responseContext = options?.recipientRole === 'family'
      ? (resolvedTemplate === 'follow_up'
        ? ' Please review and coordinate with the family as soon as possible.'
        : ' Please review and coordinate with the family if needed.')
      : (resolvedTemplate === 'follow_up'
        ? ' Please review and reach out to us at the earliest convenience.'
        : ' Please review and reach out if you need any support.');

    const closingContext = resolvedTemplate === 'task_completed'
      ? ' The planned care task has been completed.'
      : resolvedTemplate === 'backfilled_visit_notice'
        ? ' This record was logged after the original visit window and is now traceable in audit history.'
      : '';

    return `Hello${greetingTarget} this is a care update from Gatt & Co.${visitContext}${closingContext}${responseContext}`;
  };

  const openWhatsAppNotification = (
    phone: string,
    subjectLabel: string,
    options?: {
      hasActiveVisitToday?: boolean;
      recipientName?: string;
      recipientRole?: 'client' | 'family';
      templateKey?: NotificationTemplateKey;
      customMessage?: string;
    },
  ) => {
    const message = encodeURIComponent(buildNotificationMessage(subjectLabel, options));
    openContactHref(`https://wa.me/${phone}?text=${message}`);
  };

  const openSmsNotification = (
    phone: string,
    subjectLabel: string,
    options?: {
      hasActiveVisitToday?: boolean;
      recipientName?: string;
      recipientRole?: 'client' | 'family';
      templateKey?: NotificationTemplateKey;
      customMessage?: string;
    },
  ) => {
    const message = encodeURIComponent(buildNotificationMessage(subjectLabel, options));
    openContactHref(`sms:${phone}?body=${message}`);
  };

  const notifyPhone = (
    clientId: number,
    phone: string,
    subjectLabel: string,
    whatsappEnabled = true,
    options?: {
      hasActiveVisitToday?: boolean;
      recipientName?: string;
      recipientRole?: 'client' | 'family';
      templateKey?: NotificationTemplateKey;
      customMessage?: string;
      familyContactId?: number | null;
    },
  ) => {
    const trimmedPhone = String(phone || '').trim();
    if (!trimmedPhone) {
      setStatusMessage(`No phone number available for ${subjectLabel}.`);
      return;
    }

    const messagePreview = buildNotificationMessage(subjectLabel, options);
    void logNotificationAction({
      clientId,
      familyContactId: options?.familyContactId || null,
      recipientRole: options?.recipientRole || 'client',
      recipientName: options?.recipientName || subjectLabel,
      recipientPhone: trimmedPhone,
      channel: 'notify',
      templateKey: options?.templateKey || 'auto',
      messagePreview,
    });

    if (whatsappEnabled) {
      openWhatsAppNotification(trimmedPhone, subjectLabel, options);
      setStatusMessage(`Opening WhatsApp notification for ${subjectLabel}.`);
      return;
    }

    openSmsNotification(trimmedPhone, subjectLabel, options);
    setStatusMessage(`Opening SMS notification for ${subjectLabel}.`);
  };

  const toggleClientDetails = (clientId: number) => {
    setExpandedClientId((current) => (current === clientId ? null : clientId));
  };

  const openClientAudit = (clientId: number) => {
    setAuditClientId(clientId);
    setAuditOverlayFilter('all');
    const now = new Date();
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    setArchiveMonth(`${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}`);
  };

  const closeClientAudit = () => {
    setAuditClientId(null);
  };

  const getAuditActionLabel = (actionType: FamilyContactAuditEntry['action_type']) => {
    if (actionType === 'created') {
      return 'Added';
    }
    if (actionType === 'updated') {
      return 'Updated';
    }
    if (actionType === 'deleted') {
      return 'Removed';
    }
    return 'Primary changed';
  };

  const clientHasActiveVisitToday = (clientId: number) => {
    const elderlyIds = elderlyMembers.filter((entry) => entry.client_id === clientId).map((entry) => entry.id);
    if (elderlyIds.length === 0) {
      return false;
    }

    return getActiveCaseVisits(visits).some((visit) => elderlyIds.includes(visit.elderly_id));
  };

  const getNotificationTemplateForClient = (clientId: number): NotificationTemplateKey => (
    notificationTemplateByClient[clientId] || 'auto'
  );

  const getCustomNotificationMessageForClient = (clientId: number) => (
    customNotificationMessageByClient[clientId] || ''
  );

  const loadArchivedHistory = async () => {
    if (!archivedHistoryClientId || !archivedHistoryMonth) {
      setStatusMessage('Select a client and month to view archived history.');
      return;
    }

    setArchivedHistoryLoading(true);
    try {
      const response = await fetch(`/api/archived-case-history?client_id=${archivedHistoryClientId}&month=${archivedHistoryMonth}`);
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to load archived history.');
        setArchivedHistoryData(null);
        return;
      }

      setArchivedHistoryData(result as ArchivedCaseHistory);
      setStatusMessage(`Loaded archived history for ${archivedHistoryMonth}.`);
    } catch {
      setStatusMessage('Unable to connect to the server for archived history.');
      setArchivedHistoryData(null);
    } finally {
      setArchivedHistoryLoading(false);
    }
  };

  const loadArchiveAnalytics = async (clientIdValue?: string) => {
    const targetClientId = String(clientIdValue || archivedHistoryClientId || '').trim();
    if (!targetClientId) {
      setArchiveAnalyticsData(null);
      return;
    }

    setArchiveAnalyticsLoading(true);
    try {
      const response = await fetch(`/api/archive-analytics?client_id=${targetClientId}&months=6`);
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to load archive analytics.');
        return;
      }

      setArchiveAnalyticsData(result as ArchiveAnalyticsData);
    } catch {
      setStatusMessage('Unable to connect to the server for archive analytics.');
    } finally {
      setArchiveAnalyticsLoading(false);
    }
  };

  const purgeArchivedHistory = async () => {
    if (!archivedHistoryClientId || !archivedHistoryMonth) {
      setStatusMessage('Select a client and month before purging archived history.');
      return;
    }

    if (purgeConfirmText.trim() !== 'PURGE') {
      setStatusMessage('Type PURGE to confirm permanent deletion.');
      return;
    }

    if (!purgeReady) {
      setStatusMessage('Review the purge summary and click Confirm purge first.');
      return;
    }

    setPurgeArchivedLoading(true);
    try {
      const response = await fetch('/api/purge-archived-case-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: Number(archivedHistoryClientId),
          archive_month: archivedHistoryMonth,
          confirm_text: purgeConfirmText,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to purge archived history.');
        return;
      }

      setStatusMessage(result.message || `Purged archived ${archivedHistoryMonth} history.`);
      setPurgeConfirmText('');
      setPurgeReady(false);
      setArchivedHistoryData(null);
    } catch {
      setStatusMessage('Unable to connect to the server for purge.');
    } finally {
      setPurgeArchivedLoading(false);
    }
  };

  const getArchiveMonthRange = (monthValue?: string) => {
    if (!monthValue) {
      return null;
    }

    const [yearText, monthText] = monthValue.split('-');
    const year = Number(yearText);
    const monthIndex = Number(monthText) - 1;
    if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
      return null;
    }

    return {
      start: new Date(Date.UTC(year, monthIndex, 1)),
      end: new Date(Date.UTC(year, monthIndex + 1, 1)),
      label: `${yearText}-${monthText}`,
    };
  };

  const formatArchiveMonthLabel = (monthValue: string) => {
    const [yearText, monthText] = String(monthValue || '').split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return monthValue;
    }

    return new Date(Date.UTC(year, month - 1, 1)).toLocaleString(undefined, {
      month: 'short',
      year: 'numeric',
    });
  };

  const escapeCsvValue = (value: unknown) => {
    const text = String(value ?? '');
    if (text.includes(',') || text.includes('"') || text.includes('\n') || text.includes('\r')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const downloadCsvFile = (fileName: string, headers: string[], rows: Array<Array<unknown>>) => {
    const lines = [headers.map((entry) => escapeCsvValue(entry)).join(',')];
    rows.forEach((row) => {
      lines.push(row.map((entry) => escapeCsvValue(entry)).join(','));
    });

    const csvText = `${lines.join('\n')}\n`;
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.setAttribute('download', fileName);
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const downloadMonthlyDifferencesCsv = () => {
    if (!monthlySummary) {
      setStatusMessage('Load monthly differences before exporting CSV.');
      return;
    }

    const rows: Array<Array<unknown>> = [
      ['Metric', 'Value'],
      ['Month', monthlySummary.month],
      ['Planned', monthlySummary.totals.planned],
      ['Completed', monthlySummary.totals.completed],
      ['Rescheduled', monthlySummary.totals.rescheduled],
      ['Missed', monthlySummary.totals.missed],
      ['Reminders sent', monthlySummary.totals.reminders_sent],
      ['Short-term planned package visits', monthlySummary.short_term_package_utilization.totals.planned_visits],
      ['Short-term completed package visits', monthlySummary.short_term_package_utilization.totals.completed_visits],
      ['Short-term utilization %', monthlySummary.short_term_package_utilization.totals.utilization_percent],
      ['Long-term expected coverage days', monthlySummary.long_term_slot_utilization.totals.expected_coverage_days],
      ['Long-term recorded session days', monthlySummary.long_term_slot_utilization.totals.recorded_session_days],
      ['Long-term utilization %', monthlySummary.long_term_slot_utilization.totals.utilization_percent],
      [],
      ['Section', 'Entity', 'Planned', 'Completed', 'Missed', 'Rescheduled'],
      ...monthlySummary.by_mode.map((entry) => [
        'By mode',
        entry.mode,
        entry.planned,
        entry.completed,
        entry.missed,
        entry.rescheduled,
      ]),
      ...monthlySummary.by_buddy.map((entry) => [
        'By buddy',
        entry.name,
        entry.planned,
        entry.completed,
        entry.missed,
        entry.rescheduled,
      ]),
      ...monthlySummary.by_client.map((entry) => [
        'By client',
        entry.name,
        entry.planned,
        entry.completed,
        entry.missed,
        entry.rescheduled,
      ]),
      [],
      ['Status', 'Count'],
      ...monthlySummary.by_status.map((entry) => [entry.status, entry.count]),
    ];

    downloadCsvFile(
      `monthly_differences_${monthlySummary.month}.csv`,
      ['Column1', 'Column2', 'Column3', 'Column4', 'Column5', 'Column6'],
      rows,
    );
    setStatusMessage(`Downloaded monthly differences CSV for ${monthlySummary.month}.`);
  };

  const downloadCalendarDetailsCsv = () => {
    if (!monthlyCalendar) {
      setStatusMessage('Load monthly calendar before exporting CSV.');
      return;
    }

    const dayRows: Array<Array<unknown>> = [];
    monthlyCalendar.days.forEach((day) => {
      if (day.visits.length === 0 && day.long_term_coverage.length === 0) {
        dayRows.push([day.date, 'none', '', '', '', '', '', '']);
      }

      day.visits.forEach((visit) => {
        dayRows.push([
          day.date,
          'visit',
          visit.mode,
          visit.visit_status,
          visit.buddy_name,
          visit.client_name,
          visit.elderly_name,
          visit.assignment_id || '',
        ]);
      });

      day.long_term_coverage.forEach((coverage) => {
        dayRows.push([
          day.date,
          'long_term_coverage',
          'long_term',
          coverage.coverage_status,
          coverage.buddy_name,
          coverage.client_name,
          coverage.elderly_name,
          coverage.assignment_id,
        ]);
      });
    });

    downloadCsvFile(
      `calendar_day_details_${monthlyCalendar.month}.csv`,
      ['date', 'entry_type', 'mode', 'status', 'buddy_name', 'client_name', 'elderly_name', 'assignment_id'],
      dayRows,
    );
    setStatusMessage(`Downloaded calendar day details CSV for ${monthlyCalendar.month}.`);
  };

  const downloadCalendarHeatmapCsv = () => {
    if (!monthlyCalendar) {
      setStatusMessage('Load monthly calendar before exporting heatmap CSV.');
      return;
    }

    const heatmapRows: Array<Array<unknown>> = monthlyCalendar.days.map((day) => {
      const plannedVisits = day.visits.filter((entry) => entry.visit_status !== 'cancelled').length;
      const completedVisits = day.visits.filter((entry) => entry.visit_status === 'completed').length;
      const missedVisits = day.visits.filter((entry) => entry.visit_status === 'missed').length;
      const expectedLongTermCoverage = day.long_term_coverage.length;
      const coveredLongTermCoverage = day.long_term_coverage.filter((entry) => entry.coverage_status === 'covered').length;
      const pendingLongTermCoverage = day.long_term_coverage.filter((entry) => entry.coverage_status === 'pending').length;

      const shortCompletionRate = plannedVisits > 0
        ? Math.round((completedVisits / plannedVisits) * 100)
        : 0;
      const longCoverageRate = expectedLongTermCoverage > 0
        ? Math.round((coveredLongTermCoverage / expectedLongTermCoverage) * 100)
        : 0;

      return [
        day.date,
        plannedVisits,
        completedVisits,
        missedVisits,
        shortCompletionRate,
        expectedLongTermCoverage,
        coveredLongTermCoverage,
        pendingLongTermCoverage,
        longCoverageRate,
      ];
    });

    downloadCsvFile(
      `calendar_heatmap_${monthlyCalendar.month}.csv`,
      [
        'date',
        'short_planned_visits',
        'short_completed_visits',
        'short_missed_visits',
        'short_completion_percent',
        'long_expected_coverage_slots',
        'long_covered_slots',
        'long_pending_slots',
        'long_coverage_percent',
      ],
      heatmapRows,
    );
    setStatusMessage(`Downloaded calendar heatmap CSV for ${monthlyCalendar.month}.`);
  };

  const isDateWithinArchiveMonth = (value: string | null | undefined, monthValue?: string) => {
    const range = getArchiveMonthRange(monthValue);
    if (!range || !value) {
      return !monthValue;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return false;
    }

    return parsed >= range.start && parsed < range.end;
  };

  const downloadClientCaseHistory = async (client: User, monthValue?: string) => {
    const clientElderlyMembers = elderlyMembers.filter((entry) => entry.client_id === client.id);
    const elderlyIds = clientElderlyMembers.map((entry) => entry.id);
    const clientAssignments = assignments.filter((entry) => {
      if (!elderlyIds.includes(entry.elderly_id)) {
        return false;
      }

      if (!monthValue) {
        return true;
      }

      return Boolean(entry.end_date) && isDateWithinArchiveMonth(entry.end_date, monthValue);
    });
    const clientVisits = visits.filter((entry) => elderlyIds.includes(entry.elderly_id) && isDateWithinArchiveMonth(entry.scheduled_date, monthValue));
    const visitIds = clientVisits.map((entry) => entry.id);
    const clientTasks = tasks.filter((entry) => visitIds.includes(entry.visit_id));
    const clientRequests = requests.filter((entry) => entry.user_id === client.id && isDateWithinArchiveMonth(entry.timestamp, monthValue));
    const clientContacts = clientContactsByClient[client.id] || [];
    const contactAuditEntries = (clientContactAuditByClient[client.id] || []).filter((entry) => isDateWithinArchiveMonth(entry.created_at, monthValue));
    const assignmentAuditEntries = clientAssignments
      .flatMap((entry) => assignmentAuditsByAssignment[entry.id] || [])
      .filter((entry) => isDateWithinArchiveMonth(entry.created_at, monthValue));
    const notificationEntries = (notificationLogsByClient[client.id] || []).filter((entry) => isDateWithinArchiveMonth(entry.created_at, monthValue));
    const hasActiveVisitToday = clientHasActiveVisitToday(client.id);
    const primaryFamilyContact = clientContacts.find((entry) => entry.is_primary);
    const archiveRange = getArchiveMonthRange(monthValue);

    setStatusMessage(`Preparing ${archiveRange ? `${archiveRange.label} ` : ''}case history for ${client.name}...`);
    const XLSX = await import('xlsx');

    const workbook = XLSX.utils.book_new();

    const appendSheet = (sheetName: string, rows: Array<Record<string, unknown>>) => {
      const safeRows = rows.length > 0 ? rows : [{ info: 'No records available' }];
      const sheet = XLSX.utils.json_to_sheet(safeRows);
      XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
    };

    appendSheet('Client Summary', [
      {
        client_name: client.name,
        client_user_id: client.user_id || '',
        client_email: client.email,
        client_phone: client.phone || '',
        client_address: client.address || '',
        has_active_visit_today: hasActiveVisitToday ? 'Yes' : 'No',
        export_scope: archiveRange ? `Month ${archiveRange.label}` : 'Full history',
        primary_family_contact: primaryFamilyContact?.contact_name || '',
        primary_family_phone: primaryFamilyContact?.phone || '',
        exported_at: new Date().toLocaleString(),
      },
    ]);

    appendSheet('Elderly Profiles', clientElderlyMembers.map((entry) => ({
      id: entry.id,
      full_name: entry.full_name,
      age: entry.age,
      address: entry.address,
      email: entry.email,
    })));

    appendSheet('Family Contacts', clientContacts.map((entry) => ({
      id: entry.id,
      contact_name: entry.contact_name,
      relation_label: entry.relation_label,
      phone: entry.phone,
      whatsapp_opt_in: entry.whatsapp_opt_in ? 'Yes' : 'No',
      is_primary: entry.is_primary ? 'Yes' : 'No',
    })));

    appendSheet('Contact Audit', contactAuditEntries.map((entry) => ({
      action: getAuditActionLabel(entry.action_type),
      contact_name: entry.contact_name,
      relation_label: entry.relation_label,
      phone: entry.phone,
      actor: entry.actor_name,
      is_primary: entry.is_primary ? 'Yes' : 'No',
      created_at: new Date(entry.created_at).toLocaleString(),
    })));

    appendSheet('Assignment Lifecycle', assignmentAuditEntries.map((entry) => ({
      assignment_id: entry.assignment_id,
      from_status: entry.from_status || '',
      to_status: entry.to_status,
      actor: entry.actor_name,
      notes: entry.notes || '',
      created_at: new Date(entry.created_at).toLocaleString(),
      buddy_name: entry.buddy_name || '',
      elderly_name: entry.elderly_name || '',
    })));

    appendSheet('Notifications', notificationEntries.map((entry) => ({
      channel: entry.channel,
      template: entry.template_key,
      recipient_role: entry.recipient_role,
      recipient_name: entry.recipient_name,
      recipient_phone: entry.recipient_phone,
      actor: entry.actor_name,
      message_preview: entry.message_preview,
      created_at: new Date(entry.created_at).toLocaleString(),
    })));

    appendSheet('Assignments', clientAssignments.map((entry) => ({
      id: entry.id,
      buddy_name: entry.buddy_name,
      elderly_name: entry.elderly_name,
      status: entry.status,
      term_type: entry.term_type || '',
      service_plan_type: entry.service_plan_type || '',
      approval_state: entry.approval_state || '',
      care_shift: entry.care_shift || '',
      monthly_visit_plan: entry.monthly_visit_plan || '',
      planned_visit_duration_minutes: entry.planned_visit_duration_minutes || '',
      services: (entry.services || []).map((service) => service.service_name).join(', '),
      admin_notes: entry.admin_notes || '',
      end_date: entry.end_date || '',
    })));

    appendSheet('Visits', clientVisits.map((entry) => ({
      id: entry.id,
      scheduled_date: entry.scheduled_date,
      visit_status: entry.visit_status || 'scheduled',
      buddy_name: entry.buddy_name,
      client_name: entry.client_name,
      arrival_time: entry.arrival_time || '',
      departure_time: entry.departure_time || '',
      status_check: entry.status_check || '',
      buddy_notes: entry.buddy_notes || '',
      client_visible_notes: entry.client_visible_notes || '',
      address: entry.address || '',
    })));

    appendSheet('Tasks', clientTasks.map((entry) => ({
      id: entry.id,
      visit_id: entry.visit_id,
      task_name: entry.task_name,
      status: entry.status,
      measured_value: entry.measured_value || '',
      buddy_remarks: entry.buddy_remarks || '',
      buddy_name: entry.buddy_name,
      client_name: entry.client_name,
      updated_at: entry.updated_at || '',
    })));

    appendSheet('Requests', clientRequests.map((entry) => ({
      timestamp: entry.timestamp,
      request_type: entry.request_type,
      message: entry.message,
      user_name: entry.user_name || '',
    })));

    const fileName = `${client.name.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_${archiveRange ? `${archiveRange.label}_` : ''}case_history.xlsx`;
    XLSX.writeFile(workbook, fileName);
    setStatusMessage(`Downloaded ${archiveRange ? `${archiveRange.label} ` : ''}case history for ${client.name}.`);
  };

  const handleArchiveClientMonth = async (client: User) => {
    if (!archiveMonth) {
      setStatusMessage('Select a month before exporting and archiving.');
      return;
    }

    await downloadClientCaseHistory(client, archiveMonth);

    try {
      const response = await fetch('/api/archive-case-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: client.id, archive_month: archiveMonth }),
      });
      const result = await response.json();
      if (!response.ok) {
        setStatusMessage(result.message || 'Unable to archive the selected month.');
        return;
      }

      setStatusMessage(result.message || `Archived ${archiveMonth} history for ${client.name}.`);
      await loadDashboard();
    } catch {
      setStatusMessage('Unable to connect to the server for archiving.');
    }
  };

  const createUserCard = (item: User) => {
    const hasActiveVisitToday = item.role === 'client' ? clientHasActiveVisitToday(item.id) : false;
    const clientCardCategory = item.role === 'client' ? getClientDirectoryCardCategory(item.id) : 'default';
    const clientCardTag = item.role === 'client' ? getClientDirectoryCardTag(item.id) : null;
    const primaryFamilyContact = item.role === 'client'
      ? (clientContactsByClient[item.id] || []).find((entry) => entry.is_primary)
      : null;
    const selectedTemplate = item.role === 'client' ? getNotificationTemplateForClient(item.id) : 'auto';
    const customTemplateMessage = item.role === 'client' ? getCustomNotificationMessageForClient(item.id) : '';
    const standardTemplateOptions = notificationTemplateOptions.filter((template) => template.value !== 'custom');
    const customTemplateOption = notificationTemplateOptions.find((template) => template.value === 'custom');
    const notificationPreview = item.role === 'client'
      ? buildNotificationMessage(item.name, {
          hasActiveVisitToday,
          recipientName: item.name,
          recipientRole: 'client',
          templateKey: selectedTemplate,
          customMessage: customTemplateMessage,
        })
      : '';

    return (
    <div className={`mini-card ${item.role === 'client' ? `assignment-card assignment-card-${clientCardCategory}` : ''}`} key={item.id}>
      {item.role === 'client' && clientCardTag ? <div className={clientCardTag.className}>{clientCardTag.label}</div> : null}
      <div className="name">{item.name}</div>
      <div className="directory-badges">
        <span className="pill status-neutral">{item.role}</span>
        {item.phone ? (
          <span className="pill badge-upcoming icon-chip">
            <span className="icon-chip-symbol" aria-hidden="true">
              ☎
            </span>
            {item.phone}
          </span>
        ) : null}
      </div>
      <div className="status">{item.email}</div>
      {item.address ? <div className="directory-detail">{item.address}</div> : null}
      {item.role === 'client' ? (
        <div className="client-summary-row client-summary-panel">
          <div className="client-summary-meta">
            {hasActiveVisitToday ? (
              <span className="chip icon-chip status-chip status-chip-live">
                <span className="icon-chip-symbol" aria-hidden="true">
                  ●
                </span>
                Visit today
              </span>
            ) : null}
            <span className="chip icon-chip">
              <span className="icon-chip-symbol" aria-hidden="true">
                👥
              </span>
              {(clientContactsByClient[item.id] || []).length} family contacts
            </span>
            {primaryFamilyContact ? (
              <span className="chip icon-chip status-chip status-chip-primary">
                <span className="icon-chip-symbol" aria-hidden="true">
                  ★
                </span>
                Primary set
              </span>
            ) : null}
            {(clientContactAuditByClient[item.id] || []).length > 0 ? (
              <span className="chip icon-chip">
                <span className="icon-chip-symbol" aria-hidden="true">
                  ↺
                </span>
                {Math.min((clientContactAuditByClient[item.id] || []).length, 5)} recent changes
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className={`chip chip-button client-summary-toggle ${expandedClientId === item.id ? 'is-open' : ''}`}
            onClick={() => toggleClientDetails(item.id)}
            aria-expanded={expandedClientId === item.id}
          >
            <span className="client-summary-toggle-icon" aria-hidden="true">
              ▾
            </span>
            {expandedClientId === item.id ? 'Hide details' : 'Show details'}
          </button>
        </div>
      ) : null}
      {item.role === 'client' ? (
        <div className="client-action-groups">
          <div className="directory-actions directory-actions-primary">
            {hasActiveVisitToday ? (
              <button
                type="button"
                className="btn btn-primary directory-action"
                onClick={() => {
                  setSelectedVisitClientId(String(item.id));
                  setAdminTab('visits');
                  setStatusMessage(`Showing today's visits for ${item.name}.`);
                }}
              >
                View today's visit
              </button>
            ) : null}
            {item.phone ? (
              <button
                type="button"
                className={`btn ${hasActiveVisitToday ? 'btn-secondary' : 'btn-primary'} directory-action`}
                onClick={() =>
                  notifyPhone(item.id, item.phone || '', item.name, true, {
                    hasActiveVisitToday,
                    recipientName: item.name,
                    recipientRole: 'client',
                    templateKey: selectedTemplate,
                    customMessage: customTemplateMessage,
                  })
                }
              >
                Notify client
              </button>
            ) : null}
            {item.phone ? (
              <button
                type="button"
                className="btn btn-secondary directory-action"
                onClick={() => {
                  const messagePreview = buildNotificationMessage(item.name, {
                    hasActiveVisitToday,
                    recipientName: item.name,
                    recipientRole: 'client',
                    templateKey: selectedTemplate,
                    customMessage: customTemplateMessage,
                  });
                  void logNotificationAction({
                    clientId: item.id,
                    recipientRole: 'client',
                    recipientName: item.name,
                    recipientPhone: item.phone || '',
                    channel: 'whatsapp',
                    templateKey: selectedTemplate,
                    messagePreview,
                  });
                  openWhatsAppNotification(item.phone || '', item.name, {
                    hasActiveVisitToday,
                    recipientName: item.name,
                    recipientRole: 'client',
                    templateKey: selectedTemplate,
                    customMessage: customTemplateMessage,
                  });
                }}
              >
                WhatsApp client
              </button>
            ) : null}
            {item.phone ? (
              <button
                type="button"
                className="btn btn-secondary directory-action"
                onClick={() => {
                  void logNotificationAction({
                    clientId: item.id,
                    recipientRole: 'client',
                    recipientName: item.name,
                    recipientPhone: item.phone || '',
                    channel: 'call',
                    templateKey: selectedTemplate,
                    messagePreview: '',
                  });
                  openContactHref(`tel:${item.phone}`);
                }}
              >
                Call client
              </button>
            ) : null}
            {item.phone ? (
              <button
                type="button"
                className="btn btn-secondary directory-action"
                onClick={() => {
                  const messagePreview = buildNotificationMessage(item.name, {
                    hasActiveVisitToday,
                    recipientName: item.name,
                    recipientRole: 'client',
                    templateKey: selectedTemplate,
                    customMessage: customTemplateMessage,
                  });
                  void logNotificationAction({
                    clientId: item.id,
                    recipientRole: 'client',
                    recipientName: item.name,
                    recipientPhone: item.phone || '',
                    channel: 'sms',
                    templateKey: selectedTemplate,
                    messagePreview,
                  });
                  openSmsNotification(item.phone || '', item.name, {
                    hasActiveVisitToday,
                    recipientName: item.name,
                    recipientRole: 'client',
                    templateKey: selectedTemplate,
                    customMessage: customTemplateMessage,
                  });
                }}
              >
                SMS client
              </button>
            ) : null}
          </div>
          <div className="directory-actions directory-actions-secondary">
            {selectedTemplate === 'custom' ? (
              <div className="notification-template-editor-wrap">
                <textarea
                  className="small-input notification-template-editor"
                  value={customTemplateMessage}
                  onChange={(event) =>
                    setCustomNotificationMessageByClient((current) => ({
                      ...current,
                      [item.id]: event.target.value,
                    }))
                  }
                  placeholder="Custom message. You can use {client} and {recipient}."
                  rows={3}
                />
                <button
                  type="button"
                  className="btn btn-secondary directory-action"
                  onClick={() =>
                    setCustomNotificationMessageByClient((current) => {
                      const next = { ...current };
                      delete next[item.id];
                      return next;
                    })
                  }
                >
                  Reset to default
                </button>
              </div>
            ) : null}
            <div className="notification-preview">
              <div className="family-title">Message preview</div>
              <div className="notification-template-groups">
                <div>
                  <div className="notification-template-group-label">Standard</div>
                  <div className="notification-template-group-note">Common updates for visits, tasks, and routine follow-ups.</div>
                  <div className="notification-template-chips">
                    {standardTemplateOptions.map((template) => (
                      <button
                        key={template.value}
                        type="button"
                        className={`chip chip-button notification-template-chip ${selectedTemplate === template.value ? 'is-active' : ''}`}
                        onClick={() =>
                          setNotificationTemplateByClient((current) => ({
                            ...current,
                            [item.id]: template.value,
                          }))
                        }
                      >
                        {template.label}
                      </button>
                    ))}
                  </div>
                </div>
                {customTemplateOption ? (
                  <div>
                    <div className="notification-template-group-label">Custom</div>
                    <div className="notification-template-group-note">Team-specific message using your own wording and placeholders.</div>
                    <div className="notification-template-chips">
                      <button
                        type="button"
                        className={`chip chip-button notification-template-chip ${selectedTemplate === customTemplateOption.value ? 'is-active' : ''}`}
                        onClick={() =>
                          setNotificationTemplateByClient((current) => ({
                            ...current,
                            [item.id]: customTemplateOption.value,
                          }))
                        }
                      >
                        {customTemplateOption.label}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="notification-preview-text">{notificationPreview}</div>
            </div>
            {item.phone ? (
              <button
                type="button"
                className="btn btn-secondary directory-action"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(item.phone || '');
                    setStatusMessage(`Copied ${item.name}'s phone number.`);
                  } catch {
                    setStatusMessage('Unable to copy phone number.');
                  }
                }}
              >
                Copy phone
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary directory-action"
              onClick={() => {
                setSelectedVisitClientId(String(item.id));
                setAdminTab('visits');
                setStatusMessage(`Showing visits for ${item.name}.`);
              }}
            >
              {hasActiveVisitToday ? 'All visits' : 'View visits'}
            </button>
            {(clientContactAuditByClient[item.id] || []).length > 0 ? (
              <button type="button" className="btn btn-secondary directory-action" onClick={() => openClientAudit(item.id)}>
                View audit
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary directory-action"
              onClick={() => void handleDeleteUser(item)}
            >
              Delete client
            </button>
          </div>
        </div>
      ) : (
        <div className="directory-actions">
          {item.phone ? (
            <button
              type="button"
              className="btn btn-secondary directory-action"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(item.phone || '');
                  setStatusMessage(`Copied ${item.name}'s phone number.`);
                } catch {
                  setStatusMessage('Unable to copy phone number.');
                }
              }}
            >
              Copy phone
            </button>
          ) : null}
          {item.role === 'buddy' ? (
            <button
              type="button"
              className="btn btn-secondary directory-action"
              onClick={() => {
                setSelectedAssignmentBuddyId(String(item.id));
                setAdminTab('assignments');
                setStatusMessage(`Showing assignments for ${item.name}.`);
              }}
            >
              View assignments
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-secondary directory-action"
            onClick={() => void handleDeleteUser(item)}
          >
            Delete {item.role}
          </button>
        </div>
      )}
      {item.role === 'client' && expandedClientId === item.id ? (
        <div className="family-contacts family-contacts-open">
          <div className="family-title">Family contacts</div>
          {(clientContactsByClient[item.id] || []).length === 0 ? <div className="status family-empty">No family contacts added yet.</div> : null}
          {(clientContactsByClient[item.id] || []).map((entry) => (
            <div className="family-row" key={entry.id}>
              <div className="family-row-content">
                <div>
                  <strong>{entry.contact_name || 'Family member'}</strong>
                  <div className="status">{entry.relation_label || 'Relation not set'} • {entry.phone}</div>
                </div>
                <div className="directory-badges family-badges">
                  {entry.is_primary ? <span className="pill badge-active">Primary</span> : null}
                  {entry.whatsapp_opt_in ? <span className="pill badge-upcoming">WhatsApp OK</span> : <span className="pill badge-inactive">No WhatsApp</span>}
                </div>
                <div className="family-row-actions">
                  <button
                    type="button"
                    className="chip chip-button"
                    onClick={() =>
                      notifyPhone(item.id, entry.phone, item.name, entry.whatsapp_opt_in, {
                        hasActiveVisitToday,
                        recipientName: entry.contact_name || 'family contact',
                        recipientRole: 'family',
                        templateKey: selectedTemplate,
                        customMessage: customTemplateMessage,
                        familyContactId: entry.id,
                      })
                    }
                  >
                    Notify
                  </button>
                  <button
                    type="button"
                    className="chip chip-button"
                    onClick={() => {
                      void logNotificationAction({
                        clientId: item.id,
                        familyContactId: entry.id,
                        recipientRole: 'family',
                        recipientName: entry.contact_name || 'family contact',
                        recipientPhone: entry.phone,
                        channel: 'call',
                        templateKey: selectedTemplate,
                        messagePreview: '',
                      });
                      openContactHref(`tel:${entry.phone}`);
                    }}
                  >
                    Call
                  </button>
                  {entry.whatsapp_opt_in ? (
                    <button
                      type="button"
                      className="chip chip-button"
                      onClick={() => {
                        const messagePreview = buildNotificationMessage(item.name, {
                          hasActiveVisitToday,
                          recipientName: entry.contact_name || 'family contact',
                          recipientRole: 'family',
                          templateKey: selectedTemplate,
                          customMessage: customTemplateMessage,
                        });
                        void logNotificationAction({
                          clientId: item.id,
                          familyContactId: entry.id,
                          recipientRole: 'family',
                          recipientName: entry.contact_name || 'family contact',
                          recipientPhone: entry.phone,
                          channel: 'whatsapp',
                          templateKey: selectedTemplate,
                          messagePreview,
                        });
                        openWhatsAppNotification(entry.phone, item.name, {
                          hasActiveVisitToday,
                          recipientName: entry.contact_name || 'family contact',
                          recipientRole: 'family',
                          templateKey: selectedTemplate,
                          customMessage: customTemplateMessage,
                        });
                      }}
                    >
                      WhatsApp
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="chip chip-button"
                    onClick={() => {
                      const messagePreview = buildNotificationMessage(item.name, {
                        hasActiveVisitToday,
                        recipientName: entry.contact_name || 'family contact',
                        recipientRole: 'family',
                        templateKey: selectedTemplate,
                        customMessage: customTemplateMessage,
                      });
                      void logNotificationAction({
                        clientId: item.id,
                        familyContactId: entry.id,
                        recipientRole: 'family',
                        recipientName: entry.contact_name || 'family contact',
                        recipientPhone: entry.phone,
                        channel: 'sms',
                        templateKey: selectedTemplate,
                        messagePreview,
                      });
                      openSmsNotification(entry.phone, item.name, {
                        hasActiveVisitToday,
                        recipientName: entry.contact_name || 'family contact',
                        recipientRole: 'family',
                        templateKey: selectedTemplate,
                        customMessage: customTemplateMessage,
                      });
                    }}
                  >
                    SMS
                  </button>
                  <button type="button" className="chip chip-button" onClick={() => startEditingFamilyContact(entry)}>
                    Edit
                  </button>
                  <button type="button" className="chip chip-button" onClick={() => handleDeleteFamilyContact(item.id, entry.id)}>
                    Remove
                  </button>
                </div>
                {editingContacts[entry.id] ? (
                  <div className="family-form family-edit-grid">
                    <input
                      className="small-input"
                      placeholder="Name"
                      value={getEditingContactDraft(entry).contact_name}
                      onChange={(event) => updateEditingContactDraft(entry.id, 'contact_name', event.target.value, entry)}
                    />
                    <input
                      className="small-input"
                      placeholder="Relation"
                      value={getEditingContactDraft(entry).relation_label}
                      onChange={(event) => updateEditingContactDraft(entry.id, 'relation_label', event.target.value, entry)}
                    />
                    <input
                      className="small-input"
                      placeholder="Phone"
                      value={getEditingContactDraft(entry).phone}
                      onChange={(event) => updateEditingContactDraft(entry.id, 'phone', event.target.value, entry)}
                    />
                    <label className="family-checkbox">
                      <input
                        type="checkbox"
                        checked={getEditingContactDraft(entry).whatsapp_opt_in}
                        onChange={(event) => updateEditingContactDraft(entry.id, 'whatsapp_opt_in', event.target.checked, entry)}
                      />
                      WhatsApp opt-in
                    </label>
                    <label className="family-checkbox">
                      <input
                        type="checkbox"
                        checked={getEditingContactDraft(entry).is_primary}
                        onChange={(event) => updateEditingContactDraft(entry.id, 'is_primary', event.target.checked, entry)}
                      />
                      Primary contact
                    </label>
                    <div className="family-row-actions">
                      <button type="button" className="btn btn-secondary directory-action" onClick={() => handleUpdateFamilyContact(item.id, entry)}>
                        Save contact
                      </button>
                      <button type="button" className="btn btn-secondary directory-action" onClick={() => cancelEditingFamilyContact(entry.id)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          <div className="family-form">
            <input
              className="small-input"
              placeholder="Name"
              value={getContactDraft(item.id).contact_name}
              onChange={(event) => updateContactDraft(item.id, 'contact_name', event.target.value)}
            />
            <input
              className="small-input"
              placeholder="Relation"
              value={getContactDraft(item.id).relation_label}
              onChange={(event) => updateContactDraft(item.id, 'relation_label', event.target.value)}
            />
            <input
              className="small-input"
              placeholder="Phone"
              value={getContactDraft(item.id).phone}
              onChange={(event) => updateContactDraft(item.id, 'phone', event.target.value)}
            />
            <label className="family-checkbox">
              <input
                type="checkbox"
                checked={getContactDraft(item.id).whatsapp_opt_in}
                onChange={(event) => updateContactDraft(item.id, 'whatsapp_opt_in', event.target.checked)}
              />
              WhatsApp opt-in
            </label>
            <label className="family-checkbox">
              <input
                type="checkbox"
                checked={getContactDraft(item.id).is_primary}
                onChange={(event) => updateContactDraft(item.id, 'is_primary', event.target.checked)}
              />
              Primary contact
            </label>
            <button type="button" className="btn btn-secondary directory-action" onClick={() => handleAddFamilyContact(item.id)}>
              Add family contact
            </button>
          </div>
        </div>
      ) : null}
    </div>
    );
  };

  const renderAssignmentDetailsOverlay = () => {
    if (assignmentDetailsId === null) {
      return null;
    }

    const assignment = safeAssignments.find((entry) => entry.id === assignmentDetailsId);
    if (!assignment) {
      return null;
    }

    const slotDraftRows = getAssignmentSlotDrafts(assignment);
    const servicePlanType = assignmentEdits[assignment.id]?.service_plan_type || assignment.service_plan_type || 'short_term';
    const assignmentVisits = visits
      .filter((entry) => Number(entry.assignment_id) === Number(assignment.id))
      .sort((left, right) => String(left.scheduled_date || '').localeCompare(String(right.scheduled_date || '')));
    const assignmentApprovalHistory = [...(assignmentAuditsByAssignment[assignment.id] || [])]
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
      .slice(0, 30);
    const assignmentSessionHistorySource = (dailyRecordsByAssignment[assignment.id] || []).length > 0
      ? (dailyRecordsByAssignment[assignment.id] || [])
      : visitSessionHistory.filter((entry) => Number(entry.assignment_id) === Number(assignment.id));
    const assignmentSessionHistory = [...assignmentSessionHistorySource]
      .sort((left, right) => {
        const leftTime = new Date(left.updated_at || left.created_at || left.session_date).getTime();
        const rightTime = new Date(right.updated_at || right.created_at || right.session_date).getTime();
        return rightTime - leftTime;
      })
      .slice(0, 30);

    return (
      <div className="overlay-backdrop" role="presentation" onClick={closeAssignmentDetails}>
        <div
          className="overlay-panel assignment-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Assignment details"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="overlay-header">
            <div>
              <div className="family-title">Assignment details</div>
              <h3 className="overlay-title">{assignment.buddy_name || 'Caretaker'} → {assignment.elderly_name || 'Client'}</h3>
              <div className="status">{getAssignmentPlanSummary(assignment)}</div>
            </div>
            <div className="overlay-actions">
              <button type="button" className="btn btn-secondary directory-action" onClick={() => void handleAssignmentUpdate(assignment.id)}>
                Save basic details
              </button>
              <button type="button" className="btn btn-secondary directory-action" onClick={closeAssignmentDetails}>
                Close
              </button>
            </div>
          </div>

          <div className="family-form">
            <label>
              Status
              <select className="small-input" value={assignmentEdits[assignment.id]?.status || assignment.status} onChange={(event) => handleAssignmentEditChange(assignment.id, 'status', event.target.value)}>
                <option value="active">active</option>
                <option value="paused">paused</option>
                <option value="completed">completed</option>
                <option value="cancelled">cancelled</option>
              </select>
            </label>
            <label>
              Approval
              <select className="small-input" value={assignmentEdits[assignment.id]?.approval_state || assignment.approval_state || 'pending_approval'} onChange={(event) => handleAssignmentEditChange(assignment.id, 'approval_state', event.target.value)}>
                <option value="approved">approved</option>
                <option value="pending_approval">pending approval</option>
              </select>
            </label>
            <label>
              Plan
              <select className="small-input" value={servicePlanType} onChange={(event) => handleAssignmentEditChange(assignment.id, 'service_plan_type', event.target.value)}>
                <option value="short_term">short term</option>
                <option value="long_term">long term</option>
              </select>
            </label>
            <label>
              Admin notes
              <input
                className="small-input"
                value={assignmentEdits[assignment.id]?.admin_notes || ''}
                onChange={(event) => handleAssignmentEditChange(assignment.id, 'admin_notes', event.target.value)}
                placeholder={assignment.address || 'Add note'}
              />
            </label>
            <label>
              Client latitude
              <input
                className="small-input"
                type="number"
                step="0.000001"
                value={assignmentClientCoordinateByAssignment[assignment.id]?.lat || ''}
                onChange={(event) => setAssignmentClientCoordinateByAssignment((current) => ({
                  ...current,
                  [assignment.id]: {
                    lat: event.target.value,
                    lng: current[assignment.id]?.lng || '',
                  },
                }))}
                placeholder="e.g. 12.905620"
              />
            </label>
            <label>
              Client longitude
              <input
                className="small-input"
                type="number"
                step="0.000001"
                value={assignmentClientCoordinateByAssignment[assignment.id]?.lng || ''}
                onChange={(event) => setAssignmentClientCoordinateByAssignment((current) => ({
                  ...current,
                  [assignment.id]: {
                    lat: current[assignment.id]?.lat || '',
                    lng: event.target.value,
                  },
                }))}
                placeholder="e.g. 77.599040"
              />
            </label>
          </div>

          {!isLongTermAssignment(assignment) ? (
            <>
              <div className="assignment-slot-editor">
                <div className="family-title">Short-term visit slots</div>
                <div className="directory-meta">Package count: {assignment.monthly_visit_plan || 0} visits/month.</div>
                <div className="assignment-slot-list">
                  {slotDraftRows.map((slot, slotIndex) => (
                    <div className="assignment-slot-row" key={`assignment-slot-${assignment.id}-${slotIndex}`}>
                      <label>
                        Visit date
                        <input
                          className="small-input"
                          type="date"
                          value={slot.visit_date}
                          onChange={(event) => handleAssignmentSlotDraftChange(assignment.id, slotIndex, 'visit_date', event.target.value)}
                        />
                      </label>
                      <label>
                        Start time
                        <input
                          className="small-input"
                          type="time"
                          value={slot.start_time}
                          onChange={(event) => handleAssignmentSlotDraftChange(assignment.id, slotIndex, 'start_time', event.target.value)}
                        />
                      </label>
                      <button type="button" className="btn btn-secondary" onClick={() => handleRemoveAssignmentSlotDraft(assignment, slotIndex)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <div className="directory-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => handleAddAssignmentSlotDraft(assignment)}>
                    Add extra visit row
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => void handleSaveAssignmentSlots(assignment)}>
                    Save slot changes
                  </button>
                </div>
              </div>
              <div className="family-audit-list">
                <div className="family-title">All scheduled visits (including backfilled)</div>
                {assignmentVisits.length === 0 ? (
                  <div className="directory-meta">No visits scheduled yet for this assignment.</div>
                ) : (
                  <div className="assignment-slot-list">
                    {assignmentVisits.map((visit) => {
                      const isFutureVisit = String(visit.scheduled_date || '') > new Date().toISOString().slice(0, 10);
                      const visitAssignDraft = assignmentVisitAssignDraftsByVisit[visit.id] || {
                        scheduled_date: visit.scheduled_date,
                        start_time: '09:00',
                      };
                      return (
                        <div key={`details-short-visit-${assignment.id}-${visit.id}`} className="assignment-slot-row">
                          <label>
                            Visit date
                            <input
                              className="small-input"
                              type="date"
                              value={visitAssignDraft.scheduled_date}
                              onChange={(event) => setAssignmentVisitAssignDraftsByVisit((current) => ({
                                ...current,
                                [visit.id]: {
                                  ...visitAssignDraft,
                                  scheduled_date: event.target.value,
                                },
                              }))}
                            />
                          </label>
                          <label>
                            Start time
                            <input
                              className="small-input"
                              type="time"
                              value={visitAssignDraft.start_time}
                              onChange={(event) => setAssignmentVisitAssignDraftsByVisit((current) => ({
                                ...current,
                                [visit.id]: {
                                  ...visitAssignDraft,
                                  start_time: event.target.value,
                                },
                              }))}
                            />
                          </label>
                          <button type="button" className="btn btn-primary" onClick={() => void handleAssignVisitToSameBuddy(assignment, visit)}>
                            Assign
                          </button>
                          {isFutureVisit && (
                            <button type="button" className="btn btn-secondary" onClick={() => void handleReassignVisitBuddy(visit)}>
                              Reassign buddy
                            </button>
                          )}
                          <div className="directory-meta">{visit.visit_status || 'scheduled'} • Arrival: {visit.arrival_time || 'Not marked'} • Departure: {visit.departure_time || 'Not marked'}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="assignment-slot-editor">
              <div className="family-title">Long-term details and replacement</div>
              <div className="archive-purge-summary">
                <div className="status">Current caretaker: {assignment.buddy_name || 'Unassigned'}</div>
                <div className="status">Client: {assignment.elderly_name || 'Unknown client'}</div>
                <div className="status">Start date: {assignment.start_date || 'Not set'}</div>
                <div className="status">Planned end: {assignment.end_date || 'Not set'}</div>
                <div className="status">Extension end: {assignment.extension_end_date || 'Not set'}</div>
                <div className="status">Shift: {assignment.care_shift || 'Not set'}</div>
                <div className="status">Status: {assignment.status}</div>
                <div className="status">Approval: {assignment.approval_state || 'pending_approval'}</div>
              </div>
              <div className="family-audit-list">
                <div className="family-title">Scheduled visits snapshot</div>
                {assignmentVisits.length === 0 ? (
                  <div className="directory-meta">No visits scheduled yet for this assignment.</div>
                ) : (
                  assignmentVisits.map((visit) => {
                    const isFutureVisit = String(visit.scheduled_date || '') > new Date().toISOString().slice(0, 10);
                    return (
                      <div key={`details-long-visit-${assignment.id}-${visit.id}`} className="family-audit-item">
                        <div className="status">{visit.scheduled_date || 'No date'} • {visit.visit_status || 'scheduled'}</div>
                        <div className="meta">Arrival: {visit.arrival_time || 'Not marked'} • Departure: {visit.departure_time || 'Not marked'}</div>
                        {isFutureVisit && (
                          <button type="button" className="btn btn-secondary" onClick={() => void handleReassignVisitBuddy(visit)}>
                            Reassign buddy
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              <div className="family-form">
                <label>
                  Replace caretaker
                  <select
                    className="small-input"
                    value={assignmentReplacementBuddyByAssignment[assignment.id] || String(assignment.buddy_id || '')}
                    onChange={(event) => setAssignmentReplacementBuddyByAssignment((current) => ({ ...current, [assignment.id]: event.target.value }))}
                  >
                    <option value="">Select caretaker</option>
                    {buddies
                      .filter((buddy) => Number(buddy.id) === Number(assignment.buddy_id) || !activelyAssignedBuddyIds.has(Number(buddy.id)))
                      .map((buddy) => (
                        <option key={`details-switch-buddy-${assignment.id}-${buddy.id}`} value={buddy.id}>{buddy.name}</option>
                      ))}
                  </select>
                </label>
                <label>
                  Replacement reason
                  <input
                    className="small-input"
                    value={assignmentReplacementReasonByAssignment[assignment.id] || ''}
                    onChange={(event) => setAssignmentReplacementReasonByAssignment((current) => ({ ...current, [assignment.id]: event.target.value }))}
                    placeholder="Holiday/emergency reason"
                  />
                </label>
              </div>
              <div className="directory-actions">
                <button className="btn btn-primary" type="button" onClick={() => void handleAssignmentBuddySwitch(assignment)}>
                  Save replacement and notify client
                </button>
                <input
                  className="small-input"
                  type="date"
                  value={assignmentExtensionDates[assignment.id] || assignment.extension_end_date || assignment.end_date || ''}
                  onChange={(event) => setAssignmentExtensionDates((current) => ({ ...current, [assignment.id]: event.target.value }))}
                />
                <button className="btn btn-secondary" type="button" onClick={() => void handleAssignmentExtend(assignment.id)}>
                  Extend
                </button>
              </div>
            </div>
          )}

          <div className="assignment-history-section">
            <div className="family-title">Recent approval and session history</div>
            <div className="assignment-history-grid">
              <div>
                <div className="directory-meta">Approval timeline</div>
                <div className="assignment-history-scroll">
                  {assignmentApprovalHistory.length === 0 ? (
                    <div className="directory-meta">No approval activity recorded for this assignment.</div>
                  ) : (
                    assignmentApprovalHistory.map((entry) => (
                      <div key={`overlay-assignment-audit-${entry.id}`} className="family-audit-item">
                        <div className="status">{entry.from_status || 'none'} → {entry.to_status}</div>
                        <div className="meta">by {entry.actor_name} on {new Date(entry.created_at).toLocaleString()}</div>
                        {entry.notes ? <div className="note">{entry.notes}</div> : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div>
                <div className="directory-meta">Session timeline</div>
                <div className="assignment-history-scroll">
                  {assignmentSessionHistory.length === 0 ? (
                    <div className="directory-meta">No session history recorded for this assignment.</div>
                  ) : (
                    assignmentSessionHistory.map((entry) => (
                      <div key={`overlay-assignment-session-${entry.id}`} className="family-audit-item">
                        <div className="status">{entry.session_date || 'No date'}{entry.backfilled ? ' • backfilled' : ''}</div>
                        <div className="meta">In: {entry.intime ? new Date(entry.intime).toLocaleString() : 'Not marked'} • Out: {entry.outtime ? new Date(entry.outtime).toLocaleString() : 'Not marked'}</div>
                        {entry.entry_notes ? <div className="note">Entry: {entry.entry_notes}</div> : null}
                        {entry.exit_notes ? <div className="note">Exit: {entry.exit_notes}</div> : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderClientAuditOverlay = () => {
    if (auditClientId === null) {
      return null;
    }

    const auditClient = clients.find((item) => item.id === auditClientId);
    const auditEntries = clientContactAuditByClient[auditClientId] || [];
    const notificationEntries = notificationLogsByClient[auditClientId] || [];
    const showContactAudit = auditOverlayFilter === 'all' || auditOverlayFilter === 'contact';
    const showNotificationAudit = auditOverlayFilter === 'all' || auditOverlayFilter === 'notifications';

    return (
      <div className="overlay-backdrop" role="presentation" onClick={closeClientAudit}>
        <div
          className="overlay-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Client contact audit"
          ref={auditOverlayRef}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="overlay-header">
            <div>
              <div className="family-title">Client contact audit</div>
              <h3 className="overlay-title">{auditClient?.name || 'Client'}</h3>
              <div className="status">Press Esc to close</div>
            </div>
            <div className="overlay-actions">
              <input
                type="month"
                className="small-input archive-month-input"
                value={archiveMonth}
                onChange={(event) => setArchiveMonth(event.target.value)}
                aria-label="Archive month"
              />
              {auditClient ? (
                <>
                  <button type="button" className="btn btn-secondary directory-action" onClick={() => void downloadClientCaseHistory(auditClient)}>
                    Download full history
                  </button>
                  <button type="button" className="btn btn-secondary directory-action" onClick={() => void downloadClientCaseHistory(auditClient, archiveMonth)}>
                    Download month
                  </button>
                  <button type="button" className="btn btn-primary directory-action" onClick={() => void handleArchiveClientMonth(auditClient)}>
                    Export + archive month
                  </button>
                </>
              ) : null}
              <button type="button" className="btn btn-secondary directory-action" onClick={closeClientAudit} ref={auditCloseButtonRef}>
                Close
              </button>
            </div>
          </div>
          <div className="notification-template-chips audit-filter-chips">
            <button type="button" className={`chip chip-button notification-template-chip ${auditOverlayFilter === 'all' ? 'is-active' : ''}`} onClick={() => setAuditOverlayFilter('all')}>
              All
            </button>
            <button type="button" className={`chip chip-button notification-template-chip ${auditOverlayFilter === 'contact' ? 'is-active' : ''}`} onClick={() => setAuditOverlayFilter('contact')}>
              Contact changes
            </button>
            <button type="button" className={`chip chip-button notification-template-chip ${auditOverlayFilter === 'notifications' ? 'is-active' : ''}`} onClick={() => setAuditOverlayFilter('notifications')}>
              Notifications
            </button>
          </div>
          {showContactAudit ? (
          <div className="audit-section">
            <div className="family-title">Contact changes</div>
            {auditEntries.length === 0 ? <div className="status">No contact change history found.</div> : null}
            {auditEntries.map((entry) => (
              <div className="family-audit-row" key={`contact-${entry.id}`}>
                <div>
                  <strong>{getAuditActionLabel(entry.action_type)}</strong>
                  <div className="status">
                    {entry.contact_name || 'Family member'} • {entry.phone || 'No phone'}
                  </div>
                  <div className="status">
                    by {entry.actor_name} on {new Date(entry.created_at).toLocaleString()}
                  </div>
                </div>
                <span className="pill badge-inactive">{entry.is_primary ? 'Primary' : 'Secondary'}</span>
              </div>
            ))}
          </div>
          ) : null}
          {showNotificationAudit ? (
          <div className="audit-section">
            <div className="family-title">Notifications sent</div>
            {notificationEntries.length === 0 ? <div className="status">No notification activity found.</div> : null}
            {notificationEntries.map((entry) => (
              <div className="family-audit-row" key={`notification-${entry.id}`}>
                <div>
                  <strong>{entry.channel.toUpperCase()} via {entry.template_key.replace(/_/g, ' ')}</strong>
                  <div className="status">
                    {entry.recipient_name || 'Recipient'} • {entry.recipient_phone || 'No phone'}
                  </div>
                  <div className="status">
                    {entry.message_preview || 'No preview saved'}
                  </div>
                  <div className="status">
                    by {entry.actor_name} on {new Date(entry.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="directory-actions">
                  <span className="pill badge-upcoming">{entry.recipient_role}</span>
                  {['visit_reminder_d1', 'backfilled_visit_notice', 'family_monthly_update'].includes(entry.template_key) ? (
                    <span className="pill badge-active">reminder</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          ) : null}
        </div>
      </div>
    );
  };

  const renderStatusPopup = () => {
    if (!statusMessage) {
      return null;
    }

    return (
      <div className="overlay-backdrop" role="presentation">
        <div
          className="overlay-panel status-popup-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Update message"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="overlay-header">
            <h3 className="overlay-title">Update</h3>
          </div>
          <div className="status-popup-message">{statusMessage}</div>
          <div className="overlay-actions">
            <button type="button" className="btn btn-primary" onClick={() => setStatusMessage('')}>
              OK
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderVisitReassignmentModal = () => {
    if (!visitReassignmentModal) {
      return null;
    }

    const { visit } = visitReassignmentModal;
    const availableBuddies = buddies.filter((buddy) => {
      const isSameAsCurrentBuddy = Number(buddy.id) === Number(visit.buddy_id);
      const isCurrentlyAssigned = activelyAssignedBuddyIds.has(Number(buddy.id));
      return isSameAsCurrentBuddy || !isCurrentlyAssigned;
    });

    return (
      <div
        className="overlay-backdrop"
        role="presentation"
        onClick={() => setVisitReassignmentModal(null)}
      >
        <div
          className="overlay-panel modal-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Reassign visit buddy"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="overlay-header">
            <h3 className="overlay-title">Reassign visit buddy</h3>
          </div>
          <div className="modal-body">
            <div className="status">Visit: {visit.scheduled_date}</div>
            <div className="status">Client: {visit.client_name}</div>
            <div className="status">Current caretaker: {visit.buddy_name}</div>
            <label>
              Select new caretaker
              <select
                className="small-input"
                value={visitReassignmentModal.selectedBuddyId}
                onChange={(event) => setVisitReassignmentModal({ ...visitReassignmentModal, selectedBuddyId: event.target.value })}
              >
                <option value="">-- Select caretaker --</option>
                {availableBuddies.map((buddy) => (
                  <option key={`reassign-buddy-${buddy.id}`} value={buddy.id}>{buddy.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="overlay-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setVisitReassignmentModal(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleConfirmVisitReassignment()}
            >
              Reassign and create new assignment
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderBackfillConflictModal = () => {
    if (!backfillConflictModal) {
      return null;
    }

    const availableBuddies = buddies.filter((buddy) => {
      return !activelyAssignedBuddyIds.has(Number(buddy.id));
    });

    return (
      <div
        className="overlay-backdrop"
        role="presentation"
        onClick={() => setBackfillConflictModal(null)}
      >
        <div
          className="overlay-panel modal-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Backfill conflict resolution"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="overlay-header">
            <h3 className="overlay-title">Caregiver conflict on {backfillConflictModal.conflict_date}</h3>
          </div>
          <div className="modal-body">
            <div className="status">The current caregiver has another assignment on {backfillConflictModal.conflict_date}.</div>
            <div className="status">Backfill reason: {backfillConflictModal.backfill_reason}</div>
            <div className="directory-meta" style={{ marginTop: '1rem' }}>
              You can either:
            </div>
            <div className="family-form">
              <label>
                <strong>Option 1: Reassign to a different caretaker</strong>
                <select
                  className="small-input"
                  value={backfillConflictModal.selectedReassignBuddyId}
                  onChange={(event) => setBackfillConflictModal({ ...backfillConflictModal, selectedReassignBuddyId: event.target.value })}
                >
                  <option value="">-- Select caretaker --</option>
                  {availableBuddies.map((buddy) => (
                    <option key={`backfill-reassign-${buddy.id}`} value={buddy.id}>{buddy.name}</option>
                  ))}
                </select>
              </label>
              <div className="directory-meta">Creates a new assignment for this caregiver on {backfillConflictModal.conflict_date}.</div>
              <label>
                <strong>Option 2: Auto-carry-forward</strong>
                <div className="directory-meta">System will carry forward to the next available day when the original caregiver is free.</div>
              </label>
            </div>
          </div>
          <div className="overlay-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void handleAutoCarryForward()}
            >
              Auto-carry-forward
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleConfirmBackfillReassignment()}
              disabled={!backfillConflictModal.selectedReassignBuddyId}
            >
              Reassign to selected caretaker
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderCalendarDayDetailsOverlay = () => {
    if (!calendarDayDetailsDate || !monthlyCalendar) {
      return null;
    }

    const selectedDay = monthlyCalendar.days.find((entry) => entry.date === calendarDayDetailsDate);
    if (!selectedDay) {
      return null;
    }

    const [year, month, day] = selectedDay.date.split('-').map((entry) => Number(entry));
    const parsedDate = Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
      ? new Date(Date.UTC(year, month - 1, day))
      : null;
    const dateLabel = parsedDate
      ? parsedDate.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })
      : selectedDay.date;

    return (
      <div className="overlay-backdrop" role="presentation" onClick={() => setCalendarDayDetailsDate(null)}>
        <div
          className="overlay-panel assignment-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Day schedules"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="overlay-header">
            <div>
              <div className="family-title">Complete schedules</div>
              <h3 className="overlay-title">{dateLabel}</h3>
              <div className="directory-meta">{selectedDay.visits.length} visit entries • {selectedDay.long_term_coverage.length} long-term coverage entries</div>
            </div>
            <div className="overlay-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setCalendarDayDetailsDate(null)}>
                Close
              </button>
            </div>
          </div>

          <div className="section">
            <div className="panel">
              <h3>Visits</h3>
              {selectedDay.visits.length === 0 ? (
                <div className="directory-meta">No visits scheduled for this day.</div>
              ) : (
                <div className="family-audit-list">
                  {selectedDay.visits.map((entry) => (
                    <div key={`calendar-details-visit-${selectedDay.date}-${entry.visit_id}`} className="family-audit-item">
                      <div className="status">{entry.visit_status}</div>
                      <div className="meta">{entry.buddy_name} → {entry.elderly_name}</div>
                      <div className="directory-meta">Assignment #{entry.assignment_id || '-'}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="panel">
              <h3>Long-term coverage</h3>
              {selectedDay.long_term_coverage.length === 0 ? (
                <div className="directory-meta">No long-term coverage entries for this day.</div>
              ) : (
                <div className="family-audit-list">
                  {selectedDay.long_term_coverage.map((entry) => (
                    <div key={`calendar-details-coverage-${selectedDay.date}-${entry.assignment_id}-${entry.buddy_name}`} className="family-audit-item">
                      <div className="status">{entry.care_shift || 'slot'} • {entry.coverage_status}</div>
                      <div className="meta">{entry.buddy_name} → {entry.elderly_name}</div>
                      <div className="directory-meta">Assignment #{entry.assignment_id}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderHeader = () => (
    <header className="topbar">
      <div className="brand">
        <div className="brand-badge">G</div>
        <div>
          <div>Gatt & Co</div>
          <div className="brand-subtitle">Care portal for {user?.role}</div>
        </div>
      </div>
      <div className="nav-pills">
        <span className="pill status-neutral">{user?.role.toUpperCase()}</span>
        {installPromptAvailable && !isStandaloneInstalled ? (
          <button className="btn btn-secondary" onClick={() => void handleInstallApp()}>
            Install App
          </button>
        ) : null}
        <button className="btn btn-secondary" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </header>
  );

  const renderConnectivityBanner = () => (
    <div className={`connectivity-banner ${isOnline ? 'online' : 'offline'}`} role="status" aria-live="polite">
      {isOnline ? 'Online: live updates are active.' : 'Offline: using cached data where available.'}
    </div>
  );

  const renderDashboardTabs = (items: Array<{ key: string; label: string }>, active: string, onChange: (key: string) => void) => (
    <div className="dashboard-tabs" role="tablist" aria-label="Dashboard sections">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={active === item.key ? 'active' : ''}
          onClick={() => onChange(item.key)}
          role="tab"
          aria-selected={active === item.key}
        >
          {item.label}
        </button>
      ))}
    </div>
  );

  const matchesDirectorySearch = (item: User, query: string) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return true;
    }

    return [
      item.name,
      item.email,
      item.phone || '',
      item.role,
      item.address || '',
    ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
  };

  const sortUsers = (items: User[], sortKey: 'name' | 'email') => (
    [...items].sort((left, right) => {
      const leftValue = String(sortKey === 'email' ? left.email : left.name).toLowerCase();
      const rightValue = String(sortKey === 'email' ? right.email : right.name).toLowerCase();
      return leftValue.localeCompare(rightValue);
    })
  );

  const filteredBuddies = buddies.filter((item) => matchesDirectorySearch(item, directorySearch.buddy));
  const sortedBuddies = sortUsers(filteredBuddies, directorySort.buddy);
  const filteredClients = clients.filter((item) => matchesDirectorySearch(item, directorySearch.client));
  const sortedClients = sortUsers(filteredClients, directorySort.client);
  const safeAssignments = asArray<Assignment>(assignments);
  const shortTermRestGapMs = 4 * 60 * 60 * 1000;
  const selectedSlotWindows = (assignmentForm.short_term_slots || [])
    .map((slot) => {
      if (!slot.visit_date || !slot.start_time) {
        return null;
      }

      const durationMinutes = Number(assignmentForm.planned_visit_duration_minutes || 0);
      if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
        return null;
      }

      const startMs = Date.parse(`${slot.visit_date}T${slot.start_time}:00.000Z`);
      if (!Number.isFinite(startMs)) {
        return null;
      }

      return {
        startMs,
        endMs: startMs + (durationMinutes * 60 * 1000),
      };
    })
    .filter((entry): entry is { startMs: number; endMs: number } => Boolean(entry));

  const hasCompleteShortTermSlots = selectedSlotWindows.length > 0
    && selectedSlotWindows.length === (assignmentForm.short_term_slots || []).length;

  const hasBuddyShortTermConflict = (buddyId: number) => {
    if (!hasCompleteShortTermSlots || assignmentForm.service_plan_type !== 'short_term') {
      return false;
    }

    const existingSlotWindows = safeAssignments
      .filter((assignment) => (
        Number(assignment.buddy_id) === Number(buddyId)
        && !isLongTermAssignment(assignment)
        && !['completed', 'cancelled'].includes(String(assignment.status || '').toLowerCase())
      ))
      .flatMap((assignment) => assignment.short_term_slots || [])
      .map((slot) => ({
        startMs: Date.parse(String(slot.start_at || '')),
        endMs: Date.parse(String(slot.end_at || '')),
      }))
      .filter((entry) => Number.isFinite(entry.startMs) && Number.isFinite(entry.endMs));

    for (const selectedWindow of selectedSlotWindows) {
      for (const existingWindow of existingSlotWindows) {
        if (selectedWindow.startMs < existingWindow.endMs && existingWindow.startMs < selectedWindow.endMs) {
          return true;
        }

        if (selectedWindow.startMs >= existingWindow.endMs && (selectedWindow.startMs - existingWindow.endMs) < shortTermRestGapMs) {
          return true;
        }

        if (existingWindow.startMs >= selectedWindow.endMs && (existingWindow.startMs - selectedWindow.endMs) < shortTermRestGapMs) {
          return true;
        }
      }
    }

    return false;
  };

  const hasBuddyLongTermConflict = (buddyId: number) => {
    if (assignmentForm.service_plan_type !== 'long_term') {
      return false;
    }

    const selectedElderlyId = Number(assignmentForm.elderly_id || 0);
    return safeAssignments.some((assignment) => (
      Number(assignment.buddy_id) === Number(buddyId)
      && isLongTermAssignment(assignment)
      && !['completed', 'cancelled'].includes(String(assignment.status || '').toLowerCase())
      && (selectedElderlyId <= 0 || Number(assignment.elderly_id) !== selectedElderlyId)
    ));
  };

  const availableBuddiesForOverview = buddies.filter((buddy) => (
    !hasBuddyLongTermConflict(buddy.id)
    && !hasBuddyShortTermConflict(buddy.id)
  ));

  const activelyAssignedBuddyIds = new Set(
    safeAssignments
      .filter((assignment) => (
        assignment.status === 'active'
        && (assignment.approval_state || 'pending_approval') === 'approved'
      ))
      .map((assignment) => Number(assignment.buddy_id)),
  );
  const availableBuddies = availableBuddiesForOverview;
  const selectedBuddyName = buddies.find((item) => String(item.id) === selectedAssignmentBuddyId)?.name || 'Caretaker';
  const visibleAssignments = selectedAssignmentBuddyId
    ? safeAssignments.filter((assignment) => String(assignment.buddy_id) === selectedAssignmentBuddyId)
    : safeAssignments;
  const selectedClientName = clients.find((item) => String(item.id) === selectedVisitClientId)?.name || 'Client';
  const clientFeedbackTargets = user?.role === 'client'
    ? safeAssignments
      .filter((assignment) => {
        const assignmentClientId = assignment.service_for_client_id
          || elderlyMembers.find((entry) => Number(entry.id) === Number(assignment.elderly_id))?.client_id
          || null;
        return Number(assignmentClientId) === Number(user.id)
          && String(assignment.status || '').toLowerCase() === 'active'
          && (assignment.approval_state || 'pending_approval') === 'approved';
      })
      .map((assignment) => {
        const planLabel = getAssignmentPlanSummary(assignment);
        return {
          assignment_id: Number(assignment.id),
          elderly_id: Number(assignment.elderly_id),
          label: `${assignment.buddy_name || 'Caretaker'} • ${planLabel}`,
        };
      })
    : [];
  const visibleVisits = selectedVisitClientId
    ? visits.filter((visit) => elderlyMembers.find((entry) => entry.id === visit.elderly_id)?.client_id === Number(selectedVisitClientId))
    : visits;
  const activeLongTermAssignments = safeAssignments.filter((assignment) => (
    isLongTermAssignment(assignment)
    && (assignment.approval_state || 'pending_approval') === 'approved'
    && assignment.status === 'active'
  ));
  const latestDailyRecordByAssignment: Record<number, DailyRecord | null> = {};
  activeLongTermAssignments.forEach((assignment) => {
    const rows = dailyRecordsByAssignment[assignment.id] || [];
    latestDailyRecordByAssignment[assignment.id] = rows.length > 0 ? rows[0] : null;
  });
  const archiveTrendRows = archiveAnalyticsData?.months || [];
  const archiveTrendPeak = archiveTrendRows.reduce((maxValue, row) => (
    Math.max(maxValue, row.assignments, row.visits, row.tasks, row.requests, row.assignment_lifecycle)
  ), 0);
  const calendarDays = monthlyCalendar?.days || [];
  const formatCalendarCardDate = (isoDate: string) => {
    const parsed = new Date(`${isoDate}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      return isoDate;
    }
    return parsed.toLocaleDateString('en-US', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  };
  const calendarMonthLabel = (() => {
    const source = monthlyCalendar?.month || reportMonth;
    const parsed = new Date(`${source}-01T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      return source;
    }
    return parsed.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  })();

  const formatDateOnly = (value: Date) => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const tomorrowDateText = (() => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    return formatDateOnly(tomorrow);
  })();

  const getAssignmentCardCategory = (assignment: Assignment) => {
    const status = String(assignment.status || '').toLowerCase();
    const isClosed = status === 'completed' || status === 'cancelled';
    const longTerm = isLongTermAssignment(assignment);

    if (isClosed) {
      return longTerm ? 'closed-long-term' : 'closed-short-term';
    }

    const isActive = status === 'active' && (assignment.approval_state || 'pending_approval') === 'approved';
    if (isActive) {
      return 'active';
    }

    if (longTerm) {
      if (String(assignment.start_date || '') === tomorrowDateText) {
        return 'next-day';
      }
    } else {
      const hasTomorrowSlot = (assignment.short_term_slots || []).some((slot) => String(slot.visit_date || '') === tomorrowDateText);
      if (hasTomorrowSlot) {
        return 'next-day';
      }
    }

    return 'default';
  };

  const getAssignmentCardTag = (assignment: Assignment) => {
    const category = getAssignmentCardCategory(assignment);
    if (category === 'next-day') {
      return { className: 'assignment-card-tag assignment-card-tag-next-day', label: 'Next day assignment' };
    }
    if (category === 'active') {
      return { className: 'assignment-card-tag assignment-card-tag-active', label: 'Active assignment' };
    }
    if (category === 'closed-long-term') {
      return { className: 'assignment-card-tag assignment-card-tag-closed-long', label: 'Closed long-term' };
    }
    if (category === 'closed-short-term') {
      return { className: 'assignment-card-tag assignment-card-tag-closed-short', label: 'Closed short-term' };
    }
    return { className: 'assignment-card-tag', label: 'Open assignment' };
  };

  const getClientDirectoryCardCategory = (clientId: number) => {
    const clientElderlyIds = elderlyMembers
      .filter((entry) => Number(entry.client_id) === Number(clientId))
      .map((entry) => Number(entry.id));

    const clientAssignments = assignments.filter((assignment) => (
      Number(assignment.service_for_client_id || 0) === Number(clientId)
      || clientElderlyIds.includes(Number(assignment.elderly_id))
    ));

    if (clientAssignments.length === 0) {
      return 'default';
    }

    const hasNextDay = clientAssignments.some((assignment) => {
      const status = String(assignment.status || '').toLowerCase();
      if (status === 'completed' || status === 'cancelled') {
        return false;
      }

      if (isLongTermAssignment(assignment)) {
        return String(assignment.start_date || '') === tomorrowDateText;
      }

      return (assignment.short_term_slots || []).some((slot) => String(slot.visit_date || '') === tomorrowDateText);
    });

    if (hasNextDay) {
      return 'next-day';
    }

    const hasActive = clientAssignments.some((assignment) => (
      String(assignment.status || '').toLowerCase() === 'active' && (assignment.approval_state || 'pending_approval') === 'approved'
    ));

    if (hasActive) {
      return 'active';
    }

    const hasClosedLongTerm = clientAssignments.some((assignment) => {
      const status = String(assignment.status || '').toLowerCase();
      return (status === 'completed' || status === 'cancelled') && isLongTermAssignment(assignment);
    });

    if (hasClosedLongTerm) {
      return 'closed-long-term';
    }

    const hasClosedShortTerm = clientAssignments.some((assignment) => {
      const status = String(assignment.status || '').toLowerCase();
      return (status === 'completed' || status === 'cancelled') && !isLongTermAssignment(assignment);
    });

    if (hasClosedShortTerm) {
      return 'closed-short-term';
    }

    return 'default';
  };

  const getClientDirectoryCardTag = (clientId: number) => {
    const category = getClientDirectoryCardCategory(clientId);
    if (category === 'next-day') {
      return { className: 'assignment-card-tag assignment-card-tag-next-day', label: 'Next day case' };
    }
    if (category === 'active') {
      return { className: 'assignment-card-tag assignment-card-tag-active', label: 'Active case' };
    }
    if (category === 'closed-long-term') {
      return { className: 'assignment-card-tag assignment-card-tag-closed-long', label: 'Closed long-term' };
    }
    if (category === 'closed-short-term') {
      return { className: 'assignment-card-tag assignment-card-tag-closed-short', label: 'Closed short-term' };
    }
    return { className: 'assignment-card-tag', label: 'Open case' };
  };

  useEffect(() => {
    if (!user || user.role !== 'admin' || adminTab !== 'archived-history') {
      return;
    }

    if (!archivedHistoryClientId) {
      setArchiveAnalyticsData(null);
      return;
    }

    void loadArchiveAnalytics(archivedHistoryClientId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, adminTab, archivedHistoryClientId]);

  const adminDashboard = () => (
    <>
      <section className="hero">
        <div>
          <p className="hero-label">Admin Dashboard</p>
          <h1>Care team and assignment overview</h1>
          <p className="hero-copy">
            Manage caretakers, clients, current visits, and task assignments with one panel. Create accounts, set assignment terms, and monitor active visits.
          </p>
        </div>
        <div className="hero-actions">
          <button className="btn btn-secondary" onClick={refreshLiveLocations} disabled={getActiveCaseVisits(visits).length === 0}>
            Refresh live locations
          </button>
        </div>
        <div className="hero-card">
          <div className="tiny">Quick stats</div>
          <div className="metric">{buddies.length + clients.length}</div>
          <div>{buddies.length} caretakers + {clients.length} clients</div>
          <ul>
            <li>{assignments.length} assigned cases</li>
            <li>{visits.length} recent visits</li>
            <li>{tasks.length} tracked task updates</li>
          </ul>
        </div>
      </section>
      {renderDashboardTabs(
        [
          { key: 'overview', label: 'Overview' },
          { key: 'buddy-directory', label: 'Buddy Directory' },
          { key: 'client-directory', label: 'Client Directory' },
          { key: 'assignments', label: 'Assignments' },
          { key: 'visits', label: 'Visits & Location' },
          { key: 'requests', label: 'Requests' },
          { key: 'calendar-reporting', label: 'Calendar & Differences' },
          { key: 'archived-history', label: 'Archived History' },
        ],
        adminTab,
        (key) => setAdminTab(key as AdminTab),
      )}
      {adminTab === 'overview' && <div className="section">
        <div className="panel">
          <h2>Create caretaker or client login</h2>
          <form onSubmit={handleCreateUser} className="auth-form">
            <label>
              User ID (login)
              <input className="small-input" required value={createForm.user_id} onChange={handleCreateChange('user_id')} placeholder="buddy1, client24, admin01" />
            </label>
            <label>
              Full name
              <input className="small-input" required value={createForm.name} onChange={handleCreateChange('name')} placeholder="Full name" />
            </label>
            <label>
              Role
              <select className="small-input" required value={createForm.role} onChange={handleCreateChange('role')}>
                <option value="buddy">Caretaker (Buddy)</option>
                <option value="client">Client (Gatt)</option>
              </select>
            </label>
            {createForm.role === 'client' ? (
              <label>
                Client onboarding type
                <select className="small-input" required value={createForm.client_onboarding_type} onChange={handleCreateChange('client_onboarding_type')}>
                  <option value="kin_requested">Kin requested</option>
                  <option value="self_service">Self service</option>
                </select>
              </label>
            ) : null}
            <label>
              Email
              <input className="small-input" required type="email" value={createForm.email} onChange={handleCreateChange('email')} placeholder="name@example.com" />
            </label>
            <label>
              Phone number
              <input className="small-input" required inputMode="tel" value={createForm.phone} onChange={handleCreateChange('phone')} placeholder="+91 9876543210 / +44 7700900123 / +1 4155552671" />
            </label>
            <label>
              Address
              <input className="small-input" required value={createForm.address} onChange={handleCreateChange('address')} placeholder="home address" />
            </label>
            <label>
              Password
              <input className="small-input" required type="password" value={createForm.password} onChange={handleCreateChange('password')} placeholder="1234567890" />
            </label>
            <button className="btn btn-primary auth-submit" type="submit">Create account</button>
          </form>
        </div>
        <div className="panel">
          <h2>Assign tasks to caretakers</h2>
          <form onSubmit={handleCreateAssignment} className="auth-form">
            <label>
              Caretaker
              <select className="small-input" value={assignmentForm.buddy_id} onChange={handleAssignmentChange('buddy_id')}>
                <option value="">Select caretaker</option>
                {availableBuddies.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
            <label>
              Client case
              <select className="small-input" value={assignmentForm.elderly_id} onChange={handleAssignmentChange('elderly_id')}>
                <option value="">Select client case</option>
                {elderlyMembers.map((item) => (
                  <option key={item.id} value={item.id}>{item.full_name}</option>
                ))}
              </select>
            </label>
            <label>
              Service plan type
              <select className="small-input" value={assignmentForm.service_plan_type} onChange={handleAssignmentChange('service_plan_type')}>
                <option value="short_term">Short term</option>
                <option value="long_term">Long term</option>
              </select>
            </label>
            {assignmentForm.service_plan_type === 'short_term' ? (
              <>
                <label>
                  Monthly visit plan
                  <select className="small-input" value={assignmentForm.monthly_visit_plan} onChange={handleAssignmentChange('monthly_visit_plan')}>
                    <option value="3">3 visits/month</option>
                    <option value="6">6 visits/month</option>
                    <option value="9">9 visits/month</option>
                  </select>
                </label>
                <label>
                  Planned visit duration
                  <select className="small-input" value={assignmentForm.planned_visit_duration_minutes} onChange={handleAssignmentChange('planned_visit_duration_minutes')}>
                    <option value="60">60 minutes</option>
                    <option value="90">90 minutes</option>
                  </select>
                </label>
                <div className="status">
                  Choose {assignmentForm.monthly_visit_plan || '0'} visit dates and start times
                </div>
                {(assignmentForm.short_term_slots || []).map((slot, slotIndex) => (
                  <React.Fragment key={`short-term-slot-${slotIndex}`}>
                    <label>
                      Visit date {slotIndex + 1}
                      <input
                        className="small-input"
                        type="date"
                        value={slot.visit_date}
                        onChange={handleShortTermSlotChange(slotIndex, 'visit_date')}
                      />
                    </label>
                    <label>
                      Start time {slotIndex + 1}
                      <input
                        className="small-input"
                        type="time"
                        value={slot.start_time}
                        onChange={handleShortTermSlotChange(slotIndex, 'start_time')}
                      />
                    </label>
                  </React.Fragment>
                ))}
              </>
            ) : (
              <>
                <label>
                  Care shift
                  <select className="small-input" value={assignmentForm.care_shift} onChange={handleAssignmentChange('care_shift')}>
                    <option value="">Select shift</option>
                    <option value="morning_10h">Morning 10 hours</option>
                    <option value="night_10h">Night 10 hours</option>
                    <option value="full_day">Full day</option>
                  </select>
                </label>
                <label>
                  Cycle start date
                  <input className="small-input" type="date" value={assignmentForm.start_date} onChange={handleAssignmentChange('start_date')} />
                </label>
                <label>
                  Cycle end date
                  <input className="small-input" type="date" value={assignmentForm.end_date} onChange={handleAssignmentChange('end_date')} />
                </label>
              </>
            )}
            <label>
              Admin notes
              <input className="small-input" value={assignmentForm.admin_notes} onChange={handleAssignmentChange('admin_notes')} placeholder="optional internal note" />
            </label>
            <button className="btn btn-primary auth-submit" type="submit">Create assignment</button>
          </form>
        </div>
      </div>}
      {adminTab === 'buddy-directory' && <div className="panel">
        <div className="directory-toolbar">
          <div>
            <h2>Buddy directory</h2>
            <p className="directory-meta">{filteredBuddies.length} of {buddies.length} caretakers shown</p>
          </div>
          <div className="directory-controls">
            <select
              className="small-input directory-sort"
              value={directorySort.buddy}
              onChange={(event) => setDirectorySort({ ...directorySort, buddy: event.target.value as 'name' | 'email' })}
            >
              <option value="name">Sort by name</option>
              <option value="email">Sort by email</option>
            </select>
            <input
              className="small-input directory-search"
              value={directorySearch.buddy}
              onChange={(event) => setDirectorySearch({ ...directorySearch, buddy: event.target.value })}
              placeholder="Search caretakers by name, email, phone, or role"
            />
          </div>
        </div>
        {renderStatusLegend()}
        <div className="card-grid">{sortedBuddies.map(createUserCard)}</div>
      </div>}
      {adminTab === 'client-directory' && <div className="panel">
        <div className="directory-toolbar">
          <div>
            <h2>Client directory</h2>
            <p className="directory-meta">{filteredClients.length} of {clients.length} clients shown</p>
          </div>
          <div className="directory-controls">
            <select
              className="small-input directory-sort"
              value={directorySort.client}
              onChange={(event) => setDirectorySort({ ...directorySort, client: event.target.value as 'name' | 'email' })}
            >
              <option value="name">Sort by name</option>
              <option value="email">Sort by email</option>
            </select>
            <input
              className="small-input directory-search"
              value={directorySearch.client}
              onChange={(event) => setDirectorySearch({ ...directorySearch, client: event.target.value })}
              placeholder="Search clients by name, email, phone, or role"
            />
          </div>
        </div>
        {renderStatusLegend()}
        <div className="card-grid">{sortedClients.map(createUserCard)}</div>
      </div>}
      {adminTab === 'overview' && <div className="section">
        <div className="panel">
          <h2>Directory summary</h2>
          <div className="card-grid">
            <button type="button" className="mini-card" onClick={() => setAdminTab('buddy-directory')}>
              <h3>Buddy Directory</h3>
              <p className="mini-copy">View all caretakers and their profiles.</p>
              <div className="metric">{buddies.length}</div>
            </button>
            <button type="button" className="mini-card" onClick={() => setAdminTab('client-directory')}>
              <h3>Client Directory</h3>
              <p className="mini-copy">View all client cases and profile details.</p>
              <div className="metric">{clients.length}</div>
            </button>
          </div>
        </div>
      </div>}
      {adminTab === 'assignments' && <div className="panel">
        <div className="assignment-toolbar">
          <div>
            <h2>Current assignments</h2>
            <p className="directory-meta">
              {selectedAssignmentBuddyId
                ? `${visibleAssignments.length} assignments for the selected buddy`
                : `${visibleAssignments.length} total assignments`}
            </p>
          </div>
          {selectedAssignmentBuddyId ? (
            <div className="filter-breadcrumbs">
              <span className="chip">Filtered by: {selectedBuddyName}</span>
              <button
                type="button"
                className="chip chip-button"
                onClick={() => {
                  setSelectedAssignmentBuddyId('');
                  setAdminTab('buddy-directory');
                }}
              >
                Back to Buddy Directory
              </button>
            </div>
          ) : null}
        </div>
        {renderStatusLegend()}
        <div className="card-grid assignment-card-grid">
          {visibleAssignments.map((assignment) => {
            const isApproved = (assignment.approval_state || 'pending_approval') === 'approved';

            return (
              <div key={assignment.id} className={`mini-card assignment-card assignment-card-${getAssignmentCardCategory(assignment)}`}>
                <div className={getAssignmentCardTag(assignment).className}>{getAssignmentCardTag(assignment).label}</div>
                <div className="name">{assignment.buddy_name || 'Unknown caretaker'}</div>
                <div className="status">Client: {assignment.elderly_name || 'Unknown client'}</div>
                <div className="status">{getAssignmentPlanSummary(assignment)}</div>
                <div className="directory-actions assignment-card-actions">
                  <button className="btn btn-secondary" type="button" onClick={() => void handleAssignmentApprovalAction(assignment.id)} disabled={isApproved}>
                    {isApproved ? 'Approved' : 'Approve'}
                  </button>
                  <button className="btn btn-secondary" type="button" onClick={() => void handleDeleteAssignment(assignment.id)}>
                    Delete
                  </button>
                  <button className="btn btn-secondary" type="button" onClick={() => openAssignmentDetails(assignment.id)}>
                    More
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="directory-meta">Open More on any assignment to view detailed approval and session history with scroll.</div>
      </div>}
      {adminTab === 'requests' && <div className="panel">
        <h2>Client requests</h2>
        <div className="archive-purge-panel">
          <div className="family-title">Request operations</div>
          <div className="directory-controls archive-controls">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void loadRequestOpsMetrics()}
              disabled={requestOpsLoading}
            >
              {requestOpsLoading ? 'Refreshing metrics...' : 'Refresh metrics'}
            </button>
          </div>
          {!requestOpsMetrics ? (
            <div className="status">Metrics will appear after refresh.</div>
          ) : (
            <>
              <div className="archive-purge-summary">
                <div className="status">New: {requestOpsMetrics.totals_by_status.new || 0}</div>
                <div className="status">Viewed: {requestOpsMetrics.totals_by_status.viewed || 0}</div>
                <div className="status">Read: {requestOpsMetrics.totals_by_status.read || 0}</div>
                <div className="status">Awaiting assignee: {requestOpsMetrics.totals_by_status.awaiting_assignee || 0}</div>
                <div className="status">Assigned: {requestOpsMetrics.totals_by_status.assigned || 0}</div>
                <div className="status">Resolved: {requestOpsMetrics.totals_by_status.resolved || 0}</div>
                <div className="status">Closed: {requestOpsMetrics.totals_by_status.closed || 0}</div>
              </div>
              <div className="archive-purge-summary">
                <div className="status">Active under 24h: {requestOpsMetrics.active_aging_buckets.lt_24h}</div>
                <div className="status">Active 24-48h: {requestOpsMetrics.active_aging_buckets.h24_to_48}</div>
                <div className="status">Active over 48h: {requestOpsMetrics.active_aging_buckets.gt_48h}</div>
                <div className="status">SLA overdue: {requestOpsMetrics.overdue_requests.length}</div>
              </div>
              {requestOpsMetrics.overdue_requests.length > 0 ? (
                <div className="table-scroll-wrap">
                  <table className="panel-table panel-table-wide">
                    <thead>
                      <tr>
                        <th>Created</th>
                        <th>User</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Age</th>
                        <th>SLA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requestOpsMetrics.overdue_requests.map((entry, index) => (
                        <tr key={entry.id ?? `overdue-${index}`}>
                          <td>{new Date(entry.timestamp).toLocaleString()}</td>
                          <td>{entry.user_name || 'Unknown'}</td>
                          <td>{entry.request_type}</td>
                          <td>{entry.status}</td>
                          <td>{entry.age_hours}h</td>
                          <td>{entry.sla_target_hours ? `${entry.sla_target_hours}h` : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="status">No requests are currently over SLA.</div>
              )}
              <div className="directory-meta">Updated at {new Date(requestOpsMetrics.generated_at).toLocaleString()}.</div>
            </>
          )}
        </div>
        <table className="panel-table mobile-stack mobile-stack-centered">
          <thead>
            <tr>
              <th>Time</th>
              <th>User</th>
              <th>Type</th>
              <th>Message</th>
              <th>Assign to caretaker</th>
              <th>Status</th>
              <th>Save</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request, index) => (
              <tr key={request.id ?? `${request.user_id}-${index}`}>
                <td data-label="Time">{new Date(request.timestamp).toLocaleString()}</td>
                <td data-label="User">{`${request.user_id} / ${request.user_name || 'Unknown'}`}</td>
                <td data-label="Type">{request.request_type}</td>
                <td data-label="Message">{request.message}</td>
                <td data-label="Assign to caretaker">
                  {request.request_type === 'task_request' && request.id ? (
                    (() => {
                      const effectiveRequestStatus = requestStatusEdits[request.id] || normalizeRequestStatusForUi(request.status);
                      const requestReadOnly = ['assigned', 'resolved', 'closed'].includes(effectiveRequestStatus);
                      const resolvedCaseId = requestAssignmentDrafts[request.id]?.elderly_id || String(request.elderly_id || '');
                      const resolvedCase = resolvedCaseId
                        ? elderlyMembers.find((entry) => Number(entry.id) === Number(resolvedCaseId))
                        : elderlyMembers.find((entry) => Number(entry.client_id) === Number(request.user_id));

                      return (
                    <div className="family-form">
                      <select
                        className="small-input"
                        value={requestAssignmentDrafts[request.id]?.buddy_id || ''}
                        onChange={(event) => handleRequestAssignmentDraftChange(request.id, 'buddy_id', event.target.value)}
                        disabled={requestReadOnly}
                      >
                        <option value="">Select caretaker</option>
                        {buddies.map((buddy) => (
                          <option key={`request-buddy-${request.id}-${buddy.id}`} value={buddy.id}>{buddy.name}</option>
                        ))}
                      </select>
                      <div className="directory-meta">
                        Case: {resolvedCase?.full_name || 'No linked case'}
                      </div>
                      <select
                        className="small-input"
                        value={requestAssignmentDrafts[request.id]?.service_plan_type || 'long_term'}
                        onChange={(event) => handleRequestAssignmentDraftChange(request.id, 'service_plan_type', event.target.value)}
                        disabled={requestReadOnly}
                      >
                        <option value="long_term">long term</option>
                        <option value="short_term">short term</option>
                      </select>

                      {(requestAssignmentDrafts[request.id]?.service_plan_type || 'long_term') === 'long_term' ? (
                        <>
                          <select
                            className="small-input"
                            value={requestAssignmentDrafts[request.id]?.care_shift || 'morning_10h'}
                            onChange={(event) => handleRequestAssignmentDraftChange(request.id, 'care_shift', event.target.value)}
                            disabled={requestReadOnly}
                          >
                            <option value="morning_10h">Morning 10 hours</option>
                            <option value="night_10h">Night 10 hours</option>
                            <option value="full_day">Full day</option>
                          </select>
                          <input
                            className="small-input"
                            type="date"
                            value={requestAssignmentDrafts[request.id]?.start_date || ''}
                            onChange={(event) => handleRequestAssignmentDraftChange(request.id, 'start_date', event.target.value)}
                            disabled={requestReadOnly}
                          />
                          <input
                            className="small-input"
                            type="date"
                            value={requestAssignmentDrafts[request.id]?.end_date || ''}
                            onChange={(event) => handleRequestAssignmentDraftChange(request.id, 'end_date', event.target.value)}
                            disabled={requestReadOnly}
                          />
                        </>
                      ) : (
                        <>
                          <select
                            className="small-input"
                            value={requestAssignmentDrafts[request.id]?.monthly_visit_plan || '3'}
                            onChange={(event) => handleRequestAssignmentDraftChange(request.id, 'monthly_visit_plan', event.target.value)}
                            disabled={requestReadOnly}
                          >
                            <option value="3">3 visits/month</option>
                            <option value="6">6 visits/month</option>
                            <option value="9">9 visits/month</option>
                          </select>
                          <select
                            className="small-input"
                            value={requestAssignmentDrafts[request.id]?.planned_visit_duration_minutes || '60'}
                            onChange={(event) => handleRequestAssignmentDraftChange(request.id, 'planned_visit_duration_minutes', event.target.value)}
                            disabled={requestReadOnly}
                          >
                            <option value="60">60 minutes</option>
                            <option value="90">90 minutes</option>
                          </select>
                          <input
                            className="small-input"
                            type="date"
                            value={requestAssignmentDrafts[request.id]?.start_date || ''}
                            onChange={(event) => handleRequestAssignmentDraftChange(request.id, 'start_date', event.target.value)}
                            disabled={requestReadOnly}
                          />
                        </>
                      )}

                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => void handleAssignRequestToCaretaker(request)}
                        disabled={requestReadOnly}
                      >
                        {requestReadOnly ? 'Assigned' : 'Assign request'}
                      </button>
                      {requestAssignmentResultByRequest[request.id] ? (
                        <div className="directory-meta">{requestAssignmentResultByRequest[request.id]}</div>
                      ) : null}
                    </div>
                      );
                    })()
                  ) : request.request_type === 'feedback' ? (
                    <div className="directory-meta">Feedback item (no assignment required)</div>
                  ) : (
                    <span className="directory-meta">Request id missing</span>
                  )}
                </td>
                <td data-label="Status">
                  <select
                    className="small-input"
                    value={requestStatusEdits[request.id || 0] || normalizeRequestStatusForUi(request.status)}
                    onChange={(event) => handleRequestStatusDraftChange(request.id, event.target.value as RequestStatus)}
                    disabled={(request.id ? ['assigned', 'resolved', 'closed'].includes(requestStatusEdits[request.id] || normalizeRequestStatusForUi(request.status)) : true)}
                  >
                    <option value="new">new</option>
                    <option value="viewed">viewed</option>
                    <option value="read">read</option>
                    <option value="awaiting_assignee">waiting for assignee</option>
                    <option value="assigned">already assigned</option>
                    <option value="resolved">resolved</option>
                    <option value="closed">closed</option>
                  </select>
                </td>
                <td data-label="Save">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void handleRequestStatusUpdate(request.id)}
                    disabled={(request.id ? ['assigned', 'resolved', 'closed'].includes(requestStatusEdits[request.id] || normalizeRequestStatusForUi(request.status)) : true)}
                  >
                    {request.id && ['assigned', 'resolved', 'closed'].includes(requestStatusEdits[request.id] || normalizeRequestStatusForUi(request.status)) ? 'View only' : 'Save'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="family-audit-list">
          <div className="family-title">Visit session history</div>
          {visitSessionHistoryLoading ? <div className="status">Loading visit session history...</div> : null}
          {!visitSessionHistoryLoading && visitSessionHistory.length === 0 ? (
            <div className="directory-meta">No visit session history available yet.</div>
          ) : null}
          {!visitSessionHistoryLoading && visitSessionHistory.length > 0 ? (
            <div className="table-scroll-wrap">
              <table className="panel-table panel-table-wide">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Caregiver</th>
                    <th>Client</th>
                    <th>In</th>
                    <th>Out</th>
                    <th>Mode</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {visitSessionHistory.slice(0, 40).map((entry) => (
                    <tr key={`session-history-${entry.id}`}>
                      <td>{entry.session_date}</td>
                      <td>{entry.buddy_name || 'Unknown'}</td>
                      <td>{entry.client_name || 'Unknown'}</td>
                      <td>{entry.intime ? new Date(entry.intime).toLocaleString() : 'Pending'}</td>
                      <td>{entry.outtime ? new Date(entry.outtime).toLocaleString() : 'Pending'}</td>
                      <td>
                        <span className={entry.backfilled ? 'pill badge-upcoming' : 'pill badge-active'}>
                          {entry.backfilled ? 'Backfilled' : 'Live'}
                        </span>
                      </td>
                      <td>{entry.backfilled ? (entry.backfill_reason || 'No reason') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>}
      {adminTab === 'calendar-reporting' && <div className="panel">
        <div className="directory-toolbar">
          <div>
            <h2>Calendar and monthly differences</h2>
            <p className="directory-meta">Operational month view with planned vs completed reconciliation and utilization insights.</p>
          </div>
          <div className="directory-controls archive-controls">
            <input
              className="small-input archive-month-input"
              type="month"
              value={reportMonth}
              onChange={(event) => setReportMonth(event.target.value)}
            />
            <select className="small-input directory-sort" value={reportBuddyId} onChange={(event) => setReportBuddyId(event.target.value)}>
              <option value="">All buddies</option>
              {buddies.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
            <select className="small-input directory-sort" value={reportClientId} onChange={(event) => setReportClientId(event.target.value)}>
              <option value="">All clients</option>
              {clients.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
            <select className="small-input directory-sort" value={reportMode} onChange={(event) => setReportMode(event.target.value as MonthlyReportMode)}>
              <option value="all">All modes</option>
              <option value="short_term">Short-term</option>
              <option value="long_term">Long-term</option>
            </select>
            <select className="small-input directory-sort" value={reportStatus} onChange={(event) => setReportStatus(event.target.value)}>
              <option value="">All visit statuses</option>
              <option value="scheduled">scheduled</option>
              <option value="in_progress">in_progress</option>
              <option value="completed">completed</option>
              <option value="missed">missed</option>
              <option value="cancelled">cancelled</option>
            </select>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void loadMonthlyReports()}
              disabled={monthlyReportsLoading}
            >
              {monthlyReportsLoading ? 'Loading reports...' : 'Load month'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={downloadMonthlyDifferencesCsv}
              disabled={monthlyReportsLoading || !monthlySummary}
            >
              Export differences CSV
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={downloadCalendarDetailsCsv}
              disabled={monthlyReportsLoading || !monthlyCalendar}
            >
              Export calendar details CSV
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={downloadCalendarHeatmapCsv}
              disabled={monthlyReportsLoading || !monthlyCalendar}
            >
              Export heatmap CSV
            </button>
          </div>
        </div>

        {!monthlySummary ? <div className="status">Load a month to view calendar and monthly differences.</div> : null}
        {monthlySummary ? (
          <>
            <div className="monthly-diff-grid">
              <div className="mini-card">
                <h3>Planned vs completed</h3>
                <div className="metric">{monthlySummary.totals.planned} / {monthlySummary.totals.completed}</div>
                <p className="mini-copy">Total planned workload against completed execution for {calendarMonthLabel}.</p>
              </div>
              <div className="mini-card">
                <h3>Rescheduled</h3>
                <div className="metric">{monthlySummary.totals.rescheduled}</div>
                <p className="mini-copy">Assignment lifecycle entries moved to rescheduled in month scope.</p>
              </div>
              <div className="mini-card">
                <h3>Missed</h3>
                <div className="metric">{monthlySummary.totals.missed}</div>
                <p className="mini-copy">Visits marked missed after filters are applied.</p>
              </div>
              <div className="mini-card">
                <h3>Reminders sent</h3>
                <div className="metric">{monthlySummary.totals.reminders_sent}</div>
                <p className="mini-copy">Notification logs generated by reminder templates.</p>
              </div>
            </div>

            <div className="monthly-diff-grid">
              <div className="mini-card">
                <h3>Short-term package utilization</h3>
                <div className="metric">{monthlySummary.short_term_package_utilization.totals.utilization_percent}%</div>
                <div className="status">
                  {monthlySummary.short_term_package_utilization.totals.completed_visits}
                  {' '}
                  completed of
                  {' '}
                  {monthlySummary.short_term_package_utilization.totals.planned_visits}
                  {' '}
                  planned package visits.
                </div>
              </div>
              <div className="mini-card">
                <h3>Long-term slot utilization</h3>
                <div className="metric">{monthlySummary.long_term_slot_utilization.totals.utilization_percent}%</div>
                <div className="status">
                  {monthlySummary.long_term_slot_utilization.totals.recorded_session_days}
                  {' '}
                  covered days of
                  {' '}
                  {monthlySummary.long_term_slot_utilization.totals.expected_coverage_days}
                  {' '}
                  expected coverage days.
                </div>
              </div>
            </div>

            <div className="section">
              <div className="panel">
                <h3>By mode</h3>
                <table className="panel-table mobile-stack mobile-stack-centered">
                  <thead>
                    <tr>
                      <th>Mode</th>
                      <th>Planned</th>
                      <th>Completed</th>
                      <th>Missed</th>
                      <th>Rescheduled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlySummary.by_mode.map((row) => (
                      <tr key={`mode-${row.mode}`}>
                        <td data-label="Mode">{row.mode.replace('_', '-')}</td>
                        <td data-label="Planned">{row.planned}</td>
                        <td data-label="Completed">{row.completed}</td>
                        <td data-label="Missed">{row.missed}</td>
                        <td data-label="Rescheduled">{row.rescheduled}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="panel">
                <h3>By visit status</h3>
                <table className="panel-table mobile-stack mobile-stack-centered">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlySummary.by_status.length === 0 ? (
                      <tr>
                        <td data-label="Status">-</td>
                        <td data-label="Count">0</td>
                      </tr>
                    ) : monthlySummary.by_status.map((row) => (
                      <tr key={`status-${row.status}`}>
                        <td data-label="Status">{row.status}</td>
                        <td data-label="Count">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel">
              <div className="inline-row">
                <h3>Monthly calendar: {calendarMonthLabel}</h3>
                <span className="directory-meta">Visits and long-term daily coverage</span>
              </div>
              <div className="card-grid calendar-card-grid">
                {calendarDays.map((day) => (
                  <div key={day.date} className="mini-card calendar-day-card">
                    <div className="calendar-day-card-head">
                      <div className="name">{formatCalendarCardDate(day.date)}</div>
                      <div className="directory-meta">{day.date}</div>
                    </div>
                    <div className="calendar-day-card-body">
                      <div className="status">Visits: {day.visits.length}</div>
                      <div className="status">Long-term: {day.long_term_coverage.length}</div>

                      {day.visits.slice(0, 1).map((entry) => (
                        <div key={`visit-preview-${day.date}-${entry.visit_id}`} className="directory-meta">
                          Visit: {entry.buddy_name} → {entry.elderly_name}
                        </div>
                      ))}
                      {day.long_term_coverage.slice(0, 1).map((entry) => (
                        <div key={`coverage-preview-${day.date}-${entry.assignment_id}-${entry.buddy_name}`} className="directory-meta">
                          Coverage: {entry.care_shift || 'slot'} • {entry.buddy_name}
                        </div>
                      ))}

                      {day.visits.length === 0 && day.long_term_coverage.length === 0 ? (
                        <div className="directory-meta">No scheduled activity</div>
                      ) : null}
                    </div>
                    <div className="calendar-day-card-actions">
                      <button type="button" className="btn btn-secondary" onClick={() => setCalendarDayDetailsDate(day.date)}>
                        More
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>}
      {adminTab === 'archived-history' && <div className="panel">
        <div className="directory-toolbar">
          <div>
            <h2>Archived history</h2>
            <p className="directory-meta">Load archived monthly case records before any purge workflow is introduced.</p>
          </div>
          <div className="directory-controls archive-controls">
            <select className="small-input directory-sort" value={archivedHistoryClientId} onChange={(event) => setArchivedHistoryClientId(event.target.value)}>
              <option value="">Select client</option>
              {clients.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
            <input className="small-input archive-month-input" type="month" value={archivedHistoryMonth} onChange={(event) => setArchivedHistoryMonth(event.target.value)} />
            <button type="button" className="btn btn-secondary" onClick={() => void loadArchivedHistory()} disabled={archivedHistoryLoading}>
              {archivedHistoryLoading ? 'Loading...' : 'Load archived history'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void loadArchiveAnalytics(archivedHistoryClientId)}
              disabled={archiveAnalyticsLoading || !archivedHistoryClientId}
            >
              {archiveAnalyticsLoading ? 'Refreshing trend...' : 'Refresh trend'}
            </button>
          </div>
        </div>
        {archivedHistoryClientId ? (
          <div className="archive-purge-panel">
            <div className="family-title">Archive trend (last 6 months)</div>
            {!archiveAnalyticsData && !archiveAnalyticsLoading ? <div className="status">No trend data loaded yet.</div> : null}
            {archiveAnalyticsLoading ? <div className="status">Loading archive trend...</div> : null}
            {archiveAnalyticsData ? (
              <>
                <div className="archive-purge-summary">
                  <div className="status">Assignments: {archiveAnalyticsData.totals.assignments}</div>
                  <div className="status">Visits: {archiveAnalyticsData.totals.visits}</div>
                  <div className="status">Tasks: {archiveAnalyticsData.totals.tasks}</div>
                  <div className="status">Requests: {archiveAnalyticsData.totals.requests}</div>
                  <div className="status">Lifecycle: {archiveAnalyticsData.totals.assignment_lifecycle}</div>
                </div>
                <div className="table-scroll-wrap">
                  <table className="panel-table panel-table-wide">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Assignments</th>
                        <th>Visits</th>
                        <th>Tasks</th>
                        <th>Requests</th>
                        <th>Lifecycle</th>
                        <th>Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archiveTrendRows.map((entry) => {
                        const monthTotal = entry.assignments + entry.visits + entry.tasks + entry.requests + entry.assignment_lifecycle;
                        const trendWidthPercent = archiveTrendPeak > 0
                          ? Math.max(6, Math.round((monthTotal / (archiveTrendPeak * 5)) * 100))
                          : 0;

                        return (
                          <tr key={entry.month}>
                            <td>{formatArchiveMonthLabel(entry.month)}</td>
                            <td>{entry.assignments}</td>
                            <td>{entry.visits}</td>
                            <td>{entry.tasks}</td>
                            <td>{entry.requests}</td>
                            <td>{entry.assignment_lifecycle}</td>
                            <td>
                              {monthTotal === 0 ? (
                                <span className="directory-meta">No archived activity</span>
                              ) : (
                                <div
                                  style={{
                                    height: '10px',
                                    borderRadius: '999px',
                                    background: 'linear-gradient(90deg, var(--primary), var(--accent))',
                                    width: `${trendWidthPercent}%`,
                                    minWidth: '12px',
                                  }}
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="directory-meta">Trend updated at {new Date(archiveAnalyticsData.generated_at).toLocaleString()}.</div>
              </>
            ) : null}
          </div>
        ) : null}
        <div className="archive-purge-panel">
          <div className="family-title">Purge archived month</div>
          <div className="directory-meta">This permanently deletes already archived records for the selected client and month. Type PURGE to continue.</div>
          {archivedHistoryData ? (
            <div className="archive-purge-summary">
              <div className="status">Assignments: {archivedHistoryData.assignments.length}</div>
              <div className="status">Visits: {archivedHistoryData.visits.length}</div>
              <div className="status">Tasks: {archivedHistoryData.tasks.length}</div>
              <div className="status">Requests: {archivedHistoryData.requests.length}</div>
              <div className="status">Contact changes: {archivedHistoryData.contactAudits.length}</div>
              <div className="status">Assignment lifecycle: {archivedHistoryData.assignmentAudits.length}</div>
              <div className="status">Notifications: {archivedHistoryData.notifications.length}</div>
            </div>
          ) : null}
          <div className="directory-controls archive-controls">
            <input
              className="small-input archive-confirm-input"
              value={purgeConfirmText}
              onChange={(event) => {
                setPurgeConfirmText(event.target.value);
                setPurgeReady(false);
              }}
              placeholder="Type PURGE to confirm"
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (!archivedHistoryData) {
                  setStatusMessage('Load archived history before confirming purge.');
                  return;
                }
                if (purgeConfirmText.trim() !== 'PURGE') {
                  setStatusMessage('Type PURGE before confirming deletion.');
                  return;
                }
                setPurgeReady(true);
                setStatusMessage(`Purge confirmed for ${archivedHistoryMonth}. Click Purge archived month to continue.`);
              }}
              disabled={!archivedHistoryData || purgeArchivedLoading}
            >
              Confirm purge
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void purgeArchivedHistory()} disabled={purgeArchivedLoading || !archivedHistoryData}>
              {purgeArchivedLoading ? 'Purging...' : 'Purge archived month'}
            </button>
          </div>
          {purgeReady ? <div className="status purge-ready-note">Final confirmation armed. Purge will permanently delete the archived records listed above.</div> : null}
        </div>
        {!archivedHistoryData ? <div className="status">Select a client and archived month to view archived records.</div> : null}
        {archivedHistoryData ? (
          <div className="archived-history-grid">
            <div className="mini-card">
              <h3>Archived summary</h3>
              <p className="mini-copy">Month: {archivedHistoryData.month}</p>
              <div className="status">{archivedHistoryData.assignments.length} assignments, {archivedHistoryData.visits.length} visits, {archivedHistoryData.tasks.length} tasks</div>
              <div className="status">{archivedHistoryData.requests.length} requests, {archivedHistoryData.contactAudits.length} contact changes, {archivedHistoryData.assignmentAudits.length} assignment lifecycle, {archivedHistoryData.notifications.length} notifications</div>
            </div>
            <div className="mini-card">
              <h3>Elderly profiles</h3>
              {archivedHistoryData.elderlyMembers.length === 0 ? <div className="status">No profiles in this archived scope.</div> : null}
              {archivedHistoryData.elderlyMembers.map((entry) => (
                <div className="event" key={entry.id}>
                  <div>
                    <strong>{entry.full_name}</strong>
                    <div className="meta">Age: {entry.age} • {entry.address}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mini-card">
              <h3>Assignments</h3>
              {archivedHistoryData.assignments.length === 0 ? <div className="status">No archived assignments.</div> : null}
              {archivedHistoryData.assignments.map((entry) => (
                <div className="event" key={entry.id}>
                  <div>
                    <strong>{entry.buddy_name} → {entry.elderly_name}</strong>
                    <div className="meta">{entry.status} • {getAssignmentPlanSummary(entry)} • {entry.end_date || 'No end date'}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mini-card">
              <h3>Visits</h3>
              {archivedHistoryData.visits.length === 0 ? <div className="status">No archived visits.</div> : null}
              {archivedHistoryData.visits.map((entry) => (
                <div className="event" key={entry.id}>
                  <div>
                    <strong>{entry.scheduled_date} • {entry.client_name}</strong>
                    <div className="meta">{entry.buddy_name} • {entry.visit_status || 'scheduled'} • {entry.status_check || 'No status check'}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mini-card">
              <h3>Tasks</h3>
              {archivedHistoryData.tasks.length === 0 ? <div className="status">No archived tasks.</div> : null}
              {archivedHistoryData.tasks.map((entry) => (
                <div className="event" key={entry.id}>
                  <div>
                    <strong>{entry.task_name}</strong>
                    <div className="meta">{entry.client_name} • {entry.status} • {entry.updated_at ? new Date(entry.updated_at).toLocaleString() : 'No update time'}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mini-card">
              <h3>Requests</h3>
              {archivedHistoryData.requests.length === 0 ? <div className="status">No archived requests.</div> : null}
              {archivedHistoryData.requests.map((entry, index) => (
                <div className="event" key={`${entry.user_id}-${index}`}>
                  <div>
                    <strong>{entry.request_type}</strong>
                    <div className="meta">{new Date(entry.timestamp).toLocaleString()} • {entry.message}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mini-card">
              <h3>Contact changes</h3>
              {archivedHistoryData.contactAudits.length === 0 ? <div className="status">No archived contact changes.</div> : null}
              {archivedHistoryData.contactAudits.map((entry) => (
                <div className="event" key={entry.id}>
                  <div>
                    <strong>{getAuditActionLabel(entry.action_type)}</strong>
                    <div className="meta">{entry.contact_name || 'Family member'} • {entry.phone} • {entry.actor_name}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mini-card">
              <h3>Assignment lifecycle</h3>
              {archivedHistoryData.assignmentAudits.length === 0 ? <div className="status">No archived assignment lifecycle activity.</div> : null}
              {archivedHistoryData.assignmentAudits.map((entry) => (
                <div className="event" key={entry.id}>
                  <div>
                    <strong>{entry.buddy_name || 'Caretaker'} → {entry.elderly_name || 'Client'}</strong>
                    <div className="meta">{entry.from_status || 'none'} → {entry.to_status} • {entry.actor_name}</div>
                    <div className="meta">{new Date(entry.created_at).toLocaleString()}</div>
                    {entry.notes ? <div className="meta">{entry.notes}</div> : null}
                  </div>
                </div>
              ))}
            </div>
            <div className="mini-card">
              <h3>Notifications</h3>
              {archivedHistoryData.notifications.length === 0 ? <div className="status">No archived notifications.</div> : null}
              {archivedHistoryData.notifications.map((entry) => (
                <div className="event" key={entry.id}>
                  <div>
                    <strong>{entry.channel.toUpperCase()} • {entry.template_key.replace(/_/g, ' ')}</strong>
                    <div className="meta">{entry.recipient_name} • {entry.actor_name} • {new Date(entry.created_at).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mini-card">
              <h3>Purge audit</h3>
              {archivedHistoryData.purgeLogs.length === 0 ? <div className="status">No purge activity recorded for this month.</div> : null}
              {archivedHistoryData.purgeLogs.map((entry) => (
                <div className="event" key={entry.id}>
                  <div>
                    <strong>{entry.archive_month} purge</strong>
                    <div className="meta">By {entry.actor_name} on {new Date(entry.created_at).toLocaleString()}</div>
                    <div className="meta">
                      {entry.assignments_deleted} assignments, {entry.visits_deleted} visits, {entry.tasks_deleted} tasks, {entry.requests_deleted} requests
                    </div>
                    <div className="meta">
                      {entry.contact_audits_deleted} contact changes, {entry.assignment_lifecycle_audits_deleted} assignment lifecycle, {entry.notifications_deleted} notifications
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>}
      {adminTab === 'visits' && <div className="panel">
        <div className="assignment-toolbar">
          <div>
            <h2>Active visits and location</h2>
            <p className="directory-meta">
              {selectedVisitClientId
                ? `${visibleVisits.length} visits for the selected client`
                : `${visibleVisits.length} total visits`}
            </p>
          </div>
          {selectedVisitClientId ? (
            <div className="filter-breadcrumbs">
              <span className="chip">Filtered by: {selectedClientName}</span>
              <button
                type="button"
                className="chip chip-button"
                onClick={() => {
                  setSelectedVisitClientId('');
                  setAdminTab('client-directory');
                }}
              >
                Back to Client Directory
              </button>
            </div>
          ) : null}
        </div>
        {renderStatusLegend()}
        <div className="card-grid">
          {getActiveCaseVisits(visibleVisits).length === 0 ? (
            <div className="mini-card">
              <h3>Active Case Map</h3>
              <div className="status">No active approved visits available for map display.</div>
            </div>
          ) : (
            getActiveCaseVisits(visibleVisits).map((visit) => {
              const locationState = visit.assignment_id ? assignmentLocations[visit.assignment_id] : null;
              const liveLocation = locationState?.currentLocation || null;
              const distanceSummary = getDistanceSummaryForVisit(visit, liveLocation);

              return (
                <div className="mini-card" key={`admin-active-map-${visit.id}`}>
                  <h3>{visit.buddy_name} → {visit.client_name}</h3>
                  <div className="status">Scheduled: {visit.scheduled_date}</div>
                  <div className="directory-detail">{distanceSummary.label}</div>
                  <div className="directory-detail">
                    {liveLocation
                      ? `Updated ${new Date(liveLocation.updated_at).toLocaleTimeString()}`
                      : 'Waiting for live update'}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="table-scroll-wrap">
          <table className="panel-table panel-table-wide">
            <thead>
              <tr>
                <th>Caregiver</th>
                <th>Client</th>
                <th>Scheduled</th>
                <th>Case state</th>
                <th>Start</th>
                <th>End</th>
                <th>Location</th>
                <th>Notes update</th>
                <th>Visit state</th>
                <th>Session</th>
                <th>Save</th>
              </tr>
            </thead>
            <tbody>
              {visibleVisits.map((visit) => {
                const locationState = visit.assignment_id ? assignmentLocations[visit.assignment_id] : null;
                const liveLocation = locationState?.currentLocation || null;
                const isActiveCase = getActiveCaseVisits([visit]).length > 0;
                const distanceSummary = getDistanceSummaryForVisit(visit, liveLocation);
                const displayLocation = locationState?.guarded
                  ? getGuardReasonLabel(locationState.guard_reason_code, locationState.message)
                  : isActiveCase
                    ? distanceSummary.label
                    : 'Map hidden (inactive case)';
                const semanticVisitState = visitEdits[visit.id]?.visit_status || visit.visit_status || 'scheduled';
                const sessionStarted = isVisitSessionStarted(visit);
                const sessionClosed = isVisitSessionClosed(visit);

                return (
                  <tr key={visit.id}>
                    <td data-label="Caregiver">{visit.buddy_name}</td>
                    <td data-label="Client">{visit.client_name}</td>
                    <td data-label="Scheduled">{visit.scheduled_date}</td>
                    <td data-label="Case state"><span className={getSemanticStatusClassName(semanticVisitState)}>{getSemanticStatusLabel(semanticVisitState)}</span></td>
                    <td data-label="Start">{visit.arrival_time ? new Date(visit.arrival_time).toLocaleString() : 'Pending'}</td>
                    <td data-label="End">{visit.departure_time ? new Date(visit.departure_time).toLocaleString() : 'Pending'}</td>
                    <td data-label="Location">{displayLocation}</td>
                    <td data-label="Notes update" className="visit-notes-cell">
                      <textarea
                        className="small-input"
                        rows={3}
                        value={visitEdits[visit.id]?.client_visible_notes ?? visit.client_visible_notes ?? ''}
                        onChange={(event) => handleVisitEditChange(visit.id, 'client_visible_notes', event.target.value)}
                        placeholder="Update for kin or mapped client"
                      />
                      <div className="directory-meta">Internal note: {visit.buddy_notes || 'None'}</div>
                    </td>
                    <td data-label="Visit state">
                      <span className={getSemanticStatusClassName(semanticVisitState)}>{getSemanticStatusLabel(semanticVisitState)}</span>
                      <select className="small-input" value={visitEdits[visit.id]?.visit_status || visit.visit_status || 'scheduled'} onChange={(event) => handleVisitEditChange(visit.id, 'visit_status', event.target.value)}>
                        <option value="scheduled">scheduled</option>
                        <option value="in_progress">in_progress</option>
                        <option value="completed">completed</option>
                        <option value="missed">missed</option>
                        <option value="cancelled">cancelled</option>
                      </select>
                    </td>
                    <td data-label="Session" className="visit-session-cell">
                      <div className="directory-actions session-action-group">
                        <button className="btn btn-secondary" type="button" onClick={() => void handleStartVisitSession(visit)} disabled={visit.scheduled_date !== new Date().toISOString().slice(0, 10) || sessionStarted || sessionClosed}>
                          Start
                        </button>
                        <button className="btn btn-secondary" type="button" onClick={() => void handleCompleteVisitSession(visit)} disabled={visit.scheduled_date !== new Date().toISOString().slice(0, 10) || !sessionStarted || sessionClosed}>
                          End
                        </button>
                        <button className="btn btn-secondary" type="button" onClick={() => void handleBackfillVisitSession(visit)} disabled={visit.scheduled_date !== new Date().toISOString().slice(0, 10) || !sessionStarted || sessionClosed}>
                          Backfill
                        </button>
                      </div>
                    </td>
                    <td data-label="Save">
                      <button className="btn btn-secondary" type="button" onClick={() => handleVisitAdminUpdate(visit.id)}>Save</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>}
    </>
  );

  const clientDashboard = () => (
    <>
      <section className="hero">
        <div>
          <p className="hero-label">Client portal</p>
          <h1>Current caretaker status</h1>
          <p className="hero-copy">
            View-only access to tasks, care visits, and caretaker location. Send a request if you need an additional task or special care note.
          </p>
        </div>
        <div className="hero-card">
          <div className="tiny">Logged in as</div>
          <div className="metric">{user?.name}</div>
          <div>Email: {user?.email}</div>
          <ul>
            <li>Read-only view of caregiver progress</li>
            <li>Send request and feedback to admin</li>
            <li>Caretaker locations update automatically</li>
          </ul>
        </div>
      </section>
      {renderDashboardTabs(
        [
          { key: 'visits', label: 'Visits' },
          { key: 'requests', label: 'Requests' },
        ],
        clientTab,
        (key) => setClientTab(key as ClientTab),
      )}
      {clientTab === 'visits' && <div className="panel">
        <h2>Assignment approvals</h2>
        {assignments.filter((assignment) => (assignment.approval_state || 'pending_approval') === 'pending_approval').length === 0 ? (
          <div className="status">No assignments pending your approval.</div>
        ) : (
          <div className="card-grid">
            {assignments
              .filter((assignment) => (assignment.approval_state || 'pending_approval') === 'pending_approval')
              .map((assignment) => (
                <div className="mini-card" key={`client-approval-${assignment.id}`}>
                  <div className="name">{assignment.buddy_name} → {assignment.elderly_name}</div>
                  <div className="status">{getAssignmentPlanSummary(assignment)}</div>
                  <div className="directory-detail">Admin note: {stripClientCoordsTag(assignment.admin_notes) || 'No note'}</div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void handleClientAssignmentApprove(assignment.id)}
                  >
                    Approve assignment
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>}
      {clientTab === 'visits' && <div className="panel">
        <h2>Long-term daily progress</h2>
        {activeLongTermAssignments.length === 0 ? (
          <div className="status">No active long-term cases right now.</div>
        ) : (
          <div className="card-grid">
            {activeLongTermAssignments.map((assignment) => {
              const latestRecord = latestDailyRecordByAssignment[assignment.id];
              return (
                <div className="mini-card" key={`client-long-term-${assignment.id}`}>
                  <div className="name">{assignment.buddy_name} → {assignment.elderly_name}</div>
                  <div className="status">{getAssignmentPlanSummary(assignment)}</div>
                  <div className="directory-detail">Today: {latestRecord?.session_date || 'No update yet'}</div>
                  <div className="directory-detail">In: {latestRecord?.intime ? new Date(latestRecord.intime).toLocaleTimeString() : 'Pending'}</div>
                  <div className="directory-detail">Out: {latestRecord?.outtime ? new Date(latestRecord.outtime).toLocaleTimeString() : 'Pending'}</div>
                  <div className="directory-detail">Entry note: {latestRecord?.entry_notes || 'Not added'}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>}
      {clientTab === 'visits' && <div className="panel">
        <h2>Active case map</h2>
        <div className="card-grid">
          {(() => {
            const activeCaseVisits = getActiveCaseVisits(visits);
            if (activeCaseVisits.length === 0) {
              return (
            <div className="mini-card">
              <h3>No active case right now</h3>
                  <div className="status">Location appears only after the caretaker starts the active visit session.</div>
            </div>
              );
            }

            return (
              <>
                {activeCaseVisits.map((visit) => {
              const locationState = visit.assignment_id ? assignmentLocations[visit.assignment_id] : null;
              const liveLocation = locationState?.currentLocation || null;
              const distanceSummary = getDistanceSummaryForVisit(visit, liveLocation);

              return (
                <div className="mini-card" key={`client-active-map-${visit.id}`}>
                  <h3>{visit.buddy_name}</h3>
                  <div className="status">Scheduled: {visit.scheduled_date}</div>
                  <div className="directory-detail">{distanceSummary.label}</div>
                  <div className="directory-detail">
                    {liveLocation
                      ? `Updated ${new Date(liveLocation.updated_at).toLocaleTimeString()}`
                      : 'Waiting for live update'}
                  </div>
                </div>
              );
                })}
              </>
            );
          })()}
        </div>

      </div>}
      {clientTab === 'visits' && <div className="panel">
        <h2>Current visits</h2>
        {renderStatusLegend()}
        <table className="panel-table mobile-stack">
          <thead>
            <tr>
              <th>Caretaker</th>
              <th>Scheduled</th>
              <th>Start</th>
              <th>Status</th>
              <th>Notes update</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            {visits.map((visit) => {
              const locationState = visit.assignment_id ? assignmentLocations[visit.assignment_id] : null;
              const liveLocation = locationState?.currentLocation || null;
              const isActiveCase = getActiveCaseVisits([visit]).length > 0;
              const distanceSummary = getDistanceSummaryForVisit(visit, liveLocation);
              const displayLocation = locationState?.guarded
                ? getGuardReasonLabel(locationState.guard_reason_code, locationState.message)
                : isActiveCase
                  ? distanceSummary.label
                  : 'Map hidden (inactive case)';

              return (
                <tr key={visit.id}>
                  <td data-label="Caretaker">{visit.buddy_name}</td>
                  <td data-label="Scheduled">{visit.scheduled_date}</td>
                  <td data-label="Start">{visit.arrival_time || 'Pending'}</td>
                  <td data-label="Status">
                    <span className={getSemanticStatusClassName(visit.visit_status || 'scheduled')}>{getSemanticStatusLabel(visit.visit_status || 'scheduled')}</span>
                  </td>
                  <td data-label="Notes update">{visit.client_visible_notes || 'No care update yet.'}</td>
                  <td data-label="Location">{displayLocation}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>}
      {clientTab === 'visits' && <div className="panel">
        <h2>Care updates</h2>
        {visits.filter((visit) => String(visit.client_visible_notes || '').trim()).length === 0 ? (
          <div className="status">No care updates shared yet.</div>
        ) : (
          <div className="family-audit-list">
            {visits
              .filter((visit) => String(visit.client_visible_notes || '').trim())
              .map((visit) => (
                <div key={`client-care-update-${visit.id}`} className="family-audit-item">
                  <div className="meta">{visit.buddy_name} • {visit.scheduled_date}</div>
                  <div className="status">{visit.client_visible_notes}</div>
                </div>
              ))}
          </div>
        )}
      </div>}
      {clientTab === 'requests' && <div className="panel">
        <h2>Request feedback or task support</h2>
        <form onSubmit={handleRequestSubmit} className="auth-form">
          <label>
            Request type
            <select className="small-input" value={requestForm.request_type} onChange={handleRequestTypeChange}>
              <option value="task_request">Task request</option>
              <option value="feedback">Feedback</option>
            </select>
          </label>
          {requestForm.request_type === 'feedback' ? (
            <label>
              Feedback case
              <select className="small-input" value={requestForm.feedback_assignment_id} onChange={handleRequestCaseChange}>
                <option value="">Select case</option>
                {clientFeedbackTargets.map((item) => (
                  <option key={`feedback-target-${item.assignment_id}`} value={item.assignment_id}>
                    {item.label}
                  </option>
                ))}
              </select>
              {clientFeedbackTargets.length === 0 ? <div className="directory-meta">No active approved caretaker plan linked to your profile yet.</div> : null}
            </label>
          ) : null}
          <label>
            Request details
            <textarea className="small-input" value={requestForm.message} onChange={handleRequestChange} rows={4} placeholder="Describe your feedback or task request." />
          </label>
          <button className="btn btn-primary auth-submit" type="submit">Send request</button>
        </form>
      </div>}
      {clientTab === 'requests' && <div className="panel">
        <h2>My request history</h2>
        <div className="table-scroll-wrap">
          <table className="panel-table panel-table-wide">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Type</th>
                <th>Message</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request, index) => (
                <tr key={request.id ?? `${request.user_id}-${index}`}>
                  <td>{new Date(request.timestamp).toLocaleString()}</td>
                  <td>{`${request.user_id} / ${request.user_name || 'Unknown'}`}</td>
                  <td>{request.request_type}</td>
                  <td>{request.message}</td>
                  <td>{getRequestStatusLabel(normalizeRequestStatusForUi(request.status))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>}
    </>
  );

  const buddyDashboard = () => (
    <>
      <section className="hero">
        <div>
          <p className="hero-label">Caretaker portal</p>
          <h1>My assignments and active tasks</h1>
          <p className="hero-copy">
            Review your tasks, update task progress, and refresh your location so admin and clients see your current status.
          </p>
        </div>
        <div className="hero-card">
          <div className="tiny">Buddy account</div>
          <div className="metric">{user?.name}</div>
          <div>Email: {user?.email}</div>
          <ul>
            <li>Update task progress directly</li>
            <li>Refresh location when you begin work or refresh the page</li>
            <li>Track visit status and start time</li>
          </ul>
        </div>
      </section>
      {renderDashboardTabs(
        [
          { key: 'location', label: 'Location' },
          { key: 'visits', label: 'Visits' },
        ],
        buddyTab,
        (key) => setBuddyTab(key as BuddyTab),
      )}
      {buddyTab === 'location' && <div className="panel">
        <div className="inline-row">
          <h2>Current location</h2>
          <button className="btn btn-secondary" onClick={() => void refreshLocation()} disabled={getActiveCaseVisits(visits).length === 0}>Refresh location</button>
        </div>
        <p>{location ? `${location.lat}, ${location.lng} (updated ${new Date(location.updated_at).toLocaleTimeString()})` : 'Location not set yet.'}</p>
      </div>}
      {buddyTab === 'visits' && <div className="panel">
        <h2>Daily long-term record</h2>
        {activeLongTermAssignments.length === 0 ? (
          <div className="status">No active approved long-term assignment for this shift.</div>
        ) : (
          <div className="card-grid">
            {activeLongTermAssignments.map((assignment) => {
              const latestRecord = latestDailyRecordByAssignment[assignment.id];
              const draft = dailyRecordDrafts[assignment.id] || { intime: '', outtime: '', entry_notes: '', exit_notes: '' };
              return (
                <div className="mini-card" key={`buddy-daily-${assignment.id}`}>
                  <div className="name">{assignment.elderly_name}</div>
                  <div className="status">{getAssignmentPlanSummary(assignment)}</div>
                  <div className="directory-detail">Latest: {latestRecord?.session_date || 'No record yet'}</div>
                  <label>
                    In time
                    <input className="small-input" type="datetime-local" value={draft.intime} onChange={(event) => handleDailyRecordDraftChange(assignment.id, 'intime', event.target.value)} />
                  </label>
                  <label>
                    Out time
                    <input className="small-input" type="datetime-local" value={draft.outtime} onChange={(event) => handleDailyRecordDraftChange(assignment.id, 'outtime', event.target.value)} />
                  </label>
                  <label>
                    Entry notes
                    <textarea className="small-input" rows={2} value={draft.entry_notes} onChange={(event) => handleDailyRecordDraftChange(assignment.id, 'entry_notes', event.target.value)} />
                  </label>
                  <label>
                    Exit notes
                    <textarea className="small-input" rows={2} value={draft.exit_notes} onChange={(event) => handleDailyRecordDraftChange(assignment.id, 'exit_notes', event.target.value)} />
                  </label>
                  <button type="button" className="btn btn-primary" onClick={() => void handleSaveDailyRecord(assignment.id)}>Save daily record</button>
                </div>
              );
            })}
          </div>
        )}
      </div>}
      {buddyTab === 'visits' && <div className="panel">
        <h2>Visits</h2>
        {renderStatusLegend()}
        <div className="table-scroll-wrap">
          <table className="panel-table panel-table-wide">
            <thead>
              <tr>
                <th>Client</th>
                <th>Scheduled</th>
                <th>Case state</th>
                <th>Arrival</th>
                <th>Notes update</th>
                <th>Session</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((visit) => {
                const semanticVisitState = visit.visit_status || 'scheduled';
                const todaySession = visit.assignment_id ? getTodaySessionForAssignment(visit.assignment_id) : null;
                const sessionStarted = isVisitSessionStarted(visit);
                const sessionClosed = isVisitSessionClosed(visit);
                return (
                  <tr key={visit.id}>
                    <td data-label="Client">{visit.client_name}</td>
                    <td data-label="Scheduled">{visit.scheduled_date}</td>
                    <td data-label="Case state"><span className={getSemanticStatusClassName(semanticVisitState)}>{getSemanticStatusLabel(semanticVisitState)}</span></td>
                    <td data-label="Arrival">{visit.arrival_time || 'Pending'}</td>
                    <td data-label="Notes update" className="visit-notes-cell">
                      <textarea
                        className="small-input"
                        rows={3}
                        value={visitEdits[visit.id]?.client_visible_notes ?? visit.client_visible_notes ?? ''}
                        onChange={(event) => handleVisitEditChange(visit.id, 'client_visible_notes', event.target.value)}
                        placeholder="Update for kin or mapped client"
                      />
                      <button className="btn btn-secondary" type="button" onClick={() => handleVisitAdminUpdate(visit.id)}>
                        Save note update
                      </button>
                    </td>
                    <td data-label="Session" className="visit-session-cell">
                      <div className="directory-actions session-action-group">
                        <button className="btn btn-secondary" type="button" onClick={() => void handleStartVisitSession(visit)} disabled={visit.scheduled_date !== new Date().toISOString().slice(0, 10) || sessionStarted || sessionClosed}>
                          Start
                        </button>
                        <button className="btn btn-secondary" type="button" onClick={() => void handleCompleteVisitSession(visit)} disabled={visit.scheduled_date !== new Date().toISOString().slice(0, 10) || !sessionStarted || sessionClosed}>
                          End
                        </button>
                        <button className="btn btn-secondary" type="button" onClick={() => void handleBackfillVisitSession(visit)} disabled={visit.scheduled_date !== new Date().toISOString().slice(0, 10) || !sessionStarted || sessionClosed}>
                          Backfill
                        </button>
                        <div className="directory-meta">
                          {todaySession?.intime ? `In ${new Date(todaySession.intime).toLocaleTimeString()}` : 'Not started'}
                          {todaySession?.outtime ? ` / Out ${new Date(todaySession.outtime).toLocaleTimeString()}` : ''}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>}
    </>
  );

  if (!user) {
    return (
      <div className="wrap auth-wrap">
        {renderConnectivityBanner()}
        <div className="auth-box">
          <div className="auth-header">
            <div>
              <div className="brand">
                <div className="brand-badge">G</div>
                <div>
                  <div>Gatt & Co</div>
                  <div className="brand-subtitle">Care access portal</div>
                </div>
              </div>
              <p className="auth-intro">Sign in with the seeded accounts below or ask the admin to create a caretaker or client account.</p>
            </div>
          </div>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              User ID, email, or phone
              <input type="text" value={authForm.identifier} onChange={handleChange('identifier')} placeholder="admin, 9743666761, or admin@gattandco.local" />
            </label>
            <label>
              Password
              <input type="password" value={authForm.password} onChange={handleChange('password')} placeholder="1234567890" />
            </label>
            {message && <div className="auth-message">{message}</div>}
            <button className="btn btn-primary auth-submit" type="submit">Login</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      {renderHeader()}
      {renderConnectivityBanner()}
      {user.role === 'admin' && adminDashboard()}
      {user.role === 'client' && clientDashboard()}
      {user.role === 'buddy' && buddyDashboard()}
      {renderAssignmentDetailsOverlay()}
      {renderClientAuditOverlay()}
      {renderCalendarDayDetailsOverlay()}
      {renderVisitReassignmentModal()}
      {renderBackfillConflictModal()}
      {renderStatusPopup()}
    </div>
  );
}

export default App;

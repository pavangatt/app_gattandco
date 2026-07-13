// Pure helper utilities extracted from server.js so they can be unit tested in
// isolation without booting the Express app or a Supabase client. server.js
// imports these back so runtime behavior is unchanged.

export const CLIENT_ONBOARDING_TYPES = new Set(['self_service', 'kin_requested']);
export const SERVICE_PLAN_TYPES = new Set(['short_term', 'long_term']);
export const APPROVAL_STATES = new Set(['pending_approval', 'approved', 'rejected', 'rescheduled']);
export const ASSIGNMENT_STATUSES = new Set(['active', 'paused', 'completed', 'cancelled']);
export const CARE_SHIFTS = new Set(['morning_10h', 'night_10h', 'full_day']);
export const MONTHLY_VISIT_PLAN_VALUES = new Set([3, 6, 9]);
export const PLANNED_VISIT_DURATION_VALUES = new Set([60, 90]);
export const REQUEST_STATUS_VALUES = new Set(['new', 'viewed', 'read', 'awaiting_assignee', 'assigned', 'resolved', 'closed']);
export const REMINDER_TEMPLATE_KEYS = new Set(['visit_reminder_d1', 'backfilled_visit_notice', 'family_monthly_update']);
export const DEFAULT_REMINDER_SETTINGS = {
  visit_reminder_d1: true,
  backfilled_visit_notice: true,
  family_monthly_update: false,
};
export const SERVICE_NAME_BY_CODE = {
  walking_companion: 'Walking companion',
  conversation_emotional_support: 'Conversation and emotional support',
  hospital_accompaniment: 'Hospital accompaniment',
  medicine_pickup: 'Medicine pickup',
  grocery_shopping_assistance: 'Grocery shopping assistance',
  technology_help: 'Technology help',
  monthly_family_updates: 'Monthly family updates',
};

export function throwIfError(error, context) {
  if (error) {
    const message = `${context}: ${error.message}`;
    throw new Error(message);
  }
}

export function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

export function normalizeUserId(value) {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'user';
}

export function normalizeClientOnboardingType(value, role) {
  if (role !== 'client') {
    return null;
  }

  const normalized = String(value || 'kin_requested').trim().toLowerCase();
  if (!CLIENT_ONBOARDING_TYPES.has(normalized)) {
    throw new Error('Client onboarding type must be self_service or kin_requested.');
  }
  return normalized;
}

export function normalizeServicePlanType(value, fallbackTermType = 'short') {
  const normalized = String(value || '').trim().toLowerCase();
  if (SERVICE_PLAN_TYPES.has(normalized)) {
    return normalized;
  }

  return String(fallbackTermType || 'short').trim().toLowerCase() === 'long' ? 'long_term' : 'short_term';
}

export function normalizeApprovalState(value) {
  const normalized = String(value || 'pending_approval').trim().toLowerCase();
  if (!APPROVAL_STATES.has(normalized)) {
    throw new Error('Approval state must be pending_approval, approved, rejected, or rescheduled.');
  }
  return normalized;
}

export function normalizeCareShift(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (!CARE_SHIFTS.has(normalized)) {
    throw new Error('Care shift must be morning_10h, night_10h, or full_day.');
  }
  return normalized;
}

export function normalizeIntegerValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeDateOnly(value, fallback = null) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return fallback;
  }

  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error('Date must use YYYY-MM-DD format.');
  }
  return text;
}

export function normalizeServiceCodes(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  const deduped = [];
  for (const rawValue of values) {
    const normalized = String(rawValue || '').trim().toLowerCase();
    if (!normalized) {
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(SERVICE_NAME_BY_CODE, normalized)) {
      throw new Error(`Unsupported service code: ${normalized}`);
    }
    if (!deduped.includes(normalized)) {
      deduped.push(normalized);
    }
  }
  return deduped;
}

export function getServiceName(serviceCode) {
  return SERVICE_NAME_BY_CODE[serviceCode] || serviceCode;
}

export function getLegacyTermType(servicePlanType) {
  return servicePlanType === 'long_term' ? 'long' : 'short';
}

export function mapApprovalStateToAssignmentStatus(approvalState) {
  return approvalState === 'approved' ? 'active' : 'paused';
}

export function normalizeAssignmentStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!ASSIGNMENT_STATUSES.has(normalized)) {
    throw new Error('Assignment status must be active, paused, completed, or cancelled.');
  }
  return normalized;
}

export function normalizeRequestStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!REQUEST_STATUS_VALUES.has(normalized)) {
    throw new Error('Request status must be new, viewed, read, awaiting_assignee, assigned, resolved, or closed.');
  }
  return normalized;
}

export function normalizeRequestStatusForRead(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'open') {
    return 'new';
  }
  if (normalized === 'in_progress') {
    return 'viewed';
  }
  if (!normalized) {
    return 'new';
  }
  return normalized;
}

export function getArchiveMonthRange(archiveMonth) {
  const [yearText, monthText] = String(archiveMonth || '').split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;

  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new Error('Archive month must use YYYY-MM format.');
  }

  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1));
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export function getMonthRange(monthValue) {
  const normalized = String(monthValue || '').trim();
  if (!/^\d{4}-\d{2}$/.test(normalized)) {
    throw new Error('Month must use YYYY-MM format.');
  }

  const [yearText, monthText] = normalized.split('-');
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new Error('Month must use YYYY-MM format.');
  }

  const monthStart = new Date(Date.UTC(year, monthIndex, 1));
  const monthEndExclusive = new Date(Date.UTC(year, monthIndex + 1, 1));
  const daysInMonth = Math.round((monthEndExclusive.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24));

  return {
    month: normalized,
    startDate: monthStart.toISOString().slice(0, 10),
    endDate: new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10),
    startIso: monthStart.toISOString(),
    endExclusiveIso: monthEndExclusive.toISOString(),
    firstWeekdayUtc: monthStart.getUTCDay(),
    daysInMonth,
  };
}

export function parseOptionalPositiveInt(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Filter ids must be positive numbers.');
  }
  return Math.floor(parsed);
}

export function buildDateStringsForMonth(monthRange) {
  const values = [];
  for (let day = 1; day <= monthRange.daysInMonth; day += 1) {
    const text = `${monthRange.month}-${String(day).padStart(2, '0')}`;
    values.push(text);
  }
  return values;
}

export function getOverlappingDaysInMonth(startDate, endDate, monthRange) {
  const assignmentStart = String(startDate || '').trim() || monthRange.startDate;
  const assignmentEnd = String(endDate || '').trim() || monthRange.endDate;
  const overlapStart = assignmentStart > monthRange.startDate ? assignmentStart : monthRange.startDate;
  const overlapEnd = assignmentEnd < monthRange.endDate ? assignmentEnd : monthRange.endDate;

  if (overlapEnd < overlapStart) {
    return 0;
  }

  const startMs = Date.parse(`${overlapStart}T00:00:00.000Z`);
  const endMs = Date.parse(`${overlapEnd}T00:00:00.000Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return 0;
  }

  return Math.floor((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1;
}

export function getReminderTemplatePreview(templateKey) {
  if (templateKey === 'visit_reminder_d1') {
    return 'Reminder: {buddy_name} is scheduled to visit {elderly_name} on {visit_date}.';
  }
  if (templateKey === 'backfilled_visit_notice') {
    return 'Update: {buddy_name} visited on {visit_date} at {visit_time}. (Backfilled entry)';
  }
  if (templateKey === 'family_monthly_update') {
    return 'Monthly family update: care summary for {elderly_name} for {month_label} is available.';
  }
  return '';
}

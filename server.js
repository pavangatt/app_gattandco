import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import session from 'express-session';
import createMemoryStore from 'memorystore';
import path from 'path';
import fs from 'fs';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const MemoryStore = createMemoryStore(session);

const sessionSecret = process.env.SESSION_SECRET || 'change-me-in-production';
app.use(
  session({
    store: new MemoryStore({
      checkPeriod: 1000 * 60 * 60 * 24,
    }),
    name: 'gatt_sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 8,
    },
  }),
);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing Supabase config. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.');
  process.exit(1);
}

if (supabaseServiceRoleKey.startsWith('sb_publishable_')) {
  console.error('Invalid SUPABASE_SERVICE_ROLE_KEY. You provided a publishable key. Use the service_role key from Supabase Project Settings -> API.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const currentLocations = {};
let dbReady = false;
let startupWarning = null;

async function initDb() {
  const { error } = await supabase.from('users').select('id', { head: true, count: 'exact' });
  if (error) {
    throw error;
  }
}

function throwIfError(error, context) {
  if (error) {
    const message = `${context}: ${error.message}`;
    throw new Error(message);
  }
}

function ensureAdminSession(req, res) {
  if (!req.session.user) {
    res.status(401).json({ message: 'Login required.' });
    return false;
  }

  if (req.session.user.role !== 'admin') {
    res.status(403).json({ message: 'Admin access required.' });
    return false;
  }

  return true;
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function normalizeUserId(value) {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'user';
}

const CLIENT_ONBOARDING_TYPES = new Set(['self_service', 'kin_requested']);
const SERVICE_PLAN_TYPES = new Set(['short_term', 'long_term']);
const APPROVAL_STATES = new Set(['pending_approval', 'approved', 'rejected', 'rescheduled']);
const ASSIGNMENT_STATUSES = new Set(['active', 'paused', 'completed', 'cancelled']);
const CARE_SHIFTS = new Set(['morning_10h', 'night_10h', 'full_day']);
const MONTHLY_VISIT_PLAN_VALUES = new Set([3, 6, 9]);
const PLANNED_VISIT_DURATION_VALUES = new Set([60, 90]);
const REQUEST_STATUS_VALUES = new Set(['new', 'viewed', 'read', 'awaiting_assignee', 'assigned', 'resolved', 'closed']);
const REMINDER_TEMPLATE_KEYS = new Set(['visit_reminder_d1', 'backfilled_visit_notice', 'family_monthly_update']);
const DEFAULT_REMINDER_SETTINGS = {
  visit_reminder_d1: true,
  backfilled_visit_notice: true,
  family_monthly_update: false,
};
const SERVICE_NAME_BY_CODE = {
  walking_companion: 'Walking companion',
  conversation_emotional_support: 'Conversation and emotional support',
  hospital_accompaniment: 'Hospital accompaniment',
  medicine_pickup: 'Medicine pickup',
  grocery_shopping_assistance: 'Grocery shopping assistance',
  technology_help: 'Technology help',
  monthly_family_updates: 'Monthly family updates',
};

function normalizeClientOnboardingType(value, role) {
  if (role !== 'client') {
    return null;
  }

  const normalized = String(value || 'kin_requested').trim().toLowerCase();
  if (!CLIENT_ONBOARDING_TYPES.has(normalized)) {
    throw new Error('Client onboarding type must be self_service or kin_requested.');
  }
  return normalized;
}

function normalizeServicePlanType(value, fallbackTermType = 'short') {
  const normalized = String(value || '').trim().toLowerCase();
  if (SERVICE_PLAN_TYPES.has(normalized)) {
    return normalized;
  }

  return String(fallbackTermType || 'short').trim().toLowerCase() === 'long' ? 'long_term' : 'short_term';
}

function normalizeApprovalState(value) {
  const normalized = String(value || 'pending_approval').trim().toLowerCase();
  if (!APPROVAL_STATES.has(normalized)) {
    throw new Error('Approval state must be pending_approval, approved, rejected, or rescheduled.');
  }
  return normalized;
}

function normalizeCareShift(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (!CARE_SHIFTS.has(normalized)) {
    throw new Error('Care shift must be morning_10h, night_10h, or full_day.');
  }
  return normalized;
}

function normalizeIntegerValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDateOnly(value, fallback = null) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return fallback;
  }

  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error('Date must use YYYY-MM-DD format.');
  }
  return text;
}

function ensureAdminOrBuddySession(req, res) {
  if (!req.session.user) {
    res.status(401).json({ message: 'Login required.' });
    return false;
  }

  if (!['admin', 'buddy'].includes(req.session.user.role)) {
    res.status(403).json({ message: 'Admin or buddy access required.' });
    return false;
  }

  return true;
}

function ensureAdminOrReminderRunner(req, res) {
  if (req.session.user?.role === 'admin') {
    return true;
  }

  const configuredSecret = String(process.env.REMINDER_RUNNER_SECRET || '').trim();
  const providedSecretRaw = String(req.get('x-reminder-secret') || req.get('authorization') || '').trim();
  const providedSecret = providedSecretRaw.toLowerCase().startsWith('bearer ')
    ? providedSecretRaw.slice(7).trim()
    : providedSecretRaw;

  if (configuredSecret && providedSecret === configuredSecret) {
    return true;
  }

  res.status(401).json({ message: 'Admin session or reminder runner secret is required.' });
  return false;
}

function normalizeServiceCodes(values) {
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

function getServiceName(serviceCode) {
  return SERVICE_NAME_BY_CODE[serviceCode] || serviceCode;
}

function getLegacyTermType(servicePlanType) {
  return servicePlanType === 'long_term' ? 'long' : 'short';
}

function mapApprovalStateToAssignmentStatus(approvalState) {
  return approvalState === 'approved' ? 'active' : 'paused';
}

function normalizeAssignmentStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!ASSIGNMENT_STATUSES.has(normalized)) {
    throw new Error('Assignment status must be active, paused, completed, or cancelled.');
  }
  return normalized;
}

function normalizeRequestStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!REQUEST_STATUS_VALUES.has(normalized)) {
    throw new Error('Request status must be new, viewed, read, awaiting_assignee, assigned, resolved, or closed.');
  }
  return normalized;
}

function normalizeRequestStatusForRead(value) {
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

function getArchiveMonthRange(archiveMonth) {
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

function getMonthRange(monthValue) {
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

function parseOptionalPositiveInt(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Filter ids must be positive numbers.');
  }
  return Math.floor(parsed);
}

function buildDateStringsForMonth(monthRange) {
  const values = [];
  for (let day = 1; day <= monthRange.daysInMonth; day += 1) {
    const text = `${monthRange.month}-${String(day).padStart(2, '0')}`;
    values.push(text);
  }
  return values;
}

function getOverlappingDaysInMonth(startDate, endDate, monthRange) {
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

async function archiveRecordsByIds(tableName, ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return 0;
  }

  const { error } = await supabase.from(tableName).update({ archived_at: new Date().toISOString() }).in('id', ids);
  throwIfError(error, `Unable to archive records in ${tableName}`);
  return ids.length;
}

async function deleteRecordsByIds(tableName, ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return 0;
  }

  const { error } = await supabase.from(tableName).delete().in('id', ids);
  throwIfError(error, `Unable to purge records in ${tableName}`);
  return ids.length;
}

async function getActiveApprovedAssignmentForLocation(assignmentId) {
  const { data: assignmentRow, error: assignmentError } = await supabase
    .from('assignments')
    .select('id, buddy_id, elderly_id, approval_state, status, archived_at')
    .eq('id', Number(assignmentId))
    .single();
  throwIfError(assignmentError, 'Unable to load assignment for location access');

  const normalizedApproval = normalizeApprovalState(assignmentRow.approval_state || 'pending_approval');
  const normalizedStatus = normalizeAssignmentStatus(assignmentRow.status || 'paused');
  const isArchived = assignmentRow.archived_at !== null;

  let guardReasonCode = null;
  let guardMessage = null;
  if (isArchived) {
    guardReasonCode = 'archived_assignment';
    guardMessage = 'Map is hidden because this case is archived.';
  } else if (normalizedApproval !== 'approved') {
    guardReasonCode = 'unapproved_assignment';
    guardMessage = 'Map is hidden until this assignment is approved.';
  } else if (normalizedStatus !== 'active') {
    guardReasonCode = 'inactive_assignment';
    guardMessage = 'Map is hidden because this assignment is not active.';
  }

  const isActiveCase = !guardReasonCode;

  return {
    assignmentRow,
    isActiveCase,
    guardReasonCode,
    guardMessage,
  };
}

async function listClientContacts(clientId) {
  const { data, error } = await supabase
    .from('client_family_contacts')
    .select('id, client_id, elderly_id, contact_name, relation_label, phone, whatsapp_opt_in, is_primary, created_at')
    .eq('client_id', Number(clientId))
    .order('created_at', { ascending: true });
  throwIfError(error, 'Unable to load client contacts');
  return data || [];
}

async function createClientContactAuditEntry({
  familyContactId = null,
  clientId,
  elderlyId = null,
  actorUserId = null,
  actionType,
  contactName = '',
  relationLabel = '',
  phone = '',
  whatsappOptIn = false,
  isPrimary = false,
}) {
  const { error } = await supabase.from('client_family_contact_audits').insert({
    family_contact_id: familyContactId,
    client_id: Number(clientId),
    elderly_id: elderlyId ? Number(elderlyId) : null,
    actor_user_id: actorUserId ? Number(actorUserId) : null,
    action_type: actionType,
    contact_name: String(contactName || '').trim(),
    relation_label: String(relationLabel || '').trim(),
    phone: normalizePhone(phone),
    whatsapp_opt_in: Boolean(whatsappOptIn),
    is_primary: Boolean(isPrimary),
  });
  throwIfError(error, 'Unable to create client contact audit entry');
}

async function ensureClientPrimaryContact(clientId, preferredContactId = null, actorUserId = null) {
  const contacts = await listClientContacts(clientId);
  if (contacts.length === 0) {
    return;
  }

  const beforePrimaryMap = {};
  for (const contact of contacts) {
    beforePrimaryMap[contact.id] = Boolean(contact.is_primary);
  }

  const existingPrimary = contacts.find((entry) => entry.is_primary);
  const targetContactId = preferredContactId || existingPrimary?.id || contacts[0].id;

  const { error: resetError } = await supabase
    .from('client_family_contacts')
    .update({ is_primary: false })
    .eq('client_id', Number(clientId))
    .neq('id', Number(targetContactId));
  throwIfError(resetError, 'Unable to reset client primary contacts');

  const { error: markError } = await supabase
    .from('client_family_contacts')
    .update({ is_primary: true })
    .eq('id', Number(targetContactId));
  throwIfError(markError, 'Unable to mark primary client contact');

  const updatedContacts = await listClientContacts(clientId);
  for (const contact of updatedContacts) {
    if (beforePrimaryMap[contact.id] !== Boolean(contact.is_primary)) {
      await createClientContactAuditEntry({
        familyContactId: contact.id,
        clientId: contact.client_id,
        elderlyId: contact.elderly_id,
        actorUserId,
        actionType: 'primary_changed',
        contactName: contact.contact_name,
        relationLabel: contact.relation_label,
        phone: contact.phone,
        whatsappOptIn: contact.whatsapp_opt_in,
        isPrimary: contact.is_primary,
      });
    }
  }
}

function getReminderTemplatePreview(templateKey) {
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

async function getReminderSettingsMap() {
  const settings = { ...DEFAULT_REMINDER_SETTINGS };

  const { data, error } = await supabase
    .from('reminder_automation_settings')
    .select('template_key, enabled')
    .in('template_key', Array.from(REMINDER_TEMPLATE_KEYS));

  if (error) {
    const message = String(error.message || '').toLowerCase();
    if (message.includes('reminder_automation_settings') && (message.includes('does not exist') || message.includes('relation'))) {
      return settings;
    }
    throwIfError(error, 'Unable to load reminder automation settings');
  }

  (data || []).forEach((entry) => {
    if (Object.prototype.hasOwnProperty.call(settings, entry.template_key)) {
      settings[entry.template_key] = Boolean(entry.enabled);
    }
  });

  return settings;
}

async function saveReminderSetting(templateKey, enabled, actorUserId = null) {
  if (!REMINDER_TEMPLATE_KEYS.has(templateKey)) {
    throw new Error('Unsupported reminder template key.');
  }

  const { error } = await supabase
    .from('reminder_automation_settings')
    .upsert(
      {
        template_key: templateKey,
        enabled: Boolean(enabled),
        updated_by: actorUserId ? Number(actorUserId) : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'template_key' },
    );
  throwIfError(error, 'Unable to save reminder automation setting');
}

async function createNotificationActionLogEntry({
  clientId,
  familyContactId = null,
  actorUserId = null,
  recipientRole,
  recipientName = '',
  recipientPhone = '',
  channel,
  templateKey,
  messagePreview = '',
}) {
  const { error } = await supabase.from('notification_action_logs').insert({
    client_id: Number(clientId),
    family_contact_id: familyContactId ? Number(familyContactId) : null,
    actor_user_id: actorUserId ? Number(actorUserId) : null,
    recipient_role: String(recipientRole),
    recipient_name: String(recipientName || '').trim(),
    recipient_phone: normalizePhone(recipientPhone),
    channel: String(channel),
    template_key: String(templateKey),
    message_preview: String(messagePreview || '').trim(),
  });
  throwIfError(error, 'Unable to create notification action log');
}

async function generateUniqueUserId(seedValue) {
  const base = normalizeUserId(seedValue);
  for (let index = 0; index < 50; index += 1) {
    const candidate = index === 0 ? base : `${base}_${index + 1}`;
    const { data, error } = await supabase.from('users').select('id').eq('user_id', candidate).limit(1);
    throwIfError(error, 'Unable to check existing user_id');
    if (!Array.isArray(data) || data.length === 0) {
      return candidate;
    }
  }
  return `user_${Date.now().toString(36)}`;
}

async function fetchUsersMapById(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return {};
  }

  const deduped = Array.from(new Set(ids.filter((id) => Number.isFinite(Number(id))))).map((id) => Number(id));
  if (deduped.length === 0) {
    return {};
  }

  const { data, error } = await supabase.from('users').select('id, user_id, full_name, email, role, phone, address').in('id', deduped);
  throwIfError(error, 'Unable to fetch users');

  const map = {};
  for (const user of data || []) {
    map[user.id] = user;
  }
  return map;
}

async function fetchElderlyMapById(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return {};
  }

  const deduped = Array.from(new Set(ids.filter((id) => Number.isFinite(Number(id))))).map((id) => Number(id));
  if (deduped.length === 0) {
    return {};
  }

  const { data, error } = await supabase.from('elderly_members').select('id, client_id, full_name, age, address').in('id', deduped);
  throwIfError(error, 'Unable to fetch elderly members');

  const map = {};
  for (const member of data || []) {
    map[member.id] = member;
  }
  return map;
}

async function ensureElderlyMember(clientId, fullName) {
  const { data: existing, error: existingError } = await supabase
    .from('elderly_members')
    .select('id')
    .eq('client_id', clientId)
    .limit(1);
  throwIfError(existingError, 'Unable to check elderly member');

  if (Array.isArray(existing) && existing.length > 0) {
    return;
  }

  const { error } = await supabase
    .from('elderly_members')
    .insert({ client_id: clientId, full_name: fullName, age: 65, medical_notes: '', address: 'Unknown address' });
  throwIfError(error, 'Unable to create elderly member');
}

async function ensureUser({ user_id = '', email, full_name, role, password, phone = '', address = '', client_onboarding_type = null, allowExisting = true }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedPhone = normalizePhone(phone);
  const normalizedUserId = user_id ? normalizeUserId(user_id) : await generateUniqueUserId(full_name || normalizedEmail);

  const { data: userIdRows, error: userIdRowsError } = await supabase.from('users').select('id').eq('user_id', normalizedUserId).limit(1);
  throwIfError(userIdRowsError, 'Unable to check existing user_id');
  if (Array.isArray(userIdRows) && userIdRows.length > 0) {
    if (allowExisting) {
      return userIdRows[0].id;
    }
    throw new Error('User ID already exists.');
  }

  const { data: rows, error: rowsError } = await supabase.from('users').select('id').eq('email', normalizedEmail).limit(1);
  throwIfError(rowsError, 'Unable to check existing user');

  if (Array.isArray(rows) && rows.length > 0) {
    if (allowExisting) {
      return rows[0].id;
    }
    throw new Error('Email already exists.');
  }

  if (normalizedPhone) {
    const { data: phoneRows, error: phoneRowsError } = await supabase.from('users').select('id').eq('phone', normalizedPhone).limit(1);
    throwIfError(phoneRowsError, 'Unable to check existing phone');
    if (Array.isArray(phoneRows) && phoneRows.length > 0) {
      if (allowExisting) {
        return phoneRows[0].id;
      }
      throw new Error('Phone number already exists.');
    }
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const normalizedClientOnboardingType = normalizeClientOnboardingType(client_onboarding_type, role);

  const { data: created, error: createError } = await supabase
    .from('users')
    .insert({
      user_id: normalizedUserId,
      full_name,
      email: normalizedEmail,
      phone: normalizedPhone,
      address,
      client_onboarding_type: normalizedClientOnboardingType,
      password_hash: hashedPassword,
      role,
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  throwIfError(createError, 'Unable to create user');

  const userId = created?.id;
  if (role === 'client') {
    if (userId) {
      await ensureElderlyMember(userId, full_name);
    }
  }

  return userId;
}

async function ensureAssignment(buddyId, elderlyId, options = {}) {
  const { data: existing, error: existingError } = await supabase
    .from('assignments')
    .select('id')
    .eq('buddy_id', buddyId)
    .eq('elderly_id', elderlyId)
    .limit(1);
  throwIfError(existingError, 'Unable to check assignment');

  if (Array.isArray(existing) && existing.length > 0) {
    return;
  }

  const status = options.status || 'active';
  const { error: assignmentError } = await supabase.from('assignments').insert({ buddy_id: buddyId, elderly_id: elderlyId, status });
  throwIfError(assignmentError, 'Unable to create assignment');

  const scheduledDate = options.scheduledDate || new Date().toISOString().slice(0, 10);
  const arrivalTime = options.arrivalTime || null;
  const departureTime = options.departureTime || null;
  const arrivalLatLng = options.arrivalLatLng || null;
  const statusCheck = options.statusCheck || (status === 'active' ? 'Good' : null);
  const buddyNotes = options.buddyNotes || `Assigned for ${options.term || 'short'} term`;

  const { error: visitError } = await supabase.from('visits').insert({
    buddy_id: buddyId,
    elderly_id: elderlyId,
    scheduled_date: scheduledDate,
    arrival_time: arrivalTime,
    departure_time: departureTime,
    arrival_lat_lng: arrivalLatLng,
    status_check: statusCheck,
    buddy_notes: buddyNotes,
  });
  throwIfError(visitError, 'Unable to create visit');
}

async function ensureTask(visitId, taskName, status, measuredValue, buddyRemarks) {
  const { data: existing, error: existingError } = await supabase
    .from('visit_tasks')
    .select('id')
    .eq('visit_id', visitId)
    .eq('task_name', taskName)
    .limit(1);
  throwIfError(existingError, 'Unable to check task');

  if (Array.isArray(existing) && existing.length > 0) {
    return;
  }

  const { error } = await supabase.from('visit_tasks').insert({
    visit_id: visitId,
    task_name: taskName,
    status,
    measured_value: measuredValue || '',
    buddy_remarks: buddyRemarks || '',
    updated_at: new Date().toISOString(),
  });
  throwIfError(error, 'Unable to create task');
}

async function seedDefaultUsers() {
  const clientNames = ['client1', 'client2', 'client3', 'client4', 'client5'];
  const buddyNames = ['buddy1', 'buddy2', 'buddy3', 'buddy4', 'buddy5'];

  await ensureUser({ user_id: 'admin', email: 'admin@gattandco.local', full_name: 'Admin', role: 'admin', password: '1234567890' });

  for (const clientName of clientNames) {
    await ensureUser({
      user_id: clientName,
      email: `${clientName}@gattandco.local`,
      full_name: clientName,
      role: 'client',
      password: '1234567890',
    });
  }

  for (const buddyName of buddyNames) {
    await ensureUser({
      user_id: buddyName,
      email: `${buddyName}@gattandco.local`,
      full_name: buddyName,
      role: 'buddy',
      password: '1234567890',
    });
  }

  const { data: clientRows, error: clientError } = await supabase.from('users').select('id, full_name').eq('role', 'client');
  throwIfError(clientError, 'Unable to load clients for seed');
  const { data: elderlyRows, error: elderlyError } = await supabase.from('elderly_members').select('id, client_id');
  throwIfError(elderlyError, 'Unable to load elderly members for seed');
  const { data: buddyRows, error: buddyError } = await supabase.from('users').select('id, full_name').eq('role', 'buddy');
  throwIfError(buddyError, 'Unable to load buddies for seed');

  const elderlyByClient = {};
  for (const member of elderlyRows || []) {
    elderlyByClient[member.client_id] = member.id;
  }

  const clientMap = Array.isArray(clientRows)
    ? clientRows.map((row) => ({ ...row, elderly_id: elderlyByClient[row.id] || null }))
    : [];
  const buddyMap = Array.isArray(buddyRows) ? buddyRows : [];

  for (let index = 0; index < clientMap.length && index < buddyMap.length; index += 1) {
    const client = clientMap[index];
    const buddy = buddyMap[index];
    if (!client || !client.elderly_id) {
      continue;
    }
    await ensureAssignment(buddy.id, client.elderly_id, {
      status: index % 2 === 0 ? 'active' : 'active',
      scheduledDate: new Date(Date.now() - index * 86400000).toISOString().slice(0, 10),
      arrivalTime: new Date(Date.now() - 3600000).toISOString(),
      arrivalLatLng: `${12.97 + index * 0.01},${77.59 + index * 0.01}`,
      statusCheck: ['Excellent', 'Good', 'Weak'][index % 3],
      buddyNotes: `Checking on ${client.full_name} and updating care plan.`,
      term: index % 2 === 0 ? 'long' : 'short',
    });
  }

  const { data: visitRows, error: visitError } = await supabase.from('visits').select('id, buddy_id, elderly_id').order('id', { ascending: true });
  throwIfError(visitError, 'Unable to load visits for seed');
  if (Array.isArray(visitRows)) {
    const tasksData = [
      [
        { task_name: 'Medication check', status: 'completed', measured_value: 'OK', buddy_remarks: 'All meds administered' },
        { task_name: 'Mobility assistance', status: 'pending', measured_value: '', buddy_remarks: 'Patient needs help walking' },
      ],
      [
        { task_name: 'Blood pressure', status: 'pending', measured_value: '130/80', buddy_remarks: 'Awaiting doctor review' },
        { task_name: 'Hydration check', status: 'completed', measured_value: '500ml', buddy_remarks: 'Water provided' },
      ],
      [
        { task_name: 'Meal support', status: 'completed', measured_value: 'Served', buddy_remarks: 'Ate well' },
        { task_name: 'Medication reminder', status: 'pending', measured_value: '', buddy_remarks: 'Remind at 6 PM' },
      ],
      [
        { task_name: 'Personal hygiene', status: 'carried_forward', measured_value: '', buddy_remarks: 'Need more time for bath' },
        { task_name: 'Exercise support', status: 'pending', measured_value: '', buddy_remarks: 'Gentle stretching' },
      ],
      [
        { task_name: 'Medication check', status: 'pending', measured_value: 'OK', buddy_remarks: 'Prepare evening meds' },
        { task_name: 'Vitals monitoring', status: 'completed', measured_value: 'Stable', buddy_remarks: 'Heart rate OK' },
      ],
    ];

    for (let index = 0; index < visitRows.length; index += 1) {
      const visit = visitRows[index];
      const tasksForVisit = tasksData[index % tasksData.length];
      for (const task of tasksForVisit) {
        await ensureTask(visit.id, task.task_name, task.status, task.measured_value, task.buddy_remarks);
      }
    }
  }
}

async function initializeApp() {
  try {
    await initDb();
    dbReady = true;

    const shouldSeed = process.env.SEED_ON_START === 'true' || process.env.NODE_ENV !== 'production';
    if (shouldSeed) {
      await seedDefaultUsers();
      await seedDefaultRequests();
    }
  } catch (error) {
    dbReady = false;
    const rawMessage = error?.message || String(error);
    if (rawMessage.includes("Could not find the table 'public.users'")) {
      startupWarning = 'Supabase schema is missing. Run supabase-schema.sql and then supabase-user-address-migration.sql in Supabase SQL Editor.';
      console.error('Startup warning (server still running): Supabase tables are missing. Apply supabase-schema.sql and supabase-user-address-migration.sql.');
    } else {
      startupWarning = rawMessage;
      console.error('Startup warning (server still running):', error);
    }
  }
}

initializeApp();

app.post('/api/register', async (req, res, next) => {
  const { name, email, phone, password } = req.body;

  console.log('Register request body:', { name, email, phone, password: password ? '***' : undefined });

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required.' });
  }

  try {
    const { data: rows, error: rowsError } = await supabase.from('users').select('id').eq('email', email).limit(1);
    throwIfError(rowsError, 'Unable to check email');

    if (Array.isArray(rows) && rows.length > 0) {
      return res.status(400).json({ message: 'Email is already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userIdValue = await generateUniqueUserId(name || email);
    const { data: created, error: createError } = await supabase
      .from('users')
      .insert({
        user_id: userIdValue,
        full_name: name,
        email: String(email || '').trim().toLowerCase(),
        phone: normalizePhone(phone),
        password_hash: hashedPassword,
        role: 'client',
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    throwIfError(createError, 'Unable to register user');

    if (created?.id) {
      await ensureElderlyMember(created.id, name);
    }

    return res.json({ message: 'Registration successful. Admin will review your account request.' });
  } catch (error) {
    const log = `Registration error full: ${new Date().toISOString()} ${error.stack || error.message || error}\n`;
    fs.appendFileSync(path.resolve(process.cwd(), 'registration-error.log'), log);
    console.error(log);
    next(error);
  }
});

app.post('/api/login', async (req, res) => {
  const { identifier, password } = req.body;
  const normalizedIdentifier = String(identifier || '').trim();
  const normalizedPhone = normalizedIdentifier.replace(/\D/g, '');

  if (!normalizedIdentifier || !password) {
    return res.status(400).json({ message: 'User ID, email, or phone and password are required.' });
  }

  try {
    let rows = [];
    const { data: byEmail, error: byEmailError } = await supabase
      .from('users')
      .select('id, user_id, full_name, email, role, password_hash')
      .eq('email', normalizedIdentifier)
      .limit(1);
    throwIfError(byEmailError, 'Unable to find user by email');

    if (Array.isArray(byEmail) && byEmail.length > 0) {
      rows = byEmail;
    } else {
      const { data: byPhone, error: byPhoneError } = await supabase
        .from('users')
        .select('id, user_id, full_name, email, role, password_hash')
        .eq('phone', normalizedIdentifier)
        .limit(1);
      throwIfError(byPhoneError, 'Unable to find user by phone');

      if (Array.isArray(byPhone) && byPhone.length > 0) {
        rows = byPhone;
      } else if (normalizedPhone && normalizedPhone !== normalizedIdentifier) {
        const { data: byNormalizedPhone, error: byNormalizedPhoneError } = await supabase
          .from('users')
          .select('id, user_id, full_name, email, role, password_hash')
          .eq('phone', normalizedPhone)
          .limit(1);
        throwIfError(byNormalizedPhoneError, 'Unable to find user by normalized phone');

        if (Array.isArray(byNormalizedPhone) && byNormalizedPhone.length > 0) {
          rows = byNormalizedPhone;
        }
      }

      if (!Array.isArray(rows) || rows.length === 0) {
        const { data: byUserId, error: byUserIdError } = await supabase
          .from('users')
          .select('id, user_id, full_name, email, role, password_hash')
          .eq('user_id', normalizeUserId(normalizedIdentifier))
          .limit(1);
        throwIfError(byUserIdError, 'Unable to find user by user_id');
        rows = Array.isArray(byUserId) ? byUserId : [];
      }
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const user = rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    req.session.user = { id: user.id, user_id: user.user_id, name: user.full_name, email: user.email, role: user.role };

    return res.json({
      message: 'Login successful.',
      user: { id: user.id, user_id: user.user_id, name: user.full_name, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error('Login error:', error.message, error.stack);
    return res.status(500).json({ message: 'Login failed.', error: error.message });
  }
});

app.get('/api/session', (req, res) => {
  if (!req.session.user) {
    return res.json({ user: null });
  }
  return res.json({ user: req.session.user });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({ message: 'Unable to logout.' });
    }
    res.clearCookie('gatt_sid');
    return res.json({ message: 'Logout successful.' });
  });
});

app.get('/api/users', async (req, res) => {
  const role = req.query.role;
  try {
    let query = supabase.from('users').select('id, user_id, full_name, email, phone, address, role, client_onboarding_type').order('full_name', { ascending: true });
    if (role && typeof role === 'string') {
      query = query.eq('role', role);
    }
    const { data: rows, error } = await query;
    throwIfError(error, 'Unable to fetch users');
    return res.json(rows);
  } catch (error) {
    console.error('Fetch users failed:', error);
    return res.status(500).json({ message: 'Unable to load users.' });
  }
});

app.post('/api/users', async (req, res) => {
  const { user_id, name, email, phone, address, role, password, client_onboarding_type } = req.body;

  if (!user_id || !name || !role || !password) {
    return res.status(400).json({ message: 'User ID, name, role and password are required.' });
  }

  if (role !== 'buddy' && role !== 'client') {
    return res.status(400).json({ message: 'Role must be buddy or client.' });
  }

  try {
    const normalizedEmail = email || `${name.toLowerCase().replace(/\s+/g, '')}@gattandco.local`;
    const trimmedAddress = typeof address === 'string' ? address.trim() : '';
    const userId = await ensureUser({
      user_id,
      email: normalizedEmail,
      full_name: name,
      phone: phone || '',
      address: trimmedAddress,
      client_onboarding_type,
      role,
      password,
      allowExisting: false,
    });

    if (role === 'client' && userId && trimmedAddress.length > 0) {
      const { error: addressError } = await supabase
        .from('elderly_members')
        .update({ address: trimmedAddress })
        .eq('client_id', Number(userId));
      throwIfError(addressError, 'Unable to save client address');
    }

    return res.json({ message: `${role === 'buddy' ? 'Caretaker' : 'Client'} account created.` });
  } catch (error) {
    console.error('Create user failed:', error);
    if (error?.message?.includes('already exists')) {
      return res.status(409).json({ message: error.message });
    }
    if (error?.message?.includes('duplicate key value violates unique constraint')) {
      return res.status(409).json({ message: 'User ID, email, or phone already exists.' });
    }
    return res.status(500).json({ message: 'Unable to create user.' });
  }
});

app.get('/api/elderly-members', async (req, res) => {
  try {
    const { data: members, error: membersError } = await supabase
      .from('elderly_members')
      .select('id, client_id, full_name, age, address')
      .order('full_name', { ascending: true });
    throwIfError(membersError, 'Unable to fetch elderly members');

    const userMap = await fetchUsersMapById((members || []).map((item) => item.client_id));
    const rows = (members || []).map((item) => ({ ...item, email: userMap[item.client_id]?.email || '' }));
    return res.json(rows);
  } catch (error) {
    console.error('Fetch elderly members failed:', error);
    return res.status(500).json({ message: 'Unable to load elderly members.' });
  }
});

app.get('/api/client-contacts', async (req, res) => {
  const all = req.query.all === 'true';
  const clientId = req.query.client_id;

  if (!all && !clientId) {
    return res.status(400).json({ message: 'Either all=true or client_id must be provided.' });
  }

  try {
    let query = supabase
      .from('client_family_contacts')
      .select('id, client_id, elderly_id, contact_name, relation_label, phone, whatsapp_opt_in, is_primary, created_at')
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false });

    if (!all) {
      query = query.eq('client_id', Number(clientId));
    }

    const { data, error } = await query;
    throwIfError(error, 'Unable to fetch client contacts');
    return res.json(data || []);
  } catch (error) {
    console.error('Fetch client contacts failed:', error);
    return res.status(500).json({ message: 'Unable to load client contacts.' });
  }
});

app.get('/api/client-contacts/audit', async (req, res) => {
  const all = req.query.all === 'true';
  const clientId = req.query.client_id;

  if (!all && !clientId) {
    return res.status(400).json({ message: 'Either all=true or client_id must be provided.' });
  }

  try {
    let query = supabase
      .from('client_family_contact_audits')
      .select('id, family_contact_id, client_id, elderly_id, actor_user_id, action_type, contact_name, relation_label, phone, whatsapp_opt_in, is_primary, created_at')
      .is('archived_at', null)
      .order('created_at', { ascending: false });

    if (!all) {
      query = query.eq('client_id', Number(clientId));
    }

    const { data, error } = await query;
    throwIfError(error, 'Unable to fetch client contact audit');

    const actorMap = await fetchUsersMapById((data || []).map((entry) => entry.actor_user_id).filter(Boolean));
    const rows = (data || []).map((entry) => ({
      ...entry,
      actor_name: actorMap[entry.actor_user_id]?.full_name || 'System',
    }));

    return res.json(rows);
  } catch (error) {
    console.error('Fetch client contact audit failed:', error);
    return res.status(500).json({ message: 'Unable to load client contact audit.' });
  }
});

app.post('/api/notification-logs', async (req, res) => {
  if (!ensureAdminSession(req, res)) {
    return;
  }

  const {
    client_id,
    family_contact_id,
    recipient_role,
    recipient_name,
    recipient_phone,
    channel,
    template_key,
    message_preview,
  } = req.body;

  if (!client_id || !recipient_role || !channel || !template_key) {
    return res.status(400).json({ message: 'Client, recipient role, channel, and template are required.' });
  }

  try {
    await createNotificationActionLogEntry({
      clientId: Number(client_id),
      familyContactId: family_contact_id ? Number(family_contact_id) : null,
      actorUserId: req.session.user?.id || null,
      recipientRole: String(recipient_role),
      recipientName: String(recipient_name || '').trim(),
      recipientPhone: normalizePhone(recipient_phone),
      channel: String(channel),
      templateKey: String(template_key),
      messagePreview: String(message_preview || '').trim(),
    });

    return res.json({ message: 'Notification action logged.' });
  } catch (error) {
    console.error('Notification action log failed:', error);
    return res.status(500).json({ message: 'Unable to log notification action.' });
  }
});

app.get('/api/notification-logs', async (req, res) => {
  if (!ensureAdminSession(req, res)) {
    return;
  }

  const all = req.query.all === 'true';
  const clientId = req.query.client_id;

  if (!all && !clientId) {
    return res.status(400).json({ message: 'Either all=true or client_id must be provided.' });
  }

  try {
    let query = supabase
      .from('notification_action_logs')
      .select('id, client_id, family_contact_id, actor_user_id, recipient_role, recipient_name, recipient_phone, channel, template_key, message_preview, created_at')
      .is('archived_at', null)
      .order('created_at', { ascending: false });

    if (!all) {
      query = query.eq('client_id', Number(clientId));
    }

    const { data, error } = await query;
    throwIfError(error, 'Unable to fetch notification logs');

    const actorMap = await fetchUsersMapById((data || []).map((entry) => entry.actor_user_id).filter(Boolean));
    const rows = (data || []).map((entry) => ({
      ...entry,
      actor_name: actorMap[entry.actor_user_id]?.full_name || 'System',
    }));

    return res.json(rows);
  } catch (error) {
    console.error('Fetch notification logs failed:', error);
    return res.status(500).json({ message: 'Unable to load notification logs.' });
  }
});

app.get('/api/reminders/config', async (req, res) => {
  if (!ensureAdminSession(req, res)) {
    return;
  }

  try {
    const settings = await getReminderSettingsMap();
    const rows = Array.from(REMINDER_TEMPLATE_KEYS).map((templateKey) => ({
      template_key: templateKey,
      enabled: Boolean(settings[templateKey]),
      preview_template: getReminderTemplatePreview(templateKey),
    }));

    return res.json({
      reminders: rows,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Fetch reminder config failed:', error);
    return res.status(500).json({ message: error.message || 'Unable to load reminder config.' });
  }
});

app.put('/api/reminders/config', async (req, res) => {
  if (!ensureAdminSession(req, res)) {
    return;
  }

  const templateKey = String(req.body?.template_key || '').trim();
  const enabled = Boolean(req.body?.enabled);

  if (!REMINDER_TEMPLATE_KEYS.has(templateKey)) {
    return res.status(400).json({ message: 'Unsupported reminder template key.' });
  }

  try {
    await saveReminderSetting(templateKey, enabled, req.session.user?.id || null);
    return res.json({ message: 'Reminder setting updated.' });
  } catch (error) {
    console.error('Update reminder config failed:', error);
    return res.status(500).json({ message: error.message || 'Unable to update reminder config.' });
  }
});

app.post('/api/reminders/run', async (req, res) => {
  if (!ensureAdminOrReminderRunner(req, res)) {
    return;
  }

  const actorUserId = req.session.user?.id || null;

  try {
    const runDate = normalizeDateOnly(req.body?.run_date || req.query?.run_date, new Date().toISOString().slice(0, 10));
    const runDateStart = new Date(`${runDate}T00:00:00.000Z`);
    const runDateEnd = new Date(`${runDate}T23:59:59.999Z`);
    const targetVisitDateObj = new Date(runDateStart);
    targetVisitDateObj.setUTCDate(targetVisitDateObj.getUTCDate() + 1);
    const targetVisitDate = targetVisitDateObj.toISOString().slice(0, 10);

    const settings = await getReminderSettingsMap();
    const stats = {
      run_date: runDate,
      target_visit_date: targetVisitDate,
      visit_reminder_d1_generated: 0,
      visit_reminder_d1_skipped_duplicates: 0,
      backfilled_visit_notice_generated: 0,
      family_monthly_update_generated: 0,
    };

    if (!settings.visit_reminder_d1) {
      return res.json({
        message: 'Reminder runner completed (visit D-1 reminder disabled).',
        stats,
      });
    }

    const { data: visitRows, error: visitRowsError } = await supabase
      .from('visits')
      .select('id, assignment_id, buddy_id, elderly_id, scheduled_date, visit_status')
      .eq('scheduled_date', targetVisitDate)
      .is('archived_at', null)
      .in('visit_status', ['scheduled', 'in_progress']);
    throwIfError(visitRowsError, 'Unable to fetch D-1 visits for reminder runner');

    if (!Array.isArray(visitRows) || visitRows.length === 0) {
      return res.json({ message: 'Reminder runner completed (no D-1 visits).', stats });
    }

    const assignmentIds = Array.from(new Set(visitRows.map((entry) => entry.assignment_id).filter((id) => Number.isFinite(Number(id)))));
    const { data: assignmentRows, error: assignmentRowsError } = await supabase
      .from('assignments')
      .select('id, service_plan_type, term_type, approval_state, status, archived_at')
      .in('id', assignmentIds.length > 0 ? assignmentIds : [0]);
    throwIfError(assignmentRowsError, 'Unable to fetch assignment scope for reminder runner');

    const assignmentMap = {};
    (assignmentRows || []).forEach((entry) => {
      assignmentMap[entry.id] = entry;
    });

    const eligibleVisits = (visitRows || []).filter((visit) => {
      const assignment = assignmentMap[visit.assignment_id] || null;
      if (!assignment || assignment.archived_at) {
        return false;
      }

      const servicePlanType = normalizeServicePlanType(assignment.service_plan_type, assignment.term_type);
      const approvalState = normalizeApprovalState(assignment.approval_state || 'pending_approval');
      const assignmentStatus = normalizeAssignmentStatus(assignment.status || 'paused');

      return servicePlanType === 'short_term' && approvalState === 'approved' && assignmentStatus === 'active';
    });

    if (eligibleVisits.length === 0) {
      return res.json({ message: 'Reminder runner completed (no eligible short-term active visits).', stats });
    }

    const buddyMap = await fetchUsersMapById(eligibleVisits.map((entry) => entry.buddy_id));
    const elderlyMap = await fetchElderlyMapById(eligibleVisits.map((entry) => entry.elderly_id));
    const clientIds = Array.from(new Set(eligibleVisits
      .map((entry) => elderlyMap[entry.elderly_id]?.client_id)
      .filter((id) => Number.isFinite(Number(id))))).map((id) => Number(id));
    const clientMap = await fetchUsersMapById(clientIds);

    const { data: existingReminderRows, error: existingReminderError } = await supabase
      .from('notification_action_logs')
      .select('client_id, channel, message_preview')
      .eq('template_key', 'visit_reminder_d1')
      .gte('created_at', runDateStart.toISOString())
      .lte('created_at', runDateEnd.toISOString())
      .is('archived_at', null);
    throwIfError(existingReminderError, 'Unable to fetch existing reminder logs for dedupe');

    const existingLogKeySet = new Set((existingReminderRows || []).map((entry) => `${entry.client_id}|${entry.channel}|${entry.message_preview}`));

    for (const visit of eligibleVisits) {
      const buddy = buddyMap[visit.buddy_id] || null;
      const elderly = elderlyMap[visit.elderly_id] || null;
      const client = elderly ? (clientMap[elderly.client_id] || null) : null;

      if (!elderly || !client) {
        continue;
      }

      const buddyName = buddy?.full_name || 'Caregiver';
      const elderlyName = elderly.full_name || 'Client';
      const messagePreview = `Reminder: ${buddyName} is scheduled to visit ${elderlyName} on ${visit.scheduled_date}.`;

      const notifyKey = `${client.id}|notify|${messagePreview}`;
      if (existingLogKeySet.has(notifyKey)) {
        stats.visit_reminder_d1_skipped_duplicates += 1;
      } else {
        await createNotificationActionLogEntry({
          clientId: client.id,
          actorUserId,
          recipientRole: 'client',
          recipientName: client.full_name || 'Client',
          recipientPhone: client.phone || '',
          channel: 'notify',
          templateKey: 'visit_reminder_d1',
          messagePreview,
        });
        existingLogKeySet.add(notifyKey);
        stats.visit_reminder_d1_generated += 1;
      }

      if (String(client.phone || '').trim()) {
        const whatsappKey = `${client.id}|whatsapp|${messagePreview}`;
        if (existingLogKeySet.has(whatsappKey)) {
          stats.visit_reminder_d1_skipped_duplicates += 1;
        } else {
          await createNotificationActionLogEntry({
            clientId: client.id,
            actorUserId,
            recipientRole: 'client',
            recipientName: client.full_name || 'Client',
            recipientPhone: client.phone || '',
            channel: 'whatsapp',
            templateKey: 'visit_reminder_d1',
            messagePreview,
          });
          existingLogKeySet.add(whatsappKey);
          stats.visit_reminder_d1_generated += 1;
        }
      }
    }

    return res.json({
      message: 'Reminder runner completed.',
      stats,
    });
  } catch (error) {
    console.error('Run reminders failed:', error);
    return res.status(500).json({ message: error.message || 'Unable to run reminders.' });
  }
});

app.post('/api/archive-case-history', async (req, res) => {
  if (!ensureAdminSession(req, res)) {
    return;
  }

  const { client_id, archive_month } = req.body;

  if (!client_id || !archive_month) {
    return res.status(400).json({ message: 'Client and archive month are required.' });
  }

  try {
    const range = getArchiveMonthRange(archive_month);
    const { data: clientMembers, error: clientMembersError } = await supabase
      .from('elderly_members')
      .select('id')
      .eq('client_id', Number(client_id));
    throwIfError(clientMembersError, 'Unable to resolve client archive scope');

    const elderlyIds = (clientMembers || []).map((entry) => entry.id);
    const archivedCounts = {
      assignments: 0,
      visits: 0,
      tasks: 0,
      requests: 0,
      contact_audits: 0,
      assignment_lifecycle_audits: 0,
      notifications: 0,
    };

    const { data: visitRows, error: visitRowsError } = await supabase
      .from('visits')
      .select('id')
      .in('elderly_id', elderlyIds.length > 0 ? elderlyIds : [-1])
      .gte('scheduled_date', range.startDate)
      .lt('scheduled_date', range.endDate)
      .is('archived_at', null);
    throwIfError(visitRowsError, 'Unable to load visits for archive');
    const visitIds = (visitRows || []).map((entry) => entry.id);
    archivedCounts.visits = await archiveRecordsByIds('visits', visitIds);

    const { data: taskRows, error: taskRowsError } = await supabase
      .from('visit_tasks')
      .select('id')
      .in('visit_id', visitIds.length > 0 ? visitIds : [-1])
      .is('archived_at', null);
    throwIfError(taskRowsError, 'Unable to load tasks for archive');
    archivedCounts.tasks = await archiveRecordsByIds('visit_tasks', (taskRows || []).map((entry) => entry.id));

    const { data: requestRows, error: requestRowsError } = await supabase
      .from('client_requests')
      .select('id')
      .eq('user_id', Number(client_id))
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso)
      .is('archived_at', null);
    throwIfError(requestRowsError, 'Unable to load requests for archive');
    archivedCounts.requests = await archiveRecordsByIds('client_requests', (requestRows || []).map((entry) => entry.id));

    const { data: contactAuditRows, error: contactAuditError } = await supabase
      .from('client_family_contact_audits')
      .select('id')
      .eq('client_id', Number(client_id))
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso)
      .is('archived_at', null);
    throwIfError(contactAuditError, 'Unable to load contact audits for archive');
    archivedCounts.contact_audits = await archiveRecordsByIds('client_family_contact_audits', (contactAuditRows || []).map((entry) => entry.id));

    const { data: notificationRows, error: notificationError } = await supabase
      .from('notification_action_logs')
      .select('id')
      .eq('client_id', Number(client_id))
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso)
      .is('archived_at', null);
    throwIfError(notificationError, 'Unable to load notifications for archive');
    archivedCounts.notifications = await archiveRecordsByIds('notification_action_logs', (notificationRows || []).map((entry) => entry.id));

    const { data: assignmentRows, error: assignmentRowsError } = await supabase
      .from('assignments')
      .select('id, status, end_date')
      .in('elderly_id', elderlyIds.length > 0 ? elderlyIds : [-1])
      .is('archived_at', null);
    throwIfError(assignmentRowsError, 'Unable to load assignments for archive');

    const assignmentIds = (assignmentRows || [])
      .filter((entry) => ['completed', 'cancelled'].includes(entry.status) && entry.end_date && entry.end_date >= range.startDate && entry.end_date < range.endDate)
      .map((entry) => entry.id);
    archivedCounts.assignments = await archiveRecordsByIds('assignments', assignmentIds);

    const clientAssignmentIds = (assignmentRows || []).map((entry) => entry.id);
    const { data: assignmentAuditRows, error: assignmentAuditError } = await supabase
      .from('assignment_lifecycle_audits')
      .select('id')
      .in('assignment_id', clientAssignmentIds.length > 0 ? clientAssignmentIds : [-1])
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso)
      .is('archived_at', null);
    throwIfError(assignmentAuditError, 'Unable to load assignment lifecycle audits for archive');
    archivedCounts.assignment_lifecycle_audits = await archiveRecordsByIds('assignment_lifecycle_audits', (assignmentAuditRows || []).map((entry) => entry.id));

    return res.json({
      message: `Archived ${archive_month} history for the selected client.`,
      archivedCounts,
    });
  } catch (error) {
    console.error('Archive case history failed:', error);
    return res.status(500).json({ message: error.message || 'Unable to archive case history.' });
  }
});

app.get('/api/archived-case-history', async (req, res) => {
  if (!ensureAdminSession(req, res)) {
    return;
  }

  const clientId = Number(req.query.client_id);
  const archiveMonth = String(req.query.month || '');

  if (!clientId || !archiveMonth) {
    return res.status(400).json({ message: 'client_id and month are required.' });
  }

  try {
    const range = getArchiveMonthRange(archiveMonth);
    const { data: clientMembers, error: clientMembersError } = await supabase
      .from('elderly_members')
      .select('id, client_id, full_name, age, address')
      .eq('client_id', clientId);
    throwIfError(clientMembersError, 'Unable to resolve archived client scope');

    const elderlyIds = (clientMembers || []).map((entry) => entry.id);

    const { data: assignments, error: assignmentsError } = await supabase
      .from('assignments')
      .select('id, buddy_id, elderly_id, status, term_type, admin_notes, end_date')
      .in('elderly_id', elderlyIds.length > 0 ? elderlyIds : [-1])
      .not('archived_at', 'is', null)
      .gte('end_date', range.startDate)
      .lt('end_date', range.endDate)
      .order('end_date', { ascending: false });
    throwIfError(assignmentsError, 'Unable to fetch archived assignments');

    const { data: visits, error: visitsError } = await supabase
      .from('visits')
      .select('id, buddy_id, elderly_id, scheduled_date, visit_status, arrival_time, departure_time, arrival_lat_lng, status_check, buddy_notes, client_visible_notes')
      .in('elderly_id', elderlyIds.length > 0 ? elderlyIds : [-1])
      .not('archived_at', 'is', null)
      .gte('scheduled_date', range.startDate)
      .lt('scheduled_date', range.endDate)
      .order('scheduled_date', { ascending: false });
    throwIfError(visitsError, 'Unable to fetch archived visits');

    const visitIds = (visits || []).map((entry) => entry.id);
    const { data: tasks, error: tasksError } = await supabase
      .from('visit_tasks')
      .select('id, visit_id, task_name, status, measured_value, buddy_remarks, updated_at')
      .in('visit_id', visitIds.length > 0 ? visitIds : [-1])
      .not('archived_at', 'is', null)
      .order('updated_at', { ascending: false });
    throwIfError(tasksError, 'Unable to fetch archived tasks');

    const { data: requests, error: requestsError } = await supabase
      .from('client_requests')
      .select('id, user_id, elderly_id, request_type, message, status, created_at, resolved_at')
      .eq('user_id', clientId)
      .not('archived_at', 'is', null)
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso)
      .order('created_at', { ascending: false });
    throwIfError(requestsError, 'Unable to fetch archived requests');

    const { data: contactAuditRows, error: contactAuditError } = await supabase
      .from('client_family_contact_audits')
      .select('id, family_contact_id, client_id, elderly_id, actor_user_id, action_type, contact_name, relation_label, phone, whatsapp_opt_in, is_primary, created_at')
      .eq('client_id', clientId)
      .not('archived_at', 'is', null)
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso)
      .order('created_at', { ascending: false });
    throwIfError(contactAuditError, 'Unable to fetch archived contact audits');

    const { data: notificationRows, error: notificationError } = await supabase
      .from('notification_action_logs')
      .select('id, client_id, family_contact_id, actor_user_id, recipient_role, recipient_name, recipient_phone, channel, template_key, message_preview, created_at')
      .eq('client_id', clientId)
      .not('archived_at', 'is', null)
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso)
      .order('created_at', { ascending: false });
    throwIfError(notificationError, 'Unable to fetch archived notifications');

    const { data: assignmentAuditRows, error: assignmentAuditError } = await supabase
      .from('assignment_lifecycle_audits')
      .select('id, assignment_id, from_status, to_status, actor_user_id, notes, created_at')
      .not('archived_at', 'is', null)
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso)
      .order('created_at', { ascending: false });
    throwIfError(assignmentAuditError, 'Unable to fetch archived assignment lifecycle audits');

    const { data: purgeLogRows, error: purgeLogError } = await supabase
      .from('archive_purge_logs')
      .select('id, client_id, actor_user_id, archive_month, assignments_deleted, visits_deleted, tasks_deleted, requests_deleted, contact_audits_deleted, assignment_lifecycle_audits_deleted, notifications_deleted, created_at')
      .eq('client_id', clientId)
      .eq('archive_month', archiveMonth)
      .order('created_at', { ascending: false });
    throwIfError(purgeLogError, 'Unable to fetch archive purge logs');

    const buddyIds = [
      ...(assignments || []).map((entry) => entry.buddy_id),
      ...(visits || []).map((entry) => entry.buddy_id),
      ...(tasks || []).map((entry) => {
        const matchingVisit = (visits || []).find((visit) => visit.id === entry.visit_id);
        return matchingVisit?.buddy_id;
      }),
      ...(contactAuditRows || []).map((entry) => entry.actor_user_id),
      ...(assignmentAuditRows || []).map((entry) => entry.actor_user_id),
      ...(notificationRows || []).map((entry) => entry.actor_user_id),
      ...(purgeLogRows || []).map((entry) => entry.actor_user_id),
      ...(requests || []).map((entry) => entry.user_id),
    ].filter(Boolean);

    const userMap = await fetchUsersMapById(buddyIds);
    const elderlyMap = await fetchElderlyMapById(elderlyIds);

    const assignmentRows = (assignments || []).map((entry) => ({
      ...entry,
      buddy_name: userMap[entry.buddy_id]?.full_name || 'Unknown',
      elderly_name: elderlyMap[entry.elderly_id]?.full_name || 'Unknown',
      age: elderlyMap[entry.elderly_id]?.age ?? null,
      address: elderlyMap[entry.elderly_id]?.address ?? '',
    }));

    const visitRows = (visits || []).map((entry) => ({
      ...entry,
      buddy_name: userMap[entry.buddy_id]?.full_name || 'Unknown',
      client_name: elderlyMap[entry.elderly_id]?.full_name || 'Unknown',
      age: elderlyMap[entry.elderly_id]?.age ?? null,
      address: elderlyMap[entry.elderly_id]?.address ?? '',
    }));

    const visitMap = {};
    for (const visit of visitRows) {
      visitMap[visit.id] = visit;
    }

    const taskRows = (tasks || []).map((entry) => ({
      ...entry,
      buddy_id: visitMap[entry.visit_id]?.buddy_id,
      elderly_id: visitMap[entry.visit_id]?.elderly_id,
      buddy_name: visitMap[entry.visit_id]?.buddy_name || 'Unknown',
      client_name: visitMap[entry.visit_id]?.client_name || 'Unknown',
    }));

    const requestRows = (requests || []).map((entry) => ({
      timestamp: entry.created_at,
      user_id: entry.user_id,
      user_name: userMap[entry.user_id]?.full_name || 'Unknown',
      request_type: entry.request_type,
      message: entry.message,
      status: entry.status,
      elderly_id: entry.elderly_id,
      resolved_at: entry.resolved_at,
    }));

    const contactAuditEntries = (contactAuditRows || []).map((entry) => ({
      ...entry,
      actor_name: userMap[entry.actor_user_id]?.full_name || 'System',
    }));

    const notificationEntries = (notificationRows || []).map((entry) => ({
      ...entry,
      actor_name: userMap[entry.actor_user_id]?.full_name || 'System',
    }));

    const archivedAssignmentIds = new Set((assignments || []).map((entry) => entry.id));
    const assignmentAuditEntries = (assignmentAuditRows || [])
      .filter((entry) => archivedAssignmentIds.has(entry.assignment_id))
      .map((entry) => {
        const assignmentReference = assignmentRows.find((assignment) => assignment.id === entry.assignment_id);
        return {
          ...entry,
          actor_name: userMap[entry.actor_user_id]?.full_name || 'System',
          buddy_name: assignmentReference?.buddy_name || 'Unknown',
          elderly_name: assignmentReference?.elderly_name || 'Unknown',
        };
      });

    const purgeLogs = (purgeLogRows || []).map((entry) => ({
      ...entry,
      actor_name: userMap[entry.actor_user_id]?.full_name || 'System',
    }));

    return res.json({
      month: archiveMonth,
      elderlyMembers: clientMembers || [],
      assignments: assignmentRows,
      visits: visitRows,
      tasks: taskRows,
      requests: requestRows,
      contactAudits: contactAuditEntries,
      assignmentAudits: assignmentAuditEntries,
      notifications: notificationEntries,
      purgeLogs,
    });
  } catch (error) {
    console.error('Fetch archived case history failed:', error);
    return res.status(500).json({ message: error.message || 'Unable to load archived case history.' });
  }
});

app.get('/api/archive-analytics', async (req, res) => {
  if (!ensureAdminSession(req, res)) {
    return;
  }

  const clientId = Number(req.query.client_id);
  const monthsRequested = Number(req.query.months);
  const months = Number.isFinite(monthsRequested)
    ? Math.min(24, Math.max(1, Math.trunc(monthsRequested)))
    : 6;

  if (!clientId) {
    return res.status(400).json({ message: 'client_id is required.' });
  }

  try {
    const now = new Date();
    const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
    const windowEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const startIso = windowStart.toISOString();
    const endIso = windowEnd.toISOString();

    const monthKeys = [];
    for (let offset = months - 1; offset >= 0; offset -= 1) {
      const monthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
      monthKeys.push(monthDate.toISOString().slice(0, 7));
    }

    const monthCounters = {};
    monthKeys.forEach((monthKey) => {
      monthCounters[monthKey] = {
        assignments: 0,
        visits: 0,
        tasks: 0,
        requests: 0,
        assignment_lifecycle: 0,
      };
    });

    const bumpMonthCounter = (rawTimestamp, field) => {
      if (!rawTimestamp) {
        return;
      }

      const monthKey = String(rawTimestamp).slice(0, 7);
      if (!monthCounters[monthKey]) {
        return;
      }
      monthCounters[monthKey][field] += 1;
    };

    const { data: clientMembers, error: clientMembersError } = await supabase
      .from('elderly_members')
      .select('id')
      .eq('client_id', clientId);
    throwIfError(clientMembersError, 'Unable to resolve client archive analytics scope');

    const elderlyIds = (clientMembers || []).map((entry) => entry.id);
    const elderlyScope = elderlyIds.length > 0 ? elderlyIds : [-1];

    const { data: assignmentScopeRows, error: assignmentScopeError } = await supabase
      .from('assignments')
      .select('id')
      .in('elderly_id', elderlyScope);
    throwIfError(assignmentScopeError, 'Unable to resolve assignment scope for archive analytics');
    const assignmentIds = (assignmentScopeRows || []).map((entry) => entry.id);

    const { data: assignmentRows, error: assignmentRowsError } = await supabase
      .from('assignments')
      .select('id, archived_at')
      .in('elderly_id', elderlyScope)
      .not('archived_at', 'is', null)
      .gte('archived_at', startIso)
      .lt('archived_at', endIso);
    throwIfError(assignmentRowsError, 'Unable to fetch archived assignments for analytics');
    (assignmentRows || []).forEach((entry) => bumpMonthCounter(entry.archived_at, 'assignments'));

    const { data: visitRows, error: visitRowsError } = await supabase
      .from('visits')
      .select('id, archived_at')
      .in('elderly_id', elderlyScope)
      .not('archived_at', 'is', null)
      .gte('archived_at', startIso)
      .lt('archived_at', endIso);
    throwIfError(visitRowsError, 'Unable to fetch archived visits for analytics');
    (visitRows || []).forEach((entry) => bumpMonthCounter(entry.archived_at, 'visits'));

    const visitIds = (visitRows || []).map((entry) => entry.id);
    const { data: taskRows, error: taskRowsError } = await supabase
      .from('visit_tasks')
      .select('id, visit_id, archived_at')
      .in('visit_id', visitIds.length > 0 ? visitIds : [-1])
      .not('archived_at', 'is', null)
      .gte('archived_at', startIso)
      .lt('archived_at', endIso);
    throwIfError(taskRowsError, 'Unable to fetch archived tasks for analytics');
    (taskRows || []).forEach((entry) => bumpMonthCounter(entry.archived_at, 'tasks'));

    const { data: requestRows, error: requestRowsError } = await supabase
      .from('client_requests')
      .select('id, archived_at')
      .eq('user_id', clientId)
      .not('archived_at', 'is', null)
      .gte('archived_at', startIso)
      .lt('archived_at', endIso);
    throwIfError(requestRowsError, 'Unable to fetch archived requests for analytics');
    (requestRows || []).forEach((entry) => bumpMonthCounter(entry.archived_at, 'requests'));

    const { data: assignmentAuditRows, error: assignmentAuditError } = await supabase
      .from('assignment_lifecycle_audits')
      .select('id, assignment_id, archived_at')
      .in('assignment_id', assignmentIds.length > 0 ? assignmentIds : [-1])
      .not('archived_at', 'is', null)
      .gte('archived_at', startIso)
      .lt('archived_at', endIso);
    throwIfError(assignmentAuditError, 'Unable to fetch archived assignment lifecycle analytics');
    (assignmentAuditRows || []).forEach((entry) => bumpMonthCounter(entry.archived_at, 'assignment_lifecycle'));

    const rows = monthKeys.map((monthKey) => ({
      month: monthKey,
      assignments: monthCounters[monthKey].assignments,
      visits: monthCounters[monthKey].visits,
      tasks: monthCounters[monthKey].tasks,
      requests: monthCounters[monthKey].requests,
      assignment_lifecycle: monthCounters[monthKey].assignment_lifecycle,
    }));

    const totals = rows.reduce((summary, entry) => ({
      assignments: summary.assignments + entry.assignments,
      visits: summary.visits + entry.visits,
      tasks: summary.tasks + entry.tasks,
      requests: summary.requests + entry.requests,
      assignment_lifecycle: summary.assignment_lifecycle + entry.assignment_lifecycle,
    }), {
      assignments: 0,
      visits: 0,
      tasks: 0,
      requests: 0,
      assignment_lifecycle: 0,
    });

    return res.json({
      months: rows,
      totals,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Fetch archive analytics failed:', error);
    return res.status(500).json({ message: error.message || 'Unable to fetch archive analytics.' });
  }
});

app.post('/api/purge-archived-case-history', async (req, res) => {
  if (!ensureAdminSession(req, res)) {
    return;
  }

  const { client_id, archive_month, confirm_text } = req.body;

  if (!client_id || !archive_month) {
    return res.status(400).json({ message: 'Client and archive month are required.' });
  }

  if (String(confirm_text || '').trim() !== 'PURGE') {
    return res.status(400).json({ message: 'Type PURGE to confirm permanent deletion.' });
  }

  try {
    const range = getArchiveMonthRange(archive_month);
    const { data: clientMembers, error: clientMembersError } = await supabase
      .from('elderly_members')
      .select('id')
      .eq('client_id', Number(client_id));
    throwIfError(clientMembersError, 'Unable to resolve purge scope');

    const elderlyIds = (clientMembers || []).map((entry) => entry.id);
    const purgeCounts = {
      assignments: 0,
      visits: 0,
      tasks: 0,
      requests: 0,
      contact_audits: 0,
      assignment_lifecycle_audits: 0,
      notifications: 0,
    };

    const { data: visitRows, error: visitRowsError } = await supabase
      .from('visits')
      .select('id')
      .in('elderly_id', elderlyIds.length > 0 ? elderlyIds : [-1])
      .gte('scheduled_date', range.startDate)
      .lt('scheduled_date', range.endDate)
      .not('archived_at', 'is', null);
    throwIfError(visitRowsError, 'Unable to load archived visits for purge');
    const visitIds = (visitRows || []).map((entry) => entry.id);

    const { data: taskRows, error: taskRowsError } = await supabase
      .from('visit_tasks')
      .select('id')
      .in('visit_id', visitIds.length > 0 ? visitIds : [-1])
      .not('archived_at', 'is', null);
    throwIfError(taskRowsError, 'Unable to load archived tasks for purge');
    purgeCounts.tasks = await deleteRecordsByIds('visit_tasks', (taskRows || []).map((entry) => entry.id));

    const { data: requestRows, error: requestRowsError } = await supabase
      .from('client_requests')
      .select('id')
      .eq('user_id', Number(client_id))
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso)
      .not('archived_at', 'is', null);
    throwIfError(requestRowsError, 'Unable to load archived requests for purge');
    purgeCounts.requests = await deleteRecordsByIds('client_requests', (requestRows || []).map((entry) => entry.id));

    const { data: contactAuditRows, error: contactAuditError } = await supabase
      .from('client_family_contact_audits')
      .select('id')
      .eq('client_id', Number(client_id))
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso)
      .not('archived_at', 'is', null);
    throwIfError(contactAuditError, 'Unable to load archived contact audits for purge');
    purgeCounts.contact_audits = await deleteRecordsByIds('client_family_contact_audits', (contactAuditRows || []).map((entry) => entry.id));

    const { data: notificationRows, error: notificationError } = await supabase
      .from('notification_action_logs')
      .select('id')
      .eq('client_id', Number(client_id))
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso)
      .not('archived_at', 'is', null);
    throwIfError(notificationError, 'Unable to load archived notifications for purge');
    purgeCounts.notifications = await deleteRecordsByIds('notification_action_logs', (notificationRows || []).map((entry) => entry.id));

    purgeCounts.visits = await deleteRecordsByIds('visits', visitIds);

    const { data: assignmentRows, error: assignmentRowsError } = await supabase
      .from('assignments')
      .select('id, status, end_date')
      .in('elderly_id', elderlyIds.length > 0 ? elderlyIds : [-1])
      .not('archived_at', 'is', null);
    throwIfError(assignmentRowsError, 'Unable to load archived assignments for purge');

    const assignmentIds = (assignmentRows || [])
      .filter((entry) => ['completed', 'cancelled'].includes(entry.status) && entry.end_date && entry.end_date >= range.startDate && entry.end_date < range.endDate)
      .map((entry) => entry.id);

    const { data: assignmentAuditRows, error: assignmentAuditError } = await supabase
      .from('assignment_lifecycle_audits')
      .select('id')
      .in('assignment_id', assignmentIds.length > 0 ? assignmentIds : [-1])
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso)
      .not('archived_at', 'is', null);
    throwIfError(assignmentAuditError, 'Unable to load archived assignment lifecycle audits for purge');
    purgeCounts.assignment_lifecycle_audits = await deleteRecordsByIds('assignment_lifecycle_audits', (assignmentAuditRows || []).map((entry) => entry.id));

    purgeCounts.assignments = await deleteRecordsByIds('assignments', assignmentIds);

    const { error: purgeLogError } = await supabase.from('archive_purge_logs').insert({
      client_id: Number(client_id),
      actor_user_id: req.session.user?.id || null,
      archive_month: archive_month,
      assignments_deleted: purgeCounts.assignments,
      visits_deleted: purgeCounts.visits,
      tasks_deleted: purgeCounts.tasks,
      requests_deleted: purgeCounts.requests,
      contact_audits_deleted: purgeCounts.contact_audits,
      assignment_lifecycle_audits_deleted: purgeCounts.assignment_lifecycle_audits,
      notifications_deleted: purgeCounts.notifications,
    });
    throwIfError(purgeLogError, 'Unable to create archive purge log');

    return res.json({
      message: `Purged archived ${archive_month} history for the selected client.`,
      purgeCounts,
    });
  } catch (error) {
    console.error('Purge archived case history failed:', error);
    return res.status(500).json({ message: error.message || 'Unable to purge archived case history.' });
  }
});

app.post('/api/client-contacts', async (req, res) => {
  const { client_id, elderly_id, contact_name, relation_label, phone, whatsapp_opt_in, is_primary } = req.body;
  const normalizedPhone = normalizePhone(phone);

  if (!client_id || !elderly_id || !normalizedPhone) {
    return res.status(400).json({ message: 'Client case, elderly profile, and phone are required.' });
  }

  try {
    const existingContacts = await listClientContacts(client_id);
    const shouldBePrimary = existingContacts.length === 0 || Boolean(is_primary);

    const { data, error } = await supabase
      .from('client_family_contacts')
      .insert({
        client_id: Number(client_id),
        elderly_id: Number(elderly_id),
        contact_name: String(contact_name || '').trim(),
        relation_label: String(relation_label || '').trim(),
        phone: normalizedPhone,
        whatsapp_opt_in: Boolean(whatsapp_opt_in),
        is_primary: shouldBePrimary,
      })
      .select('id, client_id, elderly_id, contact_name, relation_label, phone, whatsapp_opt_in, is_primary')
      .single();
    throwIfError(error, 'Unable to add family contact');

    if (shouldBePrimary || !existingContacts.some((entry) => entry.is_primary)) {
      await ensureClientPrimaryContact(client_id, data.id, req.session.user?.id || null);
    }

    await createClientContactAuditEntry({
      familyContactId: data.id,
      clientId: data.client_id,
      elderlyId: data.elderly_id,
      actorUserId: req.session.user?.id || null,
      actionType: 'created',
      contactName: data.contact_name,
      relationLabel: data.relation_label,
      phone: data.phone,
      whatsappOptIn: data.whatsapp_opt_in,
      isPrimary: data.is_primary,
    });

    return res.json({ message: 'Family contact added.', contact: data });
  } catch (error) {
    console.error('Add family contact failed:', error);
    if (error?.message?.includes('duplicate key value violates unique constraint')) {
      return res.status(409).json({ message: 'This phone is already added for the selected client.' });
    }
    return res.status(500).json({ message: 'Unable to add family contact.' });
  }
});

app.patch('/api/client-contacts/:id', async (req, res) => {
  const contactId = Number(req.params.id);
  const { contact_name, relation_label, phone, whatsapp_opt_in, is_primary } = req.body;
  const normalizedPhone = normalizePhone(phone);

  if (!contactId || !normalizedPhone) {
    return res.status(400).json({ message: 'Valid contact id and phone are required.' });
  }

  try {
    const { data: existingContact, error: existingError } = await supabase
      .from('client_family_contacts')
      .select('id, client_id, elderly_id, is_primary')
      .eq('id', contactId)
      .single();
    throwIfError(existingError, 'Unable to load family contact');

    const contacts = await listClientContacts(existingContact.client_id);
    const otherContacts = contacts.filter((entry) => entry.id !== contactId);
    const shouldRemainPrimary = otherContacts.length === 0 ? true : Boolean(is_primary);

    const { data, error } = await supabase
      .from('client_family_contacts')
      .update({
        contact_name: String(contact_name || '').trim(),
        relation_label: String(relation_label || '').trim(),
        phone: normalizedPhone,
        whatsapp_opt_in: Boolean(whatsapp_opt_in),
        is_primary: shouldRemainPrimary,
      })
      .eq('id', contactId)
      .select('id, client_id, elderly_id, contact_name, relation_label, phone, whatsapp_opt_in, is_primary')
      .single();
    throwIfError(error, 'Unable to update family contact');

    if (shouldRemainPrimary) {
      await ensureClientPrimaryContact(existingContact.client_id, contactId, req.session.user?.id || null);
    } else if (existingContact.is_primary) {
      await ensureClientPrimaryContact(existingContact.client_id, otherContacts[0]?.id || contactId, req.session.user?.id || null);
    } else {
      await ensureClientPrimaryContact(existingContact.client_id, null, req.session.user?.id || null);
    }

    await createClientContactAuditEntry({
      familyContactId: data.id,
      clientId: data.client_id,
      elderlyId: data.elderly_id,
      actorUserId: req.session.user?.id || null,
      actionType: 'updated',
      contactName: data.contact_name,
      relationLabel: data.relation_label,
      phone: data.phone,
      whatsappOptIn: data.whatsapp_opt_in,
      isPrimary: data.is_primary,
    });

    return res.json({ message: 'Family contact updated.', contact: data });
  } catch (error) {
    console.error('Update family contact failed:', error);
    if (error?.message?.includes('duplicate key value violates unique constraint')) {
      return res.status(409).json({ message: 'This phone is already added for the selected client.' });
    }
    return res.status(500).json({ message: 'Unable to update family contact.' });
  }
});

app.delete('/api/client-contacts/:id', async (req, res) => {
  const contactId = Number(req.params.id);

  if (!contactId) {
    return res.status(400).json({ message: 'Valid contact id is required.' });
  }

  try {
    const { data: existingContact, error: existingError } = await supabase
      .from('client_family_contacts')
      .select('id, client_id, elderly_id, contact_name, relation_label, phone, whatsapp_opt_in, is_primary')
      .eq('id', contactId)
      .single();
    throwIfError(existingError, 'Unable to load family contact');

    await createClientContactAuditEntry({
      familyContactId: existingContact.id,
      clientId: existingContact.client_id,
      elderlyId: existingContact.elderly_id,
      actorUserId: req.session.user?.id || null,
      actionType: 'deleted',
      contactName: existingContact.contact_name,
      relationLabel: existingContact.relation_label,
      phone: existingContact.phone,
      whatsappOptIn: existingContact.whatsapp_opt_in,
      isPrimary: existingContact.is_primary,
    });

    const { error } = await supabase.from('client_family_contacts').delete().eq('id', contactId);
    throwIfError(error, 'Unable to delete family contact');

    if (existingContact?.client_id) {
      await ensureClientPrimaryContact(existingContact.client_id, null, req.session.user?.id || null);
    }

    return res.json({ message: 'Family contact removed.' });
  } catch (error) {
    console.error('Delete family contact failed:', error);
    return res.status(500).json({ message: 'Unable to remove family contact.' });
  }
});

app.get('/api/assignments', async (req, res) => {
  const clientId = req.query.client_id;
  const buddyId = req.query.buddy_id;

  try {
    let assignmentQuery = supabase
      .from('assignments')
      .select('id, buddy_id, elderly_id, status, term_type, service_plan_type, approval_state, care_shift, monthly_visit_plan, planned_visit_duration_minutes, service_for_client_id, start_date, extension_end_date, admin_notes, end_date')
      .is('archived_at', null)
      .order('id', { ascending: false });

    if (buddyId) {
      assignmentQuery = assignmentQuery.eq('buddy_id', Number(buddyId));
    } else if (clientId) {
      const { data: clientMembers, error: clientMembersError } = await supabase
        .from('elderly_members')
        .select('id')
        .eq('client_id', Number(clientId));
      throwIfError(clientMembersError, 'Unable to resolve client assignments');

      const memberIds = (clientMembers || []).map((item) => item.id);
      if (memberIds.length === 0) {
        return res.json([]);
      }

      assignmentQuery = assignmentQuery.in('elderly_id', memberIds);
    }

    const { data: assignments, error: assignmentsError } = await assignmentQuery;
    throwIfError(assignmentsError, 'Unable to fetch assignments');

    const assignmentIds = (assignments || []).map((item) => item.id);
    const serviceRowsByAssignmentId = {};
    if (assignmentIds.length > 0) {
      const { data: serviceRows, error: serviceRowsError } = await supabase
        .from('care_plan_services')
        .select('id, assignment_id, service_code, service_name, is_required')
        .in('assignment_id', assignmentIds)
        .order('id', { ascending: true });
      throwIfError(serviceRowsError, 'Unable to fetch care plan services');

      for (const row of serviceRows || []) {
        if (!serviceRowsByAssignmentId[row.assignment_id]) {
          serviceRowsByAssignmentId[row.assignment_id] = [];
        }
        serviceRowsByAssignmentId[row.assignment_id].push(row);
      }
    }

    const userMap = await fetchUsersMapById((assignments || []).map((item) => item.buddy_id));
    const elderlyMap = await fetchElderlyMapById((assignments || []).map((item) => item.elderly_id));

    const rows = (assignments || []).map((assignment) => ({
      ...assignment,
      buddy_name: userMap[assignment.buddy_id]?.full_name || 'Unknown',
      elderly_name: elderlyMap[assignment.elderly_id]?.full_name || 'Unknown',
      age: elderlyMap[assignment.elderly_id]?.age ?? null,
      address: elderlyMap[assignment.elderly_id]?.address ?? '',
      services: serviceRowsByAssignmentId[assignment.id] || [],
    }));

    return res.json(rows);
  } catch (error) {
    console.error('Fetch assignments failed:', error);
    return res.status(500).json({ message: 'Unable to load assignments.' });
  }
});

app.post('/api/assignments', async (req, res) => {
  const {
    buddy_id,
    elderly_id,
    term,
    service_plan_type,
    approval_state,
    care_shift,
    monthly_visit_plan,
    planned_visit_duration_minutes,
    service_for_client_id,
    start_date,
    end_date,
    extension_end_date,
    services,
    admin_notes,
  } = req.body;

  if (!buddy_id || !elderly_id) {
    return res.status(400).json({ message: 'Buddy and client are required for assignment.' });
  }

  try {
    const effectiveServicePlanType = normalizeServicePlanType(service_plan_type, term);
    const requestedApprovalState = normalizeApprovalState(approval_state);
    const effectiveApprovalState = requestedApprovalState === 'approved' ? 'pending_approval' : requestedApprovalState;
    const effectiveCareShift = normalizeCareShift(care_shift);
    const effectiveMonthlyVisitPlan = normalizeIntegerValue(monthly_visit_plan);
    const effectiveVisitDuration = normalizeIntegerValue(planned_visit_duration_minutes);
    const effectiveServices = normalizeServiceCodes(services);
    const effectiveStartDate = normalizeDateOnly(start_date, new Date().toISOString().slice(0, 10));
    const effectiveEndDate = normalizeDateOnly(end_date, null);
    const effectiveExtensionEndDate = extension_end_date ? String(extension_end_date).trim() : null;
    const trimmedAdminNotes = String(admin_notes || '').trim();

    if (effectiveServices.length === 0) {
      return res.status(400).json({ message: 'Select at least one care plan service.' });
    }

    if (effectiveServicePlanType === 'short_term') {
      if (!MONTHLY_VISIT_PLAN_VALUES.has(effectiveMonthlyVisitPlan)) {
        return res.status(400).json({ message: 'Monthly visit plan must be 3, 6, or 9 for short-term service.' });
      }
      if (!PLANNED_VISIT_DURATION_VALUES.has(effectiveVisitDuration)) {
        return res.status(400).json({ message: 'Planned visit duration must be 60 or 90 minutes for short-term service.' });
      }
      if (effectiveCareShift) {
        return res.status(400).json({ message: 'Care shift applies only to long-term service.' });
      }
    }

    if (effectiveServicePlanType === 'long_term') {
      if (!effectiveCareShift) {
        return res.status(400).json({ message: 'Care shift is required for long-term service.' });
      }
      if (effectiveMonthlyVisitPlan !== null) {
        return res.status(400).json({ message: 'Monthly visit plan applies only to short-term service.' });
      }
      if (!effectiveStartDate || !effectiveEndDate) {
        return res.status(400).json({ message: 'Start date and end date are required for long-term service.' });
      }
      if (effectiveEndDate < effectiveStartDate) {
        return res.status(400).json({ message: 'End date must be on or after start date for long-term service.' });
      }
      if (effectiveExtensionEndDate && effectiveExtensionEndDate < effectiveEndDate) {
        return res.status(400).json({ message: 'Extension end date must be on or after cycle end date.' });
      }
    }

    const { data: elderlyRecord, error: elderlyRecordError } = await supabase
      .from('elderly_members')
      .select('client_id')
      .eq('id', Number(elderly_id))
      .single();
    throwIfError(elderlyRecordError, 'Unable to resolve client case for assignment');

    const effectiveServiceForClientId = service_for_client_id ? Number(service_for_client_id) : elderlyRecord?.client_id || null;
    const assignmentStatus = mapApprovalStateToAssignmentStatus(effectiveApprovalState);
    const legacyTermType = getLegacyTermType(effectiveServicePlanType);

    const { data: assignmentResult, error: assignmentError } = await supabase
      .from('assignments')
      .insert({
        buddy_id: Number(buddy_id),
        elderly_id: Number(elderly_id),
        status: assignmentStatus,
        term_type: legacyTermType,
        service_plan_type: effectiveServicePlanType,
        approval_state: effectiveApprovalState,
        care_shift: effectiveServicePlanType === 'long_term' ? effectiveCareShift : null,
        monthly_visit_plan: effectiveServicePlanType === 'short_term' ? effectiveMonthlyVisitPlan : null,
        planned_visit_duration_minutes: effectiveServicePlanType === 'short_term' ? effectiveVisitDuration : null,
        service_for_client_id: effectiveServiceForClientId,
        start_date: effectiveStartDate,
        end_date: effectiveServicePlanType === 'long_term' ? effectiveEndDate : null,
        extension_end_date: effectiveExtensionEndDate,
        admin_notes: trimmedAdminNotes || null,
        created_by: req.session.user?.id || null,
      })
      .select('id')
      .single();
    throwIfError(assignmentError, 'Unable to create assignment');

    const assignmentId = assignmentResult.id;
    const { error: lifecycleAuditError } = await supabase.from('assignment_lifecycle_audits').insert({
      assignment_id: assignmentId,
      from_status: null,
      to_status: effectiveApprovalState,
      actor_user_id: req.session.user?.id || null,
      notes: trimmedAdminNotes || '',
    });
    throwIfError(lifecycleAuditError, 'Unable to create assignment lifecycle audit');

    const { error: serviceInsertError } = await supabase.from('care_plan_services').insert(
      effectiveServices.map((serviceCode) => ({
        assignment_id: assignmentId,
        service_code: serviceCode,
        service_name: getServiceName(serviceCode),
        is_required: true,
      })),
    );
    throwIfError(serviceInsertError, 'Unable to save care plan services');

    if (effectiveServicePlanType === 'short_term' && assignmentStatus === 'active') {
      const scheduledDate = new Date().toISOString().slice(0, 10);
      const note = `${effectiveMonthlyVisitPlan} visits/month • ${effectiveVisitDuration} min`;
      const { error: visitError } = await supabase
        .from('visits')
        .insert({
          buddy_id: Number(buddy_id),
          elderly_id: Number(elderly_id),
          assignment_id: assignmentId,
          scheduled_date: scheduledDate,
          visit_status: 'scheduled',
          status_check: null,
          buddy_notes: note,
        });
      throwIfError(visitError, 'Unable to create starter visit');
    }

    return res.json({ message: 'Assignment created and pending approval.', id: assignmentId });
  } catch (error) {
    console.error('Create assignment failed:', error);
    return res.status(500).json({ message: error.message || 'Unable to create assignment.' });
  }
});

app.get('/api/visits', async (req, res) => {
  const buddyId = req.query.buddy_id;
  const clientId = req.query.client_id;

  try {
    let visitQuery = supabase
      .from('visits')
      .select('id, assignment_id, buddy_id, elderly_id, scheduled_date, visit_status, arrival_time, departure_time, arrival_lat_lng, status_check, buddy_notes, client_visible_notes')
      .is('archived_at', null)
      .order('scheduled_date', { ascending: false });

    if (buddyId) {
      visitQuery = visitQuery.eq('buddy_id', Number(buddyId));
    } else if (clientId) {
      const { data: clientMembers, error: clientMembersError } = await supabase
        .from('elderly_members')
        .select('id')
        .eq('client_id', Number(clientId));
      throwIfError(clientMembersError, 'Unable to resolve client visits');

      const memberIds = (clientMembers || []).map((item) => item.id);
      if (memberIds.length === 0) {
        return res.json([]);
      }
      visitQuery = visitQuery.in('elderly_id', memberIds);
    }

    const { data: visits, error: visitsError } = await visitQuery;
    throwIfError(visitsError, 'Unable to fetch visits');

    const userMap = await fetchUsersMapById((visits || []).map((item) => item.buddy_id));
    const elderlyMap = await fetchElderlyMapById((visits || []).map((item) => item.elderly_id));

    const rows = (visits || []).map((visit) => ({
      ...visit,
      buddy_name: userMap[visit.buddy_id]?.full_name || 'Unknown',
      client_name: elderlyMap[visit.elderly_id]?.full_name || 'Unknown',
      age: elderlyMap[visit.elderly_id]?.age ?? null,
      address: elderlyMap[visit.elderly_id]?.address ?? '',
    }));

    return res.json(rows);
  } catch (error) {
    console.error('Fetch visits failed:', error);
    return res.status(500).json({ message: 'Unable to load visits.' });
  }
});

app.put('/api/visits/:id', async (req, res) => {
  const visitId = req.params.id;
  const { status_check, buddy_notes, arrival_time, departure_time, arrival_lat_lng, visit_status, client_visible_notes } = req.body;

  const updates = [];
  const values = [];
  if (status_check !== undefined) {
    updates.push('status_check = ?');
    values.push(status_check);
  }
  if (buddy_notes !== undefined) {
    updates.push('buddy_notes = ?');
    values.push(buddy_notes);
  }
  if (arrival_time !== undefined) {
    updates.push('arrival_time = ?');
    values.push(arrival_time);
  }
  if (departure_time !== undefined) {
    updates.push('departure_time = ?');
    values.push(departure_time);
  }
  if (arrival_lat_lng !== undefined) {
    updates.push('arrival_lat_lng = ?');
    values.push(arrival_lat_lng);
  }
  if (visit_status !== undefined) {
    updates.push('visit_status = ?');
    values.push(visit_status);
  }
  if (client_visible_notes !== undefined) {
    updates.push('client_visible_notes = ?');
    values.push(client_visible_notes);
  }

  if (updates.length === 0) {
    return res.status(400).json({ message: 'Nothing to update.' });
  }

  try {
    const payload = {};
    if (status_check !== undefined) payload.status_check = status_check;
    if (buddy_notes !== undefined) payload.buddy_notes = buddy_notes;
    if (arrival_time !== undefined) payload.arrival_time = arrival_time;
    if (departure_time !== undefined) payload.departure_time = departure_time;
    if (arrival_lat_lng !== undefined) payload.arrival_lat_lng = arrival_lat_lng;
    if (visit_status !== undefined) payload.visit_status = visit_status;
    if (client_visible_notes !== undefined) payload.client_visible_notes = client_visible_notes;

    const { error } = await supabase.from('visits').update(payload).eq('id', Number(visitId));
    throwIfError(error, 'Unable to update visit');

    return res.json({ message: 'Visit updated.' });
  } catch (error) {
    console.error('Update visit failed:', error);
    return res.status(500).json({ message: 'Unable to update visit.' });
  }
});

app.put('/api/assignments/:id', async (req, res) => {
  const assignmentId = req.params.id;
  const {
    status,
    term_type,
    service_plan_type,
    approval_state,
    end_date,
    extension_end_date,
    admin_notes,
    buddy_id,
    elderly_id,
  } = req.body;

  try {
    const { data: existingAssignment, error: existingAssignmentError } = await supabase
      .from('assignments')
      .select('id, status, approval_state')
      .eq('id', Number(assignmentId))
      .single();
    throwIfError(existingAssignmentError, 'Unable to load assignment for update');

    const existingApprovalState = normalizeApprovalState(existingAssignment.approval_state || 'approved');
    const effectiveApprovalState = approval_state !== undefined
      ? normalizeApprovalState(approval_state)
      : existingApprovalState;

    const effectiveStatus = status !== undefined
      ? normalizeAssignmentStatus(status)
      : existingAssignment.status;

    if (effectiveStatus === 'active' && effectiveApprovalState !== 'approved') {
      return res.status(400).json({ message: 'Only approved assignments can be active.' });
    }

    if (effectiveStatus === 'completed' && effectiveApprovalState !== 'approved') {
      return res.status(400).json({ message: 'Only approved assignments can be marked completed.' });
    }

    const payload = {};
    if (status !== undefined) payload.status = effectiveStatus;
    if (service_plan_type !== undefined) {
      const effectiveServicePlanType = normalizeServicePlanType(service_plan_type, term_type);
      payload.service_plan_type = effectiveServicePlanType;
      payload.term_type = getLegacyTermType(effectiveServicePlanType);
    } else if (term_type !== undefined) {
      payload.term_type = term_type;
      payload.service_plan_type = normalizeServicePlanType(null, term_type);
    }
    if (approval_state !== undefined) {
      payload.approval_state = effectiveApprovalState;
      if (status === undefined || ['active', 'paused'].includes(existingAssignment.status)) {
        payload.status = mapApprovalStateToAssignmentStatus(effectiveApprovalState);
      }
    }
    if (end_date !== undefined) payload.end_date = end_date || null;
    if (extension_end_date !== undefined) payload.extension_end_date = extension_end_date || null;
    if (admin_notes !== undefined) payload.admin_notes = admin_notes;
    if (buddy_id !== undefined) payload.buddy_id = Number(buddy_id);
    if (elderly_id !== undefined) payload.elderly_id = Number(elderly_id);

    const { error } = await supabase.from('assignments').update(payload).eq('id', Number(assignmentId));
    throwIfError(error, 'Unable to update assignment');

    if (approval_state !== undefined && effectiveApprovalState !== existingApprovalState) {
      const { error: lifecycleAuditError } = await supabase.from('assignment_lifecycle_audits').insert({
        assignment_id: Number(assignmentId),
        from_status: existingApprovalState,
        to_status: effectiveApprovalState,
        actor_user_id: req.session.user?.id || null,
        notes: String(admin_notes || '').trim(),
      });
      throwIfError(lifecycleAuditError, 'Unable to record assignment lifecycle audit');
    }

    return res.json({ message: 'Assignment updated.' });
  } catch (error) {
    console.error('Update assignment failed:', error);
    return res.status(500).json({ message: 'Unable to update assignment.' });
  }
});

app.post('/api/assignments/:id/approval-action', async (req, res) => {
  if (!ensureAdminSession(req, res)) {
    return;
  }

  const assignmentId = Number(req.params.id);
  const { action, notes } = req.body;

  if (!Number.isFinite(assignmentId) || assignmentId <= 0) {
    return res.status(400).json({ message: 'Valid assignment id is required.' });
  }

  const actionMap = {
    approve: 'approved',
    reject: 'rejected',
    reschedule: 'rescheduled',
  };

  const nextApprovalState = actionMap[String(action || '').trim().toLowerCase()];
  if (!nextApprovalState) {
    return res.status(400).json({ message: 'Action must be approve, reject, or reschedule.' });
  }

  try {
    const { data: existingAssignment, error: existingAssignmentError } = await supabase
      .from('assignments')
      .select('id, approval_state')
      .eq('id', assignmentId)
      .single();
    throwIfError(existingAssignmentError, 'Unable to load assignment for approval action');

    const previousApprovalState = normalizeApprovalState(existingAssignment.approval_state || 'pending_approval');
    const { error: updateError } = await supabase
      .from('assignments')
      .update({
        approval_state: nextApprovalState,
        status: mapApprovalStateToAssignmentStatus(nextApprovalState),
      })
      .eq('id', assignmentId);
    throwIfError(updateError, 'Unable to update assignment approval state');

    const { error: lifecycleAuditError } = await supabase.from('assignment_lifecycle_audits').insert({
      assignment_id: assignmentId,
      from_status: previousApprovalState,
      to_status: nextApprovalState,
      actor_user_id: req.session.user?.id || null,
      notes: String(notes || '').trim(),
    });
    throwIfError(lifecycleAuditError, 'Unable to record assignment lifecycle audit');

    return res.json({ message: 'Assignment approval status updated.' });
  } catch (error) {
    console.error('Assignment approval action failed:', error);
    return res.status(500).json({ message: error.message || 'Unable to update assignment approval status.' });
  }
});

app.post('/api/assignments/:id/client-approve', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: 'Login required.' });
  }

  if (req.session.user.role !== 'client') {
    return res.status(403).json({ message: 'Client access required.' });
  }

  const assignmentId = Number(req.params.id);
  if (!Number.isFinite(assignmentId) || assignmentId <= 0) {
    return res.status(400).json({ message: 'Valid assignment id is required.' });
  }

  try {
    const { data: assignmentRow, error: assignmentRowError } = await supabase
      .from('assignments')
      .select('id, elderly_id, approval_state')
      .eq('id', assignmentId)
      .single();
    throwIfError(assignmentRowError, 'Unable to load assignment');

    const { data: elderlyRow, error: elderlyRowError } = await supabase
      .from('elderly_members')
      .select('client_id')
      .eq('id', assignmentRow.elderly_id)
      .single();
    throwIfError(elderlyRowError, 'Unable to validate client assignment access');

    if (Number(elderlyRow.client_id) !== Number(req.session.user.id)) {
      return res.status(403).json({ message: 'You are not allowed to approve this assignment.' });
    }

    const previousApprovalState = normalizeApprovalState(assignmentRow.approval_state || 'pending_approval');

    const { error: updateError } = await supabase
      .from('assignments')
      .update({ approval_state: 'approved', status: 'active' })
      .eq('id', assignmentId);
    throwIfError(updateError, 'Unable to approve assignment');

    const { error: lifecycleAuditError } = await supabase.from('assignment_lifecycle_audits').insert({
      assignment_id: assignmentId,
      from_status: previousApprovalState,
      to_status: 'approved',
      actor_user_id: req.session.user?.id || null,
      notes: 'Client approved assignment.',
    });
    throwIfError(lifecycleAuditError, 'Unable to record assignment lifecycle audit');

    return res.json({ message: 'Assignment approved.' });
  } catch (error) {
    console.error('Client assignment approval failed:', error);
    return res.status(500).json({ message: error.message || 'Unable to approve assignment.' });
  }
});

app.post('/api/assignments/:id/extend', async (req, res) => {
  if (!ensureAdminSession(req, res)) {
    return;
  }

  const assignmentId = Number(req.params.id);
  const { extended_until, reason } = req.body;

  if (!Number.isFinite(assignmentId) || assignmentId <= 0) {
    return res.status(400).json({ message: 'Valid assignment id is required.' });
  }

  try {
    const extensionDate = normalizeDateOnly(extended_until);
    if (!extensionDate) {
      return res.status(400).json({ message: 'extended_until is required (YYYY-MM-DD).' });
    }

    const { data: existingAssignment, error: existingAssignmentError } = await supabase
      .from('assignments')
      .select('id, service_plan_type, term_type, end_date, extension_end_date, approval_state')
      .eq('id', assignmentId)
      .single();
    throwIfError(existingAssignmentError, 'Unable to load assignment for extension');

    const servicePlanType = normalizeServicePlanType(existingAssignment.service_plan_type, existingAssignment.term_type);
    if (servicePlanType !== 'long_term') {
      return res.status(400).json({ message: 'Only long-term assignments can be extended.' });
    }

    const baselineEndDate = normalizeDateOnly(existingAssignment.extension_end_date || existingAssignment.end_date || null, null);
    if (baselineEndDate && extensionDate <= baselineEndDate) {
      return res.status(400).json({ message: 'Extension date must be later than the current cycle end date.' });
    }

    const { error: updateError } = await supabase
      .from('assignments')
      .update({
        end_date: extensionDate,
        extension_end_date: extensionDate,
      })
      .eq('id', assignmentId);
    throwIfError(updateError, 'Unable to extend assignment');

    const approvalState = normalizeApprovalState(existingAssignment.approval_state || 'pending_approval');
    const note = `Assignment extended until ${extensionDate}${reason ? ` (${String(reason).trim()})` : ''}`;
    const { error: lifecycleAuditError } = await supabase.from('assignment_lifecycle_audits').insert({
      assignment_id: assignmentId,
      from_status: approvalState,
      to_status: approvalState,
      actor_user_id: req.session.user?.id || null,
      notes: note,
    });
    throwIfError(lifecycleAuditError, 'Unable to record assignment extension audit');

    return res.json({ message: `Assignment extended to ${extensionDate}.`, end_date: extensionDate });
  } catch (error) {
    console.error('Extend assignment failed:', error);
    return res.status(500).json({ message: error.message || 'Unable to extend assignment.' });
  }
});

app.get('/api/assignments/:id/daily-records', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: 'Login required.' });
  }

  const assignmentId = Number(req.params.id);
  if (!Number.isFinite(assignmentId) || assignmentId <= 0) {
    return res.status(400).json({ message: 'Valid assignment id is required.' });
  }

  try {
    const { data: assignmentRow, error: assignmentRowError } = await supabase
      .from('assignments')
      .select('id, buddy_id, elderly_id, service_plan_type, term_type')
      .eq('id', assignmentId)
      .single();
    throwIfError(assignmentRowError, 'Unable to load assignment for daily records');

    const servicePlanType = normalizeServicePlanType(assignmentRow.service_plan_type, assignmentRow.term_type);
    if (servicePlanType !== 'long_term') {
      return res.status(400).json({ message: 'Daily records are only available for long-term assignments.' });
    }

    if (req.session.user.role === 'buddy' && Number(assignmentRow.buddy_id) !== Number(req.session.user.id)) {
      return res.status(403).json({ message: 'You are not allowed to view daily records for this assignment.' });
    }

    if (req.session.user.role === 'client') {
      const { data: elderlyRow, error: elderlyRowError } = await supabase
        .from('elderly_members')
        .select('client_id')
        .eq('id', assignmentRow.elderly_id)
        .single();
      throwIfError(elderlyRowError, 'Unable to validate assignment access');

      if (Number(elderlyRow.client_id) !== Number(req.session.user.id)) {
        return res.status(403).json({ message: 'You are not allowed to view daily records for this assignment.' });
      }
    }

    const { data: rows, error: rowsError } = await supabase
      .from('visit_sessions')
      .select('id, assignment_id, visit_id, session_date, intime, outtime, entry_notes, exit_notes, backfilled, backfill_reason, created_at, updated_at')
      .eq('assignment_id', assignmentId)
      .order('session_date', { ascending: false });
    throwIfError(rowsError, 'Unable to fetch daily records');

    return res.json(rows || []);
  } catch (error) {
    console.error('Fetch assignment daily records failed:', error);
    return res.status(500).json({ message: error.message || 'Unable to fetch daily records.' });
  }
});

app.post('/api/assignments/:id/daily-records', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: 'Login required.' });
  }

  if (!['admin', 'buddy'].includes(req.session.user.role)) {
    return res.status(403).json({ message: 'Admin or buddy access required.' });
  }

  const assignmentId = Number(req.params.id);
  if (!Number.isFinite(assignmentId) || assignmentId <= 0) {
    return res.status(400).json({ message: 'Valid assignment id is required.' });
  }

  const {
    session_date,
    intime,
    outtime,
    entry_notes,
    exit_notes,
    backfilled,
    backfill_reason,
    visit_id,
  } = req.body;

  try {
    const { data: assignmentRow, error: assignmentRowError } = await supabase
      .from('assignments')
      .select('id, buddy_id, service_plan_type, term_type, approval_state, status')
      .eq('id', assignmentId)
      .single();
    throwIfError(assignmentRowError, 'Unable to load assignment for daily record');

    const servicePlanType = normalizeServicePlanType(assignmentRow.service_plan_type, assignmentRow.term_type);
    if (servicePlanType !== 'long_term') {
      return res.status(400).json({ message: 'Daily records are only available for long-term assignments.' });
    }

    if (req.session.user.role === 'buddy' && Number(assignmentRow.buddy_id) !== Number(req.session.user.id)) {
      return res.status(403).json({ message: 'You are not allowed to update daily records for this assignment.' });
    }

    if (normalizeApprovalState(assignmentRow.approval_state || 'pending_approval') !== 'approved') {
      return res.status(400).json({ message: 'Daily records are allowed only for approved assignments.' });
    }

    const assignmentStatus = normalizeAssignmentStatus(assignmentRow.status || 'paused');
    if (!['active', 'paused'].includes(assignmentStatus)) {
      return res.status(400).json({ message: 'Daily records are allowed only for active or paused long-term assignments.' });
    }

    const effectiveSessionDate = normalizeDateOnly(session_date, new Date().toISOString().slice(0, 10));
    const payload = {
      assignment_id: assignmentId,
      visit_id: visit_id ? Number(visit_id) : null,
      session_date: effectiveSessionDate,
      intime: intime || null,
      outtime: outtime || null,
      entry_notes: String(entry_notes || '').trim(),
      exit_notes: String(exit_notes || '').trim(),
      backfilled: Boolean(backfilled),
      backfill_reason: String(backfill_reason || '').trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { data: existingRow, error: existingRowError } = await supabase
      .from('visit_sessions')
      .select('id')
      .eq('assignment_id', assignmentId)
      .eq('session_date', effectiveSessionDate)
      .maybeSingle();

    if (existingRowError) {
      throwIfError(existingRowError, 'Unable to check existing daily record');
    }

    if (existingRow?.id) {
      const { error: updateError } = await supabase
        .from('visit_sessions')
        .update(payload)
        .eq('id', existingRow.id);
      throwIfError(updateError, 'Unable to update daily record');
      return res.json({ message: 'Daily record updated.' });
    }

    const { error: insertError } = await supabase
      .from('visit_sessions')
      .insert({
        ...payload,
        created_at: new Date().toISOString(),
      });
    throwIfError(insertError, 'Unable to create daily record');
    return res.json({ message: 'Daily record created.' });
  } catch (error) {
    console.error('Save assignment daily record failed:', error);
    return res.status(500).json({ message: error.message || 'Unable to save daily record.' });
  }
});

app.get('/api/assignment-lifecycle-audits', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: 'Login required.' });
  }

  if (!['admin', 'client'].includes(req.session.user.role)) {
    return res.status(403).json({ message: 'Admin or client access required.' });
  }

  const assignmentId = Number(req.query.assignment_id);
  const clientIdFilter = Number(req.query.client_id);

  try {
    let allowedAssignmentIds = null;

    if (req.session.user.role === 'client') {
      const { data: memberRows, error: memberRowsError } = await supabase
        .from('elderly_members')
        .select('id')
        .eq('client_id', Number(req.session.user.id));
      throwIfError(memberRowsError, 'Unable to resolve client members for lifecycle audits');

      const memberIds = (memberRows || []).map((row) => row.id);
      if (memberIds.length === 0) {
        return res.json([]);
      }

      const { data: assignmentRows, error: assignmentRowsError } = await supabase
        .from('assignments')
        .select('id')
        .in('elderly_id', memberIds)
        .is('archived_at', null);
      throwIfError(assignmentRowsError, 'Unable to resolve client assignments for lifecycle audits');

      allowedAssignmentIds = (assignmentRows || []).map((row) => row.id);
      if (allowedAssignmentIds.length === 0) {
        return res.json([]);
      }
    }

    if (req.session.user.role === 'admin' && Number.isFinite(clientIdFilter) && clientIdFilter > 0) {
      const { data: memberRows, error: memberRowsError } = await supabase
        .from('elderly_members')
        .select('id')
        .eq('client_id', clientIdFilter);
      throwIfError(memberRowsError, 'Unable to resolve client filter for lifecycle audits');

      const memberIds = (memberRows || []).map((row) => row.id);
      if (memberIds.length === 0) {
        return res.json([]);
      }

      const { data: assignmentRows, error: assignmentRowsError } = await supabase
        .from('assignments')
        .select('id')
        .in('elderly_id', memberIds)
        .is('archived_at', null);
      throwIfError(assignmentRowsError, 'Unable to resolve assignment filter for lifecycle audits');

      allowedAssignmentIds = (assignmentRows || []).map((row) => row.id);
      if (allowedAssignmentIds.length === 0) {
        return res.json([]);
      }
    }

    let auditQuery = supabase
      .from('assignment_lifecycle_audits')
      .select('id, assignment_id, from_status, to_status, actor_user_id, notes, created_at')
      .is('archived_at', null)
      .order('created_at', { ascending: false });

    if (Number.isFinite(assignmentId) && assignmentId > 0) {
      auditQuery = auditQuery.eq('assignment_id', assignmentId);
    }

    if (Array.isArray(allowedAssignmentIds)) {
      auditQuery = auditQuery.in('assignment_id', allowedAssignmentIds);
    }

    const { data: audits, error: auditsError } = await auditQuery;
    throwIfError(auditsError, 'Unable to fetch assignment lifecycle audits');

    const auditAssignmentIds = Array.from(new Set((audits || []).map((row) => row.assignment_id).filter(Boolean)));
    const actorUserIds = Array.from(new Set((audits || []).map((row) => row.actor_user_id).filter(Boolean)));

    const { data: assignmentRows, error: assignmentRowsError } = await supabase
      .from('assignments')
      .select('id, buddy_id, elderly_id')
      .in('id', auditAssignmentIds.length > 0 ? auditAssignmentIds : [0]);
    throwIfError(assignmentRowsError, 'Unable to fetch assignment references for lifecycle audits');

    const assignmentMap = {};
    for (const row of assignmentRows || []) {
      assignmentMap[row.id] = row;
    }

    const buddyUserIds = (assignmentRows || []).map((row) => row.buddy_id);
    const elderlyIds = (assignmentRows || []).map((row) => row.elderly_id);
    const buddyMap = await fetchUsersMapById(buddyUserIds);
    const elderlyMap = await fetchElderlyMapById(elderlyIds);
    const actorMap = await fetchUsersMapById(actorUserIds);

    const rows = (audits || []).map((entry) => {
      const assignmentReference = assignmentMap[entry.assignment_id] || null;
      const buddyName = assignmentReference ? (buddyMap[assignmentReference.buddy_id]?.full_name || 'Unknown') : 'Unknown';
      const elderlyName = assignmentReference ? (elderlyMap[assignmentReference.elderly_id]?.full_name || 'Unknown') : 'Unknown';
      const actorName = entry.actor_user_id ? (actorMap[entry.actor_user_id]?.full_name || 'Unknown') : 'System';

      return {
        ...entry,
        actor_name: actorName,
        buddy_name: buddyName,
        elderly_name: elderlyName,
      };
    });

    return res.json(rows);
  } catch (error) {
    console.error('Fetch assignment lifecycle audits failed:', error);
    return res.status(500).json({ message: error.message || 'Unable to fetch assignment lifecycle audits.' });
  }
});

app.get('/api/tasks', async (req, res) => {
  const buddyId = req.query.buddy_id;
  const clientId = req.query.client_id;

  try {
    const { data: allTasks, error: taskError } = await supabase
      .from('visit_tasks')
      .select('id, visit_id, task_name, status, measured_value, buddy_remarks, updated_at')
      .is('archived_at', null)
      .order('updated_at', { ascending: false });
    throwIfError(taskError, 'Unable to fetch tasks');

    const visitIds = (allTasks || []).map((task) => task.visit_id);
    if (visitIds.length === 0) {
      return res.json([]);
    }

    const { data: visitRows, error: visitError } = await supabase
      .from('visits')
      .select('id, buddy_id, elderly_id, scheduled_date')
      .is('archived_at', null)
      .in('id', Array.from(new Set(visitIds)));
    throwIfError(visitError, 'Unable to fetch visits for tasks');

    const visitMap = {};
    for (const visit of visitRows || []) {
      visitMap[visit.id] = visit;
    }

    let rows = (allTasks || [])
      .map((task) => ({ ...task, ...(visitMap[task.visit_id] || {}) }))
      .filter((task) => !!task.visit_id && !!task.buddy_id && !!task.elderly_id);

    if (buddyId) {
      rows = rows.filter((task) => task.buddy_id === Number(buddyId));
    } else if (clientId) {
      const { data: clientMembers, error: clientMembersError } = await supabase
        .from('elderly_members')
        .select('id')
        .eq('client_id', Number(clientId));
      throwIfError(clientMembersError, 'Unable to resolve client tasks');
      const memberSet = new Set((clientMembers || []).map((member) => member.id));
      rows = rows.filter((task) => memberSet.has(task.elderly_id));
    }

    const userMap = await fetchUsersMapById(rows.map((item) => item.buddy_id));
    const elderlyMap = await fetchElderlyMapById(rows.map((item) => item.elderly_id));

    rows = rows.map((row) => ({
      ...row,
      buddy_name: userMap[row.buddy_id]?.full_name || 'Unknown',
      client_name: elderlyMap[row.elderly_id]?.full_name || 'Unknown',
    }));

    return res.json(rows);
  } catch (error) {
    console.error('Fetch tasks failed:', error);
    return res.status(500).json({ message: 'Unable to load tasks.' });
  }
});

app.post('/api/tasks', async (req, res) => {
  const { visit_id, task_name, status, measured_value, buddy_remarks } = req.body;
  if (!visit_id || !task_name) {
    return res.status(400).json({ message: 'Visit and task name are required.' });
  }

  try {
    const { error } = await supabase.from('visit_tasks').insert({
      visit_id,
      task_name,
      status: status || 'pending',
      measured_value: measured_value || '',
      buddy_remarks: buddy_remarks || '',
      updated_at: new Date().toISOString(),
    });
    throwIfError(error, 'Unable to create task');

    return res.json({ message: 'Task created.' });
  } catch (error) {
    console.error('Create task failed:', error);
    return res.status(500).json({ message: 'Unable to create task.' });
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  const taskId = req.params.id;
  const { status, measured_value, buddy_remarks } = req.body;

  const updates = [];
  const values = [];
  if (status !== undefined) {
    updates.push('status = ?');
    values.push(status);
  }
  if (measured_value !== undefined) {
    updates.push('measured_value = ?');
    values.push(measured_value);
  }
  if (buddy_remarks !== undefined) {
    updates.push('buddy_remarks = ?');
    values.push(buddy_remarks);
  }
  if (updates.length === 0) {
    return res.status(400).json({ message: 'Nothing to update.' });
  }

  try {
    const payload = { updated_at: new Date().toISOString() };
    if (status !== undefined) payload.status = status;
    if (measured_value !== undefined) payload.measured_value = measured_value;
    if (buddy_remarks !== undefined) payload.buddy_remarks = buddy_remarks;

    const { error } = await supabase.from('visit_tasks').update(payload).eq('id', Number(taskId));
    throwIfError(error, 'Unable to update task');

    return res.json({ message: 'Task updated.' });
  } catch (error) {
    console.error('Update task failed:', error);
    return res.status(500).json({ message: 'Unable to update task.' });
  }
});

app.post('/api/location', async (req, res) => {
  const { buddy_id, lat, lng } = req.body;

  if (!buddy_id || !lat || !lng) {
    return res.status(400).json({ message: 'Buddy ID, latitude, and longitude are required.' });
  }

  const arrivalLatLng = `${lat},${lng}`;
  const updatedAt = new Date().toISOString();
  currentLocations[String(buddy_id)] = { lat, lng, updated_at: updatedAt };

  try {
    const { data: assignmentRows, error: assignmentRowsError } = await supabase
      .from('assignments')
      .select('id')
      .eq('buddy_id', Number(buddy_id))
      .eq('status', 'active')
      .eq('approval_state', 'approved')
      .is('archived_at', null)
      .limit(1);
    throwIfError(assignmentRowsError, 'Unable to validate active assignment for location update');

    if (!Array.isArray(assignmentRows) || assignmentRows.length === 0) {
      return res.status(400).json({ message: 'Location updates are allowed only for active approved cases.' });
    }

    const { data: rows, error: rowsError } = await supabase
      .from('visits')
      .select('id')
      .eq('buddy_id', buddy_id)
      .is('archived_at', null)
      .order('scheduled_date', { ascending: false })
      .limit(1);
    throwIfError(rowsError, 'Unable to fetch latest visit for location');

    if (Array.isArray(rows) && rows.length > 0) {
      const visitId = rows[0].id;
      const { error: updateError } = await supabase.from('visits').update({ arrival_lat_lng: arrivalLatLng }).eq('id', visitId);
      throwIfError(updateError, 'Unable to update visit location');
    }
  } catch (error) {
    console.error('Location update warning:', error);
  }

  return res.json({ currentLocation: currentLocations[String(buddy_id)] });
});

app.get('/api/location/current', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: 'Login required.' });
  }

  const assignmentId = Number(req.query.assignment_id);
  if (!Number.isFinite(assignmentId) || assignmentId <= 0) {
    return res.status(400).json({ message: 'assignment_id is required.' });
  }

  try {
    const { assignmentRow, isActiveCase, guardReasonCode, guardMessage } = await getActiveApprovedAssignmentForLocation(assignmentId);

    if (req.session.user.role === 'buddy' && Number(assignmentRow.buddy_id) !== Number(req.session.user.id)) {
      return res.status(403).json({ message: 'You are not allowed to access this assignment location.' });
    }

    if (req.session.user.role === 'client') {
      const { data: elderlyRow, error: elderlyError } = await supabase
        .from('elderly_members')
        .select('client_id')
        .eq('id', assignmentRow.elderly_id)
        .single();
      throwIfError(elderlyError, 'Unable to validate assignment location access');
      if (Number(elderlyRow.client_id) !== Number(req.session.user.id)) {
        return res.status(403).json({ message: 'You are not allowed to access this assignment location.' });
      }
    }

    if (!isActiveCase) {
      return res.json({
        currentLocation: null,
        active: false,
        guarded: true,
        guard_reason_code: guardReasonCode,
        message: guardMessage,
      });
    }

    const cached = currentLocations[String(assignmentRow.buddy_id)];
    if (cached) {
      return res.json({
        currentLocation: cached,
        active: true,
        guarded: false,
        guard_reason_code: null,
        message: null,
      });
    }

    const { data: rows, error } = await supabase
      .from('visits')
      .select('arrival_lat_lng')
      .eq('assignment_id', assignmentId)
      .is('archived_at', null)
      .not('arrival_lat_lng', 'is', null)
      .order('scheduled_date', { ascending: false })
      .limit(1);
    throwIfError(error, 'Unable to fetch active assignment location');

    if (Array.isArray(rows) && rows.length > 0 && rows[0].arrival_lat_lng) {
      const [lat, lng] = String(rows[0].arrival_lat_lng).split(',');
      return res.json({
        currentLocation: { lat, lng, updated_at: new Date().toISOString() },
        active: true,
        guarded: false,
        guard_reason_code: null,
        message: null,
      });
    }

    return res.json({
      currentLocation: null,
      active: true,
      guarded: false,
      guard_reason_code: null,
      message: null,
    });
  } catch (error) {
    console.error('Fetch current location failed:', error);
    return res.status(500).json({ message: error.message || 'Unable to load current location.' });
  }
});

app.get('/api/location', async (req, res) => {
  const buddyId = req.query.buddy_id;

  if (!buddyId) {
    return res.status(400).json({ message: 'buddy_id is required.' });
  }

  const cached = currentLocations[String(buddyId)];
  if (cached) {
    return res.json({ currentLocation: cached });
  }

  try {
    const { data: rows, error } = await supabase
      .from('visits')
      .select('arrival_lat_lng')
      .eq('buddy_id', Number(buddyId))
      .is('archived_at', null)
      .not('arrival_lat_lng', 'is', null)
      .order('scheduled_date', { ascending: false })
      .limit(1);
    throwIfError(error, 'Unable to fetch location');

    if (Array.isArray(rows) && rows.length > 0) {
      const locationData = rows[0].arrival_lat_lng;
      if (locationData) {
        const [lat, lng] = String(locationData).split(',');
        return res.json({ currentLocation: { lat, lng, updated_at: new Date().toISOString() } });
      }
    }
    return res.json({ currentLocation: null });
  } catch (error) {
    console.error('Fetch location failed:', error);
    return res.status(500).json({ message: 'Unable to load location.' });
  }
});

app.post('/api/requests', async (req, res) => {
  const { user_id, elderly_id, message, request_type } = req.body;

  const sessionUserId = req.session.user?.id ? Number(req.session.user.id) : null;
  const effectiveUserId = sessionUserId || Number(user_id);

  if (!effectiveUserId || !message) {
    return res.status(400).json({ message: 'User ID and request message are required.' });
  }

  try {
    const { data: userRow, error: userRowError } = await supabase
      .from('users')
      .select('id')
      .eq('id', effectiveUserId)
      .limit(1);
    throwIfError(userRowError, 'Unable to validate request user');

    if (!Array.isArray(userRow) || userRow.length === 0) {
      return res.status(400).json({ message: 'Unable to submit request: client profile not found. Please sign in again.' });
    }

    const payload = {
      user_id: effectiveUserId,
      elderly_id: elderly_id ? Number(elderly_id) : null,
      request_type: request_type || 'general',
      message,
      status: 'new',
    };

    let { error } = await supabase.from('client_requests').insert(payload);

    // Backward compatibility for deployments where the old status constraint
    // still only allows: open, in_progress, resolved, closed.
    if (error && String(error.message || '').includes('client_requests_status_check')) {
      ({ error } = await supabase.from('client_requests').insert({
        ...payload,
        status: 'open',
      }));
    }

    throwIfError(error, 'Unable to save request');
    return res.json({ message: 'Your request has been submitted. Admin will review it shortly.' });
  } catch (error) {
    console.error('Save request failed:', error);
    if (error?.message?.includes('violates foreign key constraint')) {
      return res.status(400).json({ message: 'Unable to submit request: linked profile is invalid. Please sign in again.' });
    }
    return res.status(500).json({ message: 'Unable to submit request.' });
  }
});

app.put('/api/requests/:id/status', async (req, res) => {
  if (!ensureAdminSession(req, res)) {
    return;
  }

  const requestId = Number(req.params.id);
  const { status } = req.body;

  if (!Number.isFinite(requestId) || requestId <= 0) {
    return res.status(400).json({ message: 'Valid request id is required.' });
  }

  try {
    const normalizedStatus = normalizeRequestStatus(status);
    const payload = {
      status: normalizedStatus,
      resolved_at: ['assigned', 'resolved', 'closed'].includes(normalizedStatus) ? new Date().toISOString() : null,
    };

    const { error } = await supabase.from('client_requests').update(payload).eq('id', requestId);
    throwIfError(error, 'Unable to update request status');
    return res.json({ message: 'Request status updated.' });
  } catch (error) {
    console.error('Update request status failed:', error);
    return res.status(500).json({ message: error.message || 'Unable to update request status.' });
  }
});

app.post('/api/requests/auto-view', async (req, res) => {
  if (!ensureAdminSession(req, res)) {
    return;
  }

  try {
    const { data, error } = await supabase
      .from('client_requests')
      .update({ status: 'viewed', resolved_at: null })
      .in('status', ['new', 'open'])
      .is('archived_at', null)
      .select('id');
    throwIfError(error, 'Unable to auto-advance request statuses');

    return res.json({
      message: 'Request statuses updated.',
      updatedCount: Array.isArray(data) ? data.length : 0,
    });
  } catch (error) {
    console.error('Auto-advance requests failed:', error);
    return res.status(500).json({ message: error.message || 'Unable to auto-advance request statuses.' });
  }
});

app.post('/api/visit-sessions/start', async (req, res) => {
  if (!ensureAdminOrBuddySession(req, res)) {
    return;
  }

  const { assignment_id, visit_id, entry_notes } = req.body;
  const assignmentId = Number(assignment_id);

  if (!Number.isFinite(assignmentId) || assignmentId <= 0) {
    return res.status(400).json({ message: 'Valid assignment_id is required.' });
  }

  try {
    const { data: assignmentRow, error: assignmentRowError } = await supabase
      .from('assignments')
      .select('id, buddy_id, approval_state, status')
      .eq('id', assignmentId)
      .single();
    throwIfError(assignmentRowError, 'Unable to load assignment for session start');

    if (req.session.user.role === 'buddy' && Number(assignmentRow.buddy_id) !== Number(req.session.user.id)) {
      return res.status(403).json({ message: 'You are not allowed to start this visit session.' });
    }

    if (normalizeApprovalState(assignmentRow.approval_state || 'pending_approval') !== 'approved') {
      return res.status(400).json({ message: 'Visit sessions are allowed only for approved assignments.' });
    }

    const assignmentStatus = normalizeAssignmentStatus(assignmentRow.status || 'paused');
    if (!['active', 'paused'].includes(assignmentStatus)) {
      return res.status(400).json({ message: 'Visit sessions are allowed only for active or paused assignments.' });
    }

    const sessionDate = new Date().toISOString().slice(0, 10);
    const startTimeIso = new Date().toISOString();

    const { data: existingSession, error: existingSessionError } = await supabase
      .from('visit_sessions')
      .select('id, assignment_id, session_date, intime, outtime, entry_notes')
      .eq('assignment_id', assignmentId)
      .eq('session_date', sessionDate)
      .maybeSingle();
    if (existingSessionError) {
      throwIfError(existingSessionError, 'Unable to check existing visit session');
    }

    const mergedEntryNotes = String(entry_notes || '').trim();

    if (existingSession?.id) {
      const { error: updateError } = await supabase
        .from('visit_sessions')
        .update({
          visit_id: visit_id ? Number(visit_id) : existingSession.visit_id || null,
          intime: existingSession.intime || startTimeIso,
          outtime: existingSession.outtime || null,
          entry_notes: mergedEntryNotes || existingSession.entry_notes || '',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingSession.id);
      throwIfError(updateError, 'Unable to start visit session');
      return res.json({ message: 'Visit session started.', id: existingSession.id, session_date: sessionDate });
    }

    const { data: insertedSession, error: insertError } = await supabase
      .from('visit_sessions')
      .insert({
        assignment_id: assignmentId,
        visit_id: visit_id ? Number(visit_id) : null,
        session_date: sessionDate,
        intime: startTimeIso,
        outtime: null,
        entry_notes: mergedEntryNotes,
        exit_notes: '',
        backfilled: false,
        backfill_reason: null,
      })
      .select('id')
      .single();
    throwIfError(insertError, 'Unable to create visit session');

    return res.json({ message: 'Visit session started.', id: insertedSession.id, session_date: sessionDate });
  } catch (error) {
    console.error('Start visit session failed:', error);
    return res.status(500).json({ message: error.message || 'Unable to start visit session.' });
  }
});

app.post('/api/visit-sessions/:id/complete', async (req, res) => {
  if (!ensureAdminOrBuddySession(req, res)) {
    return;
  }

  const sessionId = Number(req.params.id);
  const { exit_notes } = req.body;
  if (!Number.isFinite(sessionId) || sessionId <= 0) {
    return res.status(400).json({ message: 'Valid visit session id is required.' });
  }

  try {
    const { data: sessionRow, error: sessionRowError } = await supabase
      .from('visit_sessions')
      .select('id, assignment_id, visit_id, outtime')
      .eq('id', sessionId)
      .single();
    throwIfError(sessionRowError, 'Unable to load visit session for completion');

    const { data: assignmentRow, error: assignmentRowError } = await supabase
      .from('assignments')
      .select('id, buddy_id, elderly_id')
      .eq('id', sessionRow.assignment_id)
      .single();
    throwIfError(assignmentRowError, 'Unable to load assignment for visit session completion');

    if (req.session.user.role === 'buddy' && Number(assignmentRow.buddy_id) !== Number(req.session.user.id)) {
      return res.status(403).json({ message: 'You are not allowed to complete this visit session.' });
    }

    if (sessionRow.outtime) {
      return res.status(400).json({ message: 'Visit session is already completed.' });
    }

    if (sessionRow.visit_id) {
      const { data: taskRows, error: taskRowsError } = await supabase
        .from('visit_tasks')
        .select('id, status')
        .eq('visit_id', sessionRow.visit_id)
        .is('archived_at', null);
      throwIfError(taskRowsError, 'Unable to validate visit tasks before completion');

      const pendingTasks = (taskRows || []).filter((task) => !['completed', 'done'].includes(String(task.status || '').toLowerCase()));
      if (pendingTasks.length > 0) {
        return res.status(400).json({ message: 'Complete required tasks before recording outtime.' });
      }
    }

    const { error: updateError } = await supabase
      .from('visit_sessions')
      .update({
        outtime: new Date().toISOString(),
        exit_notes: String(exit_notes || '').trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);
    throwIfError(updateError, 'Unable to complete visit session');

    return res.json({ message: 'Visit session completed.' });
  } catch (error) {
    console.error('Complete visit session failed:', error);
    return res.status(500).json({ message: error.message || 'Unable to complete visit session.' });
  }
});

app.post('/api/visit-sessions/:id/backfill', async (req, res) => {
  if (!ensureAdminOrBuddySession(req, res)) {
    return;
  }

  const sessionId = Number(req.params.id);
  const {
    session_date,
    intime,
    outtime,
    entry_notes,
    exit_notes,
    backfill_reason,
  } = req.body;

  if (!Number.isFinite(sessionId) || sessionId <= 0) {
    return res.status(400).json({ message: 'Valid visit session id is required.' });
  }

  if (!String(backfill_reason || '').trim()) {
    return res.status(400).json({ message: 'Backfill reason is required.' });
  }

  try {
    const { data: sessionRow, error: sessionRowError } = await supabase
      .from('visit_sessions')
      .select('id, assignment_id')
      .eq('id', sessionId)
      .single();
    throwIfError(sessionRowError, 'Unable to load visit session for backfill');

    const { data: assignmentRow, error: assignmentRowError } = await supabase
      .from('assignments')
      .select('id, buddy_id')
      .eq('id', sessionRow.assignment_id)
      .single();
    throwIfError(assignmentRowError, 'Unable to load assignment for backfill');

    if (req.session.user.role === 'buddy' && Number(assignmentRow.buddy_id) !== Number(req.session.user.id)) {
      return res.status(403).json({ message: 'You are not allowed to backfill this visit session.' });
    }

    const effectiveSessionDate = normalizeDateOnly(session_date, null);
    if (!effectiveSessionDate) {
      return res.status(400).json({ message: 'session_date is required for backfill.' });
    }

    const { error: updateError } = await supabase
      .from('visit_sessions')
      .update({
        session_date: effectiveSessionDate,
        intime: intime || null,
        outtime: outtime || null,
        entry_notes: String(entry_notes || '').trim(),
        exit_notes: String(exit_notes || '').trim(),
        backfilled: true,
        backfill_reason: String(backfill_reason || '').trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);
    throwIfError(updateError, 'Unable to backfill visit session');

    const reminderSettings = await getReminderSettingsMap();
    if (reminderSettings.backfilled_visit_notice) {
      const buddyMap = await fetchUsersMapById([assignmentRow.buddy_id]);
      const elderlyMap = await fetchElderlyMapById([assignmentRow.elderly_id]);
      const buddyName = buddyMap[assignmentRow.buddy_id]?.full_name || 'Caregiver';
      const elderly = elderlyMap[assignmentRow.elderly_id] || null;

      if (elderly?.client_id) {
        const clientMap = await fetchUsersMapById([elderly.client_id]);
        const client = clientMap[elderly.client_id] || null;

        if (client) {
          const timeLabel = intime
            ? new Date(intime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
            : 'time not recorded';
          const messagePreview = `Update: ${buddyName} visited on ${effectiveSessionDate} at ${timeLabel}.`;

          await createNotificationActionLogEntry({
            clientId: client.id,
            actorUserId: req.session.user?.id || null,
            recipientRole: 'client',
            recipientName: client.full_name || 'Client',
            recipientPhone: client.phone || '',
            channel: 'notify',
            templateKey: 'backfilled_visit_notice',
            messagePreview,
          });

          if (String(client.phone || '').trim()) {
            await createNotificationActionLogEntry({
              clientId: client.id,
              actorUserId: req.session.user?.id || null,
              recipientRole: 'client',
              recipientName: client.full_name || 'Client',
              recipientPhone: client.phone || '',
              channel: 'whatsapp',
              templateKey: 'backfilled_visit_notice',
              messagePreview,
            });
          }
        }
      }
    }

    return res.json({ message: 'Visit session backfilled.' });
  } catch (error) {
    console.error('Backfill visit session failed:', error);
    return res.status(500).json({ message: error.message || 'Unable to backfill visit session.' });
  }
});

app.get('/api/visit-sessions', async (req, res) => {
  if (!ensureAdminOrBuddySession(req, res)) {
    return;
  }

  const all = req.query.all === 'true';
  const assignmentId = Number(req.query.assignment_id);

  try {
    let allowedAssignmentIds = null;

    if (req.session.user.role === 'buddy') {
      const { data: assignmentRows, error: assignmentRowsError } = await supabase
        .from('assignments')
        .select('id')
        .eq('buddy_id', Number(req.session.user.id))
        .is('archived_at', null);
      throwIfError(assignmentRowsError, 'Unable to resolve buddy assignments for visit sessions');

      allowedAssignmentIds = (assignmentRows || []).map((row) => row.id);
      if (allowedAssignmentIds.length === 0) {
        return res.json([]);
      }
    }

    let query = supabase
      .from('visit_sessions')
      .select('id, assignment_id, visit_id, session_date, intime, outtime, entry_notes, exit_notes, backfilled, backfill_reason, created_at, updated_at')
      .order('session_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (req.session.user.role === 'admin' && !all && Number.isFinite(assignmentId) && assignmentId > 0) {
      query = query.eq('assignment_id', assignmentId);
    }

    if (Array.isArray(allowedAssignmentIds)) {
      query = query.in('assignment_id', allowedAssignmentIds);
    }

    const { data: sessions, error: sessionsError } = await query;
    throwIfError(sessionsError, 'Unable to fetch visit sessions');

    const assignmentIds = Array.from(new Set((sessions || []).map((entry) => entry.assignment_id).filter(Boolean)));
    const { data: assignmentRows, error: assignmentRowsError } = await supabase
      .from('assignments')
      .select('id, buddy_id, elderly_id')
      .in('id', assignmentIds.length > 0 ? assignmentIds : [0]);
    throwIfError(assignmentRowsError, 'Unable to fetch assignment references for visit sessions');

    const assignmentMap = {};
    for (const row of assignmentRows || []) {
      assignmentMap[row.id] = row;
    }

    const buddyIds = (assignmentRows || []).map((row) => row.buddy_id);
    const elderlyIds = (assignmentRows || []).map((row) => row.elderly_id);
    const buddyMap = await fetchUsersMapById(buddyIds);
    const elderlyMap = await fetchElderlyMapById(elderlyIds);

    const rows = (sessions || []).map((entry) => {
      const assignmentReference = assignmentMap[entry.assignment_id] || null;
      return {
        ...entry,
        buddy_id: assignmentReference?.buddy_id || null,
        elderly_id: assignmentReference?.elderly_id || null,
        buddy_name: assignmentReference ? (buddyMap[assignmentReference.buddy_id]?.full_name || 'Unknown') : 'Unknown',
        client_name: assignmentReference ? (elderlyMap[assignmentReference.elderly_id]?.full_name || 'Unknown') : 'Unknown',
      };
    });

    return res.json(rows);
  } catch (error) {
    console.error('Fetch visit sessions failed:', error);
    return res.status(500).json({ message: error.message || 'Unable to fetch visit sessions.' });
  }
});

app.get('/api/reports/monthly-summary', async (req, res) => {
  if (!ensureAdminSession(req, res)) {
    return;
  }

  try {
    const defaultMonth = new Date().toISOString().slice(0, 7);
    const monthRange = getMonthRange(req.query.month || defaultMonth);
    const buddyIdFilter = parseOptionalPositiveInt(req.query.buddy_id);
    const clientIdFilter = parseOptionalPositiveInt(req.query.client_id);
    const modeFilterRaw = String(req.query.mode || '').trim().toLowerCase();
    const modeFilter = modeFilterRaw === 'short_term' || modeFilterRaw === 'long_term' ? modeFilterRaw : null;
    const statusFilter = String(req.query.status || '').trim().toLowerCase();

    let clientMemberIds = null;
    if (clientIdFilter) {
      const { data: members, error: membersError } = await supabase
        .from('elderly_members')
        .select('id')
        .eq('client_id', clientIdFilter);
      throwIfError(membersError, 'Unable to resolve client filter for monthly summary');

      clientMemberIds = (members || []).map((row) => row.id);
      if (clientMemberIds.length === 0) {
        return res.json({
          month: monthRange.month,
          start_date: monthRange.startDate,
          end_date: monthRange.endDate,
          filters: {
            buddy_id: buddyIdFilter,
            client_id: clientIdFilter,
            status: statusFilter || null,
            mode: modeFilter,
          },
          totals: {
            planned: 0,
            completed: 0,
            rescheduled: 0,
            missed: 0,
            reminders_sent: 0,
          },
          short_term_package_utilization: {
            totals: {
              planned_visits: 0,
              completed_visits: 0,
              utilization_percent: 0,
            },
            assignments: [],
          },
          long_term_slot_utilization: {
            totals: {
              expected_coverage_days: 0,
              recorded_session_days: 0,
              utilization_percent: 0,
            },
            by_shift: [],
            assignments: [],
          },
          by_buddy: [],
          by_client: [],
          by_status: [],
          by_mode: [],
          generated_at: new Date().toISOString(),
        });
      }
    }

    let assignmentQuery = supabase
      .from('assignments')
      .select('id, buddy_id, elderly_id, service_plan_type, term_type, approval_state, status, care_shift, monthly_visit_plan, start_date, end_date, extension_end_date, archived_at')
      .is('archived_at', null)
      .lte('start_date', monthRange.endDate);

    if (buddyIdFilter) {
      assignmentQuery = assignmentQuery.eq('buddy_id', buddyIdFilter);
    }
    if (Array.isArray(clientMemberIds)) {
      assignmentQuery = assignmentQuery.in('elderly_id', clientMemberIds);
    }

    const { data: assignmentRows, error: assignmentRowsError } = await assignmentQuery;
    throwIfError(assignmentRowsError, 'Unable to fetch assignments for monthly summary');

    const scopedAssignments = (assignmentRows || []).filter((assignment) => {
      const effectiveEndDate = assignment.extension_end_date || assignment.end_date || monthRange.endDate;
      if (String(effectiveEndDate) < monthRange.startDate) {
        return false;
      }
      const serviceMode = normalizeServicePlanType(assignment.service_plan_type, assignment.term_type);
      if (modeFilter && serviceMode !== modeFilter) {
        return false;
      }
      return true;
    });

    const assignmentMap = {};
    scopedAssignments.forEach((assignment) => {
      assignmentMap[assignment.id] = assignment;
    });

    const assignmentIds = scopedAssignments.map((entry) => entry.id);

    let visitQuery = supabase
      .from('visits')
      .select('id, assignment_id, buddy_id, elderly_id, scheduled_date, visit_status')
      .is('archived_at', null)
      .gte('scheduled_date', monthRange.startDate)
      .lte('scheduled_date', monthRange.endDate)
      .order('scheduled_date', { ascending: true });

    if (buddyIdFilter) {
      visitQuery = visitQuery.eq('buddy_id', buddyIdFilter);
    }
    if (Array.isArray(clientMemberIds)) {
      visitQuery = visitQuery.in('elderly_id', clientMemberIds);
    }

    const { data: visitRows, error: visitRowsError } = await visitQuery;
    throwIfError(visitRowsError, 'Unable to fetch visits for monthly summary');

    const scopedVisits = (visitRows || []).filter((visit) => {
      const visitStatus = String(visit.visit_status || '').trim().toLowerCase();
      if (statusFilter && visitStatus !== statusFilter) {
        return false;
      }

      if (visit.assignment_id && !assignmentMap[visit.assignment_id]) {
        return false;
      }

      const assignment = visit.assignment_id ? assignmentMap[visit.assignment_id] : null;
      const serviceMode = assignment
        ? normalizeServicePlanType(assignment.service_plan_type, assignment.term_type)
        : 'short_term';
      if (modeFilter && serviceMode !== modeFilter) {
        return false;
      }

      return true;
    });

    const longTermAssignments = scopedAssignments.filter((assignment) => {
      const serviceMode = normalizeServicePlanType(assignment.service_plan_type, assignment.term_type);
      return serviceMode === 'long_term';
    });
    const shortTermAssignments = scopedAssignments.filter((assignment) => {
      const serviceMode = normalizeServicePlanType(assignment.service_plan_type, assignment.term_type);
      return serviceMode === 'short_term';
    });

    const longTermAssignmentIds = longTermAssignments.map((entry) => entry.id);
    let visitSessions = [];
    if (longTermAssignmentIds.length > 0) {
      const { data: sessionRows, error: sessionRowsError } = await supabase
        .from('visit_sessions')
        .select('id, assignment_id, session_date, backfilled')
        .in('assignment_id', longTermAssignmentIds)
        .gte('session_date', monthRange.startDate)
        .lte('session_date', monthRange.endDate);
      throwIfError(sessionRowsError, 'Unable to fetch long-term sessions for monthly summary');
      visitSessions = sessionRows || [];
    }

    let rescheduledRows = [];
    if (assignmentIds.length > 0) {
      const { data: auditRows, error: auditRowsError } = await supabase
        .from('assignment_lifecycle_audits')
        .select('assignment_id, to_status, created_at')
        .in('assignment_id', assignmentIds)
        .eq('to_status', 'rescheduled')
        .is('archived_at', null)
        .gte('created_at', monthRange.startIso)
        .lt('created_at', monthRange.endExclusiveIso);
      throwIfError(auditRowsError, 'Unable to fetch rescheduled audits for monthly summary');
      rescheduledRows = auditRows || [];
    }

    const elderlyMap = await fetchElderlyMapById(scopedAssignments.map((entry) => entry.elderly_id));
    const buddyMap = await fetchUsersMapById(scopedAssignments.map((entry) => entry.buddy_id));
    const clientIds = Array.from(new Set(scopedAssignments
      .map((entry) => elderlyMap[entry.elderly_id]?.client_id)
      .filter((id) => Number.isFinite(Number(id)))))
      .map((id) => Number(id));
    const clientMap = await fetchUsersMapById(clientIds);

    const reminderTemplateKeys = ['visit_reminder_d1', 'backfilled_visit_notice', 'family_monthly_update'];
    let reminderQuery = supabase
      .from('notification_action_logs')
      .select('id, client_id, template_key, created_at')
      .is('archived_at', null)
      .in('template_key', reminderTemplateKeys)
      .gte('created_at', monthRange.startIso)
      .lt('created_at', monthRange.endExclusiveIso);

    if (clientIdFilter) {
      reminderQuery = reminderQuery.eq('client_id', clientIdFilter);
    } else if (clientIds.length > 0) {
      reminderQuery = reminderQuery.in('client_id', clientIds);
    }

    const { data: reminderRows, error: reminderRowsError } = await reminderQuery;
    throwIfError(reminderRowsError, 'Unable to fetch reminder logs for monthly summary');

    const visitCountsByAssignmentCompleted = {};
    const byStatusCounts = {};
    const byModeMap = {
      short_term: { mode: 'short_term', planned: 0, completed: 0, missed: 0, rescheduled: 0 },
      long_term: { mode: 'long_term', planned: 0, completed: 0, missed: 0, rescheduled: 0 },
    };
    const byBuddyMap = {};
    const byClientMap = {};

    const addToDimension = (target, key, displayName, changes) => {
      if (!target[key]) {
        target[key] = {
          id: Number(key),
          name: displayName,
          planned: 0,
          completed: 0,
          missed: 0,
          rescheduled: 0,
        };
      }
      target[key].planned += changes.planned || 0;
      target[key].completed += changes.completed || 0;
      target[key].missed += changes.missed || 0;
      target[key].rescheduled += changes.rescheduled || 0;
    };

    let shortPlannedVisits = 0;
    let shortCompletedVisits = 0;
    let missedVisits = 0;

    for (const visit of scopedVisits) {
      const visitStatus = String(visit.visit_status || '').trim().toLowerCase();
      byStatusCounts[visitStatus] = (byStatusCounts[visitStatus] || 0) + 1;

      const assignment = visit.assignment_id ? assignmentMap[visit.assignment_id] : null;
      const mode = assignment ? normalizeServicePlanType(assignment.service_plan_type, assignment.term_type) : 'short_term';
      const isPlannedVisit = visitStatus !== 'cancelled';
      const isCompletedVisit = visitStatus === 'completed';
      const isMissedVisit = visitStatus === 'missed';

      if (mode === 'short_term') {
        if (isPlannedVisit) {
          shortPlannedVisits += 1;
        }
        if (isCompletedVisit) {
          shortCompletedVisits += 1;
        }
      }
      if (isMissedVisit) {
        missedVisits += 1;
      }

      if (assignment && visit.assignment_id && isCompletedVisit) {
        visitCountsByAssignmentCompleted[visit.assignment_id] = (visitCountsByAssignmentCompleted[visit.assignment_id] || 0) + 1;
      }

      if (isPlannedVisit) {
        byModeMap[mode].planned += 1;
      }
      if (isCompletedVisit) {
        byModeMap[mode].completed += 1;
      }
      if (isMissedVisit) {
        byModeMap[mode].missed += 1;
      }

      const resolvedBuddyId = assignment?.buddy_id || visit.buddy_id;
      const resolvedClientId = assignment
        ? elderlyMap[assignment.elderly_id]?.client_id
        : elderlyMap[visit.elderly_id]?.client_id;

      if (Number.isFinite(Number(resolvedBuddyId))) {
        const buddyName = buddyMap[resolvedBuddyId]?.full_name || 'Unknown';
        addToDimension(byBuddyMap, resolvedBuddyId, buddyName, {
          planned: isPlannedVisit ? 1 : 0,
          completed: isCompletedVisit ? 1 : 0,
          missed: isMissedVisit ? 1 : 0,
        });
      }

      if (Number.isFinite(Number(resolvedClientId))) {
        const clientName = clientMap[resolvedClientId]?.full_name || 'Unknown';
        addToDimension(byClientMap, resolvedClientId, clientName, {
          planned: isPlannedVisit ? 1 : 0,
          completed: isCompletedVisit ? 1 : 0,
          missed: isMissedVisit ? 1 : 0,
        });
      }
    }

    const sessionDaysByAssignment = {};
    for (const session of visitSessions) {
      if (!sessionDaysByAssignment[session.assignment_id]) {
        sessionDaysByAssignment[session.assignment_id] = new Set();
      }
      sessionDaysByAssignment[session.assignment_id].add(session.session_date);
    }

    const shortAssignmentRows = shortTermAssignments.map((assignment) => {
      const plannedVisits = Number(assignment.monthly_visit_plan || 0);
      const completedVisits = Number(visitCountsByAssignmentCompleted[assignment.id] || 0);
      const utilizationPercent = plannedVisits > 0 ? Math.round((completedVisits / plannedVisits) * 100) : 0;
      return {
        assignment_id: assignment.id,
        buddy_id: assignment.buddy_id,
        buddy_name: buddyMap[assignment.buddy_id]?.full_name || 'Unknown',
        client_id: elderlyMap[assignment.elderly_id]?.client_id || null,
        client_name: clientMap[elderlyMap[assignment.elderly_id]?.client_id]?.full_name || 'Unknown',
        elderly_id: assignment.elderly_id,
        elderly_name: elderlyMap[assignment.elderly_id]?.full_name || 'Unknown',
        monthly_package_visits: plannedVisits,
        completed_visits: completedVisits,
        utilization_percent: utilizationPercent,
      };
    });

    const longByShift = {
      morning_10h: { shift: 'morning_10h', expected_coverage_days: 0, recorded_session_days: 0 },
      night_10h: { shift: 'night_10h', expected_coverage_days: 0, recorded_session_days: 0 },
      full_day: { shift: 'full_day', expected_coverage_days: 0, recorded_session_days: 0 },
      unknown: { shift: 'unknown', expected_coverage_days: 0, recorded_session_days: 0 },
    };

    const longAssignmentRows = longTermAssignments.map((assignment) => {
      const isOperational = (assignment.approval_state || 'pending_approval') === 'approved' && assignment.status === 'active';
      const expectedCoverageDays = isOperational
        ? getOverlappingDaysInMonth(
          assignment.start_date,
          assignment.extension_end_date || assignment.end_date || monthRange.endDate,
          monthRange,
        )
        : 0;
      const recordedSessionDays = sessionDaysByAssignment[assignment.id]?.size || 0;
      const utilizationPercent = expectedCoverageDays > 0 ? Math.round((recordedSessionDays / expectedCoverageDays) * 100) : 0;
      const shiftKey = assignment.care_shift && longByShift[assignment.care_shift] ? assignment.care_shift : 'unknown';

      longByShift[shiftKey].expected_coverage_days += expectedCoverageDays;
      longByShift[shiftKey].recorded_session_days += recordedSessionDays;

      byModeMap.long_term.planned += expectedCoverageDays;
      byModeMap.long_term.completed += recordedSessionDays;

      addToDimension(byBuddyMap, assignment.buddy_id, buddyMap[assignment.buddy_id]?.full_name || 'Unknown', {
        planned: expectedCoverageDays,
        completed: recordedSessionDays,
      });

      const resolvedClientId = elderlyMap[assignment.elderly_id]?.client_id;
      if (Number.isFinite(Number(resolvedClientId))) {
        addToDimension(byClientMap, resolvedClientId, clientMap[resolvedClientId]?.full_name || 'Unknown', {
          planned: expectedCoverageDays,
          completed: recordedSessionDays,
        });
      }

      return {
        assignment_id: assignment.id,
        buddy_id: assignment.buddy_id,
        buddy_name: buddyMap[assignment.buddy_id]?.full_name || 'Unknown',
        client_id: resolvedClientId || null,
        client_name: clientMap[resolvedClientId]?.full_name || 'Unknown',
        elderly_id: assignment.elderly_id,
        elderly_name: elderlyMap[assignment.elderly_id]?.full_name || 'Unknown',
        care_shift: assignment.care_shift || null,
        expected_coverage_days: expectedCoverageDays,
        recorded_session_days: recordedSessionDays,
        utilization_percent: utilizationPercent,
      };
    });

    for (const auditRow of rescheduledRows) {
      const assignment = assignmentMap[auditRow.assignment_id];
      if (!assignment) {
        continue;
      }

      const mode = normalizeServicePlanType(assignment.service_plan_type, assignment.term_type);
      byModeMap[mode].rescheduled += 1;

      addToDimension(byBuddyMap, assignment.buddy_id, buddyMap[assignment.buddy_id]?.full_name || 'Unknown', {
        rescheduled: 1,
      });

      const resolvedClientId = elderlyMap[assignment.elderly_id]?.client_id;
      if (Number.isFinite(Number(resolvedClientId))) {
        addToDimension(byClientMap, resolvedClientId, clientMap[resolvedClientId]?.full_name || 'Unknown', {
          rescheduled: 1,
        });
      }
    }

    const totalLongExpectedDays = longAssignmentRows.reduce((sum, row) => sum + row.expected_coverage_days, 0);
    const totalLongRecordedDays = longAssignmentRows.reduce((sum, row) => sum + row.recorded_session_days, 0);
    const totalShortPackagePlanned = shortAssignmentRows.reduce((sum, row) => sum + row.monthly_package_visits, 0);
    const totalShortPackageCompleted = shortAssignmentRows.reduce((sum, row) => sum + row.completed_visits, 0);

    const shortPackageUtilizationPercent = totalShortPackagePlanned > 0
      ? Math.round((totalShortPackageCompleted / totalShortPackagePlanned) * 100)
      : 0;
    const longSlotUtilizationPercent = totalLongExpectedDays > 0
      ? Math.round((totalLongRecordedDays / totalLongExpectedDays) * 100)
      : 0;

    return res.json({
      month: monthRange.month,
      start_date: monthRange.startDate,
      end_date: monthRange.endDate,
      filters: {
        buddy_id: buddyIdFilter,
        client_id: clientIdFilter,
        status: statusFilter || null,
        mode: modeFilter,
      },
      totals: {
        planned: shortPlannedVisits + totalLongExpectedDays,
        completed: shortCompletedVisits + totalLongRecordedDays,
        rescheduled: rescheduledRows.length,
        missed: missedVisits,
        reminders_sent: (reminderRows || []).length,
      },
      short_term_package_utilization: {
        totals: {
          planned_visits: totalShortPackagePlanned,
          completed_visits: totalShortPackageCompleted,
          utilization_percent: shortPackageUtilizationPercent,
        },
        assignments: shortAssignmentRows,
      },
      long_term_slot_utilization: {
        totals: {
          expected_coverage_days: totalLongExpectedDays,
          recorded_session_days: totalLongRecordedDays,
          utilization_percent: longSlotUtilizationPercent,
        },
        by_shift: Object.values(longByShift),
        assignments: longAssignmentRows,
      },
      by_buddy: Object.values(byBuddyMap),
      by_client: Object.values(byClientMap),
      by_status: Object.entries(byStatusCounts).map(([status, count]) => ({ status, count })),
      by_mode: Object.values(byModeMap),
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Fetch monthly summary report failed:', error);
    return res.status(500).json({ message: error.message || 'Unable to load monthly summary report.' });
  }
});

app.get('/api/reports/calendar', async (req, res) => {
  if (!ensureAdminSession(req, res)) {
    return;
  }

  try {
    const defaultMonth = new Date().toISOString().slice(0, 7);
    const monthRange = getMonthRange(req.query.month || defaultMonth);
    const monthDates = buildDateStringsForMonth(monthRange);
    const buddyIdFilter = parseOptionalPositiveInt(req.query.buddy_id);
    const clientIdFilter = parseOptionalPositiveInt(req.query.client_id);
    const modeFilterRaw = String(req.query.mode || '').trim().toLowerCase();
    const modeFilter = modeFilterRaw === 'short_term' || modeFilterRaw === 'long_term' ? modeFilterRaw : null;
    const statusFilter = String(req.query.status || '').trim().toLowerCase();

    let clientMemberIds = null;
    if (clientIdFilter) {
      const { data: members, error: membersError } = await supabase
        .from('elderly_members')
        .select('id')
        .eq('client_id', clientIdFilter);
      throwIfError(membersError, 'Unable to resolve client filter for calendar report');
      clientMemberIds = (members || []).map((row) => row.id);
    }

    let assignmentQuery = supabase
      .from('assignments')
      .select('id, buddy_id, elderly_id, service_plan_type, term_type, approval_state, status, care_shift, start_date, end_date, extension_end_date, archived_at')
      .is('archived_at', null)
      .lte('start_date', monthRange.endDate);

    if (buddyIdFilter) {
      assignmentQuery = assignmentQuery.eq('buddy_id', buddyIdFilter);
    }
    if (Array.isArray(clientMemberIds)) {
      if (clientMemberIds.length === 0) {
        assignmentQuery = assignmentQuery.in('elderly_id', [0]);
      } else {
        assignmentQuery = assignmentQuery.in('elderly_id', clientMemberIds);
      }
    }

    const { data: assignmentRows, error: assignmentRowsError } = await assignmentQuery;
    throwIfError(assignmentRowsError, 'Unable to fetch assignments for calendar report');

    const scopedAssignments = (assignmentRows || []).filter((assignment) => {
      const effectiveEndDate = assignment.extension_end_date || assignment.end_date || monthRange.endDate;
      if (String(effectiveEndDate) < monthRange.startDate) {
        return false;
      }
      const mode = normalizeServicePlanType(assignment.service_plan_type, assignment.term_type);
      if (modeFilter && mode !== modeFilter) {
        return false;
      }
      return true;
    });

    const assignmentMap = {};
    scopedAssignments.forEach((assignment) => {
      assignmentMap[assignment.id] = assignment;
    });

    let visitQuery = supabase
      .from('visits')
      .select('id, assignment_id, buddy_id, elderly_id, scheduled_date, visit_status')
      .is('archived_at', null)
      .gte('scheduled_date', monthRange.startDate)
      .lte('scheduled_date', monthRange.endDate);

    if (buddyIdFilter) {
      visitQuery = visitQuery.eq('buddy_id', buddyIdFilter);
    }
    if (Array.isArray(clientMemberIds)) {
      if (clientMemberIds.length === 0) {
        visitQuery = visitQuery.in('elderly_id', [0]);
      } else {
        visitQuery = visitQuery.in('elderly_id', clientMemberIds);
      }
    }

    const { data: visitRows, error: visitRowsError } = await visitQuery;
    throwIfError(visitRowsError, 'Unable to fetch visits for calendar report');

    const scopedVisits = (visitRows || []).filter((visit) => {
      const visitStatus = String(visit.visit_status || '').trim().toLowerCase();
      if (statusFilter && visitStatus !== statusFilter) {
        return false;
      }

      if (visit.assignment_id && !assignmentMap[visit.assignment_id]) {
        return false;
      }

      const assignment = visit.assignment_id ? assignmentMap[visit.assignment_id] : null;
      const mode = assignment ? normalizeServicePlanType(assignment.service_plan_type, assignment.term_type) : 'short_term';
      if (modeFilter && mode !== modeFilter) {
        return false;
      }
      return true;
    });

    const longCoverageAssignments = scopedAssignments.filter((assignment) => {
      const mode = normalizeServicePlanType(assignment.service_plan_type, assignment.term_type);
      return mode === 'long_term' && (assignment.approval_state || 'pending_approval') === 'approved' && assignment.status === 'active';
    });

    const longCoverageAssignmentIds = longCoverageAssignments.map((entry) => entry.id);
    let sessionRows = [];
    if (longCoverageAssignmentIds.length > 0) {
      const { data: rows, error: rowsError } = await supabase
        .from('visit_sessions')
        .select('id, assignment_id, session_date, backfilled')
        .in('assignment_id', longCoverageAssignmentIds)
        .gte('session_date', monthRange.startDate)
        .lte('session_date', monthRange.endDate);
      throwIfError(rowsError, 'Unable to fetch long-term sessions for calendar report');
      sessionRows = rows || [];
    }

    const elderlyMap = await fetchElderlyMapById(scopedAssignments.map((entry) => entry.elderly_id).concat(scopedVisits.map((entry) => entry.elderly_id)));
    const buddyMap = await fetchUsersMapById(scopedAssignments.map((entry) => entry.buddy_id).concat(scopedVisits.map((entry) => entry.buddy_id)));
    const clientIds = Array.from(new Set(
      Object.values(elderlyMap)
        .map((entry) => entry?.client_id)
        .filter((id) => Number.isFinite(Number(id))),
    )).map((id) => Number(id));
    const clientMap = await fetchUsersMapById(clientIds);

    const sessionsByAssignmentAndDate = {};
    for (const row of sessionRows) {
      const key = `${row.assignment_id}::${row.session_date}`;
      sessionsByAssignmentAndDate[key] = {
        session_id: row.id,
        backfilled: Boolean(row.backfilled),
      };
    }

    const daysMap = {};
    monthDates.forEach((dateValue) => {
      daysMap[dateValue] = {
        date: dateValue,
        visits: [],
        long_term_coverage: [],
      };
    });

    for (const visit of scopedVisits) {
      if (!daysMap[visit.scheduled_date]) {
        continue;
      }

      const assignment = visit.assignment_id ? assignmentMap[visit.assignment_id] : null;
      const mode = assignment
        ? normalizeServicePlanType(assignment.service_plan_type, assignment.term_type)
        : 'short_term';
      const elderly = elderlyMap[visit.elderly_id] || null;
      const clientId = elderly?.client_id || null;

      daysMap[visit.scheduled_date].visits.push({
        visit_id: visit.id,
        assignment_id: visit.assignment_id || null,
        buddy_id: visit.buddy_id,
        buddy_name: buddyMap[visit.buddy_id]?.full_name || 'Unknown',
        elderly_id: visit.elderly_id,
        elderly_name: elderly?.full_name || 'Unknown',
        client_id: clientId,
        client_name: clientMap[clientId]?.full_name || 'Unknown',
        mode,
        visit_status: visit.visit_status || 'scheduled',
      });
    }

    for (const assignment of longCoverageAssignments) {
      const elderly = elderlyMap[assignment.elderly_id] || null;
      const clientId = elderly?.client_id || null;
      const coverageEnd = assignment.extension_end_date || assignment.end_date || monthRange.endDate;

      for (const dateValue of monthDates) {
        if (dateValue < String(assignment.start_date || monthRange.startDate) || dateValue > String(coverageEnd)) {
          continue;
        }

        const sessionKey = `${assignment.id}::${dateValue}`;
        const session = sessionsByAssignmentAndDate[sessionKey] || null;

        daysMap[dateValue].long_term_coverage.push({
          assignment_id: assignment.id,
          buddy_id: assignment.buddy_id,
          buddy_name: buddyMap[assignment.buddy_id]?.full_name || 'Unknown',
          elderly_id: assignment.elderly_id,
          elderly_name: elderly?.full_name || 'Unknown',
          client_id: clientId,
          client_name: clientMap[clientId]?.full_name || 'Unknown',
          care_shift: assignment.care_shift || null,
          coverage_status: session ? 'covered' : 'pending',
          session_id: session?.session_id || null,
          backfilled: session?.backfilled || false,
        });
      }
    }

    const dayRows = monthDates.map((dateValue) => ({
      ...daysMap[dateValue],
      visits: daysMap[dateValue].visits,
      long_term_coverage: daysMap[dateValue].long_term_coverage,
    }));

    return res.json({
      month: monthRange.month,
      start_date: monthRange.startDate,
      end_date: monthRange.endDate,
      first_weekday_utc: monthRange.firstWeekdayUtc,
      days_in_month: monthRange.daysInMonth,
      filters: {
        buddy_id: buddyIdFilter,
        client_id: clientIdFilter,
        status: statusFilter || null,
        mode: modeFilter,
      },
      days: dayRows,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Fetch monthly calendar report failed:', error);
    return res.status(500).json({ message: error.message || 'Unable to load calendar report.' });
  }
});

app.get('/api/requests/ops-metrics', async (req, res) => {
  if (!ensureAdminSession(req, res)) {
    return;
  }

  try {
    const { data: requests, error } = await supabase
      .from('client_requests')
      .select('id, user_id, elderly_id, request_type, message, status, created_at, resolved_at')
      .is('archived_at', null)
      .order('created_at', { ascending: false });
    throwIfError(error, 'Unable to fetch request ops metrics');

    const normalizedRequests = (requests || []).map((entry) => ({
      ...entry,
      status: normalizeRequestStatusForRead(entry.status),
    }));

    const userIds = Array.from(new Set(normalizedRequests.map((entry) => entry.user_id).filter((id) => id > 0)));
    const userNames = {};
    if (userIds.length > 0) {
      const { data: users, error: usersError } = await supabase.from('users').select('id, full_name').in('id', userIds);
      throwIfError(usersError, 'Unable to fetch request user names for ops metrics');
      (users || []).forEach((row) => {
        userNames[row.id] = row.full_name;
      });
    }

    const totalsByStatus = {
      new: 0,
      viewed: 0,
      read: 0,
      awaiting_assignee: 0,
      assigned: 0,
      resolved: 0,
      closed: 0,
    };
    const agingBuckets = {
      lt_24h: 0,
      h24_to_48: 0,
      gt_48h: 0,
    };

    const activeStatuses = new Set(['new', 'viewed', 'read', 'awaiting_assignee', 'assigned']);
    const overdueRequests = [];

    for (const entry of normalizedRequests) {
      const statusKey = entry.status;
      if (Object.prototype.hasOwnProperty.call(totalsByStatus, statusKey)) {
        totalsByStatus[statusKey] += 1;
      }

      if (!activeStatuses.has(statusKey)) {
        continue;
      }

      const createdAt = new Date(entry.created_at);
      if (Number.isNaN(createdAt.getTime())) {
        continue;
      }
      const ageHours = Math.max(0, Math.round((Date.now() - createdAt.getTime()) / (1000 * 60 * 60)));

      if (ageHours < 24) {
        agingBuckets.lt_24h += 1;
      } else if (ageHours <= 48) {
        agingBuckets.h24_to_48 += 1;
      } else {
        agingBuckets.gt_48h += 1;
      }

      const slaTargetHours = ['new', 'viewed'].includes(statusKey)
        ? 24
        : ['read', 'awaiting_assignee'].includes(statusKey)
          ? 48
          : statusKey === 'assigned'
            ? 72
            : null;

      const slaBreached = slaTargetHours !== null && ageHours > slaTargetHours;
      if (slaBreached) {
        overdueRequests.push({
          id: entry.id,
          timestamp: entry.created_at,
          user_id: entry.user_id,
          user_name: userNames[entry.user_id] || 'Unknown',
          request_type: entry.request_type,
          message: entry.message,
          status: statusKey,
          elderly_id: entry.elderly_id,
          resolved_at: entry.resolved_at,
          age_hours: ageHours,
          sla_target_hours: slaTargetHours,
          sla_breached: true,
        });
      }
    }

    overdueRequests.sort((left, right) => right.age_hours - left.age_hours);

    return res.json({
      totals_by_status: totalsByStatus,
      active_aging_buckets: agingBuckets,
      overdue_requests: overdueRequests.slice(0, 25),
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Fetch request ops metrics failed:', error);
    return res.status(500).json({ message: error.message || 'Unable to fetch request ops metrics.' });
  }
});

app.get('/api/requests', async (req, res) => {
  const userId = req.query.user_id;
  const all = req.query.all === 'true';

  if (!all && !userId) {
    return res.status(400).json({ message: 'Either all=true or user_id must be provided.' });
  }

  try {
    let query = supabase
      .from('client_requests')
      .select('id, user_id, elderly_id, request_type, message, status, created_at, resolved_at')
      .is('archived_at', null)
      .order('created_at', { ascending: false });

    if (!all) {
      query = query.eq('user_id', Number(userId));
    }

    const { data: requests, error } = await query;
    throwIfError(error, 'Unable to fetch requests');

    const userIds = Array.from(new Set((requests || []).map((entry) => entry.user_id).filter((id) => id > 0)));
    const userNames = {};
    if (userIds.length > 0) {
      const { data: users, error: usersError } = await supabase.from('users').select('id, full_name').in('id', userIds);
      throwIfError(usersError, 'Unable to fetch request user names');
      if (Array.isArray(users)) {
        users.forEach((row) => {
          userNames[row.id] = row.full_name;
        });
      }
    }

    const filteredRequests = (requests || []).map((entry) => ({
      id: entry.id,
      timestamp: entry.created_at,
      user_id: entry.user_id,
      user_name: userNames[entry.user_id] || 'Unknown',
      request_type: entry.request_type,
      message: entry.message,
      status: normalizeRequestStatusForRead(entry.status),
      elderly_id: entry.elderly_id,
      resolved_at: entry.resolved_at,
    }));

    return res.json(filteredRequests);
  } catch (error) {
    console.error('Fetch requests failed:', error);
    return res.status(500).json({ message: 'Unable to load requests.' });
  }
});

async function seedDefaultRequests() {
  const { data: existing, error: existingError } = await supabase.from('client_requests').select('id').limit(1);
  throwIfError(existingError, 'Unable to inspect existing requests');
  if (Array.isArray(existing) && existing.length > 0) {
    return;
  }

  const { data: clients, error: clientsError } = await supabase.from('users').select('id').eq('role', 'client').order('id', { ascending: true });
  throwIfError(clientsError, 'Unable to load clients for request seed');

  const seedRequests = [
    { user_id: clients?.[0]?.id, request_type: 'task_request', message: 'Request extra medication reminder for morning.' },
    { user_id: clients?.[1]?.id, request_type: 'feedback', message: 'Please ensure warm meals are available.' },
    { user_id: clients?.[2]?.id, request_type: 'special_care', message: 'Need extra assistance with mobility today.' },
    { user_id: clients?.[3]?.id, request_type: 'task_request', message: 'Add hydration checks every two hours.' },
    { user_id: clients?.[4]?.id, request_type: 'feedback', message: 'Buddy is doing a great job, thank you!' },
  ].filter((entry) => entry.user_id);

  if (seedRequests.length > 0) {
    const { error } = await supabase.from('client_requests').insert(seedRequests);
    throwIfError(error, 'Unable to seed requests');
  }
}

app.get('/api/health', async (req, res) => {
  const status = dbReady ? 'ok' : 'degraded';
  res.json({ status, dbReady, startupWarning });
});

app.use((err, req, res, next) => {
  const log = `Unhandled error: ${new Date().toISOString()} ${err.stack || err.message || err}\n`;
  fs.appendFileSync(path.resolve(process.cwd(), 'unhandled-error.log'), log);
  console.error(log);
  res.status(500).json({ message: 'Internal server error', error: err?.message || 'unknown' });
});

const distPath = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath, { index: false }));

  app.get('/favicon.ico', (req, res) => {
    const faviconPath = path.resolve(distPath, 'favicon.ico');
    if (fs.existsSync(faviconPath)) {
      return res.sendFile(faviconPath);
    }
    return res.status(204).end();
  });

  app.get(/^\/dist\/(.*)$/, (req, res) => {
    const match = req.path.match(/^\/dist\/(.*)$/);
    const relativePath = match && match[1] ? match[1] : '';
    const filePath = path.resolve(distPath, relativePath);
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
    return res.status(404).end();
  });

  app.get(/^(?!\/api\/).*$/, (req, res) => {
    const ext = path.extname(req.path);
    if (ext) {
      return res.status(404).end();
    }

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.sendFile(path.resolve(distPath, 'index.html'));
  });
} else {
  app.get(/.*/, (req, res) => {
    res.status(500).send('Build not found. Run npm run build before starting the server.');
  });
}

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

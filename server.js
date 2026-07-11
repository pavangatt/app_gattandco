import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import session from 'express-session';
import path from 'path';
import fs from 'fs';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const sessionSecret = process.env.SESSION_SECRET || 'change-me-in-production';
app.use(
  session({
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

async function fetchUsersMapById(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return {};
  }

  const deduped = Array.from(new Set(ids.filter((id) => Number.isFinite(Number(id))))).map((id) => Number(id));
  if (deduped.length === 0) {
    return {};
  }

  const { data, error } = await supabase.from('users').select('id, full_name, email, role, phone, address').in('id', deduped);
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

async function ensureUser({ email, full_name, role, password, phone = '', address = '' }) {
  const { data: rows, error: rowsError } = await supabase.from('users').select('id').eq('email', email).limit(1);
  throwIfError(rowsError, 'Unable to check existing user');

  if (Array.isArray(rows) && rows.length > 0) {
    return rows[0].id;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const { data: created, error: createError } = await supabase
    .from('users')
    .insert({ full_name, email, phone, address, password_hash: hashedPassword, role, created_at: new Date().toISOString() })
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

  await ensureUser({ email: 'admin@gattandco.local', full_name: 'Admin', role: 'admin', password: '1234567890' });

  for (const clientName of clientNames) {
    await ensureUser({
      email: `${clientName}@gattandco.local`,
      full_name: clientName,
      role: 'client',
      password: '1234567890',
    });
  }

  for (const buddyName of buddyNames) {
    await ensureUser({
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
    startupWarning = error?.message || String(error);
    console.error('Startup warning (server still running):', error);
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
    const { data: created, error: createError } = await supabase
      .from('users')
      .insert({
        full_name: name,
        email,
        phone: phone || '',
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

  if (!identifier || !password) {
    return res.status(400).json({ message: 'Username/email and password are required.' });
  }

  try {
    let rows = [];
    const { data: byEmail, error: byEmailError } = await supabase
      .from('users')
      .select('id, full_name, email, role, password_hash')
      .eq('email', identifier)
      .limit(1);
    throwIfError(byEmailError, 'Unable to find user by email');

    if (Array.isArray(byEmail) && byEmail.length > 0) {
      rows = byEmail;
    } else {
      const { data: byName, error: byNameError } = await supabase
        .from('users')
        .select('id, full_name, email, role, password_hash')
        .eq('full_name', identifier)
        .limit(1);
      throwIfError(byNameError, 'Unable to find user by name');
      rows = Array.isArray(byName) ? byName : [];
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const user = rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    req.session.user = { id: user.id, name: user.full_name, email: user.email, role: user.role };

    return res.json({
      message: 'Login successful.',
      user: { id: user.id, name: user.full_name, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error('Login error:', error.message, error.stack);
    return res.status(500).json({ message: 'Login failed.', error: error.message });
  }
});

app.get('/api/session', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ message: 'No active session.' });
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
    let query = supabase.from('users').select('id, full_name, email, phone, address, role').order('full_name', { ascending: true });
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
  const { name, email, phone, address, role, password } = req.body;

  if (!name || !role || !password) {
    return res.status(400).json({ message: 'Name, role and password are required.' });
  }

  if (role !== 'buddy' && role !== 'client') {
    return res.status(400).json({ message: 'Role must be buddy or client.' });
  }

  try {
    const normalizedEmail = email || `${name.toLowerCase().replace(/\s+/g, '')}@gattandco.local`;
    const trimmedAddress = typeof address === 'string' ? address.trim() : '';
    const userId = await ensureUser({
      email: normalizedEmail,
      full_name: name,
      phone: phone || '',
      address: trimmedAddress,
      role,
      password,
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

app.get('/api/assignments', async (req, res) => {
  try {
    const { data: assignments, error: assignmentsError } = await supabase
      .from('assignments')
      .select('id, buddy_id, elderly_id, status, term_type, admin_notes, end_date')
      .order('id', { ascending: false });
    throwIfError(assignmentsError, 'Unable to fetch assignments');

    const userMap = await fetchUsersMapById((assignments || []).map((item) => item.buddy_id));
    const elderlyMap = await fetchElderlyMapById((assignments || []).map((item) => item.elderly_id));

    const rows = (assignments || []).map((assignment) => ({
      ...assignment,
      buddy_name: userMap[assignment.buddy_id]?.full_name || 'Unknown',
      elderly_name: elderlyMap[assignment.elderly_id]?.full_name || 'Unknown',
      age: elderlyMap[assignment.elderly_id]?.age ?? null,
      address: elderlyMap[assignment.elderly_id]?.address ?? '',
    }));

    return res.json(rows);
  } catch (error) {
    console.error('Fetch assignments failed:', error);
    return res.status(500).json({ message: 'Unable to load assignments.' });
  }
});

app.post('/api/assignments', async (req, res) => {
  const { buddy_id, elderly_id, term } = req.body;

  if (!buddy_id || !elderly_id) {
    return res.status(400).json({ message: 'Buddy and client are required for assignment.' });
  }

  try {
    const { data: assignmentResult, error: assignmentError } = await supabase
      .from('assignments')
      .insert({ buddy_id: Number(buddy_id), elderly_id: Number(elderly_id), status: 'active', term_type: term || 'short' })
      .select('id')
      .single();
    throwIfError(assignmentError, 'Unable to create assignment');

    const assignmentId = assignmentResult.id;
    const scheduledDate = new Date().toISOString().slice(0, 10);
    const note = term ? `Term: ${term}` : null;
    const { error: visitError } = await supabase
      .from('visits')
      .insert({ buddy_id: Number(buddy_id), elderly_id: Number(elderly_id), scheduled_date: scheduledDate, visit_status: 'scheduled', status_check: null, buddy_notes: note });
    throwIfError(visitError, 'Unable to create starter visit');

    return res.json({ message: 'Assignment created.', id: assignmentId });
  } catch (error) {
    console.error('Create assignment failed:', error);
    return res.status(500).json({ message: 'Unable to create assignment.' });
  }
});

app.get('/api/visits', async (req, res) => {
  const buddyId = req.query.buddy_id;
  const clientId = req.query.client_id;

  try {
    let visitQuery = supabase
      .from('visits')
      .select('id, buddy_id, elderly_id, scheduled_date, visit_status, arrival_time, departure_time, arrival_lat_lng, status_check, buddy_notes, client_visible_notes')
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
  const { status, term_type, end_date, admin_notes, buddy_id, elderly_id } = req.body;

  try {
    const payload = {};
    if (status !== undefined) payload.status = status;
    if (term_type !== undefined) payload.term_type = term_type;
    if (end_date !== undefined) payload.end_date = end_date || null;
    if (admin_notes !== undefined) payload.admin_notes = admin_notes;
    if (buddy_id !== undefined) payload.buddy_id = Number(buddy_id);
    if (elderly_id !== undefined) payload.elderly_id = Number(elderly_id);

    const { error } = await supabase.from('assignments').update(payload).eq('id', Number(assignmentId));
    throwIfError(error, 'Unable to update assignment');

    return res.json({ message: 'Assignment updated.' });
  } catch (error) {
    console.error('Update assignment failed:', error);
    return res.status(500).json({ message: 'Unable to update assignment.' });
  }
});

app.get('/api/tasks', async (req, res) => {
  const buddyId = req.query.buddy_id;
  const clientId = req.query.client_id;

  try {
    const { data: allTasks, error: taskError } = await supabase
      .from('visit_tasks')
      .select('id, visit_id, task_name, status, measured_value, buddy_remarks, updated_at')
      .order('updated_at', { ascending: false });
    throwIfError(taskError, 'Unable to fetch tasks');

    const visitIds = (allTasks || []).map((task) => task.visit_id);
    if (visitIds.length === 0) {
      return res.json([]);
    }

    const { data: visitRows, error: visitError } = await supabase
      .from('visits')
      .select('id, buddy_id, elderly_id, scheduled_date')
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
    const { data: rows, error: rowsError } = await supabase
      .from('visits')
      .select('id')
      .eq('buddy_id', buddy_id)
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

  if (!user_id || !message) {
    return res.status(400).json({ message: 'User ID and request message are required.' });
  }

  try {
    const { error } = await supabase.from('client_requests').insert({
      user_id: Number(user_id),
      elderly_id: elderly_id ? Number(elderly_id) : null,
      request_type: request_type || 'general',
      message,
      status: 'open',
    });
    throwIfError(error, 'Unable to save request');
    return res.json({ message: 'Your request has been submitted. Admin will review it shortly.' });
  } catch (error) {
    console.error('Save request failed:', error);
    return res.status(500).json({ message: 'Unable to submit request.' });
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
      timestamp: entry.created_at,
      user_id: entry.user_id,
      user_name: userNames[entry.user_id] || 'Unknown',
      request_type: entry.request_type,
      message: entry.message,
      status: entry.status,
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

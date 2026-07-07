import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

console.log('DB config:', {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
});

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const currentLocations = {};

async function initDb() {
  const connection = await pool.getConnection();
  await connection.release();
}

async function ensureElderlyMember(clientId, fullName) {
  const [existing] = await pool.query('SELECT id FROM elderly_members WHERE client_id = ?', [clientId]);
  if (Array.isArray(existing) && existing.length > 0) {
    return;
  }
  await pool.query(
    'INSERT INTO elderly_members (client_id, full_name, age, medical_notes, address) VALUES (?, ?, ?, ?, ?)',
    [clientId, fullName, 65, '', 'Unknown address'],
  );
}

async function ensureUser({ email, full_name, role, password, phone = '' }) {
  const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (Array.isArray(rows) && rows.length > 0) {
    return;
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  await pool.query(
    'INSERT INTO users (full_name, email, phone, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [full_name, email, phone, hashedPassword, role, new Date()],
  );
  if (role === 'client') {
    const [created] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (Array.isArray(created) && created.length > 0) {
      await ensureElderlyMember(created[0].id, full_name);
    }
  }
}

async function ensureAssignment(buddyId, elderlyId, options = {}) {
  const [existing] = await pool.query('SELECT id FROM assignments WHERE buddy_id = ? AND elderly_id = ?', [buddyId, elderlyId]);
  if (Array.isArray(existing) && existing.length > 0) {
    return;
  }
  const status = options.status || 'active';
  await pool.query('INSERT INTO assignments (buddy_id, elderly_id, status) VALUES (?, ?, ?)', [buddyId, elderlyId, status]);
  const scheduledDate = options.scheduledDate || new Date().toISOString().slice(0, 10);
  const arrivalTime = options.arrivalTime || null;
  const departureTime = options.departureTime || null;
  const arrivalLatLng = options.arrivalLatLng || null;
  const statusCheck = options.statusCheck || (status === 'active' ? 'Good' : null);
  const buddyNotes = options.buddyNotes || `Assigned for ${options.term || 'short'} term`;
  await pool.query(
    'INSERT INTO visits (buddy_id, elderly_id, scheduled_date, arrival_time, departure_time, arrival_lat_lng, status_check, buddy_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [buddyId, elderlyId, scheduledDate, arrivalTime, departureTime, arrivalLatLng, statusCheck, buddyNotes],
  );
}

async function ensureTask(visitId, taskName, status, measuredValue, buddyRemarks) {
  const [existing] = await pool.query('SELECT id FROM visit_tasks WHERE visit_id = ? AND task_name = ?', [visitId, taskName]);
  if (Array.isArray(existing) && existing.length > 0) {
    return;
  }
  await pool.query(
    'INSERT INTO visit_tasks (visit_id, task_name, status, measured_value, buddy_remarks, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [visitId, taskName, status, measuredValue || '', buddyRemarks || '', new Date()],
  );
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

  const [clientRows] = await pool.query('SELECT u.id, u.full_name, em.id AS elderly_id FROM users u LEFT JOIN elderly_members em ON em.client_id = u.id WHERE u.role = ?', ['client']);
  const [buddyRows] = await pool.query('SELECT id, full_name FROM users WHERE role = ?', ['buddy']);

  const clientMap = Array.isArray(clientRows) ? clientRows : [];
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

  const [visitRows] = await pool.query('SELECT id, buddy_id, elderly_id FROM visits ORDER BY id ASC');
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

initDb()
  .then(async () => {
    await seedDefaultUsers();
    await seedDefaultRequests();
  })
  .catch((error) => {
    console.error('Database initialization failed:', error);
    process.exit(1);
  });

app.post('/api/register', async (req, res, next) => {
  const { name, email, phone, password } = req.body;

  console.log('Register request body:', { name, email, phone, password: password ? '***' : undefined });

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required.' });
  }

  try {
    const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (Array.isArray(rows) && rows.length > 0) {
      return res.status(400).json({ message: 'Email is already registered.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (full_name, email, phone, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email, phone || '', hashedPassword, 'client', new Date()],
    );

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
    const [rows] = await pool.query(
      'SELECT id, full_name, email, role, password_hash FROM users WHERE email = ? OR full_name = ? LIMIT 1',
      [identifier, identifier],
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const user = rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    return res.json({
      message: 'Login successful.',
      user: { id: user.id, name: user.full_name, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error('Login error:', error.message, error.stack);
    return res.status(500).json({ message: 'Login failed.', error: error.message });
  }
});

app.get('/api/users', async (req, res) => {
  const role = req.query.role;
  try {
    const [rows] = await pool.query(
      role && typeof role === 'string'
        ? 'SELECT id, full_name, email, phone, role FROM users WHERE role = ? ORDER BY full_name'
        : 'SELECT id, full_name, email, phone, role FROM users ORDER BY full_name',
      role && typeof role === 'string' ? [role] : [],
    );
    return res.json(rows);
  } catch (error) {
    console.error('Fetch users failed:', error);
    return res.status(500).json({ message: 'Unable to load users.' });
  }
});

app.post('/api/users', async (req, res) => {
  const { name, email, phone, role, password } = req.body;

  if (!name || !role || !password) {
    return res.status(400).json({ message: 'Name, role and password are required.' });
  }

  if (role !== 'buddy' && role !== 'client') {
    return res.status(400).json({ message: 'Role must be buddy or client.' });
  }

  try {
    const normalizedEmail = email || `${name.toLowerCase().replace(/\s+/g, '')}@gattandco.local`;
    await ensureUser({ email: normalizedEmail, full_name: name, phone: phone || '', role, password });
    return res.json({ message: `${role === 'buddy' ? 'Caretaker' : 'Client'} account created.` });
  } catch (error) {
    console.error('Create user failed:', error);
    return res.status(500).json({ message: 'Unable to create user.' });
  }
});

app.get('/api/elderly-members', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT em.id, em.client_id, em.full_name, em.age, em.address, u.email FROM elderly_members em LEFT JOIN users u ON em.client_id = u.id ORDER BY em.full_name',
    );
    return res.json(rows);
  } catch (error) {
    console.error('Fetch elderly members failed:', error);
    return res.status(500).json({ message: 'Unable to load elderly members.' });
  }
});

app.get('/api/assignments', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT a.id, a.buddy_id, a.elderly_id, a.status, u.full_name AS buddy_name, e.full_name AS elderly_name, e.age, e.address FROM assignments a LEFT JOIN users u ON a.buddy_id = u.id LEFT JOIN elderly_members e ON a.elderly_id = e.id ORDER BY a.id DESC',
    );
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
    const [assignmentResult] = await pool.query(
      'INSERT INTO assignments (buddy_id, elderly_id, status) VALUES (?, ?, ?)',
      [buddy_id, elderly_id, 'active'],
    );
    const assignmentId = assignmentResult.insertId;
    const scheduledDate = new Date().toISOString().slice(0, 10);
    const note = term ? `Term: ${term}` : null;
    await pool.query(
      'INSERT INTO visits (buddy_id, elderly_id, scheduled_date, status_check, buddy_notes) VALUES (?, ?, ?, ?, ?)',
      [buddy_id, elderly_id, scheduledDate, null, note],
    );
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
    let query =
      'SELECT v.id, v.buddy_id, v.elderly_id, v.scheduled_date, v.arrival_time, v.departure_time, v.arrival_lat_lng, v.status_check, v.buddy_notes, u.full_name AS buddy_name, e.full_name AS client_name, e.age, e.address FROM visits v LEFT JOIN users u ON v.buddy_id = u.id LEFT JOIN elderly_members e ON v.elderly_id = e.id';
    const params = [];

    if (buddyId) {
      query += ' WHERE v.buddy_id = ?';
      params.push(buddyId);
    } else if (clientId) {
      query += ' WHERE e.client_id = ?';
      params.push(clientId);
    }

    query += ' ORDER BY v.scheduled_date DESC';
    const [rows] = await pool.query(query, params);
    return res.json(rows);
  } catch (error) {
    console.error('Fetch visits failed:', error);
    return res.status(500).json({ message: 'Unable to load visits.' });
  }
});

app.put('/api/visits/:id', async (req, res) => {
  const visitId = req.params.id;
  const { status_check, buddy_notes, arrival_time, departure_time, arrival_lat_lng } = req.body;

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

  if (updates.length === 0) {
    return res.status(400).json({ message: 'Nothing to update.' });
  }

  try {
    await pool.query(`UPDATE visits SET ${updates.join(', ')} WHERE id = ?`, [...values, visitId]);
    return res.json({ message: 'Visit updated.' });
  } catch (error) {
    console.error('Update visit failed:', error);
    return res.status(500).json({ message: 'Unable to update visit.' });
  }
});

app.get('/api/tasks', async (req, res) => {
  const buddyId = req.query.buddy_id;
  const clientId = req.query.client_id;

  try {
    let query =
      'SELECT t.id, t.visit_id, t.task_name, t.status, t.measured_value, t.buddy_remarks, t.updated_at, v.buddy_id, v.elderly_id, v.scheduled_date, u.full_name AS buddy_name, e.full_name AS client_name FROM visit_tasks t LEFT JOIN visits v ON t.visit_id = v.id LEFT JOIN users u ON v.buddy_id = u.id LEFT JOIN elderly_members e ON v.elderly_id = e.id';
    const params = [];

    if (buddyId) {
      query += ' WHERE v.buddy_id = ?';
      params.push(buddyId);
    } else if (clientId) {
      query += ' WHERE e.client_id = ?';
      params.push(clientId);
    }

    query += ' ORDER BY t.updated_at DESC';
    const [rows] = await pool.query(query, params);
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
    await pool.query(
      'INSERT INTO visit_tasks (visit_id, task_name, status, measured_value, buddy_remarks, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [visit_id, task_name, status || 'pending', measured_value || '', buddy_remarks || '', new Date()],
    );
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
    await pool.query(`UPDATE visit_tasks SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`, [...values, new Date(), taskId]);
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
    const [rows] = await pool.query('SELECT id FROM visits WHERE buddy_id = ? ORDER BY scheduled_date DESC LIMIT 1', [buddy_id]);
    if (Array.isArray(rows) && rows.length > 0) {
      const visitId = rows[0].id;
      await pool.query('UPDATE visits SET arrival_lat_lng = ? WHERE id = ?', [arrivalLatLng, visitId]);
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
    const [rows] = await pool.query('SELECT arrival_lat_lng FROM visits WHERE buddy_id = ? AND arrival_lat_lng IS NOT NULL ORDER BY scheduled_date DESC LIMIT 1', [buddyId]);
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
  const { user_id, message, request_type } = req.body;

  if (!user_id || !message) {
    return res.status(400).json({ message: 'User ID and request message are required.' });
  }

  try {
    const logEntry = `${new Date().toISOString()} | user_id=${user_id} | type=${request_type || 'general'} | message=${message}\n`;
    fs.appendFileSync(path.resolve(process.cwd(), 'request-activity.log'), logEntry);
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
    const logPath = path.resolve(process.cwd(), 'request-activity.log');
    if (!fs.existsSync(logPath)) {
      return res.json([]);
    }

    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    const requests = lines.map((line) => {
      const parts = line.split('|').map((part) => part.trim());
      const timestamp = parts[0] || '';
      const userPart = parts.find((part) => part.startsWith('user_id=')) || '';
      const typePart = parts.find((part) => part.startsWith('type=')) || '';
      const messagePart = parts.find((part) => part.startsWith('message=')) || '';
      return {
        timestamp,
        user_id: Number(userPart.replace('user_id=', '') || 0),
        request_type: typePart.replace('type=', ''),
        message: messagePart.replace('message=', ''),
      };
    });

    const userIds = Array.from(new Set(requests.map((entry) => entry.user_id).filter((id) => id > 0)));
    const userNames = {};
    if (userIds.length > 0) {
      const [users] = await pool.query('SELECT id, full_name FROM users WHERE id IN (?)', [userIds]);
      if (Array.isArray(users)) {
        users.forEach((row) => {
          userNames[row.id] = row.full_name;
        });
      }
    }

    const enrichedRequests = requests.map((entry) => ({
      ...entry,
      user_name: userNames[entry.user_id] || 'Unknown',
    }));

    const filteredRequests = all
      ? enrichedRequests
      : enrichedRequests.filter((entry) => entry.user_id === Number(userId));

    return res.json(filteredRequests);
  } catch (error) {
    console.error('Fetch requests failed:', error);
    return res.status(500).json({ message: 'Unable to load requests.' });
  }
});

async function seedDefaultRequests() {
  const logPath = path.resolve(process.cwd(), 'request-activity.log');
  if (!fs.existsSync(logPath)) {
    const defaultRequests = [
      `${new Date().toISOString()} | user_id=2 | type=task_request | message=Request extra medication reminder for morning.`,
      `${new Date(Date.now() - 3600000).toISOString()} | user_id=3 | type=feedback | message=Please ensure warm meals are available.`,
      `${new Date(Date.now() - 7200000).toISOString()} | user_id=4 | type=special_care | message=Need extra assistance with mobility today.`,
      `${new Date(Date.now() - 10800000).toISOString()} | user_id=5 | type=task_request | message=Add hydration checks every two hours.`,
      `${new Date(Date.now() - 14400000).toISOString()} | user_id=6 | type=feedback | message=Buddy is doing a great job, thank you!`,
    ];
    fs.writeFileSync(logPath, defaultRequests.join('\n') + '\n', 'utf8');
  }
}

app.get('/api/health', async (req, res) => {
  res.json({ status: 'ok' });
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

  app.get('/dist/*', (req, res) => {
    const relativePath = req.path.replace(/^\/dist\//, '');
    const filePath = path.resolve(distPath, relativePath);
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
    return res.status(404).end();
  });

  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ message: 'API route not found.' });
    }

    const ext = path.extname(req.path);
    if (ext) {
      return res.status(404).end();
    }

    return res.sendFile(path.resolve(distPath, 'index.html'));
  });
} else {
  app.get('*', (req, res) => {
    res.status(500).send('Build not found. Run npm run build before starting the server.');
  });
}

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

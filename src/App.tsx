import React, { useEffect, useState } from 'react';

type Role = 'admin' | 'buddy' | 'client';

type User = {
  id: number;
  name: string;
  email: string;
  role: Role;
  phone?: string;
};

type Visit = {
  id: number;
  buddy_id: number;
  elderly_id: number;
  scheduled_date: string;
  arrival_time: string | null;
  departure_time: string | null;
  arrival_lat_lng: string | null;
  status_check: string | null;
  buddy_notes: string | null;
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
  timestamp: string;
  user_id: number;
  user_name?: string;
  request_type: string;
  message: string;
};

type Assignment = {
  id: number;
  buddy_id: number;
  elderly_id: number;
  status: string;
  buddy_name: string;
  elderly_name: string;
  age?: number;
  address?: string;
};

type ElderlyMember = {
  id: number;
  client_id: number;
  full_name: string;
  age: number;
  address: string;
  email: string;
};

const initialAuthState = {
  identifier: '',
  password: '',
};

const initialCreateForm = {
  name: '',
  email: '',
  phone: '',
  password: '',
  role: 'buddy' as 'buddy' | 'client',
};

const initialAssignmentForm = {
  buddy_id: '',
  elderly_id: '',
  term: 'short' as 'short' | 'long',
};

const initialRequestForm = {
  message: '',
};

function App() {
  const [user, setUser] = useState<User | null>(null);
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
  const [location, setLocation] = useState<{ lat: string; lng: string; updated_at: string } | null>(null);
  const [buddyLocations, setBuddyLocations] = useState<Record<number, { lat: string; lng: string; updated_at: string } | null>>({});
  const [createForm, setCreateForm] = useState(initialCreateForm);
  const [assignmentForm, setAssignmentForm] = useState(initialAssignmentForm);
  const [requestForm, setRequestForm] = useState(initialRequestForm);

  useEffect(() => {
    if (!user) {
      return;
    }
    loadDashboard();
    if (user.role === 'buddy') {
      refreshLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleChange = (field: keyof typeof authForm) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setAuthForm({ ...authForm, [field]: event.target.value });
  };

  const handleCreateChange = (field: keyof typeof createForm) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setCreateForm({ ...createForm, [field]: event.target.value });
  };

  const handleAssignmentChange = (field: keyof typeof assignmentForm) => (event: React.ChangeEvent<HTMLSelectElement>) => {
    setAssignmentForm({ ...assignmentForm, [field]: event.target.value });
  };

  const handleRequestChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRequestForm({ ...requestForm, message: event.target.value });
  };

  const loadBuddyLocations = async (visitList: Visit[]) => {
    const buddyIds = Array.from(new Set(visitList.map((visit) => visit.buddy_id)));
    const locationMap: Record<number, { lat: string; lng: string; updated_at: string } | null> = {};

    await Promise.all(
      buddyIds.map(async (buddyId) => {
        try {
          const response = await fetch(`/api/location?buddy_id=${buddyId}`);
          if (!response.ok) {
            locationMap[buddyId] = null;
            return;
          }
          const result = await response.json();
          locationMap[buddyId] = result.currentLocation || null;
        } catch {
          locationMap[buddyId] = null;
        }
      }),
    );

    setBuddyLocations(locationMap);
  };

  const loadDashboard = async () => {
    if (!user) {
      return;
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

        setBuddies(await buddyRes.json());
        setClients(await clientRes.json());
        setElderlyMembers(await elderlyRes.json());
        setAssignments(await assignmentRes.json());
        const visitData = await visitRes.json();
        setVisits(visitData);
        setTasks(await taskRes.json());
        setRequests(await requestRes.json());
        await loadBuddyLocations(visitData);
      } else if (user.role === 'client') {
        const [visitRes, taskRes, requestRes] = await Promise.all([
          fetch(`/api/visits?client_id=${user.id}`),
          fetch(`/api/tasks?client_id=${user.id}`),
          fetch(`/api/requests?user_id=${user.id}`),
        ]);
        const visitData = await visitRes.json();
        setVisits(visitData);
        setTasks(await taskRes.json());
        setRequests(await requestRes.json());
        await loadBuddyLocations(visitData);
      } else if (user.role === 'buddy') {
        const [visitRes, taskRes] = await Promise.all([
          fetch(`/api/visits?buddy_id=${user.id}`),
          fetch(`/api/tasks?buddy_id=${user.id}`),
        ]);
        const visitData = await visitRes.json();
        setVisits(visitData);
        setTasks(await taskRes.json());
      }
    } catch (error) {
      setStatusMessage('Unable to load dashboard data.');
    }
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

  const refreshLiveLocations = async () => {
    if (!user) {
      return;
    }
    if (user.role === 'admin' || user.role === 'client') {
      await loadBuddyLocations(visits);
      setStatusMessage('Live locations refreshed.');
    }
  };

  const refreshLocation = async () => {
    if (!user || user.role !== 'buddy') {
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
            body: JSON.stringify({ buddy_id: user.id, lat, lng }),
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
      setMessage('Please enter username/email and password.');
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
      setMessage('');
      setStatusMessage('');
      setAuthForm(initialAuthState);
      return;
    } catch (error) {
      setMessage('Unable to connect to the server.');
    }
  };

  const handleLogout = () => {
    setUser(null);
    setBuddies([]);
    setClients([]);
    setAssignments([]);
    setVisits([]);
    setTasks([]);
    setLocation(null);
    setMessage('You have been logged out.');
    setStatusMessage('');
  };

  const handleCreateUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatusMessage('');

    if (!createForm.name || !createForm.password) {
      setStatusMessage('Name and password are required.');
      return;
    }

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
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

  const handleRequestSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatusMessage('');

    if (!requestForm.message.trim() || !user) {
      setStatusMessage('Please enter your request message.');
      return;
    }

    try {
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, message: requestForm.message, request_type: 'client_request' }),
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

  const createUserCard = (item: User) => (
    <div className="mini-card" key={item.id}>
      <div className="name">{item.name}</div>
      <div className="status">{item.email} • {item.role}</div>
    </div>
  );

  const taskBadge = (status: string) => {
    if (status === 'completed' || status === 'done') return 'pill done';
    if (status === 'pending') return 'pill pending';
    return 'pill live';
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
        <button className="btn btn-secondary" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </header>
  );

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
          <button className="btn btn-secondary" onClick={refreshLiveLocations}>Refresh live locations</button>
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
      <div className="section">
        <div className="panel">
          <h2>Create caretaker or client login</h2>
          <form onSubmit={handleCreateUser} className="auth-form">
            <label>
              Full name
              <input className="small-input" value={createForm.name} onChange={handleCreateChange('name')} placeholder="Full name" />
            </label>
            <label>
              Role
              <select className="small-input" value={createForm.role} onChange={handleCreateChange('role')}>
                <option value="buddy">Caretaker (Buddy)</option>
                <option value="client">Client (Gatt)</option>
              </select>
            </label>
            <label>
              Email (optional)
              <input className="small-input" value={createForm.email} onChange={handleCreateChange('email')} placeholder="optional email" />
            </label>
            <label>
              Password
              <input className="small-input" type="password" value={createForm.password} onChange={handleCreateChange('password')} placeholder="1234567890" />
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
                {buddies.map((item) => (
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
              Term
              <select className="small-input" value={assignmentForm.term} onChange={handleAssignmentChange('term')}>
                <option value="short">Short term</option>
                <option value="long">Long term</option>
              </select>
            </label>
            <button className="btn btn-primary auth-submit" type="submit">Create assignment</button>
          </form>
        </div>
      </div>
      <div className="section">
        <div className="panel">
          <h2>Caretaker directory</h2>
          <div className="card-grid">{buddies.map(createUserCard)}</div>
        </div>
        <div className="panel">
          <h2>Client directory</h2>
          <div className="card-grid">{clients.map(createUserCard)}</div>
        </div>
      </div>
      <div className="panel">
        <h2>Current assignments</h2>
        <table className="panel-table">
          <thead>
            <tr>
              <th>Caretaker</th>
              <th>Client</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((assignment) => (
              <tr key={assignment.id}>
                <td>{assignment.buddy_name || 'Unknown'}</td>
                <td>{assignment.elderly_name || 'Unknown'}</td>
                <td>{assignment.status}</td>
                <td>{assignment.address || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h2>Client requests</h2>
        <table className="panel-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>User</th>
              <th>Type</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request, index) => (
              <tr key={`${request.user_id}-${index}`}>
                <td>{new Date(request.timestamp).toLocaleString()}</td>
                <td>{`${request.user_id} / ${request.user_name || 'Unknown'}`}</td>
                <td>{request.request_type}</td>
                <td>{request.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h2>Active visits and location</h2>
        <table className="panel-table">
          <thead>
            <tr>
              <th>Caregiver</th>
              <th>Client</th>
              <th>Scheduled</th>
              <th>Start</th>
              <th>Location</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {visits.map((visit) => {
              const liveLocation = buddyLocations[visit.buddy_id];
              const displayLocation = liveLocation
                ? `${liveLocation.lat}, ${liveLocation.lng} (live)`
                : visit.arrival_lat_lng || 'Unknown';

              return (
                <tr key={visit.id}>
                  <td>{visit.buddy_name}</td>
                  <td>{visit.client_name}</td>
                  <td>{visit.scheduled_date}</td>
                  <td>{visit.arrival_time || 'Pending'}</td>
                  <td>{displayLocation}</td>
                  <td>{visit.status_check || 'Pending'}</td>
                  <td>{visit.buddy_notes || 'No notes'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h2>Upcoming task status</h2>
        <table className="panel-table">
          <thead>
            <tr>
              <th>Task</th>
              <th>Caretaker</th>
              <th>Client</th>
              <th>Status</th>
              <th>Update</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td>{task.task_name}</td>
                <td>{task.buddy_name}</td>
                <td>{task.client_name}</td>
                <td>{task.status}</td>
                <td>
                  <select className="small-input" value={task.status} onChange={(event) => handleTaskUpdate(task.id, event.target.value)}>
                    <option value="pending">pending</option>
                    <option value="completed">completed</option>
                    <option value="carried_forward">carried_forward</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {statusMessage && <div className="auth-message">{statusMessage}</div>}
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
        <div className="hero-actions">
          <button className="btn btn-secondary" onClick={refreshLiveLocations}>Refresh live locations</button>
        </div>
        <div className="hero-card">
          <div className="tiny">Logged in as</div>
          <div className="metric">{user?.name}</div>
          <div>Email: {user?.email}</div>
          <ul>
            <li>Read-only view of caregiver progress</li>
            <li>Send request and feedback to admin</li>
            <li>Current locations update on refresh</li>
          </ul>
        </div>
      </section>
      <div className="panel">
        <h2>Current visits</h2>
        <table className="panel-table">
          <thead>
            <tr>
              <th>Caretaker</th>
              <th>Scheduled</th>
              <th>Start</th>
              <th>Status</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            {visits.map((visit) => {
              const liveLocation = buddyLocations[visit.buddy_id];
              const displayLocation = liveLocation
                ? `${liveLocation.lat}, ${liveLocation.lng} (live)`
                : visit.arrival_lat_lng || 'Unknown';

              return (
                <tr key={visit.id}>
                  <td>{visit.buddy_name}</td>
                  <td>{visit.scheduled_date}</td>
                  <td>{visit.arrival_time || 'Pending'}</td>
                  <td>{visit.status_check || 'Pending'}</td>
                  <td>{displayLocation}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h2>Assigned tasks</h2>
        <table className="panel-table">
          <thead>
            <tr>
              <th>Task</th>
              <th>Caretaker</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td>{task.task_name}</td>
                <td>{task.buddy_name}</td>
                <td>{task.status}</td>
                <td>{task.buddy_remarks || 'No remarks'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h2>Request feedback or special care</h2>
        <form onSubmit={handleRequestSubmit} className="auth-form">
          <label>
            Request details
            <textarea className="small-input" value={requestForm.message} onChange={handleRequestChange} rows={4} placeholder="Describe an additional task, feedback, or special care note." />
          </label>
          <button className="btn btn-primary auth-submit" type="submit">Send request</button>
        </form>
      </div>
      <div className="panel">
        <h2>My request history</h2>
        <table className="panel-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>User</th>
              <th>Type</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request, index) => (
              <tr key={`${request.user_id}-${index}`}>
                <td>{new Date(request.timestamp).toLocaleString()}</td>
                <td>{`${request.user_id} / ${request.user_name || 'Unknown'}`}</td>
                <td>{request.request_type}</td>
                <td>{request.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {statusMessage && <div className="auth-message">{statusMessage}</div>}
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
            <li>Refresh location when you begin work</li>
            <li>Track visit status and start time</li>
          </ul>
        </div>
      </section>
      <div className="panel">
        <div className="inline-row">
          <h2>Current location</h2>
          <button className="btn btn-secondary" onClick={refreshLocation}>Refresh location</button>
        </div>
        <p>{location ? `${location.lat}, ${location.lng} (updated ${new Date(location.updated_at).toLocaleTimeString()})` : 'Location not set yet.'}</p>
      </div>
      <div className="panel">
        <h2>Visits</h2>
        <table className="panel-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Scheduled</th>
              <th>Arrival</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {visits.map((visit) => (
              <tr key={visit.id}>
                <td>{visit.client_name}</td>
                <td>{visit.scheduled_date}</td>
                <td>{visit.arrival_time || 'Pending'}</td>
                <td>{visit.status_check || 'Pending'}</td>
                <td>{visit.buddy_notes || 'None'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h2>My tasks</h2>
        <table className="panel-table">
          <thead>
            <tr>
              <th>Task</th>
              <th>Client</th>
              <th>Status</th>
              <th>Update status</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td>{task.task_name}</td>
                <td>{task.client_name}</td>
                <td>{task.status}</td>
                <td>
                  <select className="small-input" value={task.status} onChange={(event) => handleTaskUpdate(task.id, event.target.value)}>
                    <option value="pending">pending</option>
                    <option value="completed">completed</option>
                    <option value="carried_forward">carried_forward</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {statusMessage && <div className="auth-message">{statusMessage}</div>}
    </>
  );

  if (!user) {
    return (
      <div className="wrap auth-wrap">
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
              Username or email
              <input type="text" value={authForm.identifier} onChange={handleChange('identifier')} placeholder="Admin, Buddy, or Gatt" />
            </label>
            <label>
              Password
              <input type="password" value={authForm.password} onChange={handleChange('password')} placeholder="1234567890" />
            </label>
            {message && <div className="auth-message">{message}</div>}
            <button className="btn btn-primary auth-submit" type="submit">Login</button>
            <div className="auth-note">
              Default credentials: Admin / 1234567890, Buddy / 1234567890, Gatt / 1234567890.
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      {renderHeader()}
      {user.role === 'admin' && adminDashboard()}
      {user.role === 'client' && clientDashboard()}
      {user.role === 'buddy' && buddyDashboard()}
    </div>
  );
}

export default App;

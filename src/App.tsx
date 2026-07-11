import React, { useEffect, useState } from 'react';

type Role = 'admin' | 'buddy' | 'client';

type User = {
  id: number;
  name: string;
  email: string;
  role: Role;
  phone?: string;
};

type ApiUser = {
  id: number;
  name?: string;
  full_name?: string;
  email: string;
  role: Role;
  phone?: string;
};

type Visit = {
  id: number;
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
  term_type?: string;
  admin_notes?: string | null;
  end_date?: string | null;
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
  address: '',
  password: '',
  role: 'buddy' as 'buddy' | 'client',
};

const initialAssignmentForm = {
  buddy_id: '',
  elderly_id: '',
  term: 'short' as 'short' | 'long',
};

const initialRequestForm = {
  request_type: 'task_request' as 'task_request' | 'feedback' | 'special_care',
  message: '',
};

function App() {
  type AdminTab = 'overview' | 'assignments' | 'visits' | 'tasks' | 'requests';
  type ClientTab = 'visits' | 'tasks' | 'requests';
  type BuddyTab = 'location' | 'visits' | 'tasks';

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
  const [assignmentEdits, setAssignmentEdits] = useState<Record<number, { status: string; term_type: string; admin_notes: string }>>({});
  const [visitEdits, setVisitEdits] = useState<Record<number, { visit_status: string; status_check: string; buddy_notes: string; client_visible_notes: string }>>({});
  const [adminTab, setAdminTab] = useState<AdminTab>('overview');
  const [clientTab, setClientTab] = useState<ClientTab>('visits');
  const [buddyTab, setBuddyTab] = useState<BuddyTab>('location');

  const normalizeUser = (apiUser: ApiUser): User => ({
    id: apiUser.id,
    name: apiUser.name || apiUser.full_name || 'Unknown',
    email: apiUser.email,
    role: apiUser.role,
    phone: apiUser.phone,
  });

  const CACHE_TTL_MS = 5 * 60 * 1000;

  const getDashboardCacheKey = (activeUser: User) => `gatt_dashboard_${activeUser.role}_${activeUser.id}`;

  useEffect(() => {
    const cachedUserRaw = sessionStorage.getItem('gatt_user');
    if (cachedUserRaw) {
      try {
        const cachedUser = JSON.parse(cachedUserRaw) as User;
        setUser(cachedUser);
      } catch {
        sessionStorage.removeItem('gatt_user');
      }
    }

    void (async () => {
      try {
        const response = await fetch('/api/session');
        if (!response.ok) {
          throw new Error('No active session');
        }
        const result = await response.json();
        if (result?.user) {
          setUser(result.user as User);
          sessionStorage.setItem('gatt_user', JSON.stringify(result.user));
        }
      } catch {
        setUser(null);
        sessionStorage.removeItem('gatt_user');
      }
    })();
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }
    void (async () => {
      const visitData = await loadDashboard();
      if (user.role === 'buddy') {
        await refreshLocation(visitData);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    if (user.role === 'admin') {
      const saved = localStorage.getItem('gatt_tab_admin');
      if (saved && ['overview', 'assignments', 'visits', 'tasks', 'requests'].includes(saved)) {
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
    const nextAssignmentEdits: Record<number, { status: string; term_type: string; admin_notes: string }> = {};
    assignments.forEach((assignment) => {
      nextAssignmentEdits[assignment.id] = {
        status: assignment.status || 'active',
        term_type: assignment.term_type || 'short',
        admin_notes: assignment.admin_notes || '',
      };
    });
    setAssignmentEdits(nextAssignmentEdits);
  }, [assignments]);

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

  const handleRequestTypeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setRequestForm({ ...requestForm, request_type: event.target.value as typeof initialRequestForm.request_type });
  };

  const getActiveCaseVisits = (visitList: Visit[]) => {
    const today = new Date().toISOString().slice(0, 10);
    return visitList.filter((visit) => {
      const status = visit.visit_status || 'scheduled';
      return visit.scheduled_date === today && (status === 'scheduled' || status === 'in_progress');
    });
  };

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

  const handleAssignmentEditChange = (assignmentId: number, field: 'status' | 'term_type' | 'admin_notes', value: string) => {
    setAssignmentEdits((current) => ({
      ...current,
      [assignmentId]: {
        status: current[assignmentId]?.status || 'active',
        term_type: current[assignmentId]?.term_type || 'short',
        admin_notes: current[assignmentId]?.admin_notes || '',
        [field]: value,
      },
    }));
  };

  const handleVisitEditChange = (visitId: number, field: 'visit_status' | 'status_check' | 'buddy_notes' | 'client_visible_notes', value: string) => {
    setVisitEdits((current) => ({
      ...current,
      [visitId]: {
        visit_status: current[visitId]?.visit_status || 'scheduled',
        status_check: current[visitId]?.status_check || '',
        buddy_notes: current[visitId]?.buddy_notes || '',
        client_visible_notes: current[visitId]?.client_visible_notes || '',
        [field]: value,
      },
    }));
  };

  const loadBuddyLocations = async (visitList: Visit[]) => {
    const activeVisits = getActiveCaseVisits(visitList);
    const buddyIds = Array.from(new Set(activeVisits.map((visit) => visit.buddy_id)));
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
      return [] as Visit[];
    }

    const cacheKey = getDashboardCacheKey(user);
    const cachedRaw = sessionStorage.getItem(cacheKey);
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
        };

        if (Date.now() - cached.ts < CACHE_TTL_MS) {
          if (user.role === 'admin') {
            setBuddies(cached.buddies || []);
            setClients(cached.clients || []);
            setElderlyMembers(cached.elderlyMembers || []);
            setAssignments(cached.assignments || []);
            setVisits(cached.visits || []);
            setTasks(cached.tasks || []);
            setRequests(cached.requests || []);
          } else if (user.role === 'client') {
            setVisits(cached.visits || []);
            setTasks(cached.tasks || []);
            setRequests(cached.requests || []);
          } else if (user.role === 'buddy') {
            setVisits(cached.visits || []);
            setTasks(cached.tasks || []);
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

        const buddyData = (await buddyRes.json()) as ApiUser[];
        const clientData = (await clientRes.json()) as ApiUser[];
        const elderlyData = (await elderlyRes.json()) as ElderlyMember[];
        const assignmentData = (await assignmentRes.json()) as Assignment[];
        const visitData = (await visitRes.json()) as Visit[];
        const taskData = (await taskRes.json()) as Task[];
        const requestData = (await requestRes.json()) as RequestEntry[];

        setBuddies(buddyData.map(normalizeUser));
        setClients(clientData.map(normalizeUser));
        setElderlyMembers(elderlyData);
        setAssignments(assignmentData);
        setVisits(visitData);
        setTasks(taskData);
        setRequests(requestData);
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
          }),
        );
        return visitData;
      } else if (user.role === 'client') {
        const [visitRes, taskRes, requestRes] = await Promise.all([
          fetch(`/api/visits?client_id=${user.id}`),
          fetch(`/api/tasks?client_id=${user.id}`),
          fetch(`/api/requests?user_id=${user.id}`),
        ]);
        const visitData = (await visitRes.json()) as Visit[];
        const taskData = (await taskRes.json()) as Task[];
        const requestData = (await requestRes.json()) as RequestEntry[];
        setVisits(visitData);
        setTasks(taskData);
        setRequests(requestData);
        await loadBuddyLocations(visitData);

        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({
            ts: Date.now(),
            visits: visitData,
            tasks: taskData,
            requests: requestData,
          }),
        );
        return visitData;
      } else if (user.role === 'buddy') {
        const [visitRes, taskRes] = await Promise.all([
          fetch(`/api/visits?buddy_id=${user.id}`),
          fetch(`/api/tasks?buddy_id=${user.id}`),
        ]);
        const visitData = await visitRes.json();
        setVisits(visitData);
        const taskData = await taskRes.json();
        setTasks(taskData);

        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({
            ts: Date.now(),
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

  const refreshLiveLocations = async () => {
    if (!user) {
      return;
    }
    if (user.role === 'admin' || user.role === 'client') {
      await loadBuddyLocations(getActiveCaseVisits(visits));
      setStatusMessage('Live locations refreshed.');
    }
  };

  const refreshLocation = async (visitList: Visit[] = visits) => {
    if (!user || user.role !== 'buddy') {
      return;
    }

    if (getActiveCaseVisits(visitList).length === 0) {
      setStatusMessage('Location updates are available only during an active case slot.');
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
    setLocation(null);
    sessionStorage.removeItem('gatt_user');
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith('gatt_dashboard_'))
      .forEach((key) => sessionStorage.removeItem(key));
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

  const handleAssignmentUpdate = async (assignmentId: number) => {
    const draft = assignmentEdits[assignmentId];
    if (!draft) {
      return;
    }

    setStatusMessage('');
    try {
      const response = await fetch(`/api/assignments/${assignmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
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
        body: JSON.stringify({ user_id: user.id, message: requestForm.message, request_type: requestForm.request_type }),
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
          { key: 'assignments', label: 'Assignments' },
          { key: 'visits', label: 'Visits & Location' },
          { key: 'tasks', label: 'Tasks' },
          { key: 'requests', label: 'Requests' },
        ],
        adminTab,
        (key) => setAdminTab(key as AdminTab),
      )}
      {adminTab === 'overview' && <div className="section">
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
              Phone number
              <input className="small-input" value={createForm.phone} onChange={handleCreateChange('phone')} placeholder="caretaker/client phone" />
            </label>
            <label>
              Address
              <input className="small-input" value={createForm.address} onChange={handleCreateChange('address')} placeholder="home address" />
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
      </div>}
      {adminTab === 'overview' && <div className="section">
        <div className="panel">
          <h2>Caretaker directory</h2>
          <div className="card-grid">{buddies.map(createUserCard)}</div>
        </div>
        <div className="panel">
          <h2>Client directory</h2>
          <div className="card-grid">{clients.map(createUserCard)}</div>
        </div>
      </div>}
      {adminTab === 'assignments' && <div className="panel">
        <h2>Current assignments</h2>
        <table className="panel-table">
          <thead>
            <tr>
              <th>Caretaker</th>
              <th>Client</th>
              <th>Status</th>
              <th>Term</th>
              <th>Admin notes</th>
              <th>Save</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((assignment) => (
              <tr key={assignment.id}>
                <td>{assignment.buddy_name || 'Unknown'}</td>
                <td>{assignment.elderly_name || 'Unknown'}</td>
                <td>
                  <select className="small-input" value={assignmentEdits[assignment.id]?.status || assignment.status} onChange={(event) => handleAssignmentEditChange(assignment.id, 'status', event.target.value)}>
                    <option value="active">active</option>
                    <option value="paused">paused</option>
                    <option value="completed">completed</option>
                    <option value="cancelled">cancelled</option>
                  </select>
                </td>
                <td>
                  <select className="small-input" value={assignmentEdits[assignment.id]?.term_type || assignment.term_type || 'short'} onChange={(event) => handleAssignmentEditChange(assignment.id, 'term_type', event.target.value)}>
                    <option value="short">short</option>
                    <option value="long">long</option>
                  </select>
                </td>
                <td>
                  <input
                    className="small-input"
                    value={assignmentEdits[assignment.id]?.admin_notes || ''}
                    onChange={(event) => handleAssignmentEditChange(assignment.id, 'admin_notes', event.target.value)}
                    placeholder={assignment.address || 'Add note'}
                  />
                </td>
                <td>
                  <button className="btn btn-secondary" type="button" onClick={() => handleAssignmentUpdate(assignment.id)}>Save</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
      {adminTab === 'requests' && <div className="panel">
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
      </div>}
      {adminTab === 'visits' && <div className="panel">
        <h2>Active visits and location</h2>
        <table className="panel-table">
          <thead>
            <tr>
              <th>Caregiver</th>
              <th>Client</th>
              <th>Scheduled</th>
              <th>Case state</th>
              <th>Start</th>
              <th>End</th>
              <th>Location</th>
              <th>Status</th>
              <th>Notes</th>
              <th>Visit state</th>
              <th>Save</th>
            </tr>
          </thead>
          <tbody>
            {visits.map((visit) => {
              const liveLocation = buddyLocations[visit.buddy_id];
              const displayLocation = liveLocation
                ? `${liveLocation.lat}, ${liveLocation.lng} (live)`
                : visit.arrival_lat_lng || 'Unknown';
              const activityBadge = getVisitActivityBadge(visit);

              return (
                <tr key={visit.id}>
                  <td>{visit.buddy_name}</td>
                  <td>{visit.client_name}</td>
                  <td>{visit.scheduled_date}</td>
                  <td><span className={activityBadge.className}>{activityBadge.label}</span></td>
                  <td>{visit.arrival_time || 'Pending'}</td>
                  <td>{visit.departure_time || 'Pending'}</td>
                  <td>{displayLocation}</td>
                  <td>
                    <input className="small-input" value={visitEdits[visit.id]?.status_check || ''} onChange={(event) => handleVisitEditChange(visit.id, 'status_check', event.target.value)} placeholder="Status check" />
                  </td>
                  <td>{visit.buddy_notes || 'No notes'}</td>
                  <td>
                    <select className="small-input" value={visitEdits[visit.id]?.visit_status || visit.visit_status || 'scheduled'} onChange={(event) => handleVisitEditChange(visit.id, 'visit_status', event.target.value)}>
                      <option value="scheduled">scheduled</option>
                      <option value="in_progress">in_progress</option>
                      <option value="completed">completed</option>
                      <option value="missed">missed</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                  </td>
                  <td>
                    <button className="btn btn-secondary" type="button" onClick={() => handleVisitAdminUpdate(visit.id)}>Save</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>}
      {adminTab === 'tasks' && <div className="panel">
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
      </div>}
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
          <button className="btn btn-secondary" onClick={refreshLiveLocations} disabled={getActiveCaseVisits(visits).length === 0}>Refresh live locations</button>
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
      {renderDashboardTabs(
        [
          { key: 'visits', label: 'Visits' },
          { key: 'tasks', label: 'Tasks' },
          { key: 'requests', label: 'Requests' },
        ],
        clientTab,
        (key) => setClientTab(key as ClientTab),
      )}
      {clientTab === 'visits' && <div className="panel">
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
      </div>}
      {clientTab === 'tasks' && <div className="panel">
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
      </div>}
      {clientTab === 'requests' && <div className="panel">
        <h2>Request feedback or special care</h2>
        <form onSubmit={handleRequestSubmit} className="auth-form">
          <label>
            Request type
            <select className="small-input" value={requestForm.request_type} onChange={handleRequestTypeChange}>
              <option value="task_request">Task request</option>
              <option value="feedback">Feedback</option>
              <option value="special_care">Special care</option>
            </select>
          </label>
          <label>
            Request details
            <textarea className="small-input" value={requestForm.message} onChange={handleRequestChange} rows={4} placeholder="Describe an additional task, feedback, or special care note." />
          </label>
          <button className="btn btn-primary auth-submit" type="submit">Send request</button>
        </form>
      </div>}
      {clientTab === 'requests' && <div className="panel">
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
      </div>}
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
            <li>Refresh location when you begin work or refresh the page</li>
            <li>Track visit status and start time</li>
          </ul>
        </div>
      </section>
      {renderDashboardTabs(
        [
          { key: 'location', label: 'Location' },
          { key: 'visits', label: 'Visits' },
          { key: 'tasks', label: 'Tasks' },
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
        <h2>Visits</h2>
        <table className="panel-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Scheduled</th>
              <th>Case state</th>
              <th>Arrival</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {visits.map((visit) => {
              const activityBadge = getVisitActivityBadge(visit);
              return (
                <tr key={visit.id}>
                  <td>{visit.client_name}</td>
                  <td>{visit.scheduled_date}</td>
                  <td><span className={activityBadge.className}>{activityBadge.label}</span></td>
                  <td>{visit.arrival_time || 'Pending'}</td>
                  <td>{visit.status_check || 'Pending'}</td>
                  <td>{visit.buddy_notes || 'None'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>}
      {buddyTab === 'tasks' && <div className="panel">
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
      </div>}
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

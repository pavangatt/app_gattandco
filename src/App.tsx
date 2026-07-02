import { useState } from 'react';

const views = {
  admin: {
    title: 'Track every visit, milestone, and care update in real time.',
    blurb:
      'Built for app.gattandco.com, this experience helps families, administrators, and caregivers stay aligned with clear activity logs, responsive alerts, and a trusted care timeline.',
    metric: '98.4%',
    bullets: [
      'Live check-ins from every active caregiver',
      'Instant update visibility for clients and staff',
      'Simple admin reporting for approvals and follow-ups',
    ],
  },
  client: {
    title: 'See exactly what care happened today and what is next.',
    blurb:
      'Clients receive a transparent view of scheduled visits, completed tasks, and any follow-up requests without needing to chase updates manually.',
    metric: '100%',
    bullets: [
      'Daily care snapshots sent to families',
      'Confirmed tasks and time stamps',
      'Peace of mind with clear visibility',
    ],
  },
  caregiver: {
    title: 'Stay organized with a focused checklist and live route updates.',
    blurb:
      'Caregivers can quickly record activity, flag issues, and keep every visit aligned with the shared care plan.',
    metric: '94%',
    bullets: [
      'Fast task logging on the go',
      'Location-aware visit status',
      'Simple handoff notes for the next shift',
    ],
  },
};

function App() {
  const [currentView, setCurrentView] = useState<'admin' | 'client' | 'caregiver'>('admin');
  const view = views[currentView];

  return (
    <div className="wrap">
      <header className="topbar">
        <div className="brand">
          <div className="brand-badge">G</div>
          <div>
            <div>Gatt & Co</div>
            <div className="brand-subtitle">Care tracking portal</div>
          </div>
        </div>
        <div className="nav-pills">
          {(['admin', 'client', 'caregiver'] as const).map((viewKey) => (
            <button
              key={viewKey}
              className={currentView === viewKey ? 'active' : ''}
              onClick={() => setCurrentView(viewKey)}
            >
              {viewKey === 'admin' ? 'Admin view' : viewKey === 'client' ? 'Client view' : 'Caregiver view'}
            </button>
          ))}
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="hero-label">Transparent care operations</p>
          <h1>{view.title}</h1>
          <p className="hero-copy">{view.blurb}</p>
          <div className="hero-actions">
            <button className="btn btn-primary">Launch dashboard</button>
            <button className="btn btn-secondary">View care workflow</button>
          </div>
        </div>
        <div className="hero-card">
          <div className="tiny">Today’s coverage</div>
          <div className="metric">{view.metric}</div>
          <div>Care visits completed on schedule</div>
          <ul>
            {view.bullets.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="stats">
        <div className="stat">
          <div className="label">Active caregivers</div>
          <div className="value">24</div>
          <div className="delta">+3 today</div>
        </div>
        <div className="stat">
          <div className="label">Live visits</div>
          <div className="value">12</div>
          <div className="delta">2 in progress</div>
        </div>
        <div className="stat">
          <div className="label">Tasks completed</div>
          <div className="value">86</div>
          <div className="delta">94% completion</div>
        </div>
        <div className="stat">
          <div className="label">Pending approvals</div>
          <div className="value">5</div>
          <div className="delta">2 urgent</div>
        </div>
      </section>

      <section className="dashboard">
        <div className="panel">
          <h2>Care activity timeline</h2>
          <div className="timeline">
            <div className="event">
              <div>
                <strong>Morning medication round</strong>
                <div className="meta">Mina Patel • 08:15 • Client: The Watson Residence</div>
              </div>
              <span className="pill live">Live</span>
            </div>
            <div className="event">
              <div>
                <strong>Meal preparation completed</strong>
                <div className="meta">Jude Chen • 09:30 • Nutrition checklist signed off</div>
              </div>
              <span className="pill done">Confirmed</span>
            </div>
            <div className="event">
              <div>
                <strong>Follow-up visit requested</strong>
                <div className="meta">Admin review • 11:10 • Care notes need approval</div>
              </div>
              <span className="pill pending">Pending</span>
            </div>
          </div>
        </div>

        <div className="panel">
          <h2>Caregiver availability</h2>
          <div className="caregiver-list">
            <div className="caregiver">
              <div>
                <div className="name">Aisha Brooks</div>
                <div className="status">
                  <span className="dot green" />On route to visit
                </div>
              </div>
              <span className="pill live">Arriving</span>
            </div>
            <div className="caregiver">
              <div>
                <div className="name">Daniel Ortiz</div>
                <div className="status">
                  <span className="dot blue" />Checking in with client
                </div>
              </div>
              <span className="pill done">Active</span>
            </div>
            <div className="caregiver">
              <div>
                <div className="name">Liam Carter</div>
                <div className="status">
                  <span className="dot orange" />Needs supply restock
                </div>
              </div>
              <span className="pill pending">Attention</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="mini-card">
          <h3>Operational health</h3>
          <div className="bar-row">
            <span>Visits</span>
            <div className="bar">
              <span style={{ width: '88%' }} />
            </div>
          </div>
          <div className="bar-row">
            <span>Notes</span>
            <div className="bar">
              <span style={{ width: '94%' }} />
            </div>
          </div>
          <div className="bar-row">
            <span>Escalations</span>
            <div className="bar">
              <span style={{ width: '72%' }} />
            </div>
          </div>
        </div>
        <div className="mini-card">
          <h3>Client transparency summary</h3>
          <p className="mini-copy">
            Clients can see when care began, completed tasks, medication reminders, and any follow-up actions required. Admins get a shared overview so no update is missed.
          </p>
          <ul>
            <li>Live updates from caregivers</li>
            <li>Daily care cards and notes</li>
            <li>Clear audit trail for accountability</li>
          </ul>
        </div>
      </section>

      <div className="footer">Designed for the next phase of Gatt & Co’s care operations on app.gattandco.com.</div>
    </div>
  );
}

export default App;

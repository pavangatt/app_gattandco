# Sprint 1 Build-Ready Checklist

This checklist turns Sprint 1 into concrete implementation work based on the current codebase.

## Business naming convention

Use business-facing names in planning and UI copy, and keep a stable mapping to DB/API fields.

Recommended business term to implementation field mapping:

| Business term | Implementation field |
| --- | --- |
| Client onboarding type | `client_onboarding_type` |
| Service plan type | `service_plan_type` |
| Approval state | `approval_state` |
| Care shift | `care_shift` |
| Monthly visit plan | `monthly_visit_plan` |
| Planned visit duration | `planned_visit_duration_minutes` |
| Service requested for client | `service_for_client_id` |
| Extension end date | `extension_end_date` |
| Care plan services | `care_plan_services` |
| Assignment lifecycle audit | `assignment_lifecycle_audits` |
| Service code | `service_code` |
| Service name | `service_name` |

Current anchors in the repo:
- `src/App.tsx`
  - `type User`
  - `type Assignment`
  - `initialCreateForm`
  - `initialAssignmentForm`
  - admin overview create-user form
  - admin overview create-assignment form
- `server.js`
  - `POST /api/users`
  - `POST /api/assignments`
- `supabase-schema.sql`
  - `public.users`
  - `public.assignments`

## Sprint 1 Goal

Add the minimum schema and app contract needed to support:
- client type classification
- short-term vs long-term assignment structure
- approval-ready assignment records
- service package metadata

This sprint should not yet implement the full approval workflow or full session execution rules. It should only create the structure required for those later sprints.

## 1. Database changes

Create a new migration file:
- `supabase-assignment-structure-migration.sql`

### 1.1 Users table changes

Add client type only for client accounts.

Columns to add to `public.users`:
- `client_onboarding_type text`

Allowed values:
- `self_service`
- `kin_requested`

Migration rules:
- nullable for admin and buddy rows
- nullable temporarily for existing client rows during migration
- backfill existing client rows to `kin_requested` as the safe default unless the business wants `self_service`
- after backfill, keep server-side validation so only client users can set this field

Suggested SQL:

```sql
alter table if exists public.users
  add column if not exists client_onboarding_type text;

update public.users
set client_onboarding_type = 'kin_requested'
where role = 'client'
  and coalesce(client_onboarding_type, '') = '';

alter table if exists public.users
  add constraint users_client_onboarding_type_check
  check (
    client_onboarding_type is null
    or client_onboarding_type in ('self_service', 'kin_requested')
  );
```

### 1.2 Assignments table changes

Current assignment model is too small:
- `status`: `active | paused | completed | cancelled`
- `term_type`: `short | long`

Sprint 1 should add structure without fully switching business flow yet.

Columns to add to `public.assignments`:
- `service_plan_type text`
- `approval_state text`
- `care_shift text`
- `monthly_visit_plan int`
- `planned_visit_duration_minutes int`
- `service_for_client_id bigint`
- `extension_end_date date`

Field meaning:
- `service_plan_type`: normalized replacement for current `term_type`
- `approval_state`: future-proof state for client approval flow
- `care_shift`: used only for long-term caretaking
- `monthly_visit_plan`: used only for short-term service bundles
- `planned_visit_duration_minutes`: used only for short-term visits, expected 60 or 90
- `service_for_client_id`: client beneficiary for admin-on-behalf creation
- `extension_end_date`: optional long-term extension date

Suggested SQL:

```sql
alter table if exists public.assignments
  add column if not exists service_plan_type text;

alter table if exists public.assignments
  add column if not exists approval_state text;

alter table if exists public.assignments
  add column if not exists care_shift text;

alter table if exists public.assignments
  add column if not exists monthly_visit_plan int;

alter table if exists public.assignments
  add column if not exists planned_visit_duration_minutes int;

alter table if exists public.assignments
  add column if not exists service_for_client_id bigint references public.users(id) on delete set null;

alter table if exists public.assignments
  add column if not exists extension_end_date date;

update public.assignments
set service_plan_type = case when coalesce(term_type, 'short') = 'long' then 'long_term' else 'short_term' end
where service_plan_type is null;

update public.assignments
set approval_state = 'approved'
where approval_state is null;

update public.assignments
set planned_visit_duration_minutes = 60
where service_plan_type = 'short_term'
  and planned_visit_duration_minutes is null;

alter table if exists public.assignments
  add constraint assignments_service_plan_type_check
  check (
    service_plan_type is null
    or service_plan_type in ('short_term', 'long_term')
  );

alter table if exists public.assignments
  add constraint assignments_approval_state_check
  check (
    approval_state is null
    or approval_state in ('pending_approval', 'approved', 'rejected', 'rescheduled')
  );

alter table if exists public.assignments
  add constraint assignments_care_shift_check
  check (
    care_shift is null
    or care_shift in ('morning_10h', 'night_10h', 'full_day')
  );

alter table if exists public.assignments
  add constraint assignments_monthly_visit_plan_check
  check (
    monthly_visit_plan is null
    or monthly_visit_plan in (3, 6, 9)
  );

alter table if exists public.assignments
  add constraint assignments_planned_visit_duration_check
  check (
    planned_visit_duration_minutes is null
    or planned_visit_duration_minutes in (60, 90)
  );

alter table if exists public.assignments
  add constraint assignments_extension_end_date_check
  check (
    extension_end_date is null
    or extension_end_date >= start_date
  );
```

### 1.3 Assignment services table

Create a join table so one assignment can hold multiple selected services.

Suggested SQL:

```sql
create table if not exists public.care_plan_services (
  id bigint generated by default as identity primary key,
  assignment_id bigint not null references public.assignments(id) on delete cascade,
  service_code text not null,
  service_name text not null,
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (assignment_id, service_code)
);

alter table if exists public.care_plan_services
  add constraint care_plan_services_code_check
  check (
    service_code in (
      'walking_companion',
      'conversation_emotional_support',
      'hospital_accompaniment',
      'medicine_pickup',
      'grocery_shopping_assistance',
      'technology_help',
      'monthly_family_updates'
    )
  );

create index if not exists idx_care_plan_services_assignment
  on public.care_plan_services (assignment_id);
```

### 1.4 Assignment status audit table

Create now, even if Sprint 2 will use it more heavily.

Suggested SQL:

```sql
create table if not exists public.assignment_lifecycle_audits (
  id bigint generated by default as identity primary key,
  assignment_id bigint not null references public.assignments(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_user_id bigint references public.users(id) on delete set null,
  notes text default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_assignment_lifecycle_audits_assignment_time
  on public.assignment_lifecycle_audits (assignment_id, created_at desc);
```

## 2. Backend contract changes

Primary file:
- `server.js`

### 2.1 Extend user creation payload

Current payload used by `POST /api/users`:
- `user_id`
- `name`
- `email`
- `phone`
- `address`
- `role`
- `password`

Add:
- `client_onboarding_type`

Rules:
- accept `client_onboarding_type` only when `role === 'client'`
- force `client_onboarding_type = null` for buddy rows
- default missing client type to `kin_requested` in Sprint 1

Minimal handler changes:
- validate `client_onboarding_type`
- pass `client_onboarding_type` into `ensureUser`
- insert/update `users.client_onboarding_type`
- include `client_onboarding_type` in `GET /api/users`

### 2.2 Extend assignment creation payload

Current payload used by `POST /api/assignments`:
- `buddy_id`
- `elderly_id`
- `term`

Replace with:
- `buddy_id`
- `elderly_id`
- `service_plan_type`
- `approval_state`
- `care_shift`
- `monthly_visit_plan`
- `planned_visit_duration_minutes`
- `service_for_client_id`
- `extension_end_date`
- `services: string[]`
- `admin_notes`

Sprint 1 creation rules:
- if `service_plan_type === 'short_term'`
  - require `monthly_visit_plan`
  - require `planned_visit_duration_minutes`
  - `care_shift` must be null
- if `service_plan_type === 'long_term'`
  - require `care_shift`
  - `monthly_visit_plan` must be null
  - `planned_visit_duration_minutes` should be null
- new records can still default `approval_state` to `approved` for backward compatibility in Sprint 1
- keep writing `term_type` for compatibility until Sprint 2 fully migrates reads

### 2.3 Assignment insert shape

Insert into `assignments` with:
- `buddy_id`
- `elderly_id`
- `status: 'active'`
- `term_type`
- `service_plan_type`
- `approval_state`
- `care_shift`
- `monthly_visit_plan`
- `planned_visit_duration_minutes`
- `service_for_client_id`
- `extension_end_date`
- `admin_notes`
- `created_by`

After assignment insert:
- write one row to `assignment_lifecycle_audits`
  - `from_status = null`
  - `to_status = approval_state`
  - `actor_user_id = req.session.user?.id`
- insert selected rows into `care_plan_services`
- keep starter visit creation only for `short_term` during Sprint 1
- do not auto-generate long-term daily records yet

### 2.4 Assignment reads

Update assignment select queries to return:
- `service_plan_type`
- `approval_state`
- `care_shift`
- `monthly_visit_plan`
- `planned_visit_duration_minutes`
- `service_for_client_id`
- `extension_end_date`
- `admin_notes`

If needed, attach service rows in a second query grouped by assignment id.

## 3. TypeScript model changes

Primary file:
- `src/App.tsx`

### 3.1 Role and shared types

Keep `Role` as-is.

Add:

```ts
type ClientType = 'self_service' | 'kin_requested';
type ServicePlanType = 'short_term' | 'long_term';
type ApprovalState = 'pending_approval' | 'approved' | 'rejected' | 'rescheduled';
type CareShift = 'morning_10h' | 'night_10h' | 'full_day';
type ServiceKey =
  | 'walking_companion'
  | 'conversation_emotional_support'
  | 'hospital_accompaniment'
  | 'medicine_pickup'
  | 'grocery_shopping_assistance'
  | 'technology_help'
  | 'monthly_family_updates';
```

### 3.2 User type delta

Current `User` type should gain:

```ts
client_onboarding_type?: ClientType | null;
```

Current `ApiUser` type should gain:

```ts
client_onboarding_type?: ClientType | null;
```

### 3.3 Assignment type delta

Current `Assignment` type should gain:

```ts
service_plan_type?: ServicePlanType | null;
approval_state?: ApprovalState | null;
care_shift?: CareShift | null;
monthly_visit_plan?: number | null;
planned_visit_duration_minutes?: number | null;
service_for_client_id?: number | null;
extension_end_date?: string | null;
services?: Array<{
  id?: number;
  service_code: ServiceKey;
  service_name: string;
  is_required?: boolean;
}>;
```

### 3.4 Create form delta

Current `initialCreateForm` should gain:

```ts
client_onboarding_type: 'kin_requested' as ClientType,
```

### 3.5 Assignment form delta

Replace current shape:

```ts
const initialAssignmentForm = {
  buddy_id: '',
  elderly_id: '',
  term: 'short' as 'short' | 'long',
};
```

With:

```ts
const initialAssignmentForm = {
  buddy_id: '',
  elderly_id: '',
  service_plan_type: 'short_term' as ServicePlanType,
  approval_state: 'approved' as ApprovalState,
  care_shift: '' as '' | CareShift,
  monthly_visit_plan: '3',
  planned_visit_duration_minutes: '60',
  service_for_client_id: '',
  extension_end_date: '',
  admin_notes: '',
  services: [] as ServiceKey[],
};
```

## 4. Minimal UI changes for Sprint 1

Primary file:
- `src/App.tsx`

Do not attempt the final workflow UI yet. Only add the smallest fields needed to create valid structured data.

### 4.1 Admin create-user form

Add one conditional field under Role:
- when role is `client`, show `Client type`
- options:
  - `Kin requested`
  - `Self service`

Minimal visible behavior:
- field hidden for buddy
- when role changes to buddy, clear `client_onboarding_type` in submit payload or ignore server-side

### 4.2 Admin create-assignment form

Replace `Term` field with `Assignment mode`:
- `Short term`
- `Long term`

Conditional short-term fields:
- `Visits per month`: `3`, `6`, `9`
- `Visit duration`: `60 min`, `90 min`
- `Services`: checkbox group with all supported service keys

Conditional long-term fields:
- `Service slot`
  - Morning 10 hours
  - Night 10 hours
  - Full day
- `Extended until` optional date input

Shared field:
- `Admin notes`

### 4.3 Assignment list minimal display change

In assignment rows/cards, add compact metadata display:
- assignment mode
- approval status
- short-term package summary or long-term slot summary

Example display:
- `Short term • 6 visits/month • 60 min`
- `Long term • morning 10h`

## 5. API payload examples

### 5.1 Create client user

```json
{
  "user_id": "client31",
  "name": "Client 31",
  "email": "",
  "phone": "9876543210",
  "address": "Chennai",
  "password": "1234567890",
  "role": "client",
  "client_onboarding_type": "kin_requested"
}
```

### 5.2 Create short-term assignment

```json
{
  "buddy_id": 12,
  "elderly_id": 44,
  "service_plan_type": "short_term",
  "approval_state": "approved",
  "monthly_visit_plan": 6,
  "planned_visit_duration_minutes": 60,
  "services": [
    "walking_companion",
    "technology_help",
    "monthly_family_updates"
  ],
  "admin_notes": "Start with evening preference"
}
```

### 5.3 Create long-term assignment

```json
{
  "buddy_id": 12,
  "elderly_id": 44,
  "service_plan_type": "long_term",
  "approval_state": "approved",
  "care_shift": "morning_10h",
  "extension_end_date": "2026-08-31",
  "services": [
    "conversation_emotional_support",
    "monthly_family_updates"
  ],
  "admin_notes": "Initial 30 day cycle"
}
```

## 6. Build sequence inside Sprint 1

1. Add migration file with all schema changes.
2. Update `supabase-schema.sql` to match the new source of truth.
3. Extend backend user queries and inserts for `client_onboarding_type`.
4. Extend backend assignment create/read flow for structured fields.
5. Extend `src/App.tsx` types.
6. Extend `initialCreateForm` and `initialAssignmentForm`.
7. Add minimal admin UI fields.
8. Run build and smoke test:
   - create client with client type
   - create short-term assignment
   - create long-term assignment
   - confirm assignment list renders new metadata

## 7. Validation checklist

### Schema validation
- [ ] existing users remain readable
- [ ] existing assignments backfill to `service_plan_type`
- [ ] existing assignments backfill to `approval_state = approved`
- [ ] new constraints allow current live rows

### Backend validation
- [ ] `GET /api/users` includes `client_onboarding_type`
- [ ] `POST /api/users` accepts client onboarding type only for clients
- [ ] `POST /api/assignments` accepts short-term fields
- [ ] `POST /api/assignments` accepts long-term fields
- [ ] assignment services rows are created successfully

### Frontend validation
- [ ] create-user form shows client type only for client role
- [ ] create-assignment form switches fields by assignment mode
- [ ] no crash when older assignments lack new fields
- [ ] assignment summary renders for both modes

## 8. Out of scope for Sprint 1

Do not implement yet:
- client approval actions
- map visibility rules
- visit session intime/outtime enforcement
- daily record entry/exit flow
- reminder scheduler
- calendar UI
- monthly differences analytics

Those depend on Sprint 1 structure being stable first.

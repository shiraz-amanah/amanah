// employeePermissions.js
// ============================================================================
// RBAC permission model — the single source of truth for the permissions JSONB
// shape stored on public.mosque_employees (migration 125), the 5 preset role
// starting points, and the module metadata that drives the toggle matrix UI
// (EmployeeManagement.jsx) and the permission gates (useEmployeePermissions.js).
//
// PERMISSION VALUE TYPES
//   scope modules → "own" | "all" | false
//       "own"  = the employee's own assigned classes only (uses assigned_classes[])
//       "all"  = all of the mosque's classes
//       false  = no access
//   bool modules  → true | false   (module isn't class-scoped)
//
// The DB stores role_preset as a label/starting-point only; this JSONB is the
// source of truth. Once any individual toggle diverges from its preset the
// effective role is "custom" (see detectPreset).
//
// Adding a future module = add one entry to MODULES + a key to each preset here.
// No migration needed — the column is jsonb.
// ============================================================================

// Ordered module metadata. `type` drives the control:
//   'scope' → 3-way segmented control (Own classes · All classes · No access)
//   'bool'  → on/off toggle switch
export const MODULES = [
  { key: 'classes',             label: 'Classes',             type: 'scope', hint: 'Register, timetable and class management' },
  { key: 'students',            label: 'Students',            type: 'scope', hint: 'Student records and profiles' },
  { key: 'attendance',          label: 'Attendance',          type: 'scope', hint: 'Take and view registers' },
  { key: 'hifz',                label: 'Hifz & progress',     type: 'scope', hint: 'Memorisation tracking and progress' },
  { key: 'homework',            label: 'Homework',            type: 'scope', hint: 'Set and mark homework' },
  { key: 'pastoral',            label: 'Pastoral & rewards',  type: 'scope', hint: 'Behaviour notes and rewards' },
  { key: 'reports',             label: 'Reports',             type: 'scope', hint: 'Termly progress reports' },
  { key: 'finance',             label: 'Finance & payments',  type: 'bool',  hint: 'Fees, payments and Stripe' },
  { key: 'waiting_list',        label: 'Waiting list',        type: 'bool',  hint: 'Applications and waiting list' },
  { key: 'messages',            label: 'Messages',            type: 'scope', hint: 'Message parents' },
  { key: 'mosque_settings',     label: 'Mosque settings',     type: 'bool',  hint: 'Profile, prayer times, configuration' },
  { key: 'employee_management', label: 'Employee management', type: 'bool',  hint: 'Invite and manage staff permissions' },
  { key: 'analytics',           label: 'Analytics',           type: 'bool',  hint: 'Dashboards and insights' },
]

export const MODULE_KEYS = MODULES.map((m) => m.key)

// Every-key-false baseline — the "custom from scratch" / no-access starting point.
export const EMPTY_PERMISSIONS = MODULE_KEYS.reduce((acc, key) => {
  acc[key] = false
  return acc
}, {})

// Preset role permission shapes (verbatim from the locked Session RBAC spec).
export const PRESET_ROLES = {
  coordinator: {
    classes: 'all', students: 'all', attendance: 'all',
    hifz: 'all', homework: 'all', pastoral: 'all',
    reports: 'all', finance: false, waiting_list: true,
    messages: 'all', mosque_settings: false,
    employee_management: false, analytics: true,
  },
  teacher: {
    classes: 'own', students: 'own', attendance: 'own',
    hifz: 'own', homework: 'own', pastoral: 'own',
    reports: 'own', finance: false, waiting_list: false,
    messages: 'own', mosque_settings: false,
    employee_management: false, analytics: false,
  },
  treasurer: {
    classes: false, students: false, attendance: false,
    hifz: false, homework: false, pastoral: false,
    reports: false, finance: true, waiting_list: false,
    messages: false, mosque_settings: false,
    employee_management: false, analytics: true,
  },
  receptionist: {
    classes: false, students: 'all', attendance: false,
    hifz: false, homework: false, pastoral: false,
    reports: false, finance: false, waiting_list: true,
    messages: 'all', mosque_settings: false,
    employee_management: false, analytics: false,
  },
  viewer: {
    classes: 'all', students: 'all', attendance: 'all',
    hifz: 'all', homework: 'all', pastoral: false,
    reports: 'all', finance: false, waiting_list: true,
    messages: false, mosque_settings: false,
    employee_management: false, analytics: true,
  },
}

// Ordered preset cards for the invite selector (label + 2-line description).
export const ROLE_PRESET_META = [
  {
    key: 'coordinator',
    label: 'Coordinator',
    description: 'Runs the whole madrasah — all classes, students, attendance, reports and messages. No finance or settings.',
  },
  {
    key: 'teacher',
    label: 'Teacher',
    description: 'Their own assigned classes only — register, hifz, homework, pastoral and parent messages.',
  },
  {
    key: 'treasurer',
    label: 'Treasurer',
    description: 'Fees and payments only, plus analytics. No class or student access.',
  },
  {
    key: 'receptionist',
    label: 'Receptionist',
    description: 'Front desk — student records, waiting list and all messages. No class or finance access.',
  },
  {
    key: 'viewer',
    label: 'Viewer',
    description: 'Read-only across classes, students, attendance and reports. Cannot message or edit.',
  },
]

// Human labels for role_preset values (includes 'custom').
export const ROLE_LABELS = {
  coordinator: 'Coordinator',
  teacher: 'Teacher',
  treasurer: 'Treasurer',
  receptionist: 'Receptionist',
  viewer: 'Viewer',
  custom: 'Custom',
}

// Returns a fresh copy of the JSONB shape for a preset. Unknown/custom → all-false
// baseline (a clean slate the owner then customises).
export function getDefaultPermissions(rolePreset) {
  const preset = PRESET_ROLES[rolePreset]
  return preset ? { ...preset } : { ...EMPTY_PERMISSIONS }
}

// True if `permissions` exactly matches the named preset's shape.
export function permissionsMatchPreset(permissions, presetKey) {
  const preset = PRESET_ROLES[presetKey]
  if (!preset || !permissions) return false
  return MODULE_KEYS.every((key) => (permissions[key] ?? false) === preset[key])
}

// Which preset (if any) a permissions object matches; 'custom' otherwise.
export function detectPreset(permissions) {
  const match = ROLE_PRESET_META.find((r) => permissionsMatchPreset(permissions, r.key))
  return match ? match.key : 'custom'
}

// Does a permissions object grant ANY access to a module?
//   scope: 'own' | 'all' are truthy; false is not
//   bool:  true is truthy; false is not
export function hasModuleAccess(permissions, moduleKey) {
  return Boolean(permissions?.[moduleKey])
}

// Scope of a scope-module: 'own' | 'all' | false. Bool modules return the raw value.
export function moduleScope(permissions, moduleKey) {
  return permissions?.[moduleKey] ?? false
}

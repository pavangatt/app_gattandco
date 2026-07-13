import { describe, it, expect } from 'vitest';
import {
  throwIfError,
  normalizePhone,
  normalizeUserId,
  normalizeClientOnboardingType,
  normalizeServicePlanType,
  normalizeApprovalState,
  normalizeCareShift,
  normalizeIntegerValue,
  normalizeDateOnly,
  normalizeServiceCodes,
  getServiceName,
  getLegacyTermType,
  mapApprovalStateToAssignmentStatus,
  normalizeAssignmentStatus,
  normalizeRequestStatus,
  normalizeRequestStatusForRead,
  getArchiveMonthRange,
  getMonthRange,
  parseOptionalPositiveInt,
  buildDateStringsForMonth,
  getOverlappingDaysInMonth,
  getReminderTemplatePreview,
} from '../lib/serverUtils.js';

describe('throwIfError', () => {
  it('does nothing when error is falsy', () => {
    expect(() => throwIfError(null, 'ctx')).not.toThrow();
    expect(() => throwIfError(undefined, 'ctx')).not.toThrow();
  });

  it('throws a prefixed message when an error is present', () => {
    expect(() => throwIfError({ message: 'boom' }, 'Unable to load')).toThrow('Unable to load: boom');
  });
});

describe('normalizePhone', () => {
  it('strips all non-digit characters', () => {
    expect(normalizePhone('+1 (555) 123-4567')).toBe('15551234567');
  });

  it('returns empty string for nullish input', () => {
    expect(normalizePhone(null)).toBe('');
    expect(normalizePhone(undefined)).toBe('');
    expect(normalizePhone('')).toBe('');
  });

  it('coerces numeric input', () => {
    expect(normalizePhone(5551234)).toBe('5551234');
  });
});

describe('normalizeUserId', () => {
  it('lowercases and replaces invalid runs with a single underscore', () => {
    expect(normalizeUserId('John Doe!')).toBe('john_doe');
    expect(normalizeUserId('  Foo   Bar  ')).toBe('foo_bar');
  });

  it('trims leading and trailing underscores', () => {
    expect(normalizeUserId('__hello__')).toBe('hello');
  });

  it('preserves existing underscores and digits', () => {
    expect(normalizeUserId('abc_123')).toBe('abc_123');
  });

  it('falls back to "user" when result would be empty', () => {
    expect(normalizeUserId('!!!')).toBe('user');
    expect(normalizeUserId('')).toBe('user');
    expect(normalizeUserId(null)).toBe('user');
  });
});

describe('normalizeClientOnboardingType', () => {
  it('returns null for non-client roles', () => {
    expect(normalizeClientOnboardingType('self_service', 'buddy')).toBeNull();
    expect(normalizeClientOnboardingType('kin_requested', 'admin')).toBeNull();
  });

  it('defaults to kin_requested for clients when value is empty', () => {
    expect(normalizeClientOnboardingType('', 'client')).toBe('kin_requested');
    expect(normalizeClientOnboardingType(null, 'client')).toBe('kin_requested');
  });

  it('accepts and normalizes valid values', () => {
    expect(normalizeClientOnboardingType('  SELF_SERVICE ', 'client')).toBe('self_service');
  });

  it('throws on unsupported value', () => {
    expect(() => normalizeClientOnboardingType('bogus', 'client')).toThrow(/self_service or kin_requested/);
  });
});

describe('normalizeServicePlanType', () => {
  it('returns a recognized plan type directly', () => {
    expect(normalizeServicePlanType('short_term')).toBe('short_term');
    expect(normalizeServicePlanType('LONG_TERM')).toBe('long_term');
  });

  it('maps fallback term type when value is unrecognized', () => {
    expect(normalizeServicePlanType('', 'long')).toBe('long_term');
    expect(normalizeServicePlanType('nope', 'short')).toBe('short_term');
    expect(normalizeServicePlanType(null)).toBe('short_term');
    expect(normalizeServicePlanType('bogus', '')).toBe('short_term');
  });
});

describe('normalizeApprovalState', () => {
  it('defaults to pending_approval', () => {
    expect(normalizeApprovalState('')).toBe('pending_approval');
    expect(normalizeApprovalState(null)).toBe('pending_approval');
  });

  it('normalizes valid states', () => {
    expect(normalizeApprovalState(' Approved ')).toBe('approved');
  });

  it('throws on invalid state', () => {
    expect(() => normalizeApprovalState('maybe')).toThrow();
  });
});

describe('normalizeCareShift', () => {
  it('returns null when empty', () => {
    expect(normalizeCareShift('')).toBeNull();
    expect(normalizeCareShift(null)).toBeNull();
  });

  it('normalizes valid shifts', () => {
    expect(normalizeCareShift(' FULL_DAY ')).toBe('full_day');
  });

  it('throws on invalid shift', () => {
    expect(() => normalizeCareShift('afternoon')).toThrow(/morning_10h/);
  });
});

describe('normalizeIntegerValue', () => {
  it('returns null for empty inputs', () => {
    expect(normalizeIntegerValue(null)).toBeNull();
    expect(normalizeIntegerValue(undefined)).toBeNull();
    expect(normalizeIntegerValue('')).toBeNull();
  });

  it('parses finite numbers', () => {
    expect(normalizeIntegerValue('42')).toBe(42);
    expect(normalizeIntegerValue(3.5)).toBe(3.5);
    expect(normalizeIntegerValue(0)).toBe(0);
  });

  it('returns null for non-numeric values', () => {
    expect(normalizeIntegerValue('abc')).toBeNull();
  });
});

describe('normalizeDateOnly', () => {
  it('returns fallback for empty input', () => {
    expect(normalizeDateOnly('', '2020-01-01')).toBe('2020-01-01');
    expect(normalizeDateOnly(null)).toBeNull();
    expect(normalizeDateOnly('   ')).toBeNull();
  });

  it('accepts a valid YYYY-MM-DD value (trimmed)', () => {
    expect(normalizeDateOnly(' 2026-07-13 ')).toBe('2026-07-13');
  });

  it('throws on malformed dates', () => {
    expect(() => normalizeDateOnly('2026/07/13')).toThrow(/YYYY-MM-DD/);
    expect(() => normalizeDateOnly('13-07-2026')).toThrow();
  });
});

describe('normalizeServiceCodes', () => {
  it('returns [] for non-arrays', () => {
    expect(normalizeServiceCodes(null)).toEqual([]);
    expect(normalizeServiceCodes('walking_companion')).toEqual([]);
  });

  it('normalizes, skips blanks, and dedupes', () => {
    expect(
      normalizeServiceCodes([' Walking_Companion ', '', 'technology_help', 'walking_companion']),
    ).toEqual(['walking_companion', 'technology_help']);
  });

  it('throws on unsupported codes', () => {
    expect(() => normalizeServiceCodes(['flying_lessons'])).toThrow(/Unsupported service code: flying_lessons/);
  });
});

describe('getServiceName', () => {
  it('maps known codes to human names', () => {
    expect(getServiceName('medicine_pickup')).toBe('Medicine pickup');
  });

  it('echoes unknown codes', () => {
    expect(getServiceName('unknown_code')).toBe('unknown_code');
  });
});

describe('getLegacyTermType', () => {
  it('maps long_term to long, everything else to short', () => {
    expect(getLegacyTermType('long_term')).toBe('long');
    expect(getLegacyTermType('short_term')).toBe('short');
    expect(getLegacyTermType(undefined)).toBe('short');
  });
});

describe('mapApprovalStateToAssignmentStatus', () => {
  it('maps approved to active, otherwise paused', () => {
    expect(mapApprovalStateToAssignmentStatus('approved')).toBe('active');
    expect(mapApprovalStateToAssignmentStatus('pending_approval')).toBe('paused');
    expect(mapApprovalStateToAssignmentStatus('rejected')).toBe('paused');
  });
});

describe('normalizeAssignmentStatus', () => {
  it('normalizes valid statuses', () => {
    expect(normalizeAssignmentStatus(' Completed ')).toBe('completed');
  });

  it('throws on invalid status', () => {
    expect(() => normalizeAssignmentStatus('archived')).toThrow();
    expect(() => normalizeAssignmentStatus('')).toThrow();
  });
});

describe('normalizeRequestStatus', () => {
  it('normalizes valid statuses', () => {
    expect(normalizeRequestStatus(' RESOLVED ')).toBe('resolved');
  });

  it('throws on invalid status', () => {
    expect(() => normalizeRequestStatus('pending')).toThrow();
  });
});

describe('normalizeRequestStatusForRead', () => {
  it('maps legacy aliases', () => {
    expect(normalizeRequestStatusForRead('open')).toBe('new');
    expect(normalizeRequestStatusForRead('in_progress')).toBe('viewed');
  });

  it('defaults empty to new', () => {
    expect(normalizeRequestStatusForRead('')).toBe('new');
    expect(normalizeRequestStatusForRead(null)).toBe('new');
  });

  it('passes through other values normalized', () => {
    expect(normalizeRequestStatusForRead(' Closed ')).toBe('closed');
  });
});

describe('getArchiveMonthRange', () => {
  it('computes the UTC range for a month', () => {
    expect(getArchiveMonthRange('2026-02')).toEqual({
      startIso: '2026-02-01T00:00:00.000Z',
      endIso: '2026-03-01T00:00:00.000Z',
      startDate: '2026-02-01',
      endDate: '2026-03-01',
    });
  });

  it('throws on malformed month', () => {
    expect(() => getArchiveMonthRange('2026-13')).toThrow(/YYYY-MM/);
    expect(() => getArchiveMonthRange('')).toThrow();
  });
});

describe('getMonthRange', () => {
  it('computes range details for a 31-day month', () => {
    const range = getMonthRange('2026-01');
    expect(range).toMatchObject({
      month: '2026-01',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      startIso: '2026-01-01T00:00:00.000Z',
      endExclusiveIso: '2026-02-01T00:00:00.000Z',
      daysInMonth: 31,
    });
    // 2026-01-01 is a Thursday (UTC day 4)
    expect(range.firstWeekdayUtc).toBe(4);
  });

  it('handles February in a leap year', () => {
    const range = getMonthRange('2024-02');
    expect(range.daysInMonth).toBe(29);
    expect(range.endDate).toBe('2024-02-29');
  });

  it('throws on malformed month', () => {
    expect(() => getMonthRange('2026-1')).toThrow(/YYYY-MM/);
    expect(() => getMonthRange('2026-00')).toThrow();
    expect(() => getMonthRange('2026-13')).toThrow();
    expect(() => getMonthRange('')).toThrow();
    expect(() => getMonthRange(null)).toThrow();
  });
});

describe('parseOptionalPositiveInt', () => {
  it('returns null for empty input', () => {
    expect(parseOptionalPositiveInt('')).toBeNull();
    expect(parseOptionalPositiveInt(null)).toBeNull();
    expect(parseOptionalPositiveInt(undefined)).toBeNull();
  });

  it('floors valid positive numbers', () => {
    expect(parseOptionalPositiveInt('5')).toBe(5);
    expect(parseOptionalPositiveInt(7.9)).toBe(7);
  });

  it('throws on non-positive or non-numeric', () => {
    expect(() => parseOptionalPositiveInt('0')).toThrow(/positive/);
    expect(() => parseOptionalPositiveInt('-3')).toThrow();
    expect(() => parseOptionalPositiveInt('abc')).toThrow();
  });
});

describe('buildDateStringsForMonth', () => {
  it('builds a zero-padded date string for each day', () => {
    const result = buildDateStringsForMonth({ month: '2026-03', daysInMonth: 3 });
    expect(result).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']);
  });

  it('produces the full set of days for a real month', () => {
    const range = getMonthRange('2026-04');
    const result = buildDateStringsForMonth(range);
    expect(result).toHaveLength(30);
    expect(result[0]).toBe('2026-04-01');
    expect(result.at(-1)).toBe('2026-04-30');
  });
});

describe('getOverlappingDaysInMonth', () => {
  const march = getMonthRange('2026-03');

  it('counts a full month when the assignment spans it', () => {
    expect(getOverlappingDaysInMonth('2026-01-01', '2026-12-31', march)).toBe(31);
  });

  it('defaults to full month bounds when dates are blank', () => {
    expect(getOverlappingDaysInMonth('', '', march)).toBe(31);
  });

  it('clips to the overlapping window', () => {
    expect(getOverlappingDaysInMonth('2026-03-10', '2026-03-15', march)).toBe(6);
  });

  it('returns 0 when there is no overlap', () => {
    expect(getOverlappingDaysInMonth('2026-05-01', '2026-05-31', march)).toBe(0);
  });

  it('returns 0 when bounds are not parseable dates', () => {
    const bogusRange = { startDate: 'aaaa', endDate: 'zzzz' };
    expect(getOverlappingDaysInMonth('bbbb', 'yyyy', bogusRange)).toBe(0);
  });
});

describe('getReminderTemplatePreview', () => {
  it('returns previews for known template keys', () => {
    expect(getReminderTemplatePreview('visit_reminder_d1')).toContain('{buddy_name}');
    expect(getReminderTemplatePreview('backfilled_visit_notice')).toContain('Backfilled');
    expect(getReminderTemplatePreview('family_monthly_update')).toContain('{month_label}');
  });

  it('returns empty string for unknown keys', () => {
    expect(getReminderTemplatePreview('nope')).toBe('');
  });
});

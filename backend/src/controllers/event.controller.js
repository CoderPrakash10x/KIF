const { parsePage, parseLimit } = require('../utils/pagination');
const eventService = require('../services/event.service');

// ---- Event CRUD (Admin) ----
exports.create = async (req, res, next) => {
  try {
    const event = await eventService.createEvent(req.body, req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.status(201).json({ success: true, message: 'Event created', data: event });
  } catch (err) { next(err); }
};

exports.publish = async (req, res, next) => {
  try {
    const event = await eventService.publishDraftEvent(req.params.id, req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, message: 'Event published', data: event });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const event = await eventService.updateEvent(req.params.id, req.body, req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, message: 'Event updated', data: event });
  } catch (err) { next(err); }
};

exports.cancel = async (req, res, next) => {
  try {
    const event = await eventService.cancelEvent(req.params.id, req.user, req.body.reason, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, message: 'Event cancelled', data: event });
  } catch (err) { next(err); }
};

exports.markCompleted = async (req, res, next) => {
  try {
    const event = await eventService.markCompleted(req.params.id, req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, message: 'Event marked completed', data: event });
  } catch (err) { next(err); }
};

const { EventRegistration } = require('../models');
const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];
const MEMBER_VISIBLE = ['PUBLISHED', 'ONGOING', 'COMPLETED'];

// Adds registeredCount (+ the caller's own registration) so lists need no extra round-trips.
async function decorate(events, userId) {
  const ids = events.map((e) => e._id);
  const [counts, mine] = await Promise.all([
    EventRegistration.aggregate([
      { $match: { eventId: { $in: ids }, status: 'REGISTERED' } },
      { $group: { _id: '$eventId', count: { $sum: 1 } } },
    ]),
    EventRegistration.find({ eventId: { $in: ids }, userId }).select('eventId status attendanceStatus').lean(),
  ]);
  const countOf = new Map(counts.map((c) => [String(c._id), c.count]));
  const mineOf = new Map(mine.map((m) => [String(m.eventId), m]));
  return events.map((e) => {
    const o = e.toObject ? e.toObject() : e;
    const reg = mineOf.get(String(o._id));
    return { ...o, registeredCount: countOf.get(String(o._id)) || 0, myRegistration: reg ? { status: reg.status, attendanceStatus: reg.attendanceStatus } : null };
  });
}

exports.list = async (req, res, next) => {
  try {
    const { status, upcoming, page, limit } = req.query;
    const isAdmin = ADMIN_ROLES.includes(req.user.role);
    // Members never see DRAFT / CANCELLED events, whatever they ask for.
    if (!isAdmin && status && !MEMBER_VISIBLE.includes(status)) {
      return res.json({ success: true, data: [], pagination: { page: 1, limit: 0, total: 0, totalPages: 0 } });
    }
    const result = await eventService.listEvents({
      status, upcoming: upcoming === 'true' || upcoming === true, page: parsePage(page), limit: parseLimit(limit, 20),
      visibleStatuses: isAdmin ? undefined : MEMBER_VISIBLE,
    });
    res.json({ success: true, ...result, data: await decorate(result.data, req.user._id) });
  } catch (err) { next(err); }
};

exports.getById = async (req, res, next) => {
  try {
    const event = await eventService.getEventById(req.params.id);
    if (!ADMIN_ROLES.includes(req.user.role) && !MEMBER_VISIBLE.includes(event.status)) {
      return res.status(404).json({ success: false, message: 'Event not found', code: 'NOT_FOUND' });
    }
    const [decorated] = await decorate([event], req.user._id);
    res.json({ success: true, data: decorated });
  } catch (err) { next(err); }
};

// Founder/Intern proposes an event: create a DRAFT event + an EVENT request for Admin approval.
exports.propose = async (req, res, next) => {
  const requestService = require('../services/request.service');
  const { Event } = require('../models');
  let draft;
  try {
    const { purpose, ...payload } = req.body;
    draft = await eventService.createEvent({ ...payload, publishImmediately: false, capacity: payload.capacity || 0 }, req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
    const request = await requestService.createRequest(
      { type: 'EVENT', resourceId: draft._id, purpose: purpose || payload.description },
      { user: req.user, ip: req.ip, userAgent: req.headers['user-agent'] },
    );
    res.status(201).json({ success: true, message: 'Event proposal sent for approval', data: { event: draft, request } });
  } catch (err) {
    if (draft) await Event.deleteOne({ _id: draft._id, status: 'DRAFT' }).catch(() => {});
    next(err);
  }
};

// ---- Registration / RSVP ----
exports.register = async (req, res, next) => {
  try {
    const registration = await eventService.registerForEvent(req.params.id, req.user, {
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    res.status(201).json({ success: true, message: 'Registered successfully', data: registration });
  } catch (err) { next(err); }
};

exports.cancelMyRegistration = async (req, res, next) => {
  try {
    const registration = await eventService.cancelRegistration(req.params.id, req.user, {
      ip: req.ip, userAgent: req.headers['user-agent'],
    });
    res.json({ success: true, message: 'Registration cancelled', data: registration });
  } catch (err) { next(err); }
};

exports.myRegistrations = async (req, res, next) => {
  try {
    const { status, page, limit } = req.query;
    const result = await eventService.listMyRegistrations(req.user._id, { status, page: parsePage(page), limit: parseLimit(limit, 20) });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

exports.listRegistrations = async (req, res, next) => {
  try {
    const { status, page, limit } = req.query;
    const result = await eventService.listEventRegistrations(req.params.id, { status, page: parsePage(page), limit: parseLimit(limit, 50) });
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
};

// ---- Attendance ----
exports.markAttendance = async (req, res, next) => {
  try {
    const registration = await eventService.markAttendance(req.params.registrationId, req.body.status, req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, message: 'Attendance marked', data: registration });
  } catch (err) { next(err); }
};

exports.bulkMarkAttendance = async (req, res, next) => {
  try {
    const result = await eventService.bulkMarkAttendance(req.body.entries, req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, message: 'Bulk attendance processed', data: result });
  } catch (err) { next(err); }
};

// ---- Certificates ----
exports.generateCertificates = async (req, res, next) => {
  try {
    const result = await eventService.generateCertificatesForEvent(req.params.id, req.user, { ip: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ success: true, message: 'Certificate generation processed', data: result });
  } catch (err) { next(err); }
};
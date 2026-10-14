const router = require('express').Router();
const QRCode = require('qrcode');
const { Hardware, Room } = require('../models');
const ApiError = require('../utils/ApiError');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/role');
const { ROLES } = require('../constants/enums');

// QR support (spec 6): printable codes for assets and rooms + a resolver for scanned codes.
//   Hardware: KIF:HW:<assetTag | id>      Room: KIF:ROOM:<id>
router.use(authenticate, authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN));

const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };

router.get('/resolve', wrap(async (req, res) => {
  const code = String(req.query.code || '').trim().slice(0, 120);
  const m = code.match(/^KIF:(HW|ROOM):(.+)$/i);
  const raw = m ? m[2] : code; // plain asset tags typed or scanned by a handheld reader also work
  const kind = m ? m[1].toUpperCase() : 'HW';
  if (kind === 'ROOM') {
    const room = /^[a-f\d]{24}$/i.test(raw) ? await Room.findOne({ _id: raw, active: true }) : null;
    if (!room) throw new ApiError(404, 'No room matches that code', 'NOT_FOUND');
    return res.json({ success: true, data: { type: 'ROOM', item: room } });
  }
  const hw = await Hardware.findOne({
    active: true,
    $or: [{ assetTag: new RegExp(`^${raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }, ...(/^[a-f\d]{24}$/i.test(raw) ? [{ _id: raw }] : [])],
  });
  if (!hw) throw new ApiError(404, 'No asset matches that code', 'NOT_FOUND');
  res.json({ success: true, data: { type: 'HARDWARE', item: hw } });
}));

router.get('/:type/:id', wrap(async (req, res) => {
  const { type, id } = req.params;
  let payload;
  let label;
  if (type === 'hardware') {
    const hw = await Hardware.findById(id).select('assetTag itemName');
    if (!hw) throw new ApiError(404, 'Asset not found', 'NOT_FOUND');
    payload = `KIF:HW:${hw.assetTag || hw._id}`; label = hw.itemName;
  } else if (type === 'room') {
    const room = await Room.findById(id).select('roomName');
    if (!room) throw new ApiError(404, 'Room not found', 'NOT_FOUND');
    payload = `KIF:ROOM:${room._id}`; label = room.roomName;
  } else throw new ApiError(404, 'Unknown QR type', 'NOT_FOUND');
  const dataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 320, errorCorrectionLevel: 'M' });
  res.json({ success: true, data: { dataUrl, code: payload, label } });
}));

module.exports = router;

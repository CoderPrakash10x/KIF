/* eslint-disable no-console */
// Usage:
//   npm run seed        -> creates the Super Admin only (idempotent)
//   npm run seed:demo   -> also creates demo users, cabins, hardware, rooms, consumables and events
//
// Credentials come from the environment (never hard-coded in the UI):
//   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME, SEED_DEMO_PASSWORD
require('dotenv').config();
const mongoose = require('mongoose');
const {
  User, Cabin, Hardware, Room, Consumable, Event, StockTransaction,
} = require('../src/models');

const isProd = process.env.NODE_ENV === 'production';
const demo = process.argv.includes('--demo');

const adminEmail = process.env.SEED_ADMIN_EMAIL || (isProd ? null : 'admin@kif-rms.com');
const adminPassword = process.env.SEED_ADMIN_PASSWORD || (isProd ? null : 'Admin@12345');
const demoPassword = process.env.SEED_DEMO_PASSWORD || 'Demo@12345';

const day = (n) => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + n); return d; };

async function upsertUser({ name, email, role, password, department, startupName, contact }) {
  let user = await User.findOne({ email });
  if (user) return { user, created: false };
  user = new User({ name, email, role, department, startupName, contact, status: 'ACTIVE', emailVerified: true, approvalStatus: 'APPROVED' });
  user.password = password;
  await user.save();
  return { user, created: true };
}

async function main() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set');
  if (!adminEmail || !adminPassword) throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (required in production)');
  await mongoose.connect(process.env.MONGO_URI);

  const sa = await upsertUser({
    name: process.env.SEED_ADMIN_NAME || 'Super Admin', email: adminEmail.toLowerCase(), role: 'SUPER_ADMIN', password: adminPassword,
  });
  console.log(`${sa.created ? 'Created' : 'Exists '} SUPER_ADMIN  ${adminEmail}`);

  if (demo) {
    if (isProd) throw new Error('Refusing to seed demo data in production');
    const people = [
      { name: 'Rohit Verma', email: 'admin.demo@kif-rms.com', role: 'ADMIN', department: 'Operations' },
      { name: 'Meera Iyer', email: 'founder.demo@kif-rms.com', role: 'FOUNDER', startupName: 'NeuroLeaf', department: 'AI Diagnostics' },
      { name: 'Kabir Singh', email: 'intern.demo@kif-rms.com', role: 'INTERN', department: 'Robotics' },
      { name: 'Isha Gupta', email: 'student.demo@kif-rms.com', role: 'STUDENT', department: 'B.Tech CSE' },
      { name: 'Priya Sharma', email: 'priya.demo@kif-rms.com', role: 'STUDENT', department: 'B.Tech ECE' },
      { name: 'Vikram Nair', email: 'vikram.demo@kif-rms.com', role: 'FOUNDER', startupName: 'AgriSense', department: 'AgriTech' },
    ];
    for (const p of people) {
      const r = await upsertUser({ ...p, password: demoPassword });
      console.log(`${r.created ? 'Created' : 'Exists '} ${p.role.padEnd(11)} ${p.email}`);
    }

    if (!(await Cabin.countDocuments())) {
      await Cabin.insertMany(Array.from({ length: 10 }, (_, i) => ({
        cabinNumber: `C-${101 + i}`, name: `Cabin ${101 + i}`, type: i === 9 ? 'CO_WORKING_DESK' : 'CABIN',
        capacity: [4, 6, 4, 3, 4, 6, 2, 8, 4, 12][i], location: i < 5 ? 'Ground floor' : 'First floor',
        facilities: ['Wi-Fi', 'Whiteboard'],
      })));
      console.log('Created 10 cabins');
    }
    if (!(await Hardware.countDocuments())) {
      const rows = [
        ['Dell Latitude 5440', 'Laptop', 'ASSET_BASED', 1], ['MacBook Air M2', 'Laptop', 'ASSET_BASED', 1],
        ['Raspberry Pi 5 (8 GB)', 'Microcontroller', 'QUANTITY_BASED', 6], ['Arduino Uno R3 Kit', 'Microcontroller', 'QUANTITY_BASED', 10],
        ['ESP32 DevKit', 'Microcontroller', 'QUANTITY_BASED', 12], ['Meta Quest 3', 'VR', 'ASSET_BASED', 1],
        ['Canon EOS R50', 'Camera', 'ASSET_BASED', 1], ['Shure SM7B Microphone', 'Audio', 'ASSET_BASED', 1],
        ['Creality Ender-3 V3', '3D Printer', 'ASSET_BASED', 1], ['Rigol DS1054Z Oscilloscope', 'Test Equipment', 'ASSET_BASED', 1],
      ];
      await Hardware.insertMany(rows.map(([itemName, category, type, qty], i) => ({
        itemName, category, type, totalQuantity: qty, availableQuantity: qty,
        assetTag: type === 'ASSET_BASED' ? `KIF-HW-${String(i + 1).padStart(4, '0')}` : undefined, location: 'Store room',
      })));
      console.log('Created 10 hardware items');
    }
    {
      // Idempotent: never duplicates a room and never overwrites an existing one or its assignment.
      const wanted = [
        { roomName: 'AI / Neural Lab', type: 'AI_NEURAL_LAB', capacity: 12, location: 'First floor, East wing', equipmentList: [{ name: 'GPU workstation' }, { name: '4K display' }, { name: 'Projector' }] },
        { roomName: 'Podcast Room', type: 'PODCAST_ROOM', capacity: 4, location: 'Ground floor, Media corner', equipmentList: [{ name: 'Shure SM7B microphones' }, { name: 'Audio interface' }, { name: 'Camera' }] },
        // New rooms: capacity/location are NOT invented; confirm them in Rooms > Manage room.
        { roomName: 'Co-working Space', type: 'CO_WORKING_SPACE' },
        { roomName: 'Conference Room', type: 'CONFERENCE_ROOM' },
        { roomName: 'Fabrication Lab', type: 'FABRICATION_LAB' },
        { roomName: '3D Maker Lab', type: 'MAKER_LAB_3D' },
      ];
      let added = 0;
      for (const r of wanted) {
        if (!(await Room.findOne({ $or: [{ type: r.type }, { roomName: r.roomName }] }))) { await Room.create(r); added += 1; }
      }
      console.log(`Rooms: ${added} created, ${wanted.length - added} already present`);
    }
    if (!(await Consumable.countDocuments())) {
      const items = [
        ['PLA Filament 1.75mm', '3D Printing', 'spools', 8, 4], ['Solder Wire 0.8mm', 'Electronics', 'rolls', 3, 4],
        ['A4 Paper', 'Office', 'reams', 12, 5], ['Isopropyl Alcohol 500 ml', 'Lab Materials', 'bottles', 5, 4],
        ['Jumper Wires (M-M)', 'Electronics', 'packs', 40, 15], ['Printer Toner', 'Office', 'cartridges', 1, 2],
      ];
      const created = await Consumable.insertMany(items.map(([itemName, category, unit, currentQuantity, lowStockThreshold]) => ({
        itemName, category, unit, currentQuantity, lowStockThreshold, location: 'Admin store',
      })));
      const admin = sa.user;
      await StockTransaction.insertMany(created.map((c) => ({
        consumableId: c._id, type: 'STOCK_IN', quantity: c.currentQuantity, previousQuantity: 0,
        newQuantity: c.currentQuantity, performedBy: admin._id, reason: 'Opening stock',
      })));
      console.log('Created 6 consumables');
    }
    if (!(await Event.countDocuments())) {
      await Event.insertMany([
        { title: 'AI Workshop: Prompt Engineering 101', description: 'Hands-on session on reliable prompting. Bring a laptop.', venue: 'Main Atrium', date: day(3), startTime: '15:00', endTime: '17:00', capacity: 40, status: 'PUBLISHED', createdBy: sa.user._id },
        { title: 'Founder Fireside with Investors', description: 'Open conversation on fundraising in 2026.', venue: 'Conference Room B', date: day(6), startTime: '17:00', endTime: '18:30', capacity: 0, status: 'PUBLISHED', createdBy: sa.user._id },
        { title: 'Demo Day', description: 'Teams present prototypes to mentors and investors.', venue: 'Main Atrium', date: day(12), startTime: '10:00', endTime: '16:00', capacity: 150, status: 'PUBLISHED', certificateEnabled: true, createdBy: sa.user._id },
        { title: 'Hardware Hack Night (draft)', description: 'Build session with microcontroller kits.', venue: 'Maker Lab', date: day(9), startTime: '18:00', endTime: '22:00', status: 'DRAFT', createdBy: sa.user._id },
      ]);
      console.log('Created 4 events');
    }
    console.log(`\nDemo users share the password from SEED_DEMO_PASSWORD (default "${demoPassword}").`);
  }
  await mongoose.disconnect();
}

main().catch(async (err) => { console.error('Seed failed:', err.message); await mongoose.disconnect().catch(() => {}); process.exit(1); });

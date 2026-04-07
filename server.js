require('dotenv').config();
const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/User');
const Attendance = require('./models/Attendance');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 hari
}));

// Set view engine
app.set('view engine', 'ejs');

// Koneksi MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('MongoDB connected');
    // Buat admin default jika belum ada
    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
      const hashedPass = await bcrypt.hash('admin123', 10);
      await User.create({
        username: 'admin',
        password: hashedPass,
        role: 'admin'
      });
      console.log('Admin default dibuat: username=admin, password=admin123');
    }
  })
  .catch(err => console.log(err));

// Middleware cek login
function isAuthenticated(req, res, next) {
  if (req.session.userId) return next();
  res.redirect('/login');
}

// Middleware cek role
function isAdmin(req, res, next) {
  if (req.session.role === 'admin') return next();
  res.status(403).send('Akses ditolak: hanya untuk admin');
}

// Routes
app.get('/login', (req, res) => {
  if (req.session.userId) {
    return res.redirect(req.session.role === 'admin' ? '/admin/dashboard' : '/user/dashboard');
  }
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.render('login', { error: 'Username tidak ditemukan' });
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.render('login', { error: 'Password salah' });
    }
    req.session.userId = user._id;
    req.session.role = user.role;
    req.session.username = user.username;
    if (user.role === 'admin') {
      res.redirect('/admin/dashboard');
    } else {
      res.redirect('/user/dashboard');
    }
  } catch (err) {
    res.render('login', { error: 'Terjadi kesalahan' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Dashboard User
app.get('/user/dashboard', isAuthenticated, async (req, res) => {
  if (req.session.role !== 'user') return res.redirect('/admin/dashboard');
  
  const userId = req.session.userId;
  const today = new Date().toISOString().slice(0, 10);
  const sudahAbsen = await Attendance.findOne({ userId, date: today });
  const riwayat = await Attendance.find({ userId }).sort({ checkIn: -1 }).populate('userId', 'username');
  
  res.render('userDashboard', {
    username: req.session.username,
    sudahAbsen: !!sudahAbsen,
    riwayat
  });
});

app.post('/attendance', isAuthenticated, async (req, res) => {
  if (req.session.role !== 'user') return res.status(403).send('Unauthorized');
  
  const userId = req.session.userId;
  const today = new Date().toISOString().slice(0, 10);
  
  try {
    const existing = await Attendance.findOne({ userId, date: today });
    if (existing) {
      return res.json({ success: false, message: 'Anda sudah absen hari ini' });
    }
    await Attendance.create({ userId, date: today });
    res.json({ success: true, message: 'Absensi berhasil' });
  } catch (err) {
    res.json({ success: false, message: 'Gagal absen' });
  }
});

// Dashboard Admin
app.get('/admin/dashboard', isAuthenticated, isAdmin, async (req, res) => {
  const users = await User.find({ role: 'user' }).select('-password');
  const attendances = await Attendance.find().populate('userId', 'username').sort({ checkIn: -1 });
  
  res.render('adminDashboard', {
    users,
    attendances
  });
});

// API untuk filter absensi berdasarkan tanggal (admin)
app.get('/api/attendances', isAuthenticated, isAdmin, async (req, res) => {
  const { date } = req.query;
  let filter = {};
  if (date) filter.date = date;
  const attendances = await Attendance.find(filter).populate('userId', 'username');
  res.json(attendances);
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
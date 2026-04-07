const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true }, // format YYYY-MM-DD
  checkIn: { type: Date, default: Date.now },
  status: { type: String, default: 'Hadir' }
});

// Index agar satu user hanya bisa absen sekali per hari
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
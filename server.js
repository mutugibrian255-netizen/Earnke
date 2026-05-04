const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ─── DB CONNECTION ────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// ─── SCHEMAS ─────────────────────────────────────
const userSchema = new mongoose.Schema({
  name: String,
  phone: { type: String, unique: true },
  password: String,
  active: { type: Boolean, default: false },
  refCode: String,
  referredBy: String,
  earnings: { type: Number, default: 0 },
  refEarnings: { type: Number, default: 0 },
  taskEarnings: { type: Number, default: 0 },
  completedTasks: [String],
  refs: [{ name: String, phone: String, date: String, earned: Number }],
  mpesaCode: String,
  joinedAt: String,
  createdAt: { type: Date, default: Date.now }
});

const taskSchema = new mongoose.Schema({
  title: String,
  desc: String,
  reward: Number,
  link: String,
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const withdrawSchema = new mongoose.Schema({
  userId: String,
  name: String,
  phone: String,
  mpesa: String,
  amount: Number,
  status: { type: String, default: 'Pending' },
  date: { type: Date, default: Date.now }
});

const paymentSchema = new mongoose.Schema({
  phone: String,
  checkoutRequestId: String,
  merchantRequestId: String,
  status: { type: String, default: 'pending' },
  userId: String,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Task = mongoose.model('Task', taskSchema);
const Withdrawal = mongoose.model('Withdrawal', withdrawSchema);
const Payment = mongoose.model('Payment', paymentSchema);

// ─── JWT MIDDLEWARE ───────────────────────────────
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const adminAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Not admin' });
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ─── MPESA HELPERS ───────────────────────────────
async function getMpesaToken() {
  const credentials = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
  const res = await axios.get(
    'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    { headers: { Authorization: `Basic ${credentials}` } }
  );
  return res.data.access_token;
}

async function stkPush(phone, amount, userId) {
  const token = await getMpesaToken();
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

  let formattedPhone = phone.replace(/\s/g, '');
  if (formattedPhone.startsWith('0')) formattedPhone = '254' + formattedPhone.slice(1);
  if (formattedPhone.startsWith('+')) formattedPhone = formattedPhone.slice(1);

  const payload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerBuyGoodsOnline',
    Amount: amount,
    PartyA: formattedPhone,
    PartyB: shortcode,
    PhoneNumber: formattedPhone,
    CallBackURL: `${process.env.BASE_URL}/api/mpesa/callback`,
    AccountReference: 'EarnKE',
    TransactionDesc: 'EarnKE Registration Fee'
  };

  const res = await axios.post(
    'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
    payload,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  await Payment.create({
    phone: formattedPhone,
    checkoutRequestId: res.data.CheckoutRequestID,
    merchantRequestId: res.data.MerchantRequestID,
    userId,
    status: 'pending'
  });

  return res.data;
}

// ─── AUTH ROUTES ──────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, phone, password, refCode } = req.body;
    if (!name || !phone || !password) return res.status(400).json({ error: 'All fields required' });
    const exists = await User.findOne({ phone });
    if (exists) return res.status(400).json({ error: 'Phone already registered' });
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name, phone, password: hashed,
      referredBy: refCode || null,
      active: false
    });
    res.json({ success: true, userId: user._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    const user = await User.findOne({ phone });
    if (!user) return res.status(400).json({ error: 'User not found' });
    if (!user.active) return res.status(400).json({ error: 'Account not activated. Please complete payment.' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: 'Wrong password' });
    const token = jwt.sign({ id: user._id, role: 'user' }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, phone: user.phone, earnings: user.earnings } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/admin', async (req, res) => {
  const { phone, password } = req.body;
  if (phone === process.env.ADMIN_PHONE && password === process.env.ADMIN_PASS) {
    const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid admin credentials' });
  }
});

// ─── MPESA ROUTES ────────────────────────────────
app.post('/api/mpesa/pay', async (req, res) => {
  try {
    const { phone, userId } = req.body;
    const result = await stkPush(phone, 100, userId);
    res.json({ success: true, checkoutRequestId: result.CheckoutRequestID, message: 'Check your phone for M-Pesa prompt' });
  } catch (err) {
    console.error('STK Push error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Payment initiation failed. Try again.' });
  }
});

app.post('/api/mpesa/callback', async (req, res) => {
  try {
    const callback = req.body.Body?.stkCallback;
    if (!callback) return res.json({ ResultCode: 0 });
    const { CheckoutRequestID, ResultCode, CallbackMetadata } = callback;
    const payment = await Payment.findOne({ checkoutRequestId: CheckoutRequestID });
    if (!payment) return res.json({ ResultCode: 0 });

    if (ResultCode === 0) {
      const mpesaCode = CallbackMetadata?.Item?.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
      payment.status = 'success';
      await payment.save();
      const user = await User.findById(payment.userId);
      if (user && !user.active) {
        user.active = true;
        user.mpesaCode = mpesaCode;
        user.joinedAt = new Date().toLocaleDateString('en-KE');
        if (user.referredBy) {
          const referrer = await User.findById(user.referredBy);
          if (referrer) {
            referrer.earnings += 50;
            referrer.refEarnings += 50;
            referrer.refs.push({ name: user.name, phone: user.phone.slice(0, 4) + '****', date: user.joinedAt, earned: 50 });
            await referrer.save();
          }
        }
        await user.save();
      }
    } else {
      payment.status = 'failed';
      await payment.save();
    }
    res.json({ ResultCode: 0 });
  } catch (err) {
    console.error('Callback error:', err);
    res.json({ ResultCode: 0 });
  }
});

app.get('/api/mpesa/status/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ active: user.active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── USER ROUTES ──────────────────────────────────
app.get('/api/user/dashboard', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    const tasks = await Task.find({ active: true });
    res.json({ user, tasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/user/task/:taskId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const task = await Task.findById(req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (user.completedTasks.includes(req.params.taskId)) return res.status(400).json({ error: 'Already completed' });
    user.completedTasks.push(req.params.taskId);
    user.earnings += task.reward;
    user.taskEarnings = (user.taskEarnings || 0) + task.reward;
    await user.save();
    res.json({ success: true, earned: task.reward, totalEarnings: user.earnings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/user/withdraw', auth, async (req, res) => {
  try {
    const { mpesaPhone } = req.body;
    const user = await User.findById(req.user.id);
    if (user.earnings < 200) return res.status(400).json({ error: 'Minimum withdrawal is KSH 200' });
    await Withdrawal.create({ userId: user._id, name: user.name, phone: user.phone, mpesa: mpesaPhone || user.phone, amount: user.earnings });
    user.earnings = 0; user.refEarnings = 0; user.taskEarnings = 0;
    await user.save();
    res.json({ success: true, message: 'Withdrawal submitted. Processing within 24hrs.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ADMIN ROUTES ────────────────────────────────
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const members = await User.find({ active: true }).select('-password');
    const withdrawals = await Withdrawal.find().sort({ date: -1 });
    const tasks = await Task.find();
    const totalPaid = withdrawals.filter(w => w.status === 'Paid').reduce((s, w) => s + w.amount, 0);
    res.json({ members, withdrawals, tasks, totalPaid, revenue: members.length * 100 - totalPaid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/task', adminAuth, async (req, res) => {
  try {
    const task = await Task.create(req.body);
    res.json({ success: true, task });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/task/:id', adminAuth, async (req, res) => {
  try {
    await Task.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/withdraw/:id', adminAuth, async (req, res) => {
  try {
    await Withdrawal.findByIdAndUpdate(req.params.id, { status: 'Paid' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 EarnKE running on port ${PORT}`));

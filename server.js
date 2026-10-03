const express = require('express');
const path = require('path');
const multer = require('multer');
const nodemailer = require('nodemailer');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({
  origin: function (origin, callback) {
    callback(null, true); // allow all origins
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));
app.use(express.static(path.join(__dirname)));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

const DEFAULT_TO = process.env.TO_EMAIL || 'Guideshipphd@mccblr.edu.in';
const DEFAULT_CC = process.env.CC_EMAIL || '';

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    message: 'Backend is running',
    time: new Date().toISOString(),
    smtpConfigured: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  });
});

app.post('/api/send-guideship', upload.single('attachment'), async (req, res) => {
  try {
    const { to, cc, subject, name, email, phone } = req.body || {};
    const file = req.file;

    const recipientEmail = to || DEFAULT_TO;
    const ccEmail = cc || DEFAULT_CC;

    if (!recipientEmail) {
      return res.status(400).json({ success: false, message: 'Missing recipient email (to).' });
    }
    if (!file) {
      return res.status(400).json({ success: false, message: 'No ZIP attachment was uploaded.' });
    }

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpHost || !smtpUser || !smtpPass) {
      return res.status(500).json({
        success: false,
        message: 'SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.'
      });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 30000
    });

    await transporter.verify();

    const mailSubject = subject || 'PhD Guideship Application';
    const mailText = [
      'Dear Sir/Madam,',
      '',
      'Please find attached the complete application package for PhD Guideship recognition.',
      '',
      `Applicant Name: ${name || 'Applicant'}`,
      `Applicant Email: ${email || 'N/A'}`,
      `Phone: ${phone || 'N/A'}`,
      '',
      'The attached ZIP contains the generated application form (.doc) and all annexures.',
      '',
      'Regards,',
      `${name || 'Applicant'}`
    ].join('\n');

    await transporter.sendMail({
      from: `"${name || 'PhD Guideship Applicant'}" <${smtpUser}>`,
      to: recipientEmail,
      cc: ccEmail || undefined,
      replyTo: email || smtpUser,
      subject: mailSubject,
      text: mailText,
      attachments: [{
        filename: file.originalname || 'guideship-package.zip',
        content: file.buffer,
        contentType: file.mimetype || 'application/zip'
      }]
    });

    console.log(`✅ Email sent to ${recipientEmail} — ${file.originalname} (${(file.size/1024/1024).toFixed(2)} MB)`);

    return res.json({
      success: true,
      message: 'Email sent successfully.',
      recipient: recipientEmail,
      attachment: file.originalname,
      size: file.size
    });
  } catch (error) {
    console.error('❌ Email send failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Email sending failed.',
      error: error.message
    });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, message: 'File exceeds 25 MB limit.' });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: err.message });
});

app.listen(port, () => {
  console.log(`🚀 Backend running at http://localhost:${port}`);
});
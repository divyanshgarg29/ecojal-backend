const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// --- MIDDLEWARES ---
app.use(cors());
app.use(bodyParser.json());

// --- 💻 MONGODB CONNECTION ---
// Local development ke liye mongodb://localhost:27000/ecojal use kar sakte hain
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ecojal';
mongoose.connect(MONGO_URI)
    .then(() => console.log('📁 MongoDB Connected Successfully to EcoJal Cluster!'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// --- 🗄️ DATABASE SCHEMAS & MODELS (Data Structures) ---

// 1. Staff/Authority Schema (For Admin, Contractor, Worker)
const staffSchema = new mongoose.Schema({
    securityId: { type: String, required: true, unique: true }, // Starts with 'c' or 'w' or 'admin'
    password: { type: String, required: true },
    role: { type: String, required: true, enum: ['admin', 'contractor', 'field_staff'] },
    name: { type: String, required: true },
    department: { type: String, default: 'General' },
    assignedZone: { type: String, default: 'Zone-4' }
});

const Staff = mongoose.model('Staff', staffSchema);

// 2. Citizen/User Session Schema (For OTP Flow)
const userSessionSchema = new mongoose.Schema({
    phone: { type: String, required: true },
    otp: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 600 } // OTP expires in 10 mins automatically
});

const UserSession = mongoose.model('UserSession', userSessionSchema);


// --- ⚙️ SEED DUMMY DATA FOR TESTING (Run once if database is empty) ---
async function seedDatabase() {
    const count = await Staff.countDocuments();
    if (count === 0) {
        await Staff.insertMany([
            { securityId: 'admin123', password: 'rootpass', role: 'admin', name: 'Meenakshi Sharma', department: 'MCD Desk Officer' },
            { securityId: 'contractor1', password: 'pass123', role: 'contractor', name: 'Om Prakash & Sons', department: 'Zone-4 Contractor' },
            { securityId: 'worker1', password: 'workerpass', role: 'field_staff', name: 'Ramesh Kumar', department: 'Team Bravo' }
        ]);
        console.log('📝 Test credentials seeded into MongoDB successfully!');
    }
}
seedDatabase();


// --- 🔌 BACKEND API ROUTES ---

// 🛑 ROUTE 1: Citizen OTP Generation Simulation
app.post('/api/auth/generate-otp', async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone number required!' });

    // Live environment me yahan Twilio/Firebase API call hoti hai.
    // Testing ke liye hum "1234" ko standard OTP code fix kar rahe hain.
    const mockOtp = "1234";

    try {
        // Purani session delete karke naya save karein
        await UserSession.deleteMany({ phone });
        const newSession = new UserSession({ phone, otp: mockOtp });
        await newSession.save();

        return res.json({ success: true, message: `OTP Sent! (For testing use code: ${mockOtp})` });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Server error generating OTP.' });
    }
});

// 🛑 ROUTE 2: Complete Login Authentication Engine (Citizen, Admin, Contractor, Worker)
app.post('/api/auth/verify-login', async (req, res) => {
    const { role, phone, otp, securityId, password } = req.body;

    try {
        // --- CASE A: CITIZEN FLOW (OTP Base Verification) ---
        if (role === 'user') {
            if (!phone || !otp) {
                return res.status(400).json({ success: false, message: 'Phone and OTP both are required!' });
            }

            const session = await UserSession.findOne({ phone, otp });
            if (!session) {
                return res.status(401).json({ success: false, message: 'Invalid or expired OTP code!' });
            }

            // Clean session after successful login verification
            await UserSession.deleteOne({ _id: session._id });
            return res.json({ success: true, role: 'user', redirectUrl: 'citizen_dashboard' });
        }

        // --- CASE B: ADMIN / CONTRACTOR / WORKER FLOW (ID-Password Base) ---
        else {
            if (!securityId || !password) {
                return res.status(400).json({ success: false, message: 'Security ID and Password both are required!' });
            }

            // Database lookup inside Staff Collection
            const staffMember = await Staff.findOne({ securityId: securityId.toLowerCase() });
            if (!staffMember) {
                return res.status(401).json({ success: false, message: 'Security ID not found in database registry!' });
            }

            // Cross check raw password match strings
            if (staffMember.password !== password) {
                return res.status(401).json({ success: false, message: 'Incorrect Password entered!' });
            }

            // Real-time server side safety check for prefix tokens
            let dynamicRedirect = "";
            if (staffMember.role === 'admin' && role === 'admin') {
                dynamicRedirect = "admin.html";
            } else if (staffMember.role === 'contractor' && role === 'field_staff' && securityId.toLowerCase().startsWith('c')) {
                dynamicRedirect = "contractor.html";
            } else if (staffMember.role === 'field_staff' && role === 'field_staff' && securityId.toLowerCase().startsWith('w')) {
                dynamicRedirect = "worker.html";
            } else {
                return res.status(403).json({ success: false, message: 'Role mismatch with assigned Token ID type!' });
            }

            return res.json({ 
                success: true, 
                role: staffMember.role, 
                name: staffMember.name, 
                redirectUrl: dynamicRedirect 
            });
        }

    } catch (err) {
        return res.status(500).json({ success: false, message: 'Internal Server Error during verification logic.' });
    }
});


// --- START SERVER NODE ---
app.listen(PORT, () => {
    console.log(`🚀 EcoJal Backend Engine Server running on live port: http://localhost:${PORT}`);
});
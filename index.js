const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcrypt');
const path = require('path');
const db = require('./database');
const { requireAuth, requireGuest, injectUser } = require('./middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Session configuration
app.use(session({
    store: new SQLiteStore({
        db: 'sessions.db',
        dir: path.join(__dirname, 'db')
    }),
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000 // 1 week
    }
}));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use(injectUser);

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.get('/', requireAuth, async (req, res) => {
    try {
        const jobs = await db.getJobsByUser(req.session.userId);
        res.render('index', { 
            jobs,
            unlimitedMode: true 
        });
    } catch (error) {
        console.error('Error fetching jobs:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/login', requireGuest, (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', requireGuest, async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = await db.getUserByEmail(email);
        if (!user) {
            return res.render('login', { error: 'Invalid email or password' });
        }
        
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.render('login', { error: 'Invalid email or password' });
        }
        
        req.session.userId = user.id;
        res.redirect('/');
    } catch (error) {
        console.error('Login error:', error);
        res.render('login', { error: 'An error occurred. Please try again.' });
    }
});

app.get('/register', requireGuest, (req, res) => {
    res.render('register', { error: null });
});

app.post('/register', requireGuest, async (req, res) => {
    try {
        const { email, password, confirmPassword } = req.body;
        
        // Validation
        if (password !== confirmPassword) {
            return res.render('register', { error: 'Passwords do not match' });
        }
        
        if (password.length < 6) {
            return res.render('register', { error: 'Password must be at least 6 characters' });
        }
        
        // Check if user exists
        const existingUser = await db.getUserByEmail(email);
        if (existingUser) {
            return res.render('register', { error: 'Email already registered' });
        }
        
        // Hash password and create user
        const passwordHash = await bcrypt.hash(password, 10);
        await db.createUser(email, passwordHash);
        
        res.redirect('/login');
    } catch (error) {
        console.error('Registration error:', error);
        res.render('register', { error: 'An error occurred. Please try again.' });
    }
});

app.post('/logout', requireAuth, (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/login');
    });
});

app.post('/jobs', requireAuth, async (req, res) => {
    try {
        const { name, url, schedule } = req.body;
        
        if (!name || !url || !schedule) {
            return res.redirect('/');
        }
        
        await db.createJob(req.session.userId, name, url, schedule);
        res.redirect('/');
    } catch (error) {
        console.error('Error creating job:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/jobs/:id/toggle', requireAuth, async (req, res) => {
    try {
        const jobId = req.params.id;
        const job = await db.getJobById(jobId, req.session.userId);
        
        if (job) {
            await db.updateJob(jobId, req.session.userId, { enabled: job.enabled ? 0 : 1 });
        }
        
        res.redirect('/');
    } catch (error) {
        console.error('Error toggling job:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/jobs/:id/delete', requireAuth, async (req, res) => {
    try {
        await db.deleteJob(req.params.id, req.session.userId);
        res.redirect('/');
    } catch (error) {
        console.error('Error deleting job:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/jobs/:id/logs', requireAuth, async (req, res) => {
    try {
        const jobId = req.params.id;
        const job = await db.getJobById(jobId, req.session.userId);
        
        if (!job) {
            return res.status(404).send('Job not found');
        }
        
        const logs = await db.getLogsByJob(jobId, req.session.userId);
        res.render('logs', { 
            job, 
            logs,
            unlimitedMode: true 
        });
    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log('⚡ UNLIMITED MODE: No rate limits, no job locking');
});
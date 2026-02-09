const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor() {
        this.dbPath = path.join(__dirname, 'db', 'cron_service.db');
        this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
                console.error('❌ Error opening database:', err);
            } else {
                console.log('✅ Connected to SQLite database');
                console.log('🔓 UNLIMITED MODE: No locks, no rate limiting');
                this.initTables();
            }
        });
    }

    initTables() {
        // Create users table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create cron_jobs table (NO locked_until column)
        this.db.run(`
            CREATE TABLE IF NOT EXISTS cron_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                url TEXT NOT NULL,
                schedule TEXT NOT NULL,
                enabled BOOLEAN DEFAULT 1,
                user_id INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        `);

        // Create cron_logs table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS cron_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                status INTEGER,
                response_time INTEGER,
                error_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (job_id) REFERENCES cron_jobs (id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        `);

        // Create indexes for performance
        this.db.run('CREATE INDEX IF NOT EXISTS idx_cron_jobs_user_id ON cron_jobs(user_id)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_cron_logs_job_id ON cron_logs(job_id)');
        this.db.run('CREATE INDEX IF NOT EXISTS idx_cron_logs_created_at ON cron_logs(created_at)');
    }

    // User methods
    createUser(email, passwordHash) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO users (email, password_hash) VALUES (?, ?)',
                [email, passwordHash],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    getUserByEmail(email) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM users WHERE email = ?',
                [email],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    getUserById(id) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT id, email, created_at FROM users WHERE id = ?',
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    // Cron job methods
    createJob(userId, name, url, schedule) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO cron_jobs (user_id, name, url, schedule) VALUES (?, ?, ?, ?)',
                [userId, name, url, schedule],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    getJobsByUser(userId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT *, 
                 (SELECT COUNT(*) FROM cron_logs WHERE job_id = cron_jobs.id) as execution_count,
                 (SELECT status FROM cron_logs WHERE job_id = cron_jobs.id ORDER BY created_at DESC LIMIT 1) as last_status
                 FROM cron_jobs 
                 WHERE user_id = ? 
                 ORDER BY created_at DESC`,
                [userId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    getJobById(jobId, userId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM cron_jobs WHERE id = ? AND user_id = ?',
                [jobId, userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    updateJob(jobId, userId, updates) {
        const fields = [];
        const values = [];
        
        for (const [key, value] of Object.entries(updates)) {
            fields.push(`${key} = ?`);
            values.push(value);
        }
        
        values.push(jobId, userId);
        
        return new Promise((resolve, reject) => {
            this.db.run(
                `UPDATE cron_jobs SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
                values,
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes > 0);
                }
            );
        });
    }

    deleteJob(jobId, userId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'DELETE FROM cron_jobs WHERE id = ? AND user_id = ?',
                [jobId, userId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes > 0);
                }
            );
        });
    }

    getEnabledJobs() {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM cron_jobs WHERE enabled = 1',
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    // Log methods
    createLog(jobId, userId, status, responseTime, errorMessage = null) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO cron_logs (job_id, user_id, status, response_time, error_message) VALUES (?, ?, ?, ?, ?)',
                [jobId, userId, status, responseTime, errorMessage],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    getLogsByJob(jobId, userId, limit = 100) {
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT * FROM cron_logs 
                 WHERE job_id = ? AND user_id = ? 
                 ORDER BY created_at DESC 
                 LIMIT ?`,
                [jobId, userId, limit],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    // No rate limiting method - always returns 0
    getUserExecutionCount(userId) {
        return new Promise((resolve) => {
            resolve(0);
        });
    }

    close() {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
}

module.exports = new Database();
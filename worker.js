const cron = require('node-cron');
const axios = require('axios');
const db = require('./database');

class CronWorker {
    constructor() {
        this.cronTasks = new Map();
    }

    async start() {
        console.log('⚡ Cron worker started - UNLIMITED MODE');
        console.log('🔓 No rate limits, no job locking');
        await this.scheduleAllJobs();
        
        // Reschedule jobs every minute to pick up new jobs
        cron.schedule('* * * * *', async () => {
            await this.rescheduleJobs();
        });
    }

    async scheduleAllJobs() {
        try {
            const jobs = await db.getEnabledJobs();
            console.log(`📋 Found ${jobs.length} active jobs`);
            
            for (const job of jobs) {
                this.scheduleJob(job);
            }
        } catch (error) {
            console.error('❌ Error scheduling jobs:', error);
        }
    }

    async rescheduleJobs() {
        try {
            const jobs = await db.getEnabledJobs();
            const currentJobIds = new Set(jobs.map(job => job.id));
            
            // Remove cancelled jobs
            for (const [jobId, task] of this.cronTasks.entries()) {
                if (!currentJobIds.has(parseInt(jobId))) {
                    task.stop();
                    this.cronTasks.delete(jobId);
                    console.log(`🗑️  Removed job ${jobId}`);
                }
            }
            
            // Add new jobs
            for (const job of jobs) {
                if (!this.cronTasks.has(job.id.toString())) {
                    this.scheduleJob(job);
                }
            }
        } catch (error) {
            console.error('❌ Error rescheduling jobs:', error);
        }
    }

    scheduleJob(job) {
        try {
            const task = cron.schedule(job.schedule, async () => {
                await this.executeJob(job);
            }, {
                scheduled: true,
                timezone: "UTC"
            });
            
            this.cronTasks.set(job.id.toString(), task);
            console.log(`✅ Scheduled job ${job.id}: "${job.name}" -> ${job.url} (${job.schedule})`);
        } catch (error) {
            console.error(`❌ Error scheduling job ${job.id}:`, error);
        }
    }

    async executeJob(job) {
        const startTime = Date.now();
        
        try {
            const response = await axios.get(job.url, {
                timeout: 30000,
                validateStatus: () => true
            });
            
            const responseTime = Date.now() - startTime;
            
            // Log success
            await db.createLog(
                job.id,
                job.user_id,
                response.status,
                responseTime,
                null
            );
            
            console.log(`✓ Job ${job.id} "${job.name}": ${response.status} in ${responseTime}ms`);
            
        } catch (error) {
            const responseTime = Date.now() - startTime;
            const errorMessage = error.code || error.message;
            
            // Log error
            await db.createLog(
                job.id,
                job.user_id,
                0,
                responseTime,
                errorMessage
            );
            
            console.log(`✗ Job ${job.id} "${job.name}" failed: ${errorMessage}`);
        }
    }

    stop() {
        for (const task of this.cronTasks.values()) {
            task.stop();
        }
        this.cronTasks.clear();
        console.log('🛑 Cron worker stopped');
    }
}

// Start worker
const worker = new CronWorker();
worker.start();

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🔻 SIGTERM received. Shutting down gracefully...');
    worker.stop();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🔻 SIGINT received. Shutting down gracefully...');
    worker.stop();
    process.exit(0);
});
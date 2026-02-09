class RateLimiter {
    async checkLimit(userId) {
        // No limits - always allow
        return true;
    }

    async getRemainingRequests(userId) {
        // Return infinite
        return Infinity;
    }
}

module.exports = new RateLimiter();
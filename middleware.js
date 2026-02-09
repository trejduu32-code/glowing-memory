const db = require('./database');

function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
}

function requireGuest(req, res, next) {
    if (req.session && req.session.userId) {
        res.redirect('/');
    } else {
        next();
    }
}

async function injectUser(req, res, next) {
    if (req.session && req.session.userId) {
        try {
            const user = await db.getUserById(req.session.userId);
            res.locals.user = user;
        } catch (error) {
            console.error('Error fetching user:', error);
        }
    }
    next();
}

module.exports = {
    requireAuth,
    requireGuest,
    injectUser
};
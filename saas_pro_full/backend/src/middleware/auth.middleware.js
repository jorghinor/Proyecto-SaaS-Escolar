const jwt = require('jsonwebtoken');

module.exports = {
  auth: (req, res, next) => {
    const token = req.header('auth-token');
    if (!token) return res.status(401).send('Access Denied');

    try {
      const verified = jwt.verify(token, process.env.JWT_SECRET || 'secret');
      req.user = verified;
      next();
    } catch (err) {
      res.status(400).send('Invalid Token');
    }
  },

  authorize: (roles = []) => {
    return (req, res, next) => {
      if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

      // Admin always has access
      if (req.user.role === 'admin') return next();

      if (roles.length && !roles.includes(req.user.role)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      next();
    };
  }
};
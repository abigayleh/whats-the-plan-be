const { getMembership } = require('../lib/membership');

// Loads the requester's membership for :id. 404 if not a member (doesn't leak existence).
async function requireMember(req, res, next) {
  const membership = await getMembership(req.userId, req.params.id);
  if (!membership) return res.status(404).json({ error: 'Group not found' });
  req.membership = membership;
  next();
}

// Same as requireMember, but also requires ADMIN role.
async function requireAdmin(req, res, next) {
  await requireMember(req, res, () => {
    if (req.membership.role !== 'ADMIN')
      return res.status(403).json({ error: 'Admin required' });
    next();
  });
}

module.exports = { requireMember, requireAdmin };

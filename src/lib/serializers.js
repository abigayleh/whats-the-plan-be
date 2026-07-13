// Shapes a User row for API responses — never leaks passwordHash.
const publicUser = (user) => ({ id: user.id, email: user.email });

module.exports = { publicUser };

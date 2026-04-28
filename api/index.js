// Vercel Serverless Function entrypoint.
// Exposes the Express app as a handler.
const app = require("../server/src/index.js");

module.exports = (req, res) => app(req, res);


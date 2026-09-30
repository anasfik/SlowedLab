// CRA dev-server API proxy (loaded automatically from src/setupProxy.js).
// Target is overridable per environment:
// - docker compose sets BACKEND_PROXY_URL=http://backend:4001 (service DNS)
// - plain host `npm start` falls back to a host-local backend on :4001
// Production/nginx deployments never hit this file: nginx proxies /api/ itself.
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: process.env.BACKEND_PROXY_URL || 'http://localhost:4001',
      changeOrigin: true,
    })
  );
};

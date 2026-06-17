module.exports = {
  apps: [
    {
      name: "quality-backend",
      script: "backend/src/server.js",
      cwd: __dirname,
      interpreter: "node",
      env: {
        PORT: 8787
      }
    },
    {
      name: "quality-frontend",
      script: "frontend/server.js",
      cwd: __dirname,
      interpreter: "node",
      env: {
        PORT: 5173
      }
    }
  ]
};

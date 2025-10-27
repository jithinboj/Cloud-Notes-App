# Frontend (React + TypeScript)

This folder contains the SPA that communicates with:
- REST API for CRUD operations
- WebSocket endpoint for real-time updates

You'll need to configure environment variables at build time:
- REACT_APP_HTTP_API - REST API base URL (e.g., https://xxxx.execute-api.region.amazonaws.com)
- REACT_APP_WS_URL - WebSocket URL (wss://xxxx.execute-api.region.amazonaws.com/dev)
- Optionally REACT_APP_USER_POOL_ID and REACT_APP_USER_POOL_CLIENT_ID for Cognito (if using).

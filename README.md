# Cloud Notes App

Cloud Notes is a real-time collaborative note-taking app (Google Keep-like) built with AWS serverless infrastructure.

Features
- User authentication via AWS Cognito
- CRUD for notes stored in DynamoDB
- Real-time updates via API Gateway WebSocket + Lambda (pushes updates to connected clients)
- Frontend: React + TypeScript, hosted on S3 + CloudFront
- Infrastructure: AWS CDK (TypeScript)

Architecture
- Cognito User Pool for auth (signup/signin)
- REST API (API Gateway + Lambda) for notes CRUD
- WebSocket API (API Gateway + Lambdas) for managing real-time connections
- DynamoDB table `NotesTable` (partition key: userId, sort key: noteId)
- S3 bucket + CloudFront for static hosting
- Lambdas use IAM role that can update DynamoDB and call ApiGatewayManagementApi to push to WebSocket clients.

Repository layout
- /infrastructure - CDK app (TypeScript)
- /lambda - Lambda function code (Node.js)
  - notesHandler - REST CRUD
  - wsHandler - connect/disconnect / broadcast
- /frontend - React app (TypeScript)
- .github/workflows - (example) GitHub Actions for build & deplo

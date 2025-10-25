// Lambda to handle REST CRUD operations for notes and broadcast updates to WS clients
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const ddb = new AWS.DynamoDB.DocumentClient();
const apiGatewayManagement = (endpoint) => new AWS.ApiGatewayManagementApi({ endpoint });

const NOTES_TABLE = process.env.NOTES_TABLE;
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || process.env.CONNECTIONS_TABLE_NAME;
const WS_API_ENDPOINT = process.env.WS_API_ENDPOINT; // e.g. wss://xxxxx.execute-api.region.amazonaws.com/dev

exports.handler = async (event) => {
  const routeKey = `${event.requestContext.http?.method || event.httpMethod} ${event.rawPath || event.path}`;
  // Simple routing by path/method
  const method = event.requestContext?.http?.method || event.httpMethod;
  const path = event.rawPath || event.path;
  const userId = event.requestContext?.authorizer?.jwt?.claims?.sub || (event.headers && event.headers['x-user-id']) || 'anonymous';

  try {
    if ((method === 'POST' && path === '/notes') ) {
      const body = JSON.parse(event.body || '{}');
      const noteId = uuidv4();
      const item = {
        userId,
        noteId,
        title: body.title || '',
        content: body.content || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await ddb.put({ TableName: NOTES_TABLE, Item: item }).promise();

      // Broadcast creation to connected clients
      await broadcastToAll({ action: 'noteCreated', note: item });

      return response(201, item);
    }

    if (method === 'GET' && path === '/notes') {
      // List notes for user
      const res = await ddb.query({
        TableName: NOTES_TABLE,
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': userId },
      }).promise();

      return response(200, res.Items || []);
    }

    if (method === 'PUT' && path.startsWith('/notes/')) {
      const noteId = path.split('/').pop();
      const body = JSON.parse(event.body || '{}');
      const now = new Date().toISOString();
      const update = await ddb.update({
        TableName: NOTES_TABLE,
        Key: { userId, noteId },
        UpdateExpression: 'set #t = :t, content = :c, updatedAt = :u',
        ExpressionAttributeNames: { '#t': 'title' },
        ExpressionAttributeValues: { ':t': body.title || '', ':c': body.content || '', ':u': now },
        ReturnValues: 'ALL_NEW'
      }).promise();

      await broadcastToAll({ action: 'noteUpdated', note: update.Attributes });

      return response(200, update.Attributes);
    }

    if (method === 'DELETE' && path.startsWith('/notes/')) {
      const noteId = path.split('/').pop();
      await ddb.delete({ TableName: NOTES_TABLE, Key: { userId, noteId } }).promise();

      await broadcastToAll({ action: 'noteDeleted', noteId, userId });

      return response(204, {});
    }

    return response(400, { message: 'Unsupported route' });
  } catch (err) {
    console.error(err);
    return response(500, { message: 'Internal server error', error: err.message });
  }
};

async function broadcastToAll(payload) {
  // This function queries a CONNECTIONS_TABLE and posts to each connection
  const doc = new AWS.DynamoDB.DocumentClient();
  const connectionsTable = process.env.CONNECTIONS_TABLE || process.env.CONNECTIONS_TABLE_NAME;
  if (!connectionsTable || !WS_API_ENDPOINT) {
    console.warn('No connections table or WS API endpoint configured.');
    return;
  }
  const api = apiGatewayManagement(WS_API_ENDPOINT.replace(/^wss:\/\//, ''));

  const list = await doc.scan({ TableName: connectionsTable }).promise();
  const postCalls = (list.Items || []).map(async ({ connectionId }) => {
    try {
      await api.postToConnection({ ConnectionId: connectionId, Data: Buffer.from(JSON.stringify(payload)) }).promise();
    } catch (e) {
      // If GoneException, remove stale connection
      if (e.statusCode === 410) {
        await doc.delete({ TableName: connectionsTable, Key: { connectionId } }).promise();
      } else {
        console.error('Post failure', e);
      }
    }
  });
  await Promise.all(postCalls);
}

function response(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

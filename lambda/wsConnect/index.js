// WebSocket connect handler: store connectionId in DynamoDB
const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB.DocumentClient();
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || 'ConnectionsTable';

exports.handler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  try {
    await ddb.put({ TableName: CONNECTIONS_TABLE, Item: { connectionId, connectedAt: new Date().toISOString() } }).promise();
    return { statusCode: 200, body: 'connected' };
  } catch (err) {
    console.error('connect error', err);
    return { statusCode: 500, body: 'Failed to connect' };
  }
};

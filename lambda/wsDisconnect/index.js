// WebSocket disconnect handler: remove connectionId from DynamoDB
const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB.DocumentClient();
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || 'ConnectionsTable';

exports.handler = async (event) => {
  const connectionId = event.requestContext.connectionId;
  try {
    await ddb.delete({ TableName: CONNECTIONS_TABLE, Key: { connectionId } }).promise();
    return { statusCode: 200, body: 'disconnected' };
  } catch (err) {
    console.error('disconnect error', err);
    return { statusCode: 500, body: 'Failed to disconnect' };
  }
};

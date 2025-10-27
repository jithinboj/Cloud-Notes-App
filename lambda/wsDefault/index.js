// WebSocket default route: echo or simple commands
exports.handler = async (event) => {
  console.log('WS default', event);
  return { statusCode: 200, body: 'ok' };
};

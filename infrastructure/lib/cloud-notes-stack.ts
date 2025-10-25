import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';
import * as apigwv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import * as integrations from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as logs from 'aws-cdk-lib/aws-logs';

export class CloudNotesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 for frontend
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      websiteIndexDocument: 'index.html',
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // CloudFront distribution (origin is S3)
    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
    });

    new cdk.CfnOutput(this, 'CloudFrontURL', {
      value: `https://${distribution.distributionDomainName}`,
    });

    // DynamoDB table
    const notesTable = new dynamodb.Table(this, 'NotesTable', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'noteId', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // Cognito User Pool
    const userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      generateSecret: false,
    });

    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });

    // Lambda: notesHandler (REST CRUD)
    const notesHandler = new lambda.NodejsFunction(this, 'NotesHandlerFn', {
      entry: path.join(__dirname, '../../lambda/notesHandler/index.js'),
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handler',
      memorySize: 512,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        NOTES_TABLE: notesTable.tableName,
        WS_API_ENDPOINT: 'REPLACE_WITH_WS_ENDPOINT_AT_DEPLOY', // updated after ws API created
      },
    });

    // Grant DynamoDB access
    notesTable.grantFullAccess(notesHandler);

    // WebSocket API: connect/disconnect + broadcast support
    const wsApi = new apigwv2.WebSocketApi(this, 'NotesWSApi', {
      connectRouteOptions: {
        integration: new integrations.WebSocketLambdaIntegration('ConnectIntegration', new lambda.NodejsFunction(this, 'WsConnectFn', {
          entry: path.join(__dirname, '../../lambda/wsConnect/index.js'),
          runtime: lambda.Runtime.NODEJS_18_X,
          handler: 'handler',
          environment: {
            CONNECTIONS_TABLE: 'ConnectionsTable' // placeholder set below
          },
        })),
      },
      disconnectRouteOptions: {
        integration: new integrations.WebSocketLambdaIntegration('DisconnectIntegration', new lambda.NodejsFunction(this, 'WsDisconnectFn', {
          entry: path.join(__dirname, '../../lambda/wsDisconnect/index.js'),
          runtime: lambda.Runtime.NODEJS_18_X,
          handler: 'handler',
          environment: {
            CONNECTIONS_TABLE: 'ConnectionsTable' // placeholder
          },
        })),
      },
      defaultRouteOptions: {
        integration: new integrations.WebSocketLambdaIntegration('DefaultIntegration', new lambda.NodejsFunction(this, 'WsDefaultFn', {
          entry: path.join(__dirname, '../../lambda/wsDefault/index.js'),
          runtime: lambda.Runtime.NODEJS_18_X,
          handler: 'handler',
          environment: {
            CONNECTIONS_TABLE: 'ConnectionsTable'
          },
        })),
      },
    });

    // Stage
    const wsStage = new apigwv2.WebSocketStage(this, 'DevStage', {
      webSocketApi: wsApi,
      stageName: 'dev',
      autoDeploy: true,
    });

    new cdk.CfnOutput(this, 'WebSocketEndpoint', { value: wsStage.url });

    // Create connections table for WebSocket connection ids
    const connectionsTable = new dynamodb.Table(this, 'ConnectionsTable', {
      partitionKey: { name: 'connectionId', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // Grant connections table access to ws lambdas and notesHandler
    connectionsTable.grantReadWriteData(notesHandler);
    // Find the created Lambdas (we have refs above) and grant
    // Due to the way we created the lambdas above, we need references. Simpler: look up by name.
    // For brevity in this sample CDK, we'll attach policy to allow managing connections via ApiGatewayManagementApi to notesHandler
    notesHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [ `arn:aws:execute-api:${this.region}:${this.account}:${wsApi.apiId}/*/*/@connections/*` ],
    }));

    connectionsTable.grantFullAccess(this.node.tryFindChild('WsConnectFn') as lambda.Function || notesHandler);
    connectionsTable.grantFullAccess(this.node.tryFindChild('WsDisconnectFn') as lambda.Function || notesHandler);
    connectionsTable.grantFullAccess(this.node.tryFindChild('WsDefaultFn') as lambda.Function || notesHandler);

    // Update environment variable on notesHandler with actual WS endpoint
    const wsEndpoint = wsStage.url.replace('wss://', ''); // keep wss host/route format is fine
    notesHandler.addEnvironment('WS_API_ENDPOINT', wsStage.url);

    // REST API for notes
    const httpApi = new apigwv2.HttpApi(this, 'NotesHttpApi', {
      apiName: 'notes-rest-api',
    });

    const notesIntegration = new integrations.HttpLambdaIntegration('NotesHttpIntegration', notesHandler);
    httpApi.addRoutes({
      path: '/notes',
      methods: [apigwv2.HttpMethod.POST, apigwv2.HttpMethod.GET],
      integration: notesIntegration,
    });

    httpApi.addRoutes({
      path: '/notes/{id}',
      methods: [apigwv2.HttpMethod.PUT, apigwv2.HttpMethod.DELETE],
      integration: notesIntegration,
    });

    new cdk.CfnOutput(this, 'HttpApiUrl', {
      value: httpApi.apiEndpoint,
    });

    // IAM permissions for Lambdas to use ApiGateway Management API will be added above.

    // NOTE: For production you'd add stricter IAM permissions, enable CORS, configure Cognito authorizers on API, and so on.

    // Export values useful for frontend
    new cdk.CfnOutput(this, 'NotesTableName', { value: notesTable.tableName });
    new cdk.CfnOutput(this, 'ConnectionsTableName', { value: connectionsTable.tableName });
  }
}

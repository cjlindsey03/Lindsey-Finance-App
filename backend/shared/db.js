const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({
  region: process.env.DYNAMODB_REGION,
  ...(process.env.DYNAMODB_LOCAL_ENDPOINT
    ? { endpoint: process.env.DYNAMODB_LOCAL_ENDPOINT }
    : {}),
});

const doc = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

async function get(tableName, key) {
  const result = await doc.send(new GetCommand({ TableName: tableName, Key: key }));
  return result.Item ?? null;
}

async function put(tableName, item) {
  await doc.send(new PutCommand({ TableName: tableName, Item: item }));
  return item;
}

async function queryByPK(tableName, pk, options = {}) {
  const result = await doc.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': pk },
      ...options,
    })
  );
  return result.Items ?? [];
}

async function del(tableName, key) {
  await doc.send(new DeleteCommand({ TableName: tableName, Key: key }));
}

module.exports = { doc, get, put, queryByPK, del, UpdateCommand, QueryCommand };

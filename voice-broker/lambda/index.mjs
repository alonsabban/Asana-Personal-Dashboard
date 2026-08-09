import { DynamoDBClient, PutItemCommand, QueryCommand, BatchWriteItemCommand } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function ok(body, status = 200) {
  return { statusCode: status, headers: { ...CORS, "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function err(msg, status = 400) {
  return { statusCode: status, headers: { ...CORS, "Content-Type": "application/json" }, body: JSON.stringify({ error: msg }) };
}

export async function handler(event) {
  const method = event.requestContext?.http?.method ?? event.httpMethod ?? "GET";

  if (method === "OPTIONS") return ok({});

  // ── POST /tasks ───────────────────────────────────────────────────────────
  if (method === "POST") {
    let body;
    try { body = JSON.parse(event.body ?? "{}"); } catch { return err("Invalid JSON"); }

    const { userToken, name, due } = body;
    if (!userToken?.trim()) return err("userToken is required");
    if (!name?.trim()) return err("name is required");

    const taskId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    await client.send(new PutItemCommand({
      TableName: TABLE,
      Item: {
        userToken: { S: userToken.trim() },
        taskId:    { S: taskId },
        name:      { S: name.trim() },
        ...(due ? { due: { S: due } } : {}),
        createdAt: { S: new Date().toISOString() },
        consumed:  { BOOL: false },
        expiresAt: { N: String(now + 7 * 24 * 60 * 60) },
      },
    }));

    return ok({ ok: true, taskId });
  }

  // ── GET /tasks?token=xxx ──────────────────────────────────────────────────
  if (method === "GET") {
    const userToken = event.queryStringParameters?.token;
    if (!userToken?.trim()) return err("token query parameter is required");

    const result = await client.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "userToken = :t",
      FilterExpression: "#c = :f",
      ExpressionAttributeNames: { "#c": "consumed" },
      ExpressionAttributeValues: {
        ":t": { S: userToken.trim() },
        ":f": { BOOL: false },
      },
    }));

    const items = result.Items ?? [];

    // Mark all as consumed
    if (items.length > 0) {
      for (let i = 0; i < items.length; i += 25) {
        const chunk = items.slice(i, i + 25);
        await client.send(new BatchWriteItemCommand({
          RequestItems: {
            [TABLE]: chunk.map((item) => ({
              PutRequest: {
                Item: { ...item, consumed: { BOOL: true } },
              },
            })),
          },
        }));
      }
    }

    return ok({
      tasks: items.map((item) => ({
        taskId:    item.taskId.S,
        name:      item.name.S,
        ...(item.due ? { due: item.due.S } : {}),
        createdAt: item.createdAt.S,
      })),
    });
  }

  return err("Method not allowed", 405);
}

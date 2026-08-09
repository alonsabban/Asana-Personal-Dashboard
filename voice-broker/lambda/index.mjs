import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
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

  // ── POST /tasks — mobile page submits a voice task ────────────────────────
  if (method === "POST") {
    let body;
    try {
      body = JSON.parse(event.body ?? "{}");
    } catch {
      return err("Invalid JSON");
    }

    const { userToken, name, due } = body;
    if (!userToken?.trim()) return err("userToken is required");
    if (!name?.trim()) return err("name is required");

    const taskId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const sevenDays = 7 * 24 * 60 * 60;

    await client.send(new PutCommand({
      TableName: TABLE,
      Item: {
        userToken: userToken.trim(),
        taskId,
        name: name.trim(),
        ...(due ? { due } : {}),
        createdAt: new Date().toISOString(),
        consumed: false,
        expiresAt: now + sevenDays,
      },
    }));

    return ok({ ok: true, taskId });
  }

  // ── GET /tasks?token=xxx — dashboard polls for pending tasks ──────────────
  if (method === "GET") {
    const userToken = event.queryStringParameters?.token;
    if (!userToken?.trim()) return err("token query parameter is required");

    const result = await client.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "userToken = :t",
      FilterExpression: "consumed = :f",
      ExpressionAttributeValues: { ":t": userToken.trim(), ":f": false },
    }));

    const tasks = result.Items ?? [];

    // Mark all returned tasks as consumed in one batch
    if (tasks.length > 0) {
      // BatchWrite accepts max 25 items per call; chunk if needed
      for (let i = 0; i < tasks.length; i += 25) {
        const chunk = tasks.slice(i, i + 25);
        await client.send(new BatchWriteCommand({
          RequestItems: {
            [TABLE]: chunk.map((t) => ({
              PutRequest: {
                Item: { ...t, consumed: true },
              },
            })),
          },
        }));
      }
    }

    return ok({
      tasks: tasks.map(({ taskId, name, due, createdAt }) => ({
        taskId,
        name,
        ...(due ? { due } : {}),
        createdAt,
      })),
    });
  }

  return err("Method not allowed", 405);
}

const express = require("express");
const path = require("path");
const { randomUUID } = require("crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    PutCommand,
    ScanCommand
} = require("@aws-sdk/lib-dynamodb");

const app = express();
const PORT = process.env.PORT || 3000;
const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE;
const AWS_REGION = process.env.AWS_REGION || "ap-south-1";

const useDynamoDB = Boolean(DYNAMODB_TABLE);
const dynamo = useDynamoDB
    ? DynamoDBDocumentClient.from(new DynamoDBClient({ region: AWS_REGION }))
    : null;

let localOrders = [
    {
        id: "1001",
        customer_name: "Sample Customer",
        email: "customer@example.com",
        product: "Wireless Headphones",
        quantity: 1,
        status: "Processing",
        createdAt: new Date("2026-08-11T05:30:00.000Z").toISOString()
    },
    {
        id: "1002",
        customer_name: "Sample Customer",
        email: "customer@example.com",
        product: "Smart Watch",
        quantity: 2,
        status: "Confirmed",
        createdAt: new Date("2026-08-11T05:31:00.000Z").toISOString()
    }
];

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function sortNewestFirst(orders) {
    return orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function getOrders() {
    if (!useDynamoDB) {
        return sortNewestFirst([...localOrders]);
    }

    const result = await dynamo.send(new ScanCommand({
        TableName: DYNAMODB_TABLE
    }));

    return sortNewestFirst(result.Items || []);
}

async function saveOrder(order) {
    if (!useDynamoDB) {
        localOrders.unshift(order);
        return order;
    }

    await dynamo.send(new PutCommand({
        TableName: DYNAMODB_TABLE,
        Item: order
    }));

    return order;
}

app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        database: useDynamoDB ? "dynamodb" : "memory",
        table: DYNAMODB_TABLE || null,
        region: AWS_REGION
    });
});

app.get("/api/products", async (req, res) => {
    try {
        const result = await dynamo.send(new ScanCommand({
            TableName: "Products"
        }));

        res.json(result.Items || []);
    } catch (error) {
        console.error("Failed to load products:", error);
        res.status(500).json({
            error: "Unable to load products."
        });
    }
});

app.get("/api/orders", async (req, res) => {
    try {
        const orders = await getOrders();
        res.json(orders);
    } catch (error) {
        console.error("Failed to load orders:", error);
        res.status(500).json({ error: "Unable to load orders." });
    }
});

app.post("/api/orders", async (req, res) => {
    const { customer_name, email, product, quantity } = req.body;

    if (!customer_name || !email || !product || !quantity) {
        return res.status(400).json({
            error: "Customer name, email, product, and quantity are required."
        });
    }

    const order = {
        id: randomUUID(),
        customer_name,
        email,
        product,
        quantity: Number(quantity),
        status: "Processing",
        createdAt: new Date().toISOString()
    };

    try {
        const savedOrder = await saveOrder(order);
        res.status(201).json(savedOrder);
    } catch (error) {
        console.error("Failed to save order:", error);
        res.status(500).json({ error: "Unable to save order." });
    }
});

app.listen(PORT, () => {
    console.log(`Mini E-Commerce Store running at http://localhost:${PORT}`);
    console.log(useDynamoDB
        ? `Using DynamoDB table ${DYNAMODB_TABLE} in ${AWS_REGION}`
        : "Using local in-memory orders. Set DYNAMODB_TABLE to use DynamoDB.");
});

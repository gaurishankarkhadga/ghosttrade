import { Environment, Paddle } from "@paddle/paddle-node-sdk";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const apiKey = process.env.PADDLE_API_KEY;

if (!apiKey) {
  console.error("❌ Error: PADDLE_API_KEY is not set in backend/.env");
  process.exit(1);
}

const paddle = new Paddle(apiKey, {
  environment: Environment.sandbox,
});

async function seedCatalog() {
  console.log("🚀 Initializing Paddle Sandbox Catalog creation...");

  try {
    // 1. Starter Plan
    console.log("Creating Starter Product...");
    const starterProduct = await paddle.products.create({
      name: "GhostTrade Starter",
      taxCategory: "saas",
      description: "Essential AI Intelligence Terminal & Signals",
    });

    const starterMonthly = await paddle.prices.create({
      productId: starterProduct.id,
      description: "Starter Monthly USD",
      unitPrice: { amount: "1000", currencyCode: "USD" }, // $10.00
      billingCycle: { interval: "month", frequency: 1 },
      trialPeriod: { interval: "day", frequency: 7 },
    });

    const starterYearly = await paddle.prices.create({
      productId: starterProduct.id,
      description: "Starter Yearly USD",
      unitPrice: { amount: "10000", currencyCode: "USD" }, // $100.00
      billingCycle: { interval: "year", frequency: 1 },
      trialPeriod: { interval: "day", frequency: 7 },
    });

    // 2. Pro Plan
    console.log("Creating Pro Product...");
    const proProduct = await paddle.products.create({
      name: "GhostTrade Pro",
      taxCategory: "saas",
      description: "Full AI Intelligence Suite, Hurst Exponent & Order Flow Analytics",
    });

    const proMonthly = await paddle.prices.create({
      productId: proProduct.id,
      description: "Pro Monthly USD",
      unitPrice: { amount: "4000", currencyCode: "USD" }, // $40.00
      billingCycle: { interval: "month", frequency: 1 },
      trialPeriod: { interval: "day", frequency: 7 },
    });

    const proYearly = await paddle.prices.create({
      productId: proProduct.id,
      description: "Pro Yearly USD",
      unitPrice: { amount: "40000", currencyCode: "USD" }, // $400.00
      billingCycle: { interval: "year", frequency: 1 },
      trialPeriod: { interval: "day", frequency: 7 },
    });

    // 3. Institutional / Advanced Plan
    console.log("Creating Advanced Product...");
    const advProduct = await paddle.products.create({
      name: "GhostTrade Advanced",
      taxCategory: "saas",
      description: "Institutional Edge, Custom Multi-Broker Automation & Priority Execution",
    });

    const advMonthly = await paddle.prices.create({
      productId: advProduct.id,
      description: "Advanced Monthly USD",
      unitPrice: { amount: "12000", currencyCode: "USD" }, // $120.00
      billingCycle: { interval: "month", frequency: 1 },
      trialPeriod: { interval: "day", frequency: 7 },
    });

    const advYearly = await paddle.prices.create({
      productId: advProduct.id,
      description: "Advanced Yearly USD",
      unitPrice: { amount: "120000", currencyCode: "USD" }, // $1200.00
      billingCycle: { interval: "year", frequency: 1 },
      trialPeriod: { interval: "day", frequency: 7 },
    });

    const result = {
      starter: {
        productId: starterProduct.id,
        monthlyPriceId: starterMonthly.id,
        yearlyPriceId: starterYearly.id,
      },
      pro: {
        productId: proProduct.id,
        monthlyPriceId: proMonthly.id,
        yearlyPriceId: proYearly.id,
      },
      advanced: {
        productId: advProduct.id,
        monthlyPriceId: advMonthly.id,
        yearlyPriceId: advYearly.id,
      },
    };

    console.log("✅ Catalog successfully created in Paddle Sandbox!");
    console.log("------------------------------------------------");
    console.log(JSON.stringify(result, null, 2));
    console.log("------------------------------------------------");
  } catch (error) {
    console.error("❌ Failed to create catalog:", error);
  }
}

seedCatalog();

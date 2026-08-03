import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  botToken: required("BOT_TOKEN"),
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  adminIds: (process.env.ADMIN_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .map(Number),
  projectName: process.env.PROJECT_NAME ?? "404 Coin",
  contractAddress: process.env.CONTRACT_ADDRESS ?? "Not set yet",
  buyLink: process.env.BUY_LINK ?? "Not set yet",
  chartLink: process.env.CHART_LINK ?? "Not set yet",
  socialsLink: process.env.SOCIALS_LINK ?? "Not set yet",
};

export function isAdmin(userId: number | undefined): boolean {
  return userId !== undefined && config.adminIds.includes(userId);
}

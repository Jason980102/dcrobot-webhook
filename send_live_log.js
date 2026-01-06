// index.js
// 讀取 Pingcord 通知頻道，判斷最後一次「直播通知」距今幾天，然後用 webhook 發訊息

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.PINGCORD_CHANNEL_ID || "1333486629406376091";

// 你要每天 6 點發「第幾天沒開台」：
// 規則：找最後一次「直播通知」訊息時間 -> 算距今幾天
// Pingcord 直播通知常見字樣： "is now live on YouTube" / "YouTube Live"
// 影片通知常見字樣： "published a video"

if (!WEBHOOK_URL || !BOT_TOKEN || !CHANNEL_ID) {
  console.error("Missing env vars. Need DISCORD_WEBHOOK_URL, DISCORD_BOT_TOKEN, PINGCORD_CHANNEL_ID");
  process.exit(1);
}

function isPingcordLiveMessage(msg) {
  // Pingcord 是 webhook bot 的話，通常 msg.author.bot = true
  const content = (msg.content || "").toLowerCase();

  // embeds 內文也可能有關鍵字
  const embedsText = (msg.embeds || [])
    .map((e) => [e.title, e.description, e?.footer?.text, e?.author?.name].filter(Boolean).join(" "))
    .join(" ")
    .toLowerCase();

  const hay = `${content}\n${embedsText}`;

  const looksLikeLive =
    hay.includes("is now live on youtube") ||
    hay.includes("youtube live") ||
    hay.includes("正在直播");

  const looksLikeVideo =
    hay.includes("published a video") ||
    hay.includes("發布了影片") ||
    hay.includes("剛剛發佈了影片");

  // 只要「直播」而且不是「影片」
  return looksLikeLive && !looksLikeVideo;
}

async function discordGetRecentMessages(limit = 50) {
  const url = `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages?limit=${limit}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bot ${BOT_TOKEN}` },
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Discord API failed ${res.status} ${res.statusText} ${t}`);
  }
  return await res.json();
}

function daysBetweenTW(fromISO, to = new Date()) {
  // 用台灣日期來算「第幾天」
  const tz = "Asia/Taipei";
  const d1 = new Date(fromISO);
  const a = new Date(d1.toLocaleString("en-US", { timeZone: tz }));
  const b = new Date(to.toLocaleString("en-US", { timeZone: tz }));

  // 只取日期（00:00）
  const a0 = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const b0 = new Date(b.getFullYear(), b.getMonth(), b.getDate());

  const diffMs = b0 - a0;
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

async function postWebhook(text) {
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: text }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Webhook failed ${res.status} ${res.statusText} ${t}`);
  }
}

async function main() {
  const msgs = await discordGetRecentMessages(50);

  const liveMsg = msgs.find(isPingcordLiveMessage);

  const nowTW = new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });

  if (!liveMsg) {
    // 找不到任何直播通知（代表近期50則沒有）
    await postWebhook(`📌 ${nowTW}\n我在最近的訊息裡找不到「直播通知」，可能要把抓取範圍加大，或 Pingcord 的直播字樣不一樣。`);
    console.log("No live message found in recent 50.");
    return;
  }

  const days = daysBetweenTW(liveMsg.timestamp);

  if (days === 0) {
    await postWebhook(`✅ ${nowTW}\n今天有開台（Pingcord 有直播通知）。`);
  } else {
    await postWebhook(`📅 ${nowTW}\n小毛已經第 **${days}** 天沒開台。`);
  }

  console.log("Done. Days since last live:", days);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

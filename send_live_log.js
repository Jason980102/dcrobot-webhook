// send_live_log.js
// 讀 Pingcord 通知頻道，找最後一次「直播通知」的日期，計算台灣時間已經幾天沒開台，然後用 webhook 發訊息。

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.PINGCORD_CHANNEL_ID;

if (!WEBHOOK_URL || !BOT_TOKEN || !CHANNEL_ID) {
  console.error("Missing env vars. Need DISCORD_WEBHOOK_URL, DISCORD_BOT_TOKEN, PINGCORD_CHANNEL_ID");
  process.exit(1);
}

// ---- Taiwan date helpers ----
function toTWDateString(date) {
  // Convert a JS Date (UTC-based) into Taiwan "YYYY-MM-DD" by adding +8 hours
  const tw = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const y = tw.getUTCFullYear();
  const m = String(tw.getUTCMonth() + 1).padStart(2, "0");
  const d = String(tw.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysBetweenTW(dateA, dateB) {
  // dateA, dateB are "YYYY-MM-DD"
  const [ay, am, ad] = dateA.split("-").map(Number);
  const [by, bm, bd] = dateB.split("-").map(Number);

  // Treat them as UTC midnight dates for stable day-diff
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.floor((b - a) / (24 * 60 * 60 * 1000));
}

function isPingcordLiveMessage(msg) {
  const content = (msg.content || "").toLowerCase();

  const embedTexts = (msg.embeds || []).map(e => {
    const parts = [
      e.title,
      e.description,
      e.author?.name,
      e.footer?.text,
    ].filter(Boolean);
    return parts.join(" ").toLowerCase();
  }).join(" ");

  const text = `${content} ${embedTexts}`;

  // ✅ Live patterns (EN + ZH)
  const looksLikeLive =
    text.includes("is now live on youtube") ||
    text.includes("youtube live") ||
    text.includes("is now live") ||
    text.includes("正在直播") ||
    text.includes("直播中") ||
    text.includes("開台") ||
    text.includes("live on youtube");

  // ❌ Video upload patterns (avoid)
  const looksLikeVideo =
    text.includes("published a video") ||
    text.includes("發佈了影片") ||
    text.includes("發布了影片") ||
    text.includes("uploaded a video");

  return looksLikeLive && !looksLikeVideo;
}


// ---- Discord API helpers ----
async function discordGet(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bot ${BOT_TOKEN}` },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Discord GET failed ${res.status}: ${t}`);
  }
  return res.json();
}

async function postWebhook(content) {
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Webhook POST failed ${res.status}: ${t}`);
  }
}

// Fetch messages with pagination until we find last live message (or stop)
async function findLastLiveMessage(maxPages = 15, pageSize = 100) {
  let before = null;

  for (let i = 0; i < maxPages; i++) {
    const url = new URL(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`);
    url.searchParams.set("limit", String(pageSize));
    if (before) url.searchParams.set("before", before);

    const msgs = await discordGet(url.toString());
    if (!Array.isArray(msgs) || msgs.length === 0) return null;

    for (const msg of msgs) {
      if (isPingcordLiveMessage(msg)) return msg;
    }

    // next page
    before = msgs[msgs.length - 1].id;
  }

  return null;
}

(async () => {
  try {
    const lastLive = await findLastLiveMessage();

    const todayTW = toTWDateString(new Date());

    if (!lastLive) {
      await postWebhook(`📌 【小毛開台監控】\n找不到任何「直播通知」紀錄（Pingcord）。請確認頻道 ID 正確，且 bot 有讀取歷史訊息權限。`);
      return;
    }

    const lastLiveTime = new Date(lastLive.timestamp);
    const lastLiveTW = toTWDateString(lastLiveTime);
    const days = daysBetweenTW(lastLiveTW, todayTW);

    // message format
    if (days <= 0) {
      await postWebhook(`✅ 【小毛開台監控】\n今天終於開台了（上次直播時間：${lastLiveTW}）`);
    } else {
      await postWebhook(`😴 【小毛開台監控】\n欸欸欸 麻吉們 這咖今天已經第 ${days} 天沒開台了😡（上次直播時間：${lastLiveTW}）`);
    }
  } catch (err) {
    console.error(err);
    const msg = (err && err.message) ? err.message : String(err);
    await postWebhook(`⚠️ 【小毛開台監控】執行失敗：${msg}`);
    process.exit(1);
  }
})();

import requests
import json
from datetime import datetime, timezone, timedelta

WEBHOOK_URL = "⬅️這裡貼你的 Discord Webhook URL"

# 假資料，之後我們會換成「實際擷取 Pingcord embed」
payload = {
    "content": "📺 今日直播紀錄檢查",
    "embeds": [
        {
            "title": "尚未偵測到新的直播通知",
            "description": "今天 Pingcord 尚未推送 YouTube Live embed。",
            "color": 0xff5555,
            "footer": {
                "text": datetime.now(
                    timezone(timedelta(hours=8))
                ).strftime("Asia/Taipei %Y-%m-%d %H:%M")
            }
        }
    ]
}

requests.post(WEBHOOK_URL, json=payload)

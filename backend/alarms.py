"""闹钟存储：持久化到 data/alarms.json，支持 once / daily / weekly。"""
import json
from datetime import datetime, timedelta

from config import Config, data_dir


class AlarmStore:
    def __init__(self):
        self.path = data_dir() / "alarms.json"
        self.items: list[dict] = []
        self._load()

    def add(self, trigger_dt: datetime, message: str, repeat: str = "once") -> None:
        if not isinstance(trigger_dt, datetime):
            raise ValueError("trigger_dt 必须是 datetime 对象")
        if repeat not in {"once", "daily", "weekly"}:
            repeat = "once"
        self.items.append(
            {
                "trigger_time": trigger_dt,
                "message": message or Config.ALARM_DEFAULT_MESSAGE,
                "repeat": repeat,
            }
        )
        self._save()
        print(f"⏰ 闹钟已添加：{trigger_dt:%Y-%m-%d %H:%M} - {message}")

    def check(self, now: datetime) -> list[dict]:
        """返回到期的闹钟并推进重复闹钟的下一次时间。"""
        triggered, remaining = [], []
        for alarm in self.items:
            if alarm["trigger_time"] > now:
                remaining.append(alarm)
                continue
            triggered.append(alarm)
            if alarm["repeat"] == "daily":
                alarm["trigger_time"] += timedelta(days=1)
                remaining.append(alarm)
            elif alarm["repeat"] == "weekly":
                alarm["trigger_time"] += timedelta(weeks=1)
                remaining.append(alarm)
        self.items = remaining
        if triggered:
            self._save()
        return triggered

    def _save(self) -> None:
        data = [
            {
                "trigger_time": a["trigger_time"].isoformat(),
                "message": a["message"],
                "repeat": a["repeat"],
            }
            for a in self.items
        ]
        try:
            self.path.write_text(
                json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
            )
        except Exception as e:
            print(f"⚠️ 保存闹钟失败: {e}")

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            for item in json.loads(self.path.read_text(encoding="utf-8")):
                self.items.append(
                    {
                        "trigger_time": datetime.fromisoformat(item["trigger_time"]),
                        "message": item["message"],
                        "repeat": item.get("repeat", "once"),
                    }
                )
            print(f"⏰ 已恢复 {len(self.items)} 个闹钟")
        except Exception as e:
            print(f"⚠️ 加载闹钟失败: {e}")

import base64
import io
from PIL import Image


def _screenshot():
    """懒加载 pyautogui：无显示器（服务器 / 无 GUI 环境）时不应让整个服务起不来。"""
    import pyautogui

    return pyautogui.screenshot()

class ToolBox:
    @staticmethod
    def capture_screen_base64():
        """截取屏幕，压缩并转为 Base64 (适配 Gemini API)"""
        try:
            #  截图
            screenshot = _screenshot()
            
            #  压缩 
            width, height = screenshot.size
            if width > 640:
                scale = 640 / width
                screenshot = screenshot.resize((640, int(height * scale)))
            
            #  转 Base64
            buffered = io.BytesIO()
            screenshot.save(buffered, format="JPEG", quality=70)
            img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
            return img_str
        except Exception as e:
            print(f"❌ 截图失败: {e}")
            return None
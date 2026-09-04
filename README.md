# 🌀 Maze Game 3D

لعبة متاهة ثلاثية الأبعاد بمنظور شخص أول وثالث — مبنية على **Three.js + JavaScript** الخالص.
قابلة للنشر كـ **Telegram Mini Game**.

---

## 🗂 هيكل المشروع

```
Maze_Game/
│
├── index.html                  ← نقطة دخول التطبيق
│
├── src/
│   ├── main.js                 ← ESM entry (يستورد Three.js ويحمّل الملفات)
│   ├── Game.js                 ← Bootstrap & تربيط الأزرار
│   ├── core/
│   │   ├── Engine.js           ← Renderer + RAF loop
│   │   ├── SceneManager.js     ← إضاءة وإدارة المشهد
│   │   ├── InputManager.js     ← Keyboard / Mouse / Touch
│   │   ├── AssetLoader.js      ← تحميل GLTF والـ textures
│   │   └── AudioManager.js     ← Web Audio API
│   ├── maze/
│   │   ├── MazeGenerator.js    ← Recursive Backtracker algorithm
│   │   ├── MazeRenderer.js     ← تحويل Grid → Three.js geometry
│   │   └── MazeCollision.js    ← AABB collision detection
│   ├── camera/
│   │   ├── CameraController.js ← مُبدِّل بين FP و TP
│   │   ├── FirstPersonCamera.js← FPS camera + mouse look
│   │   └── ThirdPersonCamera.js← Orbit camera + smooth follow
│   └── telegram/
│       └── TelegramAPI.js      ← Telegram Mini App SDK
│
├── characters/                 ← شخصيات اللعبة
│   ├── CharacterManager.js     ← تحميل GLTF + Animation Mixer
│   ├── PlayerController.js     ← حركة اللاعب + state machine
│   └── models/hero/            ← ضع ملف hero.glb هنا
│
├── levels/                     ← بيانات المراحل
│   ├── LevelManager.js         ← تحميل وإدارة المراحل
│   └── data/
│       ├── Level1.js           ← 8×8 سهل
│       ├── Level2.js           ← 12×12 متوسط
│       └── Level3.js           ← 16×16 صعب
│
├── ui/                         ← الواجهة
│   ├── styles/                 ← main.css / hud.css / menu.css
│   └── scripts/                ← UI / HUD / Minimap / Settings / Joystick
│
└── libs/
    ├── three.min.js            ← Three.js core (مُثبَّت تلقائياً)
    └── addons/                 ← GLTFLoader / OrbitControls / PointerLockControls
```

---

## 🚀 تشغيل محلياً

```bash
# تشغيل الـ dev server (يجب تشغيله لأن importmap يحتاج HTTP)
npm run dev
# ثم افتح: http://localhost:3000
```

> ⚠️ لا تفتح `index.html` مباشرة كـ file:// — يجب استخدام server بسبب ESM imports

---

## 🎮 التحكم

| الجهاز  | للأمام | للخلف | يمين/يسار | نظرة | كاميرا | تفاعل |
|---------|--------|-------|-----------|------|--------|-------|
| كيبورد  | W / ↑  | S / ↓ | A D       | Mouse| C      | E     |
| موبايل  | Joystick ↑ | ↓ | ← →      | Drag | زر 👁 | زر ⚡ |

---

## 📱 Telegram Mini Game

1. أنشئ Bot عبر `@BotFather`
2. استخدم `/newgame` لإنشاء لعبة
3. ارفع المشروع على أي hosting (Vercel / Netlify / GitHub Pages)
4. ضع الرابط في إعدادات اللعبة في BotFather

---

## ➕ إضافة شخصية

1. ضع ملف GLB في `characters/models/hero/hero.glb`
2. تأكد من وجود clips بأسماء: `idle`, `walk`, `run`
3. اللعبة ستحمله تلقائياً

---

## 🎨 ثيمات المتاهة

| Theme     | الألوان        | المزاج |
|-----------|----------------|--------|
| `default` | بنفسجي داكن   | خيال علمي |
| `dungeon` | بني / برتقالي | زنزانة |
| `ice`     | أزرق شفاف     | جليدي |

---

## 🔧 تقنيات

- **Three.js r167** — 3D engine
- **Web Audio API** — صوت بدون مكتبات
- **Canvas API** — Minimap
- **Telegram Web App SDK** — تكامل تيليقرام
- **localStorage** — حفظ التقدم

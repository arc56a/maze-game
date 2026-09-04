# 📁 ui/ — واجهة المستخدم

## هيكل المجلد

```
ui/
├── styles/
│   ├── main.css    ← المتغيرات، الشاشات، الأزرار، القوائم
│   ├── hud.css     ← عناصر اللعبة: minimap، joystick، crosshair
│   └── menu.css    ← أنيميشن الشاشات، toast، achievements
│
└── scripts/
    ├── UI.js       ← إدارة التنقل بين الشاشات
    ├── HUD.js      ← تحديث عناصر HUD (وقت، مفاتيح، فلاشات)
    ├── Minimap.js  ← رسم الخريطة المصغرة على Canvas
    ├── Settings.js ← حفظ وتطبيق إعدادات اللعبة
    └── Joystick.js ← الـ joystick الافتراضي للموبايل
```

## الشاشات المتاحة

| Screen ID           | الوصف              |
|---------------------|--------------------|
| `screen-menu`       | القائمة الرئيسية   |
| `screen-levels`     | اختيار المرحلة     |
| `screen-settings`   | الإعدادات          |
| `screen-leaderboard`| لوحة المتصدرين     |
| `screen-game`       | اللعبة             |
| `screen-win`        | شاشة الفوز         |
| `screen-lose`       | شاشة الخسارة       |
| `screen-loading`    | التحميل            |

## إضافة شاشة جديدة

1. أضف `<div id="screen-NEW" class="screen">...</div>` في `index.html`
2. في `UI.js` أضف حالة خاصة إذا احتجت
3. استدعِ `UI.showScreen('NEW')` للانتقال إليها

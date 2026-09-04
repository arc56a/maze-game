# 📁 levels/

## هيكل المجلد

```
levels/
├── LevelManager.js           ← المدير الرئيسي للمراحل
│
└── data/
    ├── Level1.js             ← المرحلة 1 (8×8، سهل)
    ├── Level2.js             ← المرحلة 2 (12×12، متوسط)
    └── Level3.js             ← المرحلة 3 (16×16، صعب)
```

## إضافة مرحلة جديدة

أنشئ ملف `levels/data/Level4.js` مثلاً:

```js
LevelManager.register(4, {
  name:        'اسم المرحلة',
  cols:        20,        // عرض المتاهة بعدد الخلايا
  rows:        20,        // طول المتاهة
  seed:        42,        // seed للـ random generator (أي رقم)
  theme:       'default', // 'default' | 'dungeon' | 'ice'
  keys:        4,         // عدد المفاتيح المطلوبة للفتح
  timeGoals:   [240, 180, 90],  // وقت 1⭐, 2⭐, 3⭐ بالثواني
  music:       'bgm_cave',
  description: 'وصف المرحلة',
});
```

ثم أضف السكريبت في `index.html`:
```html
<script src="levels/data/Level4.js"></script>
```

## الثيمات المتاحة
| Theme     | الوصف            |
|-----------|------------------|
| `default` | ألوان بنفسجية داكنة |
| `dungeon` | ألوان بنية قاتمة |
| `ice`     | ألوان زرقاء شفافة |

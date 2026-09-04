# 📁 characters/

## هيكل المجلد

```
characters/
├── CharacterManager.js       ← محمل النماذج ومدير الأنيميشن
├── PlayerController.js       ← حركة اللاعب والـ state machine
│
├── models/
│   └── hero/
│       ├── hero.glb              ← نموذج الشخصية الرئيسية (ضع ملفك هنا)
│       └── animations/           ← ملفات أنيميشن منفصلة (اختياري)
│           ├── idle.glb
│           ├── walk.glb
│           └── run.glb
│
└── textures/
    └── hero_diffuse.png          ← texture الشخصية (إذا كانت منفصلة)
```

## تسمية Animation Clips

يجب أن تحتوي ملف GLB على clips بهذه الأسماء:
| الاسم | الوصف       |
|-------|-------------|
| `idle` | وقوف بدون حركة |
| `walk` | مشي عادي |
| `run`  | جري سريع |

## ملاحظات
- يدعم **GLB** و **GLTF** (يفضل GLB لأنه ملف واحد)
- إذا لم يوجد ملف model، سيستخدم اللعبة **placeholder كبسول بنفسجي** تلقائياً
- استخدم Mixamo.com لتحميل شخصيات وأنيميشن مجاناً

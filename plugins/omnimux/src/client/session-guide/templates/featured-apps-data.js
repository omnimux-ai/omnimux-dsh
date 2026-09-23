/**
 * 7 大王牌精选 AI 应用首页卡片数据源
 * 直接对齐官方发布的内置 AI 应用 (builtin-apps.json)，点击秒级直通极简表单出片
 */

export const FEATURED_APPS_CARDS = Object.freeze([
  {
    "appId": "app-creatify-app-demo",
    "categoryKey": "apps-software",
    "categoryNameZh": "软件应用",
    "titleZh": "手机与网页交互实机演示",
    "titleEn": "App Demo: Interactive UI Screen",
    "descZh": "适用于 SaaS 界面穿屏、手机 App 操作流程实录与软件出海推广",
    "descEn": "High-conversion interactive screen demo for SaaS and mobile apps",
    "coverUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/56/563bcc8673326ea1358efbc69e4fcfc549510d3c06cfe1eeeeb965007e573aa3.webp",
    "previewVideoUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/7a/7adca79d2d106411accf915a79a1b4a40868533f41272864a0ed37cdf20730af.mp4",
    "manifest": {
      "schemaVersion": "1.0.0",
      "appId": "app-creatify-app-demo",
      "version": "1.0.0",
      "workflowBinding": {
        "workspaceId": "ws-app-creatify-app-demo",
        "workflowVersion": 1
      },
      "metadata": {
        "name": "手机与网页交互实机演示",
        "category": "video",
        "description": "适用于 SaaS 界面穿屏、手机 App 操作流程实录与软件出海推广",
        "icon": "video",
        "tags": [
          "creatify",
          "apps-software",
          "e-commerce",
          "viral-video"
        ],
        "author": "OmniMux Official"
      },
      "formSchema": {
        "type": "object",
        "properties": {
          "product_image": {
            "type": "string",
            "title": "商品主图 / 白底图",
            "description": "支持拖拽上传高清商品图，或粘贴电商链接自动解析",
            "widget": "media-uploader",
            "default": "https://files.omnimux.ai/templates/explore-v1/sha256/56/563bcc8673326ea1358efbc69e4fcfc549510d3c06cfe1eeeeb965007e573aa3.webp"
          },
          "copywriting": {
            "type": "string",
            "title": "核心卖点与旁白分镜",
            "description": "填入 1~3 句核心商品卖点，AI 将自动融合至爆款分镜节奏",
            "widget": "textarea",
            "default": "Place your laptop screenshot into this engaging UGC video where a friendly young woman sits in a cozy home working space and presents your digital product on her laptop. Horizontal laptop screenshot/ image works the best."
          },
          "voice": {
            "type": "string",
            "title": "解说人声音色",
            "description": "选择适合该视频情绪的 AI 配音解说音色",
            "widget": "select-single",
            "default": "zh_female_energetic",
            "options": [
              {
                "label": "活力女声（电商促销爆款）",
                "value": "zh_female_energetic"
              },
              {
                "label": "沉稳男声（数码科技大片）",
                "value": "zh_male_calm"
              },
              {
                "label": "亲和闺蜜（达人开箱真实种草）",
                "value": "zh_female_friendly"
              },
              {
                "label": "磁性男声（高端商业质感）",
                "value": "zh_male_deep"
              }
            ]
          },
          "aspect_ratio": {
            "type": "string",
            "title": "视频成片比例",
            "description": "选择适用的平台播放比例",
            "widget": "ratio-cards",
            "default": "9:16",
            "options": [
              {
                "label": "9:16 竖屏 (TikTok / Shorts)",
                "value": "9:16"
              },
              {
                "label": "16:9 横屏 (YouTube / 官网)",
                "value": "16:9"
              },
              {
                "label": "1:1 方屏 (Instagram / 推广)",
                "value": "1:1"
              }
            ]
          }
        },
        "required": [
          "product_image",
          "copywriting"
        ],
        "additionalProperties": false
      },
      "fieldMappings": {
        "product_image": {
          "nodeId": "node-slot-product-image",
          "targetField": "mediaUrl",
          "mappingType": "media",
          "widget": "media-uploader",
          "required": true,
          "defaultValue": "https://files.omnimux.ai/templates/explore-v1/sha256/56/563bcc8673326ea1358efbc69e4fcfc549510d3c06cfe1eeeeb965007e573aa3.webp"
        },
        "copywriting": {
          "nodeId": "node-slot-copywriting",
          "targetField": "content",
          "mappingType": "text",
          "widget": "textarea",
          "required": true,
          "defaultValue": "Place your laptop screenshot into this engaging UGC video where a friendly young woman sits in a cozy home working space and presents your digital product on her laptop. Horizontal laptop screenshot/ image works the best."
        },
        "voice": {
          "nodeId": "node-slot-voice-tts",
          "targetField": "params.voice",
          "mappingType": "param",
          "widget": "select-single",
          "required": false,
          "defaultValue": "zh_female_energetic"
        },
        "aspect_ratio": {
          "nodeId": "node-video-generation-core",
          "targetField": "params.aspectRatio",
          "mappingType": "param",
          "widget": "ratio-cards",
          "required": false,
          "defaultValue": "9:16"
        }
      },
      "showcase": {
        "mode": "carousel",
        "items": [
          {
            "id": "showcase-app-creatify-app-demo-01",
            "title": "爆款成片效果演示",
            "mediaType": "video",
            "mediaUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/7a/7adca79d2d106411accf915a79a1b4a40868533f41272864a0ed37cdf20730af.mp4",
            "posterUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/56/563bcc8673326ea1358efbc69e4fcfc549510d3c06cfe1eeeeb965007e573aa3.webp"
          }
        ]
      }
    }
  },
  {
    "appId": "app-creatify-chasing-product",
    "categoryKey": "hook-intro",
    "categoryNameZh": "黄金开场",
    "titleZh": "巨型商品撞屏与荒诞追逐",
    "titleEn": "Chasing The Product: Impact Hook",
    "descZh": "专治前3秒滑走：巨型商品撞屏、路人惊呼追逐与戏剧性反差",
    "descEn": "Stop scrolling in 3 seconds: Giant product drop and chase drama",
    "coverUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/c3/c39a91e4064def62675ea3cb9c253e67c2919b5886d373199a879c63a383af12.webp",
    "previewVideoUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/ea/ea3fb5d23819086a2ffa88c598bf3728044cde636622a4340787ee10e280a2fd.mp4",
    "manifest": {
      "schemaVersion": "1.0.0",
      "appId": "app-creatify-chasing-product",
      "version": "1.0.0",
      "workflowBinding": {
        "workspaceId": "ws-app-creatify-chasing-product",
        "workflowVersion": 1
      },
      "metadata": {
        "name": "巨型商品撞屏与荒诞追逐",
        "category": "video",
        "description": "专治前3秒滑走：巨型商品撞屏、路人惊呼追逐与戏剧性反差",
        "icon": "video",
        "tags": [
          "creatify",
          "hook-intro",
          "e-commerce",
          "viral-video"
        ],
        "author": "OmniMux Official"
      },
      "formSchema": {
        "type": "object",
        "properties": {
          "product_image": {
            "type": "string",
            "title": "商品主图 / 白底图",
            "description": "支持拖拽上传高清商品图，或粘贴电商链接自动解析",
            "widget": "media-uploader",
            "default": "https://files.omnimux.ai/templates/explore-v1/sha256/c3/c39a91e4064def62675ea3cb9c253e67c2919b5886d373199a879c63a383af12.webp"
          },
          "copywriting": {
            "type": "string",
            "title": "核心卖点与旁白分镜",
            "description": "填入 1~3 句核心商品卖点，AI 将自动融合至爆款分镜节奏",
            "widget": "textarea",
            "default": "Showcase your product being desperately chased by a group of adult with intense craving energy. This creates a powerful “everyone wants this” vibe that instantly triggers desire and FOMO. Perfect for most handheld products."
          },
          "voice": {
            "type": "string",
            "title": "解说人声音色",
            "description": "选择适合该视频情绪的 AI 配音解说音色",
            "widget": "select-single",
            "default": "zh_female_energetic",
            "options": [
              {
                "label": "活力女声（电商促销爆款）",
                "value": "zh_female_energetic"
              },
              {
                "label": "沉稳男声（数码科技大片）",
                "value": "zh_male_calm"
              },
              {
                "label": "亲和闺蜜（达人开箱真实种草）",
                "value": "zh_female_friendly"
              },
              {
                "label": "磁性男声（高端商业质感）",
                "value": "zh_male_deep"
              }
            ]
          },
          "aspect_ratio": {
            "type": "string",
            "title": "视频成片比例",
            "description": "选择适用的平台播放比例",
            "widget": "ratio-cards",
            "default": "9:16",
            "options": [
              {
                "label": "9:16 竖屏 (TikTok / Shorts)",
                "value": "9:16"
              },
              {
                "label": "16:9 横屏 (YouTube / 官网)",
                "value": "16:9"
              },
              {
                "label": "1:1 方屏 (Instagram / 推广)",
                "value": "1:1"
              }
            ]
          }
        },
        "required": [
          "product_image",
          "copywriting"
        ],
        "additionalProperties": false
      },
      "fieldMappings": {
        "product_image": {
          "nodeId": "node-slot-product-image",
          "targetField": "mediaUrl",
          "mappingType": "media",
          "widget": "media-uploader",
          "required": true,
          "defaultValue": "https://files.omnimux.ai/templates/explore-v1/sha256/c3/c39a91e4064def62675ea3cb9c253e67c2919b5886d373199a879c63a383af12.webp"
        },
        "copywriting": {
          "nodeId": "node-slot-copywriting",
          "targetField": "content",
          "mappingType": "text",
          "widget": "textarea",
          "required": true,
          "defaultValue": "Showcase your product being desperately chased by a group of adult with intense craving energy. This creates a powerful “everyone wants this” vibe that instantly triggers desire and FOMO. Perfect for most handheld products."
        },
        "voice": {
          "nodeId": "node-slot-voice-tts",
          "targetField": "params.voice",
          "mappingType": "param",
          "widget": "select-single",
          "required": false,
          "defaultValue": "zh_female_energetic"
        },
        "aspect_ratio": {
          "nodeId": "node-video-generation-core",
          "targetField": "params.aspectRatio",
          "mappingType": "param",
          "widget": "ratio-cards",
          "required": false,
          "defaultValue": "9:16"
        }
      },
      "showcase": {
        "mode": "carousel",
        "items": [
          {
            "id": "showcase-app-creatify-chasing-product-01",
            "title": "爆款成片效果演示",
            "mediaType": "video",
            "mediaUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/ea/ea3fb5d23819086a2ffa88c598bf3728044cde636622a4340787ee10e280a2fd.mp4",
            "posterUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/c3/c39a91e4064def62675ea3cb9c253e67c2919b5886d373199a879c63a383af12.webp"
          }
        ]
      }
    }
  },
  {
    "appId": "app-creatify-ugc-selfie",
    "categoryKey": "ugc-review",
    "categoryNameZh": "真实种草",
    "titleZh": "海外达人自拍第一视角口播评测",
    "titleEn": "UGC Selfie: Authentic Product Review",
    "descZh": "降低买家防备心：海外真实达人自拍口播、手持展示与痛点实测吐槽",
    "descEn": "Authentic first-person selfie review to boost trust and sales",
    "coverUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/3e/3ef5c3bcbc67c5d9b2262ba49541b7d665234367131d3b605423c3e89888b8bb.webp",
    "previewVideoUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/24/24643db0f5a5527af731d822d4f8acb864b6316673eeb527f47bc45ce719b22e.mp4",
    "manifest": {
      "schemaVersion": "1.0.0",
      "appId": "app-creatify-ugc-selfie",
      "version": "1.0.0",
      "workflowBinding": {
        "workspaceId": "ws-app-creatify-ugc-selfie",
        "workflowVersion": 1
      },
      "metadata": {
        "name": "海外达人自拍第一视角口播评测",
        "category": "video",
        "description": "降低买家防备心：海外真实达人自拍口播、手持展示与痛点实测吐槽",
        "icon": "video",
        "tags": [
          "creatify",
          "ugc-review",
          "e-commerce",
          "viral-video"
        ],
        "author": "OmniMux Official"
      },
      "formSchema": {
        "type": "object",
        "properties": {
          "product_image": {
            "type": "string",
            "title": "商品主图 / 白底图",
            "description": "支持拖拽上传高清商品图，或粘贴电商链接自动解析",
            "widget": "media-uploader",
            "default": "https://files.omnimux.ai/templates/explore-v1/sha256/3e/3ef5c3bcbc67c5d9b2262ba49541b7d665234367131d3b605423c3e89888b8bb.webp"
          },
          "copywriting": {
            "type": "string",
            "title": "核心卖点与旁白分镜",
            "description": "填入 1~3 句核心商品卖点，AI 将自动融合至爆款分镜节奏",
            "widget": "textarea",
            "default": "A 20s video with casual, authentic UGC yapping style—friendly, natural, and relatable. Alternating front-facing selfie clips with product close-ups. Simply input info to try it out."
          },
          "voice": {
            "type": "string",
            "title": "解说人声音色",
            "description": "选择适合该视频情绪的 AI 配音解说音色",
            "widget": "select-single",
            "default": "zh_female_energetic",
            "options": [
              {
                "label": "活力女声（电商促销爆款）",
                "value": "zh_female_energetic"
              },
              {
                "label": "沉稳男声（数码科技大片）",
                "value": "zh_male_calm"
              },
              {
                "label": "亲和闺蜜（达人开箱真实种草）",
                "value": "zh_female_friendly"
              },
              {
                "label": "磁性男声（高端商业质感）",
                "value": "zh_male_deep"
              }
            ]
          },
          "aspect_ratio": {
            "type": "string",
            "title": "视频成片比例",
            "description": "选择适用的平台播放比例",
            "widget": "ratio-cards",
            "default": "9:16",
            "options": [
              {
                "label": "9:16 竖屏 (TikTok / Shorts)",
                "value": "9:16"
              },
              {
                "label": "16:9 横屏 (YouTube / 官网)",
                "value": "16:9"
              },
              {
                "label": "1:1 方屏 (Instagram / 推广)",
                "value": "1:1"
              }
            ]
          }
        },
        "required": [
          "product_image",
          "copywriting"
        ],
        "additionalProperties": false
      },
      "fieldMappings": {
        "product_image": {
          "nodeId": "node-slot-product-image",
          "targetField": "mediaUrl",
          "mappingType": "media",
          "widget": "media-uploader",
          "required": true,
          "defaultValue": "https://files.omnimux.ai/templates/explore-v1/sha256/3e/3ef5c3bcbc67c5d9b2262ba49541b7d665234367131d3b605423c3e89888b8bb.webp"
        },
        "copywriting": {
          "nodeId": "node-slot-copywriting",
          "targetField": "content",
          "mappingType": "text",
          "widget": "textarea",
          "required": true,
          "defaultValue": "A 20s video with casual, authentic UGC yapping style—friendly, natural, and relatable. Alternating front-facing selfie clips with product close-ups. Simply input info to try it out."
        },
        "voice": {
          "nodeId": "node-slot-voice-tts",
          "targetField": "params.voice",
          "mappingType": "param",
          "widget": "select-single",
          "required": false,
          "defaultValue": "zh_female_energetic"
        },
        "aspect_ratio": {
          "nodeId": "node-video-generation-core",
          "targetField": "params.aspectRatio",
          "mappingType": "param",
          "widget": "ratio-cards",
          "required": false,
          "defaultValue": "9:16"
        }
      },
      "showcase": {
        "mode": "carousel",
        "items": [
          {
            "id": "showcase-app-creatify-ugc-selfie-01",
            "title": "爆款成片效果演示",
            "mediaType": "video",
            "mediaUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/24/24643db0f5a5527af731d822d4f8acb864b6316673eeb527f47bc45ce719b22e.mp4",
            "posterUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/3e/3ef5c3bcbc67c5d9b2262ba49541b7d665234367131d3b605423c3e89888b8bb.webp"
          }
        ]
      }
    }
  },
  {
    "appId": "app-creatify-3d-cute-vfx",
    "categoryKey": "cinematic-vfx",
    "categoryNameZh": "视效大片",
    "titleZh": "3D 视效粒子与动态破屏大片",
    "titleEn": "3D VFX: Dynamic Particle Impact",
    "descZh": "营造高端电影质感：3D 光影粒子环绕、超现实悬浮与破屏动效",
    "descEn": "Cinematic 3D particle impact and floating product commercial",
    "coverUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/ec/ec701a956f0be2d24dc4482ea815bed9129d15e26092f58961eed67232e84388.webp",
    "previewVideoUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/3b/3be607ed9780c9f5fd32d2d3fe8ec53bf91f48daa0e774c6d3162790b6cf044a.mp4",
    "manifest": {
      "schemaVersion": "1.0.0",
      "appId": "app-creatify-3d-cute-vfx",
      "version": "1.0.0",
      "workflowBinding": {
        "workspaceId": "ws-app-creatify-3d-cute-vfx",
        "workflowVersion": 1
      },
      "metadata": {
        "name": "3D 视效粒子与动态破屏大片",
        "category": "video",
        "description": "营造高端电影质感：3D 光影粒子环绕、超现实悬浮与破屏动效",
        "icon": "video",
        "tags": [
          "creatify",
          "cinematic-vfx",
          "e-commerce",
          "viral-video"
        ],
        "author": "OmniMux Official"
      },
      "formSchema": {
        "type": "object",
        "properties": {
          "product_image": {
            "type": "string",
            "title": "商品主图 / 白底图",
            "description": "支持拖拽上传高清商品图，或粘贴电商链接自动解析",
            "widget": "media-uploader",
            "default": "https://files.omnimux.ai/templates/explore-v1/sha256/ec/ec701a956f0be2d24dc4482ea815bed9129d15e26092f58961eed67232e84388.webp"
          },
          "copywriting": {
            "type": "string",
            "title": "核心卖点与旁白分镜",
            "description": "填入 1~3 句核心商品卖点，AI 将自动融合至爆款分镜节奏",
            "widget": "textarea",
            "default": "Bring your porduct to life with movie-quality 3D characters facing relatable daily struggles. Easily fit your product or app into the storyline as the ultimate hero, creating an emotional connection with your audience through heartwarming animation."
          },
          "voice": {
            "type": "string",
            "title": "解说人声音色",
            "description": "选择适合该视频情绪的 AI 配音解说音色",
            "widget": "select-single",
            "default": "zh_female_energetic",
            "options": [
              {
                "label": "活力女声（电商促销爆款）",
                "value": "zh_female_energetic"
              },
              {
                "label": "沉稳男声（数码科技大片）",
                "value": "zh_male_calm"
              },
              {
                "label": "亲和闺蜜（达人开箱真实种草）",
                "value": "zh_female_friendly"
              },
              {
                "label": "磁性男声（高端商业质感）",
                "value": "zh_male_deep"
              }
            ]
          },
          "aspect_ratio": {
            "type": "string",
            "title": "视频成片比例",
            "description": "选择适用的平台播放比例",
            "widget": "ratio-cards",
            "default": "9:16",
            "options": [
              {
                "label": "9:16 竖屏 (TikTok / Shorts)",
                "value": "9:16"
              },
              {
                "label": "16:9 横屏 (YouTube / 官网)",
                "value": "16:9"
              },
              {
                "label": "1:1 方屏 (Instagram / 推广)",
                "value": "1:1"
              }
            ]
          }
        },
        "required": [
          "product_image",
          "copywriting"
        ],
        "additionalProperties": false
      },
      "fieldMappings": {
        "product_image": {
          "nodeId": "node-slot-product-image",
          "targetField": "mediaUrl",
          "mappingType": "media",
          "widget": "media-uploader",
          "required": true,
          "defaultValue": "https://files.omnimux.ai/templates/explore-v1/sha256/ec/ec701a956f0be2d24dc4482ea815bed9129d15e26092f58961eed67232e84388.webp"
        },
        "copywriting": {
          "nodeId": "node-slot-copywriting",
          "targetField": "content",
          "mappingType": "text",
          "widget": "textarea",
          "required": true,
          "defaultValue": "Bring your porduct to life with movie-quality 3D characters facing relatable daily struggles. Easily fit your product or app into the storyline as the ultimate hero, creating an emotional connection with your audience through heartwarming animation."
        },
        "voice": {
          "nodeId": "node-slot-voice-tts",
          "targetField": "params.voice",
          "mappingType": "param",
          "widget": "select-single",
          "required": false,
          "defaultValue": "zh_female_energetic"
        },
        "aspect_ratio": {
          "nodeId": "node-video-generation-core",
          "targetField": "params.aspectRatio",
          "mappingType": "param",
          "widget": "ratio-cards",
          "required": false,
          "defaultValue": "9:16"
        }
      },
      "showcase": {
        "mode": "carousel",
        "items": [
          {
            "id": "showcase-app-creatify-3d-cute-vfx-01",
            "title": "爆款成片效果演示",
            "mediaType": "video",
            "mediaUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/3b/3be607ed9780c9f5fd32d2d3fe8ec53bf91f48daa0e774c6d3162790b6cf044a.mp4",
            "posterUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/ec/ec701a956f0be2d24dc4482ea815bed9129d15e26092f58961eed67232e84388.webp"
          }
        ]
      }
    }
  },
  {
    "appId": "app-creatify-apparel-tryon",
    "categoryKey": "fashion-try-on",
    "categoryNameZh": "模特试穿",
    "titleZh": "模特动态走秀穿搭与场景变装",
    "titleEn": "Fashion Apparel: Runway Try-On",
    "descZh": "专攻服饰鞋包转化：模特街头走秀、多场景无缝换装与面料微距质感",
    "descEn": "Dynamic runway fashion try-on with scene transitions",
    "coverUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/36/36e32bd4d7f9f7ce8a1455729178967c2effce57a4df7c3cc4774beb441416fc.webp",
    "previewVideoUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/f5/f5c2aff3e8f62c8a696d3ee3444b92368d62287eb0c3b84bd43eb6b14c34b7fb.mp4",
    "manifest": {
      "schemaVersion": "1.0.0",
      "appId": "app-creatify-apparel-tryon",
      "version": "1.0.0",
      "workflowBinding": {
        "workspaceId": "ws-app-creatify-apparel-tryon",
        "workflowVersion": 1
      },
      "metadata": {
        "name": "模特动态走秀穿搭与场景变装",
        "category": "video",
        "description": "专攻服饰鞋包转化：模特街头走秀、多场景无缝换装与面料微距质感",
        "icon": "video",
        "tags": [
          "creatify",
          "fashion-try-on",
          "e-commerce",
          "viral-video"
        ],
        "author": "OmniMux Official"
      },
      "formSchema": {
        "type": "object",
        "properties": {
          "product_image": {
            "type": "string",
            "title": "商品主图 / 白底图",
            "description": "支持拖拽上传高清商品图，或粘贴电商链接自动解析",
            "widget": "media-uploader",
            "default": "https://files.omnimux.ai/templates/explore-v1/sha256/36/36e32bd4d7f9f7ce8a1455729178967c2effce57a4df7c3cc4774beb441416fc.webp"
          },
          "copywriting": {
            "type": "string",
            "title": "核心卖点与旁白分镜",
            "description": "填入 1~3 句核心商品卖点，AI 将自动融合至爆款分镜节奏",
            "widget": "textarea",
            "default": "Multiple angle and scene photos of clothing models. Upload your product to experience it."
          },
          "voice": {
            "type": "string",
            "title": "解说人声音色",
            "description": "选择适合该视频情绪的 AI 配音解说音色",
            "widget": "select-single",
            "default": "zh_female_energetic",
            "options": [
              {
                "label": "活力女声（电商促销爆款）",
                "value": "zh_female_energetic"
              },
              {
                "label": "沉稳男声（数码科技大片）",
                "value": "zh_male_calm"
              },
              {
                "label": "亲和闺蜜（达人开箱真实种草）",
                "value": "zh_female_friendly"
              },
              {
                "label": "磁性男声（高端商业质感）",
                "value": "zh_male_deep"
              }
            ]
          },
          "aspect_ratio": {
            "type": "string",
            "title": "视频成片比例",
            "description": "选择适用的平台播放比例",
            "widget": "ratio-cards",
            "default": "9:16",
            "options": [
              {
                "label": "9:16 竖屏 (TikTok / Shorts)",
                "value": "9:16"
              },
              {
                "label": "16:9 横屏 (YouTube / 官网)",
                "value": "16:9"
              },
              {
                "label": "1:1 方屏 (Instagram / 推广)",
                "value": "1:1"
              }
            ]
          }
        },
        "required": [
          "product_image",
          "copywriting"
        ],
        "additionalProperties": false
      },
      "fieldMappings": {
        "product_image": {
          "nodeId": "node-slot-product-image",
          "targetField": "mediaUrl",
          "mappingType": "media",
          "widget": "media-uploader",
          "required": true,
          "defaultValue": "https://files.omnimux.ai/templates/explore-v1/sha256/36/36e32bd4d7f9f7ce8a1455729178967c2effce57a4df7c3cc4774beb441416fc.webp"
        },
        "copywriting": {
          "nodeId": "node-slot-copywriting",
          "targetField": "content",
          "mappingType": "text",
          "widget": "textarea",
          "required": true,
          "defaultValue": "Multiple angle and scene photos of clothing models. Upload your product to experience it."
        },
        "voice": {
          "nodeId": "node-slot-voice-tts",
          "targetField": "params.voice",
          "mappingType": "param",
          "widget": "select-single",
          "required": false,
          "defaultValue": "zh_female_energetic"
        },
        "aspect_ratio": {
          "nodeId": "node-video-generation-core",
          "targetField": "params.aspectRatio",
          "mappingType": "param",
          "widget": "ratio-cards",
          "required": false,
          "defaultValue": "9:16"
        }
      },
      "showcase": {
        "mode": "carousel",
        "items": [
          {
            "id": "showcase-app-creatify-apparel-tryon-01",
            "title": "爆款成片效果演示",
            "mediaType": "video",
            "mediaUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/f5/f5c2aff3e8f62c8a696d3ee3444b92368d62287eb0c3b84bd43eb6b14c34b7fb.mp4",
            "posterUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/36/36e32bd4d7f9f7ce8a1455729178967c2effce57a4df7c3cc4774beb441416fc.webp"
          }
        ]
      }
    }
  },
  {
    "appId": "app-creatify-product-spotlight",
    "categoryKey": "industry-packs",
    "categoryNameZh": "行业精选",
    "titleZh": "15秒焦点商业大促带货广告",
    "titleEn": "15s Product Spotlight: Commercial Ad",
    "descZh": "电商大促爆款标配：强节奏多镜头分镜、核心卖点连续轰炸与高光特写",
    "descEn": "15-second high-energy product spotlight and promo ad",
    "coverUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/de/de868d4d2bbfc79b25fed342cb58ff096fe38b05cb9ec0f3d5a0e628586414e0.webp",
    "previewVideoUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/85/8520202af50b49c3fa7c9e3aadb22bc0a631a7bc22556247b99d1e439f51ef1c.mp4",
    "manifest": {
      "schemaVersion": "1.0.0",
      "appId": "app-creatify-product-spotlight",
      "version": "1.0.0",
      "workflowBinding": {
        "workspaceId": "ws-app-creatify-product-spotlight",
        "workflowVersion": 1
      },
      "metadata": {
        "name": "15秒焦点商业大促带货广告",
        "category": "video",
        "description": "电商大促爆款标配：强节奏多镜头分镜、核心卖点连续轰炸与高光特写",
        "icon": "video",
        "tags": [
          "creatify",
          "industry-packs",
          "e-commerce",
          "viral-video"
        ],
        "author": "OmniMux Official"
      },
      "formSchema": {
        "type": "object",
        "properties": {
          "product_image": {
            "type": "string",
            "title": "商品主图 / 白底图",
            "description": "支持拖拽上传高清商品图，或粘贴电商链接自动解析",
            "widget": "media-uploader",
            "default": "https://files.omnimux.ai/templates/explore-v1/sha256/de/de868d4d2bbfc79b25fed342cb58ff096fe38b05cb9ec0f3d5a0e628586414e0.webp"
          },
          "copywriting": {
            "type": "string",
            "title": "核心卖点与旁白分镜",
            "description": "填入 1~3 句核心商品卖点，AI 将自动融合至爆款分镜节奏",
            "widget": "textarea",
            "default": "A 15-second commercially styled ad with professional dynamic camera work, showcasing your product's selling points. Simply upload product images, input storyline settings, and characters to get a stunning professional-grade ad for your product."
          },
          "voice": {
            "type": "string",
            "title": "解说人声音色",
            "description": "选择适合该视频情绪的 AI 配音解说音色",
            "widget": "select-single",
            "default": "zh_female_energetic",
            "options": [
              {
                "label": "活力女声（电商促销爆款）",
                "value": "zh_female_energetic"
              },
              {
                "label": "沉稳男声（数码科技大片）",
                "value": "zh_male_calm"
              },
              {
                "label": "亲和闺蜜（达人开箱真实种草）",
                "value": "zh_female_friendly"
              },
              {
                "label": "磁性男声（高端商业质感）",
                "value": "zh_male_deep"
              }
            ]
          },
          "aspect_ratio": {
            "type": "string",
            "title": "视频成片比例",
            "description": "选择适用的平台播放比例",
            "widget": "ratio-cards",
            "default": "9:16",
            "options": [
              {
                "label": "9:16 竖屏 (TikTok / Shorts)",
                "value": "9:16"
              },
              {
                "label": "16:9 横屏 (YouTube / 官网)",
                "value": "16:9"
              },
              {
                "label": "1:1 方屏 (Instagram / 推广)",
                "value": "1:1"
              }
            ]
          }
        },
        "required": [
          "product_image",
          "copywriting"
        ],
        "additionalProperties": false
      },
      "fieldMappings": {
        "product_image": {
          "nodeId": "node-slot-product-image",
          "targetField": "mediaUrl",
          "mappingType": "media",
          "widget": "media-uploader",
          "required": true,
          "defaultValue": "https://files.omnimux.ai/templates/explore-v1/sha256/de/de868d4d2bbfc79b25fed342cb58ff096fe38b05cb9ec0f3d5a0e628586414e0.webp"
        },
        "copywriting": {
          "nodeId": "node-slot-copywriting",
          "targetField": "content",
          "mappingType": "text",
          "widget": "textarea",
          "required": true,
          "defaultValue": "A 15-second commercially styled ad with professional dynamic camera work, showcasing your product's selling points. Simply upload product images, input storyline settings, and characters to get a stunning professional-grade ad for your product."
        },
        "voice": {
          "nodeId": "node-slot-voice-tts",
          "targetField": "params.voice",
          "mappingType": "param",
          "widget": "select-single",
          "required": false,
          "defaultValue": "zh_female_energetic"
        },
        "aspect_ratio": {
          "nodeId": "node-video-generation-core",
          "targetField": "params.aspectRatio",
          "mappingType": "param",
          "widget": "ratio-cards",
          "required": false,
          "defaultValue": "9:16"
        }
      },
      "showcase": {
        "mode": "carousel",
        "items": [
          {
            "id": "showcase-app-creatify-product-spotlight-01",
            "title": "爆款成片效果演示",
            "mediaType": "video",
            "mediaUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/85/8520202af50b49c3fa7c9e3aadb22bc0a631a7bc22556247b99d1e439f51ef1c.mp4",
            "posterUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/de/de868d4d2bbfc79b25fed342cb58ff096fe38b05cb9ec0f3d5a0e628586414e0.webp"
          }
        ]
      }
    }
  },
  {
    "appId": "app-creatify-fall-down-durability",
    "categoryKey": "durability-test",
    "categoryNameZh": "硬核评测",
    "titleZh": "高空跌落耐用防摔与折扣实测",
    "titleEn": "Fall Down: Durability & Discount Showcase",
    "descZh": "建立极强品质信任：高空跌落耐摔、极限冲击与实拍折扣力度揭晓",
    "descEn": "High impact drop durability test to prove solid product quality",
    "coverUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/e5/e56bb4263c329b23992d51a20496ad4822b62fa0d6195a5cf617c7b203eb027a.webp",
    "previewVideoUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/8b/8b4186752b7953ad7eb34102abe73ff4a6375f9280cca3eb0bcd22e224d5a351.mp4",
    "manifest": {
      "schemaVersion": "1.0.0",
      "appId": "app-creatify-fall-down-durability",
      "version": "1.0.0",
      "workflowBinding": {
        "workspaceId": "ws-app-creatify-fall-down-durability",
        "workflowVersion": 1
      },
      "metadata": {
        "name": "高空跌落耐用防摔与折扣实测",
        "category": "video",
        "description": "建立极强品质信任：高空跌落耐摔、极限冲击与实拍折扣力度揭晓",
        "icon": "video",
        "tags": [
          "creatify",
          "durability-test",
          "e-commerce",
          "viral-video"
        ],
        "author": "OmniMux Official"
      },
      "formSchema": {
        "type": "object",
        "properties": {
          "product_image": {
            "type": "string",
            "title": "商品主图 / 白底图",
            "description": "支持拖拽上传高清商品图，或粘贴电商链接自动解析",
            "widget": "media-uploader",
            "default": "https://files.omnimux.ai/templates/explore-v1/sha256/e5/e56bb4263c329b23992d51a20496ad4822b62fa0d6195a5cf617c7b203eb027a.webp"
          },
          "copywriting": {
            "type": "string",
            "title": "核心卖点与旁白分镜",
            "description": "填入 1~3 句核心商品卖点，AI 将自动融合至爆款分镜节奏",
            "widget": "textarea",
            "default": "A 12-second vertical fashion ad template. Suitable for handheld products.\r\n\r\nAfter a natural collision, the model falls backward as the product and discount poster fly toward the camera for two smooth slow-motion close-ups, then return to real-time for a physically realistic landing. Ideal for promoting your product during sale."
          },
          "voice": {
            "type": "string",
            "title": "解说人声音色",
            "description": "选择适合该视频情绪的 AI 配音解说音色",
            "widget": "select-single",
            "default": "zh_female_energetic",
            "options": [
              {
                "label": "活力女声（电商促销爆款）",
                "value": "zh_female_energetic"
              },
              {
                "label": "沉稳男声（数码科技大片）",
                "value": "zh_male_calm"
              },
              {
                "label": "亲和闺蜜（达人开箱真实种草）",
                "value": "zh_female_friendly"
              },
              {
                "label": "磁性男声（高端商业质感）",
                "value": "zh_male_deep"
              }
            ]
          },
          "aspect_ratio": {
            "type": "string",
            "title": "视频成片比例",
            "description": "选择适用的平台播放比例",
            "widget": "ratio-cards",
            "default": "9:16",
            "options": [
              {
                "label": "9:16 竖屏 (TikTok / Shorts)",
                "value": "9:16"
              },
              {
                "label": "16:9 横屏 (YouTube / 官网)",
                "value": "16:9"
              },
              {
                "label": "1:1 方屏 (Instagram / 推广)",
                "value": "1:1"
              }
            ]
          }
        },
        "required": [
          "product_image",
          "copywriting"
        ],
        "additionalProperties": false
      },
      "fieldMappings": {
        "product_image": {
          "nodeId": "node-slot-product-image",
          "targetField": "mediaUrl",
          "mappingType": "media",
          "widget": "media-uploader",
          "required": true,
          "defaultValue": "https://files.omnimux.ai/templates/explore-v1/sha256/e5/e56bb4263c329b23992d51a20496ad4822b62fa0d6195a5cf617c7b203eb027a.webp"
        },
        "copywriting": {
          "nodeId": "node-slot-copywriting",
          "targetField": "content",
          "mappingType": "text",
          "widget": "textarea",
          "required": true,
          "defaultValue": "A 12-second vertical fashion ad template. Suitable for handheld products.\r\n\r\nAfter a natural collision, the model falls backward as the product and discount poster fly toward the camera for two smooth slow-motion close-ups, then return to real-time for a physically realistic landing. Ideal for promoting your product during sale."
        },
        "voice": {
          "nodeId": "node-slot-voice-tts",
          "targetField": "params.voice",
          "mappingType": "param",
          "widget": "select-single",
          "required": false,
          "defaultValue": "zh_female_energetic"
        },
        "aspect_ratio": {
          "nodeId": "node-video-generation-core",
          "targetField": "params.aspectRatio",
          "mappingType": "param",
          "widget": "ratio-cards",
          "required": false,
          "defaultValue": "9:16"
        }
      },
      "showcase": {
        "mode": "carousel",
        "items": [
          {
            "id": "showcase-app-creatify-fall-down-durability-01",
            "title": "爆款成片效果演示",
            "mediaType": "video",
            "mediaUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/8b/8b4186752b7953ad7eb34102abe73ff4a6375f9280cca3eb0bcd22e224d5a351.mp4",
            "posterUrl": "https://files.omnimux.ai/templates/explore-v1/sha256/e5/e56bb4263c329b23992d51a20496ad4822b62fa0d6195a5cf617c7b203eb027a.webp"
          }
        ]
      }
    }
  }
]);

